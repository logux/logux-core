import { delay } from 'nanodelay'

import { ClientNode, ServerNode, TestTime, TestPair } from '../index.js'

let destroyable: TestPair

afterEach(() => {
  destroyable.leftNode.destroy()
  destroyable.rightNode.destroy()
})

function privateMethods (obj: object): any {
  return obj
}

function createPair (): TestPair {
  let time = new TestTime()
  let log1 = time.nextLog()
  let log2 = time.nextLog()
  let test = new TestPair()

  destroyable = test

  log1.on('preadd', (action, meta) => {
    meta.reasons = ['t']
  })
  log2.on('preadd', (action, meta) => {
    meta.reasons = ['t']
  })

  test.leftNode = new ClientNode('client', log1, test.left, { fixTime: false })
  test.rightNode = new ServerNode('server', log2, test.right)

  return test
}

async function createTest (
  before?: (test: TestPair) => void
): Promise<TestPair> {
  let test = createPair()
  before?.(test)
  test.left.connect()
  await test.leftNode.waitFor('synchronized')
  test.clear()
  privateMethods(test.leftNode).baseTime = 0
  privateMethods(test.rightNode).baseTime = 0
  return test
}

it('sends sync messages', async () => {
  let actionA = { type: 'a' }
  let actionB = { type: 'b' }
  let test = await createTest()
  test.leftNode.log.add(actionA)
  await test.wait('left')
  expect(test.leftSent).toEqual([
    ['sync', 1, actionA, { id: [1, 'test1', 0], time: 1, reasons: ['t'] }]
  ])
  expect(test.rightSent).toEqual([['synced', 1]])

  test.rightNode.log.add(actionB)
  await test.wait('right')
  expect(test.leftSent).toEqual([
    ['sync', 1, actionA, { id: [1, 'test1', 0], time: 1, reasons: ['t'] }],
    ['synced', 2]
  ])
  expect(test.rightSent).toEqual([
    ['synced', 1],
    ['sync', 2, actionB, { id: [2, 'test2', 0], time: 2, reasons: ['t'] }]
  ])
})

it('uses last added on non-added action', async () => {
  let test = await createTest()
  test.leftNode.log.on('preadd', (action, meta) => {
    meta.reasons = []
  })
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(test.leftSent).toEqual([
    ['sync', 0, { type: 'a' }, { id: [1, 'test1', 0], time: 1, reasons: [] }]
  ])
})

it('checks sync types', async () => {
  let wrongs = [
    ['sync'],
    ['sync', 0, { type: 'a' }],
    ['sync', 0, { type: 'a' }, []],
    ['sync', 0, { type: 'a' }, {}],
    ['sync', 0, { type: 'a' }, { id: 0 }],
    ['sync', 0, { type: 'a' }, { time: 0 }],
    ['sync', 0, { type: 'a' }, { id: 0, time: '0' }],
    ['sync', 0, { type: 'a' }, { id: [0], time: 0 }],
    ['sync', 0, { type: 'a' }, { id: [0, 'node'], time: 0 }],
    ['sync', 0, { type: 'a' }, { id: '1 node 0', time: 0 }],
    ['sync', 0, { type: 'a' }, { id: [1, 'node', 1, '0'], time: 0 }],
    ['sync', 0, {}, { id: 0, time: 0 }],
    ['synced'],
    ['synced', 'abc']
  ]
  await Promise.all(
    wrongs.map(async msg => {
      let test = await createTest()
      test.leftNode.catch(() => true)
      // @ts-expect-error
      test.leftNode.send(msg)
      await test.wait('left')
      expect(test.rightNode.connected).toBe(false)
      expect(test.rightSent).toEqual([
        ['error', 'wrong-format', JSON.stringify(msg)]
      ])
    })
  )
})

it('synchronizes actions', async () => {
  let test = await createTest()
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(test.leftNode.log.actions()).toEqual([{ type: 'a' }])
  expect(test.leftNode.log.actions()).toEqual(test.rightNode.log.actions())
  test.rightNode.log.add({ type: 'b' })
  await test.wait('right')
  expect(test.leftNode.log.actions()).toEqual([{ type: 'a' }, { type: 'b' }])
  expect(test.leftNode.log.actions()).toEqual(test.rightNode.log.actions())
})

