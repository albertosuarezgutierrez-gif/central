import type { Anualidad, DocumentoResumen, EstadoClienteDerivado, EvolucionPrima, Retarificabilidad, VeredictoPrima } from '@central/module-seguros'
import { leerDocumentos } from './documentos-asegura.ts'
import { leerContactos, leerIdentidad, type ContactosCliente, type IdentidadFicha } from './cliente-edicion-asegura.ts'
import { leerRelaciones, type RelacionCartera } from './relaciones-asegura.ts'
import { leerSiniestros, type SiniestroCartera } from './siniestros-asegura.ts'
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
  /**
   * Que CIMA la haya traído: asegura lo deriva de `id_poliza_entidad` sobre una
   * póliza de la cartera viva (`apps/asegura/lib/cartera-ficha.ts`).
   * `viva && !confirmadaCima` = emitida por nosotros y aún sin confirmar por
   * CIMA — NO cuenta como viva ni genera avisos. Si asegura no manda el campo
   * (versión anterior), vale `viva` (el comportamiento de siempre).
   *
   * ⚠️ NO es lo mismo que «cartera viva» y NO sirve para filtrarla: cartera
   * viva es `import_ref IS NULL` **O** `eiac_xml_hash IS NOT NULL`
   * (`esCarteraViva` de `@central/module-seguros`), así que desde el 03/09/2026
   * una póliza VIVA puede llevar `import_ref` — la que CIMA mantiene al día
   * sobre una fila que ya venía del volcado. Preguntar `import_ref IS NULL` aquí
   * mandaría esas pólizas al bloque «emitidas, pendientes de CIMA», que es falso.
   * Quien lo decide es asegura: esta app no toca la BD de la cartera, solo pinta
   * lo que le mandan (y si no manda el campo, cae a `viva`).
   */
  confirmadaCima: boolean
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
  /**
   * «¿Por qué ha subido la prima?» en compacto (veredicto + % + frase).
   * `null` = la versión desplegada de asegura no lo manda o llega ilegible:
   * NO es `sin_datos` (que es «se miró y CIMA no da la anualidad anterior»).
   */
  evolucionPrima: EvolucionPrimaCompacta | null
}

/** Lo que la ficha del cliente recibe por póliza: el veredicto sin la lista de anualidades. */
export type EvolucionPrimaCompacta = Pick<EvolucionPrima, 'veredicto' | 'variacionPct' | 'explicacion'>

/**
 * Un siniestro de la ficha. La forma la fija `siniestros-asegura.ts`
 * (`leerSiniestro`, con los defaults conservadores para una asegura vieja);
 * aquí se re-exporta con el nombre de siempre para quien ya lo importaba.
 */
export type SiniestroFicha = SiniestroCartera
export type { SiniestroCartera }

export type ContactoFicha = {
  telefono: string | null
  email: string | null
  telefonoIlegible: boolean
  emailIlegible: boolean
  ciudad: string | null
  provincia: string | null
  codigoPostal: string | null
  /** La calle va cifrada: `null` + `direccionIlegible` = está pero no abre. */
  direccion: string | null
  direccionIlegible: boolean
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
  /** Etiqueta opaca de QUIÉN es (`p1`, `p2`…), que asegura deriva del NIF.
   *  `null` = la fila no trae NIF, o asegura es de una versión que aún no la
   *  manda: entonces se agrupa como antes, por ficha o por nombre. */
  personaClave: string | null
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
  /**
   * `null` = asegura no manda la lista o no llega con forma de lista: NO es
   * «sin siniestros» (eso es `[]`). Una fila rara se salta, no tumba la ficha.
   */
  siniestros: SiniestroCartera[] | null
  /**
   * `null` = asegura no informa intervinientes (versión desplegada más vieja, o
   * su consulta falló). Entonces «sin teléfono» solo significa «el tomador no
   * lo tiene» — y la pantalla lo dice así, no como «nadie lo tiene».
   */
  intervinientes: IntervinienteFicha[] | null
  /** Documentos del cliente con estado pedido/recibido/revisado. `null` = no informado / no se pudo. */
  documentos: DocumentoResumen[] | null
  /**
   * TODOS los teléfonos y emails (el principal es el que sale en `contacto`).
   * `null` = asegura no manda el bloque o no pudo consultarlo: NO es «no tiene».
   */
  contactos: ContactosCliente | null
  /** Nombre/apellidos/DNI enmascarado/fecha de nacimiento. `null` = versión de asegura anterior. */
  identidad: IdentidadFicha | null
  /**
   * Cónyuge, hijos, empresa… y quién autoriza a quién a ver sus seguros.
   * `null` = asegura no manda el bloque o no pudo consultarlo: NO es «no tiene familia».
   */
  relaciones: RelacionCartera[] | null
  /**
   * Estado DERIVADO por asegura (cliente · con_presupuesto · lead · ex_cliente),
   * con su etiqueta y el motivo. `null` = versión de asegura que aún no lo
   * manda: la pantalla cae a la regla anterior (`tipo==='cliente' || vivas>0`).
   */
  estado: EstadoClienteDerivado | null
  /**
   * Últimas 50 anotaciones, la más reciente primero. `null` = no se pudo leer
   * (o asegura no lo manda); `[]` = se miró y no hay ninguna todavía.
   */
  historial: AnotacionHistorial[] | null
  /** Presupuestos recientes sin póliza. `null` = no se pudo contar, NO es 0. */
  cotizacionesVivas: number | null
}

