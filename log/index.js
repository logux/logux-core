import { createNanoEvents } from 'nanoevents'

export function actionEvents(emitter, event, action, meta) {
  if (action.id) {
    emitter.emit(`${event}-${action.type}-${action.id}`, action, meta)
  }
  emitter.emit(`${event}-${action.type}-`, action, meta)
  emitter.emit(event, action, meta)
}

export class Log {
  constructor(opts = {}) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof opts.nodeId === 'undefined') {
        throw new Error('Expected node ID')
      }
      if (typeof opts.store !== 'object') {
        throw new Error('Expected store')
      }
      if (opts.nodeId.includes(' ')) {
        throw new Error('Space is prohibited in node ID')
      }
    }

    this.nodeId = opts.nodeId

    this.lastTime = 0
    this.sequence = 0

    this.store = opts.store

    this.emitter = createNanoEvents()
  }

  on(event, listener) {
    return this.emitter.on(event, listener)
  }

  type(type, listener, opts = {}) {
    let event = opts.event || 'add'
    let id = opts.id || ''
    return this.emitter.on(`${event}-${type}-${id}`, listener)
  }

  async add(action, meta = {}) {
    if (typeof action.type === 'undefined') {
      throw new Error('Expected "type" in action')
    }

    let newId = false
    if (typeof meta.id === 'undefined') {
      newId = true
      meta.id = this.generateId()
    }

    if (typeof meta.time === 'undefined') {
      meta.time = parseInt(meta.id)
    }

    if (typeof meta.reasons === 'undefined') {
      meta.reasons = []
    }

    if (process.env.NODE_ENV !== 'production') {
      if (!Array.isArray(meta.reasons)) {
        throw new Error('Expected "reasons" to be an array of strings')
      }

      for (let reason of meta.reasons) {
        if (typeof reason !== 'string') {
          throw new Error('Expected "reasons" to be an array of strings')
        }
      }

      if (typeof meta.indexes !== 'undefined') {
        if (!Array.isArray(meta.indexes)) {
          throw new Error('Expected "indexes" to be an array of strings')
        }

        for (let index of meta.indexes) {
          if (typeof index !== 'string') {
            throw new Error('Expected "indexes" to be an array of strings')
          }
        }
      }
    }

    actionEvents(this.emitter, 'preadd', action, meta)

    if (meta.keepLast) {
      this.removeReason(meta.keepLast, { olderThan: meta })
      meta.reasons.push(meta.keepLast)
    }

    if (meta.reasons.length === 0 && newId) {
      actionEvents(this.emitter, 'add', action, meta)
      actionEvents(this.emitter, 'clean', action, meta)
      return meta
    } else if (meta.reasons.length === 0) {
      let [action2] = await this.store.byId(meta.id)
      if (action2) {
        return false
      } else {
        actionEvents(this.emitter, 'add', action, meta)
        actionEvents(this.emitter, 'clean', action, meta)
        return meta
      }
    } else {
      let addedMeta = await this.store.add(action, meta)
      if (addedMeta === false) {
        return false
      } else {
        actionEvents(this.emitter, 'add', action, meta)
        return addedMeta
      }
    }
  }

  generateId() {
    let now = Date.now()
    if (now <= this.lastTime) {
      now = this.lastTime
      this.sequence += 1
    } else {
      this.lastTime = now
      this.sequence = 0
    }
    return now + ' ' + this.nodeId + ' ' + this.sequence
  }

  each(opts, callback) {
    if (!callback) {
      callback = opts
      opts = { order: 'created' }
    }

    let store = this.store
    return new Promise(resolve => {
      async function nextPage(get) {
        let page = await get()
        let result
        for (let i = page.entries.length - 1; i >= 0; i--) {
          let entry = page.entries[i]
          result = callback(entry[0], entry[1])
          if (result === false) break
        }

        if (result === false || !page.next) {
          resolve()
        } else {
          nextPage(page.next)
        }
      }

      nextPage(store.get.bind(store, opts))
    })
  }

  async changeMeta(id, diff) {
    for (let k in diff) {
      if (
        k === 'id' ||
        k === 'added' ||
        k === 'time' ||
        k === 'subprotocol' ||
        k === 'indexes'
      ) {
        throw new Error('Meta "' + k + '" is read-only')
      }
    }

    if (diff.reasons && diff.reasons.length === 0) {
      let entry = await this.store.remove(id)
      if (entry) {
        for (let k in diff) entry[1][k] = diff[k]
        actionEvents(this.emitter, 'clean', entry[0], entry[1])
      }
      return !!entry
    } else {
      return this.store.changeMeta(id, diff)
    }
  }

  removeReason(reason, criteria = {}) {
    return this.store.removeReason(reason, criteria, (action, meta) => {
      actionEvents(this.emitter, 'clean', action, meta)
    })
  }

  byId(id) {
    return this.store.byId(id)
  }
}
