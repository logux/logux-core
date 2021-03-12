import { delay } from 'nanodelay'

import { ServerConnection, WsConnection, Message } from '../index.js'
import WebSocket from 'ws'

let wss: WebSocket.Server
afterEach(() => {
  wss.close()
})

function connect(
  server: WebSocket.Server,
  client: WsConnection
): Promise<ServerConnection> {
  return new Promise(resolve => {
    server.on('connection', ws => {
      let connection = new ServerConnection(ws)
      resolve(connection)
    })
    client.connect()
  })
}

it('works in real protocol', async () => {
  wss = new WebSocket.Server({ port: 8081 })

  let client = new WsConnection('ws://0.0.0.0:8081', WebSocket)
  let clientReceived: Message[] = []
  client.on('message', msg => {
    clientReceived.push(msg)
  })

  let server = await connect(wss, client)

  let serverReceived: Message[] = []
  server.on('message', msg => {
    serverReceived.push(msg)
  })

  await delay(100)
  expect(server.connected).toBe(true)
  expect(client.connected).toBe(true)

  client.send(['ping', 1])
  await delay(100)
  expect(serverReceived).toEqual([['ping', 1]])

  server.send(['pong', 1])
  await delay(100)
  expect(clientReceived).toEqual([['pong', 1]])

  server.disconnect()
  await delay(100)
  expect(server.connected).toBe(false)
  expect(client.connected).toBe(false)
})
