export function sendError(error) {
  let message = ['error', error.type]
  if (typeof error.options !== 'undefined') message.push(error.options)
  this.send(message)

  this.emitter.emit('clientError', error)
}

export function errorMessage(type, options) {
  this.syncError(type, options, true)
}