it('remembers synced added', async () => {
  let test = await createTest()
  expect(test.leftNode.lastSent).toBe(0)
  expect(test.leftNode.lastReceived).toBe(0)
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(test.leftNode.lastSent).toBe(1)
  expect(test.leftNode.lastReceived).toBe(0)
  test.rightNode.log.add({ type: 'b' })
  await test.wait('right')
  expect(test.leftNode.lastSent).toBe(1)
  expect(test.leftNode.lastReceived).toBe(2)
  expect(privateMethods(test.leftNode.log.store).lastSent).toBe(1)
  expect(privateMethods(test.leftNode.log.store).lastReceived).toBe(2)
})

it('filters output actions', async () => {
  let test = await createTest(async created => {
    created.leftNode.options.outFilter = async (action, meta) => {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      expect(meta.added).toBeDefined()
      return action.type === 'b'
    }
    await Promise.all([
      created.leftNode.log.add({ type: 'a' }),
      created.leftNode.log.add({ type: 'b' })
    ])
  })
  expect(test.rightNode.log.actions()).toEqual([{ type: 'b' }])
  await Promise.all([
    test.leftNode.log.add({ type: 'a' }),
    test.leftNode.log.add({ type: 'b' })
  ])
  await test.leftNode.waitFor('synchronized')
  expect(test.rightNode.log.actions()).toEqual([{ type: 'b' }, { type: 'b' }])
})

it('maps output actions', async () => {
  let test = await createTest()
  test.leftNode.options.outMap = async (action, meta) => {
    expect(meta.id).toBeDefined()
    expect(meta.time).toBeDefined()
    expect(meta.added).toBeDefined()
    return [{ type: action.type + '1' }, meta]
  }
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(test.leftNode.log.actions()).toEqual([{ type: 'a' }])
  expect(test.rightNode.log.actions()).toEqual([{ type: 'a1' }])
})

it('uses output filter before map', async () => {
  let calls: string[] = []
  let test = await createTest()
  test.leftNode.options.outMap = async (action, meta) => {
    calls.push('map')
    return [action, meta]
  }
  test.leftNode.options.outFilter = async () => {
    calls.push('filter')
    return true
  }
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(calls).toEqual(['filter', 'map'])
})

it('filters input actions', async () => {
  let test = await createTest(created => {
    created.rightNode.options.inFilter = async (action, meta) => {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      return action.type !== 'c'
    }
    created.leftNode.log.add({ type: 'a' })
    created.leftNode.log.add({ type: 'b' })
    created.leftNode.log.add({ type: 'c' })
  })
  expect(test.leftNode.log.actions()).toEqual([
    { type: 'a' },
    { type: 'b' },
    { type: 'c' }
  ])
  expect(test.rightNode.log.actions()).toEqual([{ type: 'a' }, { type: 'b' }])
})

it('maps input actions', async () => {
  let test = await createTest()
  test.rightNode.options.inMap = async (action, meta) => {
    expect(meta.id).toBeDefined()
    expect(meta.time).toBeDefined()
    return [{ type: action.type + '1' }, meta]
  }
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(test.leftNode.log.actions()).toEqual([{ type: 'a' }])
  expect(test.rightNode.log.actions()).toEqual([{ type: 'a1' }])
})

it('uses input map before filter', async () => {
  let calls: string[] = []
  let test = await createTest()
  test.rightNode.options.inMap = async (action, meta) => {
    calls.push('map')
    return [action, meta]
  }
  test.rightNode.options.inFilter = async () => {
    calls.push('filter')
    return true
  }
  test.leftNode.log.add({ type: 'a' })
  await test.wait('left')
  expect(calls).toEqual(['map', 'filter'])
})

it('reports errors during initial output filter', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = createPair()
  test.rightNode.log.add({ type: 'a' })
  test.rightNode.catch(e => {
    catched.push(e)
  })
  test.rightNode.options.outFilter = async () => {
    throw error
  }
  test.left.connect()
  await delay(50)
  expect(catched).toEqual([error])
})

it('reports errors during output filter', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = await createTest(created => {
    created.rightNode.catch(e => {
      catched.push(e)
    })
    created.rightNode.options.outFilter = async () => {
      throw error
    }
  })
  test.rightNode.log.add({ type: 'a' })
  await delay(50)
  expect(catched).toEqual([error])
})

