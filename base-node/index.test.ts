import { delay } from 'nanodelay'
import { jest } from '@jest/globals'

import {
  BaseNode,
  TestTime,
  TestPair,
  NodeOptions,
  NodeState
} from '../index.js'
import { TestLog } from '../test-log/index.js'

function createNode (
  opts?: NodeOptions,
  pair = new TestPair()
): BaseNode<{}, TestLog> {
  let log = TestTime.getLog()
  log.on('preadd', (action, meta) => {
    meta.reasons = ['test']
  })
  return new BaseNode('client', log, pair.left, opts)
}

async function createTest (): Promise<TestPair> {
  let pair = new TestPair()
  let node = createNode({}, pair)
  pair.leftNode = node
  await pair.left.connect()
  return pair
}

function privateMethods (obj: object): any {
  return obj
}

function emit (obj: any, event: string, ...args: any): void {
  obj.emitter.emit(event, ...args)
}

function listeners (obj: any): number {
  let count = 0
  for (let i in obj.emitter.events) {
    count += obj.emitter.events[i]?.length ?? 0
  }
  return count
}

it('saves all arguments', () => {
  let log = TestTime.getLog()
  let pair = new TestPair()
  let options = {}
  let node = new BaseNode('client', log, pair.left, options)

  expect(node.localNodeId).toEqual('client')
  expect(node.log).toBe(log)
  expect(node.connection).toBe(pair.left)
  expect(node.options).toBe(options)
})

it('allows to miss options', () => {
  expect(createNode().options).toEqual({})
})

it('has protocol version', () => {
  let node = createNode()
  expect(typeof node.localProtocol).toEqual('number')
  expect(typeof node.minProtocol).toEqual('number')
  expect(node.localProtocol).toBeGreaterThanOrEqual(node.minProtocol)
})

it('unbind all listeners on destroy', () => {
  let pair = new TestPair()
  let conListenersBefore = listeners(pair.left)
  let node = new BaseNode('client', TestTime.getLog(), pair.left)

  expect(listeners(node.log)).toBeGreaterThan(0)
  expect(listeners(pair.left)).toBeGreaterThan(conListenersBefore)

  node.destroy()
  expect(listeners(node.log)).toEqual(0)
  expect(listeners(pair.left)).toEqual(conListenersBefore)
})

it('destroys connection on destroy', () => {
  let node = createNode()
  node.connection.destroy = function () {}
  jest.spyOn(node.connection, 'disconnect')
  jest.spyOn(node.connection, 'destroy')

  node.destroy()
  expect(node.connection.disconnect).not.toHaveBeenCalledWith('destroy')
  expect(node.connection.destroy).toHaveBeenCalledTimes(1)
})

it('disconnects on destroy', async () => {
  let node = createNode()
  await node.connection.connect()
  node.destroy()
  expect(node.connection.connected).toBe(false)
})

it('does not throw error on send to disconnected connection', () => {
  let node = createNode()
  expect(() => {
    privateMethods(node).sendDuilian()
  }).not.toThrow()
})

it('sends messages to connection', async () => {
  let test = await createTest()
  privateMethods(test.leftNode).send(['test'])
  await test.wait()
  expect(test.leftSent).toEqual([['test']])
})

it('has connection state', async () => {
  let node = createNode()
  expect(node.connected).toBe(false)
  await node.connection.connect()
  expect(node.connected).toBe(true)
  node.connection.disconnect()
  expect(node.connected).toBe(false)
})

it('has state', async () => {
  let pair = new TestPair()
  let node = createNode({}, pair)

  let states: NodeState[] = []
  node.on('state', () => {
    states.push(node.state)
  })

  expect(node.state).toEqual('disconnected')
  await node.connection.connect()
  privateMethods(node).sendConnect()
  pair.right.send(['connected', node.localProtocol, 'server', [0, 0]])
  await node.waitFor('synchronized')
  expect(node.state).toEqual('synchronized')
  await node.log.add({ type: 'a' })
  expect(node.state).toEqual('sending')
  pair.right.send(['synced', 1])
  await node.waitFor('synchronized')
  expect(node.state).toEqual('synchronized')
  node.connection.disconnect()
  expect(node.state).toEqual('disconnected')
  await node.log.add({ type: 'b' })
  expect(node.state).toEqual('disconnected')
  emit(node.connection, 'connecting')
  expect(node.state).toEqual('connecting')
  await node.connection.connect()
  privateMethods(node).sendConnect()
  pair.right.send(['connected', node.localProtocol, 'server', [0, 0]])
  await node.waitFor('sending')
  expect(node.state).toEqual('sending')
  pair.right.send(['synced', 2])
  await node.waitFor('synchronized')
  expect(node.state).toEqual('synchronized')
  await node.log.add({ type: 'c' })
  node.connection.disconnect()
  expect(states).toEqual([
    'connecting',
    'synchronized',
    'sending',
    'synchronized',
    'disconnected',
    'connecting',
    'sending',
    'synchronized',
    'sending',
    'disconnected'
  ])
})

