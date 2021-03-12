import { delay } from 'nanodelay'
import { jest } from '@jest/globals'

import { ClientNode, TestTime, TestPair } from '../index.js'

let node: ClientNode
afterEach(() => {
  node.destroy()
})

function privateMethods(obj: object): any {
  return obj
}

it('connects first', async () => {
  let pair = new TestPair()
  node = new ClientNode('client', TestTime.getLog(), pair.left)
  jest.spyOn(privateMethods(node), 'sendConnect')
  await pair.left.connect()
  expect(privateMethods(node).sendConnect).toHaveBeenCalledTimes(1)
})

it('saves last added from ping', async () => {
  let log = TestTime.getLog()
  let pair = new TestPair()
  node = new ClientNode('client', log, pair.left, { fixTime: false })
  await pair.left.connect()
  pair.right.send(['connected', node.localProtocol, 'server', [0, 0]])
  await pair.wait()
  expect(node.lastReceived).toBe(0)
  pair.right.send(['ping', 1])
  await pair.wait('right')
  expect(node.lastReceived).toBe(1)
  privateMethods(node).sendPing()
  pair.right.send(['pong', 2])
  await pair.wait('left')
  expect(node.lastReceived).toBe(2)
})

it('does not connect before initializing', async () => {
  let log = TestTime.getLog()

  let returnLastAdded: (added: number) => void = () => {
    throw new Error('getLastAdded was not called')
  }
  log.store.getLastAdded = () => {
    return new Promise(resolve => {
      returnLastAdded = resolve
    })
  }

  let pair = new TestPair()
  node = new ClientNode('client', log, pair.left, { fixTime: false })

  await pair.left.connect()
  await delay(10)
  expect(pair.leftSent).toEqual([])
  returnLastAdded(10)
  await delay(10)
  expect(pair.leftSent).toEqual([['connect', node.localProtocol, 'client', 0]])
})
