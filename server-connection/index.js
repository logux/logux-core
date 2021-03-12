import { WsConnection } from '../ws-connection/index.js'

export class ServerConnection extends WsConnection {
  constructor(ws) {
    super(undefined, true)
    this.connected = true
    this.init(ws)
  }

  connect() {
    throw new Error(
      'ServerConnection accepts already connected WebSocket ' +
        'instance and could not reconnect it'
    )
  }
}
