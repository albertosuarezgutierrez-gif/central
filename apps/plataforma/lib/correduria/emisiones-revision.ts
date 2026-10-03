// Cola de revisión de emisiones de Avant2 (Codeoscopic) — lectura de la respuesta de asegura y textos
// de la pantalla «Emisiones a revisar» de /correduria (03/10/2026). PURO (sin red ni React).
//
// El descubrimiento automático registra solo lo que puede demostrar y deja el resto en una cola;
// aquí se decide cómo se cuenta. 🚨 Un fallo de lectura NUNCA es «nada pendiente»: es `error`, y el
// contador es `null` (no se sabe), nunca 0.

export const MOTIVOS_REVISION = [
  'sin_cliente', 'varios_clientes', 'sin_documento', 'ramo_sin_acunar',
  'emitida_sin_acunar', 'estado_desconocido', 'bloqueada',
] as const
export type MotivoRevision = (typeof MOTIVOS_REVISION)[number]

type TextoMotivo = { titulo: string; que: string }

const TEXTOS: Record<MotivoRevision, TextoMotivo> = {
  sin_cliente: {
    titulo: 'El tomador no está en la cartera',
    que: 'El documento del tomador no casa con ninguna ficha. Crea la ficha o localiza al cliente y registra la emisión a mano.',
  },
  varios_clientes: {
    titulo: 'El tomador casa con varias fichas',
    que: 'Hay más de una ficha con ese documento (¿duplicada?). No se ha elegido ninguna: decide cuál es y registra la emisión.',
  },
  sin_documento: {
    titulo: 'El proyecto no trae documento del tomador',
    que: 'Sin documento no se demuestra de quién es la póliza, y por nombre no se adivina. Míralo en Avant2 y regístrala a mano.',
  },
  ramo_sin_acunar: {
    titulo: 'Emitida en un ramo que no se acuña sola',
    que: 'Hogar, salud, vida o decesos con nº de póliza: la intranet no los acuña sola. Regístrala a mano.',
  },
  emitida_sin_acunar: {
    titulo: 'Emitida, pero no se pudo acuñar',
    que: 'Auto o moto aprobada con nº de póliza, pero el acuñado no cuajó (p. ej. falta el código DGS). Revisa el detalle.',
  },
  estado_desconocido: {
    titulo: 'Estado de la solicitud desconocido',
    que: 'Avant2 da un estado que no reconocemos. Míralo allí para saber si está emitida.',
  },
  bloqueada: {
    titulo: 'El registro se negó',
    que: 'La intranet se negó a registrar la emisión (409/422). El motivo está en el detalle.',
  },
}

/** Un motivo que no conocemos se enseña tal cual: no se esconde bajo un texto inventado. */
export function textoMotivo(motivo: string): TextoMotivo {
  return (TEXTOS as Record<string, TextoMotivo>)[motivo] ?? {
    titulo: `Motivo desconocido: ${motivo}`,
    que: 'asegura devolvió un motivo que esta pantalla no conoce. Míralo en Avant2.',
  }
}

/**
 * `coincidencias` NULL = «no se buscó» (nunca «0»). Solo habla de fichas cuando el motivo es de
 * búsqueda y hay número.
 */
export function textoCoincidencias(motivo: string, c: number | null): string | null {
  if (c === null) return null
  if (motivo !== 'sin_cliente' && motivo !== 'varios_clientes') return null
  return c === 1 ? '1 ficha con ese documento' : `${c} fichas con ese documento`
}

export type FilaRevision = {
  id: string
  projectId: string
  motivo: string
  coincidencias: number | null
  ramoVendor: string | null
  estadoEmision: string | null
  compania: string | null
  numeroPoliza: string | null
  clienteId: string | null
  detalle: string | null
  veces: number
  primeraVezAt: string | null
  ultimaVezAt: string | null
}