export type AnotacionHistorial = { id: string; tipo: string; texto: string; fecha: string }

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

const VEREDICTOS_PRIMA: readonly VeredictoPrima[] = ['sube_por_siniestros', 'sube_sin_siniestro', 'no_atribuible', 'igual', 'baja', 'sin_datos']

/** `null` o número finito se devuelven tal cual; cualquier otra cosa es basura → `undefined`. */
function numeroONulo(v: unknown): number | null | undefined {
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * El veredicto compacto de la prima, o `null` si no llega o llega con forma rara.
 *
 * Nunca se inventa un `sin_datos`: ese estado significa «asegura miró y CIMA no
 * manda la anualidad anterior», y aquí solo se sabe que asegura no ha dicho
 * nada. Tampoco un `variacionPct: 0`, que diría «igual» sobre lo que no se sabe.
 */
export function leerEvolucionCompacta(v: unknown): EvolucionPrimaCompacta | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.veredicto !== 'string' || !(VEREDICTOS_PRIMA as readonly string[]).includes(o.veredicto)) return null
  const variacionPct = numeroONulo(o.variacionPct)
  if (variacionPct === undefined) return null
  if (typeof o.explicacion !== 'string') return null
  return { veredicto: o.veredicto as VeredictoPrima, variacionPct, explicacion: o.explicacion }
}

function leerAnualidad(v: unknown): Anualidad | null {
  if (typeof v !== 'object' || v === null) return null
  const a = v as Record<string, unknown>
  const desde = cadena(a.desde)
  const hasta = cadena(a.hasta)
  const recibos = entero(a.recibos)
  const suplementos = entero(a.suplementos)
  const siniestros = entero(a.siniestros)
  const esperados = a.esperados === null ? null : entero(a.esperados)
  const primaTotal = numeroONulo(a.primaTotal)
  const primaNeta = numeroONulo(a.primaNeta)
  const variacionPct = numeroONulo(a.variacionPct)
  if (
    desde === null || hasta === null || recibos === null || suplementos === null || siniestros === null ||
    esperados === undefined || typeof a.completa !== 'boolean' ||
    primaTotal === undefined || primaNeta === undefined || variacionPct === undefined
  ) return null
  return { desde, hasta, recibos, esperados, completa: a.completa, primaTotal, primaNeta, suplementos, siniestros, variacionPct }
}

/**
 * La evolución entera (con anualidades), o `null` si no llega o llega rara.
 * Una anualidad ilegible tumba el bloque entero: media lista compararía mal
 * y pintaría un porcentaje sobre ciclos que no están.
 */
export function leerEvolucionPrima(v: unknown): EvolucionPrima | null {
  const compacta = leerEvolucionCompacta(v)
  if (compacta === null) return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.anualidades)) return null
  const anualidades: Anualidad[] = []
  for (const fila of o.anualidades) {
    const a = leerAnualidad(fila)
    if (a === null) return null
    anualidades.push(a)
  }
  const siniestrosSinFecha = entero(o.siniestrosSinFecha)
  if (siniestrosSinFecha === null) return null
  return { ...compacta, anualidades, siniestrosSinFecha }
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
      personaClave: cadena(i.personaClave),
      esTomador: i.esTomador === true,
      origen: cadena(i.origen) ?? 'sin_informar',
    })
  }
  return out
}

const ESTADOS_CLIENTE = new Set(['cliente', 'con_presupuesto', 'lead', 'ex_cliente'])

/**
 * El estado derivado, o `null` si no llega o llega con forma rara. Nunca se
 * inventa un `lead`: eso pintaría «no es cliente» sobre alguien de quien solo
 * se sabe que asegura no ha dicho nada.
 */
