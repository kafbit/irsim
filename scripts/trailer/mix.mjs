#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const WORK = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: mix.mjs <work>')

const timeline = JSON.parse(await readFile(join(WORK, 'timeline.json'), 'utf8'))
const voice = JSON.parse(await readFile(join(WORK, 'voice.json'), 'utf8'))
const SFX = join(WORK, 'sfx')
await mkdir(SFX, { recursive: true })

const fade = (seconds) => `afade=t=out:st=0:d=${seconds}:curve=exp`
const burst = (seconds, high, low, db) =>
  `anoisesrc=d=${seconds}:c=white:r=48000:a=0.9,highpass=f=${high},lowpass=f=${low},${fade(seconds)},volume=${db}dB`

const sweep = [0, 0.09, 0.18, 0.27, 0.36, 0.45]
const centres = [300, 700, 1300, 2200, 3400, 5000]
const whooshCommands = sweep.map((at, i) => `${at} bandpass@w f ${centres[i]}`).join('; ')

const effects = {
  click: { input: burst(0.018, 1800, 6000, -10), rate: 48000 },
  key: { input: burst(0.012, 2500, 6000, -12), rate: 48000 },
  char: { input: burst(0.012, 2500, 6000, -20), rate: 48000 },
  whoosh: {
    input: `anoisesrc=d=0.45:c=pink:r=48000:a=0.9,asendcmd=c='${whooshCommands}',bandpass@w=f=300:width_type=h:w=900,afade=t=in:st=0:d=0.15,afade=t=out:st=0.2:d=0.25,volume=-14dB`,
  },
  pop: {
    input: `aevalsrc='sin(2*PI*(660*t+220*(1-exp(-30*t))/30))*exp(-40*t)':d=0.09:s=48000,volume=-22dB`,
  },
  chime: {
    input: `aevalsrc='(sin(2*PI*1046.5*t)+sin(2*PI*1318.5*t))*0.5*exp(-8*t)':d=0.5:s=48000,afade=t=in:st=0:d=0.005,volume=-22dB`,
  },
}

for (const [name, spec] of Object.entries(effects)) {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', spec.input, '-ar', '48000', '-ac', '1', join(SFX, `${name}.wav`)])
}

const sources = []
const chains = []
const mixed = []
const add = (file, label, delaySeconds) => {
  const index = sources.length
  sources.push(file)
  const ms = Math.max(0, Math.round(delaySeconds * 1000))
  chains.push(`[${index}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1[${label}]`)
  mixed.push(`[${label}]`)
}

const starts = {}
for (const event of timeline.events) if (event.type === 'scene') starts[event.key] = event.t
for (const [key, entry] of Object.entries(voice)) {
  if (starts[key] === undefined) continue
  add(entry.file, `v_${key}`, key === 'title' ? 0.3 : starts[key] + 0.25)
}

const byType = { click: 'click', key: 'key', char: 'char', spotlight: 'pop', chime: 'chime' }
const timed = []
for (const event of timeline.events) {
  if (event.type === 'scene' && event.key !== 'title') timed.push(['whoosh', event.t])
  else if (byType[event.type]) timed.push([byType[event.type], event.t])
}

const perType = {}
for (const [type, at] of timed) (perType[type] ??= []).push(at)

const effectFilters = []
let counter = 0
for (const [type, times] of Object.entries(perType)) {
  const index = sources.length
  sources.push(join(SFX, `${type}.wav`))
  const copies = times.map(() => `[${type}_s${counter++}]`)
  const split = times.length === 1 ? `[${index}:a]anull${copies[0]}` : `[${index}:a]asplit=${times.length}${copies.join('')}`
  effectFilters.push(split)
  times.forEach((at, i) => {
    const label = `${type}_d${i}`
    effectFilters.push(`${copies[i]}adelay=${Math.max(0, Math.round(at * 1000))}:all=1[${label}]`)
    mixed.push(`[${label}]`)
  })
}

const duration = timeline.duration
const filter = [
  ...chains,
  ...effectFilters,
  `${mixed.join('')}amix=inputs=${mixed.length}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},aformat=sample_rates=48000:channel_layouts=stereo[out]`,
].join(';\n')

const script = join(WORK, 'mix-filter.txt')
await writeFile(script, filter)

const args = ['-y', '-loglevel', 'error']
for (const file of sources) args.push('-i', file)
args.push('-filter_complex_script', script, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', join(WORK, 'audio.wav'))
await run('ffmpeg', args, { maxBuffer: 1 << 26 })
console.log(`audio.wav: ${mixed.length} tracks, ${duration.toFixed(1)} s`)
