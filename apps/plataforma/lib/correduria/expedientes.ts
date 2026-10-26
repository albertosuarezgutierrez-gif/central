/**
 * «Mis expedientes» (13/10/2026): lo que Alberto tiene abierto en TODOS los clientes, leído del puerto
 * de asegura (`GET /api/operador/expedientes`). PURO: interpreta la respuesta; la red va por
 * `expedientesAsegura()` de `lib/seguimiento-asegura.ts`.
 *
 * Tres estados, como el resto del puerto: lista vacía con `ok` = no hay nada abierto; `sin_configurar`
 * y `error` = no se ha podido mirar (la pantalla nunca lo pinta como «0 abiertas»). Clase y estado
 * visible los decide asegura con `@central/module-seguros`; aquí solo se valida la forma, y una fila con
 * un valor que esta versión no conoce se CUENTA en `descartadas`, no se pinta a ciegas.
 */
import {
  CLASES_EXPEDIENTE,
  ESTADOS_VISIBLES,
  type ClaseExpediente,
  type EstadoVisible,
} from '@central/module-seguros'

/**
 * Teléfono/email del cliente de la fila (lo descifra asegura con su lector único `contactosDe`), para
 * llamar · WhatsApp · correo. `null` = no se pudo leer, la fila no cuelga de ninguna ficha, o asegura
 * todavía no lo manda. Un campo `null` = no consta o no se descifra: la pantalla no pinta el icono, NUNCA
 * dice «no tiene teléfono» (es el contacto del titular, sin caer a los intervinientes de sus pólizas).
 */
export type ContactoFila = { telefono: string | null; email: string | null }

export type ReciboRescate = {
  reciboId: string
  idRecibo: string | null
  /** `null` = no consta: nunca se pinta 0,00€. */
  importe: number | null
  efecto: string | null
  suspensionDesde: string | null
  hito: string | null
  situacion: string | null
}

export type Expediente = {
  id: string
  clienteId: string
  cliente: string | null
  ramo: string | null
  clase: ClaseExpediente
  estadoVisible: Exclude<EstadoVisible, 'ganada' | 'perdida'>
  estado: string
  delVolcado: boolean
  aparcadaHasta: string | null
  aparcadaMotivo: string | null
  /** `null` = sin próxima acción (huérfana: nadie la va a mirar si no se le pone una). */
  proximaAccion: { tareaId: string; texto: string; tipo: string; fecha: string | null } | null
  /** `null` = no se sabe. */
  prima: number | null
  fechaFinVigencia: string | null
  notas: string | null
  creada: string
  /** Solo en un rescate; `recibo: null` = no se ha podido localizar el recibo (no «no hay»). */
  rescate: { tipo: 'recibo' | 'anulacion'; recibo: ReciboRescate | null } | null
  contacto: ContactoFila | null
  /**
   * `false` = renovación automática sin ningún contacto registrado (no la ha trabajado Alberto → «Renovaciones
   * sin tocar»). `null` = asegura no lo manda (versión anterior): no se esconde nada, no se supone.
   */
  trabajada: boolean | null
  /**
   * Cómo entró (`info_riesgo.origen`: `correo:lead`, `web:*`, `portal:*`, `documento:portal`, `renovacion_cartera`…).
   * `null` = no consta (o asegura aún no lo manda): Mi mesa NO lo esconde.
   */
  origen: string | null
  /** Último contacto humano (ISO). `null` = no consta / ninguno registrado / asegura aún no lo manda: no se supone «hace mucho». */
  ultimoContacto: string | null
  /** `false` = asegura aún no manda `ultimoContacto` (versión anterior): `null` ahí es «no se sabe», no «sin contacto». */
  contactoConsta: boolean
  /** Presupuestos (ofertas no descartadas) de la operación. `null` = no consta. */
  presupuestos: number | null
  /** Vencimiento de la póliza (aaaa-mm-dd). `null` = no se sabe: la operación NO se esconde por eso. */
  vencimiento: string | null
  /**
   * «En la compañía» (20/10/2026): nº de solicitud en el portal de la compañía. `null` = no lo lleva (o asegura aún no
   * lo manda). `estado`/`url` `null` = la compañía aún no ha escrito. La `url` ya viene validada de asegura y aquí se
   * vuelve a exigir `https://` (se pinta como enlace).
   */
  solicitudCompania: { numero: string; compania: string; estado: string | null; url: string | null; at: string | null } | null
}

