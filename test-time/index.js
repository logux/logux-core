import { TestLog } from '../test-log/index.js'

export class TestTime {
  static getLog(opts) {
    let time = new TestTime()
    return time.nextLog(opts)
  }

  constructor() {
    this.lastId = 0
    this.lastTime = 0
  }

  nextLog(opts) {
    this.lastId += 1
    return new TestLog(this, this.lastId, opts)
  }
}
