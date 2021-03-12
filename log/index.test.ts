import { MemoryStore, Log, Action, Meta, Page } from '../index.js'

function createLog(): Log<Meta, MemoryStore> {
  return new Log({
    nodeId: 'test',
    store: new MemoryStore()
  })
}

function checkActions(log: Log<Meta, MemoryStore>, expected: Action[]): void {
  let actions = log.store.entries.map(entry => entry[0])
  expect(actions).toEqual(expected)
}

function checkEntries(
  log: Log<Meta, MemoryStore>,
  expected: [Action, Partial<Meta>][]
): void {
  let entries = log.store.entries.map(entry => [entry[0], entry[1]])
  expect(entries).toEqual(expected)
}

async function logWith(
  entries: [Action, Partial<Meta>][]
): Promise<Log<Meta, MemoryStore>> {
  let log = createLog()
  await Promise.all(entries.map(entry => log.add(entry[0], entry[1])))
  return log
}

let originNow = Date.now
afterEach(() => {
  Date.now = originNow
})

it('requires node ID', () => {
  expect(() => {
    // @ts-expect-error
    new Log()
  }).toThrow(/node ID/)
})

it('requires store', () => {
  expect(() => {
    // @ts-expect-error
    new Log({ nodeId: 'test' })
  }).toThrow(/store/)
})

it('checks node ID', () => {
  expect(() => {
    new Log({ nodeId: 'a b', store: new MemoryStore() })
  }).toThrow(/Space/)
})

it('requires type for action', async () => {
  let log = createLog()
  let err
  try {
    // @ts-expect-error
    await log.add({ a: 1 })
  } catch (e) {
    err = e
  }
  expect(err.message).toContain('"type" in action')
})

it('sends new entries to listeners', async () => {
  let log = createLog()
  let actions1: Action[] = []
  let actions2: Action[] = []

  await log.add({ type: 'A' })
  log.on('add', (action, meta) => {
    expect(typeof meta).toEqual('object')
    actions1.push(action)
  })

  log.on('add', action => {
    actions2.push(action)
  })

  expect(actions1).toEqual([])
  expect(actions2).toEqual([])

  await log.add({ type: 'B' })
  await log.add({ type: 'C' })
  expect(actions1).toEqual([{ type: 'B' }, { type: 'C' }])
  expect(actions2).toEqual(actions1)
})

it('unsubscribes listeners', async () => {
  let log = createLog()

  let actions: Action[] = []
  let unsubscribe = log.on('add', action => {
    actions.push(action)
  })

  await log.add({ type: 'A' })
  unsubscribe()
  await log.add({ type: 'B' })
  expect(actions).toEqual([{ type: 'A' }])
})

it('ignore entry with existed ID', async () => {
  let log = createLog()

  let added: Action[] = []
  log.on('add', action => {
    added.push(action)
  })

  let meta = { id: '0 n 0', reasons: ['test'] }
  let result1 = await log.add({ type: 'A' }, meta)
  expect(typeof result1).toEqual('object')
  let result2 = await log.add({ type: 'B' }, meta)
  expect(result2).toBe(false)
  checkActions(log, [{ type: 'A' }])
  expect(added).toEqual([{ type: 'A' }])
})

it('iterates through added entries', async () => {
  let log = await logWith([
    [{ type: 'A' }, { id: '3 n 0', reasons: ['test'] }],
    [{ type: 'B' }, { id: '2 n 0', reasons: ['test'] }],
    [{ type: 'C' }, { id: '1 n 0', reasons: ['test'] }]
  ])
  let entries: [Action, Meta][] = []
  await log.each((action, meta) => {
    entries.push([action, meta])
  })
  expect(entries).toEqual([
    [{ type: 'A' }, { id: '3 n 0', time: 3, added: 1, reasons: ['test'] }],
    [{ type: 'B' }, { id: '2 n 0', time: 2, added: 2, reasons: ['test'] }],
    [{ type: 'C' }, { id: '1 n 0', time: 1, added: 3, reasons: ['test'] }]
  ])
})

it('iterates by added order', async () => {
  let log = await logWith([
    [{ type: 'A' }, { id: '3 n 0', reasons: ['test'] }],
    [{ type: 'B' }, { id: '2 n 0', reasons: ['test'] }],
    [{ type: 'C' }, { id: '1 n 0', reasons: ['test'] }]
  ])
  let actions: Action[] = []
  await log.each({ order: 'added' }, action => {
    actions.push(action)
  })
  expect(actions).toEqual([{ type: 'C' }, { type: 'B' }, { type: 'A' }])
})

