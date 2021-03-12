import { isFirstOlder, Meta } from '../index.js'

function createMeta(id: string, time: number): Meta {
  return { id, time, reasons: [], added: 1 }
}

it('compares entries by time', () => {
  let a = createMeta('2 a 0', 2)
  let b = createMeta('1 a 0', 1)
  expect(isFirstOlder(a, b)).toBe(false)
  expect(isFirstOlder(b, a)).toBe(true)
})

it('compares entries by real time', () => {
  let a = createMeta('1 a 0', 2)
  let b = createMeta('1 a 0', 1)
  expect(isFirstOlder(a, b)).toBe(false)
  expect(isFirstOlder(b, a)).toBe(true)
})

it('compares entries by other ID parts', () => {
  let a = createMeta('1 a 9', 1)
  let b = createMeta('1 a 10', 1)
  expect(isFirstOlder(a, b)).toBe(true)
  expect(isFirstOlder(b, a)).toBe(false)
})

it('compares entries by other ID parts with priority', () => {
  let a = createMeta('1 b 1', 1)
  let b = createMeta('1 a 2', 1)
  expect(isFirstOlder(a, b)).toBe(false)
  expect(isFirstOlder(b, a)).toBe(true)
})

it('compares entries with same time', () => {
  let a = createMeta('2 a 0', 1)
  let b = createMeta('1 a 0', 1)
  expect(isFirstOlder(a, b)).toBe(false)
  expect(isFirstOlder(b, a)).toBe(true)
})

it('returns false for same entry', () => {
  let a = createMeta('1 b 1', 1)
  expect(isFirstOlder(a, a)).toBe(false)
})

it('orders entries with different node ID length', () => {
  let a = createMeta('1 11 1', 1)
  let b = createMeta('1 1 2', 1)
  expect(isFirstOlder(a, b)).toBe(false)
  expect(isFirstOlder(b, a)).toBe(true)
})

it('works with undefined in one meta', () => {
  let a = createMeta('1 a 0', 1)
  expect(isFirstOlder(a, undefined)).toBe(false)
  expect(isFirstOlder(undefined, a)).toBe(true)
})
