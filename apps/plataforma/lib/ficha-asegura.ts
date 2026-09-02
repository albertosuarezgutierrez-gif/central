import type { DocumentoResumen, Retarificabilidad } from '@central/module-seguros'
import { leerDocumentos } from './documentos-asegura.ts'
// La ficha de un cliente de la correduría, leída por el puerto de central-asegura.
//
// ─── Por qué esto vive en plataforma y no en asegura ────────────────────────
// Alberto usa UNA pantalla: este cuadro de mando, con todos sus negocios. La
// correduría es un negocio más, y `apps/asegura` es su BACK (tiene la BD de la
// cartera y el botón que gasta dinero al retarificar), no una pantalla a la que
// entrar. Así que la ficha se pinta aquí y asegura la sirve por HTTP.
//
// Misma disciplina de estados que `cartera-asegura.ts`, con uno más:
// `no_encontrado` significa «se ha mirado y no está», que es DISTINTO de
// `error` («no se ha podido mirar»). Colapsarlos diría que un cliente no existe
// cuando lo que pasa es que el puerto no responde.

export type EstadoFicha = 'sin_configurar' | 'error' | 'no_encontrado' | 'ok'

export type RecibosPoliza = {
  /** `0` = la compañía no ha informado recibos. NO es «al corriente». */
  total: number
  pendientes: number
  devueltos: number
  cobrados: number
  anulados: number
  cobradoEur: number | null
  ilegibles: number
  ultimo: {
    id: string
    situacion: string
    importe: number | null
    fechaEmision: string | null
    fechaVencimiento: string | null
    formaPago: string | null
  } | null
}

export type ObjetoFicha = {
  estado: 'conocido' | 'no_informado' | 'cifrado' | 'sin_objeto'
  titulo: string | null
  detalle: string | null
  nota: string | null
}

/** El recargo por fraccionar: TRES estados. `sin_datos` nunca se pinta como 0€. */
export type RecargoFicha =
  | { estado: 'no_aplica' }
  | { estado: 'sin_datos'; motivo: string }
  | { estado: 'calculado'; primaAnual: number; sumaRecibos: number; recargoEur: number; recargoPct: number; recibos: number }

export type PagoFicha = {
  fraccionamiento: string | null
  formaCobro: string | null
  recargo: RecargoFicha
}

export type PolizaFicha = {
  id: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  fechaInicio: string | null
  fechaVencimiento: string | null
  prima: number | null
  fraccionamiento: string | null
  objeto: ObjetoFicha | null
  matricula: string | null
  viva: boolean
  retarificable: boolean
  /** Por qué ramo se retarifica (auto/hogar), por qué NO, y de dónde salen los
   *  datos del riesgo. `null` = la versión desplegada de asegura aún no lo manda:
   *  entonces se cae al booleano `retarificable` de siempre. */
  retarificacion: Retarificabilidad | null
  /** `null` = la versión desplegada de asegura aún no manda el bloque de recibos.
   *  NO es «no tiene recibos»: eso sería `total: 0`, que ya significa otra cosa. */
  recibos: RecibosPoliza | null
  /** `null` = asegura no manda el bloque de pago (versión más vieja). */
  pago: PagoFicha | null
}

export type SiniestroFicha = {
  id: string
  polizaId: string
  estado: string
  tipo: string | null
  referencia: string | null
  fecha: string | null
  reserva: number | null
  indemnizacion: number | null
  tramitador: string | null
  abierto: boolean
}

export type ContactoFicha = {
  telefono: string | null
  email: string | null
  telefonoIlegible: boolean
  emailIlegible: boolean
  ciudad: string | null
  provincia: string | null
  codigoPostal: string | null
}

/** Quién más hay en una póliza. Misma forma que en `@central/module-seguros`. */
export type IntervinienteFicha = {
  polizaId: string
  rol: string
  nombre: string | null
  nombreIlegible: boolean
  telefono: string | null
  email: string | null
  telefonoIlegible: boolean
  emailIlegible: boolean
  fichaId: string | null
  esTomador: boolean
  origen: string
}

