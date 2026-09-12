// El MURO DE ACTIVIDAD de la cartera, leído del puerto de asegura
// (`GET /api/operador/actividad`) y convertido en algo que la pantalla pueda
// pintar sin adivinar nada.
//
// Dos partes, como en `leads-asegura.ts` y `duplicados-asegura.ts`:
//   1. Lo PURO: `interpretarActividad` (test en `lib/actividad-asegura.test.ts`),
//      que importa el client component.
//   2. La RED: `actividadAsegura()`, solo desde la ruta API de plataforma.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// Una respuesta que no se entiende degrada a error, JAMÁS a un muro vacío. «No
// he podido leer la actividad» y «no ha pasado nada» se pintan igual de vacíos
// y solo uno de los dos autoriza a decirle a Alberto que sus clientes no están
// usando la intranet. Campo a campo:
//
//   · `embudo.hanEntrado: null` = esa cuenta no se pudo hacer (nunca «0 han entrado»)
//   · `clienteId: null`         = el evento no está casado con ninguna ficha
//   · `nuevos: null`            = no se sabe cuándo se miró por última vez
import { type EmbudoPortal, type EventoActividad } from '@central/module-seguros'

import { MOTIVOS_PUERTO, type MotivoPuerto, describirCausaAsegura } from './correduria-puerto.ts'

export type { MotivoPuerto }
export { MOTIVOS_PUERTO, describirCausaAsegura }

export type ResultadoActividad =
  | {
      ok: true
      eventos: EventoActividad[]
      total: number
      embudo: EmbudoPortal
      /** Filtros que el puerto no ha entendido. La pantalla los DICE. */
      descartados: string[]
      /** Filas que llegaron sin id o sin fecha. Se cuentan en vez de desaparecer. */
      ilegibles: number
    }
  | { ok: false; motivo: MotivoPuerto | 'sin_configurar'; causa: string | null }

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Una cuenta del embudo.
 *
 * 🚨 Solo un número finito cuenta. Cualquier otra cosa —ausente, `null`,
 * basura— es `null`, que la pantalla pinta como «—» y no como un cero. Un 0
 * inventado aquí diría «ninguno de tus clientes ha entrado», que es la frase
 * sobre la que Alberto decidiría ponerse a invitar gente que ya está dentro.
 */
function cuenta(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function embudoDe(bruto: unknown): EmbudoPortal {
  const e = obj(bruto)
  return {
    clientes: cuenta(e?.clientes),
    conEmail: cuenta(e?.conEmail),
    invitados: cuenta(e?.invitados),
    hanEntrado: cuenta(e?.hanEntrado),
    activos30: cuenta(e?.activos30),
  }
}

/** Una fecha ISO que no parsea es tan ilegible como una fila sin id: no se pinta. */
function fechaValida(v: unknown): string | null {
  const t = cadena(v)
  if (t === null) return null
  return Number.isNaN(Date.parse(t)) ? null : t
}

export function interpretarActividad(bruto: unknown): ResultadoActividad {
  const raiz = obj(bruto)
  if (raiz === null) return { ok: false, motivo: 'respuesta_ilegible', causa: null }

  const estado = cadena(raiz.estado)
  // Se distinguen a propósito: `sin_configurar` se arregla poniendo
  // `ASEGURA_OPERADOR_SECRET` en ESTE proyecto; `asegura_error` se arregla en la
  // BD de asegura. Un único «no se pudo» manda a mirar donde no es.
  if (estado === 'sin_configurar') return { ok: false, motivo: 'sin_configurar', causa: null }
  if (estado === 'error') {
    return { ok: false, motivo: 'asegura_error', causa: describirCausaAsegura(cadena(raiz.causa) ?? undefined) }
  }
  if (estado !== 'ok' || !Array.isArray(raiz.eventos)) {
    return { ok: false, motivo: 'respuesta_ilegible', causa: null }
  }

  const eventos: EventoActividad[] = []
  let ilegibles = 0
  for (const bruta of raiz.eventos) {
    const f = obj(bruta)
    const id = f === null ? null : cadena(f.id)
    const fecha = f === null ? null : fechaValida(f.fecha)
    const tipo = f === null ? null : cadena(f.tipo)
    // Sin id, sin fecha o sin tipo no hay nada que pintar en una línea de
    // tiempo. Se cuenta en vez de desaparecer: un muro más corto sin decirlo
    // esconde justo lo que esta pantalla existe para no esconder.
    if (id === null || fecha === null || tipo === null) {
      ilegibles++
      continue
    }
    eventos.push({
      id,
      tipo,
      fecha,
      clienteId: cadena(f?.clienteId),
      cliente: cadena(f?.cliente),
      texto: cadena(f?.texto),
    })
  }

  const descartados = Array.isArray(raiz.descartados)
    ? raiz.descartados.map((d) => cadena(d)).filter((d): d is string => d !== null)
    : []

  return {
    ok: true,
    eventos,
    // El total lo manda el puerto (`count(*) over ()`): es el del conjunto
    // entero, no el de esta página. Si no llega, cae a lo que se ve — que es
    // menos de lo que hay, y un paginador corto de menos se nota; uno largo de
    // más manda a páginas vacías.
    total: cuenta(raiz.total) ?? eventos.length,
    embudo: embudoDe(raiz.embudo),
    descartados,
    ilegibles,
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

/** `GET /api/operador/actividad` — el muro de toda la cartera. */
export async function actividadAsegura(query: string): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/actividad${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
