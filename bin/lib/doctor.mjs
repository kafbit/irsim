import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONFIG_FILE = '.irsim.json'
const SUFFIX = '.dc.html'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEMPLATE = join(ROOT, 'templates', 'agents-block.md')
const START = '<!-- IRSIM_START -->'
const END = '<!-- IRSIM_END -->'
const PORT_TIMEOUT_MS = 500

const BROWSERS = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave',
  'brave-browser',
  'microsoft-edge',
  'microsoft-edge-stable',
]

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...options,
  }).trim()

const read = (file) => readFileSync(file, 'utf8')

const parseJson = (file) => {
  try {
    return { value: JSON.parse(read(file)) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const findConfigDir = (from) => {
  let dir = resolve(from)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const gitToplevel = (cwd) => {
  try {
    return run('git', ['rev-parse', '--show-toplevel'], { cwd }) || null
  } catch {
    return null
  }
}

/**
 * The folder the project is checked from, by the same rule the canvas uses: `IRSIM_ROOT`, then the
 * folder with `.irsim.json` above `cwd`, then the git toplevel, then `cwd`.
 */
export const projectRoot = (cwd, env = process.env) =>
  env.IRSIM_ROOT || (findConfigDir(cwd) ?? gitToplevel(resolve(cwd)) ?? resolve(cwd))

const designDirOf = (root, env) => {
  const override = env.IRSIM_DESIGN_DIR || env.CANVAS_DESIGN_DIR
  if (override) return resolve(root, override)
  const configDir = findConfigDir(root)
  if (configDir) {
    const parsed = parseJson(join(configDir, CONFIG_FILE))
    const value = parsed.value?.designDir
    return resolve(configDir, typeof value === 'string' && value ? value : 'design')
  }
  const fallback = join(root, 'design')
  return existsSync(fallback) ? fallback : null
}

const check = (id, group, title, status, detail, fix) => ({
  id,
  group,
  title,
  status,
  detail,
  ...(fix ? { fix } : {}),
})

const ignored = (file, names) => {
  try {
    return read(file)
      .split(/\r?\n/)
      .some((line) => names.includes(line.trim().replace(/\/$/, '')))
  } catch {
    return false
  }
}

const managedBlock = (text) => {
  const start = text.indexOf(START)
  if (start === -1) return null
  const end = text.indexOf(END, start)
  if (end === -1) return null
  return text.slice(start, end + END.length).trim()
}

const templateBlock = () => {
  try {
    return managedBlock(read(TEMPLATE))
  } catch {
    return null
  }
}

const remoteOf = (root) => {
  let url = null
  try {
    url = run('git', ['-C', root, 'remote', 'get-url', 'origin'])
  } catch {
    return { url: null, slug: null }
  }
  const match = /[/:]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url)
  return { url, slug: match?.[1] ?? null }
}

const branchOf = (root) => {
  try {
    const name = run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])
    const commit = run('git', ['-C', root, 'rev-parse', '--short', 'HEAD'])
    return { name: name === 'HEAD' ? null : name, commit, detached: name === 'HEAD' }
  } catch {
    return { name: null, commit: null, detached: false }
  }
}

const dirtyCount = (root) => {
  try {
    const lines = run('git', ['-C', root, 'status', '--porcelain'])
    return lines ? lines.split('\n').length : 0
  } catch {
    return 0
  }
}

const browserOf = (env) => {
  const chosen = env.IRSIM_BROWSER
  if (chosen) return existsSync(chosen) ? chosen : null
  for (const dir of (env.PATH ?? '').split(':')) {
    if (!dir) continue
    for (const name of BROWSERS) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

const portOf = (root) => {
  try {
    const port = Number(read(join(root, '.irsim', 'port')).trim())
    return Number.isInteger(port) && port > 0 ? port : null
  } catch {
    return null
  }
}

const probeCanvas = async (port) => {
  if (port === null) return false
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(PORT_TIMEOUT_MS),
    })
    const body = await response.json()
    return body?.ok === true
  } catch {
    return false
  }
}

const versionOf = () => {
  for (const file of [join(ROOT, 'VERSION'), join(ROOT, 'app', 'package.json')]) {
    if (!existsSync(file)) continue
    const text = read(file)
    return file.endsWith('.json') ? JSON.parse(text).version : text.trim()
  }
  return 'unknown'
}

