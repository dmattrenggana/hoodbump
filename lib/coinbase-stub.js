/**
 * Stub for @coinbase/wallet-sdk.
 *
 * Coinbase Smart Wallet doesn't support Robinhood Chain (chain 4663), so
 * Privy can't initialize the Coinbase SDK. We provide a minimal stub
 * that returns a "no-op" SDK object, satisfying Privy's imports without
 * actually loading the real Coinbase SDK.
 *
 * This stub:
 *   - Exports createCoinbaseWalletSDK() (named export) → returns a minimal SDK object
 *   - Exports CoinbaseWalletProvider (named export) as a class
 *   - Has default export = createCoinbaseWalletSDK
 *   - Written as ESM (project is "type": "module")
 */

function makeEventEmitter() {
  const listeners = new Map()
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(cb)
      return this
    },
    emit(event, ...args) {
      const arr = listeners.get(event) || []
      for (const cb of arr) {
        try { cb(...args) } catch (e) { /* ignore */ }
      }
      return this
    },
    removeListener(event, cb) {
      const arr = listeners.get(event) || []
      const idx = arr.indexOf(cb)
      if (idx >= 0) arr.splice(idx, 1)
      return this
    },
  }
}

class StubCoinbaseWalletProvider {
  constructor() {
    this.connected = false
    this._events = makeEventEmitter()
  }
  async request() {
    throw new Error("Coinbase Smart Wallet is not supported on this chain")
  }
  async enable() { return [] }
  async disconnect() { this.connected = false; this._events.emit("disconnect") }
  on(...args) { return this._events.on(...args) }
  removeListener(...args) { return this._events.removeListener(...args) }
  emit(...args) { return this._events.emit(...args) }
}

export function createCoinbaseWalletSDK() {
  return {
    makeWeb3Provider() {
      return new StubCoinbaseWalletProvider()
    },
    getProviderInfo() {
      return { isCoinbaseWallet: true, isCoinbaseBrowser: false }
    },
  }
}

export class CoinbaseWalletProvider extends StubCoinbaseWalletProvider {}

export default createCoinbaseWalletSDK