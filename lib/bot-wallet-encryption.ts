import crypto from "crypto"

/**
 * Hand-rolled encryption for bot wallet private keys
 * 
 * Algorithm: AES-256-GCM (NIST-approved, quantum-resistant-ish)
 * 
 * Storage format: base64(12-byte IV + 16-byte auth tag + ciphertext)
 * 
 * Master key: 32 bytes (64 hex chars) from MASTER_ENCRYPTION_KEY env var
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits

function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY not set. " +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  
  const keyBuffer = Buffer.from(key, "hex")
  if (keyBuffer.length !== 32) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${keyBuffer.length} bytes.`
    )
  }
  
  return keyBuffer
}

/**
 * Encrypt a private key
 * Returns: base64 string containing [IV][auth tag][ciphertext]
 */
export function encryptPrivateKey(privateKey: string): string {
  const masterKey = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ])
  
  const authTag = cipher.getAuthTag()
  
  // Format: [IV][authTag][ciphertext]
  return Buffer.concat([iv, authTag, encrypted]).toString("base64")
}

/**
 * Decrypt a private key
 * Input: base64 string from encryptPrivateKey()
 */
export function decryptPrivateKey(encrypted: string): string {
  const masterKey = getMasterKey()
  const data = Buffer.from(encrypted, "base64")
  
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short")
  }
  
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv)
  decipher.setAuthTag(authTag)
  
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}

/**
 * Generate a new master key (for initial setup)
 * Run: node -e "console.log(generateMasterKey())"
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString("hex")
}
