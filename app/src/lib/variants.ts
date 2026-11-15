import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { editCanvas } from './canvas-file'
import type { CanvasFile } from './canvas-layout'
import { type CanvasBoard, type CanvasPage, type CanvasSection, readCanvasPages } from './canvas-pages'
import { closureOf, importsOf } from './closure'
import { designDir } from './design-dir'
import { type Preset, PRESETS } from './variant-presets'

export { type Preset, PRESETS }

export const MAX_PRESETS = 6
const GAP = 80

export type Failure = { error: string; status: 400 | 404 | 409 | 500 }

const TITLE = /<title>([\s\S]*?)<\/title>/

const titleOf = (source: string): string | null => TITLE.exec(source)?.[1] ?? null

const withTitle = (source: string, title: string | null): string =>
  title === null ? source : source.replace(TITLE, () => `<title>${title}</title>`)

export const variantName = (base: string, preset: Preset, existing: Set<string>): string => {
  const stem = `${base}Variant${preset.part}`
  if (!existing.has(stem)) return stem
  let n = 2
  while (existing.has(`${stem}${n}`)) n += 1
  return `${stem}${n}`
}

const fileOf = (name: string): string => join(designDir(), `${name}.dc.html`)

const pageOf = async (id: string): Promise<CanvasPage | Failure> => {
  const page = (await readCanvasPages()).find((candidate) => candidate.id === id)
  return page ?? { error: `no page named ${id}`, status: 404 }
}

export const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && 'error' in value

export type CreatedVariant = { name: string; label: string; direction: string; board: CanvasBoard }

export const MAX_OPTIONS = 3

const optionDirection = (index: number, count: number): string =>
  `Option ${index} of ${count}: a distinct take on the user's note. Make each option clearly different from the others.`

