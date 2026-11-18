import type { Metadata } from 'next'
import Script from 'next/script'
import type { ReactNode } from 'react'
import { currentBranch, projectName } from '../lib/branch'
import { DEFAULT_THEME, themeScript } from '../lib/theme'
import { runningBuild, runningVersion } from '../lib/version-state'
import './globals.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `${await currentBranch()} (${projectName()}) - irsim`,
    robots: { index: false, follow: false },
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // the head script may switch data-theme before React hydrates, so the attribute can differ
    <html lang="ar" dir="rtl" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <meta name="irsim-version" content={runningVersion()} />
        <meta name="irsim-build" content={runningBuild() ?? ''} />
      </head>
      <body>
        <Script id="canvas-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  )
}