const configChecks = (root, design, env) => {
  const checks = []
  const configFile = join(root, CONFIG_FILE)
  if (!existsSync(configFile)) {
    checks.push(check('config-file', 'config', '.irsim.json', 'fail', 'no .irsim.json in the project', 'irsim init'))
  } else {
    const parsed = parseJson(configFile)
    if (parsed.error) {
      checks.push(check('config-file', 'config', '.irsim.json', 'fail', `not valid JSON: ${parsed.error}`, 'irsim init'))
    } else {
      const designDir = parsed.value?.designDir
      checks.push(
        typeof designDir === 'string' && designDir
          ? check('config-file', 'config', '.irsim.json', 'ok', `designDir ${designDir}`)
          : check('config-file', 'config', '.irsim.json', 'warn', 'no designDir, so design is the default', 'irsim init'),
      )
    }
  }

  if (design === null || !existsSync(design)) {
    checks.push(
      check(
        'design-dir',
        'config',
        'design folder',
        'fail',
        'no design folder found',
        'pass --design-dir, set IRSIM_DESIGN_DIR or add .irsim.json (irsim init)',
      ),
    )
  } else {
    let boards = 0
    try {
      boards = readdirSync(design).filter((file) => file.endsWith(SUFFIX)).length
    } catch {}
    checks.push(check('design-dir', 'config', 'design folder', 'ok', `${basename(design)}, ${boards} boards`))
  }

  const canvasFile = design === null ? null : join(design, 'canvas.json')
  let listed = []
  if (canvasFile === null || !existsSync(canvasFile)) {
    checks.push(check('canvas-json', 'config', 'canvas.json', 'fail', 'missing, the boards are not registered', 'irsim build'))
  } else {
    const parsed = parseJson(canvasFile)
    const pages = parsed.value?.pages
    if (parsed.error || !Array.isArray(pages)) {
      checks.push(
        check('canvas-json', 'config', 'canvas.json', 'fail', parsed.error ?? 'no pages', 'irsim build'),
      )
    } else {
      listed = pages.flatMap((page) => page?.boards ?? []).map((board) => board?.name).filter(Boolean)
      checks.push(check('canvas-json', 'config', 'canvas.json', 'ok', `${pages.length} pages, ${listed.length} boards`))
    }
  }

  if (design !== null && listed.length > 0) {
    const missing = listed.filter((name) => !existsSync(join(design, `${name}${SUFFIX}`)))
    checks.push(
      missing.length === 0
        ? check('board-files', 'config', 'board files', 'ok', 'every board in canvas.json has a file')
        : check(
            'board-files',
            'config',
            'board files',
            'fail',
            `${missing.length} ${missing.length === 1 ? 'board has' : 'boards have'} no file: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`,
            'irsim build',
          ),
    )
  }

  checks.push(
    ignored(join(root, '.gitignore'), ['.irsim'])
      ? check('gitignore', 'config', '.gitignore', 'ok', '.irsim/ is ignored')
      : check('gitignore', 'config', '.gitignore', 'warn', '.irsim/ is not ignored', 'irsim init'),
  )

  return checks
}

const ruleChecks = (root) => {
  const checks = []
  const template = templateBlock()
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(root, name)
    const id = `${name === 'AGENTS.md' ? 'agents' : 'claude'}-block`
    if (!existsSync(file)) {
      checks.push(
        name === 'CLAUDE.md'
          ? check(id, 'rules', name, 'ok', 'no file, nothing to keep in step')
          : check(id, 'rules', name, 'warn', 'no file, agents get no project rules', 'irsim init'),
      )
      continue
    }
    const block = managedBlock(read(file))
    if (block === null) {
      checks.push(check(id, 'rules', name, 'warn', 'no managed block', 'irsim init'))
    } else if (template !== null && block !== template) {
      checks.push(check(id, 'rules', name, 'warn', 'the managed block is out of date', 'irsim init --refresh-block'))
    } else {
      checks.push(check(id, 'rules', name, 'ok', 'the managed block matches the template'))
    }
  }

  const gitattributes = join(root, '.gitattributes')
  checks.push(
    existsSync(gitattributes) && /\.dc\.html/.test(read(gitattributes))
      ? check('collapse-board-diffs', 'rules', 'board diffs', 'ok', '.dc.html files are marked generated')
      : check(
          'collapse-board-diffs',
          'rules',
          'board diffs',
          'warn',
          'design/*.dc.html is not marked generated, so reviews show its markup',
          'see README, Review boards in pull requests',
        ),
  )

  checks.push(
    existsSync(join(root, '.github', 'copilot-instructions.md'))
      ? check('review-copilot', 'rules', 'Copilot review', 'ok', '.github/copilot-instructions.md')
      : check(
          'review-copilot',
          'rules',
          'Copilot review',
          'warn',
          'no .github/copilot-instructions.md',
          'see README, Review boards in pull requests',
        ),
  )

  checks.push(
    existsSync(join(root, '.coderabbit.yaml'))
      ? check('review-coderabbit', 'rules', 'CodeRabbit review', 'ok', '.coderabbit.yaml')
      : check(
          'review-coderabbit',
          'rules',
          'CodeRabbit review',
          'warn',
          'no .coderabbit.yaml',
          'see README, Review boards in pull requests',
        ),
  )

  return checks
}

