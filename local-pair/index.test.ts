import { LocalPair, Connection, Message } from '../index.js'

type Event =
  | ['connect']
  | ['connecting']
  | ['disconnect', string]
  | ['message', Message]

function track(tracker: Tracker, connection: Connection): Event[] {
  let events: Event[] = []
  connection.on('connecting', () => {
    events.push(['connecting'])
    tracker.waiting?.()
  })
  connection.on('connect', () => {
    events.push(['connect'])
    tracker.waiting?.()
  })
  connection.on('disconnect', reason => {
    events.push(['disconnect', reason])
    tracker.waiting?.()
  })
  connection.on('message', msg => {
    events.push(['message', msg])
    tracker.waiting?.()
  })
  return events
}

class Tracker {
  pair: LocalPair

  waiting?: () => void

  left: Event[]

  right: Event[]

  constructor(delay?: number) {
    this.pair = new LocalPair(delay)
    this.left = track(this, this.pair.left)
    this.right = track(this, this.pair.right)
  }

  wait(): Promise<void> {
    return new Promise<void>(resolve => {
      this.waiting = () => {
        delete this.waiting
        resolve()
      }
    })
  }
}

it('has right link between connections', () => {
  let pair = new LocalPair()
  expect(pair.left.other()).toBe(pair.right)
  expect(pair.right.other()).toBe(pair.left)
})

it('throws a error on disconnection in disconnected state', () => {
  let pair = new LocalPair()
  expect(() => {
    pair.left.disconnect()
  }).toThrow(/already finished/)
})

it('throws a error on message in disconnected state', () => {
  let pair = new LocalPair()
  expect(() => {
    pair.left.send(['ping', 1])
  }).toThrow(/started before sending/)
})

it('throws a error on connection in connected state', async () => {
  let pair = new LocalPair()
  await pair.left.connect()
  expect(() => {
    pair.left.connect()
  }).toThrow(/already established/)
})

it('sends a connect event', async () => {
  let tracker = new Tracker()
  expect(tracker.left).toEqual([])

  let connecting = tracker.pair.left.connect()
  expect(tracker.left).toEqual([['connecting']])
  expect(tracker.right).toEqual([])

  await connecting
  expect(tracker.left).toEqual([['connecting'], ['connect']])
  expect(tracker.right).toEqual([['connect']])
})

it('sends a disconnect event', async () => {
  let tracker = new Tracker()
  await tracker.pair.left.connect()
  tracker.pair.right.disconnect('error')
  expect(tracker.left).toEqual([['connecting'], ['connect']])
  expect(tracker.right).toEqual([['connect'], ['disconnect', 'error']])
  await tracker.wait()
  expect(tracker.left).toEqual([
    ['connecting'],
    ['connect'],
    ['disconnect', undefined]
  ])
  expect(tracker.right).toEqual([['connect'], ['disconnect', 'error']])
})

it('sends a message event', async () => {
  let tracker = new Tracker()
  await tracker.pair.left.connect()
  tracker.pair.left.send(['ping', 1])
  expect(tracker.right).toEqual([['connect']])
  await tracker.wait()
  expect(tracker.left).toEqual([['connecting'], ['connect']])
  expect(tracker.right).toEqual([['connect'], ['message', ['ping', 1]]])
})

it('emulates delay', async () => {
  let tracker = new Tracker(50)
  expect(tracker.pair.delay).toEqual(50)

  let prevTime = Date.now()
  await tracker.pair.left.connect()
  expect(Date.now() - prevTime).toBeGreaterThanOrEqual(48)

  prevTime = Date.now()
  tracker.pair.left.send(['ping', 1])
  await tracker.wait()
  expect(Date.now() - prevTime).toBeGreaterThanOrEqual(48)
})