export const createVariants = async (input: {
  page: string
  board: string
  presets?: string[]
  options?: number
}): Promise<{ boards: CreatedVariant[] } | Failure> => {
  const page = await pageOf(input.page)
  if (isFailure(page)) return page
  const base = page.boards.find((board) => board.name === input.board)
  if (!base) return { error: `board ${input.board} is not on page ${input.page}`, status: 404 }
  if (base.variantOf !== undefined) return { error: `board ${base.name} is itself a variant`, status: 400 }
  const free = input.options !== undefined
  const chosen: Preset[] = []
  if (free) {
    if (!Number.isInteger(input.options) || (input.options as number) < 2 || (input.options as number) > MAX_OPTIONS) {
      return { error: `choose 2 to ${MAX_OPTIONS} options`, status: 400 }
    }
  } else {
    const presets = input.presets ?? []
    if (presets.length < 1 || presets.length > MAX_PRESETS) {
      return { error: `choose 1 to ${MAX_PRESETS} presets`, status: 400 }
    }
    for (const label of presets) {
      const preset = PRESETS.find((candidate) => candidate.label === label)
      if (!preset) return { error: `unknown preset ${label}`, status: 400 }
      if (chosen.includes(preset)) return { error: `duplicate preset ${label}`, status: 400 }
      chosen.push(preset)
    }
  }
  if (!existsSync(fileOf(base.name))) return { error: `no board named ${base.name}`, status: 404 }

  const taken = new Set((await readCanvasPages()).flatMap((entry) => entry.boards.map((b) => b.name)))
  const items: { label: string; direction: string; name: string }[] = []
  if (free) {
    const total = input.options as number
    let number = 1
    for (let index = 1; index <= total; index += 1) {
      let name = `${base.name}VariantOption${number}`
      while (taken.has(name) || existsSync(fileOf(name))) {
        number += 1
        name = `${base.name}VariantOption${number}`
      }
      number += 1
      taken.add(name)
      items.push({ label: `Option ${index}`, direction: optionDirection(index, total), name })
    }
  } else {
    for (const preset of chosen) {
      let name = variantName(base.name, preset, taken)
      while (existsSync(fileOf(name))) {
        taken.add(name)
        name = variantName(base.name, preset, taken)
      }
      taken.add(name)
      items.push({ label: preset.label, direction: preset.direction, name })
    }
  }

  const source = await readFile(fileOf(base.name), 'utf8')
  const baseTitle = titleOf(source) ?? base.title
  const existingVariants = page.boards.filter((board) => board.variantOf === base.name).length
  const created: CreatedVariant[] = items.map((item, index) => ({
    name: item.name,
    label: item.label,
    direction: item.direction,
    board: {
      name: item.name,
      title: `${baseTitle}: ${item.label}`,
      x: base.x + (base.width + GAP) * (existingVariants + index + 1),
      y: base.y,
      width: base.width,
      height: base.height,
      variantOf: base.name,
      variantLabel: item.label,
    },
  }))

  const written: string[] = []
  const cleanup = () => Promise.all(written.map((file) => rm(file, { force: true })))
  try {
    for (const variant of created) {
      const file = fileOf(variant.name)
      await writeFile(file, withTitle(source, variant.board.title), { flag: 'wx' })
      written.push(file)
    }
    for (const variant of created) variant.board.baseHash = (await closureOf(variant.name)).render
  } catch (error) {
    await cleanup()
    throw error
  }

  let sectionId = ''
  let failure: Failure | null
  try {
    failure = await editCanvas((canvas) => {
      const next = structuredClone(canvas) as CanvasFile
      const target = next.pages.find((entry) => entry.id === input.page)
      const baseEntry = target?.boards.find((entry) => entry.name === base.name)
      if (!target || !baseEntry) return { error: `board ${base.name} is not on page ${input.page}`, status: 404 }
      if (target.boards.some((entry) => created.some((variant) => variant.name === entry.name))) {
        return { error: 'a variant name is already used, try again', status: 400 }
      }
      const sections = (target.sections ?? []) as CanvasSection[]
      const reused = sections.find((entry) => entry.variantOf === base.name)
      if (reused) {
        sectionId = reused.id
      } else {
        const stem = `${base.name}-variants`.toLowerCase()
        sectionId = stem
        for (let n = 2; sections.some((entry) => entry.id === sectionId); n += 1) sectionId = `${stem}-${n}`
        const previous = baseEntry.section
        sections.push({
          id: sectionId,
          title: `${base.name} variants`,
          variantOf: base.name,
          ...(typeof previous === 'string' ? { baseSection: previous } : {}),
        })
        target.sections = sections
      }
      baseEntry.section = sectionId
      for (const variant of created) target.boards.push({ ...variant.board, section: sectionId })
      return { canvas: next }
    })
  } catch (error) {
    await cleanup()
    throw error
  }
  if (failure) {
    await cleanup()
    return failure
  }
  return { boards: created.map((variant) => ({ ...variant, board: { ...variant.board, section: sectionId } })) }
}

const restoreBase = (
  target: CanvasFile['pages'][number],
  removed: CanvasSection[],
  baseEntry: Record<string, unknown>,
): void => {
  const sections = (target.sections ?? []) as CanvasSection[]
  const kept = sections.filter((entry) => !removed.includes(entry))
  if (kept.length > 0) target.sections = kept
  else delete target.sections
  const inRemoved = removed.find((entry) => entry.id === baseEntry.section)
  if (!inRemoved) return
  if (inRemoved.baseSection !== undefined && kept.some((entry) => entry.id === inRemoved.baseSection)) {
    baseEntry.section = inRemoved.baseSection
  } else {
    delete baseEntry.section
  }
}

