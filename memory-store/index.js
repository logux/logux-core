import { isFirstOlder } from '../is-first-older/index.js'

function checkIndex(store, index) {
  if (!store.indexes[index]) {
    store.indexes[index] = { added: [], entries: [] }
  }
}

function forEachIndex(meta, cb) {
  let indexes = meta.indexes
  if (isDefined(indexes) && indexes.length > 0) {
    for (let index of indexes) {
      cb(index)
    }
  }
}

function insert(store, entry) {
  store.lastAdded += 1
  entry[1].added = store.lastAdded
  store.added.push(entry)
  forEachIndex(entry[1], index => {
    checkIndex(store, index)
    store.indexes[index].added.push(entry)
  })
  return Promise.resolve(entry[1])
}

function eject(store, meta) {
  let added = meta.added
  let start = 0
  let end = store.added.length - 1
  while (start <= end) {
    let middle = (end + start) >> 1
    let otherAdded = store.added[middle][1].added
    if (otherAdded < added) {
      start = middle + 1
    } else if (otherAdded > added) {
      end = middle - 1
    } else {
      store.added.splice(middle, 1)
      break
    }
  }
}

function find(list, id) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (id === list[i][1].id) {
      return i
    }
  }
  return -1
}

function isDefined(value) {
  return typeof value !== 'undefined'
}

export class MemoryStore {
  constructor() {
    this.entries = []
    this.added = []
    this.indexes = {}
    this.lastReceived = 0
    this.lastAdded = 0
    this.lastSent = 0
  }

  async add(action, meta) {
    let entry = [action, meta]
    let id = meta.id

    let list = this.entries
    for (let i = 0; i < list.length; i++) {
      let [, otherMeta] = list[i]
      if (id === otherMeta.id) {
        return false
      } else if (!isFirstOlder(otherMeta, meta)) {
        forEachIndex(meta, index => {
          checkIndex(this, index)
          let indexList = this.indexes[index].entries
          let j = indexList.findIndex(item => !isFirstOlder(item[1], meta))
          indexList.splice(j, 0, entry)
        })
        list.splice(i, 0, entry)
        return insert(this, entry)
      }
    }

    forEachIndex(meta, index => {
      checkIndex(this, index)
      this.indexes[index].entries.push(entry)
    })
    list.push(entry)
    return insert(this, entry)
  }

  async byId(id) {
    let created = find(this.entries, id)
    if (created === -1) {
      return [null, null]
    } else {
      let [action, meta] = this.entries[created]
      return [action, meta]
    }
  }

  async remove(id, created) {
    if (typeof created === 'undefined') {
      created = find(this.entries, id)
      if (created === -1) return Promise.resolve(false)
    }

    let entry = [this.entries[created][0], this.entries[created][1]]
    forEachIndex(entry[1], index => {
      let entries = this.indexes[index].entries
      let indexed = find(entries, id)
      if (indexed !== -1) entries.splice(indexed, 1)
    })
    this.entries.splice(created, 1)

    forEachIndex(entry[1], index => {
      eject(this.indexes[index], entry[1])
    })
    eject(this, entry[1])

    return entry
  }

  async get(opts = {}) {
    let index = opts.index
    let store = this
    let entries
    if (index) {
      store = this.indexes[index] || { added: [], entries: [] }
    }
    if (opts.order === 'created') {
      entries = store.entries
    } else {
      entries = store.added
    }
    return { entries: entries.slice(0) }
  }

  async changeMeta(id, diff) {
    let index = find(this.entries, id)
    if (index === -1) {
      return false
    } else {
      let meta = this.entries[index][1]
      for (let key in diff) meta[key] = diff[key]
      return true
    }
  }

  async removeReason(reason, criteria, callback) {
    let removed = []

    if (criteria.id) {
      let index = find(this.entries, criteria.id)
      if (index !== -1) {
        let meta = this.entries[index][1]
        let reasonPos = meta.reasons.indexOf(reason)
        if (reasonPos !== -1) {
          meta.reasons.splice(reasonPos, 1)
          if (meta.reasons.length === 0) {
            callback(this.entries[index][0], meta)
            this.remove(criteria.id)
          }
        }
      }
    } else {
      this.entries = this.entries.filter(([action, meta]) => {
        let c = criteria

        let reasonPos = meta.reasons.indexOf(reason)
        if (reasonPos === -1) {
          return true
        }
        if (isDefined(c.olderThan) && !isFirstOlder(meta, c.olderThan)) {
          return true
        }
        if (isDefined(c.youngerThan) && !isFirstOlder(c.youngerThan, meta)) {
          return true
        }
        if (isDefined(c.minAdded) && meta.added < c.minAdded) {
          return true
        }
        if (isDefined(c.maxAdded) && meta.added > c.maxAdded) {
          return true
        }

        meta.reasons.splice(reasonPos, 1)
        if (meta.reasons.length === 0) {
          callback(action, meta)
          removed.push(meta)
          return false
        } else {
          return true
        }
      })

      let removedAdded = removed.map(m => m.added)
      let removing = i => !removedAdded.includes(i[1].added)
      this.added = this.added.filter(removing)

      for (let meta of removed) {
        forEachIndex(meta, i => {
          this.indexes[i].entries = this.indexes[i].entries.filter(removing)
          this.indexes[i].added = this.indexes[i].added.filter(removing)
        })
      }
    }
  }

  async clean() {
    this.entries = []
    this.added = []
    this.indexes = {}
    this.lastReceived = 0
    this.lastAdded = 0
    this.lastSent = 0
  }

  async getLastAdded() {
    return this.lastAdded
  }

  async getLastSynced() {
    return {
      received: this.lastReceived,
      sent: this.lastSent
    }
  }

  async setLastSynced(values) {
    if (typeof values.sent !== 'undefined') {
      this.lastSent = values.sent
    }
    if (typeof values.received !== 'undefined') {
      this.lastReceived = values.received
    }
  }
}
