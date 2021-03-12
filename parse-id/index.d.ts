type IDComponents = {
  clientId: string
  nodeId: string
  userId: string | undefined
}

/**
 * Parse `meta.id` or Node ID into component: user ID, client ID, node ID.
 *
 * ```js
 * import { parseId } from '@logux/core'
 * const { userId, clientId } = parseId(meta.id)
 * ```
 *
 * @param id Action or Node ID
 */
export function parseId(id: string): IDComponents
