import { cabecerasPuerto } from './puerto-actor.ts'
// El puerto de recaptación de asegura (`/api/operador/recaptacion*`). Mismo
// patrón que `correduria-puerto.ts`: interpretación PURA (sin red) + las
// llamadas de red, que solo se invocan desde las rutas API / crons.
//
// 30/09/2026: el bloque «Recaptación» de /correduria se quitó (esos antiguos
// clientes son oportunidades y se trabajan en /correduria/vencimientos, carril
// de leads), y con él la cola, su agrupación y los envíos manuales. Aquí queda
// lo que sigue vivo: el LOTE diario de correo (cron `recaptacion-email-lote`)
// y el contrato de escritura que reutiliza `renovaciones-asegura.ts`.
//
// Ver docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

// ── Escritura ─────────────────────────────────────────────────────────────────
//
// Los envíos manuales de recaptación (whatsapp/email) se quitaron con su
// pantalla, pero el contrato de cinco estados lo reutiliza
// `renovaciones-asegura.ts` para registrar el contacto de una renovación.

export type EscrituraRecaptacion =
  | { estado: 'ok' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarEscrituraRecaptacion(status: number, json: unknown): EscrituraRecaptacion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const motivo = cadena(o.motivo) ?? cadena(o.causa) ?? cadena(o.error)
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 422 || o.estado === 'invalido') return { estado: 'invalido', motivo: motivo ?? 'datos_invalidos' }
  if (status === 200 && o.estado === 'ok') return { estado: 'ok' }
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

// ── Red (solo desde las rutas API de plataforma) ──────────────────────────────
//
// Mismo estilo que `urlAsegura()`/`pedir()` de `correduria-puerto.ts`: mismo
// env `ASEGURA_URL`/`ASEGURA_OPERADOR_SECRET`, `cache:'no-store'`, y
// `sin_configurar`/`red` como los dos huecos que no son "el puerto respondió
// con un error". Se generaliza a `pedirCon()` porque el lote es un POST con
// cuerpo — el `pedir()` de `correduria-puerto.ts` es solo GET y añadirle
// método/body ahí habría que tocar ese fichero (y con él, todos sus usos
// existentes) para un caso que no necesitan.

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedirCon(path: string, init: RequestInit, timeoutMs: number = 8000): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

// ── Envío en LOTE (cron diario) ───────────────────────────────────────────

/**
 * Los campos de CAMPAÑA (30/09/2026) son `null` cuando asegura no los manda
 * (versión anterior) o no los pudo leer — NUNCA 0. Un 0 aquí afirma algo:
 * `pendientesPrimerEnvio: 0` es «ya se ha escrito a todos», y con eso (más
 * `primerosEnviados > 0`) se dispara el aviso de fin de campaña
 * (`lib/recaptacion-campana.ts`).
 * `emailEnviadosTotal`/`emailAbiertosTotal` se leen ANTES de enviar: no
 * incluyen los `enviados` de esta pasada.
 *
 * 🚨 `enviados` ≠ `primerosEnviados`: `enviados` incluye los correos de
 * SEGUIMIENTO (tras el cooldown se vuelve a escribir a los ya contactados), así
 * que no sirve para saber si esta pasada ha vaciado la cola de primeros envíos.
 */
export type LoteEmailOk = {
  estado: 'ok'
  candidatos: number
  /** Correos enviados en esta pasada: primeros + seguimientos. */
  enviados: number
  fallidos: number
  detalleFallos: string[]
  descartadosPorSilencio: number
  /** De `enviados`, cuántos son el PRIMER correo a esa persona. */
  primerosEnviados: number | null
  /**
   * Personas solo-correo que siguen sin su PRIMER correo, descontando las de
   * esta pasada. No cuenta a quien ha fallado en esta pasada (esas van en `fallidos`).
   */
  pendientesPrimerEnvio: number | null
  /** Correos de recaptación enviados en total ANTES de esta pasada. */
  emailEnviadosTotal: number | null
  /** De esos, cuántos se han abierto (acumulado). */
  emailAbiertosTotal: number | null
  /** PERSONAS solo-correo cuya ventana (~45 días antes del antiguo vencimiento) aún no se ha abierto. */
  enEsperaVentanaSoloCorreo: number | null
}

export type LoteEmail =
  | LoteEmailOk
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarLoteEmail(status: number, json: unknown): LoteEmail {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    return {
      estado: 'ok',
      candidatos: entero(o.candidatos) ?? 0,
      enviados: entero(o.enviados) ?? 0,
      fallidos: entero(o.fallidos) ?? 0,
      detalleFallos: Array.isArray(o.detalleFallos) ? o.detalleFallos.filter((x): x is string => typeof x === 'string') : [],
      // Cron viejo de asegura sin este campo (versión anterior al 21/09/2026) → 0,
      // no `null`: es un recuento real de ESTA pasada, no un dato pendiente.
      descartadosPorSilencio: entero(o.descartadosPorSilencio) ?? 0,
      // Estos SÍ son `null` si faltan: son estado de la campaña (o el desglose
      // que la decide), y un 0 inventado dispararía «ya se ha escrito a todos»
      // o pintaría un «0 %» de aperturas que nadie midió.
      primerosEnviados: entero(o.primerosEnviados),
      pendientesPrimerEnvio: entero(o.pendientesPrimerEnvio),
      emailEnviadosTotal: entero(o.emailEnviadosTotal),
      emailAbiertosTotal: entero(o.emailAbiertosTotal),
      enEsperaVentanaSoloCorreo: entero(o.enEsperaVentanaSoloCorreo),
    }
  }
  const motivo = cadena(o.motivo) ?? cadena(o.causa) ?? cadena(o.error)
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

// Timeout largo a propósito: hasta ~25 envíos secuenciales por Resend, cada
// uno con su propio timeout interno de 15s en `enviarEmailResend` (asegura).
// Por encima del `maxDuration=120` de la ruta de asegura, para no cortar la
// petición antes de que la propia plataforma la corte por su cuenta.
const TIMEOUT_LOTE_MS = 130_000

export async function enviarLoteEmailRecaptacionAsegura(limite?: number): Promise<LoteEmail> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/email-lote', { method: 'POST', body: JSON.stringify({ limite }) }, TIMEOUT_LOTE_MS)
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarLoteEmail(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
