import { createNanoEvents } from 'nanoevents'

import {
  sendConnect,
  sendConnected,
  connectMessage,
  connectedMessage
} from '../connect/index.js'
import {
  syncedMessage,
  syncMessage,
  sendSynced,
  sendSync
} from '../sync/index.js'
import { sendPing, pingMessage, pongMessage } from '../ping/index.js'
import { sendHeaders, headersMessage } from '../headers/index.js'
import { sendDebug, debugMessage } from '../debug/index.js'
import { sendError, errorMessage } from '../error/index.js'
import { LoguxError } from '../logux-error/index.js'

const NOT_TO_THROW = {
  'wrong-subprotocol': true,
  'wrong-protocol': true,
  'timeout': true
}

const BEFORE_AUTH = ['connect', 'connected', 'error', 'debug', 'headers']

async function syncMappedEvent(node, action, meta) {
  let added = meta.added
  if (typeof added === 'undefined') {
    let lastAdded = node.lastAddedCache
    added = lastAdded > node.lastSent ? lastAdded : node.lastSent
  }
  if (node.options.outMap) {
    try {
      let changed = await node.options.outMap(action, meta)
      node.sendSync(added, [changed])
    } catch (e) {
      node.error(e)
    }
  } else {
    node.sendSync(added, [[action, meta]])
  }
}

export class BaseNode {
  constructor(nodeId, log, connection, options = {}) {
    this.remoteNodeId = undefined
    this.remoteProtocol = undefined
    this.remoteSubprotocol = undefined

    this.minProtocol = 3
    this.localProtocol = 4
    this.localNodeId = nodeId

    this.log = log
    this.connection = connection
    this.options = options

    if (this.options.ping && !this.options.timeout) {
      throw new Error('You must set timeout option to use ping')
    }

    this.connected = false
    this.authenticated = false
    this.unauthenticated = []

    this.timeFix = 0
    this.syncing = 0
    this.received = {}

    this.lastSent = 0
    this.lastReceived = 0

    this.state = 'disconnected'

    this.emitter = createNanoEvents()
    this.timeouts = []
    this.throwsError = true

    this.unbind = [
      log.on('add', (action, meta) => {
        this.onAdd(action, meta)
      }),
      connection.on('connecting', () => {
        this.onConnecting()
      }),
      connection.on('connect', () => {
        this.onConnect()
      }),
      connection.on('message', message => {
        this.onMessage(message)
      }),
      connection.on('error', error => {
        if (error.message === 'Wrong message format') {
          this.sendError(new LoguxError('wrong-format', error.received))
          this.connection.disconnect('error')
        } else {
          this.error(error)
        }
      }),
      connection.on('disconnect', () => {
        this.onDisconnect()
      })
    ]

    this.initialized = false
    this.lastAddedCache = 0
    this.initializing = this.initialize()
    this.localHeaders = {}
    this.remoteHeaders = {}
  }

  on(event, listener) {
    return this.emitter.on(event, listener)
  }

  catch(listener) {
    this.throwsError = false
    let unbind = this.on('error', listener)
    return () => {
      this.throwsError = true
      unbind()
    }
  }