export function leerEstadoCliente(v: unknown): EstadoClienteDerivado | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string' || !ESTADOS_CLIENTE.has(o.estado)) return null
  const etiqueta = cadena(o.etiqueta)
  const motivo = cadena(o.motivo)
  if (etiqueta === null || motivo === null) return null
  return { estado: o.estado as EstadoClienteDerivado['estado'], etiqueta, motivo }
}

export const MAX_HISTORIAL = 50

/**
 * El historial, o `null` si no llega o no es lista. Una fila rara se salta
 * (no tumba el bloque); una LISTA que no es lista degrada a `null` entero —
 * jamás a `[]`, que diría «sin anotaciones».
 */
export function leerHistorial(v: unknown): AnotacionHistorial[] | null {
  if (!Array.isArray(v)) return null
  const out: AnotacionHistorial[] = []
  for (const fila of v) {
    if (typeof fila !== 'object' || fila === null) continue
    const h = fila as Record<string, unknown>
    const id = cadena(h.id)
    const tipo = cadena(h.tipo)
    const fecha = cadena(h.fecha)
    if (id === null || tipo === null || fecha === null || typeof h.texto !== 'string') continue
    out.push({ id, tipo, texto: h.texto, fecha })
    if (out.length >= MAX_HISTORIAL) break
  }
  return out
}

/** «2026-06-03» (o un ISO con hora) → «03/06/2026». Una fecha ilegible se deja tal cual. */
export function fechaEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y && /^\d{4}$/.test(y) ? `${d}/${m}/${y}` : iso
}

/** «2026-09-02T14:30:00Z» → «02/09/2026 16:30» (hora de Madrid). Una fecha ilegible se deja tal cual. */
export function fechaHoraEs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d
    .toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .replace(',', '')
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
  if (!Array.isArray(f.polizas)) {
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
      // Sin el campo (asegura viejo) vale `viva`: es lo que se pintaba antes.
      confirmadaCima: typeof p.confirmadaCima === 'boolean' ? p.confirmadaCima : p.viva === true,
      retarificable: p.retarificable === true,
      retarificacion: leerRetarificacion(p.retarificacion),
      recibos: leerRecibos(p.recibos),
      pago: leerPago(p.pago),
      evolucionPrima: leerEvolucionCompacta(p.evolucionPrima),
    })
  }

  // Los siniestros no invalidan la ficha: una fila rara se salta y una lista
  // que no es lista queda en `null` («no se pudo leer»), que la pantalla dice.
  const siniestros = leerSiniestros(f.siniestros)

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
        direccion: cadena(c.direccion),
        direccionIlegible: c.direccionIlegible === true,
      },
      polizas,
      siniestros,
      intervinientes: leerIntervinientes(f.intervinientes),
      documentos: leerDocumentos(f.documentos),
      contactos: leerContactos(f.contactos),
      identidad: leerIdentidad(f.identidad),
      relaciones: leerRelaciones(f.relaciones),
      estado: leerEstadoCliente(f.estado),
      historial: leerHistorial(f.historial),
      cotizacionesVivas: entero(f.cotizacionesVivas),
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

/**
 * La pantalla de retarificación, **DENTRO de plataforma** desde el 03/09/2026.
 *
 * Antes devolvía la URL de `apps/asegura`, y ese salto era el problema: es otro
 * dominio con otra sesión, así que en producción `GET /cartera/poliza/<id>`
 * respondía `307 /login` y Alberto se quedaba fuera. La operación la sirve ahora
 * el puerto de operador y la pinta `/correduria/poliza/<id>/retarificar`.
 *
 * Al ser interna, **quien la enlace no necesita `target="_blank"`**: abrir una
 * pestaña nueva para quedarse en la misma app solo estorba en el móvil.
 * Lo vigila `test/regression-retarificar-plataforma.test.ts`.
 */
export function urlRetarificar(polizaId: string): string {
  return `/correduria/poliza/${polizaId}/retarificar`
}

/**
 * El salto a asegura que TODAVÍA queda: **hogar**.
 *
 * Su retarificador es otro componente (metros, año de construcción, capitales y
 * el Catastro del riesgo) y no está portado. No se enlaza desde las fichas: solo
 * lo usa la pantalla interna cuando la póliza resulta ser de hogar, para mandar
 * al único sitio donde hoy funciona en vez de fingir que no se puede.
 * Pública, no es un secreto.
 */
export function urlRetarificarHogarAsegura(polizaId: string): string {
  return `${urlAsegura()}/cartera/poliza/${polizaId}`
}

/** Subir una póliza (PDF o foto) para que el agente la lea. Vive en asegura
 *  porque comparte pantalla con la cotización que sale de lo leído. Gratis. */
export function urlSubirPoliza(): string {
  return `${urlAsegura()}/cartera/subir`
}
