import { ServerConnection, Message } from '../index.js'
import { jest } from '@jest/globals'
import WebSocket from 'ws'

function privateMethods(obj: object): any {
  return obj
}

function prepareWs(): WebSocket {
  let ws = new WebSocket('ws://example.com/')
  privateMethods(ws)._readyState = ws.OPEN
  return ws
}

it('throws on connect method call', () => {
  let connection = new ServerConnection(prepareWs())
  expect(() => {
    connection.connect()
  }).toThrow(/reconnect/)
})

it('emits connection states', () => {
  let connection = new ServerConnection(prepareWs())

  let states: string[] = []
  connection.on('disconnect', () => {
    states.push('disconnect')
  })

  expect(states).toEqual([])
  expect(connection.connected).toBe(true)

  connection.ws.emit('close')
  expect(states).toEqual(['disconnect'])
  expect(connection.connected).toBe(false)
})

it('emits error on wrong format', () => {
  let connection = new ServerConnection(prepareWs())
  let error: Error | undefined
  connection.on('error', err => {
    error = err
  })

  connection.ws.emit('message', '{')
  if (typeof error === 'undefined') throw new Error('Error was no set')
  expect(error.message).toEqual('Wrong message format')
  expect(privateMethods(error).received).toEqual('{')
})

it('closes WebSocket', () => {
  let ws = prepareWs()
  jest.spyOn(ws, 'close').mockImplementation(() => {
    ws.emit('close')
  })
  let connection = new ServerConnection(ws)

  connection.disconnect()
  expect(ws.close).toHaveBeenCalledTimes(1)
  expect(connection.connected).toBe(false)
})

it('receives messages', () => {
  let connection = new ServerConnection(prepareWs())

  let received: Message[] = []
  connection.on('message', msg => {
    received.push(msg)
  })

  connection.ws.emit('message', '["ping",1]')
  expect(received).toEqual([['ping', 1]])
})

it('sends messages', () => {
  let sent: string[] = []
  let ws = prepareWs()
  ws.send = (msg: string) => {
    sent.push(msg)
  }
  let connection = new ServerConnection(ws)

  connection.send(['ping', 1])
  expect(sent).toEqual(['["ping",1]'])
})

it('does not send to closed socket', () => {
  let sent: string[] = []
  let ws = prepareWs()
  ws.send = (msg: string) => {
    sent.push(msg)
  }

  let connection = new ServerConnection(ws)

  let errors: string[] = []
  connection.on('error', e => {
    errors.push(e.message)
  })

  privateMethods(connection.ws)._readyState = 2

  connection.send(['ping', 1])
  expect(sent).toEqual([])
  expect(errors).toEqual(['WS was closed'])
})
