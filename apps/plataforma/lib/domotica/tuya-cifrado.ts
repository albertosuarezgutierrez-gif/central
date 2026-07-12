// lib/domotica/tuya-cifrado.ts — primitivas AES para el flujo de "contraseña temporal online"
// de las cerraduras Tuya (ticket + AES). Aisladas y con roundtrip testeable.
//
// Flujo documentado (smart-lock "Manage passwords", verificado contra la spec/foro de Tuya):
//  1) POST .../door-lock/password-ticket → { ticket_id, ticket_key } (ticket_key en hex, cifrado).
//  2) Descifrar ticket_key con AES-256-ECB/PKCS7 usando el access_secret COMPLETO (32 bytes, utf8)
//     → clave AES real de 16 bytes.
//  3) Cifrar el PIN con AES-128-ECB/PKCS7 usando esa clave → hex MAYÚSCULAS.
//  4) POST .../door-lock/temp-password con { password: <hex>, password_type:'ticket', ticket_id, ... }.
//
// El entorno de dev no alcanza la Tuya API: aquí garantizamos que las primitivas AES son correctas
// (test roundtrip que imita cómo Tuya genera el ticket_key); el flujo real se valida desplegando.
import { createCipheriv, createDecipheriv } from 'crypto'

// El access_secret de Tuya es de 32 bytes → clave AES-256 directa (utf8). Falla EXPLÍCITO si no
// mide 32 (así un TUYA_CLIENT_SECRET mal puesto se diagnostica solo, en vez de un opaco
// "Invalid key length" aguas abajo al cifrar el PIN).
function claveSecret(secret: string): Buffer {
  const b = Buffer.from(secret || '', 'utf8')
  if (b.length !== 32) throw new Error(`TUYA_CLIENT_SECRET debe medir 32 bytes para AES-256 (mide ${b.length})`)
  return b
}

// Descifra el ticket_key (hex) → clave AES real de 16 bytes (Buffer). AES-256-ECB, PKCS7.
export function descifrarTicketKey(ticketKeyHex: string, secret: string): Buffer {
  const d = createDecipheriv('aes-256-ecb', claveSecret(secret), null)
  d.setAutoPadding(true)
  return Buffer.concat([d.update(Buffer.from(ticketKeyHex, 'hex')), d.final()])
}

// Cifra el PIN con la clave AES real (16 bytes) → hex MAYÚSCULAS. AES-128-ECB, PKCS7.
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
