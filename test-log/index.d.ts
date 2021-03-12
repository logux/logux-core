import { Log, Action, Meta } from '../log/index.js'

/**
 * Log to be used in tests. It already has memory store, node ID,
 * and special test timer.
 *
 * Use {@link TestTime} to create test log.
 *
 * ```js
 * import { TestTime } from '@logux/core'
 *
 * it('tests log', () => {
 *   const log = TestTime.getLog()
 * })
 *
 * it('tests 2 logs', () => {
 *   const time = new TestTime()
 *   const log1 = time.nextLog()
 *   const log2 = time.nextLog()
 * })
 * ```
 */
export class TestLog<M extends Meta = Meta> extends Log<M> {
  /**
   * Return all entries (with metadata) inside log, sorted by created time.
   *
   * This shortcut works only with {@link MemoryStore}.
   *
   * ```js
   * expect(log.action).toEqual([
   *   [{ type: 'A' }, { id: '1 test1 0', time: 1, added: 1, reasons: ['t'] }]
   * ])
   * ```
   */
  entries(): [Action, Meta][]

  /**
   * Return all action (without metadata) inside log, sorted by created time.
   *
   * This shortcut works only with {@link MemoryStore}.
   *
   * ```js
   * expect(log.action).toEqual([
   *   { type: 'A' }
   * ])
   * ```
   */
  actions(): Action[]

  /**
   * Keep actions without `meta.reasons` in the log by setting `test` reason
   * during adding to the log.
   *
   * ```js
   * log.keepActions()
   * log.add({ type: 'test' })
   * log.actions() //=> [{ type: 'test' }]
   * ```
   */
  keepActions(): void
}
