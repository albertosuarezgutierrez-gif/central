// Pérdidas de cartera (Fase 2 de ASegura OS, pieza 2-a): cliente del puerto de asegura
// (`/api/operador/eventos` y `/eventos/detectar`) + el texto del aviso de Telegram (puro).
//
// Una «pérdida sin explicar» es una póliza que CIMA da de baja, que anuncia que no renovará o que
// deja de aparecer, SIN una sustitución registrada. No se decide aquí si se ha perdido el cliente:
// eso lo resuelve Alberto en «Hoy» (pérdida con motivo, o no es pérdida).

import { cabecerasPuerto } from './puerto-actor.ts'

export type Fuga = {
  id: string
  tipo: string
  titulo: string
  clienteId: string
  cliente: string | null
  polizaNumero: string | null
  aseguradora: string | null
  estado: string | null
}

export type Deteccion = {
  primeraVez: boolean
  detectados: number
  nuevos: number
  porTipo: Record<string, number>
  fugasNuevas: Fuga[]
  polizasEnFoto: number
  /** `null` = asegura no lo manda (versión anterior), no «ninguna». */
  retencionesAbiertas: number | null
  /** Retenciones que tocaba abrir y fallaron; `null` = asegura no lo manda. */
  retencionesFallidas: number | null
  /** Retenciones de antes cerradas solas porque ya no hacen falta; `null` = asegura no lo manda. */
  retencionesCerradas: number | null
  /** Correos a clientes propuestos (recibo devuelto), esperando tu OK; `null` = asegura no lo manda. */
  aprobacionesNuevas: number | null
  aprobacionesFallidas: number | null
  anulacionesConfirmadas: number | null
  /** Pólizas enlazadas solas con la que sustituyen; `null` = asegura no lo manda. */
  sustitucionesEnlazadas: number | null
  /** Sustituciones que casaban con más de una póliza y no se enlazaron. */
  sustitucionesAmbiguas: number | null
  /** Dos vigentes del mismo riesgo solapadas; `null` = asegura no lo manda. */
  duplicidades: number | null
  /** `true` = el enlace de sustituciones falló en esa pasada. */
  sustitucionesFallidas: boolean
  /** Presupuestos aceptados que pasaron a emitidos solos (su anulación firmada va a la cola). */
  presupuestosEmitidos: number | null
  /** Expedientes de anulación por sustitución abiertos solos (esperan la firma del cliente). */
  anulacionesPorSustitucion: number | null
  /** Oportunidades cerradas como ganadas solas (su póliza ya entró en cartera); `null` = asegura no lo manda. */
  oportunidadesGanadas: number | null
}

export type Lectura<T> = { estado: 'ok'; dato: T } | { estado: 'sin_datos'; causa: string }

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function leerFuga(v: unknown): Fuga | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = texto(o.id)
  const tipo = texto(o.tipo)
  const clienteId = texto(o.clienteId)
  if (!id || !tipo || !clienteId) return null
  return {
    id, tipo, clienteId,
    titulo: texto(o.titulo) ?? tipo,
    cliente: texto(o.cliente),
    polizaNumero: texto(o.polizaNumero),
    aseguradora: texto(o.aseguradora),
    estado: texto(o.estado),
  }
}

