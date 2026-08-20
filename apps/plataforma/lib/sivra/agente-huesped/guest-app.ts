// lib/sivra/agente-huesped/guest-app.ts — lectura de la guest app de Smoobu.
//
// La guest app (el enlace que Smoobu manda solo al huésped) es una SPA de React, así que bajar su
// HTML no sirve de nada: devuelve ~2,8 KB sin una línea de texto útil. Eso hacía `guia.ts` desde el
// principio, y por eso `mensajes_guia_cache` llevaba CERO filas: el agente respondía a los huéspedes
// sin ninguna fuente sobre la vivienda y rellenaba los huecos inventando (llaves, cajas fuertes,
// rutas a pie que no existen).
//
// Su API SÍ es legible: el bundle de la SPA fija `baseURL = https://login.smoobu.com/api-guest` y
// manda el token del propio enlace como parámetro `token`. Con la `guest-app-url` que ya devuelve la
// API normal de Smoobu tenemos la guía entera —llaves, wifi, normas, basura, azotea— sin API key y
// sin navegador. Verificado en vivo el 20/08/2026 contra el Dúplex (10 secciones, 13 KB).
//
// Todo lo de este módulo es puro salvo `fetchGuiaSecciones` / `fetchFichaReserva`.

export type GuestAppRef = { token: string; bookingId: string }

export type SeccionGuia = {
  id: string
  titulo: string
  texto: string
  periodos: number[]   // displayTimePeriods de Smoobu: 2 = antes de llegar, 4 = durante, 8 = después
  esAcceso: boolean    // ¿lleva llaves/códigos/contraseñas? → ventana de 7 días
}

// Saca `t`/`b` (o `token`/`bookingId`) de la guest-app-url. null si el enlace no sirve.
export function parseGuestAppUrl(url: string): GuestAppRef | null {
  if (!url) return null
  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return null
  }
  const token = (params.get('t') || params.get('token') || '').trim()
  const bookingId = (params.get('b') || params.get('bookingId') || '').trim()
  if (!token || !bookingId) return null
  return { token, bookingId }
}

const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&aacute;': 'á',
  '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
}

// Convierte el HTML de una sección (o de un mensaje del hilo) en texto plano CONSERVANDO las URLs:
// tanto la guía como los automáticos de Smoobu usan anclas cuyo texto visible es "HERE"/"AQUÍ" y
// toda la chicha está en el href. Perder el href es lo que hizo que el agente le escribiera el
// marcador literal "[lien d'accès]" a un huésped el 20/08/2026 teniendo el enlace en el hilo.
export function htmlATexto(html: string): string {
  let s = html || ''
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, texto) => {
    const t = String(texto).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
    return t ? ` ${t} (${href}) ` : ` ${href} `
  })
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  s = s.replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  for (const [ent, ch] of Object.entries(ENTIDADES)) s = s.replaceAll(ent, ch)
  s = s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
  s = s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
  return s.trim()
}

// Títulos que son inequívocamente de acceso.
const RE_TITULO_ACCESO = /\b(key|keys|keybox|lockbox|llave|llaves|acceso|access|entrar|entrada|check\s*-?\s*in|c[oó]digo|code|pin|cerradura|portal|wifi)\b/i
// Marcadores de credencial en el cuerpo, aunque el título no lo cante.
const RE_CREDENCIAL = /\b(password|passwd|contrase[nñ]a|clave|c[oó]digo|pin|keybox|lockbox|caja\s+de\s+llaves)\b/i

// ¿Esta sección contiene datos de acceso que NO deben salir hasta 7 días antes de la llegada?
// Política de Alberto (20/08/2026): las claves se dan una semana antes, con recordatorios, porque un
// huésped puede reservar y cancelar después. Ante la duda, true: el coste de callar una norma de la
// casa una semana es cero; el de repartir la caja de llaves a una reserva que se cancela, no.
export function esSeccionDeAcceso(titulo: string, texto: string): boolean {
  return RE_TITULO_ACCESO.test(titulo || '') || RE_CREDENCIAL.test(texto || '')
}

// Pasa la respuesta cruda de /contents a secciones utilizables. Descarta las inactivas y las que se
// quedan sin texto. Nunca lanza: una guía mal formada debe degradar a "sin guía", no romper el turno.
export function normalizarSecciones(crudo: unknown): SeccionGuia[] {
  if (!Array.isArray(crudo)) return []
  const out: SeccionGuia[] = []
  for (const c of crudo as any[]) {
    if (!c || c.active === false) continue
    const titulo = String(c.title ?? '').trim()
    const texto = htmlATexto(String(c.content ?? ''))
    if (!texto) continue
    const periodos = Array.isArray(c.displayTimePeriods)
      ? c.displayTimePeriods.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : []
    out.push({ id: String(c.id ?? titulo), titulo, texto, periodos, esAcceso: esSeccionDeAcceso(titulo, texto) })
  }
  return out
}

