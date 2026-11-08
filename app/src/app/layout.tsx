import type { Metadata } from 'next'
import Script from 'next/script'
import type { ReactNode } from 'react'
import { DEFAULT_THEME, themeScript } from '../lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kafbit',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // the head script may switch data-theme before React hydrates, so the attribute can differ
    <html lang="ar" dir="rtl" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <body>
        <Script id="canvas-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  )
}