it('reports errors during initial output map', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = createPair()
  test.rightNode.log.add({ type: 'a' })
  test.rightNode.catch(e => {
    catched.push(e)
  })
  test.rightNode.options.outMap = async () => {
    throw error
  }
  test.left.connect()
  await delay(50)
  expect(catched).toEqual([error])
})

it('reports errors during output map', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = await createTest(created => {
    created.rightNode.catch(e => {
      catched.push(e)
    })
    created.rightNode.options.outMap = async () => {
      throw error
    }
  })
  test.rightNode.log.add({ type: 'a' })
  await delay(50)
  expect(catched).toEqual([error])
})

it('reports errors during input filter', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = await createTest()
  test.rightNode.catch(e => {
    catched.push(e)
  })
  test.rightNode.options.inFilter = async () => {
    throw error
  }
  test.leftNode.log.add({ type: 'a' })
  await delay(50)
  expect(catched).toEqual([error])
})

it('reports errors during input map', async () => {
  let error = new Error('test')
  let catched: Error[] = []
  let test = await createTest()
  test.rightNode.catch(e => {
    catched.push(e)
  })
  test.rightNode.options.inMap = async () => {
    throw error
  }
  test.leftNode.log.add({ type: 'a' })
  await delay(50)
  expect(catched).toEqual([error])
})

it('compresses time', async () => {
  let test = await createTest()
  privateMethods(test.leftNode).baseTime = 100
  privateMethods(test.rightNode).baseTime = 100
  await test.leftNode.log.add({ type: 'a' }, { id: '1 test1 0', time: 1 })
  await test.leftNode.waitFor('synchronized')
  expect(test.leftSent).toEqual([
    [
      'sync',
      1,
      { type: 'a' },
      { id: [-99, 'test1', 0], time: -99, reasons: ['t'] }
    ]
  ])
  expect(test.rightNode.log.entries()).toEqual([
    [{ type: 'a' }, { id: '1 test1 0', time: 1, added: 1, reasons: ['t'] }]
  ])
})

it('compresses IDs', async () => {
  let test = await createTest()
  await Promise.all([
    test.leftNode.log.add({ type: 'a' }, { id: '1 client 0', time: 1 }),
    test.leftNode.log.add({ type: 'a' }, { id: '1 client 1', time: 1 }),
    test.leftNode.log.add({ type: 'a' }, { id: '1 o 0', time: 1 })
  ])
  await test.leftNode.waitFor('synchronized')
  expect(test.leftSent).toEqual([
    ['sync', 1, { type: 'a' }, { id: 1, time: 1, reasons: ['t'] }],
    ['sync', 2, { type: 'a' }, { id: [1, 1], time: 1, reasons: ['t'] }],
    ['sync', 3, { type: 'a' }, { id: [1, 'o', 0], time: 1, reasons: ['t'] }]
  ])
  expect(test.rightNode.log.entries()).toEqual([
    [{ type: 'a' }, { id: '1 client 0', time: 1, added: 1, reasons: ['t'] }],
    [{ type: 'a' }, { id: '1 client 1', time: 1, added: 2, reasons: ['t'] }],
    [{ type: 'a' }, { id: '1 o 0', time: 1, added: 3, reasons: ['t'] }]
  ])
})

it('synchronizes any meta fields', async () => {
  let a = { type: 'a' }
  let test = await createTest()
  await test.leftNode.log.add(a, { id: '1 test1 0', time: 1, one: 1 })
  await test.leftNode.waitFor('synchronized')
  expect(test.leftSent).toEqual([
    ['sync', 1, a, { id: [1, 'test1', 0], time: 1, one: 1, reasons: ['t'] }]
  ])
  expect(test.rightNode.log.entries()).toEqual([
    [a, { id: '1 test1 0', time: 1, added: 1, one: 1, reasons: ['t'] }]
  ])
})

it('fixes created time', async () => {
  let test = await createTest()
  test.leftNode.timeFix = 10
  await Promise.all([
    test.leftNode.log.add({ type: 'a' }, { id: '11 test1 0', time: 11 }),
    test.rightNode.log.add({ type: 'b' }, { id: '2 test2 0', time: 2 })
  ])
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.log.entries()).toEqual([
    [{ type: 'a' }, { id: '11 test1 0', time: 11, added: 1, reasons: ['t'] }],
    [{ type: 'b' }, { id: '2 test2 0', time: 12, added: 2, reasons: ['t'] }]
  ])
  expect(test.rightNode.log.entries()).toEqual([
    [{ type: 'a' }, { id: '11 test1 0', time: 1, added: 2, reasons: ['t'] }],
    [{ type: 'b' }, { id: '2 test2 0', time: 2, added: 1, reasons: ['t'] }]
  ])
})

