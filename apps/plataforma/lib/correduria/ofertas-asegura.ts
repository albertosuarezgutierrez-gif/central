// Las OFERTAS de compañías de una oportunidad, vistas desde la pantalla de Alberto (F3).
//
// Esta app NO toca la BD de la correduría: reenvía al puerto de asegura
// (`/api/operador/oportunidad/ofertas` y `/consolidar`) con el secreto de operador. Mismo patrón que
// `presupuesto-asegura.ts`. Lo PURO (tipos, `interpretarOfertas`) lo importa el client component;
// la RED solo la llaman las rutas API (las envs se leen dentro de las funciones).
//
// 🚨 Nada de esto gasta Codeoscopic ni sale al cliente. `null` = «no figura», nunca 0.

import type { ResultadoComparacion, ValorGarantia } from '@central/module-seguros'
import { cabecerasPuerto } from '../puerto-actor.ts'

export type EstadoOferta = 'extraida' | 'revisada' | 'descartada'
export type RolOferta = 'actual' | 'oferta'

export type EvidenciaOferta = { pagina: number | null; texto: string }
/** El MISMO tipo que compara `module-seguros`: sin copia local que se desvíe (ni casts en la pantalla). */
export type GarantiaOferta = ValorGarantia

export type OfertaVista = {
  id: string
  documentoId: string | null
  rol: RolOferta
  compania: string | null
  producto: string | null
  primaNeta: number | null
  primaTotal: number | null
  garantias: Record<string, GarantiaOferta>
  /** `lectura: { ok, motivo?, paginas? }` y `franquiciaGeneral`, entre otros. */
  datosExtra: Record<string, unknown>
  estado: EstadoOferta
  recomendada: boolean
  revisadaAt: string | null
  revisadaPor: string | null
}

export type OfertasOportunidad = {
  ofertas: OfertaVista[]
  comparacion: ResultadoComparacion
}

export type LecturaOfertas =
  | { estado: 'ok'; datos: OfertasOportunidad }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}
const txtOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function leerGarantias(v: unknown): Record<string, GarantiaOferta> {
  const o = obj(v)
  if (!o) return {}
  const salida: Record<string, GarantiaOferta> = {}
  for (const [k, raw] of Object.entries(o)) {
    const g = obj(raw)
    if (!g) continue
    const ev = obj(g.evidencia)
    salida[k] = {
      estado: g.estado === 'incluida' || g.estado === 'excluida' ? g.estado : null,
      capital: numOrNull(g.capital),
      limite: numOrNull(g.limite),
      franquicia: numOrNull(g.franquicia),
      evidencia: ev ? { pagina: typeof ev.pagina === 'number' ? ev.pagina : null, texto: typeof ev.texto === 'string' ? ev.texto : '' } : null,
    }
  }
  return salida
}

/** Una oferta del puerto. `null` si no tiene forma de oferta: no se pinta una tarjeta en blanco. */
export function leerOferta(v: unknown): OfertaVista | null {
  const o = obj(v)
  if (!o) return null
  const id = txtOrNull(o.id)
  if (!id) return null
  const estado: EstadoOferta = o.estado === 'revisada' || o.estado === 'descartada' ? o.estado : 'extraida'
  return {
    id,
    documentoId: txtOrNull(o.documentoId),
    rol: o.rol === 'actual' ? 'actual' : 'oferta',
    compania: txtOrNull(o.compania),
    producto: txtOrNull(o.producto),
    primaNeta: numOrNull(o.primaNeta),
    primaTotal: numOrNull(o.primaTotal),
    garantias: leerGarantias(o.garantias),
    datosExtra: obj(o.datosExtra) ?? {},
    estado,
    recomendada: o.recomendada === true,
    revisadaAt: txtOrNull(o.revisadaAt),
    revisadaPor: txtOrNull(o.revisadaPor),
  }
}

/** La respuesta del GET del puerto → lo que pinta la pantalla. */
export function interpretarOfertas(status: number, json: unknown): LecturaOfertas {
  const j = obj(json)
  if (j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status !== 200 || j?.estado !== 'ok') {
    return { estado: 'error', motivo: txtOrNull(j?.motivo) ?? txtOrNull(j?.causa) ?? `HTTP ${status}` }
  }
  const comparacion = obj(j.comparacion)
  if (!comparacion || !Array.isArray(comparacion.filas) || !Array.isArray(j.ofertas)) {
    return { estado: 'error', motivo: 'respuesta sin cuadro comparativo' }
  }
  const ofertas = j.ofertas.flatMap((x) => { const o = leerOferta(x); return o ? [o] : [] })
  return { estado: 'ok', datos: { ofertas, comparacion: comparacion as unknown as ResultadoComparacion } }
}

// ─── RED ─────────────────────────────────────────────────────────────────────

export type Reenvio = { status: number; json: unknown }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function puerto(ruta: string, init: RequestInit, query = '', topeMs = 30_000): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/oportunidad/${ruta}${query}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(topeMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function listarOfertasAsegura(oportunidadId: string): Promise<Reenvio> {
  return puerto('ofertas', { method: 'GET' }, `?oportunidadId=${encodeURIComponent(oportunidadId)}`)
}

/** `form` ya trae fichero, oportunidadId, rol y actor. La IA lee el PDF: hasta ~2 min. */
export function subirOfertaAsegura(form: FormData): Promise<Reenvio> {
  return puerto('ofertas', { method: 'POST', body: form }, '', 125_000)
}

export function editarOfertaAsegura(cuerpo: Record<string, unknown>): Promise<Reenvio> {
  return puerto('ofertas', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
}

export function consolidarOfertasAsegura(cuerpo: Record<string, unknown>): Promise<Reenvio> {
  return puerto('consolidar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }, '', 95_000)
}
