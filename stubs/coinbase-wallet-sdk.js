// Stub for @coinbase/wallet-sdk
// Prevents Coinbase SDK from initializing (Robinhood Chain unsupported)
//
// Real exports needed by Privy/wagmi:
//   - createCoinbaseWalletSDK: returns a fake SDK object with no-op methods
//   - default: same as createCoinbaseWalletSDK
//
// All methods are async functions that return undefined or throw to prevent
// any Coinbase-related code from running.

// Fake SDK class - mimics the CoinbaseWalletSDK interface
class FakeCoinbaseWalletSDK {
  constructor() {
    // Empty constructor
  }
  // No-op methods that Privy/wagmi might call
  async makeWeb3Provider() { return null }
  async getAddress() { return null }
  async disconnect() {}
}

// createCoinbaseWalletSDK returns the fake SDK
export function createCoinbaseWalletSDK() {
  return new FakeCoinbaseWalletSDK()
}

// Default export (some modules use default import)
export default createCoinbaseWalletSDK

// Other potential exports (no-ops)
export const CoinbaseWalletSDK = FakeCoinbaseWalletSDK
export const SubAccountSigner = class {}
