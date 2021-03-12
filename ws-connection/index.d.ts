import { Connection } from '../base-node/index.js'

import WebSocket = require('ws')

/**
 * Logux connection for browser WebSocket.
 *
 * ```js
 * import { WsConnection } from '@logux/core'
 *
 * const connection = new WsConnection('wss://logux.example.com/')
 * const node = new ClientNode(nodeId, log, connection, opts)
 * ```
 */
export class WsConnection<WS = WebSocket> extends Connection {
  /**
   * WebSocket instance.
   */
  ws?: WS

  /**
   * @param url WebSocket server URL.
   * @param WS WebSocket class if you want change implementation.
   * @param opts Extra option for WebSocket constructor.
   */
  constructor(url: string, Class?: any, opts?: any)
}
