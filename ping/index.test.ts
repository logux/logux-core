import { delay } from 'nanodelay'

import {
  ServerNode,
  ClientNode,
  BaseNode,
  TestTime,
  TestLog,
  TestPair,
  NodeOptions
} from '../index.js'

let node: BaseNode<{}, TestLog> | undefined

afterEach(() => {
  node?.destroy()
})

function privateMethods(obj: object): any {
  return obj
}

async function createTest(opts: NodeOptions): Promise<TestPair> {
  let log = TestTime.getLog()
  let test = new TestPair()
  await log.add({ type: 'test' }, { reasons: ['test'] })
  privateMethods(log.store).lastSent = 1
  node = new ClientNode('client', log, test.left, opts)
  test.leftNode = node
  await test.left.connect()
  await test.wait()
  let protocol = test.leftNode.localProtocol
  test.right.send(['connected', protocol, 'server', [0, 0]])
  test.clear()
  return test
}

it('throws on ping and no timeout options', () => {
  let pair = new TestPair()
  let log = TestTime.getLog()
  expect(() => {
    new ClientNode('client', log, pair.left, { ping: 1000, timeout: 0 })
  }).toThrow(/set timeout option/)
})

it('answers pong on ping', async () => {
  let test = await createTest({ fixTime: false })
  test.right.send(['ping', 1])
  await test.wait('right')
  expect(test.leftSent).toEqual([['pong', 1]])
})

it('sends ping on idle connection', async () => {
  let error: Error | undefined
  let test = await createTest({
    ping: 300,
    timeout: 100,
    fixTime: false
  })
  test.leftNode.catch(err => {
    error = err
  })
  await delay(250)
  privateMethods(test.right).send(['duilian', ''])
  await delay(250)
  privateMethods(test.leftNode).send(['duilian', ''])
  await delay(250)
  expect(error).toBeUndefined()
  expect(test.leftSent).toEqual([['duilian', '']])
  await delay(100)
  expect(error).toBeUndefined()
  expect(test.leftSent).toEqual([
    ['duilian', ''],
    ['ping', 1]
  ])
  test.right.send(['pong', 1])
  await delay(250)
  expect(error).toBeUndefined()
  expect(test.leftSent).toEqual([
    ['duilian', ''],
    ['ping', 1]
  ])
  await delay(100)
  expect(error).toBeUndefined()
  expect(test.leftSent).toEqual([
    ['duilian', ''],
    ['ping', 1],
    ['ping', 1]
  ])
  await delay(250)
  if (typeof error === 'undefined') throw new Error('Error was not sent')
  expect(error.message).toContain('timeout')
  expect(test.leftSent).toEqual([
    ['duilian', ''],
    ['ping', 1],
    ['ping', 1]
  ])
  expect(test.leftEvents[3]).toEqual(['disconnect', 'timeout'])
})

it('does not ping before authentication', async () => {
  let log = TestTime.getLog()
  let test = new TestPair()
  test.leftNode = new ClientNode('client', log, test.left, {
    ping: 100,
    timeout: 300,
    fixTime: false
  })
  test.leftNode.catch(() => true)
  await test.left.connect()
  await test.wait()
  test.clear()
  await delay(250)
  expect(test.leftSent).toEqual([])
})

it('sends only one ping if timeout is bigger than ping', async () => {
  let test = await createTest({
    ping: 100,
    timeout: 300,
    fixTime: false
  })
  await delay(250)
  expect(test.leftSent).toEqual([['ping', 1]])
})

it('do not try clear timeout if it does not set', async () => {
  let test = await createTest({
    ping: undefined
  })
  await delay(250)
  privateMethods(test.leftNode).sendPing()
  expect(test.leftSent).toEqual([])
})

it('do not send ping if not connected', async () => {
  let test = await createTest({ fixTime: false })
  test.right.send(['ping', 1])
  test.left.disconnect()
  await test.wait('right')
  expect(test.leftSent).toEqual([])
})

it('checks types', async () => {
  let wrongs = [
    ['ping'],
    ['ping', 'abc'],
    ['ping', []],
    ['pong'],
    ['pong', 'abc'],
    ['pong', {}]
  ]
  await Promise.all(
    wrongs.map(async msg => {
      let test = new TestPair()
      let log = TestTime.getLog()
      test.leftNode = new ServerNode('server', log, test.left)
      await test.left.connect()
      // @ts-expect-error
      test.right.send(msg)
      await test.wait('right')
      expect(test.leftNode.connected).toBe(false)
      expect(test.leftSent).toEqual([
        ['error', 'wrong-format', JSON.stringify(msg)]
      ])
    })
  )
})
