// lib/domotica/tuya-cifrado.ts — primitivas AES-128-ECB para el flujo de "contraseña temporal online"
// de las cerraduras Tuya (ticket + AES). Aisladas y con roundtrip testeable.
//
// Flujo documentado (smart-lock "Manage passwords"):
//  1) POST .../door-lock/password-ticket → { ticket_id, ticket_key } (ticket_key en hex, cifrado).
//  2) Descifrar ticket_key con AES-128-ECB/NoPadding usando los 16 primeros bytes del access_secret
//     → clave AES real.
//  3) Cifrar el PIN con AES-128-ECB/PKCS7 usando esa clave → hex MAYÚSCULAS.
//  4) POST .../door-lock/temp-password con { password: <hex>, password_type:'ticket', ticket_id, ... }.
//
// El entorno de dev no alcanza la Tuya API: aquí solo garantizamos que las primitivas AES son correctas
// (test roundtrip); el flujo real se valida desplegando.
import { createCipheriv, createDecipheriv } from 'crypto'

// Clave AES de 16 bytes a partir del access_secret (utf8, primeros 16 bytes).
export function claveDesdeSecret(secret: string): Buffer {
  return Buffer.from((secret || '').slice(0, 16).padEnd(16, '0'), 'utf8')
}

// Descifra el ticket_key (hex) → clave AES real (Buffer). ECB, sin padding.
export function descifrarTicketKey(ticketKeyHex: string, secret: string): Buffer {
  const d = createDecipheriv('aes-128-ecb', claveDesdeSecret(secret), null)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(Buffer.from(ticketKeyHex, 'hex')), d.final()])
}

// Cifra el PIN con la clave AES real → hex MAYÚSCULAS. ECB, PKCS7.
export function cifrarPin(pin: string, claveAes: Buffer): string {
  const c = createCipheriv('aes-128-ecb', claveAes, null)
  c.setAutoPadding(true)
  return Buffer.concat([c.update(Buffer.from(pin, 'utf8')), c.final()]).toString('hex').toUpperCase()
}

// Descifra un hex producido por cifrarPin (para el roundtrip de test).
export function descifrarPin(hex: string, claveAes: Buffer): string {
  const d = createDecipheriv('aes-128-ecb', claveAes, null)
  d.setAutoPadding(true)
  return Buffer.concat([d.update(Buffer.from(hex, 'hex')), d.final()]).toString('utf8')
}
