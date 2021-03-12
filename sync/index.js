export function sendSync(added, entries) {
  this.startTimeout()

  let data = []
  for (let [action, originMeta] of entries) {
    let meta = {}
    for (let key in originMeta) {
      if (key === 'id') {
        meta.id = originMeta.id.split(' ')
      } else if (key !== 'added') {
        meta[key] = originMeta[key]
      }
    }

    if (this.timeFix) meta.time -= this.timeFix
    meta.id[0] = parseInt(meta.id[0]) - this.baseTime
    meta.id[2] = parseInt(meta.id[2])
    meta.time -= this.baseTime

    if (meta.id[1] === this.localNodeId) {
      if (meta.id[2] === 0) {
        meta.id = meta.id[0]
      } else {
        meta.id = [meta.id[0], meta.id[2]]
      }
    }

    data.unshift(action, meta)
  }

  this.syncing += 1
  this.setState('sending')
  this.send(['sync', added].concat(data))
}

export function sendSynced(added) {
  this.send(['synced', added])
}

export async function syncMessage(added, ...data) {
  let promises = []

  for (let i = 0; i < data.length - 1; i += 2) {
    let action = data[i]
    let meta = data[i + 1]

    if (typeof meta.id === 'number') {
      meta.id = meta.id + this.baseTime + ' ' + this.remoteNodeId + ' ' + 0
    } else {
      meta.id[0] = meta.id[0] + this.baseTime
      if (meta.id.length === 2) {
        meta.id = meta.id[0] + ' ' + this.remoteNodeId + ' ' + meta.id[1]
      } else {
        meta.id = meta.id.join(' ')
      }
    }

    meta.time = meta.time + this.baseTime
    if (this.timeFix) meta.time = meta.time + this.timeFix

    let process = Promise.resolve([action, meta])

    if (this.options.inMap) {
      process = process
        .then(([action2, meta2]) => {
          return this.options.inMap(action2, meta2)
        })
        .catch(e => {
          this.error(e)
        })
    }

    process
      .then(filtered => {
        if (filtered && this.options.inFilter) {
          return this.options
            .inFilter(...filtered)
            .then(res => {
              return res ? filtered : false
            })
            .catch(e => {
              this.error(e)
            })
        } else {
          return filtered
        }
      })
      .then(changed => {
        if (!changed) return false
        if (this.received) this.received[changed[1].id] = true
        return this.log.add(changed[0], changed[1])
      })

    promises.push(process)
  }

  await Promise.all(promises)
  this.setLastReceived(added)
  this.sendSynced(added)
}

export function syncedMessage(synced) {
  this.endTimeout()
  this.setLastSent(synced)
  if (this.syncing > 0) this.syncing -= 1
  if (this.syncing === 0) {
    this.setState('synchronized')
  }
}
