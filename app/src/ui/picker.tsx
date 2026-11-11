'use client'

import { useState } from 'react'

export const SEARCHABLE_AFTER = 6

export function useSearchable(count: number): boolean {
  const [searchable, setSearchable] = useState(false)
  if (!searchable && count > SEARCHABLE_AFTER) setSearchable(true)
  return searchable || count > SEARCHABLE_AFTER
}

export interface PickerText {
  readonly search: string
  readonly empty: string
  readonly loading: string
}

const PICKER_TEXT: PickerText = {
  search: 'اكتب للبحث…',
  empty: 'لا توجد نتائج',
  loading: 'جارٍ التحميل…',
}

export const usePickerText = () => PICKER_TEXT

export function useMatches<T extends { label: string }>(options: readonly T[], query: string) {
  const q = query.trim().toLocaleLowerCase()
  return q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options
}
