// Comprehensive stub for @coinbase/wallet-sdk
// Returns objects that satisfy wagmi/Privy/viem's expectations
// All methods are no-ops or return safe defaults

// EIP-1193 compliant fake provider
function fakeProvider() {
  const handlers = new Map()
  return {
    // RPC method handler
    request: async ({ method, params }) => {
      // Log for debugging
      if (typeof window !== "undefined") {
        console.debug("[stub] eth request:", method)
      }

      // Standard RPC methods - return minimal valid responses
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

    // Event emitter methods - return self for chaining
    on: function (event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
      return this
    },
    once: function (event, handler) {
      const wrap = (...args) => {
        this.removeListener(event, wrap)
        handler(...args)
      }
      return this.on(event, wrap)
    },
    emit: function (event, ...args) {
      const list = handlers.get(event) || []
      list.forEach((h) => h(...args))
      return true
    },
    removeListener: function (event, handler) {
      const list = handlers.get(event) || []
      const idx = list.indexOf(handler)
      if (idx >= 0) list.splice(idx, 1)
      return this
    },
    removeAllListeners: function (event) {
      if (event) handlers.delete(event)
      else handlers.clear()
      return this
    },
    listeners: function (event) {
      return handlers.get(event) || []
    },

    // Misc methods
    isConnected: () => false,
    disconnect: async () => {},
    enable: async () => [],
  }
}

// Fake SDK class
export function createCoinbaseWalletSDK(_options = {}) {
  let providerInstance = null

  return {
    // Returns Promise that resolves to EIP-1193 provider
    getProvider: async function () {
      if (!providerInstance) providerInstance = fakeProvider()
      return providerInstance
    },
    // Allow synchronous access too
    get walletProvider() {
      if (!providerInstance) providerInstance = fakeProvider()
      return providerInstance
    },
    set walletProvider(p) {
      providerInstance = p
    },

    // SDK lifecycle methods
    disconnect: async () => {},
    destroy: () => {},
    isExtensionUpdateAvailable: async () => false,
    isConnected: () => false,

    // Sub-wallet methods
    getAddress: async () => [],
    getAccounts: async () => [],
    getInfo: async () => ({ wallet: "stub", version: "0.0.0" }),
    getSigner: async () => null,
    getChainId: async () => "0x1233",
    getBalance: async () => "0x0",
    request: async () => null,

    // Web3 methods
    makeWeb3Provider: async () => fakeProvider(),
    makeEthereumProvider: async () => fakeProvider(),

    // Event subscription
    on: function () { return this },
    once: function () { return this },
    off: function () { return this },
    removeListener: function () { return this },
    removeAllListeners: function () { return this },
    emit: () => true,

    // Metadata
    setAppInfo: () => {},
    setAppName: () => {},
    setAppLogoUrl: () => {},
    setPreference: () => {},

    // Subwallets / SCW
    subaccounts: {
      get: async () => [],
      create: async () => ({}),
    },

    version: "0.0.0-stub",
  }
}

export default createCoinbaseWalletSDK

// Other named exports that might be imported
export const CoinbaseWalletSDK = createCoinbaseWalletSDK

// Some bundlers check for instanceof
export class CoinbaseWalletProvider {
  constructor() {
    return fakeProvider()
  }
}
