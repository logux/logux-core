import { delay } from 'nanodelay'

import {
  BaseNode,
  ServerNode,
  ClientNode,
  LoguxError,
  TestTime,
  TestPair
} from '../index.js'

let fakeNode = new BaseNode('id', TestTime.getLog(), new TestPair().left)
const PROTOCOL = fakeNode.localProtocol

let test: TestPair
afterEach(() => {
  test.leftNode.destroy()
  test.rightNode.destroy()
})

function privateMethods (obj: object): any {
  return obj
}

function createTest (): TestPair {
  let time = new TestTime()
  let pair = new TestPair()

  pair.leftNode = new ClientNode('client', time.nextLog(), pair.left)
  pair.rightNode = new ServerNode('server', time.nextLog(), pair.right)

  let current = 0
  privateMethods(pair.leftNode).now = () => {
    current += 1
    return current
  }
  privateMethods(pair.rightNode).now = privateMethods(pair.leftNode).now

  pair.leftNode.catch(() => true)
  pair.rightNode.catch(() => true)

  return pair
}

it('sends protocol version and name in connect message', async () => {
  test = createTest()
  await test.left.connect()
  await test.wait()
  expect(test.leftSent).toEqual([['connect', PROTOCOL, 'client', 0]])
})

it('answers with protocol version and name in connected message', async () => {
  test = createTest()
  await test.left.connect()
  await test.wait('left')
  expect(test.rightSent).toEqual([['connected', PROTOCOL, 'server', [2, 3]]])
})

it('checks client protocol version', async () => {
  test = createTest()
  test.leftNode.localProtocol = 1
  test.rightNode.minProtocol = 2

  await test.left.connect()
  await test.wait('left')
  expect(test.rightSent).toEqual([
    ['error', 'wrong-protocol', { supported: 2, used: 1 }]
  ])
  expect(test.rightNode.connected).toBe(false)
})

it('checks server protocol version', async () => {
  test = createTest()
  test.leftNode.minProtocol = 2
  test.rightNode.localProtocol = 1

  await test.left.connect()
  await test.wait('left')
  await test.wait('right')
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0],
    ['error', 'wrong-protocol', { supported: 2, used: 1 }]
  ])
  expect(test.left.connected).toBe(false)
})

it('checks types in connect message', async () => {
  let wrongs = [
    ['connect', []],
    ['connect', PROTOCOL, 'client', 0, 'abc'],
    ['connected', []],
    ['connected', PROTOCOL, 'client', [0]]
  ]
  await Promise.all(
    wrongs.map(async msg => {
      let log = TestTime.getLog()
      let pair = new TestPair()
      let node = new ServerNode('server', log, pair.left)
      await pair.left.connect()
      // @ts-expect-error
      pair.right.send(msg)
      await pair.wait('right')
      expect(node.connected).toBe(false)
      expect(pair.leftSent).toEqual([
        ['error', 'wrong-format', JSON.stringify(msg)]
      ])
    })
  )
})

it('saves other node name', async () => {
  test = createTest()
  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.remoteNodeId).toEqual('server')
  expect(test.rightNode.remoteNodeId).toEqual('client')
})

it('saves other client protocol', async () => {
  test = createTest()
  test.leftNode.minProtocol = 1
  test.leftNode.localProtocol = 1
  test.rightNode.minProtocol = 1
  test.rightNode.localProtocol = 2

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.remoteProtocol).toEqual(2)
  expect(test.rightNode.remoteProtocol).toEqual(1)
})

it('saves other client subprotocol', async () => {
  test = createTest()
  test.leftNode.options.subprotocol = '1.0.0'
  test.rightNode.options.subprotocol = '1.1.0'

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.remoteSubprotocol).toEqual('1.1.0')
  expect(test.rightNode.remoteSubprotocol).toEqual('1.0.0')
})

it('has default subprotocol', async () => {
  test = createTest()
  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.rightNode.remoteSubprotocol).toEqual('0.0.0')
})

it('checks subprotocol version', async () => {
  test = createTest()
  test.leftNode.options.subprotocol = '1.0.0'
  test.rightNode.on('connect', () => {
    throw new LoguxError('wrong-subprotocol', {
      supported: '2.x',
      used: test.rightNode.remoteSubprotocol ?? 'NO REMOTE'
    })
  })

  await test.left.connect()
  await test.wait('left')
  expect(test.rightSent).toEqual([
    ['error', 'wrong-subprotocol', { supported: '2.x', used: '1.0.0' }]
  ])
  expect(test.rightNode.connected).toBe(false)
})

it('checks subprotocol version in client', async () => {
  test = createTest()
  test.rightNode.options.subprotocol = '1.0.0'
  test.leftNode.on('connect', () => {
    throw new LoguxError('wrong-subprotocol', {
      supported: '2.x',
      used: test.leftNode.remoteSubprotocol ?? 'NO REMOTE'
    })
  })

  await test.left.connect()
  await test.wait('right')
  await test.wait('right')
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0],
    ['error', 'wrong-subprotocol', { supported: '2.x', used: '1.0.0' }]
  ])
  expect(test.leftNode.connected).toBe(false)
})

it('throws regular errors during connect event', () => {
  test = createTest()

  let error = new Error('test')
  test.leftNode.on('connect', () => {
    throw error
  })

  expect(() => {
    privateMethods(test.leftNode).connectMessage(PROTOCOL, 'client', 0)
  }).toThrow(error)
})

it('sends credentials in connect', async () => {
  test = createTest()
  test.leftNode.options = { token: '1' }

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0, { token: '1' }]
  ])
})

