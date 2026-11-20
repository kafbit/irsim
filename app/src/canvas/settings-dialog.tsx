'use client'

import { Check } from 'lucide-react'
import { Button, cn } from '../ui'
import { STEPS, useMovePrefs } from './move-prefs'
import {
  CHECK_GROUPS,
  GROUP_TITLES,
  summaryOf,
  useDoctor,
  type DoctorCheck,
  type DoctorReport,
} from './use-doctor'
import { useMountEffect } from './use-mount-effect'
import { useTheme } from './use-theme'
import { useUpdate } from './use-update'

const DOT: Record<DoctorCheck['status'], string> = {
  ok: 'var(--success-foreground)',
  warn: 'var(--warning-foreground)',
  fail: 'var(--destructive)',
  skip: 'var(--input)',
}

const VERSION_COLOR: Record<string, string> = {
  idle: 'text-muted-foreground',
  available: 'text-foreground',
  restart: 'text-foreground',
  updating: 'text-info-foreground',
  restarting: 'text-info-foreground',
  failed: 'text-destructive',
}

const CHECK_LABEL: Record<DoctorCheck['status'], string> = {
  ok: 'passed',
  warn: 'warning',
  fail: 'failed',
  skip: 'skipped',
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const shortHome = (path: string, home: string): string =>
  home && path.startsWith(home) ? `~${path.slice(home.length)}` : path

/** The design folder as a person types it when it lives under the project, else the whole path. */
const folderUnder = (root: string, folder: string): string =>
  folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : folder

function Version({ update }: { update: ReturnType<typeof useUpdate> }) {
  const { info, notice, phase, error, restartFailed, check, start } = update
  const version = info?.running ?? notice?.version ?? null
  const kind = phase !== 'idle' ? phase : (notice?.kind ?? 'idle')
  const headline =
    phase === 'failed'
      ? 'The update failed'
      : phase === 'updating'
        ? `Updating to ${notice?.version ?? version}`
        : phase === 'restarting'
          ? `Restarting on ${notice?.version ?? version}`
          : notice?.kind === 'available'
            ? `irsim ${notice.version} is available`
            : notice?.kind === 'restart'
              ? `irsim ${notice.version} is installed`
              : `irsim ${version ?? '…'}`
  const detail =
    phase === 'failed'
      ? (error ?? (restartFailed ? 'The canvas did not come back. Run irsim serve in the project.' : 'The update failed.'))
      : phase === 'updating'
        ? 'The canvas restarts when the download is installed.'
        : phase === 'restarting'
          ? 'The page reloads when the canvas answers.'
          : notice?.kind === 'available'
            ? `You have ${version ?? 'an older version'}.`
            : notice?.kind === 'restart'
              ? `This canvas still runs ${version}. Restart it to use ${notice.version}.`
              : info?.canUpdate === false
                ? 'A source checkout does not update itself.'
                : 'Up to date.'
  const busy = phase === 'updating' || phase === 'restarting'
  const actionable = phase === 'idle' && (notice?.kind === 'available' || notice?.kind === 'restart')
  const label = notice?.kind === 'available' ? 'Update and restart' : 'Restart'

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-semibold text-muted-foreground">irsim</h3>
      <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-card p-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{headline}</div>
          <div className={cn('mt-0.5 text-xs', VERSION_COLOR[kind] ?? 'text-muted-foreground')}>
            {detail}
          </div>
        </div>
        {busy ? (
          <span
            role="status"
            aria-label="Working"
            className="size-3 shrink-0 animate-spin rounded-full border-2 border-border border-t-info-foreground"
          />
        ) : null}
        {actionable ? (
          <Button size="sm" onClick={start} className="h-7.5 px-2.5 text-xs">
            {label}
          </Button>
        ) : null}
        {phase === 'idle' && !actionable ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void check()}
            className="h-7.5 px-2.5 text-xs"
          >
            Check for updates
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function Appearance() {
  const { theme, set } = useTheme()
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-semibold text-muted-foreground">Appearance</h3>
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label="Theme"
          className="flex gap-0.5 rounded-[10px] border border-border bg-card p-0.5"
        >
          {(['light', 'dark'] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              aria-pressed={theme === value}
              onClick={() => set(value)}
              className={cn(
                'h-7 px-3 text-xs capitalize',
                theme === value ? 'bg-secondary text-foreground' : 'text-muted-foreground',
              )}
            >
              {value}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Applies to the canvas. Boards keep their own colours.
        </span>
      </div>
    </section>
  )
}

const STEP_HINTS = {
  0: 'Frames move one pixel at a time.',
  8: 'Frames move 8 px at a time.',
  24: 'Frames move 24 px at a time, like the grid.',
} as const

function MovingFrames() {
  const [{ snap, step }, set] = useMovePrefs()
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-semibold text-muted-foreground">Moving frames</h3>
      <label className="flex cursor-pointer items-start gap-2">
        <span className="relative mt-0.5 inline-grid size-4 shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={snap}
            onChange={(event) => set({ snap: event.target.checked })}
            className="peer absolute inset-0 m-0 size-4 appearance-none rounded border border-input bg-transparent checked:border-primary checked:bg-primary"
          />
          <Check
            size={12}
            strokeWidth={3}
            aria-hidden="true"
            className="pointer-events-none relative hidden text-primary-foreground peer-checked:block"
          />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] leading-5 text-foreground">Snap to other frames</span>
          <span className="text-xs leading-4 text-muted-foreground">
            A frame you move or resize sticks to the edges and centers of the frames near it, and a
            line shows the match.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-foreground">Move in steps</span>
        <div
          role="group"
          aria-label="Move in steps"
          className="flex gap-0.5 rounded-[10px] border border-border bg-card p-0.5"
        >
          {STEPS.map((value) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              aria-pressed={step === value}
              onClick={() => set({ step: value })}
              className={cn(
                'h-7 px-3 text-xs',
                step === value ? 'bg-secondary text-foreground' : 'text-muted-foreground',
              )}
            >
              {value === 0 ? 'Off' : `${value} px`}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{STEP_HINTS[step]}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        Hold Ctrl (Cmd on Mac) while you drag to skip both for one move.
      </span>
    </section>
  )
}

function Project({ report }: { report: DoctorReport | null }) {
  const context = report?.context
  const root = context ? shortHome(context.root, context.home) : null
  const rows: { label: string; value: string | null }[] = [
    { label: 'Directory', value: root },
    {
      label: 'Design folder',
      value: context?.designDir ? folderUnder(context.root, context.designDir) : null,
    },
    {
      label: 'Repository',
      value: context?.repo ? `github.com/${context.repo}` : (context?.remote ?? null),
    },
    { label: 'Branch', value: context?.branch ?? (context?.detached ? 'detached' : null) },
    {
      label: 'Commit',
      value: context?.commit
        ? `${context.commit}${context.dirty > 0 ? ` · ${plural(context.dirty, 'uncommitted file', 'uncommitted files')}` : ''}`
        : null,
    },
    {
      label: 'Canvas',
      value: context?.port ? `http://localhost:${context.port}${context.running ? '' : ' (not running)'}` : null,
    },
  ].filter((row) => row.value !== null)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-semibold text-muted-foreground">Project</h3>
      {report === null ? (
        <p className="m-0 text-xs text-muted-foreground">Run the doctor to read the project.</p>
      ) : (
        <dl className="m-0 flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-3">
              <dt className="w-[120px] shrink-0 text-xs text-muted-foreground">{row.label}</dt>
              <dd
                dir="ltr"
                lang="en"
                className="m-0 min-w-0 flex-1 truncate font-mono text-xs text-foreground"
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function Health({ report }: { report: DoctorReport | null }) {
  if (report === null) return null
  const failed = report.summary.fail > 0
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        role="status"
        className={cn(
          'flex items-center gap-2 text-xs',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', failed ? 'bg-destructive' : 'bg-success-foreground')}
        />
        {summaryOf(report)}
      </div>
      <div className="flex h-[232px] flex-col gap-0.5 overflow-hidden rounded-[10px] border border-border bg-card px-3 py-2">
        {CHECK_GROUPS.map((group) => {
          const members = report.checks.filter((one) => one.group === group)
          if (members.length === 0) return null
          return (
            <div key={group} className="flex flex-col">
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
                {GROUP_TITLES[group]}
              </div>
              {members.map((one) => (
                <div key={one.id} className="flex items-start gap-2 py-0.5">
                  <span
                    aria-hidden="true"
                    title={CHECK_LABEL[one.status]}
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: DOT[one.status] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-foreground">
                      {one.title}
                      <span className="text-muted-foreground"> · {one.detail}</span>
                    </div>
                    {one.fix ? (
                      <code
                        dir="ltr"
                        lang="en"
                        className={cn(
                          'mt-0.5 inline-block rounded-[5px] bg-secondary px-1.5 py-px font-mono text-[11px]',
                          one.status === 'fail' ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {one.fix}
                      </code>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** irsim version and update, the canvas theme, the project context, and the doctor report. */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return <SettingsPanel onOpenChange={onOpenChange} />
}

function SettingsPanel({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const update = useUpdate()
  const doctor = useDoctor()
  const report = doctor.state.status === 'ready' ? doctor.state.report : null
  const running = doctor.state.status === 'running'
  const unavailable = doctor.state.status === 'unavailable'

  useMountEffect(() => {
    const previous = document.activeElement
    void doctor.run()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 pb-10"
      style={{ background: 'color-mix(in srgb, var(--foreground) 32%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onOpenChange(false)
          }
        }}
        className="flex max-h-[780px] w-[600px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-foreground shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
      >
        <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <h2 className="m-0 min-w-0 flex-1 text-[15px] font-semibold">Settings</h2>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="text-base leading-none text-muted-foreground"
          >
            ×
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Version update={update} />
          <Appearance />
          <MovingFrames />
          <Project report={report} />
          <section className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <h3 className="m-0 flex-1 text-xs font-semibold text-muted-foreground">Health</h3>
              {unavailable ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  pending={running}
                  pendingLabel="Running"
                  onClick={() => void doctor.run()}
                  className="h-7 px-2.5 text-xs"
                >
                  Run doctor
                </Button>
              )}
            </div>
            {unavailable ? (
              <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-warning p-2.5 text-warning-foreground">
                <div className="text-[13px] font-medium">This canvas cannot run the doctor.</div>
                <div className="text-xs">
                  It was started without the irsim launcher. Start it with{' '}
                  <code className="font-mono">irsim serve</code>, or run the check in a terminal.
                </div>
              </div>
            ) : null}
            {doctor.state.status === 'failed' ? (
              <p className="m-0 text-xs text-destructive">{doctor.state.message}</p>
            ) : null}
            {report === null && !unavailable ? (
              <p className="m-0 text-xs text-muted-foreground">
                Checks the project rules, the git setup and the config. Run it after a fresh clone or
                when something looks wrong.
              </p>
            ) : null}
            <Health report={report} />
            {report !== null ? (
              <p className="m-0 text-xs text-muted-foreground">
                {plural(report.checks.length, 'check', 'checks')} · {report.context.irsim} on{' '}
                {report.context.platform}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