export type Ficha = {
  id: string
  nombre: string
  tipo: string
  segmento: string | null
  contacto: ContactoFicha
  /**
   * Por qué lo cifrado no se abre, según asegura: `sin_clave` · `mal_formada` ·
   * `no_abre` · `sin_muestra` · `ok`. `null` = una versión de asegura que aún
   * no lo manda. Es lo que convierte «cifrado» en «falta la variable en Vercel».
   */
  piiClave: string | null
  polizas: PolizaFicha[]
  siniestros: SiniestroFicha[]
  /**
   * `null` = asegura no informa intervinientes (versión desplegada más vieja, o
   * su consulta falló). Entonces «sin teléfono» solo significa «el tomador no
   * lo tiene» — y la pantalla lo dice así, no como «nadie lo tiene».
   */
  intervinientes: IntervinienteFicha[] | null
  /** Documentos del cliente con estado pedido/recibido/revisado. `null` = no informado / no se pudo. */
  documentos: DocumentoResumen[] | null
}

export type RespuestaFicha =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoFicha }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; ficha: Ficha }

export type MotivoFicha = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

const ESTADOS_OBJETO = new Set(['conocido', 'no_informado', 'cifrado', 'sin_objeto'])

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Número o `null`. Un `null` que llega del puerto se QUEDA en null: es «la
 *  compañía no lo informa», y convertirlo en 0 es la mentira de siempre. */
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

export function leerObjeto(v: unknown): ObjetoFicha | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string' || !ESTADOS_OBJETO.has(o.estado)) return null
  return {
    estado: o.estado as ObjetoFicha['estado'],
    titulo: cadena(o.titulo),
    detalle: cadena(o.detalle),
    nota: cadena(o.nota),
  }
}

/**
 * Los recibos, o `null` si el bloque no llega o llega con forma rara.
 *
 * Una forma rara NO se degrada a un resumen a ceros: eso pintaría «al
 * corriente» sobre una póliza de la que no se sabe nada. Degrada a `null`, que
 * la pantalla ya sabe decir como «no informado».
 */
export function leerRecibos(v: unknown): RecibosPoliza | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const total = entero(o.total)
  const pendientes = entero(o.pendientes)
  const devueltos = entero(o.devueltos)
  const cobrados = entero(o.cobrados)
  if (total === null || pendientes === null || devueltos === null || cobrados === null) return null
  const u = o.ultimo
  return {
    total,
    pendientes,
    devueltos,
    cobrados,
    anulados: entero(o.anulados) ?? 0,
    cobradoEur: numero(o.cobradoEur),
    ilegibles: entero(o.ilegibles) ?? 0,
    ultimo:
      typeof u === 'object' && u !== null
        ? {
            id: String((u as Record<string, unknown>).id ?? ''),
            situacion: cadena((u as Record<string, unknown>).situacion) ?? 'sin_informar',
            importe: numero((u as Record<string, unknown>).importe),
            fechaEmision: cadena((u as Record<string, unknown>).fechaEmision),
            fechaVencimiento: cadena((u as Record<string, unknown>).fechaVencimiento),
            formaPago: cadena((u as Record<string, unknown>).formaPago),
          }
        : null,
  }
}

const RAMOS_RETARIFICABLES = new Set(['auto', 'hogar'])
const FUENTES_RETARIFICACION = new Set(['poliza', 'gemela'])

/**
 * El veredicto de retarificación, o `null` si no llega o llega con forma rara.
 *
 * Nunca se inventa un `{retarificable:false}`: eso pintaría «no se puede» sobre
 * una póliza de la que solo se sabe que asegura no ha dicho nada. `null` deja
 * que la pantalla caiga al booleano `retarificable` de siempre.
 */
export function leerRetarificacion(v: unknown): Retarificabilidad | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.retarificable !== 'boolean') return null
  const ramo = o.ramo === null ? null : typeof o.ramo === 'string' && RAMOS_RETARIFICABLES.has(o.ramo) ? o.ramo : undefined
  const fuente = o.fuente === null ? null : typeof o.fuente === 'string' && FUENTES_RETARIFICACION.has(o.fuente) ? o.fuente : undefined
  if (ramo === undefined || fuente === undefined) return null
  if (o.motivo !== null && typeof o.motivo !== 'string') return null
  return {
    ramo: ramo as Retarificabilidad['ramo'],
    retarificable: o.retarificable,
    motivo: cadena(o.motivo),
    fuente: fuente as Retarificabilidad['fuente'],
  }
}

