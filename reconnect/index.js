const DEFAULT_OPTIONS = {
  minDelay: 1000,
  maxDelay: 5000,
  attempts: Infinity
}

const FATAL_ERRORS = [
  'wrong-protocol',
  'wrong-subprotocol',
  'wrong-credentials'
]

export class Reconnect {
  constructor(connection, options = {}) {
    this.connection = connection
    this.options = { ...DEFAULT_OPTIONS, ...options }

    this.reconnecting = connection.connected
    this.connecting = false
    this.attempts = 0

    this.unbind = [
      this.connection.on('message', msg => {
        if (msg[0] === 'error' && FATAL_ERRORS.includes(msg[1])) {
          this.reconnecting = false
        }
      }),
      this.connection.on('connecting', () => {
        this.connecting = true
      }),
      this.connection.on('connect', () => {
        this.attempts = 0
        this.connecting = false
      }),
      this.connection.on('disconnect', () => {
        this.connecting = false
        if (this.reconnecting) this.reconnect()
      }),
      () => {
        clearTimeout(this.timer)
      }
    ]

    let visibility = () => {
      if (this.reconnecting && !this.connected && !this.connecting) {
        if (typeof document !== 'undefined' && !document.hidden) this.connect()
      }
    }
    let connect = () => {
      if (this.reconnecting && !this.connected && !this.connecting) {
        if (navigator.onLine) this.connect()
      }
    }
    let disconnect = () => {
      this.disconnect('freeze')
    }
    if (
      typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      document.addEventListener &&
      window.addEventListener
    ) {
      document.addEventListener('visibilitychange', visibility, false)
      window.addEventListener('focus', connect, false)
      window.addEventListener('online', connect, false)
      window.addEventListener('resume', connect, false)
      window.addEventListener('freeze', disconnect, false)
      this.unbind.push(() => {
        document.removeEventListener('visibilitychange', visibility, false)
        window.removeEventListener('focus', connect, false)
        window.removeEventListener('online', connect, false)
        window.removeEventListener('resume', connect, false)
        window.removeEventListener('freeze', disconnect, false)
      })
    }
  }

  connect() {
    this.attempts += 1
    this.reconnecting = true
    return this.connection.connect()
  }

  disconnect(reason) {
    if (reason !== 'timeout' && reason !== 'error' && reason !== 'freeze') {
      this.reconnecting = false
    }
    return this.connection.disconnect(reason)
  }

  destroy() {
    for (let i of this.unbind) i()
    this.disconnect('destroy')
  }

  reconnect() {
    if (this.attempts > this.options.attempts - 1) {
      this.reconnecting = false
      this.attempts = 0
      return
    }

    let delay = this.nextDelay()
    this.timer = setTimeout(() => {
      if (this.reconnecting && !this.connecting && !this.connected) {
        this.connect()
      }
    }, delay)
  }

  send(...args) {
    return this.connection.send(...args)
  }

  on(...args) {
    return this.connection.on(...args)
  }

  nextDelay() {
    let base = this.options.minDelay * 2 ** this.attempts
    let rand = Math.random()
    let deviation = Math.floor(rand * 0.5 * base)
    if (Math.floor(rand * 10) === 1) deviation = -deviation
    return Math.min(base + deviation, this.options.maxDelay) || 0
  }

  get connected() {
    return this.connection.connected
  }

  get emitter() {
    return this.connection.emitter
  }
}
