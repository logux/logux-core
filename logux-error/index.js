export class LoguxError extends Error {
  static describe(type, options) {
    if (type === 'timeout') {
      return 'A timeout was reached (' + options + ' ms)'
    } else if (type === 'wrong-format') {
      return 'Wrong message format in ' + options
    } else if (type === 'unknown-message') {
      return 'Unknown message `' + options + '` type'
    } else if (type === 'bruteforce') {
      return 'Too many wrong authentication attempts'
    } else if (type === 'wrong-protocol') {
      return (
        `Logux supports protocols only from version ${options.supported}` +
        `, but you use ${options.used}`
      )
    } else if (type === 'wrong-subprotocol') {
      return (
        `Only ${options.supported} application subprotocols are ` +
        `supported, but you use ${options.used}`
      )
    } else if (type === 'wrong-credentials') {
      return 'Wrong credentials'
    } else {
      return type
    }
  }

  constructor(type, options, received) {
    super(type)
    this.name = 'LoguxError'
    this.type = type
    this.options = options
    this.description = LoguxError.describe(type, options)
    this.received = !!received

    if (received) {
      this.message = 'Logux received ' + this.type + ' error'
      if (this.description !== this.type) {
        this.message += ' (' + this.description + ')'
      }
    } else {
      this.message = this.description
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LoguxError)
    }
  }
}
