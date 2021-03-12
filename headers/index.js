export function sendHeaders(data) {
  this.send(['headers', data])
}

export function headersMessage(data) {
  this.remoteHeaders = data
  this.emitter.emit('headers', data)
}