it('does not wait for state change is current state is correct', async () => {
  await createNode().waitFor('disconnected')
})

it('loads lastSent, lastReceived and lastAdded from store', async () => {
  let log = TestTime.getLog()
  let pair = new TestPair()
  let node

  log.store.setLastSynced({ sent: 1, received: 2 })
  await log.add({ type: 'a' }, { reasons: ['test'] })
  node = new BaseNode('client', log, pair.left)
  await node.initializing
  expect(privateMethods(node).lastAddedCache).toBe(1)
  expect(node.lastSent).toBe(1)
  expect(node.lastReceived).toBe(2)
})

it('does not override smaller lastSent', async () => {
  let node = createNode()
  privateMethods(node).setLastSent(2)
  privateMethods(node).setLastSent(1)
  expect(privateMethods(node.log.store).lastSent).toEqual(2)
})

it('has separated timeouts', async () => {
  let node = createNode({ timeout: 100 })

  let error: Error | undefined
  node.catch(e => {
    error = e
  })

  privateMethods(node).startTimeout()
  await delay(60)
  privateMethods(node).startTimeout()
  await delay(60)
  if (typeof error === 'undefined') throw new Error('Error was no sent')
  expect(error.message).toContain('timeout')
})

it('stops timeouts on disconnect', async () => {
  let node = createNode({ timeout: 10 })

  let error
  node.catch(e => {
    error = e
  })

  privateMethods(node).startTimeout()
  privateMethods(node).startTimeout()
  privateMethods(node).onDisconnect()

  await delay(50)
  privateMethods(node).startTimeout()
  expect(error).toBeUndefined()
})

it('accepts already connected connection', async () => {
  let pair = new TestPair()
  let node
  await pair.left.connect()
  node = new BaseNode('client', TestTime.getLog(), pair.left)
  await node.initializing
  expect(node.connected).toBe(true)
})

it('receives errors from connection', async () => {
  let test = await createTest()
  let emitted
  test.leftNode.catch(e => {
    emitted = e
  })

  let error = new Error('test')
  emit(test.left, 'error', error)

  expect(test.leftNode.connected).toBe(false)
  expect(test.leftEvents).toEqual([['connect'], ['disconnect', 'error']])
  expect(emitted).toEqual(error)
})

it('cancels error catching', async () => {
  let test = await createTest()
  let emitted
  let unbind = test.leftNode.catch((e: Error) => {
    emitted = e
  })

  unbind()
  let error = new Error('test')
  let catched
  try {
    emit(test.left, 'error', error)
  } catch (e) {
    catched = e
  }
  expect(emitted).toBeUndefined()
  expect(catched).toBe(error)
})

it('does not fall on sync without connection', async () => {
  await privateMethods(createNode()).syncSince(0)
})

it('receives format errors from connection', async () => {
  let test = await createTest()
  let error = new Error('Wrong message format')
  privateMethods(error).received = 'options'
  emit(test.left, 'error', error)
  await test.wait()
  expect(test.leftNode.connected).toBe(false)
  expect(test.leftEvents).toEqual([['connect'], ['disconnect', 'error']])
  expect(test.leftSent).toEqual([['error', 'wrong-format', 'options']])
})

it('throws error by default', async () => {
  let error = new Error('test')
  let test = await createTest()
  test.leftNode.connection.send = () => {
    throw error
  }
  expect(() => {
    privateMethods(test.leftNode).send(['ping', 0])
  }).toThrow(error)
})

it('disconnect on the error during send', async () => {
  let error = new Error('test')
  let errors: Error[] = []
  let test = await createTest()
  test.leftNode.catch(e => {
    errors.push(e)
  })
  test.leftNode.connection.send = () => {
    throw error
  }
  privateMethods(test.leftNode).send(['ping', 0])
  await delay(1)
  expect(test.leftNode.connected).toBe(false)
  expect(errors).toEqual([error])
})
