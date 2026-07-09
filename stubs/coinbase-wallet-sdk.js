// Stub for @coinbase/wallet-sdk
// Prevents Coinbase SDK from initializing (Robinhood Chain unsupported)
//
// Real API expected by Privy/wagmi:
//   - createCoinbaseWalletSDK({ appName, appLogoUrl, ... }) → SDK
//   - sdk.getProvider() → Promise<EIP-1193 Provider>
//   - sdk.disconnect() → Promise<void>
//   - sdk.getAddress() → Promise<string[]>
//
// All methods return resolved Promises so wagmi can await them.

function fakeProvider() {
  // EIP-1193 provider shape: request method + event emitter
  return {
    request: async ({ method }) => {
      // Standard RPC methods - return minimal valid responses
      const handlers = {
        eth_chainId: () => "0x1233", // 4663 in hex
        net_version: () => "4663",
        eth_accounts: () => [],
        eth_requestAccounts: () => [],
        eth_blockNumber: () => "0x0",
        eth_call: () => "0x",
        eth_estimateGas: () => "0x5208",
        eth_gasPrice: () => "0x0",
        eth_getBalance: () => "0x0",
        eth_getCode: () => "0x",
        eth_getTransactionCount: () => "0x0",
        eth_sendTransaction: () => "0x" + "0".repeat(64),
        eth_signTransaction: () => "0x",
      }
      return handlers[method]?.() ?? null
    },
    on: () => fakeProvider(),
    removeListener: () => fakeProvider(),
    removeAllListeners: () => fakeProvider(),
    emit: () => true,
    isConnected: () => false,
  }
}

export function createCoinbaseWalletSDK(_options = {}) {
  return {
    // Returns Promise that resolves to EIP-1193 provider
    getProvider: async () => fakeProvider(),

    // Other SDK methods that wagmi/Privy might call
    disconnect: async () => {},
    getAddress: async () => [],
    getAccounts: async () => [],
    getInfo: async () => ({}),
    getSigner: async () => null,
    makeWeb3Provider: async () => fakeProvider(),

    // Metadata
    setAppInfo: () => {},

    // Constructor-like access for safety
    version: "0.0.0-stub",
  }
}

export default createCoinbaseWalletSDK

// Other named exports (some bundlers might check these)
export const CoinbaseWalletSDK = createCoinbaseWalletSDK