async function llamar(ruta: string, init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; timeoutMs?: number }): Promise<{ status: number; json: Record<string, unknown> } | { error: string }> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { error: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}${ruta}`, {
      method: init.method,
      headers: { ...(await cabecerasPuerto(secreto)), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    })
    const json = (await res.json().catch(() => null)) as unknown
    return { status: res.status, json: (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown> }
  } catch {
    return { error: 'no se pudo llegar a asegura (timeout, DNS o TLS)' }
  }
}

function causa(r: { status: number; json: Record<string, unknown> }): string {
  if (r.status === 401 || r.status === 403) return 'asegura rechaza el secreto'
  if (r.status === 404) return 'asegura aún no tiene /api/operador/eventos desplegado'
  if (r.json.estado === 'sin_configurar') return 'asegura sin base de datos configurada'
  return texto(r.json.causa) ?? texto(r.json.motivo) ?? `HTTP ${r.status}`
}

/** Lanza el detector. Cualquier duda es `sin_datos`, nunca «no ha pasado nada». */
export async function detectarEventos(): Promise<Lectura<Deteccion>> {
  const r = await llamar('/api/operador/eventos/detectar', { method: 'POST', timeoutMs: 55_000 })
  if ('error' in r) return { estado: 'sin_datos', causa: r.error }
  const o = r.json
  if (r.status !== 200 || o.estado !== 'ok' || !Array.isArray(o.fugasNuevas)) return { estado: 'sin_datos', causa: causa(r) }
  const fugasNuevas: Fuga[] = []
  for (const f of o.fugasNuevas) {
    const x = leerFuga(f)
    if (!x) return { estado: 'sin_datos', causa: 'asegura devolvió una pérdida sin id, tipo o cliente' }
    fugasNuevas.push(x)
  }
  const numONull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    estado: 'ok',
    dato: {
      primeraVez: o.primeraVez === true,
      detectados: num(o.detectados),
      nuevos: num(o.nuevos),
      porTipo: (typeof o.porTipo === 'object' && o.porTipo !== null ? o.porTipo : {}) as Record<string, number>,
      fugasNuevas,
      polizasEnFoto: num(o.polizasEnFoto),
      retencionesAbiertas: numONull(o.retencionesAbiertas),
      retencionesFallidas: numONull(o.retencionesFallidas),
      retencionesCerradas: numONull(o.retencionesCerradas),
      aprobacionesNuevas: numONull(o.aprobacionesNuevas),
      aprobacionesFallidas: numONull(o.aprobacionesFallidas),
      anulacionesConfirmadas: numONull(o.anulacionesConfirmadas),
      sustitucionesEnlazadas: numONull(o.sustitucionesEnlazadas),
      sustitucionesAmbiguas: numONull(o.sustitucionesAmbiguas),
      duplicidades: numONull(o.duplicidades),
      sustitucionesFallidas: o.sustitucionesFallidas === true,
      presupuestosEmitidos: numONull(o.presupuestosEmitidos),
      anulacionesPorSustitucion: numONull(o.anulacionesPorSustitucion),
      oportunidadesGanadas: numONull(o.oportunidadesGanadas),
    },
  }
}

export async function fugasPendientes(): Promise<Lectura<Fuga[]>> {
  const r = await llamar('/api/operador/eventos', { method: 'GET' })
  if ('error' in r) return { estado: 'sin_datos', causa: r.error }
  if (r.status !== 200 || r.json.estado !== 'ok' || !Array.isArray(r.json.fugas)) return { estado: 'sin_datos', causa: causa(r) }
  const fugas: Fuga[] = []
  for (const f of r.json.fugas) {
    const x = leerFuga(f)
    if (x) fugas.push(x)
  }
  return { estado: 'ok', dato: fugas }
}

export type ResultadoRevision = { ok: true } | { ok: false; motivo: string }

export async function revisarFuga(id: string, resolucion: 'perdida' | 'no_es_perdida', motivo: string | null, actor: string): Promise<ResultadoRevision> {
  const r = await llamar('/api/operador/eventos', { method: 'PATCH', body: { id, resolucion, motivo, actor } })
  if ('error' in r) return { ok: false, motivo: r.error }
  if (r.status === 200 && r.json.estado === 'ok') return { ok: true }
  if (r.status === 404) return { ok: false, motivo: 'ya estaba revisada o no existe' }
  if (r.status === 422) return { ok: false, motivo: 'resolución no válida (falta el motivo de la pérdida)' }
  return { ok: false, motivo: causa(r) }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Aviso de Telegram (HTML). Nombre del tomador, póliza y compañía; nada de contacto. */
export function mensajeFugas(fugas: Fuga[], urlFicha: (clienteId: string) => string | null, retenciones: number | null = null): string {
  const lineas = fugas.slice(0, 15).map((f) => {
    const poliza = [f.aseguradora, f.polizaNumero ? `nº ${f.polizaNumero}` : null].filter(Boolean).join(' ')
    const quien = escapar(f.cliente ?? 'cliente sin nombre')
    const url = urlFicha(f.clienteId)
    const nombre = url ? `<a href="${escapar(url)}">${quien}</a>` : quien
    return `• <b>${escapar(f.titulo)}</b> — ${nombre}${poliza ? ` · ${escapar(poliza)}` : ''}`
  })
  const resto = fugas.length > 15 ? `\n…y ${fugas.length - 15} más en «Hoy».` : ''
  const retener = retenciones && retenciones > 0
    ? `\n\n📞 ${retenciones === 1 ? 'Abierta 1 retención' : `Abiertas ${retenciones} retenciones`} (anulada antes de su vencimiento): llamada de prioridad alta en «Hoy · Tareas de hoy».`
    : ''
  return `📉 <b>Posibles pérdidas de cartera</b> (CIMA, sin sustitución registrada)\n${lineas.join('\n')}${resto}${retener}\n\nRevísalas en /correduria → Hoy: ¿se ha perdido el cliente y por qué?`
}