it('iterates by index', async () => {
  let log = await logWith([
    [{ type: 'A' }, { id: '3 n 0', reasons: ['test'], indexes: ['a'] }],
    [{ type: 'B' }, { id: '2 n 0', reasons: ['test'], indexes: ['a', 'b'] }],
    [{ type: 'C' }, { id: '1 n 0', reasons: ['test'], indexes: ['b'] }]
  ])
  let actions: Action[] = []
  await log.each({ index: 'b' }, action => {
    actions.push(action)
  })
  expect(actions).toEqual([{ type: 'C' }, { type: 'B' }])
})

it('disables iteration on false', async () => {
  let log = await logWith([
    [{ type: 'A' }, { reasons: ['test'] }],
    [{ type: 'B' }, { reasons: ['test'] }]
  ])
  let actions: Action[] = []
  await log.each(action => {
    actions.push(action)
    return false
  })
  expect(actions).toEqual([{ type: 'B' }])
})

it('supports multi-pages stores', async () => {
  let store = new MemoryStore()
  let meta: Meta = { id: '1 0 0', added: 0, time: 0, reasons: [] }
  let get: (opts?: object) => Promise<Page> = async () => {
    return {
      entries: [[{ type: 'a' }, meta]],
      async next(): Promise<Page> {
        return { entries: [[{ type: 'b' }, meta]] }
      }
    }
  }
  store.get = get
  let log = new Log({ nodeId: 'test', store })

  let actions: Action[] = []
  await log.each(action => {
    actions.push(action)
  })
  expect(actions).toEqual([{ type: 'a' }, { type: 'b' }])
})

it('copies time from ID', async () => {
  let log = await logWith([
    [{ type: 'TIMED' }, { id: '100 n 0', reasons: ['test'] }]
  ])
  checkEntries(log, [
    [
      { type: 'TIMED' },
      { id: '100 n 0', time: 100, added: 1, reasons: ['test'] }
    ]
  ])
})

it('keeps existed ID, time and reasons', async () => {
  let log = await logWith([
    [{ type: 'TIMED' }, { id: '100 n 0', time: 1, reasons: ['a'] }]
  ])
  checkEntries(log, [
    [{ type: 'TIMED' }, { id: '100 n 0', time: 1, added: 1, reasons: ['a'] }]
  ])
})

it('sets default ID and time and empty reasons for new entries', async () => {
  let log = createLog()
  let called = 0
  log.on('add', (action, meta) => {
    called += 1
    expect(meta.added).toBeUndefined()
    expect(meta.reasons).toEqual([])
    expect(typeof meta.time).toEqual('number')
    expect(meta.id).toEqual(`${meta.time} test 0`)
  })
  await log.add({ type: 'A' })
  expect(called).toEqual(1)
})

it('generates unique ID', () => {
  let log = createLog()
  let used = []
  for (let i = 0; i < 100; i++) {
    let id = log.generateId()
    expect(used).not.toContainEqual(id)
    used.push(id)
  }
})

it('always generates biggest ID', () => {
  let log = createLog()
  let times = [10, 9]

  Date.now = () => times.shift() ?? 0

  expect(log.generateId()).toEqual('10 test 0')
  expect(log.generateId()).toEqual('10 test 1')
})

it('changes meta', async () => {
  let log = await logWith([
    [{ type: 'A' }, { reasons: ['t'], id: '1 node 0' }],
    [{ type: 'B' }, { reasons: ['t'], id: '2 node 0', a: 1, indexes: ['a'] }]
  ])
  let result = await log.changeMeta('2 node 0', { a: 2, b: 2 })
  expect(result).toBe(true)
  checkEntries(log, [
    [{ type: 'A' }, { id: '1 node 0', time: 1, added: 1, reasons: ['t'] }],
    [
      { type: 'B' },
      {
        id: '2 node 0',
        time: 2,
        added: 2,
        reasons: ['t'],
        a: 2,
        b: 2,
        indexes: ['a']
      }
    ]
  ])
})

it('does not allow to change ID, added or indexes', async () => {
  let log = createLog()
  for (let key of ['id', 'added', 'time', 'subprotocol', 'indexes']) {
    let err
    try {
      await log.changeMeta('1 n 0', { [key]: true })
    } catch (e) {
      err = e
    }
    expect(err.message).toContain(`"${key}" is read-only`)
  }
})

it('removes action on setting entry reasons', async () => {
  let log = await logWith([
    [{ type: 'A' }, { reasons: ['test'], id: '1 n 0' }],
    [{ type: 'B' }, { reasons: ['test'], id: '2 n 0' }]
  ])
  let cleaned: [Action, Meta][] = []
  log.on('clean', (action, meta) => {
    cleaned.push([action, meta])
  })

  let result1 = await log.changeMeta('2 n 0', { reasons: [], a: 1 })
  expect(result1).toBe(true)
  expect(cleaned).toEqual([
    [{ type: 'B' }, { id: '2 n 0', time: 2, added: 2, reasons: [], a: 1 }]
  ])
  checkEntries(log, [
    [{ type: 'A' }, { id: '1 n 0', time: 1, added: 1, reasons: ['test'] }]
  ])
  let result2 = await log.changeMeta('3 n 0', { reasons: [] })
  expect(result2).toBe(false)
})

