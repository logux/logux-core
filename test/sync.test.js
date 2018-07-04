var delay = require('nanodelay')

var ClientSync = require('../client-sync')
var ServerSync = require('../server-sync')
var TestTime = require('../test-time')
var TestPair = require('../test-pair')

var destroyable

function createPair () {
  var time = new TestTime()
  var log1 = time.nextLog()
  var log2 = time.nextLog()
  var test = new TestPair()

  destroyable = test

  log1.on('preadd', function (action, meta) {
    meta.reasons = ['t']
  })
  log2.on('preadd', function (action, meta) {
    meta.reasons = ['t']
  })

  test.leftSync = new ClientSync('client', log1, test.left, { fixTime: false })
  test.rightSync = new ServerSync('server', log2, test.right)

  return test
}

function createTest (before) {
  var test = createPair()
  if (before) before(test)
  test.left.connect()
  return test.leftSync.waitFor('synchronized').then(function () {
    test.clear()
    test.leftSync.baseTime = 0
    test.rightSync.baseTime = 0
    return test
  })
}

afterEach(function () {
  destroyable.leftSync.destroy()
  destroyable.rightSync.destroy()
})

it('sends sync messages', function () {
  var actionA = { type: 'a' }
  var actionB = { type: 'b' }
  return createTest().then(function (test) {
    test.leftSync.log.add(actionA)
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSent).toEqual([
      ['sync', 1, actionA, { id: [1, 'test1', 0], time: 1, reasons: ['t'] }]
    ])
    expect(test.rightSent).toEqual([
      ['synced', 1]
    ])

    test.rightSync.log.add(actionB)
    return test.wait('right')
  }).then(function (test) {
    expect(test.leftSent).toEqual([
      ['sync', 1, actionA, { id: [1, 'test1', 0], time: 1, reasons: ['t'] }],
      ['synced', 2]
    ])
    expect(test.rightSent).toEqual([
      ['synced', 1],
      ['sync', 2, actionB, { id: [2, 'test2', 0], time: 2, reasons: ['t'] }]
    ])
  })
})

it('uses last added on non-added action', function () {
  return createTest().then(function (test) {
    test.leftSync.log.on('preadd', function (action, meta) {
      meta.reasons = []
    })
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSent).toEqual([
      [
        'sync',
        0,
        { type: 'a' },
        { id: [1, 'test1', 0], time: 1, reasons: [] }
      ]
    ])
  })
})

it('checks sync types', function () {
  var wrongs = [
    ['sync'],
    ['sync', 0, { type: 'a' }],
    ['sync', 0, { type: 'a' }, []],
    ['sync', 0, { type: 'a' }, { }],
    ['sync', 0, { type: 'a' }, { id: 0 }],
    ['sync', 0, { type: 'a' }, { time: 0 }],
    ['sync', 0, { type: 'a' }, { id: 0, time: '0' }],
    ['sync', 0, { type: 'a' }, { id: [0], time: 0 }],
    // ['sync', 0, { type: 'a' }, { id: [0, 'node'], time: 0 }],
    ['sync', 0, { type: 'a' }, { id: '1 node 0', time: 0 }],
    ['sync', 0, { type: 'a' }, { id: [1, 'node', 1, '0'], time: 0 }],
    ['sync', 0, { }, { id: 0, time: 0 }],
    ['synced'],
    ['synced', 'abc']
  ]
  return Promise.all(wrongs.map(function (msg) {
    return createTest().then(function (test) {
      test.leftSync.catch(function () { })
      test.leftSync.send(msg)
      return test.wait('left')
    }).then(function (test) {
      expect(test.rightSync.connected).toBeFalsy()
      expect(test.rightSent).toEqual([
        ['error', 'wrong-format', JSON.stringify(msg)]
      ])
    })
  }))
})

it('synchronizes actions', function () {
  return createTest().then(function (test) {
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }])
    expect(test.leftSync.log.actions()).toEqual(test.rightSync.log.actions())
    test.rightSync.log.add({ type: 'b' })
    return test.wait('right')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }, { type: 'b' }])
    expect(test.leftSync.log.actions()).toEqual(test.rightSync.log.actions())
  })
})

