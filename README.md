# Webext IPC

This is a simple library that will allow for communication between a web extensions background and client scripts. The communication is all typed, and allows for things like errors handling. There is a resolver like interface to handle messages in an encapsulated way.

## Usage

### Background

The background script can handle messages but also send them as well! The library is universal, so the same code can be used in both the background and client scripts. Here is a example of a background script handling some messages ( common ):

```typescript
import { WebExtIPC } from 'webext-ipc'

interface SharedMessages {
  ping: {
    message: { type: 'ping' }
    response: { type: 'pingResponse'; pong: boolean }
  }
}

const ipc = WebExtIPC.from<SharedMessages>()

ipc.addMessageResolvers({
  ping: async (message) => {
    return { type: 'pingResponse', pong: true }
  },
})
```

### Client

The client script can also handle messages, but also send them as well! Here is the client code sending some messages.

```typescript
import { WebExtIPC } from 'webext-ipc'

const ipc = WebExtIPC.from<SharedMessages>()

ipc.sendMessage({ type: 'ping' }).then((response) => {
  console.log(response.pong)
})
```