it('returns action by ID', async () => {
  let log = await logWith([[{ type: 'A' }, { reasons: ['test'], id: '1 n 0' }]])

  let result1 = await log.byId('1 n 0')
  if (result1[0] === null) throw new Error('Action was no found')
  expect(result1[0]).toEqual({ type: 'A' })
  expect(result1[1].reasons).toEqual(['test'])

  let result2 = await log.byId('2 n 0')
  expect(result2[0]).toBeNull()
  expect(result2[1]).toBeNull()
})

it('cleans log by reason', async () => {
  let log = await logWith([
    [{ type: 'A' }, { reasons: ['a'] }],
    [{ type: 'AB' }, { reasons: ['a', 'b'] }],
    [{ type: 'B' }, { reasons: ['b'] }]
  ])
  let cleaned: [Action, Meta['added'], Meta['reasons']][] = []
  log.on('clean', (action, meta) => {
    cleaned.push([action, meta.added, meta.reasons])
  })
  await log.removeReason('a')
  checkActions(log, [{ type: 'AB' }, { type: 'B' }])
  expect(log.store.entries[1][1].reasons).toEqual(['b'])
  expect(cleaned).toEqual([[{ type: 'A' }, 1, []]])
})

it('removes reason with minimum and maximum added', async () => {
  let log = await logWith([
    [{ type: '1' }, { reasons: ['a'] }],
    [{ type: '2' }, { reasons: ['a'] }],
    [{ type: '3' }, { reasons: ['a'] }]
  ])
  await log.removeReason('a', { maxAdded: 2, minAdded: 2 })
  checkActions(log, [{ type: '1' }, { type: '3' }])
})

it('does not put actions without reasons to log', async () => {
  let log = createLog()

  let added: [Action, Meta['added']][] = []
  log.on('add', (action, meta) => {
    expect(meta.id).not.toBeUndefined()
    added.push([action, meta.added])
  })
  let cleaned: [Action, Meta['added']][] = []
  log.on('clean', (action, meta) => {
    cleaned.push([action, meta.added])
  })

  let meta = await log.add({ type: 'A' })
  if (meta === false) throw new Error('Action was no added')
  expect(meta.reasons).toEqual([])
  expect(added).toEqual([[{ type: 'A' }, undefined]])
  expect(cleaned).toEqual([[{ type: 'A' }, undefined]])
  checkActions(log, [])
  await log.add({ type: 'B' }, { reasons: ['test'] })
  expect(added).toEqual([
    [{ type: 'A' }, undefined],
    [{ type: 'B' }, 1]
  ])
  expect(cleaned).toEqual([[{ type: 'A' }, undefined]])
  checkActions(log, [{ type: 'B' }])
})

it('checks ID for actions without reasons', async () => {
  let log = createLog()

  let added: [Action, Meta['added']][] = []
  log.on('add', (action, meta) => {
    added.push([action, meta.added])
  })
  let cleaned: [Action, Meta['added']][] = []
  log.on('clean', (action, meta) => {
    cleaned.push([action, meta.added])
  })

  await log.add({ type: 'A' }, { id: '1 n 0', reasons: ['t'] })
  let meta1 = await log.add({ type: 'B' }, { id: '1 n 0' })
  expect(meta1).toBe(false)
  expect(added).toEqual([[{ type: 'A' }, 1]])
  expect(cleaned).toEqual([])
  let meta2 = await log.add({ type: 'C' }, { id: '2 n 0' })
  expect(meta2).not.toBe(false)
  expect(added).toEqual([
    [{ type: 'A' }, 1],
    [{ type: 'C' }, undefined]
  ])
  expect(cleaned).toEqual([[{ type: 'C' }, undefined]])
})

it('fires preadd event', async () => {
  let log = createLog()

  let add: string[] = []
  log.on('add', action => {
    add.push(action.type)
  })

  let preadd: string[] = []
  log.on('preadd', (action, meta) => {
    expect(meta.added).toBeUndefined()
    if (action.type === 'A') meta.reasons.push('test')
    preadd.push(action.type)
  })

  await log.add({ type: 'A' }, { id: '1 n 0' })
  checkEntries(log, [
    [{ type: 'A' }, { id: '1 n 0', time: 1, added: 1, reasons: ['test'] }]
  ])
  expect(preadd).toEqual(['A'])
  expect(add).toEqual(['A'])
  await log.add({ type: 'B' }, { id: '1 n 0' })
  expect(preadd).toEqual(['A', 'B'])
  expect(add).toEqual(['A'])
})

