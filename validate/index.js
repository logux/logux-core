import { LoguxError } from '../logux-error/index.js'

function isNumber(value) {
  return typeof value === 'number'
}

function isString(value) {
  return typeof value === 'string'
}

function isObject(value) {
  return typeof value === 'object' && typeof value.length !== 'number'
}

function isArray(value) {
  return Array.isArray(value)
}

function isTwoNumbers(value) {
  return (
    isArray(value) &&
    value.length === 2 &&
    isNumber(value[0]) &&
    isNumber(value[1])
  )
}

function isID(value) {
  return (
    isArray(value) &&
    value.length === 3 &&
    isNumber(value[0]) &&
    isString(value[1]) &&
    isNumber(value[2])
  )
}

function isMeta(value) {
  return (
    isObject(value) &&
    isNumber(value.time) &&
    (isNumber(value.id) || isTwoNumbers(value.id) || isID(value.id))
  )
}

let validators = {
  connect(msg) {
    return (
      isNumber(msg[1]) &&
      isString(msg[2]) &&
      isNumber(msg[3]) &&
      (msg.length === 4 || (msg.length === 5 && isObject(msg[4])))
    )
  },

  connected(msg) {
    return (
      isNumber(msg[1]) &&
      isString(msg[2]) &&
      isTwoNumbers(msg[3]) &&
      (msg.length === 4 || (msg.length === 5 && isObject(msg[4])))
    )
  },

  ping(msg) {
    return msg.length === 2 && isNumber(msg[1])
  },

  pong(msg) {
    return msg.length === 2 && isNumber(msg[1])
  },

  sync(msg) {
    if (!isNumber(msg[1])) return false
    if (msg.length % 2 !== 0) return false

    for (let i = 2; i < msg.length; i++) {
      if (i % 2 === 0) {
        if (!isObject(msg[i]) || !isString(msg[i].type)) return false
      } else if (!isMeta(msg[i])) {
        return false
      }
    }

    return true
  },

  synced(msg) {
    return msg.length === 2 && isNumber(msg[1])
  },

  error(msg) {
    return (msg.length === 2 || msg.length === 3) && isString(msg[1])
  },

  duilian(msg) {
    return msg.length === 2 && isString(msg[1])
  },

  debug(msg) {
    return (
      msg.length === 3 &&
      isString(msg[1]) &&
      msg[1] === 'error' &&
      isString(msg[2])
    )
  },

  headers(msg) {
    return msg.length === 2 && isObject(msg[1])
  }
}

function wrongFormat(node, msg) {
  node.sendError(new LoguxError('wrong-format', JSON.stringify(msg)))
  node.connection.disconnect('error')
  return false
}

export function validate(node, msg) {
  if (!isArray(msg)) return wrongFormat(node, msg)

  let name = msg[0]
  if (!isString(name)) return wrongFormat(node, msg)

  let validator = validators[name]
  if (!validator || !node[name + 'Message']) {
    node.sendError(new LoguxError('unknown-message', name))
    node.connection.disconnect('error')
    return false
  }

  if (!validator(msg)) {
    return wrongFormat(node, msg)
  } else {
    return true
  }
}
