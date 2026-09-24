// El ENLACE DIRECTO del correo de avisos de la intranet (Alberto, 24/09/2026: «los avisos del
// cliente en la app, también aviso por mail con token de acceso a la app»).
//
// Es el código de un solo uso de siempre, pero largo y metido en el enlace: el correo va al mismo
// buzón al que iría el código, así que quien tiene el buzón ya podía entrar. Lo que cambia es el
// REENVÍO: un correo reenviado lleva la llave. Por eso:
//   - UN SOLO USO y 72 horas; caducado o usado, se cae al acceso de siempre (código al correo).
//   - Se canjea con un clic en «Entrar» (POST), nunca al abrir el enlace (GET): los antivirus y
//     las vistas previas del correo abren los enlaces y lo gastarían.
//   - El token no se guarda: solo su SHA-256. Y además tiene que casar el correo del enlace con el
//     de la ficha a la que se mandó (índice ciego): un token suelto no abre nada.
//   - Firmar (anulaciones, presupuestos) sigue pidiendo su código aparte: la llave abre la
//     sesión, no firma nada.

// 🚨 Web Crypto y NO `node:crypto`: este barril lo importan componentes de cliente del portal y un
// import `node:` revienta su build de producción (lo vigila `regression-portal-autorizacion`).

export const HORAS_ENLACE_DIRECTO = 72

/** 32 bytes aleatorios en base64url: no se adivina ni se prueba por fuerza bruta. */
export function generarTokenEnlace(): string {
  const b = new Uint8Array(32)
  globalThis.crypto.getRandomValues(b)
  let bin = ''
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256 en hexadecimal: lo único que se guarda del token. */
export async function hashTokenEnlace(token: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Un token con forma válida (43 caracteres base64url). Lo demás ni se busca. */
export function tokenEnlaceValido(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
}

export type EstadoEnlace = 'valido' | 'usado' | 'caducado'

export function estadoEnlace(e: { usadoEn: Date | null; expiraAt: Date }, ahora: Date): EstadoEnlace {
  if (e.usadoEn !== null) return 'usado'
  return e.expiraAt.getTime() <= ahora.getTime() ? 'caducado' : 'valido'
}

/**
 * A dónde lleva tras entrar: SOLO una ruta interna del portal. Un `//otro.com` o un `https://…`
 * convertiría el enlace de la correduría en un redirector a cualquier sitio.
 */
export function destinoSeguro(r: unknown): string {
  if (typeof r !== 'string' || !/^\/[A-Za-z0-9/_?=&.-]*$/.test(r) || r.startsWith('//')) return '/boveda'
  return r
}

/** El enlace completo: `base` https del portal, con el correo, el token y el destino. */
export function urlEnlaceDirecto(base: string, correo: string, token: string, destino: string): string {
  const u = new URL(base)
  if (u.protocol !== 'https:') throw new Error('enlace_no_https')
  u.pathname = '/'
  u.search = ''
  u.searchParams.set('d', correo)
  u.searchParams.set('e', token)
  u.searchParams.set('r', destinoSeguro(destino))
  return u.toString()
}
