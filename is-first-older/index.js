export function isFirstOlder(firstMeta, secondMeta) {
  if (firstMeta && !secondMeta) {
    return false
  } else if (!firstMeta && secondMeta) {
    return true
  }

  if (firstMeta.time > secondMeta.time) {
    return false
  } else if (firstMeta.time < secondMeta.time) {
    return true
  }

  let first = firstMeta.id.split(' ')
  let second = secondMeta.id.split(' ')

  let firstNode = first[1]
  let secondNode = second[1]
  if (firstNode > secondNode) {
    return false
  } else if (firstNode < secondNode) {
    return true
  }

  let firstCounter = parseInt(first[2])
  let secondCounter = parseInt(second[2])
  if (firstCounter > secondCounter) {
    return false
  } else if (firstCounter < secondCounter) {
    return true
  }

  let firstNodeTime = parseInt(first[0])
  let secondNodeTime = parseInt(second[0])
  if (firstNodeTime > secondNodeTime) {
    return false
  } else if (firstNodeTime < secondNodeTime) {
    return true
  }

  return false
}
