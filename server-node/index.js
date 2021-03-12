import { BaseNode } from '../base-node/index.js'
import { validate } from '../validate/index.js'

const DEFAULT_OPTIONS = {
  timeout: 20000,
  ping: 10000
}

export class ServerNode extends BaseNode {
  constructor(nodeId, log, connection, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options }
    super(nodeId, log, connection, options)

    if (this.options.fixTime) {
      throw new Error(
        'Logux Server could not fix time. Set opts.fixTime for Client node.'
      )
    }

    this.state = 'connecting'
  }

  onConnect() {
    if (this.initialized) {
      super.onConnect()
      this.startTimeout()
    }
  }

  onDisconnect() {
    super.onDisconnect()
    this.destroy()
  }

  onMessage(msg) {
    if (validate(this, msg)) {
      super.onMessage(msg)
    }
  }

  async connectMessage(...args) {
    await this.initializing
    super.connectMessage(...args)
    this.endTimeout()
  }

  async initialize() {
    let added = await this.log.store.getLastAdded()
    this.initialized = true
    this.lastAddedCache = added
    if (this.connection.connected) this.onConnect()
  }
}