// Temas donde MANDA una regla nuestra, no la guía. Hoy solo el parking: la guía de Smoobu (y la
// plantilla de confirmación) siguen prometiendo el aparcamiento de Plaza San Juan de la Palma a
// 20 €/día, pero Alberto confirmó el 20/08/2026 que YA NO HAY plaza y que se responde con los
// parkings públicos cercanos (`parking.ts`). Si esa sección entrara al prompt, el agente ofrecería
// un servicio inexistente — y encima solo, porque `parking` es categoría graduada.
// Se devuelven aparte (`pisadas`) para poder avisar del choque en vez de resolverlo en silencio.
const RE_SECCION_PISADA = /\b(parking|aparcamiento|garaje|estacionamiento)\b/i

export function esSeccionPisada(titulo: string): boolean {
  return RE_SECCION_PISADA.test(titulo || '')
}

export const DIAS_VENTANA_ACCESO = 7

function aDias(fecha: string): number | null {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null
}

// Periodo de Smoobu según la fase de la reserva: 2 = antes de llegar, 4 = durante, 8 = después.
function periodoDe(hoy: string, checkIn: string, checkOut: string): number {
  if (checkIn && hoy < checkIn) return 2
  if (checkOut && hoy > checkOut) return 8
  return 4
}

// Filtra las secciones que se le pueden enseñar HOY a este huésped.
// - Vigencia de Smoobu: la propia guest app marca en qué fase enseña cada sección.
// - Ventana de acceso: las llaves/códigos solo desde 7 días antes de la llegada.
// `accesoOculto` avisa de que SÍ hay secciones de acceso pero aún no toca enseñarlas, para que el
// agente pueda responder "te lo mandamos una semana antes" en vez de callarse o inventárselo.
export function seccionesVigentes(
  secciones: SeccionGuia[],
  ctx: { hoy: string; checkIn: string; checkOut: string },
): { secciones: SeccionGuia[]; accesoOculto: boolean; pisadas: string[] } {
  const periodo = periodoDe(ctx.hoy, ctx.checkIn, ctx.checkOut)
  const dHoy = aDias(ctx.hoy)
  const dIn = aDias(ctx.checkIn)
  const faltan = dHoy !== null && dIn !== null ? dIn - dHoy : 0
  const dentroVentana = faltan <= DIAS_VENTANA_ACCESO
  let accesoOculto = false
  const pisadas: string[] = []
  const vivas = (secciones || []).filter(s => {
    if (esSeccionPisada(s.titulo)) { pisadas.push(s.titulo); return false }
    if (s.periodos.length && !s.periodos.includes(periodo)) return false
    if (s.esAcceso && !dentroVentana) { accesoOculto = true; return false }
    return true
  })
  return { secciones: vivas, accesoOculto, pisadas }
}

// Texto de la guía tal y como lo ve el modelo.
export function seccionesATexto(secciones: SeccionGuia[]): string {
  return (secciones || []).map(s => `## ${s.titulo}\n${s.texto}`).join('\n\n').trim()
}

// ── I/O ─────────────────────────────────────────────────────────────────────
const API_GUEST = 'https://login.smoobu.com/api-guest'
const TIMEOUT_MS = 10_000

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'central-agente-huesped' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!r.ok) {
      console.error(`[guest-app] ${url.replace(/token=[^&]+/, 'token=***')} → HTTP ${r.status}`)
      return null
    }
    return await r.json()
  } catch (e: any) {
    console.error(`[guest-app] fallo de red: ${e?.message}`)
    return null
  }
}

// Guía del huésped (secciones). null = NO SE PUDO LEER (≠ "no hay guía").
export async function fetchGuiaSecciones(ref: GuestAppRef): Promise<SeccionGuia[] | null> {
  const j = await getJson(`${API_GUEST}/bookings/${encodeURIComponent(ref.bookingId)}/contents?token=${encodeURIComponent(ref.token)}`)
  if (j === null) return null
  return normalizarSecciones(j)
}

// Ficha de la reserva según la guest app (dirección postal completa, horas, onlineCheckInUrl).
// null = no se pudo leer.
export async function fetchFichaReserva(ref: GuestAppRef): Promise<Record<string, any> | null> {
  const j = await getJson(`${API_GUEST}/bookings/${encodeURIComponent(ref.bookingId)}?token=${encodeURIComponent(ref.token)}`)
  return j && typeof j === 'object' ? (j as Record<string, any>) : null
}
