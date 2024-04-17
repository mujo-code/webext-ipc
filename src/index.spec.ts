import { WebExtIPC } from './index'
import browser from 'webextension-polyfill'

jest.mock('webextension-polyfill', () => ({
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  },
}))

describe('webext-ipc', () => {
  let sendMessageMock: jest.Mock
  let addListenerMock: jest.Mock
  beforeEach(() => {
    sendMessageMock = browser.runtime.sendMessage as jest.Mock
    addListenerMock = browser.runtime.onMessage.addListener as jest.Mock
    jest.clearAllMocks()
  })

  it('should create an instance of WebExtIPC', () => {
    const ipc = WebExtIPC.from()
    expect(ipc).toBeDefined()
  })

  it('should allow for sending a message', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>()

    sendMessageMock.mockResolvedValue({
      type: 'testResponse',
      message: 'hello',
    })

    const result = await ipc.sendMessage({ type: 'test', message: 'hello' })

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'test',
      message: 'hello',
    })

    expect(result).toEqual({ type: 'testResponse', message: 'hello' })
  })

  it('should cache a message', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>({ staleTime: 1000 })

    sendMessageMock.mockResolvedValue({
      type: 'testResponse',
      message: 'hello',
    })

    const result = await ipc.sendMessage({ type: 'test', message: 'hello' })

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'test',
      message: 'hello',
    })

    expect(result).toEqual({ type: 'testResponse', message: 'hello' })

    const result2 = await ipc.sendMessage({ type: 'test', message: 'hello' })

    expect(sendMessageMock).toHaveBeenCalledTimes(1)

    expect(result2).toEqual({ type: 'testResponse', message: 'hello' })
  })

  it('should allow for invalidating the cache', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>({ staleTime: 1000 })

    sendMessageMock.mockResolvedValue({
      type: 'testResponse',
      message: 'hello',
    })

    const result = await ipc.sendMessage({ type: 'test', message: 'hello' })

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'test',
      message: 'hello',
    })

    expect(result).toEqual({ type: 'testResponse', message: 'hello' })

    ipc.invalidateCache({ type: 'test', message: 'hello' })

    const result2 = await ipc.sendMessage({ type: 'test', message: 'hello' })

    expect(sendMessageMock).toHaveBeenCalledTimes(2)

    expect(result2).toEqual({ type: 'testResponse', message: 'hello' })
  })

  it('should allow for sending a response', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>()

    ipc.sendResponse(
      {
        type: 'testResponse',
        message: 'hello',
      },
      {
        tabId: 1,
      }
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      {
        type: 'testResponse',
        message: 'hello',
      },
      {
        tabId: 1,
      }
    )
  })

  it('should allow for creating resolver like methods to handle messages', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>()

    const resolver = jest.fn().mockResolvedValue({
      type: 'testResponse',
      message: 'hello',
    })

    ipc.addMessageResolvers({
      test: resolver,
    })

    const message = { type: 'test', message: 'hello' }
    const sender = { tab: { id: 1 } }
    await addListenerMock.mock.calls[0][0](message, sender)
  })

  it('should return an error if the resolver throws an error', async () => {
    const ipc = WebExtIPC.from<{
      test: {
        message: { type: 'test'; message: string }
        response: { type: 'testResponse'; message: string }
      }
    }>()

    const resolver = jest.fn().mockImplementation(() => {
      throw new Error('test')
    })

    ipc.addMessageResolvers({
      test: () => resolver(),
    })

    const message = { type: 'test', message: 'hello' }
    const sender = { tab: { id: 1 } }
    expect(addListenerMock.mock.calls[0][0](message, sender)).resolves.toEqual(
      expect.objectContaining({
        type: 'error',
        message: 'test',
      })
    )
  })
})