/** Tarea abierta SIN oportunidad (no es expediente, pero no puede perderse). Se cierra por su `tareaId`. */
export type TareaSuelta = {
  tareaId: string
  clienteId: string | null
  cliente: string | null
  polizaId: string | null
  siniestroId: string | null
  tipo: string
  estado: string
  texto: string
  fecha: string | null
  origen: string | null
  contacto: ContactoFila | null
}

/** Pérdida de cartera por revisar (fila sin expediente; se resuelve con `PATCH /api/correduria/fugas`). */
export type PerdidaPorRevisar = {
  id: string
  tipo: string
  titulo: string
  clienteId: string
  cliente: string | null
  polizaId: string | null
  polizaNumero: string | null
  aseguradora: string | null
  motivo: string | null
  anulacion: string | null
  ultimoRecibo: string | null
  nota: string | null
  contacto: ContactoFila | null
}

export type Expedientes =
  | {
      estado: 'ok'
      hoy: string
      expedientes: Expediente[]
      /** `null` = esa parte no se pudo leer en asegura (NO «no hay ninguna»). */
      tareasSueltas: TareaSuelta[] | null
      tareasSueltasTruncado: boolean
      /** `null` = no se pudo leer (NO «no hay ninguna»). */
      perdidasPorRevisar: PerdidaPorRevisar[] | null
      /** Pérdidas que no se listan porque su póliza ya tiene expediente abierto. `null` = no consta. */
      perdidasConExpediente: number | null
      /** `null` = asegura no lo manda: se cuenta en la pantalla, no se supone 0. */
      recuento: Record<'abierta' | 'esperando_cliente' | 'aparcada', number> | null
      truncado: boolean
      /** Las que asegura descartó + las que aquí no tenían la forma esperada. */
      descartadas: number
    }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function importe(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/** Sin objeto = «no se sabe» (`null`), nunca `{ telefono: null, email: null }` («se miró y no consta»). */
function contacto(v: unknown): ContactoFila | null {
  const c = objeto(v)
  return c ? { telefono: texto(c.telefono), email: texto(c.email) } : null
}

const VISIBLES_ABIERTOS = ESTADOS_VISIBLES.filter((e): e is Expediente['estadoVisible'] => e !== 'ganada' && e !== 'perdida')

function recibo(v: unknown): ReciboRescate | null {
  const r = objeto(v)
  const reciboId = texto(r?.reciboId)
  if (!r || !reciboId) return null
  return {
    reciboId,
    idRecibo: texto(r.idRecibo),
    importe: importe(r.importe),
    efecto: texto(r.efecto),
    suspensionDesde: texto(r.suspensionDesde),
    hito: texto(r.hito),
    situacion: texto(r.situacion),
  }
}

function fila(v: unknown): Expediente | null {
  const r = objeto(v)
  if (!r) return null
  const id = texto(r.id)
  const clienteId = texto(r.clienteId)
  const estado = texto(r.estado)
  const creada = texto(r.creada)
  const clase = CLASES_EXPEDIENTE.find((c) => c === r.clase)
  const ev = VISIBLES_ABIERTOS.find((e) => e === r.estadoVisible)
  if (!id || !clienteId || !estado || !creada || !clase || !ev) return null
  const p = objeto(r.proximaAccion)
  const tareaId = texto(p?.tareaId)
  const tipo = texto(p?.tipo)
  const resc = objeto(r.rescate)
  const tipoRescate = resc?.tipo === 'recibo' || resc?.tipo === 'anulacion' ? resc.tipo : null
  return {
    id,
    clienteId,
    cliente: texto(r.cliente),
    ramo: texto(r.ramo),
    clase,
    estadoVisible: ev,
    estado,
    delVolcado: r.delVolcado === true,
    aparcadaHasta: texto(r.aparcadaHasta),
    aparcadaMotivo: texto(r.aparcadaMotivo),
    proximaAccion: p && tareaId && tipo
      ? { tareaId, tipo, texto: typeof p.texto === 'string' ? p.texto : '', fecha: texto(p.fecha) }
      : null,
    prima: importe(r.prima),
    fechaFinVigencia: texto(r.fechaFinVigencia),
    notas: texto(r.notas),
    creada,
    rescate: tipoRescate ? { tipo: tipoRescate, recibo: recibo(resc?.recibo) } : null,
    contacto: contacto(r.contacto),
    trabajada: typeof r.trabajada === 'boolean' ? r.trabajada : null,
    origen: texto(r.origen),
    ultimoContacto: texto(r.ultimoContacto),
    contactoConsta: 'ultimoContacto' in r,
    presupuestos: entero(r.presupuestos),
    vencimiento: texto(r.vencimiento),
    solicitudCompania: solicitud(r.solicitudCompania),
  }
}

function solicitud(v: unknown): Expediente['solicitudCompania'] {
  const s = objeto(v)
  const numero = texto(s?.numero)
  const compania = texto(s?.compania)
  if (!s || !numero || !compania) return null
  const url = texto(s.url)
  return { numero, compania, estado: texto(s.estado), url: url && url.startsWith('https://') ? url : null, at: texto(s.at) }
}

function tareaSuelta(v: unknown): TareaSuelta | null {
  const r = objeto(v)
  const tareaId = texto(r?.tareaId)
  const tipo = texto(r?.tipo)
  const estado = texto(r?.estado)
  if (!r || !tareaId || !tipo || !estado) return null
  return {
    tareaId, tipo, estado,
    clienteId: texto(r.clienteId), cliente: texto(r.cliente), polizaId: texto(r.polizaId), siniestroId: texto(r.siniestroId),
    texto: typeof r.texto === 'string' ? r.texto : '', fecha: texto(r.fecha), origen: texto(r.origen),
    contacto: contacto(r.contacto),
  }
}

function perdida(v: unknown): PerdidaPorRevisar | null {
  const r = objeto(v)
  const id = texto(r?.id)
  const tipo = texto(r?.tipo)
  const clienteId = texto(r?.clienteId)
  if (!r || !id || !tipo || !clienteId) return null
  return {
    id, tipo, clienteId, titulo: texto(r.titulo) ?? tipo,
    cliente: texto(r.cliente), polizaId: texto(r.polizaId), polizaNumero: texto(r.polizaNumero), aseguradora: texto(r.aseguradora),
    motivo: texto(r.motivo), anulacion: texto(r.anulacion), ultimoRecibo: texto(r.ultimoRecibo), nota: texto(r.nota),
    contacto: contacto(r.contacto),
  }
}

/** Lista opcional con tres estados: no es array → `null` («no se pudo leer»); filas malformadas se cuentan. */
function lista<T>(v: unknown, f: (x: unknown) => T | null): { filas: T[] | null; malas: number } {
  if (!Array.isArray(v)) return { filas: null, malas: 0 }
  const filas: T[] = []
  let malas = 0
  for (const x of v) { const y = f(x); if (y) filas.push(y); else malas++ }
  return { filas, malas }
}

export function interpretarExpedientes(status: number, json: unknown): Expedientes {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.expedientes)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const expedientes: Expediente[] = []
  let descartadas = entero(o.descartadas) ?? 0
  for (const v of o.expedientes) {
    const e = fila(v)
    if (e) expedientes.push(e)
    else descartadas++
  }
  const rc = objeto(o.recuento)
  const a = entero(rc?.abierta)
  const ec = entero(rc?.esperando_cliente)
  const ap = entero(rc?.aparcada)
  const sueltas = lista(o.tareasSueltas, tareaSuelta)
  const perdidas = lista(o.perdidasPorRevisar, perdida)
  return {
    estado: 'ok',
    hoy: texto(o.hoy) ?? '',
    expedientes,
    tareasSueltas: sueltas.filas,
    // Una fila malformada no se pinta a ciegas, pero la lista deja de estar completa: se dice como truncada.
    tareasSueltasTruncado: o.tareasSueltasTruncado === true || sueltas.malas > 0,
    perdidasPorRevisar: perdidas.malas > 0 ? null : perdidas.filas,
    perdidasConExpediente: entero(o.perdidasConExpediente),
    recuento: a !== null && ec !== null && ap !== null ? { abierta: a, esperando_cliente: ec, aparcada: ap } : null,
    truncado: o.truncado === true,
    descartadas,
  }
}
