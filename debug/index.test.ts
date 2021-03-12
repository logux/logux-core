import { ServerNode, TestTime, TestPair, TestLog } from '../index.js'

let node: ServerNode<{}, TestLog>

async function createTest(): Promise<TestPair> {
  let test = new TestPair()
  node = new ServerNode('server', TestTime.getLog(), test.left)
  test.leftNode = node
  await test.left.connect()
  return test
}

afterEach(() => {
  node.destroy()
})

function privateMethods(obj: object): any {
  return obj
}

it('sends debug messages', async () => {
  let test = await createTest()
  privateMethods(test.leftNode).sendDebug('testType', 'testData')
  await test.wait('right')
  expect(test.leftSent).toEqual([['debug', 'testType', 'testData']])
})

it('emits a debug on debug error messages', () => {
  let pair = new TestPair()
  node = new ServerNode('server', TestTime.getLog(), pair.left)

  let debugs: [string, string][] = []
  node.on('debug', (type, data) => {
    debugs.push([type, data])
  })

  privateMethods(node).onMessage(['debug', 'error', 'testData'])

  expect(debugs).toEqual([['error', 'testData']])
})

it('checks types', async () => {
  let wrongs = [
    ['debug'],
    ['debug', 0],
    ['debug', []],
    ['debug', {}, 'abc'],
    ['debug', 'error', 0],
    ['debug', 'error', []],
    ['debug', 'error', {}]
  ]
  await Promise.all(
    wrongs.map(async msg => {
      let test = await createTest()
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
