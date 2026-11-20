#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { writeDemo } from './demo/generate.mjs'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const OUT = resolve(arg('out', join(REPO, 'trailer-out')))
const WORK = resolve(arg('work', join(tmpdir(), 'irsim-trailer-work')))
const SHOTS = arg('shots', '')
const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE ?? join(REPO, 'app/node_modules/playwright-core/index.mjs')
const CHROME = process.env.CHROME
const SESSION = 'claude'
const BASE_BOARD = 'Invoices'
const PAGE_ID = 'app'

const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })

const PROJECT = join(WORK, 'ledgerly')
const DESIGN = join(WORK, 'design')
const FRAMES = join(WORK, 'frames')

await rm(WORK, { recursive: true, force: true })
await mkdir(PROJECT, { recursive: true })
await mkdir(FRAMES, { recursive: true })
await mkdir(OUT, { recursive: true })
await writeDemo(DESIGN)

await run(
  'uv',
  ['run', '--python', '3.12', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python', join(HERE, 'voice.py'), WORK],
  { maxBuffer: 1 << 26 },
)
const voice = JSON.parse(await readFile(join(WORK, 'voice.json'), 'utf8'))

const PORT = await freePort()
const URL_BASE = `http://localhost:${PORT}`
const env = { ...process.env, IRSIM_PORT: String(PORT), IRSIM_ROOT: PROJECT }

await run('irsim', ['init', '--design-dir', DESIGN], { cwd: PROJECT, env })

const server = spawn('irsim', ['serve', '--design-dir', DESIGN, '--port', String(PORT)], {
  cwd: PROJECT,
  env,
  detached: true,
  stdio: 'ignore',
})
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {}
}
process.on('exit', stopServer)
process.on('SIGINT', () => process.exit(130))

for (let waited = 0; ; waited += 500) {
  if (waited > 60_000) throw new Error('the irsim server did not start')
  try {
    const response = await fetch(`${URL_BASE}/api/health`)
    if ((await response.json()).ok) break
  } catch {}
  await sleep(500)
}

const bridge = (...args) => run('irsim', ['bridge', ...args], { cwd: PROJECT, env }).then((r) => r.stdout.trim())
const register = () => bridge('register', '--session', SESSION, '--agent', 'claude-code', '--cwd', PROJECT)
await register()
const keepAlive = setInterval(() => register().catch(() => {}), 8000)

const manifest = async () => (await fetch(`${URL_BASE}/api/pages/${PAGE_ID}`)).json()