  waitFor(state) {
    if (this.state === state) {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      let unbind = this.on('state', () => {
        if (this.state === state) {
          unbind()
          resolve()
        }
      })
    })
  }

  destroy() {
    if (this.connection.destroy) {
      this.connection.destroy()
    } else if (this.connected) {
      this.connection.disconnect('destroy')
    }
    for (let i of this.unbind) i()
    clearTimeout(this.pingTimeout)
    this.endTimeout()
  }

  setLocalHeaders(headers) {
    this.localHeaders = headers
    if (this.connected) {
      this.sendHeaders(headers)
    }
  }

  send(msg) {
    if (!this.connected) return
    this.delayPing()
    try {
      this.connection.send(msg)
    } catch (e) {
      this.error(e)
    }
  }

  onConnecting() {
    this.setState('connecting')
  }

  onConnect() {
    this.delayPing()
    this.connected = true
  }

  onDisconnect() {
    while (this.timeouts.length > 0) {
      this.endTimeout()
    }
    if (this.pingTimeout) clearTimeout(this.pingTimeout)
    this.authenticated = false
    this.connected = false
    this.setState('disconnected')
  }

  onMessage(msg) {
    this.delayPing()
    let name = msg[0]

    if (!this.authenticated && !BEFORE_AUTH.includes(name)) {
      this.unauthenticated.push(msg)
      return
    }

    this[name + 'Message'](...msg.slice(1))
  }

  async onAdd(action, meta) {
    if (!this.authenticated) return
    if (this.lastAddedCache < meta.added) {
      this.lastAddedCache = meta.added
    }

    if (this.received && this.received[meta.id]) {
      delete this.received[meta.id]
      return
    }

    if (this.options.outFilter) {
      try {
        let result = await this.options.outFilter(action, meta)
        if (result) syncMappedEvent(this, action, meta)
      } catch (e) {
        this.error(e)
      }
    } else {
      syncMappedEvent(this, action, meta)
    }
  }

  syncError(type, options, received) {
    let err = new LoguxError(type, options, received)
    this.emitter.emit('error', err)
    if (!NOT_TO_THROW[type] && this.throwsError) {
      throw err
    }
  }

  error(err) {
    this.emitter.emit('error', err)
    this.connection.disconnect('error')
    if (this.throwsError) {
      throw err
    }
  }

  setState(state) {
    if (this.state !== state) {
      this.state = state
      this.emitter.emit('state')
    }
  }

  startTimeout() {
    if (!this.options.timeout) return

    let ms = this.options.timeout
    let timeout = setTimeout(() => {
      if (this.connected) this.connection.disconnect('timeout')
      this.syncError('timeout', ms)
    }, ms)

    this.timeouts.push(timeout)
  }

  endTimeout() {
    if (this.timeouts.length > 0) {
      clearTimeout(this.timeouts.shift())
    }
  }

  delayPing() {
    if (!this.options.ping) return
    if (this.pingTimeout) clearTimeout(this.pingTimeout)

    this.pingTimeout = setTimeout(() => {
      if (this.connected && this.authenticated) this.sendPing()
    }, this.options.ping)
  }

  async syncSinceQuery(lastSynced) {
    let promises = []
    await this.log.each({ order: 'added' }, (action, meta) => {
      if (meta.added <= lastSynced) return false
      if (this.options.outFilter) {
        promises.push(
          this.options
            .outFilter(action, meta)
            .then(r => {
              if (r) {
                return [action, meta]
              } else {
                return false
              }
            })
            .catch(e => {
              this.error(e)
            })
        )
      } else {
        promises.push(Promise.resolve([action, meta]))
      }
      return true
    })

    let entries = await Promise.all(promises)

    let data = { added: 0 }
    data.entries = entries.filter(entry => {
      if (entry && data.added < entry[1].added) {
        data.added = entry[1].added
      }
      return entry !== false
    })
    return data
  }

  async syncSince(lastSynced) {
    let data = await this.syncSinceQuery(lastSynced)
    if (!this.connected) return
    if (data.entries.length > 0) {
      if (this.options.outMap) {
        Promise.all(
          data.entries.map(i => {
            return this.options.outMap(i[0], i[1])
          })
        )
          .then(changed => {
            this.sendSync(data.added, changed)
          })
          .catch(e => {
            this.error(e)
          })
      } else {
        this.sendSync(data.added, data.entries)
      }
    } else {
      this.setState('synchronized')
    }
  }

  setLastSent(value) {
    if (this.lastSent < value) {
      this.lastSent = value
      this.log.store.setLastSynced({ sent: value })
    }
  }

  setLastReceived(value) {
    if (this.lastReceived < value) this.lastReceived = value
    this.log.store.setLastSynced({ received: value })
  }

  now() {
    return Date.now()
  }

  async initialize() {
    let [synced, added] = await Promise.all([
      this.log.store.getLastSynced(),
      this.log.store.getLastAdded()
    ])
    this.initialized = true
    this.lastSent = synced.sent
    this.lastReceived = synced.received
    this.lastAddedCache = added
    if (this.connection.connected) this.onConnect()
  }

  sendDuilian() {
    this.send(['duilian', Object.keys(DUILIANS)[0]])
  }

  duilianMessage(line) {
    if (DUILIANS[line]) {
      this.send(['duilian', DUILIANS[line]])
    }
  }
}

BaseNode.prototype.sendConnect = sendConnect
BaseNode.prototype.sendConnected = sendConnected
BaseNode.prototype.connectMessage = connectMessage
BaseNode.prototype.connectedMessage = connectedMessage

BaseNode.prototype.sendSync = sendSync
BaseNode.prototype.sendSynced = sendSynced
BaseNode.prototype.syncMessage = syncMessage
BaseNode.prototype.syncedMessage = syncedMessage

BaseNode.prototype.sendPing = sendPing
BaseNode.prototype.pingMessage = pingMessage
BaseNode.prototype.pongMessage = pongMessage

BaseNode.prototype.sendDebug = sendDebug
BaseNode.prototype.debugMessage = debugMessage

BaseNode.prototype.sendError = sendError
BaseNode.prototype.errorMessage = errorMessage

BaseNode.prototype.sendHeaders = sendHeaders
BaseNode.prototype.headersMessage = headersMessage

const DUILIANS = {
  金木水火土: '板城烧锅酒'
}
