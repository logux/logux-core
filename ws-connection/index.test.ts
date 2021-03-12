import WebSocket from 'ws'
import { jest } from '@jest/globals'

import { WsConnection, Message } from '../index.js'

class FakeWebSocket {
  opts: object

  sent: string[]

  readyState?: number

  onopen?: () => void

  onmessage?: (event: object) => void

  onerror?: (event: object) => void

  onclose?: () => void

  constructor(url: string, protocols: string, opts: object) {
    this.opts = opts
    this.sent = []
    setTimeout(() => {
      this.onopen?.()
    }, 1)
  }

  send(msg: string): void {
    this.sent.push(msg)
  }

  emit(name: string, data?: string | Error): void {
    if (name === 'open') {
      if (typeof this.onopen === 'undefined') {
        throw new Error(`No ${name} event listener`)
      } else {
        this.onopen()
      }
    } else if (name === 'message') {
      if (typeof this.onmessage === 'undefined') {
        throw new Error(`No ${name} event listener`)
      } else {
        this.onmessage({ data })
      }
    } else if (name === 'error') {
      if (typeof this.onerror === 'undefined') {
        throw new Error(`No ${name} event listener`)
      } else {
        this.onerror({ error: data })
      }
    } else if (name === 'close') {
      if (typeof this.onclose !== 'undefined') {
        this.onclose()
      }
    }
  }

  close(): void {
    this.emit('close')
  }
}

declare global {
  namespace NodeJS {
    interface Global {
      WebSocket: any
    }
  }
}

afterEach(() => {
  delete global.WebSocket
})

function privateMethods(obj: object): any {
  return obj
}

function emit(
  ws: WebSocket | undefined,
  name: string,
  data?: string | Error
): void {
  if (typeof ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }
  ws.emit(name, data)
}

it('throws a error on lack of WebSocket support', () => {
  expect(() => {
    new WsConnection('ws://locahost')
  }).toThrow(/WebSocket/)
})

it('emits error on wrong format', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')
  let error: Error | undefined
  connection.on('error', err => {
    error = err
  })

  await connection.connect()

  emit(connection.ws, 'message', '{')
  if (typeof error === 'undefined') throw new Error('Error was not sent')
  expect(error.message).toEqual('Wrong message format')
  expect(privateMethods(error).received).toEqual('{')
})

it('emits error on error', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')
  let error: Error | undefined
  connection.on('error', err => {
    error = err
  })

  await connection.connect()

  emit(connection.ws, 'error', new Error('test'))
  if (typeof error === 'undefined') throw new Error('Error was not sent')
  expect(error.message).toEqual('test')
  emit(connection.ws, 'error')
  expect(error.message).toEqual('WS Error')
})

it('emits connection states', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')

  let states: string[] = []
  connection.on('connecting', () => {
    states.push('connecting')
  })
  connection.on('connect', () => {
    states.push('connect')
  })
  connection.on('disconnect', () => {
    states.push('disconnect')
  })

  expect(states).toEqual([])
  expect(connection.connected).toBe(false)

  let connecting = connection.connect()

  expect(states).toEqual(['connecting'])
  expect(connection.connected).toBe(false)

  await connecting
  expect(states).toEqual(['connecting', 'connect'])
  expect(connection.connected).toBe(true)

  emit(connection.ws, 'close')
  expect(states).toEqual(['connecting', 'connect', 'disconnect'])
  expect(connection.connected).toBe(false)

  connection.connect()
  emit(connection.ws, 'close')
  expect(states).toEqual([
    'connecting',
    'connect',
    'disconnect',
    'connecting',
    'disconnect'
  ])
  expect(connection.connected).toBe(false)
})

it('closes WebSocket', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')

  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  let ws = connection.ws
  jest.spyOn(ws, 'close')

  connection.disconnect()
  expect(ws.close).toHaveBeenCalledTimes(1)
  expect(connection.connected).toBe(false)
})

it('close WebSocket 2 times', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')

  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  let ws = connection.ws
  jest.spyOn(ws, 'close')

  connection.disconnect()
  connection.disconnect()
  expect(ws.close).toHaveBeenCalledTimes(1)
  expect(connection.connected).toBe(false)
})

it('receives messages', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')

  let received: Message[] = []
  connection.on('message', msg => {
    received.push(msg)
  })

  await connection.connect()

  emit(connection.ws, 'message', '["ping",1]')
  expect(received).toEqual([['ping', 1]])
})

it('sends messages', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection<FakeWebSocket>('ws://locahost')

  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  connection.send(['ping', 1])
  expect(connection.ws.sent).toEqual(['["ping",1]'])
})

it('uses custom WebSocket implementation', async () => {
  let connection = new WsConnection<FakeWebSocket>(
    'ws://locahost',
    FakeWebSocket
  )

  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  connection.send(['ping', 1])
  expect(connection.ws.sent).toEqual(['["ping",1]'])
})

it('passes extra option for WebSocket', async () => {
  let connection = new WsConnection<FakeWebSocket>(
    'ws://locahost',
    FakeWebSocket,
    { a: 1 }
  )
  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  expect(connection.ws.opts).toEqual({ a: 1 })
})

it('does not send to closed socket', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection<FakeWebSocket>('ws://locahost')

  let errors: string[] = []
  connection.on('error', e => {
    errors.push(e.message)
  })

  await connection.connect()
  if (typeof connection.ws === 'undefined') {
    throw new Error('WebSocket was not created')
  }

  connection.ws.readyState = 2
  connection.send(['ping', 1])
  expect(errors).toEqual(['WS was closed'])
})

it('ignores double connect call', async () => {
  global.WebSocket = FakeWebSocket
  let connection = new WsConnection('ws://locahost')

  let connected = 0
  connection.on('connecting', () => {
    connected += 1
  })

  await connection.connect()
  await connection.connect()

  expect(connection.connected).toBe(true)
  expect(connected).toEqual(1)
})
