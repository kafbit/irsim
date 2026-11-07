import { memo } from 'react'
import { TITLE_BAR } from './geometry'

/** The page title above the first row, sized so it stays readable when zoomed out. */
export const PageLabel = memo(function PageLabel({ title, k }: { title: string; k: number }) {
  const fontSize = Math.min(220, Math.max(40, 16 / k))
  return (
    <h2
      dir="auto"
      className="absolute start-0 m-0 font-semibold whitespace-nowrap text-foreground"
      style={{ top: -TITLE_BAR - 48 - fontSize, fontSize, lineHeight: 1 }}
    >
      {title}
    </h2>
  )
})