it('removes reasons when keepLast option is used', async () => {
  let log = await logWith([
    [{ type: '1' }, { keepLast: 'a' }],
    [{ type: '2' }, { keepLast: 'a' }],
    [{ type: '3' }, { keepLast: 'a' }]
  ])
  checkActions(log, [{ type: '3' }])
})

it('allows to set keepLast in preadd', async () => {
  let log = createLog()
  log.on('preadd', (action, meta) => {
    meta.keepLast = 'a'
  })
  await Promise.all([
    log.add({ type: '1' }),
    log.add({ type: '2' }),
    log.add({ type: '3' })
  ])
  checkActions(log, [{ type: '3' }])
})

it('ensures `reasons` to be array of string values', async () => {
  let log = createLog()

  let meta1 = await log.add({ type: '1' })
  if (meta1 === false) throw new Error('Action was no found')
  expect(meta1.reasons).toEqual([])

  let err1
  try {
    // @ts-expect-error
    await log.add({ type: '3' }, { reasons: 1 })
  } catch (e) {
    err1 = e
  }
  expect(err1.message).toEqual('Expected "reasons" to be an array of strings')

  let err2
  try {
    // @ts-expect-error
    await log.add({ type: '3' }, { reasons: [false, 1] })
  } catch (e) {
    err2 = e
  }
  expect(err2.message).toEqual('Expected "reasons" to be an array of strings')
})

it('ensures `indexes` to be array of string values', async () => {
  let log = createLog()

  let err1
  try {
    // @ts-expect-error
    await log.add({ type: '3' }, { indexes: 'a' })
  } catch (e) {
    err1 = e
  }
  expect(err1.message).toEqual('Expected "indexes" to be an array of strings')

  let err2
  try {
    // @ts-expect-error
    await log.add({ type: '3' }, { indexes: [false, 1] })
  } catch (e) {
    err2 = e
  }
  expect(err2.message).toEqual('Expected "indexes" to be an array of strings')
})

it('has type listeners', async () => {
  let events: string[] = []
  let log = createLog()

  let unsibscribeA = log.type('A', (action, meta) => {
    expect(typeof meta.id).toEqual('string')
    events.push(`A: ${action.type}`)
  })

  log.type(
    'B',
    (action, meta) => {
      expect(typeof meta.id).toEqual('string')
      events.push(`B add: ${action.type}`)
    },
    { event: 'add' }
  )

  log.type(
    'C',
    (action, meta) => {
      expect(typeof meta.id).toEqual('string')
      events.push(`C preadd: ${action.type}`)
    },
    { event: 'preadd' }
  )

  log.type(
    'A',
    (action, meta) => {
      expect(typeof meta.id).toEqual('string')
      events.push(`A clean: ${action.type}`)
    },
    { event: 'clean' }
  )

  log.on('add', action => {
    events.push(`add: ${action.type}`)
  })

  await log.add({ type: 'A' })
  await log.add({ type: 'A' }, { reasons: ['test'] })
  await log.add({ type: 'A' }, { id: '0 test 0', reasons: ['test', 'test2'] })
  await log.add({ type: 'B' })
  await log.add({ type: 'C' })
  await log.add({ type: 'D' })
  await log.removeReason('test')
  await log.changeMeta('0 test 0', { reasons: [] })
  unsibscribeA()
  await log.add({ type: 'A' })

  expect(events).toEqual([
    'A: A',
    'add: A',
    'A clean: A',
    'A: A',
    'add: A',
    'A: A',
    'add: A',
    'B add: B',
    'add: B',
    'C preadd: C',
    'add: C',
    'add: D',
    'A clean: A',
    'A clean: A',
    'add: A',
    'A clean: A'
  ])
})

it('has type and action.id listener', async () => {
  let events: string[] = []
  let log = createLog()

  interface A {
    type: 'A'
    name: string
    id: string
  }

  log.type<A>('A', action => {
    events.push(`A add all ${action.name}`)
  })
  log.type<A>(
    'A',
    action => {
      events.push(`A add ID ${action.name}`)
    },
    { id: 'ID' }
  )
  log.type<A>(
    'A',
    action => {
      events.push(`A preadd ID ${action.name}`)
    },
    { event: 'preadd', id: 'ID' }
  )

  await log.add({ type: 'A', id: 'ID', name: 'a' })
  await log.add({ type: 'A', id: 'Other', name: 'b' })
  await log.add({ type: 'O', id: 'ID', name: 'c' })

  expect(events).toEqual([
    'A preadd ID a',
    'A add ID a',
    'A add all a',
    'A add all b'
  ])
})
