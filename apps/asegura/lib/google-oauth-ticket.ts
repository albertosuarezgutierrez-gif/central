/**
 * Ticket de INICIO del OAuth de Google Contacts desde plataforma (05/10/2026).
 *
 * Alberto conecta Google desde su panel (`/correduria` de plataforma), donde NO tiene sesión de
 * asegura. El servidor de plataforma pide por el puerto (Bearer + `x-actor` humano) un ticket y
 * manda el navegador a `…/api/google-contactos/conectar?ticket=…`. El ticket sustituye a la
 * sesión SOLO en ese primer salto; a partir de ahí el flujo es el de siempre (nonce en cookie
 * httpOnly + `state` firmado, `google-oauth-estado.ts`).
 *
 *   · HMAC-SHA256 con `GOOGLE_CONTACTOS_STATE_SECRET`, con DOMINIO propio (`…-ticket:v1:`): un
 *     `state` no vale como ticket ni al revés.
 *   · Lleva correduría + cuenta (actor) + `jti` aleatorio + caducidad de 2 minutos. Ningún secreto.
 *   · UN SOLO USO: `conectar` consume el `jti` en `seguros.google_contactos_ticket_usado`
 *     (INSERT por clave primaria `jti`); si ya estaba (P2002), es una reutilización y se rechaza.
 *
 * También la URL de VUELTA a plataforma tras el callback: se construye desde una base FIJA del
 * servidor (`PLATAFORMA_URL` o el defecto), nunca desde la petición → sin open redirect.
 *
 * Puro (sin red ni BD): el secreto y el consumo del `jti` se inyectan. Lo prueba
 * `google-oauth-ticket.test.ts`.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const VIGENCIA_TICKET_MS = 2 * 60 * 1000

export type DatosTicket = { correduriaId: string; cuentaId: string; jti: string; caduca: number }
export type MotivoTicket = 'mal_formado' | 'firma' | 'caducado' | 'usado' | 'bd'
export type ResultadoTicket = { ok: true; datos: DatosTicket } | { ok: false; motivo: MotivoTicket }

const b64 = (s: string) => Buffer.from(s).toString('base64url')

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`google-contactos-ticket:v1:${cuerpo}`).digest('base64url')
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function firmarTicket(d: { correduriaId: string; cuentaId: string }, secreto: string, ahora: number = Date.now()): { ticket: string; datos: DatosTicket } {
  if (!secreto) throw new Error('Falta el secreto del ticket de Google Contacts')
  const datos: DatosTicket = { correduriaId: d.correduriaId, cuentaId: d.cuentaId, jti: randomBytes(18).toString('base64url'), caduca: ahora + VIGENCIA_TICKET_MS }
  const cuerpo = b64(JSON.stringify({ c: datos.correduriaId, u: datos.cuentaId, j: datos.jti, e: datos.caduca }))
  return { ticket: `${cuerpo}.${firma(cuerpo, secreto)}`, datos }
}

/** Firma + forma + caducidad. NO mira el uso: eso es `canjearTicket`. */
export function verificarTicket(ticket: string | null | undefined, p: { secreto: string; ahora?: number }): ResultadoTicket {
  if (!ticket || !p.secreto || ticket.length > 1024) return { ok: false, motivo: 'mal_formado' }
  const partes = ticket.split('.')
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'mal_formado' }
  const [cuerpo, sello] = partes
  if (!iguales(sello, firma(cuerpo, p.secreto))) return { ok: false, motivo: 'firma' }
  let d: { c?: unknown; u?: unknown; j?: unknown; e?: unknown }
  try {
    d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, motivo: 'mal_formado' }
  }
  if (typeof d.c !== 'string' || typeof d.u !== 'string' || typeof d.j !== 'string' || typeof d.e !== 'number' || !d.c || !d.u || !d.j) {
    return { ok: false, motivo: 'mal_formado' }
  }
  if ((p.ahora ?? Date.now()) > d.e) return { ok: false, motivo: 'caducado' }
  return { ok: true, datos: { correduriaId: d.c, cuentaId: d.u, jti: d.j, caduca: d.e } }
}

/**
 * Verifica y CONSUME el ticket. `consumir(datos)` devuelve `true` si el `jti` no se había usado
 * (y queda marcado), `false` si ya estaba. Un fallo al consumir → `bd` (fail-closed: sin poder
 * marcarlo no se acepta, porque no se podría impedir su reutilización).
 */
export async function canjearTicket(
  ticket: string | null | undefined,
  p: { secreto: string; ahora?: number; consumir: (d: DatosTicket) => Promise<boolean> },
): Promise<ResultadoTicket> {
  const v = verificarTicket(ticket, p)
  if (!v.ok) return v
  try {
    return (await p.consumir(v.datos)) ? v : { ok: false, motivo: 'usado' }
  } catch {
    return { ok: false, motivo: 'bd' }
  }
}

export type IdentidadInicio =
  | { ok: true; via: 'ticket' | 'sesion'; correduriaId: string; cuentaId: string }
  | { ok: false; motivo: `ticket_${MotivoTicket}` | 'sin_sesion'; status: number }

/**
 * Quién arranca el OAuth en `conectar`. Con `?ticket=` manda el ticket (y si no vale se rechaza:
 * NO se cae a la sesión, para que un ticket malo no se disfrace de éxito). Sin ticket, la sesión de
 * asegura de siempre.
 */
export async function identidadInicio(p: {
  ticket: string | null
  canjear: (t: string) => Promise<ResultadoTicket>
  sesion: () => Promise<{ ok: true; correduriaId: string; cuentaId: string } | { ok: false; status: number }>
}): Promise<IdentidadInicio> {
  if (p.ticket !== null) {
    const r = await p.canjear(p.ticket)
    if (!r.ok) return { ok: false, motivo: `ticket_${r.motivo}`, status: r.motivo === 'bd' ? 503 : 401 }
    return { ok: true, via: 'ticket', correduriaId: r.datos.correduriaId, cuentaId: r.datos.cuentaId }
  }
  const s = await p.sesion()
  if (!s.ok) return { ok: false, motivo: 'sin_sesion', status: s.status }
  return { ok: true, via: 'sesion', correduriaId: s.correduriaId, cuentaId: s.cuentaId }
}

// ─── Vuelta a plataforma ──────────────────────────────────────────────────────

export const RUTA_VUELTA = '/correduria/google-contactos'
const MOTIVO_VALIDO = /^[a-z0-9_]{1,40}$/

/**
 * URL de vuelta a la vista de Google Contactos de plataforma (`/correduria/google-contactos`, la
 * entrada «Google Contactos» del menú «…» de `/correduria`) con el resultado. Solo se usa
 * el ORIGEN de `base` (https, o http en localhost), nunca su ruta ni su query; el `motivo` es un
 * código cerrado. Base inválida → `null` (quien llama pinta la página HTML de siempre).
 */
export function urlVueltaPlataforma(base: string | null | undefined, resultado: 'ok' | 'error', motivo?: string | null): string | null {
  let u: URL
  try {
    u = new URL((base ?? '').trim())
  } catch {
    return null
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  if (u.username || u.password) return null
  const destino = new URL(RUTA_VUELTA, u.origin)
  destino.searchParams.set('google', resultado)
  if (resultado === 'error') destino.searchParams.set('motivo', motivo && MOTIVO_VALIDO.test(motivo) ? motivo : 'desconocido')
  return destino.toString()
}
