import { createNanoEvents } from 'nanoevents'

export class WsConnection {
  constructor(url, Class, opts) {
    this.connected = false
    this.emitter = createNanoEvents()
    if (Class) {
      this.Class = Class
    } else if (typeof WebSocket !== 'undefined') {
      this.Class = WebSocket
    } else {
      throw new Error('No WebSocket support')
    }
    this.url = url
    this.opts = opts
  }

  init(ws) {
    ws.onerror = event => {
      this.emitter.emit('error', event.error || new Error('WS Error'))
    }

    ws.onclose = () => {
      this.onclose()
    }

    ws.onmessage = event => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        this.error(event.data)
        return
      }
      this.emitter.emit('message', data)
    }

    this.ws = ws
  }

  connect() {
    if (this.ws) return Promise.resolve()

    this.emitter.emit('connecting')
    this.init(new this.Class(this.url, undefined, this.opts))

    return new Promise(resolve => {
      this.ws.onopen = () => {
        this.connected = true
        this.emitter.emit('connect')
        resolve()
      }
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = undefined
      this.ws.close()
      this.onclose()
    }
  }

  on(event, listener) {
    return this.emitter.on(event, listener)
  }

  send(message) {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      this.emitter.emit('error', new Error('WS was closed'))
    }
  }

  error(message) {
    let err = new Error('Wrong message format')
    err.received = message
    this.emitter.emit('error', err)
  }

  onclose() {
    if (this.ws) {
      this.connected = false
      this.emitter.emit('disconnect')
      this.ws = undefined
    }
  }
}
