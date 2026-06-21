// Helpers cripto compartidos (Web Crypto API — válidos en Node serverless y edge).
// Sin dependencias npm. Se usan en ialimp y plataforma para hashing de PIN,
// tokens de sesión (jti) y tokens de un solo uso.

/** Genera N bytes aleatorios como string hexadecimal. */
export function genHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Genera un identificador de sesión (jti) de 16 bytes. */
export function genJti(): string {
  return genHex(16)
}

/** SHA-256 de un string → hex. Útil para hash de PINs y tokens de un solo uso. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