export type ColaRevision =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; total: number; filas: FilaRevision[]; hayMas: boolean }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const cad = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const ent = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/codeoscopic/emisiones-revision`. `desde` = cuántas filas había ya cargadas
 * (para saber si hay más). Una fila ilegible NO se descarta en silencio: toda la lectura es
 * `respuesta_ilegible`, porque una lista a medias no es «lo que hay».
 */
export function interpretarCola(status: number, json: unknown, desde = 0): ColaRevision {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json)
  if (o?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status !== 200 || !o) return { estado: 'error', motivo: cad(o?.mensaje) ?? 'asegura_error' }
  if (o.estado !== 'ok') return { estado: 'error', motivo: cad(o.mensaje) ?? 'asegura_error' }
  const total = ent(o.total)
  if (total === null || !Array.isArray(o.filas)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const filas: FilaRevision[] = []
  for (const f of o.filas) {
    const x = obj(f)
    const id = cad(x?.id)
    const projectId = cad(x?.projectId)
    const motivo = cad(x?.motivo)
    if (!x || !id || !UUID.test(id) || !projectId || !motivo) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const cliente = cad(x.clienteId)
    filas.push({
      id,
      projectId,
      motivo,
      coincidencias: ent(x.coincidencias),
      ramoVendor: cad(x.ramoVendor),
      estadoEmision: cad(x.estadoEmision),
      compania: cad(x.compania),
      numeroPoliza: cad(x.numeroPoliza),
      clienteId: cliente && UUID.test(cliente) ? cliente : null,
      detalle: cad(x.detalle),
      veces: ent(x.veces) ?? 1,
      primeraVezAt: cad(x.primeraVezAt),
      ultimaVezAt: cad(x.ultimaVezAt),
    })
  }
  return { estado: 'ok', total, filas, hayMas: desde + filas.length < total }
}

export type Resolucion =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; yaResuelta: boolean }

/** `POST .../{id}/resolver`: `resuelta` y `ya_resuelta` son ambas «ya no está abierta» (idempotente). */
export function interpretarResolucion(status: number, json: unknown): Resolucion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json)
  if (o?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 200 && o?.estado === 'resuelta') return { estado: 'ok', yaResuelta: false }
  if (status === 200 && o?.estado === 'ya_resuelta') return { estado: 'ok', yaResuelta: true }
  return { estado: 'error', motivo: cad(o?.mensaje) ?? (status === 404 ? 'esa revisión no existe' : 'asegura_error') }
}

export type PantallaCola = 'cargando' | 'sin_configurar' | 'error' | 'vacia' | 'lista'

/** Qué se pinta. `vacia` SOLO con una lectura buena que dice 0: un fallo nunca llega a «nada pendiente». */
export function pantallaCola(c: ColaRevision | null): PantallaCola {
  if (c === null) return 'cargando'
  if (c.estado === 'sin_configurar') return 'sin_configurar'
  if (c.estado === 'error') return 'error'
  return c.total === 0 && c.filas.length === 0 ? 'vacia' : 'lista'
}

/** Contador de la barra: `undefined` = aún no contestó · `null` = no se sabe · número = abiertas. */
export function contadorCola(c: ColaRevision | null): number | null | undefined {
  if (c === null) return undefined
  return c.estado === 'ok' ? c.total : null
}

/**
 * Lo que el navegador recibe de NUESTRO proxy (ya interpretado en el servidor). Una respuesta que no
 * tiene la forma esperada (HTML de un 502/504 de Vercel, sesión caducada…) es `error`: jamás se
 * convierte en «nada pendiente».
 */
export function colaDeProxy(status: number, json: unknown): ColaRevision {
  const o = obj(json)
  if (!o) return { estado: 'error', motivo: status === 401 || status === 403 ? 'sin_sesion' : 'respuesta_ilegible' }
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'ok' && status === 200 && ent(o.total) !== null && Array.isArray(o.filas) && typeof o.hayMas === 'boolean') {
    return { estado: 'ok', total: o.total as number, filas: o.filas as FilaRevision[], hayMas: o.hayMas }
  }
  if (o.estado === 'error') return { estado: 'error', motivo: cad(o.motivo) ?? 'asegura_error' }
  return { estado: 'error', motivo: 'respuesta_ilegible' }
}

/** Deduplica filas por `id` cuando se concatenan resultados de «Ver más». Conserva el orden. */
export function deduplicarFilas(filas: FilaRevision[]): FilaRevision[] {
  const vistas = new Set<string>()
  return filas.filter((f) => {
    if (vistas.has(f.id)) return false
    vistas.add(f.id)
    return true
  })
}

/** Motivo de un fallo de lectura, en castellano llano. */
export function textoErrorCola(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado': return 'asegura rechaza el secreto del puerto (ASEGURA_OPERADOR_SECRET).'
    case 'red': return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    case 'respuesta_ilegible': return 'la respuesta no tenía la forma esperada.'
    case 'sin_sesion': return 'la sesión ha caducado: vuelve a entrar.'
    case 'asegura_error': return 'asegura no pudo leer la cola.'
    default: return motivo
  }
}