const gitChecks = (root) => {
  const checks = []
  let hasGit = true
  try {
    run('git', ['--version'])
    checks.push(check('git-tools', 'git', 'git', 'ok', run('git', ['--version'])))
  } catch {
    hasGit = false
    checks.push(check('git-tools', 'git', 'git', 'fail', 'git is not on PATH'))
  }

  if (!hasGit || gitToplevel(root) === null) {
    checks.push(check('git-repo', 'git', 'repository', hasGit ? 'fail' : 'skip', hasGit ? 'the project root is not in a git work tree' : 'no git'))
  } else {
    const branch = branchOf(root)
    checks.push(check('git-repo', 'git', 'repository', 'ok', gitToplevel(root)))
    checks.push(
      branch.detached
        ? check('git-branch', 'git', 'branch', 'warn', `detached HEAD at ${branch.commit}`)
        : branch.name === null
          ? check('git-branch', 'git', 'branch', 'warn', 'no commit yet')
          : check('git-branch', 'git', 'branch', 'ok', branch.name),
    )
    const remote = remoteOf(root)
    checks.push(
      remote.url === null
        ? check('git-remote', 'git', 'remote', 'warn', 'no origin remote')
        : check('git-remote', 'git', 'remote', 'ok', remote.slug ?? remote.url),
    )
  }

  let gh = null
  try {
    gh = run('gh', ['auth', 'status'])
    checks.push(check('gh', 'git', 'gh', 'ok', 'authenticated'))
  } catch (error) {
    const text = `${error?.stderr ?? ''}${error?.stdout ?? ''}`
    checks.push(
      /not logged|no oauth|authentication/i.test(text)
        ? check('gh', 'git', 'gh', 'warn', 'not authenticated, so irsim update cannot download', 'gh auth login')
        : check('gh', 'git', 'gh', 'warn', 'not installed, so irsim update cannot download', 'https://cli.github.com'),
    )
  }

  return checks
}

const runtimeChecks = async (root, env) => {
  const checks = []
  const port = portOf(root)
  const running = await probeCanvas(port)
  checks.push(
    running
      ? check('canvas', 'runtime', 'canvas', 'ok', `http://localhost:${port}`)
      : check(
          'canvas',
          'runtime',
          'canvas',
          'skip',
          port === null ? 'not running here yet' : `not answering on ${port}`,
          'irsim serve',
        ),
  )
  const browser = browserOf(env)
  checks.push(
    browser
      ? check('browser', 'runtime', 'browser', 'ok', basename(browser))
      : check(
          'browser',
          'runtime',
          'browser',
          'warn',
          'no Chrome, Chromium, Brave or Edge, so check and thumbnails fail',
          'install a Chromium-family browser or set IRSIM_BROWSER',
        ),
  )
  return checks
}

const summarize = (checks) =>
  checks.reduce(
    (counts, one) => ({ ...counts, [one.status]: (counts[one.status] ?? 0) + 1 }),
    { ok: 0, warn: 0, fail: 0, skip: 0 },
  )

/**
 * Checks the project's config, the rules that keep its boards and reviews in step, the git setup and
 * the runtime. Reads only: every fix is a command the caller runs, and a warning never fails the
 * report.
 */
export const runDoctor = async ({ cwd = process.cwd(), env = process.env } = {}) => {
  const root = projectRoot(cwd, env)
  const design = designDirOf(root, env)
  const checks = [
    ...configChecks(root, design, env),
    ...ruleChecks(root),
    ...gitChecks(root),
    ...(await runtimeChecks(root, env)),
  ]
  const summary = summarize(checks)
  const branch = branchOf(root)
  const remote = remoteOf(root)
  const port = portOf(root)
  return {
    ok: summary.fail === 0,
    root,
    summary,
    checks,
    context: {
      root,
      designDir: design,
      boards: design === null || !existsSync(design) ? 0 : readdirSync(design).filter((file) => file.endsWith(SUFFIX)).length,
      repo: remote.slug,
      remote: remote.url,
      branch: branch.name,
      commit: branch.commit,
      detached: branch.detached,
      dirty: dirtyCount(root),
      port,
      running: await probeCanvas(port),
      irsim: versionOf(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      home: homedir(),
    },
  }
}

const GROUP_TITLES = { config: 'Config', rules: 'Rules', git: 'Git', runtime: 'Runtime' }
const MARKS = { ok: '✓', warn: '!', fail: '✗', skip: '-' }

/** One line per check, grouped, with the fix command indented under the check it resolves. */
export const formatDoctor = (report) => {
  const lines = []
  for (const group of ['config', 'rules', 'git', 'runtime']) {
    const members = report.checks.filter((one) => one.group === group)
    if (members.length === 0) continue
    lines.push(GROUP_TITLES[group])
    for (const one of members) {
      lines.push(`  ${MARKS[one.status] ?? '?'} ${one.title}: ${one.detail}`)
      if (one.fix) lines.push(`      fix: ${one.fix}`)
    }
  }
  const { ok, warn, fail, skip } = report.summary
  const parts = [`${ok} ok`]
  if (warn > 0) parts.push(`${warn} ${warn === 1 ? 'warning' : 'warnings'}`)
  if (fail > 0) parts.push(`${fail} failed`)
  if (skip > 0) parts.push(`${skip} skipped`)
  lines.push('', parts.join(', '))
  return lines.join('\n')
}