/** El bloque de pago, o `null` si no llega. Un recargo con estado raro se
 *  degrada a `sin_datos`: nunca a «calculado» con un número que nadie calculó. */
export function leerPago(v: unknown): PagoFicha | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const r = (typeof o.recargo === 'object' && o.recargo !== null ? o.recargo : {}) as Record<string, unknown>
  let recargo: RecargoFicha
  if (r.estado === 'no_aplica') recargo = { estado: 'no_aplica' }
  else if (
    r.estado === 'calculado' &&
    numero(r.primaAnual) !== null && numero(r.sumaRecibos) !== null &&
    numero(r.recargoEur) !== null && numero(r.recargoPct) !== null
  ) {
    recargo = {
      estado: 'calculado',
      primaAnual: r.primaAnual as number, sumaRecibos: r.sumaRecibos as number,
      recargoEur: r.recargoEur as number, recargoPct: r.recargoPct as number,
      recibos: entero(r.recibos) ?? 0,
    }
  } else recargo = { estado: 'sin_datos', motivo: cadena(r.motivo) ?? 'sin informar' }
  return { fraccionamiento: cadena(o.fraccionamiento), formaCobro: cadena(o.formaCobro), recargo }
}

/**
 * Los intervinientes, o `null` si el bloque no llega. Una fila con forma rara
 * se salta (no invalida la ficha: son un extra para llamar, no el contrato).
 */
export function leerIntervinientes(v: unknown): IntervinienteFicha[] | null {
  if (!Array.isArray(v)) return null
  const out: IntervinienteFicha[] = []
  for (const fila of v) {
    if (typeof fila !== 'object' || fila === null) continue
    const i = fila as Record<string, unknown>
    const polizaId = cadena(i.polizaId)
    const rol = cadena(i.rol)
    if (polizaId === null || rol === null) continue
    out.push({
      polizaId,
      rol,
      nombre: cadena(i.nombre),
      nombreIlegible: i.nombreIlegible === true,
      telefono: cadena(i.telefono),
      email: cadena(i.email),
      telefonoIlegible: i.telefonoIlegible === true,
      emailIlegible: i.emailIlegible === true,
      fichaId: cadena(i.fichaId),
      esTomador: i.esTomador === true,
      origen: cadena(i.origen) ?? 'sin_informar',
    })
  }
  return out
}

/**
 * Interpretación PURA de la respuesta del puerto de ficha.
 *
 * Una póliza con forma inesperada invalida la ficha entera, igual que en la
 * lista de vencimientos: media ficha es peor que ninguna, porque nadie sabría
 * qué póliza falta — y la que falta puede ser justo la que vence.
 */
