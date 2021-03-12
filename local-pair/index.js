import { createNanoEvents } from 'nanoevents'

class LocalConnection {
  constructor(pair, type) {
    this.connected = false
    this.emitter = createNanoEvents()
    this.type = type
    this.pair = pair
  }

  other() {
    if (this.type === 'left') {
      return this.pair.right
    } else {
      return this.pair.left
    }
  }

  on(event, listener) {
    return this.emitter.on(event, listener)
  }

  connect() {
    if (this.connected) {
      throw new Error('Connection already established')
    } else {
      this.emitter.emit('connecting')
      return new Promise(resolve => {
        setTimeout(() => {
          this.other().connected = true
          this.connected = true
          this.other().emitter.emit('connect')
          this.emitter.emit('connect')
          resolve()
        }, this.pair.delay)
      })
    }
  }

  disconnect(reason) {
    if (!this.connected) {
      throw new Error('Connection already finished')
    } else {
      this.connected = false
      this.emitter.emit('disconnect', reason)
      return new Promise(resolve => {
        setTimeout(() => {
          this.other().connected = false
          this.other().emitter.emit('disconnect')
          resolve()
        }, 1)
      })
    }
  }

  send(message) {
    if (this.connected) {
      setTimeout(() => {
        this.other().emitter.emit('message', message)
      }, this.pair.delay)
    } else {
      throw new Error('Connection should be started before sending a message')
    }
  }
}

export class LocalPair {
  constructor(delay = 1) {
    this.delay = delay
    this.left = new LocalConnection(this, 'left')
    this.right = new LocalConnection(this, 'right')
  }
}
