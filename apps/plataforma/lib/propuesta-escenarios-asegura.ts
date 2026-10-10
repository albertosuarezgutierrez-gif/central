// PROPUESTA DE ESCENARIOS (07/10/2026) vista desde la pantalla de Alberto: varios presupuestos de la MISMA
// oportunidad juntos en un documento. Esta app NO toca la BD de la correduría: reenvía al puerto de asegura
// (`/api/operador/presupuesto/propuesta`) con el secreto de operador.
//
// Dos partes, como `presupuesto-asegura.ts`:
//   1. Lo PURO (`interpretarPropuestas`, `resumenAviso`), que importa el client component. Con su test.
//   2. La RED, solo desde la ruta API.
//
// 🚨 Crear la propuesta NO avisa a nadie. Avisar exige `confirmar: true`, que solo manda el botón final de Alberto.

import { cabecerasPuerto } from './puerto-actor.ts'

export type EscenarioPropuesta = {
  numero: number
  presupuestoId: string
  referencia: string | null
  etiqueta: string
  tomador: { clienteId: string; nombre: string | null }
  estado: string
  venceEl: string | null
  masEconomica: boolean
  /** `null` = ninguna opción con prima legible (no «0»). */
  primaMinima: number | null
  seguroAnterior: string
  nOpciones: number
}
export type Propuesta = {
  id: string
  referencia: string
  /** `null` = no consta (no la cadena vacía). */
  creadoAt: string | null
  canalAviso: 'email' | 'whatsapp_enlace' | null
  avisadoAt: string | null
  retiradaAt: string | null
  escenarios: EscenarioPropuesta[]
}
export type LecturaPropuestas =
  | { estado: 'ok'; propuestas: Propuesta[] }
  /** Las tablas aún no existen (SQL sin aplicar): no es «no hay propuestas». */
  | { estado: 'sin_tabla'; detalle: string }
  | { estado: 'error'; motivo: string }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {})
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function leerPropuesta(v: unknown): Propuesta | null {
  const p = obj(v)
  if (!txt(p.id) || !txt(p.referencia)) return null
  const escenarios = (Array.isArray(p.escenarios) ? p.escenarios : []).flatMap((e): EscenarioPropuesta[] => {
    const x = obj(e)
    const t = obj(x.tomador)
    if (!txt(x.presupuestoId) || num(x.numero) === null || !txt(t.clienteId)) return []
    return [{
      numero: num(x.numero)!, presupuestoId: x.presupuestoId as string, referencia: txt(x.referencia), etiqueta: txt(x.etiqueta) ?? 'Intervinientes: no constan',
      tomador: { clienteId: t.clienteId as string, nombre: txt(t.nombre) }, estado: txt(x.estado) ?? 'desconocido', venceEl: txt(x.venceEl),
      masEconomica: x.masEconomica === true, primaMinima: num(x.primaMinima), seguroAnterior: txt(x.seguroAnterior) ?? 'Seguro anterior: no consta',
      nOpciones: Array.isArray(x.opciones) ? x.opciones.length : 0,
    }]
  })
  return {
    id: p.id as string, referencia: p.referencia as string, creadoAt: txt(p.creadoAt),
    canalAviso: p.canalAviso === 'email' || p.canalAviso === 'whatsapp_enlace' ? p.canalAviso : null,
    avisadoAt: txt(p.avisadoAt), retiradaAt: txt(p.retiradaAt), escenarios,
  }
}

export function interpretarPropuestas(status: number, j: unknown): LecturaPropuestas {
  const o = obj(j)
  if (o.motivo === 'sin_tabla') return { estado: 'sin_tabla', detalle: txt(o.detalle) ?? 'Las propuestas de escenarios aún no están activadas.' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.propuestas)) {
    return { estado: 'error', motivo: txt(o.detalle) ?? txt(o.motivo) ?? txt(o.causa) ?? `HTTP ${status}` }
  }
  return { estado: 'ok', propuestas: o.propuestas.flatMap((p) => { const x = leerPropuesta(p); return x ? [x] : [] }) }
}