it('remembers synced added', function () {
  return createTest().then(function (test) {
    expect(test.leftSync.lastSent).toBe(0)
    expect(test.leftSync.lastReceived).toBe(0)
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.lastSent).toBe(1)
    expect(test.leftSync.lastReceived).toBe(0)
    test.rightSync.log.add({ type: 'b' })
    return test.wait('right')
  }).then(function (test) {
    expect(test.leftSync.lastSent).toBe(1)
    expect(test.leftSync.lastReceived).toBe(2)
    expect(test.leftSync.log.store.lastSent).toBe(1)
    expect(test.leftSync.log.store.lastReceived).toBe(2)
  })
})

it('filters output actions', function () {
  var test
  return createTest(function (created) {
    test = created
    test.leftSync.options.outFilter = function (action, meta) {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      expect(meta.added).toBeDefined()
      return Promise.resolve(action.type === 'b')
    }
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }),
      test.leftSync.log.add({ type: 'b' })
    ])
  }).then(function () {
    expect(test.rightSync.log.actions()).toEqual([{ type: 'b' }])
  }).then(function () {
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }),
      test.leftSync.log.add({ type: 'b' })
    ])
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.rightSync.log.actions()).toEqual([{ type: 'b' }, { type: 'b' }])
  })
})

it('maps output actions', function () {
  return createTest().then(function (test) {
    test.leftSync.options.outMap = function (action, meta) {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      expect(meta.added).toBeDefined()
      return Promise.resolve([{ type: action.type + '1' }, meta])
    }
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }])
    expect(test.rightSync.log.actions()).toEqual([{ type: 'a1' }])
  })
})

it('filters input actions', function () {
  return createTest().then(function (test) {
    test.rightSync.options.inFilter = function (action, meta) {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      return Promise.resolve(action.type === 'b')
    }
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }])
    expect(test.rightSync.log.actions()).toEqual([])
    test.leftSync.log.add({ type: 'b' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }, { type: 'b' }])
    expect(test.rightSync.log.actions()).toEqual([{ type: 'b' }])
  })
})

it('maps input actions', function () {
  return createTest().then(function (test) {
    test.rightSync.options.inMap = function (action, meta) {
      expect(meta.id).toBeDefined()
      expect(meta.time).toBeDefined()
      return Promise.resolve([{ type: action.type + '1' }, meta])
    }
    test.leftSync.log.add({ type: 'a' })
    return test.wait('left')
  }).then(function (test) {
    expect(test.leftSync.log.actions()).toEqual([{ type: 'a' }])
    expect(test.rightSync.log.actions()).toEqual([{ type: 'a1' }])
  })
})

it('reports errors during initial output filter', function () {
  var error = new Error('test')
  var catched = []
  var test = createPair()
  test.rightSync.log.add({ type: 'a' })
  test.rightSync.catch(function (e) {
    catched.push(e)
  })
  test.rightSync.options.outFilter = function () {
    return Promise.reject(error)
  }
  test.left.connect()
  return delay(10).then(function () {
    expect(catched).toEqual([error])
  })
})

it('reports errors during output filter', function () {
  var error = new Error('test')
  var catched = []
  return createTest(function (test) {
    test.rightSync.catch(function (e) {
      catched.push(e)
    })
    test.rightSync.options.outFilter = function () {
      return Promise.reject(error)
    }
  }).then(function (test) {
    test.rightSync.log.add({ type: 'a' })
    return delay(10)
  }).then(function () {
    expect(catched).toEqual([error])
  })
})

it('reports errors during initial output map', function () {
  var error = new Error('test')
  var catched = []
  var test = createPair()
  test.rightSync.log.add({ type: 'a' })
  test.rightSync.catch(function (e) {
    catched.push(e)
  })
  test.rightSync.options.outMap = function () {
    return Promise.reject(error)
  }
  test.left.connect()
  return delay(10).then(function () {
    expect(catched).toEqual([error])
  })
})