it('supports multiple actions in sync', async () => {
  let test = await createTest()
  privateMethods(test.rightNode).sendSync(2, [
    [{ type: 'b' }, { id: '2 test2 0', time: 2, added: 2 }],
    [{ type: 'a' }, { id: '1 test2 0', time: 1, added: 1 }]
  ])
  await test.wait('right')
  expect(test.leftNode.lastReceived).toBe(2)
  expect(test.leftNode.log.entries()).toEqual([
    [{ type: 'a' }, { id: '1 test2 0', time: 1, added: 1, reasons: ['t'] }],
    [{ type: 'b' }, { id: '2 test2 0', time: 2, added: 2, reasons: ['t'] }]
  ])
})

it('starts and ends timeout', async () => {
  let test = await createTest()
  privateMethods(test.leftNode).sendSync(1, [
    [{ type: 'a' }, { id: '1 test2 0', time: 1, added: 1 }]
  ])
  privateMethods(test.leftNode).sendSync(2, [
    [{ type: 'a' }, { id: '2 test2 0', time: 2, added: 1 }]
  ])
  expect(privateMethods(test.leftNode).timeouts).toHaveLength(2)

  privateMethods(test.leftNode).syncedMessage(1)
  expect(privateMethods(test.leftNode).timeouts).toHaveLength(1)

  privateMethods(test.leftNode).syncedMessage(2)
  expect(privateMethods(test.leftNode).timeouts).toHaveLength(0)
})

it('should nothing happend if syncedMessage of empty syncing', async () => {
  let test = await createTest()
  expect(privateMethods(test.leftNode).timeouts).toHaveLength(0)

  privateMethods(test.leftNode).syncedMessage(1)
  expect(privateMethods(test.leftNode).timeouts).toHaveLength(0)
})

it('uses always latest added', async () => {
  let test = await createTest()
  test.leftNode.log.on('preadd', (action, meta) => {
    meta.reasons = action.type === 'a' ? ['t'] : []
  })
  privateMethods(test.rightNode).send = () => {}
  test.leftNode.log.add({ type: 'a' })
  await delay(1)
  test.leftNode.log.add({ type: 'b' })
  await delay(1)
  expect(test.leftSent[1][1]).toEqual(1)
})

it('changes multiple actions in map', async () => {
  let test = await createTest(created => {
    created.leftNode.options.outMap = async (action, meta) => {
      return [{ type: action.type.toUpperCase() }, meta]
    }
    created.leftNode.log.add({ type: 'a' })
    created.leftNode.log.add({ type: 'b' })
  })
  await test.leftNode.waitFor('synchronized')
  expect(test.rightNode.lastReceived).toBe(2)
  expect(test.rightNode.log.actions()).toEqual([{ type: 'A' }, { type: 'B' }])
})

it('synchronizes actions on connect', async () => {
  let added: string[] = []
  let test = await createTest()
  test.leftNode.log.on('add', action => {
    added.push(action.type)
  })
  await Promise.all([
    test.leftNode.log.add({ type: 'a' }),
    test.rightNode.log.add({ type: 'b' })
  ])
  await test.leftNode.waitFor('synchronized')
  test.left.disconnect()
  await test.wait('right')
  expect(test.leftNode.lastSent).toBe(1)
  expect(test.leftNode.lastReceived).toBe(1)
  await Promise.all([
    test.leftNode.log.add({ type: 'c' }),
    test.leftNode.log.add({ type: 'd' }),
    test.rightNode.log.add({ type: 'e' }),
    test.rightNode.log.add({ type: 'f' })
  ])
  await test.left.connect()
  test.rightNode = new ServerNode('server2', test.rightNode.log, test.right)
  await test.leftNode.waitFor('synchronized')
  expect(test.leftNode.log.actions()).toEqual([
    { type: 'a' },
    { type: 'b' },
    { type: 'c' },
    { type: 'd' },
    { type: 'e' },
    { type: 'f' }
  ])
  expect(test.leftNode.log.actions()).toEqual(test.rightNode.log.actions())
  expect(added).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
})
