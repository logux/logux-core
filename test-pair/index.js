import { LocalPair } from '../local-pair/index.js'

function clone(obj) {
  if (Array.isArray(obj)) {
    return obj.map(i => clone(i))
  } else if (typeof obj === 'object') {
    let cloned = {}
    for (let i in obj) {
      cloned[i] = clone(obj[i])
    }
    return cloned
  } else {
    return obj
  }
}

export class TestPair extends LocalPair {
  constructor(delay) {
    super(delay)

    this.leftNode = undefined
    this.rightNode = undefined
    this.clear()

    this.unbind = [
      this.left.on('connect', () => {
        this.leftEvents.push(['connect'])
        if (this.waiting) this.waiting('left')
      }),
      this.right.on('connect', () => {
        this.rightEvents.push(['connect'])
        if (this.waiting) this.waiting('right')
      }),

      this.left.on('message', msg => {
        let cloned = clone(msg)
        this.rightSent.push(cloned)
        this.leftEvents.push(['message', cloned])
        if (this.waiting) this.waiting('left')
      }),
      this.right.on('message', msg => {
        let cloned = clone(msg)
        this.leftSent.push(cloned)
        this.rightEvents.push(['message', cloned])
        if (this.waiting) this.waiting('right')
      }),

      this.left.on('disconnect', reason => {
        this.leftEvents.push(['disconnect', reason])
        if (this.waiting) this.waiting('left')
      }),
      this.right.on('disconnect', () => {
        this.rightEvents.push(['disconnect'])
        if (this.waiting) this.waiting('right')
      })
    ]
  }

  clear() {
    this.leftSent = []
    this.rightSent = []
    this.leftEvents = []
    this.rightEvents = []
  }

  wait(receiver) {
    return new Promise(resolve => {
      this.waiting = from => {
        if (!receiver || from === receiver) {
          this.waiting = false
          resolve(this)
        }
      }
    })
  }
}
