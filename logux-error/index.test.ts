import { LoguxErrorOptions } from './index.js'
import { LoguxError } from '../index.js'

function catchError<T extends keyof LoguxErrorOptions> (
  type: T,
  opts?: LoguxErrorOptions[T],
  received?: boolean
): LoguxError {
  let error
  try {
    throw new LoguxError(type, opts, received)
  } catch (e) {
    error = e
  }
  return error
}

it('does not crash if captureStackTrace does not exist', () => {
  let captureStackTrace = global.Error.captureStackTrace
  // @ts-expect-error
  delete global.Error.captureStackTrace
  catchError('wrong-credentials')
  global.Error.captureStackTrace = captureStackTrace
})

it('has stack trace', () => {
  let error = catchError('wrong-credentials')
  expect(error.stack).toContain('index.test.ts')
})

it('has class name', () => {
  let error = catchError('wrong-credentials')
  expect(error.name).toEqual('LoguxError')
})

it('has error description', () => {
  let error = catchError('wrong-credentials')
  expect(error.description).toEqual('Wrong credentials')
})

it('has received', () => {
  let own = catchError('timeout', 10)
  expect(own.received).toBe(false)
  let received = catchError('timeout', 10, true)
  expect(received.received).toBe(true)
})

it('stringifies', () => {
  let error = catchError('timeout', 10, true)
  expect(String(error)).toContain(
    'LoguxError: Logux received timeout error (A timeout was reached (10 ms))'
  )
})

it('stringifies local unknown error', () => {
  let error = catchError('timeout', 10)
  expect(error.toString()).toContain(
    'LoguxError: A timeout was reached (10 ms)'
  )
})

it('stringifies bruteforce error', () => {
  expect(catchError('bruteforce').toString()).toContain(
    'LoguxError: Too many wrong authentication attempts'
  )
})

it('stringifies subprotocol error', () => {
  let error = catchError(
    'wrong-subprotocol',
    {
      supported: '2.x',
      used: '1.0'
    },
    true
  )
  expect(error.toString()).toContain(
    'LoguxError: Logux received wrong-subprotocol error ' +
      '(Only 2.x application subprotocols are supported, but you use 1.0)'
  )
})

it('returns description by error type', () => {
  expect(catchError('wrong-format', '{}').toString()).toContain(
    'LoguxError: Wrong message format in {}'
  )
})

it('returns description by unknown type', () => {
  // @ts-expect-error
  expect(catchError('unknown').toString()).toContain('LoguxError: unknown')
})
