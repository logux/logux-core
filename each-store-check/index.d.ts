import { LogStore } from '../log/index.js'

/**
 * Pass all common tests for Logux store to callback.
 *
 * ```js
 * import { eachStoreCheck } from '@logux/core'
 *
 * eachStoreCheck((desc, creator) => {
 *   it(desc, creator(() => new CustomStore()))
 * })
 * ```
 *
 * @param test Callback to create tests in your test framework.
 */
export function eachStoreCheck(
  test: (
    name: string,
    testCreator: (storeCreator: () => LogStore) => () => void
  ) => void
): void
