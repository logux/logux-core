import { LogStore } from '../log/index.js'
import { TestLog } from '../test-log/index.js'

type TestLogOptions = {
  /**
   * Unique log name.
   */
  nodeId?: string
  /**
   * Store for log. Will use {@link MemoryStore} by default.
   */
  store?: LogStore
}

/**
 * Creates special logs for test purposes.
 *
 * Real logs use real time in actions ID,
 * so log content will be different on every test execution.
 *
 * To fix it Logux has special logs for tests with simple sequence timer.
 * All logs from one test should share same time. This is why you should
 * use log creator to share time between all logs in one test.
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
export class TestTime {
  /**
   * Shortcut to create time and generate single log.
   * Use it only if you need one log in test.
   *
   * ```js
   * it('tests log', () => {
   *   const log = TestTime.getLog()
   * })
   * ```
   *
   * @param opts Log options.
   */
  static getLog(opts?: TestLogOptions): TestLog

  constructor()

  /**
   * Last letd number in log’s `nodeId`.
   */
  lastId: number

  /**
   * Return next test log in same time.
   *
   * ```js
   * it('tests 2 logs', () => {
   *   const time = new TestTime()
   *   const log1 = time.nextLog()
   *   const log2 = time.nextLog()
   * })
   * ```
   *
   * @param opts Log options.
   */
  nextLog(opts?: TestLogOptions): TestLog
}
