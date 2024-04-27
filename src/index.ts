import browser, { Runtime } from 'webextension-polyfill'
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
      tabId,
    }: {
      staleTime?: number
      tabId?: number
    } = {}
  ): Promise<Config[Key]['response']> {
    const staleTime = overrideStaleTime ?? this.globalStaleTime
    const cache = this.getMessageCache(message)

    if (cache && Date.now() - cache.timestamp < staleTime) {
      return cache.data
    }

    let pendingResponse: Promise<any>
    if (tabId) {
      pendingResponse = browser.tabs.sendMessage(tabId, { ...message })
    } else {
      pendingResponse = browser.runtime.sendMessage({ ...message })
    }

    const resp = (await pendingResponse) as
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
    { tabId }: { tabId?: number } = {}
  ) {
    if (tabId) {
      return browser.tabs.sendMessage(tabId, { ...message })
    }
    return browser.runtime.sendMessage({ ...message })
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
  public getMessageCache<Key extends keyof Config>(
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
    const handler = (
      message: any,
      sender: Runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        typeof message.type !== 'string'
      ) {
        return
      }

      const sendError = (error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'An error occurred'
        const stack = error instanceof Error ? error.stack : undefined

        sendResponse({
          type: 'error',
          message,
          stack,
        })
      }

      let response: any
      try {
        // @ts-expect-error this message type can still be something other then keyof Config
        response = resolvers[message.type]?.(message, sender)
      } catch (e) {
        sendError(e)
        return
      }
      if (response && 'then' in response) {
        response.then(sendResponse).catch(sendError)
        return true
      } else if (response) {
        sendResponse(response)
      }
    }

    browser.runtime.onMessage.addListener(handler)
    return () => {
      browser.runtime.onMessage.removeListener(handler)
    }
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