/**
 * Los presupuestos que se pueden juntar: los de las variantes con presupuesto preparado y aún sin decidir. El estado
 * fino (caducado) lo comprueba asegura al crear; aquí solo se descarta lo que ya se sabe que no entra.
 */
export function presupuestoSeleccionable(p: { retiradoAt: string | null; emitidoAt: string | null; aceptadoAt: string | null; elegidoAt: string | null } | null): boolean {
  return p !== null && !p.retiradoAt && !p.emitidoAt && !p.aceptadoAt && !p.elegidoAt
}

export type GrupoAvisoPantalla = { nombre: string | null; numeros: number[]; estado: 'enviado' | 'enlace' | 'error'; detalle: string; whatsapp: string | null }

/** Lo que devolvió el aviso del lote, por tomador. `ok:false` si alguno falló (nunca «enviado» a medias). */
export function resumenAviso(status: number, j: unknown): { ok: boolean; texto: string; grupos: GrupoAvisoPantalla[] } {
  const o = obj(j)
  const grupos: GrupoAvisoPantalla[] = (Array.isArray(o.grupos) ? o.grupos : []).map((g) => {
    const x = obj(g)
    const estado = x.estado === 'enviado' || x.estado === 'enlace' ? x.estado : 'error'
    return {
      nombre: txt(x.nombre),
      numeros: Array.isArray(x.numeros) ? x.numeros.filter((n): n is number => typeof n === 'number') : [],
      estado, detalle: txt(x.detalle) ?? '', whatsapp: estado === 'enlace' && txt(x.whatsapp)?.startsWith('https://wa.me/') ? (x.whatsapp as string) : null,
    }
  })
  if (grupos.length === 0) return { ok: false, texto: txt(o.detalle) ?? txt(o.causa) ?? `No se ha podido avisar (HTTP ${status}). No consta que haya salido nada.`, grupos }
  const ok = status === 200 && o.estado === 'ok'
  const texto = ok
    ? (grupos.every((g) => g.estado === 'enlace') ? 'WhatsApp preparado: ábrelo y mándalo tú; luego pulsa «Ya lo he mandado».' : 'Propuesta enviada por correo.')
    : o.estado === 'parcial' ? 'Solo una parte ha salido: mira cada tomador abajo.' : 'No ha salido nada: mira el motivo abajo.'
  return { ok, texto, grupos }
}

// ─── RED (solo desde la ruta API) ────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

async function puerto(init: RequestInit, query = '', topeMs = 30_000): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/presupuesto/propuesta${query}`, {
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

export function listarPropuestasAsegura(oportunidadId: string): Promise<Reenvio> {
  return puerto({ method: 'GET' }, `?${new URLSearchParams({ oportunidadId }).toString()}`)
}

/** `actor` lo pone el SERVIDOR y va el ÚLTIMO del cuerpo (un cuerpo con su propio `actor` no firma por otro). */
export function crearPropuestaAsegura(cuerpo: { oportunidadId: unknown; presupuestoIds: unknown }, actor: string): Promise<Reenvio> {
  return puerto({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oportunidadId: cuerpo.oportunidadId, presupuestoIds: cuerpo.presupuestoIds, actor }) })
}

export function accionPropuestaAsegura(cuerpo: Record<string, unknown>, actor: string): Promise<Reenvio> {
  // Avisar corre un aviso por escenario (correo incluido): más margen que una lectura.
  return puerto({ method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cuerpo, actor }) }, '', 55_000)
}

export async function descargarPdfPropuestaAsegura(id: string): Promise<Response | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  return fetch(`${urlAsegura()}/api/operador/presupuesto/propuesta/pdf?id=${encodeURIComponent(id)}`, {
    headers: await cabecerasPuerto(secret),
    cache: 'no-store',
    signal: AbortSignal.timeout(50_000),
  })
}