it('reports errors during output map', function () {
  var error = new Error('test')
  var catched = []
  return createTest(function (test) {
    test.rightSync.catch(function (e) {
      catched.push(e)
    })
    test.rightSync.options.outMap = function () {
      return Promise.reject(error)
    }
  }).then(function (test) {
    test.rightSync.log.add({ type: 'a' })
    return delay(10)
  }).then(function () {
    expect(catched).toEqual([error])
  })
})

it('reports errors during input filter', function () {
  var error = new Error('test')
  var catched = []
  return createTest().then(function (test) {
    test.rightSync.catch(function (e) {
      catched.push(e)
    })
    test.rightSync.options.inFilter = function () {
      return Promise.reject(error)
    }
    test.leftSync.log.add({ type: 'a' })
    return delay(10)
  }).then(function () {
    expect(catched).toEqual([error])
  })
})

it('reports errors during input map', function () {
  var error = new Error('test')
  var catched = []
  return createTest().then(function (test) {
    test.rightSync.catch(function (e) {
      catched.push(e)
    })
    test.rightSync.options.inMap = function () {
      return Promise.reject(error)
    }
    test.leftSync.log.add({ type: 'a' })
    return delay(10)
  }).then(function () {
    expect(catched).toEqual([error])
  })
})

it('compresses time', function () {
  var test
  return createTest().then(function (created) {
    test = created
    test.leftSync.baseTime = 100
    test.rightSync.baseTime = 100
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }, { id: '1 test1 0', time: 1 })
    ])
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.leftSent).toEqual([
      [
        'sync',
        1,
        { type: 'a' },
        { id: [-99, 'test1', 0], time: -99, reasons: ['t'] }
      ]
    ])
    expect(test.rightSync.log.entries()).toEqual([
      [
        { type: 'a' },
        { id: '1 test1 0', time: 1, added: 1, reasons: ['t'] }
      ]
    ])
  })
})

it('compresses IDs', function () {
  var test
  return createTest().then(function (created) {
    test = created
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }, { id: '1 client 0', time: 1 }),
      test.leftSync.log.add({ type: 'a' }, { id: '1 client 1', time: 1 }),
      test.leftSync.log.add({ type: 'a' }, { id: '1 o 0', time: 1 })
    ])
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.leftSent).toEqual([
      ['sync', 1, { type: 'a' }, { id: 1, time: 1, reasons: ['t'] }],
      ['sync', 2, { type: 'a' }, { id: [1, 1], time: 1, reasons: ['t'] }],
      ['sync', 3, { type: 'a' }, { id: [1, 'o', 0], time: 1, reasons: ['t'] }]
    ])
    expect(test.rightSync.log.entries()).toEqual([
      [
        { type: 'a' },
        { id: '1 client 0', time: 1, added: 1, reasons: ['t'] }
      ],
      [
        { type: 'a' },
        { id: '1 client 1', time: 1, added: 2, reasons: ['t'] }
      ],
      [
        { type: 'a' },
        { id: '1 o 0', time: 1, added: 3, reasons: ['t'] }
      ]
    ])
  })
})

it('synchronizes any meta fields', function () {
  var a = { type: 'a' }
  var test
  return createTest().then(function (created) {
    test = created
    return test.leftSync.log.add(a, { id: '1 test1 0', time: 1, one: 1 })
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.leftSent).toEqual([
      ['sync', 1, a, { id: [1, 'test1', 0], time: 1, one: 1, reasons: ['t'] }]
    ])
    expect(test.rightSync.log.entries()).toEqual([
      [a, { id: '1 test1 0', time: 1, added: 1, one: 1, reasons: ['t'] }]
    ])
  })
})

