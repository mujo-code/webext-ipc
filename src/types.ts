import type { Runtime } from 'webextension-polyfill'

export type MessagesConfig<Keys extends string[]> = {
  [Key in Keys[number]]: {
    message: { type: Key }
    response: { type: `${Key}Response` } | void
  }
}

export type MessageResolvers<Config extends MessagesConfig<string[]>> = {
  [Key in keyof Config]?: (
    message: Config[Key]['message'],
    sender: Runtime.MessageSender
  ) => Config[Key]['response'] | Promise<Config[Key]['response']>
}

export type ErrorResponseMessage = {
  type: 'error'
  message: string
  stack?: string
}