it('genereates credentials in connect', async () => {
  test = createTest()
  test.leftNode.options = { token: () => Promise.resolve('1') }

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0, { token: '1' }]
  ])
})

it('sends credentials in connected', async () => {
  test = createTest()
  test.rightNode.options = { token: '1' }

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.rightSent).toEqual([
    ['connected', PROTOCOL, 'server', [2, 3], { token: '1' }]
  ])
})

it('generates credentials in connected', async () => {
  test = createTest()
  test.rightNode.options = { token: () => Promise.resolve('1') }

  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.rightSent).toEqual([
    ['connected', PROTOCOL, 'server', [2, 3], { token: '1' }]
  ])
})

it('denies access for wrong users', async () => {
  test = createTest()
  test.rightNode.options = {
    async auth () {
      return false
    }
  }

  await test.left.connect()
  await test.wait('left')
  expect(test.rightSent).toEqual([['error', 'wrong-credentials']])
  expect(test.rightNode.connected).toBe(false)
})

it('denies access to wrong server', async () => {
  test = createTest()
  test.leftNode.options = {
    async auth () {
      return false
    }
  }

  await test.left.connect()
  await test.wait('right')
  await test.wait('right')
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0],
    ['error', 'wrong-credentials']
  ])
  expect(test.leftNode.connected).toBe(false)
})

it('allows access for right users', async () => {
  test = createTest()
  test.leftNode.options = { token: 'a' }
  test.rightNode.options = {
    async auth (nodeId, token) {
      await delay(10)
      return token === 'a' && nodeId === 'client'
    }
  }

  await test.left.connect()
  privateMethods(test.leftNode).sendDuilian(0)
  await delay(50)
  expect(test.rightSent[0]).toEqual(['connected', PROTOCOL, 'server', [1, 2]])
})

it('has default timeFix', async () => {
  test = createTest()
  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.timeFix).toEqual(0)
})

it('calculates time difference', async () => {
  test = createTest()
  let clientTime = [10000, 10000 + 1000 + 100 + 1]
  privateMethods(test.leftNode).now = () => clientTime.shift()
  let serverTime = [0 + 50, 0 + 50 + 1000]
  privateMethods(test.rightNode).now = () => serverTime.shift()

  test.leftNode.options.fixTime = true
  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  expect(privateMethods(test.leftNode).baseTime).toEqual(1050)
  expect(privateMethods(test.rightNode).baseTime).toEqual(1050)
  expect(test.leftNode.timeFix).toEqual(10000)
})

it('uses timeout between connect and connected', async () => {
  let log = TestTime.getLog()
  let pair = new TestPair()
  let client = new ClientNode('client', log, pair.left, { timeout: 100 })

  let error: Error | undefined
  client.catch(err => {
    error = err
  })

  await pair.left.connect()
  await delay(101)
  if (typeof error === 'undefined') throw new Error('Error was not thrown')
  expect(error.name).toEqual('LoguxError')
  expect(error.message).not.toContain('received')
  expect(error.message).toContain('timeout')
})

it('catches authentication errors', async () => {
  test = createTest()
  let errors: Error[] = []
  test.rightNode.catch(e => {
    errors.push(e)
  })

  let error = new Error()
  test.rightNode.options = {
    async auth () {
      throw error
    }
  }

  await test.left.connect()
  await test.wait('right')
  await delay(1)
  expect(errors).toEqual([error])
  expect(test.rightSent).toEqual([])
  expect(test.rightNode.connected).toBe(false)
})

it('sends authentication errors', async () => {
  test = createTest()
  test.rightNode.options = {
    async auth () {
      throw new LoguxError('bruteforce')
    }
  }

  await test.left.connect()
  await test.wait('right')
  await test.wait('left')
  expect(test.rightSent).toEqual([['error', 'bruteforce']])
  expect(test.rightNode.connected).toBe(false)
})

it('sends headers before connect message (if headers is set)', async () => {
  test = createTest()
  test.leftNode.setLocalHeaders({ env: 'development' })
  await test.left.connect()
  await delay(101)
  expect(test.leftSent).toEqual([
    ['headers', { env: 'development' }],
    ['connect', PROTOCOL, 'client', 0]
  ])
})

it('answers with headers before connected message', async () => {
  test = createTest()
  test.rightNode.setLocalHeaders({ env: 'development' })
  await test.left.connect()
  await delay(101)
  expect(test.rightSent).toEqual([
    ['headers', { env: 'development' }],
    ['connected', PROTOCOL, 'server', [2, 3]]
  ])
})

it('sends headers if connection is active', async () => {
  test = createTest()
  await test.left.connect()
  await test.wait()
  expect(test.leftSent).toEqual([['connect', PROTOCOL, 'client', 0]])

  test.leftNode.setLocalHeaders({ env: 'development' })
  await delay(101)
  expect(test.leftSent).toEqual([
    ['connect', PROTOCOL, 'client', 0],
    ['headers', { env: 'development' }]
  ])
})

it('saves remote headers', async () => {
  test = createTest()
  test.leftNode.setLocalHeaders({ env: 'development' })
  await test.left.connect()
  await delay(101)
  expect(test.rightNode.remoteHeaders).toEqual({ env: 'development' })
})

it('allows access only with headers', async () => {
  test = createTest()

  let authHeaders: object | undefined
  test.leftNode.options = { token: 'a' }
  test.rightNode.options = {
    async auth (nodeId, token, headers) {
      authHeaders = headers
      return true
    }
  }

  test.leftNode.setLocalHeaders({ env: 'development' })
  await test.left.connect()
  await delay(101)

  expect(authHeaders).toEqual({ env: 'development' })
})
