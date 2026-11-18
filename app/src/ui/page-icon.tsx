'use client'

import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic'
import { IrsimMark } from './icons-custom'

const KNOWN = new Set<string>(iconNames)

export const isKnownIcon = (name: string | undefined): name is IconName =>
  name !== undefined && KNOWN.has(name)

export function PageIcon({
  icon,
  size = 16,
  className,
}: {
  icon: string | undefined
  size?: number
  className?: string | undefined
}) {
  if (isKnownIcon(icon)) {
    return <DynamicIcon name={icon} size={size} aria-hidden="true" className={className} />
  }
  return <IrsimMark size={size} {...(className ? { className } : {})} />
}