export const discardVariants = async (input: {
  page: string
  base: string
  names: string[]
}): Promise<Failure | null> => {
  const dropped: string[] = []
  const failure = await editCanvas((canvas) => {
    dropped.length = 0
    const next = structuredClone(canvas) as CanvasFile
    const target = next.pages.find((entry) => entry.id === input.page)
    const baseEntry = target?.boards.find((entry) => entry.name === input.base)
    if (!target || !baseEntry) return { error: `board ${input.base} is not on page ${input.page}`, status: 404 }
    const wanted = new Set(input.names)
    for (const entry of target.boards) {
      if (wanted.has(entry.name) && entry.variantOf === input.base) dropped.push(entry.name)
    }
    target.boards = target.boards.filter((entry) => !dropped.includes(entry.name))
    const sections = (target.sections ?? []) as CanvasSection[]
    const section = sections.find((entry) => entry.variantOf === input.base)
    if (section && !target.boards.some((entry) => entry.section === section.id && entry.variantOf === input.base)) {
      restoreBase(target, [section], baseEntry)
    }
    return { canvas: next }
  })
  await Promise.all(dropped.map((name) => rm(fileOf(name), { force: true })))
  return failure
}

const importersOf = async (variants: Set<string>, pages: CanvasPage[]): Promise<string[]> => {
  const names = new Set<string>()
  for (const entry of pages) {
    for (const board of entry.boards) {
      if (variants.has(board.name)) continue
      if (!existsSync(fileOf(board.name))) continue
      const imports = importsOf(await readFile(fileOf(board.name), 'utf8'))
      if (imports.some((name) => variants.has(name) && name !== board.name)) names.add(board.name)
    }
  }
  return [...names]
}

export const chooseVariant = async (input: {
  page: string
  base: string
  pick: string
}): Promise<{ kept: string } | Failure> => {
  const pages = await readCanvasPages()
  const page = pages.find((candidate) => candidate.id === input.page)
  if (!page) return { error: `no page named ${input.page}`, status: 404 }
  const base = page.boards.find((board) => board.name === input.base)
  if (!base) return { error: `board ${input.base} is not on page ${input.page}`, status: 404 }
  const variants = page.boards.filter((board) => board.variantOf === input.base)
  if (input.pick !== input.base && !variants.some((board) => board.name === input.pick)) {
    return { error: `${input.pick} is not a variant of ${input.base}`, status: 400 }
  }
  const names = new Set(variants.map((board) => board.name))
  const importers = await importersOf(names, pages)
  if (importers.length > 0) {
    return {
      error: `Boards outside the variants import a variant: ${importers.join(', ')}. Change them first.`,
      status: 409,
    }
  }

  const baseFile = fileOf(input.base)
  const original = await readFile(baseFile, 'utf8')
  if (input.pick !== input.base) {
    const picked = await readFile(fileOf(input.pick), 'utf8')
    await writeFile(baseFile, withTitle(picked, titleOf(original)))
  }
  const removedNames: string[] = []
  let failure: Failure | null
  try {
    failure = await editCanvas((canvas) => {
      removedNames.length = 0
      const next = structuredClone(canvas) as CanvasFile
      const target = next.pages.find((entry) => entry.id === input.page)
      const baseEntry = target?.boards.find((entry) => entry.name === input.base)
      if (!target || !baseEntry) return { error: `board ${input.base} is not on page ${input.page}`, status: 404 }
      const sections = (target.sections ?? []) as CanvasSection[]
      const removed = sections.filter((entry) => entry.variantOf === input.base)
      for (const entry of target.boards) {
        if (entry.variantOf === input.base) removedNames.push(entry.name)
      }
      target.boards = target.boards.filter((entry) => entry.variantOf !== input.base)
      if (removed.length > 0) restoreBase(target, removed, baseEntry)
      return { canvas: next }
    })
  } catch (error) {
    await writeFile(baseFile, original)
    throw error
  }
  if (failure) {
    await writeFile(baseFile, original)
    return failure
  }
  const stale = new Set([...removedNames, ...variants.map((board) => board.name)])
  await Promise.all([...stale].map((name) => rm(fileOf(name), { force: true })))
  return { kept: input.pick }
}
