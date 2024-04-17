import browser from 'webextension-polyfill'
import { ErrorResponseMessage, MessageResolvers, MessagesConfig } from './types'
import { shallowEqual } from './shallow'

export class WebExtIPC<
  Keys extends string[],
  Config extends MessagesConfig<Keys>
> {
  /**
   * This is a weak map that stores the response of a message. The key is the
   * a memoized version of the message, and the value is the response.
   */
  private messageCache: WeakMap<
    Config[keyof Config]['message'],
    { data: Config[keyof Config]['response']; timestamp: number }
  > = new WeakMap()
  /**
   * This is a set that stores the memoized messages. This is used to ensure
   * that we don't store the same message multiple times in the cache.
   */
  private memoizedMessages: Set<Config[keyof Config]['message']> = new Set()
  /**
   * This is the global stale time for all messages. If a message is sent with
   * a stale time, it will take precedence over this value.
   */
  private globalStaleTime: number

  constructor(options: { staleTime?: number } = {}) {
    this.globalStaleTime = options.staleTime ?? 0
  }

  /**
   * sendMessage is a wrapper around browser.runtime.sendMessage that
   * memoizes the response of the message. If the message has already been
   * sent, it will return the memoized response.
   */
  async sendMessage<Key extends keyof Config>(
    message: {
      type: Key
    } & Config[Key]['message'],
    {
      staleTime: overrideStaleTime,
      ...otherOptions
    }: {
      staleTime?: number
    } & browser.Runtime.SendMessageOptionsType = {}
  ): Promise<Config[Key]['response']> {
    const staleTime = overrideStaleTime ?? this.globalStaleTime
    const cache = this.getMessageCache(message)

    if (cache && Date.now() - cache.timestamp < staleTime) {
      return cache.data
    }

    const resp = (await browser.runtime.sendMessage(message, otherOptions)) as
      | Config[Key]['response']
      | ErrorResponseMessage

    if (resp && resp.type === 'error') {
      return Promise.reject(resp)
    }

    this.messageCache.set(message, { data: resp, timestamp: Date.now() })
    return resp
  }

  /**
   * sendResponse is a wrapper around browser.runtime.sendMessage that
   * allows for sending the response of a message. This is needed for times where we want to send the
   * response of a message to a specific tab.
   */
  async sendResponse<Key extends keyof Config>(
    message: {
      // @ts-expect-error there is issue with this just because of keyof has some additional types
      type: `${Key}Response`
    } & Config[Key]['response'],
    options: browser.Runtime.SendMessageOptionsType = {}
  ) {
    return browser.runtime.sendMessage({ ...message }, options)
  }

  /**
   * getMemoizedMessage allows use to have a consistent cache key for messages
   * without requiring the user to pass in the same object reference.
   */
  private getMemoizedMessage(msg: Config[keyof Config]['message']) {
    const memoizedMessage = Array.from(this.memoizedMessages).find((m) =>
      shallowEqual(m, msg)
    )
    if (!!memoizedMessage) {
      return memoizedMessage
    }
    this.memoizedMessages.add(msg)
    return msg
  }

  /**
   * getMessageCache retrieves the response of a message from the cache.
   */
  private getMessageCache<Key extends keyof Config>(
    message: Config[Key]['message']
  ) {
    const memoizedMessage = this.getMemoizedMessage(message)
    return this.messageCache.get(memoizedMessage) as
      | { data: Config[Key]['response']; timestamp: number }
      | undefined
  }

  /**
   * messageResolvers is map of callback to be call when a message is sent, this allows for multiple message
   * handlers to be bound in one call.
   */
  addMessageResolvers(resolvers: MessageResolvers<Config>) {
    browser.runtime.onMessage.addListener(async (message, sender) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        typeof message.type !== 'string'
      ) {
        return
      }

      try {
        // @ts-expect-error this message type can still be something other then keyof Config
        return resolvers[message.type]?.(message, sender)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An error occurred'
        const stack = error instanceof Error ? error.stack : undefined

        return {
          type: 'error',
          message,
          stack,
        }
      }
    })
  }

  /**
   * clearCache clears the message cache.
   */
  clearCache() {
    this.messageCache = new WeakMap()
  }

  /**
   * invalidateCache removes a message from the cache.
   */
  invalidateCache<Key extends keyof Config>(message: Config[Key]['message']) {
    const memoizedMessage = this.getMemoizedMessage(message)
    this.messageCache.delete(memoizedMessage)
  }

  static from = <Config extends MessagesConfig<string[]>>(
    options: { staleTime?: number } = {}
  ) => {
    // @ts-expect-error keyof Config should be a string
    return new WebExtIPC<(keyof Config)[], Config>(options)
  }
}

const ipc = WebExtIPC.from<{
  ping: {
    message: { type: 'ping' }
    response: { type: 'pingResponse'; pong: boolean }
  }
}>({
  staleTime: 1000,
})

ipc.addMessageResolvers({
  ping: async (message) => {
    return { type: 'pingResponse', pong: true }
  },
})
