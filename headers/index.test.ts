import { ServerNode, TestTime, TestPair, TestLog } from '../index.js'

let node: ServerNode<{}, TestLog>

afterEach(() => {
  node.destroy()
})

function privateMethods(obj: object): any {
  return obj
}

async function createTestPair(): Promise<TestPair> {
  let pair = new TestPair()
  node = new ServerNode<{}, TestLog>('server', TestTime.getLog(), pair.left)
  pair.leftNode = node
  await pair.left.connect()

  return pair
}

it('emits a headers on header messages', async () => {
  let test = await createTestPair()

  let headers = {}
  test.leftNode.on('headers', data => {
    headers = data
  })

  privateMethods(test.leftNode).onMessage(['headers', { test: 'test' }])

  expect(headers).toEqual({ test: 'test' })
})

it('checks types', async () => {
  let wrongs = [
    ['headers'],
    ['headers', true],
    ['headers', 0],
    ['headers', []],
    ['headers', 'abc'],
    ['headers', {}, 'abc']
  ]
  await Promise.all(
    wrongs.map(async msg => {
      let test = await createTestPair()
      // @ts-expect-error
      test.right.send(msg)
      await test.wait('right')
      expect(test.leftNode.connected).toBe(false)
      expect(test.leftSent).toEqual([
        ['error', 'wrong-format', JSON.stringify(msg)]
      ])
      test.leftNode.destroy()
    })
  )
})
