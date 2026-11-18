import { afterEach, describe, expect, test } from 'bun:test'
import { AUTO_SEND_KEY, readAutoSend, writeAutoSend } from '../src/canvas/comments/auto-send'

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

const install = (storage: unknown) =>
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

const memory = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('auto send storage', () => {
  test('defaults to false', () => {
    install(memory())
    expect(readAutoSend()).toBe(false)
  })

  test('round trips true and false', () => {
    install(memory())
    writeAutoSend(true)
    expect(readAutoSend()).toBe(true)
    writeAutoSend(false)
    expect(readAutoSend()).toBe(false)
  })

  test('uses the documented key', () => {
    const storage = memory()
    install(storage)
    writeAutoSend(true)
    expect(storage.getItem(AUTO_SEND_KEY)).toBe('true')
  })

  test('a throwing storage reads false and does not throw on write', () => {
    const boom = () => {
      throw new Error('denied')
    }
    install({ getItem: boom, setItem: boom })
    expect(readAutoSend()).toBe(false)
    expect(() => writeAutoSend(true)).not.toThrow()
  })
})
