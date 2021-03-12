import assert from 'assert'

async function all(request, list) {
  if (!list) list = []
  let page = await request
  list = page.entries.concat(list)
  return page.next ? all(page.next(), list) : list
}

async function check(store, opts, list) {
  let entries = await all(store.get(opts))
  assert.deepStrictEqual(entries, list)
}

async function checkBoth(store, entries) {
  await Promise.all([
    check(store, { order: 'created' }, entries),
    check(store, { order: 'added' }, entries)
  ])
}

async function checkIndex(store, index, entries) {
  await Promise.all([
    check(store, { index, order: 'created' }, entries),
    check(store, { index, order: 'added' }, entries)
  ])
}

async function checkLastAdded(store, expected) {
  let lastAdded = await store.getLastAdded()
  assert.strictEqual(lastAdded, expected)
}

async function checkLastSynced(store, expectedSent, expectedRecieved) {
  let lastSynced = await store.getLastSynced()
  assert.deepStrictEqual(lastSynced, {
    sent: expectedSent,
    received: expectedRecieved
  })
}

export function eachStoreCheck(test) {
  test('is empty in the beginning', factory => async () => {
    let store = factory()
    await Promise.all([checkLastAdded(store, 0), checkLastSynced(store, 0, 0)])
  })

  test('updates latest synced values', factory => async () => {
    let store = factory()
    await store.setLastSynced({ sent: 1 })
    await checkLastSynced(store, 1, 0)
    await store.setLastSynced({ received: 1 })
    await checkLastSynced(store, 1, 1)
  })

  test('updates both synced values', factory => async () => {
    let store = factory()
    await store.setLastSynced({ sent: 2, received: 1 })
    await checkLastSynced(store, 2, 1)
  })

  test('stores entries sorted', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 a 0', time: 1 }),
      store.add({ type: '2' }, { id: '1 c 0', time: 2 }),
      store.add({ type: '3' }, { id: '1 b 1', time: 2 }),
      store.add({ type: '4' }, { id: '3 b 0', time: 2 })
    ])
    await check(store, { order: 'created' }, [
      [{ type: '1' }, { added: 1, id: '1 a 0', time: 1 }],
      [{ type: '4' }, { added: 4, id: '3 b 0', time: 2 }],
      [{ type: '3' }, { added: 3, id: '1 b 1', time: 2 }],
      [{ type: '2' }, { added: 2, id: '1 c 0', time: 2 }]
    ])
    await check(store, { order: 'added' }, [
      [{ type: '1' }, { added: 1, id: '1 a 0', time: 1 }],
      [{ type: '2' }, { added: 2, id: '1 c 0', time: 2 }],
      [{ type: '3' }, { added: 3, id: '1 b 1', time: 2 }],
      [{ type: '4' }, { added: 4, id: '3 b 0', time: 2 }]
    ])
  })

  test('indexed entries sorted', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 node1 0', time: 2, indexes: ['a'] }),
      store.add({ type: '2' }, { id: '1 node1 1', time: 1, indexes: ['a'] }),
      store.add({ type: '3' }, { id: '1 node1 2', time: 3 })
    ])
    await check(store, { index: 'a', order: 'created' }, [
      [{ type: '2' }, { added: 2, id: '1 node1 1', time: 1, indexes: ['a'] }],
      [{ type: '1' }, { added: 1, id: '1 node1 0', time: 2, indexes: ['a'] }]
    ])
    await check(store, { index: 'a', order: 'added' }, [
      [{ type: '1' }, { added: 1, id: '1 node1 0', time: 2, indexes: ['a'] }],
      [{ type: '2' }, { added: 2, id: '1 node1 1', time: 1, indexes: ['a'] }]
    ])
  })

  test('returns latest added', factory => async () => {
    let store = factory()
    await store.add({ type: 'A' }, { id: '1 n 0', time: 1 })
    let added = await store.getLastAdded()
    assert.ok(added)
    await store.add({ type: 'A' }, { id: '1 n 0' })
    await checkLastAdded(store, 1)
  })

  test('changes meta', factory => async () => {
    let store = factory()
    await store.add({}, { id: '1 n 0', time: 1, a: 1, indexes: ['a'] })
    let result = await store.changeMeta('1 n 0', { a: 2, b: 2 })
    assert.strictEqual(result, true)
    await checkBoth(store, [
      [{}, { id: '1 n 0', time: 1, added: 1, a: 2, b: 2, indexes: ['a'] }]
    ])
    await checkIndex(store, 'a', [
      [{}, { id: '1 n 0', time: 1, added: 1, a: 2, b: 2, indexes: ['a'] }]
    ])
  })

  test('resolves to false on unknown ID in changeMeta', factory => async () => {
    let store = factory()
    let result = await store.changeMeta('1 n 0', { a: 1 })
    assert.strictEqual(result, false)
  })

  test('removes entries', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 node1 0', time: 1 }),
      store.add({ type: '1' }, { id: '1 node1 0', time: 1 }),
      store.add({ type: '2' }, { id: '1 node1 1', time: 2 }),
      store.add({ type: '3' }, { id: '1 node1 2', time: 2 }),
      store.add({ type: '4' }, { id: '1 node1 3', time: 2 }),
      store.add({ type: '5' }, { id: '1 node2 0', time: 2 }),
      store.add({ type: '6' }, { id: '4 node1 0', time: 4 })
    ])
    let result = await store.remove('1 node1 1')
    assert.deepStrictEqual(result, [
      { type: '2' },
      { id: '1 node1 1', time: 2, added: 2 }
    ])
    await checkBoth(store, [
      [{ type: '1' }, { id: '1 node1 0', time: 1, added: 1 }],
      [{ type: '3' }, { id: '1 node1 2', time: 2, added: 3 }],
      [{ type: '4' }, { id: '1 node1 3', time: 2, added: 4 }],
      [{ type: '5' }, { id: '1 node2 0', time: 2, added: 5 }],
      [{ type: '6' }, { id: '4 node1 0', time: 4, added: 6 }]
    ])
  })

  test('removes entry with 0 time', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 node1 0', time: 1 }),
      store.add({ type: '2' }, { id: '2 node1 0', time: 2 }),
      store.add({ type: '3' }, { id: '3 node1 0', time: 0 })
    ])
    await store.remove('3 node1 0')
    await checkBoth(store, [
      [{ type: '1' }, { id: '1 node1 0', time: 1, added: 1 }],
      [{ type: '2' }, { id: '2 node1 0', time: 2, added: 2 }]
    ])
  })

  test('ignores removing unknown entry', factory => async () => {
    let store = factory()
    await store.add({ type: 'A' }, { id: '1 n 0', time: 1, added: 1 })
    let result = await store.remove('2 n 0')
    assert.strictEqual(result, false)
    await check(store, { order: 'created' }, [
      [{ type: 'A' }, { id: '1 n 0', time: 1, added: 1 }]
    ])
  })

  test('removes entry with indexes', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 node1 0', time: 1 }),
      store.add(
        { type: '2' },
        { id: '1 node1 1', time: 2, indexes: ['a', 'b'] }
      ),
      store.add({ type: '3' }, { id: '1 node1 2', time: 3, indexes: ['b'] })
    ])
    await store.remove('1 node1 1')
    await checkBoth(store, [
      [{ type: '1' }, { id: '1 node1 0', time: 1, added: 1 }],
      [{ type: '3' }, { id: '1 node1 2', time: 3, added: 3, indexes: ['b'] }]
    ])
    await checkIndex(store, 'a', [])
    await checkIndex(store, 'b', [
      [{ type: '3' }, { id: '1 node1 2', time: 3, added: 3, indexes: ['b'] }]
    ])
  })

  test('removes reasons and actions without reason', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a', 'b'] }),
      store.add({ type: '4' }, { id: '4 n 0', time: 4, reasons: ['b'] })
    ])
    await store.removeReason('a', {}, () => {})
    await checkBoth(store, [
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['b'] }],
      [{ type: '4' }, { added: 4, id: '4 n 0', time: 4, reasons: ['b'] }]
    ])
  })

  test('removes reason from indexes', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add(
        { type: '1' },
        { id: '1 n 0', time: 1, reasons: ['a'], indexes: ['a', 'b'] }
      ),
      store.add(
        { type: '2' },
        { id: '2 n 0', time: 2, reasons: ['b'], indexes: ['b'] }
      )
    ])
    await store.removeReason('a', {}, () => {})
    await checkIndex(store, 'a', [])
    await checkIndex(store, 'b', [
      [
        { type: '2' },
        { added: 2, id: '2 n 0', time: 2, reasons: ['b'], indexes: ['b'] }
      ]
    ])
  })

  test('removes reason by time', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    let m1 = { id: '1 n 0', time: 1 }
    let m3 = { id: '3 n 0', time: 3 }
    await store.removeReason('a', { olderThan: m3, youngerThan: m1 }, () => {})
    await checkBoth(store, [
      [{ type: '1' }, { added: 1, id: '1 n 0', time: 1, reasons: ['a'] }],
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['a'] }]
    ])
  })

  test('removes reason for older action', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    let m2 = { id: '2 n 0', time: 2 }
    await store.removeReason('a', { olderThan: m2 }, () => {})
    await checkBoth(store, [
      [{ type: '2' }, { added: 2, id: '2 n 0', time: 2, reasons: ['a'] }],
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['a'] }]
    ])
  })

  test('removes reason for younger action', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    let m2 = { id: '2 n 0', time: 2 }
    await store.removeReason('a', { youngerThan: m2 }, () => {})
    await checkBoth(store, [
      [{ type: '1' }, { added: 1, id: '1 n 0', time: 1, reasons: ['a'] }],
      [{ type: '2' }, { added: 2, id: '2 n 0', time: 2, reasons: ['a'] }]
    ])
  })

  test('removes reason with minimum added', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    await store.removeReason('a', { minAdded: 2 }, () => {})
    await checkBoth(store, [
      [{ type: '1' }, { added: 1, id: '1 n 0', time: 1, reasons: ['a'] }]
    ])
  })

  test('removes reason with maximum added', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    await store.removeReason('a', { maxAdded: 2 }, () => {})
    await checkBoth(store, [
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['a'] }]
    ])
  })

  test('removes reason with minimum and maximum added', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    await store.removeReason('a', { maxAdded: 2, minAdded: 2 }, () => {})
    await checkBoth(store, [
      [{ type: '1' }, { added: 1, id: '1 n 0', time: 1, reasons: ['a'] }],
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['a'] }]
    ])
  })

  test('removes reason with zero at maximum added', factory => async () => {
    let store = factory()
    await store.add({}, { id: '1 n 0', time: 1, reasons: ['a'] })
    await store.removeReason('a', { maxAdded: 0 }, () => {})
    await checkBoth(store, [
      [{}, { added: 1, id: '1 n 0', time: 1, reasons: ['a'] }]
    ])
  })

  test('removes reasons and actions by id', factory => async () => {
    let store = factory()
    let removed = []
    function push(action) {
      removed.push(action.type)
    }
    await Promise.all([
      store.add({ type: '1' }, { id: '1 n 0', time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: '2 n 0', time: 2, reasons: ['a', 'b'] }),
      store.add({ type: '3' }, { id: '3 n 0', time: 3, reasons: ['a'] })
    ])
    await Promise.all([
      store.removeReason('a', { id: '1 n 0' }, push),
      store.removeReason('b', { id: '2 n 0' }, push),
      store.removeReason('c', { id: '3 n 0' }, push),
      store.removeReason('a', { id: '4 n 0' }, push)
    ])
    assert.deepStrictEqual(removed, ['1'])
    await checkBoth(store, [
      [{ type: '2' }, { added: 2, id: '2 n 0', time: 2, reasons: ['a'] }],
      [{ type: '3' }, { added: 3, id: '3 n 0', time: 3, reasons: ['a'] }]
    ])
  })

  test('returns action by ID', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: 'A' }, { id: '1 node 0', time: 1 }),
      store.add({ type: 'B' }, { id: '1 node 1', time: 2 }),
      store.add({ type: 'C' }, { id: '1 node 2', time: 2 }),
      store.add({ type: 'D' }, { id: '1 node 3', time: 2 }),
      store.add({ type: 'E' }, { id: '2 node 0', time: 2 })
    ])
    let [action1, meta1] = await store.byId('1 node 0')
    assert.deepStrictEqual(action1, { type: 'A' })
    assert.deepStrictEqual(meta1.time, 1)
    let [action2] = await store.byId('1 node 2')
    assert.deepStrictEqual(action2, { type: 'C' })
    let [action3, meta3] = await store.byId('2 node 1')
    assert.deepStrictEqual(action3, null)
    assert.deepStrictEqual(meta3, null)
  })

  test('ignores entries with same ID', factory => async () => {
    let store = factory()
    let id = '1 a 1'
    let meta1 = await store.add({ a: 1 }, { id, time: 1 })
    assert.deepStrictEqual(meta1, { id, time: 1, added: 1 })
    let meta2 = await store.add({ a: 2 }, { id, time: 2 })
    assert.ok(!meta2)
    await checkBoth(store, [[{ a: 1 }, { id, time: 1, added: 1 }]])
  })

  test('stores any metadata', factory => async () => {
    let store = factory()
    await store.add({ type: 'A' }, { id: '1 a 0', time: 1, test: 1 })
    await checkBoth(store, [
      [{ type: 'A' }, { added: 1, id: '1 a 0', time: 1, test: 1 }]
    ])
  })

  test('sorts actions with same time', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: 'B' }, { id: '2 a 0', time: 1 }),
      store.add({ type: 'C' }, { id: '3 a 0', time: 1 }),
      store.add({ type: 'A' }, { id: '1 a 0', time: 1 })
    ])
    await check(store, { order: 'created' }, [
      [{ type: 'A' }, { added: 3, id: '1 a 0', time: 1 }],
      [{ type: 'B' }, { added: 1, id: '2 a 0', time: 1 }],
      [{ type: 'C' }, { added: 2, id: '3 a 0', time: 1 }]
    ])
  })

  test('sorts actions with same time and index', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: 'B' }, { id: '2 a 0', time: 1, indexes: ['a'] }),
      store.add({ type: 'C' }, { id: '3 a 0', time: 1, indexes: ['a'] }),
      store.add({ type: 'A' }, { id: '1 a 0', time: 1, indexes: ['a'] })
    ])
    await check(store, { index: 'a', order: 'created' }, [
      [{ type: 'A' }, { added: 3, id: '1 a 0', time: 1, indexes: ['a'] }],
      [{ type: 'B' }, { added: 1, id: '2 a 0', time: 1, indexes: ['a'] }],
      [{ type: 'C' }, { added: 2, id: '3 a 0', time: 1, indexes: ['a'] }]
    ])
  })

  test('cleans whole store if implemented', factory => async () => {
    let store = factory()
    await Promise.all([
      store.add({ type: 'A' }, { id: '1', time: 1 }),
      store.add({ type: 'B' }, { id: '2', time: 2, indexes: ['a'] }),
      store.add({ type: 'C' }, { id: '3', time: 3 }),
      store.add({ type: 'D' }, { id: '4', time: 4, indexes: ['a'] }),
      store.add({ type: 'E' }, { id: '5', time: 5, indexes: ['a', 'b'] })
    ])
    await store.clean()

    let store2 = factory()
    await Promise.all([
      checkBoth(store2, []),
      checkIndex(store2, 'a', []),
      checkIndex(store2, 'b', []),
      checkLastAdded(store2, 0),
      checkLastSynced(store2, 0, 0)
    ])
  })
}
