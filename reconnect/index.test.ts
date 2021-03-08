import { delay } from 'nanodelay'
import { jest } from '@jest/globals'

import { Reconnect, TestPair, Message } from '../index.js'

declare global {
  namespace NodeJS {
    interface Global {
      window: any
      document: any
      navigator: any
    }
  }
}

let listeners: { [key: string]: () => void } = {}
const listenerMethods = {
  addEventListener (name: string, callback: () => void): void {
    listeners[name] = callback
  },
  removeEventListener (name: string, callback: () => void): void {
    if (listeners[name] === callback) {
      delete listeners[name]
    }
  }
}

beforeEach(() => {
  listeners = {}
  global.window = {
    ...listenerMethods
  }
  global.document = {
    hidden: false,
    ...listenerMethods
  }
  global.navigator = {
    onLine: true
  }
})

function privateMethods (obj: object): any {
  return obj
}

it('saves connection and options', () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left, { attempts: 1 })
  expect(recon.connection).toBe(pair.left)
  expect(recon.options.attempts).toEqual(1)
})

it('uses default options', () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  expect(typeof recon.options.minDelay).toEqual('number')
})

it('enables reconnecting on connect', () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  expect(recon.reconnecting).toBe(false)

  recon.connect()
  expect(recon.reconnecting).toBe(true)
})

it('enables reconnecting if connection was already connected', async () => {
  let pair = new TestPair()
  await pair.left.connect()
  let recon = new Reconnect(pair.left)
  expect(recon.reconnecting).toBe(true)
})

it('disables reconnecting on destroy and empty disconnect', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)

  await recon.connect()
  recon.disconnect('destroy')
  expect(recon.reconnecting).toBe(false)
  expect(pair.leftEvents).toEqual([['connect'], ['disconnect', 'destroy']])
  await recon.connect()
  recon.disconnect()
  expect(recon.reconnecting).toBe(false)
})

it('reconnects on timeout and error disconnect', async () => {
  let pair = new TestPair()
  await pair.left.connect()
  let recon = new Reconnect(pair.left)

  recon.disconnect('timeout')
  expect(recon.reconnecting).toBe(true)
  await pair.left.connect()

  recon.disconnect('error')
  expect(recon.reconnecting).toBe(true)
})

it('proxies connection methods', () => {
  let sent: Message[] = []
  let con = {
    on () {
      return () => {}
    },
    send (msg: Message) {
      sent.push(msg)
    },
    async connect () {
      this.connected = true
    },
    emitter: {},
    connected: false,
    disconnect () {
      this.connected = false
    },
    destroy () {}
  }
  let recon = new Reconnect(con)
  expect(recon.connected).toBe(false)
  expect(privateMethods(recon).emitter).toBe(con.emitter)

  recon.connect()
  expect(recon.connected).toBe(true)

  recon.send(['ping', 1])
  expect(sent).toEqual([['ping', 1]])

  recon.disconnect()
  expect(recon.connected).toBe(false)
})

it('proxies connection events', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)

  let received: Message[] = []
  let unbind = recon.on('message', msg => {
    received.push(msg)
  })

  await recon.connect()
  pair.right.send(['ping', 1])
  await pair.wait()
  pair.right.send(['ping', 2])
  await pair.wait()
  unbind()
  pair.right.send(['ping', 3])
  await pair.wait()
  expect(received).toEqual([
    ['ping', 1],
    ['ping', 2]
  ])
})

it('disables reconnection on protocol error', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  await recon.connect()
  pair.right.send(['error', 'wrong-protocol'])
  pair.right.disconnect()
  await pair.wait()
  expect(recon.reconnecting).toBe(false)
})

it('disables reconnection on authentication error', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  await recon.connect()
  pair.right.send(['error', 'wrong-credentials'])
  pair.right.disconnect()
  await pair.wait()
  expect(recon.reconnecting).toBe(false)
})

it('disables reconnection on subprotocol error', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  await recon.connect()
  pair.right.send(['error', 'wrong-subprotocol'])
  pair.right.disconnect()
  await pair.wait()
  expect(recon.reconnecting).toBe(false)
})

