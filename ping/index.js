export function sendPing() {
  this.startTimeout()
  this.send(['ping', this.lastAddedCache])
  if (this.pingTimeout) clearTimeout(this.pingTimeout)
}

export function pingMessage(synced) {
  this.setLastReceived(synced)
  if (this.connected && this.authenticated) {
    this.send(['pong', this.lastAddedCache])
  }
}

export function pongMessage(synced) {
  this.setLastReceived(synced)
  this.endTimeout()
}
