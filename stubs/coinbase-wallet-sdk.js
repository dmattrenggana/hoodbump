// Stub for @coinbase/wallet-sdk
// Prevents Coinbase SDK from initializing (Robinhood Chain unsupported)
//
// Returns a Proxy that accepts ANY method call without crashing.
// All methods return undefined or Promise.resolve(undefined).
// All property accesses return deep proxies to allow chaining.

function createProxy(target = {}) {
  const handler = {
    get(t, prop) {
      // Common methods that wagmi/Privy expect
      if (prop === "then") return undefined  // not a thenable
      if (prop === Symbol.toPrimitive) return undefined
      if (prop === Symbol.iterator) return undefined

      // Create a deep proxy that returns more proxies
      // for any property access — fully duck-typed
      return new Proxy(function() {}, {
        get: (_, p) => {
          if (p === "then") return undefined
          if (p === "catch" || p === "finally") {
            return (fn) => Promise.resolve(undefined).then(fn).catch(() => {})
          }
          // For method calls on the result, return more proxy
          return createProxy()[p] || createProxy()
        },
        apply: () => createProxy(),
        construct: () => createProxy(),
      })
    },
    apply: () => createProxy(),
    construct: () => createProxy(),
    set: () => true,
    has: () => true,
  }
  return new Proxy(target, handler)
}

export function createCoinbaseWalletSDK() {
  // Return a Proxy that accepts ANY method/property access
  return createProxy()
}

export default createCoinbaseWalletSDK

// Other named exports that might be imported
export const CoinbaseWalletSDK = createCoinbaseWalletSDK
