import { vi } from 'bun:test'

const stubbedGlobals = new Map<string, PropertyDescriptor | undefined>()
const stubbedEnv = new Map<string, string | undefined>()

Object.assign(vi, {
  stubGlobal: (name: string, value: unknown) => {
    if (!stubbedGlobals.has(name))
      stubbedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    return vi
  },
  unstubAllGlobals: () => {
    for (const [name, descriptor] of stubbedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete (globalThis as Record<string, unknown>)[name]
    }
    stubbedGlobals.clear()
    return vi
  },
  stubEnv: (name: string, value: string | undefined) => {
    if (!stubbedEnv.has(name)) stubbedEnv.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    return vi
  },
  unstubAllEnvs: () => {
    for (const [name, value] of stubbedEnv) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    stubbedEnv.clear()
    return vi
  },
})