export function interpretarFicha(status: number, json: unknown): RespuestaFicha {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status === 404) return { estado: 'no_encontrado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || typeof r.ficha !== 'object' || r.ficha === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const f = r.ficha as Record<string, unknown>
  if (typeof f.id !== 'string' || typeof f.nombre !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  if (!Array.isArray(f.polizas) || !Array.isArray(f.siniestros)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const polizas: PolizaFicha[] = []
  for (const fila of f.polizas) {
    if (typeof fila !== 'object' || fila === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const p = fila as Record<string, unknown>
    if (typeof p.id !== 'string' || typeof p.tipo !== 'string' || typeof p.aseguradora !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    polizas.push({
      id: p.id,
      tipo: p.tipo,
      aseguradora: p.aseguradora,
      numeroPoliza: cadena(p.numeroPoliza),
      estado: cadena(p.estado) ?? 'sin_informar',
      fechaInicio: cadena(p.fechaInicio),
      fechaVencimiento: cadena(p.fechaVencimiento),
      prima: numero(p.prima),
      fraccionamiento: cadena(p.fraccionamiento),
      objeto: leerObjeto(p.objeto),
      matricula: cadena(p.matricula),
      viva: p.viva === true,
      retarificable: p.retarificable === true,
      retarificacion: leerRetarificacion(p.retarificacion),
      recibos: leerRecibos(p.recibos),
      pago: leerPago(p.pago),
    })
  }

  const siniestros: SiniestroFicha[] = []
  for (const fila of f.siniestros) {
    if (typeof fila !== 'object' || fila === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const s = fila as Record<string, unknown>
    if (typeof s.id !== 'string') return { estado: 'error', motivo: 'respuesta_ilegible' }
    siniestros.push({
      id: s.id,
      polizaId: cadena(s.polizaId) ?? '',
      estado: cadena(s.estado) ?? 'sin_informar',
      tipo: cadena(s.tipo),
      referencia: cadena(s.referencia),
      fecha: cadena(s.fecha),
      reserva: numero(s.reserva),
      indemnizacion: numero(s.indemnizacion),
      tramitador: cadena(s.tramitador),
      abierto: s.abierto === true,
    })
  }

  const c = (typeof f.contacto === 'object' && f.contacto !== null ? f.contacto : {}) as Record<string, unknown>
  return {
    estado: 'ok',
    ficha: {
      id: f.id,
      nombre: f.nombre,
      tipo: cadena(f.tipo) ?? 'sin_informar',
      segmento: cadena(f.segmento),
      contacto: {
        telefono: cadena(c.telefono),
        email: cadena(c.email),
        telefonoIlegible: c.telefonoIlegible === true,
        emailIlegible: c.emailIlegible === true,
        ciudad: cadena(c.ciudad),
        provincia: cadena(c.provincia),
        codigoPostal: cadena(c.codigoPostal),
      },
      polizas,
      siniestros,
      intervinientes: leerIntervinientes(f.intervinientes),
      documentos: leerDocumentos(f.documentos),
      piiClave: cadena(typeof f.pii === 'object' && f.pii !== null ? (f.pii as Record<string, unknown>).clave : null),
    },
  }
}

// ── Buscador ────────────────────────────────────────────────────────────────

export type ClienteEncontrado = { id: string; nombre: string; tipo: string; polizas: number }

export type RespuestaBusqueda =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoFicha }
  /** `buscado: false` = el término era demasiado corto; NO es «no hay nadie». */
  | { estado: 'ok'; termino: string; buscado: boolean; clientes: ClienteEncontrado[] }

export function interpretarBusqueda(status: number, json: unknown): RespuestaBusqueda {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.clientes)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const clientes: ClienteEncontrado[] = []
  for (const fila of r.clientes) {
    if (typeof fila !== 'object' || fila === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const c = fila as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.nombre !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    clientes.push({
      id: c.id,
      nombre: c.nombre,
      tipo: cadena(c.tipo) ?? 'sin_informar',
      polizas: entero(c.polizas) ?? 0,
    })
  }
  return {
    estado: 'ok',
    termino: cadena(r.termino) ?? '',
    buscado: r.buscado === true,
    clientes,
  }
}

// ── Llamadas ────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(path: string): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function fichaAsegura(id: string): Promise<RespuestaFicha> {
  try {
    const r = await pedir(`/api/operador/cliente?id=${encodeURIComponent(id)}`)
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarFicha(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export async function buscarEnAsegura(q: string): Promise<RespuestaBusqueda> {
  try {
    const r = await pedir(`/api/operador/clientes?q=${encodeURIComponent(q)}`)
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarBusqueda(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

/** La URL de asegura para los saltos que SÍ tienen que ir allí (retarificar,
 *  que gasta dinero y vive detrás de su propia sesión). Pública, no es secreto. */
export function urlRetarificar(polizaId: string): string {
  return `${urlAsegura()}/cartera/poliza/${polizaId}`
}

/** Subir una póliza (PDF o foto) para que el agente la lea. Vive en asegura
 *  porque comparte pantalla con la cotización que sale de lo leído. Gratis. */
export function urlSubirPoliza(): string {
  return `${urlAsegura()}/cartera/subir`
}
