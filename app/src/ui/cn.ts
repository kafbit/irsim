import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...parts: ClassValue[]): string => twMerge(clsx(parts))
