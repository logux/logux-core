import { LoguxError } from '../logux-error/index.js'

async function auth(node, nodeId, token, callback) {
  if (!node.options.auth) {
    node.authenticated = true
    callback()
    return
  }

  try {
    let access = await node.options.auth(nodeId, token, node.remoteHeaders)
    if (access) {
      node.authenticated = true
      callback()
      for (let i = 0; i < node.unauthenticated.length; i++) {
        node.onMessage(node.unauthenticated[i])
      }
      node.unauthenticated = []
    } else {
      node.sendError(new LoguxError('wrong-credentials'))
      node.destroy()
    }
  } catch (e) {
    if (e.name === 'LoguxError') {
      node.sendError(e)
      node.destroy()
    } else {
      node.error(e)
    }
  }
}

function checkProtocol(node, ver) {
  node.remoteProtocol = ver

  if (ver >= node.minProtocol) {
    return true
  } else {
    node.sendError(
      new LoguxError('wrong-protocol', {
        supported: node.minProtocol,
        used: ver
      })
    )
    node.destroy()
    return false
  }
}

function emitEvent(node) {
  try {
    node.emitter.emit('connect')
  } catch (e) {
    if (e.name === 'LoguxError') {
      node.sendError(e)
      return false
    } else {
      throw e
    }
  }
  return true
}

export async function sendConnect() {
  let message = [
    'connect',
    this.localProtocol,
    this.localNodeId,
    this.lastReceived
  ]

  let options = {}
  if (this.options.token) {
    if (typeof this.options.token === 'function') {
      options.token = await this.options.token()
    } else {
      options.token = this.options.token
    }
  }
  if (this.options.subprotocol) {
    options.subprotocol = this.options.subprotocol
  }
  if (Object.keys(options).length > 0) message.push(options)

  if (this.options.fixTime) this.connectSended = this.now()

  if (Object.keys(this.localHeaders).length > 0) {
    this.sendHeaders(this.localHeaders)
  }

  this.startTimeout()
  this.send(message)
}

export async function sendConnected(start, end) {
  let message = [
    'connected',
    this.localProtocol,
    this.localNodeId,
    [start, end]
  ]

  let options = {}
  if (this.options.token) {
    if (typeof this.options.token === 'function') {
      options.token = await this.options.token()
    } else {
      options.token = this.options.token
    }
  }
  if (this.options.subprotocol) {
    options.subprotocol = this.options.subprotocol
  }
  if (Object.keys(options).length > 0) message.push(options)

  if (Object.keys(this.localHeaders).length > 0) {
    this.sendHeaders(this.localHeaders)
  }

  this.send(message)
}

export function connectMessage(ver, nodeId, synced, options) {
  let start = this.now()
  if (!options) options = {}

  this.remoteNodeId = nodeId
  if (!checkProtocol(this, ver)) return

  this.remoteSubprotocol = options.subprotocol || '0.0.0'

  if (!emitEvent(this)) {
    this.destroy()
    return
  }

  auth(this, nodeId, options.token, () => {
    this.baseTime = this.now()
    this.sendConnected(start, this.baseTime)
    this.syncSince(synced)
  })
}

export function connectedMessage(ver, nodeId, time, options) {
  if (!options) options = {}

  this.endTimeout()
  this.remoteNodeId = nodeId
  if (!checkProtocol(this, ver)) return

  this.baseTime = time[1]

  if (this.options.fixTime) {
    let now = this.now()
    let authTime = time[1] - time[0]
    let roundTrip = now - this.connectSended - authTime
    this.timeFix = Math.floor(this.connectSended - time[0] + roundTrip / 2)
  }

  this.remoteSubprotocol = options.subprotocol || '0.0.0'

  if (!emitEvent(this)) {
    this.destroy()
    return
  }

  auth(this, nodeId, options.token, () => {
    this.syncSince(this.lastSent)
  })
}
