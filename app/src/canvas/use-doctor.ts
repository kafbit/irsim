'use client'

import { useState } from 'react'

export type DoctorCheck = {
  id: string
  group: 'config' | 'rules' | 'git' | 'runtime'
  title: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  detail: string
  fix?: string
}

export type DoctorContext = {
  root: string
  designDir: string | null
  boards: number
  repo: string | null
  remote: string | null
  branch: string | null
  commit: string | null
  detached: boolean
  dirty: number
  port: number | null
  running: boolean
  irsim: string
  node: string
  platform: string
  home: string
}

export type DoctorReport = {
  ok: boolean
  root: string
  summary: { ok: number; warn: number; fail: number; skip: number }
  checks: DoctorCheck[]
  context: DoctorContext
}

export type DoctorState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; report: DoctorReport }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string }

/** Requests the report once. A 409 means this canvas was started without the launcher. */
export async function readDoctor(): Promise<DoctorState> {
  try {
    const response = await fetch('/api/doctor', { cache: 'no-store' })
    const body = (await response.json().catch(() => ({}))) as DoctorReport & { error?: string }
    if (response.status === 409) return { status: 'unavailable', message: body.error ?? 'no launcher' }
    if (!response.ok) return { status: 'failed', message: body.error ?? `HTTP ${response.status}` }
    return { status: 'ready', report: body }
  } catch (error) {
    return { status: 'failed', message: (error as Error)?.message ?? 'request failed' }
  }
}

export function useDoctor() {
  const [state, setState] = useState<DoctorState>({ status: 'idle' })
  const run = async () => {
    if (state.status === 'running') return
    setState({ status: 'running' })
    setState(await readDoctor())
  }
  return { state, run }
}

export const summaryOf = (report: DoctorReport): string => {
  const { ok, warn, fail, skip } = report.summary
  const parts = [`${ok} passed`]
  if (warn > 0) parts.push(`${warn} ${warn === 1 ? 'warning' : 'warnings'}`)
  if (fail > 0) parts.push(`${fail} failed`)
  if (skip > 0) parts.push(`${skip} skipped`)
  return parts.join(' · ')
}

export const CHECK_GROUPS: DoctorCheck['group'][] = ['config', 'rules', 'git', 'runtime']

export const GROUP_TITLES: Record<DoctorCheck['group'], string> = {
  config: 'Config',
  rules: 'Rules',
  git: 'Git',
  runtime: 'Runtime',
}
