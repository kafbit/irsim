'use client'

import Link from 'next/link'
import { Button } from '../../ui'
import type { ManifestBoard } from '../types'
import { compareHref } from './variants-model'

const HEADING = 'm-0 text-xs font-normal text-muted-foreground'

function CompareLink({ page, base, label }: { page: string; base: string; label: string }) {
  return (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link href={compareHref(page, base)}>{label}</Link>
    </Button>
  )
}

function VariantBoardBox({ board, page }: { board: ManifestBoard; page: string }) {
  const base = board.variantOf ?? ''
  return (
    <section aria-label="Variants" className="flex flex-col gap-2">
      <h3 className={HEADING}>Variants</h3>
      <p className="m-0 text-sm text-foreground">
        Variant of {base}: {board.variantLabel ?? board.name}
      </p>
      {board.unchanged ? (
        <p
          role="status"
          className="m-0 rounded-[10px] border border-border bg-secondary px-2.5 py-2 text-[13px] leading-5 text-foreground"
        >
          Not changed yet
        </p>
      ) : null}
      <CompareLink page={page} base={base} label="Compare" />
    </section>
  )
}

/** The variant board box: the base board it varies and a link to compare. Variants are generated from the composer Options. */
export function VariantsBox({ board, page }: { board: ManifestBoard; page: string }) {
  return board.variantOf ? <VariantBoardBox board={board} page={page} /> : null
}