it('fixes created time', function () {
  var test
  return createTest().then(function (created) {
    test = created
    test.leftSync.timeFix = 10
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }, { id: '11 test1 0', time: 11 }),
      test.rightSync.log.add({ type: 'b' }, { id: '2 test2 0', time: 2 })
    ])
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.leftSync.log.entries()).toEqual([
      [
        { type: 'a' },
        { id: '11 test1 0', time: 11, added: 1, reasons: ['t'] }
      ],
      [
        { type: 'b' },
        { id: '2 test2 0', time: 12, added: 2, reasons: ['t'] }
      ]
    ])
    expect(test.rightSync.log.entries()).toEqual([
      [
        { type: 'a' },
        { id: '11 test1 0', time: 1, added: 2, reasons: ['t'] }
      ],
      [
        { type: 'b' },
        { id: '2 test2 0', time: 2, added: 1, reasons: ['t'] }
      ]
    ])
  })
})

it('supports multiple actions in sync', function () {
  return createTest().then(function (test) {
    test.rightSync.sendSync(2, [
      [{ type: 'b' }, { id: '2 test2 0', time: 2, added: 2 }],
      [{ type: 'a' }, { id: '1 test2 0', time: 1, added: 1 }]
    ])
    return test.wait('right')
  }).then(function (test) {
    expect(test.leftSync.lastReceived).toBe(2)
    expect(test.leftSync.log.entries()).toEqual([
      [
        { type: 'a' },
        { id: '1 test2 0', time: 1, added: 1, reasons: ['t'] }
      ],
      [
        { type: 'b' },
        { id: '2 test2 0', time: 2, added: 2, reasons: ['t'] }
      ]
    ])
  })
})

it('starts and ends timeout', function () {
  return createTest().then(function (test) {
    test.leftSync.sendSync(1, [
      [{ type: 'a' }, { id: '1 test2 0', time: 1, added: 1 }]
    ])
    test.leftSync.sendSync(2, [
      [{ type: 'a' }, { id: '2 test2 0', time: 2, added: 1 }]
    ])
    expect(test.leftSync.timeouts).toHaveLength(2)

    test.leftSync.syncedMessage(1)
    expect(test.leftSync.timeouts).toHaveLength(1)

    test.leftSync.syncedMessage(2)
    expect(test.leftSync.timeouts).toHaveLength(0)
  })
})

it('changes multiple actions in map', function () {
  var test
  return createTest(function (created) {
    test = created
    test.leftSync.options.outMap = function (action, meta) {
      return Promise.resolve([{ type: action.type.toUpperCase() }, meta])
    }
    test.leftSync.log.add({ type: 'a' })
    test.leftSync.log.add({ type: 'b' })
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.rightSync.lastReceived).toBe(2)
    expect(test.rightSync.log.actions()).toEqual([{ type: 'A' }, { type: 'B' }])
  })
})

it('synchronizes actions on connect', function () {
  var test
  var added = []
  return createTest().then(function (created) {
    test = created
    test.leftSync.log.on('add', function (action) {
      added.push(action.type)
    })
    return Promise.all([
      test.leftSync.log.add({ type: 'a' }),
      test.rightSync.log.add({ type: 'b' })
    ])
  }).then(function () {
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    test.left.disconnect()
    return test.wait('right')
  }).then(function () {
    expect(test.leftSync.lastSent).toBe(1)
    expect(test.leftSync.lastReceived).toBe(1)
    return Promise.all([
      test.leftSync.log.add({ type: 'c' }),
      test.leftSync.log.add({ type: 'd' }),
      test.rightSync.log.add({ type: 'e' }),
      test.rightSync.log.add({ type: 'f' })
    ])
  }).then(function () {
    return test.left.connect()
  }).then(function () {
    test.rightSync = new ServerSync('server2', test.rightSync.log, test.right)
    return test.leftSync.waitFor('synchronized')
  }).then(function () {
    expect(test.leftSync.log.actions()).toEqual([
      { type: 'a' },
      { type: 'b' },
      { type: 'c' },
      { type: 'd' },
      { type: 'e' },
      { type: 'f' }
    ])
    expect(test.leftSync.log.actions()).toEqual(test.rightSync.log.actions())
    expect(added).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})