const deliverDrafts = async () => {
  const comments = await (await fetch(`${URL_BASE}/api/comments?page=${PAGE_ID}`)).json()
  if (!comments.some((comment) => comment.status === 'draft')) return
  await fetch(`${URL_BASE}/api/comments/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION, page: PAGE_ID }),
  })
}

const claimNext = async (what, timeoutMs = 20_000) => {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const result = JSON.parse(await bridge('claim', '--session', SESSION, '--json'))
    if (result[what]?.length > 0) return result
    await sleep(400)
  }
  throw new Error(`the agent session received no ${what}`)
}

const editBoard = async (name, edit) => {
  const file = join(DESIGN, `${name}.dc.html`)
  const before = await readFile(file, 'utf8')
  const after = edit(before)
  if (after === before) throw new Error(`the agent edit changed nothing in ${name}`)
  await writeFile(file, after)
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
})
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
await context.addInitScript({ path: join(HERE, 'overlay.js') })

const warm = await context.newPage()
for (const path of [
  `/p/${PAGE_ID}?session=${SESSION}`,
  `/p/${PAGE_ID}?board=Dashboard&play=full`,
  `/p/${PAGE_ID}/compare/${BASE_BOARD}`,
]) {
  await warm.goto(`${URL_BASE}${path}`, { waitUntil: 'load' }).catch(() => {})
  await sleep(4000)
}
await warm.close()

const page = await context.newPage()
const cdp = await context.newCDPSession(page)

const frames = []
let frameIndex = 0
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = join(FRAMES, `f${String(frameIndex++).padStart(6, '0')}.jpg`)
  frames.push({ ts: metadata.timestamp, file })
  writeFile(file, Buffer.from(data, 'base64')).catch(() => {})
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})

let startedAt = 0
const now = () => (Date.now() - startedAt) / 1000
const until = async (seconds) => {
  const left = seconds - now()
  if (left > 0) await sleep(left * 1000)
}

const events = []
const record = (type, extra = {}) => events.push({ t: Number(now().toFixed(3)), type, ...extra })

let shotIndex = 0
const shot = async (label) => {
  if (!SHOTS) return
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: join(SHOTS, `${String(shotIndex++).padStart(2, '0')}-${label}.png`) })
}

const pointer = { x: 960, y: 560, visible: false }
const paint = () =>
  page.evaluate(({ x, y, visible }) => window.__trailer?.cursor(x, y, visible), pointer).catch(() => {})

const moveTo = async (x, y, ms = 700) => {
  const from = { x: pointer.x, y: pointer.y }
  pointer.visible = true
  const began = Date.now()
  for (;;) {
    const t = Math.min(1, (Date.now() - began) / ms)
    const e = ease(t)
    pointer.x = from.x + (x - from.x) * e
    pointer.y = from.y + (y - from.y) * e
    await Promise.all([page.mouse.move(pointer.x, pointer.y), paint()])
    if (t >= 1) break
    await sleep(8)
  }
}

const centre = async (locator, offset = {}) => {
  await locator.waitFor({ state: 'visible', timeout: 15_000 }).catch(async (error) => {
    await shot('fail')
    throw error
  })
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return { x: box.x + box.width * (offset.fx ?? 0.5), y: box.y + box.height * (offset.fy ?? 0.5) }
}

const hover = async (locator, ms = 700, offset) => {
  const at = await centre(locator, offset)
  await moveTo(at.x, at.y, ms)
  return at
}

const click = async () => {
  await page.evaluate(({ x, y }) => window.__trailer?.ripple(x, y), pointer).catch(() => {})
  record('click')
  await page.mouse.down()
  await sleep(70)
  await page.mouse.up()
  await sleep(250)
}

const clickOn = async (locator, ms = 700, offset) => {
  await hover(locator, ms, offset)
  await click()
}

const press = async (key, label = key, holdMs = 800) => {
  await page.evaluate(({ label: l, holdMs: h }) => window.__trailer?.key(l.split('+'), h), {
    label,
    holdMs,
  })
  await sleep(180)
  record('key')
  await page.keyboard.press(key)
  await sleep(Math.max(0, holdMs - 180))
}

const type = async (text) => {
  for (const char of text) {
    record('char')
    await page.keyboard.type(char)
    await sleep(30)
  }
}

const caption = async (text) => {
  await page.evaluate(() => window.__trailer?.caption(null)).catch(() => {})
  await sleep(380)
  if (text) await page.evaluate((t) => window.__trailer?.caption(t), text)
}

let sceneStart = 0
const scene = async (key, n, name, text) => {
  record('scene', { key })
  await page.evaluate(([number, label]) => window.__trailer?.chapter(number, label), [n, name]).catch(() => {})
  await caption(text)
  sceneStart = now()
}
const holdVoice = (key) => until(sceneStart + voice[key].seconds + 0.5)

const highlight = async (target, label, pauseMs = 1200) => {
  let box = target
  if (typeof target.boundingBox === 'function') {
    await target.waitFor({ state: 'visible', timeout: 15_000 }).catch(async (error) => {
      await shot('fail-highlight')
      throw error
    })
    box = await target.boundingBox()
  }
  if (!box) throw new Error(`no box to highlight for ${label}`)
  const rect = { x: box.x, y: box.y, width: box.width, height: box.height }
  await page.evaluate(([r, l]) => window.__trailer?.spotlight(r, l), [rect, label])
  record('spotlight')
  await sleep(250)
  await shot(`spotlight-${label.replace(/\W+/g, '-').toLowerCase()}`)
  await sleep(Math.max(0, pauseMs - 250))
  await page.evaluate(() => window.__trailer?.spotlight(null))
  await sleep(300)
}

const zoom = async (deltaY, steps, gap = 45) => {
  await page.keyboard.down('Control')
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, deltaY)
    await sleep(gap)
  }
  await page.keyboard.up('Control')
}

const pan = async (dx, dy, steps, gap = 30) => {
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(dx / steps, dy / steps)
    await sleep(gap)
  }
}

const open = async (path) => {
  await page.goto(`${URL_BASE}${path}`, { waitUntil: 'load' })
  await page.evaluate(() => window.__trailer?.install())
  await paint()
}

const card = (body) => `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 700px at 50% 38%,#1b1f2a 0%,#0b0c0f 70%);color:#ecece8;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{display:flex;flex-direction:column;align-items:center;gap:28px;padding:0 120px}
h1{margin:0;font-size:168px;font-weight:700;letter-spacing:-6px;line-height:1}
p{margin:0;font-size:40px;line-height:1.35;color:#c4c7ce;max-width:1400px}
code{display:block;padding:22px 34px;border-radius:16px;background:#14161a;border:1px solid #2d2e33;color:#ecece8;font:500 30px ui-monospace,"JetBrains Mono",Menlo,monospace}
.mark{display:inline-block;width:20px;height:20px;border-radius:6px;background:#60a5fa;margin-right:18px}
.site{font-size:44px;font-weight:700;color:#fff;letter-spacing:.5px}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
main>*{animation:in .7s ease-out both}main>*:nth-child(2){animation-delay:.25s}main>*:nth-child(3){animation-delay:.5s}
</style></head><body><main>${body}</main></body></html>`

const TITLE_CARD = card(
  '<h1><span class="mark" style="width:34px;height:34px;border-radius:10px;margin-right:28px"></span>irsim</h1><p>Design boards for your repository. Built with your coding agent.</p>',
)
const END_CARD = card(
  '<p style="font-size:52px;color:#fff;font-weight:600">Open source. Works with Claude Code, Codex, Pi, OpenCode and Command Code.</p><code>curl -fsSL https://raw.githubusercontent.com/kafbit/irsim/main/install.sh | bash</code><div class="site">kafbit.com</div>',
)

await open(`/p/${PAGE_ID}?session=${SESSION}`)
await page.getByLabel('Search boards', { exact: true }).waitFor({ state: 'visible' })
await sleep(2500)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
startedAt = Date.now()

record('scene', { key: 'title' })
await page.evaluate((html) => {
  const frame = document.createElement('iframe')
  frame.id = '__title'
  frame.srcdoc = html
  frame.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483646;background:#0b0c0f')
  document.body.appendChild(frame)
}, TITLE_CARD)
await sleep(300)
await shot('title')
await until(Math.max(3.5, voice.title.seconds + 0.5))
await page.evaluate(() => document.getElementById('__title')?.remove())
await shot('overview')

await scene('canvas', 1, 'Canvas', 'Every screen of your app on one canvas')
await moveTo(1180, 760, 900)
await zoom(-18, 8)
await sleep(200)
await shot('zoomed')
await pan(-200, -100, 10)
await moveTo(1000, 520, 500)
await zoom(18, 8)
await shot('zoomed-out')
await holdVoice('canvas')

await scene('comments', 2, 'Comments', "Comment on a board. It goes to your agent's session")
await press('c', 'C', 600)
const search = page.getByLabel('Search boards', { exact: true })
await clickOn(search, 500)
await type('invoices')
await sleep(300)
const result = page.getByRole('button', { name: /^Invoices\s*Invoices/ }).first()
await clickOn(result, 450)
await sleep(600)
await shot('board-selected')

const frame = page.frameLocator(`iframe[title="${BASE_BOARD}"]`)
const saveButton = frame.getByText('New invoice', { exact: true })
await hover(saveButton, 600)
await click()
await sleep(300)
await shot('composer')
await type('Make the New invoice button stand out')
await sleep(250)
await press('Control+Enter', 'Ctrl+Enter', 650)
await shot('comment-saved')
const thread = page.getByRole('complementary', { name: 'Comments' })
const commentCard = thread.locator('li[id^="comment-"]').first()
await highlight(commentCard, 'Comment added')
await clickOn(page.getByRole('button', { name: /^Send 1 comment/ }), 600)
await sleep(700)
await deliverDrafts()
await sleep(300)
await shot('comment-sent')
await highlight(commentCard, 'Sent to your agent')
await holdVoice('comments')

await scene('agent', 3, 'Agent edits', 'Your agent edits the board and replies in the thread')
const claimed = await claimNext('comments')
const comment = claimed.comments[0]
await sleep(900)
await editBoard(BASE_BOARD, (source) =>
  source.replace(
    'style="background:#ffffff;color:#334155;border:1px solid #cbd5e1;padding:8px 14px;font-size:14px"',
    'style="background:#4f46e5;color:#ffffff;border:1px solid #4f46e5;padding:15px 28px;font-size:19px;box-shadow:0 10px 24px rgba(79,70,229,.45)"',
  ),
)
await sleep(500)
await bridge(
  'tool',
  '--action',
  'reply',
  '--id',
  comment.id,
  '--session',
  SESSION,
  '--body',
  'Done. The New invoice button is now solid indigo, larger and has a shadow.',
)
record('chime')
await sleep(1800)
await shot('reply')
await highlight(thread.locator('ul[data-reply]').first(), 'Reply in the thread')
await highlight(frame.getByText('New invoice', { exact: true }), 'Board updated')
await holdVoice('agent')

await scene('approve', 4, 'Approve and build', 'Approve the board, and your agent builds it')
await press('Escape', 'Esc', 500)
await clickOn(thread.getByRole('button', { name: 'Close' }), 500)
await sleep(300)
const approveButton = page.getByRole('region', { name: 'Top bar' }).or(page.locator('[aria-label="Top bar"]')).getByRole('button', { name: /^Approve and build/ })
await hover(approveButton.first(), 800)
await shot('approve-ready')
await highlight(approveButton.first(), 'Approve and build')
await click()
await sleep(500)
const confirmApprove = page.getByRole('alertdialog').getByRole('button').last()
if (await confirmApprove.isVisible().catch(() => false)) await clickOn(confirmApprove, 450)
await shot('approve-clicked')
await highlight(page.getByText(/^Sent \d+ boards? to the agent/).first(), 'Sent to your agent', 1000)
const approvals = await claimNext('approvals').catch(() => null)
await shot('approve-sent')
if (approvals) {
  record('chime')
  await sleep(600)
  await shot('approve-received')
}
await holdVoice('approve')

await scene('variants', 5, 'Variants', 'Ask for variants, compare, choose one')
await shot('variants-inspector')
const inspector = page.getByRole('region', { name: 'Variants' })
await clickOn(inspector.getByRole('button', { name: 'Simpler', exact: true }), 450)
await clickOn(inspector.getByRole('button', { name: 'Responsive', exact: true }), 400)
await shot('variants-picked')
await clickOn(inspector.getByRole('button', { name: /^Generate/ }), 450)
await claimNext('variants')
await sleep(500)
const variantBoards = (await manifest()).boards.filter((board) => board.variantOf === BASE_BOARD)
for (const board of variantBoards) {
  await editBoard(board.name, (source) => {
    if (board.variantLabel === 'Simpler') return source.replace(/<aside[\s\S]*?<\/aside>/, '')
    return source.replace('.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}', '.cards{display:grid;grid-template-columns:1fr;gap:16px}')
  })
}
await sleep(1500)
await shot('variants-ready')
await clickOn(inspector.getByRole('link', { name: /^Compare variants/ }), 500)
await page.getByRole('button', { name: 'Choose' }).first().waitFor({ state: 'visible', timeout: 20_000 })
for (let tries = 0; ; tries++) {
  let painted = 0
  for (const child of page.frames().filter((entry) => entry !== page.mainFrame())) {
    const text = await child.evaluate(() => document.body?.innerText.trim().length ?? 0).catch(() => 0)
    if (text > 30) painted++
  }
  if (painted >= 3) break
  if (tries > 60) throw new Error('compare frames did not paint')
  await sleep(250)
}
await sleep(900)
await shot('compare')
const chooseButtons = page.getByRole('button', { name: 'Choose' })
await clickOn(chooseButtons.last(), 600)
await sleep(400)
await shot('choose-confirm')
const dialog = page.getByRole('alertdialog')
await clickOn(dialog.getByRole('button').last(), 450)
await sleep(1200)
await shot('chosen')
await holdVoice('variants')

await open(`/p/${PAGE_ID}?session=${SESSION}`)
await page.getByLabel('Search boards', { exact: true }).waitFor({ state: 'visible' })
await sleep(2500)
await scene('sections', 6, 'Sections', 'Group boards into sections and tidy them')
await press('Shift+1', 'Shift+1', 700)
await sleep(700)
await shot('sections-start')
await hover(page.locator('[data-board="InvoiceDetail"] [data-frame-title]'), 800)
await click()
await hover(page.locator('[data-board="Settings"] [data-frame-title]'), 700)
await page.evaluate(() => window.__trailer?.key(['Shift'], 900))
await sleep(180)
await page.keyboard.down('Shift')
await click()
await page.keyboard.up('Shift')
await shot('sections-selected')
await press('Shift+S', 'Shift+S', 800)
await page.getByLabel('Section name', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
await type('Billing')
await sleep(250)
await press('Enter', 'Enter', 600)
await shot('sections-created')
const sectionBox = page.locator('[data-section]').filter({ hasText: 'Billing' }).first()
await highlight(sectionBox, 'Section')
await clickOn(page.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio', { name: /Grid/ }), 500)
await shot('sections-layout')
await clickOn(page.getByRole('group', { name: 'Tidy' }).getByRole('button', { name: 'Tidy', exact: true }), 500)
await sleep(900)
await shot('sections-tidied')
await highlight(page.locator('[data-section]').filter({ hasText: 'Billing' }).first(), 'Section')
await holdVoice('sections')

await scene('play', 7, 'Play', 'Play any board at any viewport')
await clickOn(page.getByRole('button', { name: 'Play an artboard' }), 500)
await sleep(300)
await shot('play-menu')
await clickOn(page.getByRole('menuitem', { name: /Dashboard$/ }), 450)
await page.getByRole('toolbar', { name: 'Viewport' }).waitFor({ state: 'visible', timeout: 15_000 }).catch(async (error) => {
  await shot('fail-play')
  throw error
})
await sleep(700)
await shot('play-fit')
for (const preset of [/^Desktop/, /^Tablet/, /^Phone/]) {
  await clickOn(page.getByRole('button', { name: 'Viewport preset' }), 400)
  await clickOn(page.getByRole('menuitemradio', { name: preset }), 300)
  await sleep(800)
  await shot(`play-${preset.source}`)
}
await press('Escape', 'Esc', 600)
await sleep(400)
await shot('after-play')
await holdVoice('play')

await scene('search', 8, 'Search', 'Find any board in a keystroke')
await press('Control+k', 'Ctrl+K', 700)
await page.getByRole('combobox', { name: 'Search' }).waitFor({ state: 'visible', timeout: 10_000 })
await sleep(300)
await type('pricing')
await sleep(700)
await shot('search')
await press('Enter', 'Enter', 600)
await sleep(1800)
await shot('search-jumped')
await holdVoice('search')

record('scene', { key: 'end' })
await page.evaluate(() => window.__trailer?.chapter(null)).catch(() => {})
await caption(null)
const endStart = now()
await page.setContent(END_CARD)
await until(endStart + Math.max(5, voice.end.seconds + 1))

await cdp.send('Page.stopScreencast')
const stoppedAt = Date.now() / 1000
clearInterval(keepAlive)
await sleep(300)

const duration = stoppedAt - frames[0].ts
await writeFile(join(WORK, 'timeline.json'), JSON.stringify({ duration, events }, null, 2))

const lines = []
frames.forEach((entry, index) => {
  const next = index + 1 < frames.length ? frames[index + 1].ts : Math.max(stoppedAt, entry.ts + 0.1)
  lines.push(`file '${entry.file}'`, `duration ${Math.max(0.001, next - entry.ts).toFixed(4)}`)
})
const last = frames[frames.length - 1]
lines.push(`file '${last.file}'`)
const list = join(WORK, 'concat.txt')
await writeFile(list, `${lines.join('\n')}\n`)

await browser.close()
stopServer()

await run('node', [join(HERE, 'mix.mjs'), WORK], { maxBuffer: 1 << 26 }).then((r) => console.log(r.stdout.trim()))

const canvasStart = events.find((event) => event.type === 'scene' && event.key === 'canvas')?.t ?? 4
const posterAt = arg('poster-at', (canvasStart + 1.2).toFixed(2))
await run(
  'bash',
  [join(HERE, 'render.sh'), list, OUT, arg('mp4-crf', '20'), arg('webm-crf', '34'), join(WORK, 'audio.wav'), posterAt, duration.toFixed(3)],
  { maxBuffer: 1 << 26 },
).then((r) => console.log(r.stdout))
for (const event of events.filter((entry) => entry.type === 'scene')) console.log(`${event.t.toFixed(1)} ${event.key}`)
console.log(`frames: ${frames.length}, recorded ${duration.toFixed(1)} s`)
