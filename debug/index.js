export function sendDebug(type, data) {
  this.send(['debug', type, data])
}

export function debugMessage(type, data) {
  this.emitter.emit('debug', type, data)
}