it('disconnects and unbind listeners on destory', async () => {
  let pair = new TestPair()
  let origin = privateMethods(pair.left).emitter.events.connect.length

  let recon = new Reconnect(pair.left)
  expect(privateMethods(pair.left).emitter.events.connect).not.toHaveLength(
    origin
  )

  await recon.connect()
  recon.destroy()
  await pair.wait()
  expect(privateMethods(pair.left).emitter.events.connect).toHaveLength(origin)
  expect(pair.right.connected).toBe(false)
})

it('reconnects automatically with delay', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left, { minDelay: 50, maxDelay: 50 })
  await recon.connect()
  pair.right.disconnect()
  await pair.wait()
  expect(pair.right.connected).toBe(false)
  await delay(70)
  expect(pair.right.connected).toBe(true)
})

it('allows to disable reconnecting', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)
  await recon.connect()
  recon.reconnecting = false
  pair.right.disconnect()
  await pair.wait()
  await delay(1)
  expect(pair.right.connected).toBe(false)
})

it('has maximum reconnection attempts', async () => {
  let pair = new TestPair()
  let connects = 0
  pair.left.connect = () => {
    connects += 1
    privateMethods(pair.left).emitter.emit('disconnect')
    return Promise.resolve()
  }

  let recon = new Reconnect(pair.left, {
    attempts: 3,
    minDelay: 0,
    maxDelay: 0
  })

  recon.connect()

  await delay(10)
  expect(recon.reconnecting).toBe(false)
  expect(connects).toBe(3)
})

it('tracks connecting state', () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left, {
    minDelay: 1000,
    maxDelay: 5000
  })

  expect(recon.connecting).toBe(false)

  privateMethods(pair.left).emitter.emit('connecting')
  expect(recon.connecting).toBe(true)

  privateMethods(pair.left).emitter.emit('disconnect')
  expect(recon.connecting).toBe(false)

  privateMethods(pair.left).emitter.emit('connecting')
  privateMethods(pair.left).emitter.emit('connect')
  expect(recon.connecting).toBe(false)
})

it('has dynamic delay', () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left, {
    minDelay: 1000,
    maxDelay: 5000
  })

  function attemptsIsAround (attempt: number, ms: number): void {
    recon.attempts = attempt
    let time = privateMethods(recon).nextDelay()
    expect(Math.abs(time - ms)).toBeLessThan(1000)
  }

  attemptsIsAround(0, 1000)
  attemptsIsAround(1, 2200)
  attemptsIsAround(2, 4500)
  attemptsIsAround(3, 5000)

  function attemptsIs (attempt: number, ms: number): void {
    recon.attempts = attempt
    let time = privateMethods(recon).nextDelay()
    expect(time).toEqual(ms)
  }

  for (let i = 4; i < 100; i++) {
    attemptsIs(i, 5000)
  }
})

it('listens for window events', async () => {
  let pair = new TestPair()
  let recon = new Reconnect(pair.left)

  await recon.connect()
  pair.right.disconnect()
  await pair.wait()
  expect(recon.connected).toBe(false)

  global.document.hidden = true
  listeners.visibilitychange()
  expect(recon.connecting).toBe(false)

  global.document.hidden = false
  listeners.visibilitychange()
  await pair.wait()
  expect(recon.connected).toBe(true)

  listeners.freeze()
  expect(recon.connecting).toBe(false)
  expect(recon.connected).toBe(false)

  global.navigator.onLine = false
  listeners.resume()
  expect(recon.connecting).toBe(false)

  global.navigator.onLine = true
  listeners.resume()
  await delay(10)
  expect(recon.connected).toBe(true)
  pair.right.disconnect()
  await pair.wait()
  expect(pair.right.connected).toBe(false)

  global.navigator.onLine = true
  listeners.online()
  await pair.wait()
  expect(pair.right.connected).toBe(true)

  recon.destroy()
  expect(Object.keys(listeners)).toHaveLength(0)
})

it('does connect on online if client was not connected', async () => {
  let pair = new TestPair()
  new Reconnect(pair.left)

  let connect = jest.spyOn(Reconnect.prototype, 'connect')

  listeners.visibilitychange()
  expect(connect).toHaveBeenCalledTimes(0)

  listeners.online()
  expect(connect).toHaveBeenCalledTimes(0)
})
