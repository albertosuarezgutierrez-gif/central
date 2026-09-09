// La «vista de corredor»: Alberto abre el portal COMO lo ve un cliente
// (08/09/2026, dictado: «el corredor puede acceder a cualquier cosa»).
//
// ── Por qué no se le fabrica una identidad al cliente ─────────────────────────
//
// El portal deriva toda la bóveda de `portal_vinculo` filtrado por identidad:
// esa es la ÚNICA frontera de aislamiento y la respetan las diez lecturas que
// hay. Así que la forma barata y exacta de «ver lo que él ve» es una identidad
// REAL dedicada al corredor (`IDENTIDAD_CORREDOR_ID`, sembrada por la
// migración, SIN canales: nadie puede entrar como ella con un código) con un
// vínculo temporal a la ficha que se está mirando. El portal no cambia ni una
// lectura y pinta exactamente lo mismo.
//
// 🚨 Lo que NO puede pasar, y por eso el vínculo lleva `origen = 'corredor'`:
// que la ficha de plataforma diga «Ya entra al portal» porque Alberto la miró.
// `estadoPortalDeFicha` (asegura) cuenta vínculos por cliente y tiene que
// EXCLUIR este origen — lo vigila `test/regression-portal-vista-corredor.test.ts`.
//
// ── El token ──────────────────────────────────────────────────────────────────
//
// asegura lo crea y el portal lo consume, y son DOS apps con DOS secretos
// distintos: la pimienta del portal (`ASEGURA_PORTAL_CANAL_PEPPER`) no existe
// en asegura, así que el hash es SHA-256 a secas. Vale porque el token son 32
// bytes aleatorios: guardar el hash y no el token solo sirve para que una
// lectura de la tabla no dé enlaces usables, no para «estirar» un secreto flojo.
//
// Web Crypto y no `node:crypto`: este módulo lo importan componentes de
// cliente del portal (misma razón que `codigo.ts`).

/**
 * Identidad del corredor. UUID v4 fijo, sembrado por
 * `apps/asegura-portal/prisma/sql/2026-09-08_portal_vista_corredor.sql`.
 * Se escribe aquí y no en una env porque las DOS apps tienen que coincidir y
 * una env que se desincroniza no falla: deja de funcionar en silencio.
 */
export const IDENTIDAD_CORREDOR_ID = '5c0aa8e2-1d3b-4c7e-9a41-c0aaed0c0de1'

/** `portal_vinculo.origen` del vínculo temporal. Permitido por el CHECK desde la misma migración. */
export const ORIGEN_VINCULO_CORREDOR = 'corredor'

/** Lo que dura el enlace desde que plataforma lo pide hasta que se abre. */
export const VIGENCIA_ENLACE_CORREDOR_MS = 10 * 60 * 1000

/** Lo que dura la sesión del corredor dentro del portal (la de un cliente son 30 días). */
export const SESION_CORREDOR = '4h'
export const SESION_CORREDOR_SEGUNDOS = 4 * 60 * 60

export const RUTA_VISTA_CORREDOR = '/corredor'

const HEX_64 = /^[0-9a-f]{64}$/

export function formatoTokenVistaValido(token: unknown): token is string {
  return typeof token === 'string' && HEX_64.test(token)
}

/** 32 bytes aleatorios en hex. */
export function generarTokenVista(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashTokenVista(token: string): Promise<string> {
  const datos = new TextEncoder().encode(token)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type EstadoEnlaceVista = 'valido' | 'usado' | 'caducado'

/**
 * Un enlace se usa UNA vez y dentro de plazo. `usado` gana a `caducado`: un
 * enlace ya consumido que además caducó sigue siendo «ya se usó», que es lo
 * que explica por qué no abre.
 */
export function estadoEnlaceVista(
  fila: { creadoEn: Date; usadoEn: Date | null },
  ahora: Date,
  vigenciaMs: number = VIGENCIA_ENLACE_CORREDOR_MS,
): EstadoEnlaceVista {
  if (fila.usadoEn !== null) return 'usado'
  if (ahora.getTime() - fila.creadoEn.getTime() > vigenciaMs) return 'caducado'
  return 'valido'
}

/** La URL que abre plataforma. `null` si no hay base: no se promete un «entra aquí» sin el «aquí». */
export function enlaceVistaCorredor(basePortal: string | null, token: string): string | null {
  if (!basePortal) return null
  const url = new URL(basePortal)
  url.pathname = `${RUTA_VISTA_CORREDOR}/${token}`
  url.search = ''
  url.hash = ''
  return url.toString()
}
