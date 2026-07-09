// Comprehensive stub for @coinbase/wallet-sdk v4.3.2
// Replaces CoinbaseWalletSDK class + createCoinbaseWalletSDK function
// Provides no-op EIP-1193 providers to prevent crashes on unsupported chains

import { EventEmitter } from "events"

// EIP-1193 compliant fake provider
function fakeProvider() {
  const emitter = new EventEmitter()
  return {
    // Make this look like an EventEmitter
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    listeners: emitter.listeners.bind(emitter),
    addListener: emitter.on.bind(emitter),

    // EIP-1193 request method
    request: async ({ method, params }) => {
      const responses = {
        eth_chainId: "0x1233", // 4663 in hex
        net_version: "4663",
        eth_accounts: [],
        eth_requestAccounts: [],
        eth_blockNumber: "0x0",
        eth_call: "0x",
        eth_estimateGas: "0x5208",
        eth_gasPrice: "0x0",
        eth_getBalance: "0x0",
        eth_getCode: "0x",
        eth_getTransactionCount: "0x0",
        eth_sendTransaction: "0x" + "0".repeat(64),
        eth_signTransaction: "0x",
        eth_signTypedData_v4: "0x" + "0".repeat(64),
        personal_sign: "0x" + "0".repeat(64),
        wallet_switchEthereumChain: null,
        wallet_addEthereumChain: null,
      }
      return responses[method] ?? null
    },

    // Misc
    isConnected: () => false,
    disconnect: async () => {},
    enable: async () => [],
  }
}

// CoinbaseWalletSDK CLASS (matching actual SDK v4.3.2 API)
export class CoinbaseWalletSDK {
  constructor(metadata = {}) {
    this.metadata = {
      appName: metadata.appName || "Dapp",
      appLogoUrl: metadata.appLogoUrl || null,
      appChainIds: metadata.appChainIds || [],
    }
    this._provider = null
  }

  makeWeb3Provider(preference = { options: "all" }) {
    return fakeProvider()
  }

  getProvider() {
    if (!this._provider) this._provider = fakeProvider()
    return this._provider
  }

  get walletProvider() {
    if (!this._provider) this._provider = fakeProvider()
    return this._provider
  }

  set walletProvider(p) {
    this._provider = p
  }

  disconnect() {
    return Promise.resolve()
  }
  destroy() {}
  isExtensionUpdateAvailable() {
    return Promise.resolve(false)
  }
  isConnected() {
    return false
  }

  getAddress() {
    return Promise.resolve([])
  }
  getAccounts() {
    return Promise.resolve([])
  }
  getInfo() {
    return Promise.resolve({ wallet: "stub", version: "0.0.0-stub" })
  }
  getSigner() {
    return Promise.resolve(null)
  }
  getChainId() {
    return Promise.resolve("0x1233")
  }
  getBalance() {
    return Promise.resolve("0x0")
  }
  request() {
    return Promise.resolve(null)
  }

  setAppInfo() {}
  setAppName() {}
  setAppLogoUrl() {}
  setPreference() {}

  subaccounts = {
    get: async () => [],
    create: async () => ({}),
  }

  version = "0.0.0-stub"
}

// createCoinbaseWalletSDK function (newer API in v4.3.2)
export function createCoinbaseWalletSDK(_options = {}) {
  let providerInstance = null

  return {
    getProvider: async function () {
      if (!providerInstance) providerInstance = fakeProvider()
      return providerInstance
    },
    get walletProvider() {
      if (!providerInstance) providerInstance = fakeProvider()
      return providerInstance
    },
    set walletProvider(p) {
      providerInstance = p
    },

    disconnect: async () => {},
    destroy: () => {},
    isExtensionUpdateAvailable: async () => false,
    isConnected: () => false,

    getAddress: async () => [],
    getAccounts: async () => [],
    getInfo: async () => ({ wallet: "stub", version: "0.0.0" }),
    getSigner: async () => null,
    getChainId: async () => "0x1233",
    getBalance: async () => "0x0",
    request: async () => null,

    makeWeb3Provider: async () => fakeProvider(),
    makeEthereumProvider: async () => fakeProvider(),

    // Event subscription (also on top-level SDK)
    on: function () { return this },
    once: function () { return this },
    off: function () { return this },
    removeListener: function () { return this },
    removeAllListeners: function () { return this },
    emit: () => true,

    setAppInfo: () => {},
    setAppName: () => {},
    setAppLogoUrl: () => {},
    setPreference: () => {},

    subaccounts: {
      get: async () => [],
      create: async () => ({}),
    },

    version: "0.0.0-stub",
  }
}

export default CoinbaseWalletSDK

// Legacy export
export const CoinbaseWalletProvider = fakeProvider
