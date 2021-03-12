import { Meta } from '../index.js'

/**
 * Compare time, when log entries were created.
 *
 * It uses `meta.time` and `meta.id` to detect entries order.
 *
 * ```js
 * import { isFirstOlder } from '@logux/core'
 * if (isFirstOlder(lastBeep, meta) {
 *   beep(action)
 *   lastBeep = meta
 * }
 * ```
 *
 * @param firstMeta Some action’s metadata.
 * @param secondMeta Other action’s metadata.
 */
export function isFirstOlder(
  firstMeta: Meta | undefined,
  secondMeta: Meta | undefined
): boolean
