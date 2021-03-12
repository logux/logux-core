import { Log, Meta, MemoryStore, ClientNode, LocalPair } from '../index.js'

type MyMeta = Meta & {
  extra: number
}

type Headers = {
  lang: string
}

let log = new Log<MyMeta>({ nodeId: 'client', store: new MemoryStore() })
let pair = new LocalPair()

let client = new ClientNode<Headers, Log<MyMeta>>('client', log, pair.left)

// THROWS { locale: string; }' is not assignable to parameter of type 'Headers'
client.setLocalHeaders({ locale: 'ru' })

// THROWS Type 'string' is not assignable to type 'number | undefined'.
client.log.add({ type: 'A' }, { extra: '1' })

function sayHi(lang: string) {
  console.log('Hi, ' + lang)
}

// THROWS 'string | undefined' is not assignable to parameter of type 'string'.
sayHi(client.remoteHeaders.lang)
// THROWS Property 'locale' does not exist on type 'Headers'.
client.on('headers', ({ locale }) => {
  sayHi(locale)
})
