// RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026, Generali/Okta) — la parte de SERVIDOR con `node:crypto`.
// Subpath `@central/module-tarificacion/servidor` (nunca el index: llega al navegador).
//
// El código lo escribe Alberto en Telegram → plataforma → asegura → worker. Asegura lo tiene que GUARDAR unos segundos
// (el worker lo recoge sondeando), y nunca en claro: lo SELLA con la clave pública X25519 que el worker generó en memoria
// para ESTE trabajo. La privada no sale nunca de la máquina de Fly (que muere al acabar): ni la BD, ni Vercel, ni un
// volcado pueden abrir lo guardado, ni ahora ni después.
//
// Sello: X25519 efímero (asegura) × pública del worker → HKDF-SHA256 (sal = id del trabajo) → AES-256-GCM con AAD = versión +
// trabajo. Formato `c1.<pública efímera>.<iv>.<cifrado+tag>` (base64url). Abrir con otro trabajo, otra clave o un byte
// cambiado = `null` (sin detalles). PURO salvo el azar de las claves.
import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from 'node:crypto'
import { inspect } from 'node:util'

const VERSION = 'c1'
/** Prefijo DER (SPKI) de una clave pública X25519: la clave cruda son los 32 bytes siguientes. */
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')
const INFO = Buffer.from('tarificador-codigo-sms:v1')

/** El código que Alberto escribe: SOLO 4 a 8 dígitos (sin espacios, letras ni signos). PURO. */
export function codigoSmsValido(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4,8}$/.test(v)
}

/** Clave pública cruda (32 bytes) en base64url: 43 caracteres. PURO. */
export function clavePublicaSmsValida(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v, 'base64url').length === 32
}

const publicaDeCruda = (cruda: Buffer): KeyObject => createPublicKey({ key: Buffer.concat([SPKI_X25519, cruda]), format: 'der', type: 'spki' })
const crudaDePublica = (k: KeyObject): Buffer => (k.export({ format: 'der', type: 'spki' }) as Buffer).subarray(SPKI_X25519.length)
const aad = (trabajoId: string) => Buffer.from(`tarificador-codigo-sms:${VERSION}:${trabajoId.trim().toLowerCase()}`)
const derivar = (secreto: Buffer, trabajoId: string) => Buffer.from(hkdfSync('sha256', secreto, Buffer.from(trabajoId.trim().toLowerCase()), INFO, 32))

/**
 * Sella `codigo` para el worker dueño de `clavePublica` y del trabajo `trabajoId`. Lanza si el código o la clave no tienen
 * forma (el llamante ya los validó: es un error de programación, no de usuario). El mensaje del error NUNCA lleva el código.
 */
export function sellarCodigoSms(codigo: string, clavePublica: string, trabajoId: string): string {
  if (!codigoSmsValido(codigo)) throw new Error('codigo_sms_invalido')
  if (!clavePublicaSmsValida(clavePublica)) throw new Error('clave_publica_invalida')
  const destino = publicaDeCruda(Buffer.from(clavePublica, 'base64url'))
  const efimera = generateKeyPairSync('x25519')
  const clave = derivar(diffieHellman({ privateKey: efimera.privateKey, publicKey: destino }), trabajoId)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave, iv)
  c.setAAD(aad(trabajoId))
  const ct = Buffer.concat([c.update(codigo, 'utf8'), c.final(), c.getAuthTag()])
  return `${VERSION}.${crudaDePublica(efimera.publicKey).toString('base64url')}.${iv.toString('base64url')}.${ct.toString('base64url')}`
}

/** Forma del sello (para validar lo que viaja sin abrirlo). PURO. */
export function selloCodigoSmsValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 200 && /^c1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27,40}$/.test(v)
}

/**
 * Par de claves del worker para UN trabajo. La privada vive solo en este objeto (no se exporta ni se serializa:
 * `toJSON`/`inspect` la tapan). `abrir` devuelve el código o `null` (sello ajeno, manipulado o sin forma de código).
 */
export class ParCodigoSms {
  readonly #privada: KeyObject
  readonly publica: string
  constructor() {
    const par = generateKeyPairSync('x25519')
    this.#privada = par.privateKey
    this.publica = crudaDePublica(par.publicKey).toString('base64url')
  }
  abrir(sello: string, trabajoId: string): string | null {
    try {
      if (!selloCodigoSmsValido(sello)) return null
      const [, epk, ivS, datosS] = sello.split('.')
      const datos = Buffer.from(datosS!, 'base64url')
      const clave = derivar(diffieHellman({ privateKey: this.#privada, publicKey: publicaDeCruda(Buffer.from(epk!, 'base64url')) }), trabajoId)
      const d = createDecipheriv('aes-256-gcm', clave, Buffer.from(ivS!, 'base64url'))
      d.setAAD(aad(trabajoId))
      d.setAuthTag(datos.subarray(datos.length - 16))
      const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]).toString('utf8')
      return codigoSmsValido(plano) ? plano : null
    } catch {
      return null
    }
  }
  toJSON(): string {
    return '[par-codigo-sms]'
  }
  [inspect.custom](): string {
    return '[par-codigo-sms]'
  }
}
