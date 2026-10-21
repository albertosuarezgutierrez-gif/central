// packages/module-seguros/src/evento-correo-aseguradora.ts
//
// Lee los correos de las compañías que NO son recibos devueltos (eso es `devolucion-correo.ts`) y los
// convierte en EVENTOS de la correduría: siniestro, pre-anulación/impago, anulación, suplemento,
// emisión (póliza nueva) y solicitud (estado de un proyecto en la compañía, 20/10/2026). PURO.
//
// Por qué existe (14/10/2026): el triaje guardaba estos correos como una nota de texto. Un «Siniestro
// Diversos 4300…» o un «Resumen de recibos próximos a la anulación» llevan un nº de siniestro, una
// póliza y una fecha que la cartera puede usar; como nota no los usaba nadie.
//
// Reglas (las mismas que el lector de devoluciones):
// - Determinista, sin IA. `null` = no se reconoce con certeza. Un correo reconocido cuyas filas no se
//   saben leer devuelve el evento con `ilegibles` > 0: «no he sabido leerlo» no es «no hay nada».
// - NUNCA sale un IBAN, un NIF ni el nombre del asegurado/tomador: Occident pone el NIF del cliente en
//   la tabla de siniestros, Reale el nombre del tomador en la de pre-anulaciones y su propio IBAN en el
//   cuerpo. Se empareja por nº de póliza/siniestro/recibo + compañía, y eso basta. Todo texto libre
//   que sale (acción, descripción) pasa por `sinDatosSensibles`.
// - Solo están los formatos vistos en correos REALES (últimos 90 días a 14/10/2026). Fuera a propósito,
//   por no tener con qué leerlos sin inventar: Mapfre «Welcome Pack Digital» (ni en el cuerpo ni en
//   adjunto trae nº de póliza: solo enlaces opacos que piden el NIF; revisado de nuevo el 14/10/2026 con el
//   único que ha llegado), Reale «Recibos Pendientes» (la tabla va en un .xls) y Reale «Impago de recibo»
//   (va al cliente y no trae datos). Allianz «Rel. Emisión Producción» SÍ se lee desde el 14/10/2026: su
//   PDF es texto (no escaneado) y `pdf-filas` lo deja en filas legibles (ver `leerAllianzEmision`).
// - 🚨 Las tablas HTML llegan al triaje CELDA POR LÍNEA y sin `|` (IMAP + `mailparser`, ver `tabla-correo.ts`);
//   las barras son de la vista de Gmail. Todo lector de tabla acepta los dos formatos y tiene su fixture
//   en celda-por-línea (`evento-correo-aseguradora-celdas.test.ts`).

import { celdasPorLinea } from './tabla-correo.ts'

export type CompaniaEvento = 'occident' | 'reale' | 'mapfre' | 'allianz'

const CODIGO: Record<CompaniaEvento, string> = { reale: 'C0613', occident: 'C0468', mapfre: 'C0058', allianz: 'C0109' }

export type CorreoEventoAseguradora = {
  remitente: string
  asunto: string
  /** Cuerpo en texto plano: las tablas HTML llegan CELDA POR LÍNEA (triaje, `mailparser`) o con `|` (Gmail). */
  cuerpoTexto: string
  /** Texto de los adjuntos (PDF/Excel) si el triaje lo ha sacado. */
  textoAdjuntos?: string | null
  /** Fecha del correo, ISO. Solo hace falta para los plazos «en N días» (Mapfre). */
  fecha?: string | null
}

export type SubtipoSiniestro = 'apertura' | 'actualizacion' | 'cierre'

export type SiniestroLeido = {
  subtipo: SubtipoSiniestro
  numeroSiniestro: string
  /** `null` = el correo no la trae (el «Tramitador» no la da). No es «sin póliza». */
  numeroPoliza: string | null
  /** Ramo como lo escribe la compañía («Hogar», «RC.constr.»), si lo da. */
  ramo: string | null
  /** `YYYY-MM-DD`: día de ocurrencia. */
  fechaOcurrencia: string | null
  /** `YYYY-MM-DD`: día de la última acción que trae el correo. */
  fechaAccion: string | null
  /** Qué ha pasado, en corto y sin datos personales. Del «Tramitador», solo un valor de `ACCIONES_TRAMITADOR`. */
  accion: string | null
}

export type ReciboEnRiesgo = {
  numeroPoliza: string
  /** Nº de recibo TAL CUAL; `null` si el aviso es de póliza sin recibo. */
  idRecibo: string | null
  /** `null` = el correo no lo trae. No es 0€. */
  importe: number | null
  /** `YYYY-MM-DD`: día a partir del cual la compañía anula si no se cobra. `null` = no lo dice. */
  fechaLimite: string | null
}

type Base = {
  compania: CompaniaEvento
  codigoDgs: string
  /** Trozos con forma de dato que no se han sabido leer. */
  ilegibles: number
}

export type EventoSiniestro = Base & { tipo: 'siniestro'; siniestros: SiniestroLeido[] }
/** La compañía avisa de que ANULARÁ si no se cobra (Occident, Reale). */
export type EventoPreAnulacion = Base & { tipo: 'pre_anulacion'; recibos: ReciboEnRiesgo[] }
/** La compañía da por agotado su cobro y lo DELEGA en la correduría (Mapfre «Delegación recibo»). */
export type EventoImpago = Base & { tipo: 'impago'; recibos: ReciboEnRiesgo[] }
/** Un recibo que la compañía dice haber ANULADO por impago (Occident «Resumen de recibos anulados por impago»). */
export type ReciboAnulado = {
  numeroPoliza: string
  /** Nº de recibo TAL CUAL. */
  idRecibo: string
  /** `YYYY-MM-DD`: día en que la compañía ANULÓ el recibo. NO es la fecha de efecto de la baja (el correo no la da). */
  fechaAnulacion: string | null
}
export type EventoAnulacion = Base & {
  tipo: 'anulacion'
  /** Con `recibos`, SIEMPRE `null`: lo anulado es el recibo, no se sabe si la póliza (manda la lista). */
  numeroPoliza: string | null
  /** `YYYY-MM-DD`: desde cuándo deja de tener efecto. */
  fechaEfecto: string | null
  motivo: string | null
  /**
   * Solo el resumen de recibos ANULADOS por impago (Occident, 20/10/2026): una entrada por recibo. Ausente = el aviso
   * es la anulación de una póliza y valen los campos de arriba. Un puerto que no conozca `recibos` ve `numeroPoliza:
   * null` y lo deja en la bandeja: nunca anota «póliza anulada» por un recibo.
   */
  recibos?: ReciboAnulado[]
}
export type EventoSuplemento = Base & {
  tipo: 'suplemento'
  numeroPoliza: string
  descripcion: string | null
  /** `YYYY-MM-DD`, o `YYYY-MM` cuando la compañía da solo mes/año. */
  periodoDesde: string | null
  periodoHasta: string | null
}

/** Una póliza NUEVA que la compañía dice haber emitido (Allianz «Rel. Emisión Producción»). */
export type PolizaEmitidaCorreo = {
  numeroPoliza: string
  /** Nº del primer recibo TAL CUAL; `null` = no lo trae. */
  idRecibo: string | null
  /** Producto/modalidad como lo escribe la compañía («Allianz Moto V.03», «Terceros»), sin matrícula ni bonus. `null` = no se ha sabido sacar limpio. */
  producto: string | null
  /** `YYYY-MM-DD`: «F.Vto.» del primer recibo, que en una póliza nueva es su toma de efecto. */
  fechaEfecto: string | null
  /** Total del primer recibo (lo que paga el cliente), en €. `null` = no se ha leído (no es 0€). */
  prima: number | null
}
/**
 * La compañía comunica pólizas NUEVAS. No crea nada en la cartera: la fuente es CIMA. Sirve para saber si CIMA
 * ya la trae (y si no, que Alberto lo vea en la bandeja).
 */
export type EventoEmision = Base & { tipo: 'emision'; polizas: PolizaEmitidaCorreo[] }

/**
 * La compañía comunica el ESTADO de una solicitud/proyecto de suscripción (Occident «Suscripción <ramo> - Solicitud
 * <nº> - <tomador>», 20/10/2026). Aún no hay póliza: se engancha a la OPORTUNIDAD por `compania_solicitud_num`.
 */
export type EventoSolicitud = Base & {
  tipo: 'solicitud'
  /** Nº de solicitud TAL CUAL lo da el asunto (sin los ceros de relleno del enlace). */
  numeroSolicitud: string
  /** Ramo abreviado como lo escribe la compañía («Acc.colec.», «RC.constr.»). `null` = no se ha sacado limpio. */
  ramo: string | null
  /**
   * Tomador TRUNCADO (a 40) del asunto. 🚨 Solo para el aviso de Telegram (el asunto ya lo lleva): el puerto NO lo
   * guarda (`validarEntradaEvento` no lo copia). `null` = el asunto no lo trae.
   */
  tomador: string | null
  /** Estado de la plantilla («PRIMA / PROY * PTE DOCUMENTACION», «Finalización automática»). `null` = no reconocido (cuenta en `ilegibles`). */
  estado: string | null
  /** Enlace al proyecto en el portal (requiere SSO; NO se abre). Solo `https://portaloccident.gco.global/…` con el MISMO nº. */
  url: string | null
  /**
   * Estado NORMALIZADO (21/10/2026), para decidir sin mirar el texto: `emitida` (con `numeroPoliza`), `aceptada` (pte. de
   * emisión, sin póliza), `rechazada`, `pte_documentacion`. `null` = otro estado (caducidad, finalización…) o no reconocido.
   */
  fase: FaseSolicitud | null
  /**
   * Nº de la póliza EMITIDA (solo con `fase: 'emitida'`), leído del cuerpo («Póliza: N»). NO crea ni toca la póliza: la
   * fuente es CIMA; sirve para esperarla y avisar si no llega. `null` en cualquier otra fase.
   */
  numeroPoliza: string | null
  /** Solo en `rechazada`: el código de motivo de la compañía («RIESGO EXCLUIDO»), en mayúsculas. La nota libre NO sale. `null` = no lo da. */
  motivoRechazo: string | null
}

export const FASES_SOLICITUD = ['pte_documentacion', 'aceptada', 'emitida', 'rechazada'] as const
export type FaseSolicitud = (typeof FASES_SOLICITUD)[number]

export type EventoAseguradora = EventoSiniestro | EventoPreAnulacion | EventoImpago | EventoAnulacion | EventoSuplemento | EventoEmision | EventoSolicitud

// ── utilidades ───────────────────────────────────────────────────────────────

const IBAN = /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){3,7}(?:[\s-]?[A-Z0-9]{1,3})?\b/g
const CCC = /\b\d{4}[\s-]?\d{4}[\s-]?\d{2}[\s-]?\d{10}\b/g
const NIF = /\b(?:\d{8}\s?[A-Z]|[XYZ]\s?\d{7}\s?[A-Z]|[ABCDEFGHJNPQRSUVW]-?\d{7}[0-9A-J]?)\b/gi

/** Quita IBAN, CCC y NIF/NIE/CIF de un texto libre. */
export function sinDatosSensibles(texto: string): string {
  return texto.replace(IBAN, '[retirado]').replace(CCC, '[retirado]').replace(NIF, '[retirado]')
}

/** ¿Hay un IBAN en el texto? (para los guardianes). */
export function contieneIban(texto: string): boolean {
  return new RegExp(IBAN.source).test(texto)
}

function textoCorto(s: string | null | undefined, max = 200): string | null {
  const t = sinDatosSensibles((s ?? '').replace(/\s+/g, ' ').trim())
  if (t === '') return null
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function iso(d: number, m: number, a: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** `15.09.2026`, `15/09/2026`, `15-09-2026`, `10/10/26`. */
function isoDeFecha(s: string | undefined | null): string | null {
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec((s ?? '').trim())
  if (!m) return null
  const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return iso(Number(m[1]), Number(m[2]), a)
}

function importeEs(s: string | undefined): number | null {
  const t = (s ?? '').replace(/eur(os)?|€/gi, '').trim()
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function finDeMes(isoFecha: string): string {
  const [a, m] = isoFecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
}

function sumarDias(isoFecha: string, dias: number): string | null {
  const t = Date.parse(`${isoFecha.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? new Date(t + dias * 86_400_000).toISOString().slice(0, 10) : null
}

const dominio = (remitente: string): string => (remitente.toLowerCase().match(/@([^>\s]+)/)?.[1] ?? '').trim()
const esDe = (remitente: string, base: string): boolean => {
  const d = dominio(remitente)
  return d === base || d.endsWith(`.${base}`)
}
const plano = (s: string): string => s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
const lineas = (s: string): string[] => s.replace(/\r/g, '').split('\n')
const celdas = (l: string): string[] => l.split('|').map((x) => x.trim()).slice(1, -1)

function base(compania: CompaniaEvento): Base {
  return { compania, codigoDgs: CODIGO[compania], ilegibles: 0 }
}

// ── Occident · «Siniestro Diversos <nº> <asegurado>» (un siniestro, sus acciones) ─────────────────
// | Asegurado: … Póliza: 806000001 Número Siniestro: 43000001 Fecha y Hora: 15.09.2026 18:40 |
// | 2026-09-15-18.50 | |
// | Apertura de expediente con cargo a póliza |
// | * NOMBRE DEL REPARADOR |            ← no sale: puede ser un autónomo
// Por IMAP la misma tabla llega sin barras: `2026-09-15-18.50` / `Apertura de …` (partida a ~80 col.) / ` * NOMBRE`.
const FECHA_ACCION = /^\|?\s*(\d{4})-(\d{2})-(\d{2})-\d{2}\.\d{2}\s*(?:\|.*)?$/
function subtipoDeAcciones(acciones: string[]): SubtipoSiniestro {
  if (acciones.some((a) => /apertura\s+de\s+expediente/i.test(a))) return 'apertura'
  if (acciones.some((a) => /\b(finalizad[oa]|terminad[oa]|cerrad[oa]|cierre\s+del?\s+(expediente|siniestro))\b/i.test(a))) return 'cierre'
  return 'actualizacion'
}

function leerOccidentSiniestroDetalle(c: CorreoEventoAseguradora): EventoSiniestro | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  const asunto = /^\s*siniestro\s+[a-záéíóúñ.]+\s+(\d{6,})\b/i.exec(c.asunto)
  if (!asunto) return null
  const out: EventoSiniestro = { ...base('occident'), tipo: 'siniestro', siniestros: [] }
  const t = plano(c.cuerpoTexto)
  const cab = /P[oó]liza:\s*([A-Z0-9]{6,})\s+N[uú]mero\s+Siniestro:\s*(\d{6,})\s+Fecha\s+y\s+Hora:\s*(\d{2}\.\d{2}\.\d{4})/i.exec(t)
  if (!cab || cab[2] !== asunto[1]) { out.ilegibles++; return out }
  const acciones: string[] = []
  let fechaAccion: string | null = null
  const ls = lineas(c.cuerpoTexto)
  for (let i = 0; i < ls.length; i++) {
    const f = FECHA_ACCION.exec(ls[i].trim())
    if (!f) continue
    // La acción: las líneas que siguen hasta una vacía, la viñeta del reparador (`*`) o la fecha siguiente.
    // Con barras es UNA línea; por IMAP puede venir partida en dos.
    let j = i + 1
    while (j < ls.length && ls[j].trim() === '') j++
    const trozos: string[] = []
    for (; j < ls.length; j++) {
      const t = plano(ls[j])
      if (t === '' || t.startsWith('*') || FECHA_ACCION.test(ls[j].trim())) break
      trozos.push(t)
    }
    const texto = trozos.join(' ')
    if (texto === '') { out.ilegibles++; continue }
    if (!acciones.includes(texto)) acciones.push(texto)
    fechaAccion = iso(Number(f[3]), Number(f[2]), Number(f[1]))
  }
  if (acciones.length === 0) out.ilegibles++
  out.siniestros.push({
    subtipo: subtipoDeAcciones(acciones),
    numeroSiniestro: cab[2],
    numeroPoliza: cab[1],
    ramo: null,
    fechaOcurrencia: isoDeFecha(cab[3]),
    fechaAccion,
    accion: textoCorto(acciones.join(' · ')),
  })
  return out
}

// ── Occident · «…, comunicación de las acciones generadas en su expediente» (resumen) ─────────────
// | Apertura de Siniestros | / | Terminaciones | / | Pagos Realizados |
// | Número Siniestro | Póliza | Cliente | NIF | Matrícula | Fecha de Ocurrencia | Subtipo de Siniestro |
// Cliente y NIF NO salen. «Pagos» no se ha visto con filas: se cuentan como ilegibles, no se inventan.
// Por IMAP llega CELDA POR LÍNEA y la Matrícula vacía DESAPARECE: la fila se lee anclada en el nº de
// siniestro (6+ cifras) y en la fecha de ocurrencia (dd.mm.aaaa) 2-6 celdas después; la póliza es la celda
// siguiente al nº y el subtipo la siguiente a la fecha. Lo que no cuadra se cuenta, no se descarta.
type SeccionResumen = 'apertura' | 'cierre' | 'pagos'
const NUM_SINIESTRO = /^\d{6,}$/
const FECHA_OCURRENCIA = /^\d{2}\.\d{2}\.\d{4}$/

function seccionResumen(p: string): SeccionResumen | null {
  if (/^apertura\s+de\s+siniestros$/i.test(p)) return 'apertura'
  if (/^terminaciones$/i.test(p)) return 'cierre'
  if (/^pagos\s+realizados$/i.test(p)) return 'pagos'
  return null
}

function siniestroDeResumen(seccion: 'apertura' | 'cierre', numero: string, poliza: string, fecha: string, subtipoTexto: string | null): SiniestroLeido {
  return {
    subtipo: seccion,
    numeroSiniestro: numero,
    numeroPoliza: /^[A-Z0-9-]{4,}$/i.test(poliza) ? poliza : null,
    ramo: null,
    fechaOcurrencia: isoDeFecha(fecha),
    fechaAccion: null,
    accion: textoCorto(`${seccion === 'apertura' ? 'Apertura' : 'Terminación'}${subtipoTexto ? `: ${subtipoTexto}` : ''}`),
  }
}

function leerOccidentSiniestroResumen(c: CorreoEventoAseguradora): EventoSiniestro | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  if (!/comunicaci[oó]n\s+de\s+las\s+acciones\s+generadas\s+en\s+su\s+expediente/i.test(c.asunto)) return null
  const out: EventoSiniestro = { ...base('occident'), tipo: 'siniestro', siniestros: [] }
  let seccion: SeccionResumen | null = null
  let vistaSeccion = false
  let filasConBarras = 0
  // 1) Una fila por línea con `|` (vista de Gmail).
  for (const l of lineas(c.cuerpoTexto)) {
    const s = seccionResumen(plano(l))
    if (s) { seccion = s; vistaSeccion = true; continue }
    const cs = celdas(l.trim())
    if (cs.length === 0 || !NUM_SINIESTRO.test(cs[0] ?? '')) continue
    filasConBarras++
    if (seccion === null || seccion === 'pagos' || cs.length !== 7) { out.ilegibles++; continue }
    const [numero, poliza, , , , fecha, subtipoTexto] = cs
    out.siniestros.push(siniestroDeResumen(seccion, numero, poliza, fecha, subtipoTexto || null))
  }
  // 2) Celda por línea (lo que llega por IMAP). Solo si no había filas con barras: si no, contaría doble.
  if (filasConBarras === 0) {
    const cs = celdasPorLinea(c.cuerpoTexto)
    seccion = null
    let pagosContados = false
    for (let i = 0; i < cs.length; i++) {
      const s = seccionResumen(cs[i])
      if (s) { seccion = s; continue }
      if (!NUM_SINIESTRO.test(cs[i])) continue
      if (seccion === null || seccion === 'pagos') {
        // Formato no visto: una vez por sección basta para que el aviso diga «míralo».
        if (!(seccion === 'pagos' && pagosContados)) out.ilegibles++
        if (seccion === 'pagos') pagosContados = true
        continue
      }
      // Fecha de ocurrencia entre 2 y 6 celdas después (cliente, NIF y matrícula, que puede no estar), sin
      // cruzar otro nº de siniestro ni un título de sección: eso sería ya la fila siguiente.
      let j = -1
      for (let k = i + 2; k <= i + 6 && k < cs.length; k++) {
        if (FECHA_OCURRENCIA.test(cs[k])) { j = k; break }
        if (NUM_SINIESTRO.test(cs[k]) || seccionResumen(cs[k])) break
      }
      // Sin fecha: fila ilegible. Se salta también la celda de la póliza (puede ser solo cifras y
      // contarse otra vez como un nº de siniestro).
      if (j < 0) { out.ilegibles++; i++; continue }
      const siguiente = cs[j + 1]
      const subtipoTexto = siguiente && !NUM_SINIESTRO.test(siguiente) && !seccionResumen(siguiente) ? siguiente : null
      out.siniestros.push(siniestroDeResumen(seccion, cs[i], cs[i + 1], cs[j], subtipoTexto))
      i = subtipoTexto ? j + 1 : j
    }
  }
  if (!vistaSeccion) out.ilegibles++
  return out
}

// ── Occident · «Tramitador Siniestro <ramo> - <nº> - <asegurado>» (nota del tramitador) ───────────
// Contrato: M00000            ← el contrato del MEDIADOR, no la póliza: no sale
// <primer párrafo = lo que dice el tramitador>
// https://…NUMSINI=…
// La nota es texto LIBRE de una persona: lleva su firma, el nombre del perjudicado, a veces un teléfono.
// NO sale (ni a la BD ni a Telegram): se reduce a un estado de esta lista cerrada.
export const ACCIONES_TRAMITADOR = [
  'Cierre del expediente', 'Rehúse', 'Pago o propuesta de pago', 'Pide documentación', 'Nota del tramitador (ver el correo)',
] as const
export type AccionTramitador = (typeof ACCIONES_TRAMITADOR)[number]

function accionTramitador(nota: string): AccionTramitador {
  const t = nota.replace(/\s+/g, ' ')
  if (/\b(finalizad[oa]|cerrad[oa]|cierre\s+del?\s+(expediente|siniestro))\b/i.test(t)) return 'Cierre del expediente'
  if (/\brehus|\brechaz/i.test(t)) return 'Rehúse'
  if (/\b(en\s+disposici[oó]n|indemniz\w*|abonad[oa]|abonar|pago|transferencia)\b/i.test(t)) return 'Pago o propuesta de pago'
  if (/\b(aport[ea]\w*|documentaci[oó]n|copia\s+de|certificado|factura|presupuesto)\b/i.test(t)) return 'Pide documentación'
  return 'Nota del tramitador (ver el correo)'
}

// 21/10/2026: la MISMA plantilla llega también desde `noreply@plusultra.es` (2023-2024, antes de la fusión en Occident) y
// `catalanaoccidente.com`, y a veces SIN el prefijo «Tramitador» («Siniestro Hogar - <nº> - <asegurado>»). Lo que la hace
// esta plantilla es el «<ramo> - <nº> - » con guiones; el «Siniestro Diversos <nº> <asegurado>» sin guiones es otra
// (`leerOccidentSiniestroDetalle`, solo de occidentinforma.com, que aquí no entra).
// ⚠️ Plus Ultra tenía su propio código DGS antes de la fusión: un siniestro suyo puede no casar con una póliza `C0468`
// de la cartera → `sin_resolver` (bandeja). Nunca se casa con otra: el puerto exige la compañía.
const DOMINIOS_TRAMITADOR = ['comunicacionesoccident.com', 'plusultra.es', 'catalanaoccidente.com'] as const
const ASUNTO_TRAMITADOR = /^\s*(?:tramitador\s+)?siniestro\s+(.+?)\s+-\s+(\d{6,})\s+-/i
// «Contrato: M00000 Buenos días, …» en UN párrafo (sin línea en blanco tras el contrato): se quita el contrato y queda la nota.
const PREFIJO_CONTRATO = /^contrato:\s*\S+\s*/i

function leerOccidentTramitador(c: CorreoEventoAseguradora): EventoSiniestro | null {
  if (!DOMINIOS_TRAMITADOR.some((d) => esDe(c.remitente, d))) return null
  const m = ASUNTO_TRAMITADOR.exec(c.asunto)
  if (!m) return null
  const out: EventoSiniestro = { ...base('occident'), tipo: 'siniestro', siniestros: [] }
  const parrafos = c.cuerpoTexto.replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
    .map((x) => (PREFIJO_CONTRATO.test(x) ? x.replace(PREFIJO_CONTRATO, '').trim() : x))
    .filter(Boolean)
  const nota = parrafos.find((x) => !/^https?:\/\//i.test(x) && !/^LOPD/i.test(x)) ?? null
  if (!nota) out.ilegibles++
  const accion = nota ? accionTramitador(nota) : null
  out.siniestros.push({
    subtipo: accion === 'Cierre del expediente' ? 'cierre' : 'actualizacion',
    numeroSiniestro: m[2],
    numeroPoliza: null,
    ramo: m[1].trim(),
    fechaOcurrencia: null,
    fechaAccion: c.fecha ? c.fecha.slice(0, 10) : null,
    accion,
  })
  return out
}

// ── Occident · «Resumen de recibos próximos a la anulación … (06.10.2026)» ────────────────────────
// … : Póliza: BIDS000001 - Recibo: 480000001-H - Fecha anulación: 15.10.2026 Por favor, …
const RECIBO_OCCIDENT = /P[oó]liza:\s*([A-Z0-9][A-Z0-9.-]*[A-Z0-9])\s+-\s+Recibo:\s*([A-Z0-9-]+)\s+-\s+Fecha\s+anulaci[oó]n:\s*(\d{2}\.\d{2}\.\d{4})/gi

function leerOccidentPreAnulacion(c: CorreoEventoAseguradora): EventoPreAnulacion | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  if (!/recibos\s+pr[oó]ximos\s+a\s+la\s+anulaci[oó]n/i.test(c.asunto)) return null
  const out: EventoPreAnulacion = { ...base('occident'), tipo: 'pre_anulacion', recibos: [] }
  const t = plano(`${c.cuerpoTexto}\n${c.textoAdjuntos ?? ''}`)
  for (const m of t.matchAll(RECIBO_OCCIDENT)) {
    out.recibos.push({ numeroPoliza: m[1], idRecibo: m[2], importe: null, fechaLimite: isoDeFecha(m[3]) })
  }
  const menciones = t.match(/P[oó]liza:/gi)?.length ?? 0
  out.ilegibles = Math.max(menciones - out.recibos.length, out.recibos.length === 0 ? 1 : 0)
  return out
}

// ── Occident · «Mensaje recibo <recibo> (póliza <póliza>) <tomador>» (agenda de recibos) ─────────────────────
// Mensajería de recibos: HAN PASADO 070 DÍAS DESDE LA FECHA DE INICIO DE COBRO DEL RECIBO. ROGAMOS AGILICEN SOLUCIÓN.
//   GRACIAS. Puede acceder a consultar y/o dar respuesta a dicho mensaje a través de la agenda de su Portal: …
// Visto en 8 hilos reales (2024-2025, 21/10/2026). Recibo y póliza van en el ASUNTO; el cuerpo es un mensaje de la
// agenda. Solo se lee como pre-anulación el mensaje de «HAN PASADO <N> DÍAS DESDE … INICIO DE COBRO» (el recibo sigue
// sin cobrar y la compañía va a anularlo): otro mensaje de la agenda (texto de una persona) NO es este aviso → `null`.
// La fecha límite: el correo NO la da (solo los días transcurridos, y la fecha de inicio de cobro no viene) → `null`,
// salvo que el cuerpo traiga una explícita («fecha de anulación: dd.mm.aaaa»). Nunca se calcula desde el «070».
const ASUNTO_MENSAJE_RECIBO = /^\s*mensaje\s+recibo\s+([A-Z0-9][A-Z0-9-]{3,30})\s+\(\s*p[oó]liza\s+([A-Z0-9][A-Z0-9.-]{3,30}[A-Z0-9])\s*\)/i
const MENSAJE_RECIBO_PLAZO = /han\s+pasado\s+0*(\d{1,3})\s+d[ií]as\s+desde\s+la\s+fecha\s+de\s+inicio\s+de\s+cobro/i
const FECHA_LIMITE_EXPLICITA = /fecha\s+(?:de\s+)?(?:anulaci[oó]n|l[ií]mite)\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i

function leerOccidentMensajeRecibo(c: CorreoEventoAseguradora): EventoPreAnulacion | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  const a = ASUNTO_MENSAJE_RECIBO.exec(c.asunto)
  if (!a) return null
  const t = plano(c.cuerpoTexto)
  if (!MENSAJE_RECIBO_PLAZO.test(t)) return null
  return {
    ...base('occident'), tipo: 'pre_anulacion',
    recibos: [{ numeroPoliza: a[2], idRecibo: a[1], importe: null, fechaLimite: isoDeFecha(FECHA_LIMITE_EXPLICITA.exec(t)?.[1]) }],
  }
}

// ── Avisos de compañía que se RECONOCEN y se IGNORAN (21/10/2026) ─────────────────────────────────────────────
// Occident «Suscripción <ramo> - Póliza <nº> - <tomador>» con «Recordatorio de firma de mandato … mandato de cobro
// bancario»: es un documento de la compañía (decisión de Alberto, spec CORREDURIA-AGENTE-CORREO §2): sin tarea, sin
// aviso, sin nota en la ficha. `leerCorreoEventoAseguradora` lo devuelve `null` (no es un evento) y el triaje pregunta
// aquí para no tratarlo como un correo genérico de correduría.
export type MotivoIgnorado = 'mandato_sepa'

export function avisoCompaniaIgnorado(c: { remitente: string; asunto: string; cuerpoTexto: string }): MotivoIgnorado | null {
  if (/^\s*(fwd?|rv|re)\s*:/i.test(c.asunto)) return null
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  if (!/^\s*suscripci[oó]n\s+.+?\s+-\s+p[oó]liza\s+[A-Z0-9.-]{6,}\s+-/i.test(c.asunto)) return null
  const t = plano(c.cuerpoTexto)
  // Las dos frases, y ninguna señal de otra cosa (regularización, suplemento, reclamación): ante la duda, NO se ignora.
  if (!/recordatorio\s+de\s+firma\s+de\s+mandato/i.test(t) || !/mandato\s+de\s+cobro\s+bancario/i.test(t)) return null
  if (/regularizaci[oó]n|suplemento|reclamaci[oó]n|siniestro|anulaci[oó]n|impago/i.test(t)) return null
  return 'mandato_sepa'
}

// ── Occident · «Resumen de recibos anulados por impago 00000000 - 00000000 (16.10.2026)» ─────────────────────
// Adjuntamos listado de recibos que se han anulado de forma automática por superar el plazo de cobro previsto. …:
//   Póliza: BIDS000001 - Recibo: 480000001-H - Anulado en fecha: 15.10.2026 Por favor, no responda …
// Visto el 01/08 y el 17/10/2026 (la lista va en el CUERPO, una fila por recibo; los dos de un solo recibo). Los nº
// del asunto son códigos del MEDIADOR, no pólizas. «Anulado en fecha» es cuándo se anuló el RECIBO: la fecha de efecto
// de la baja no la da el correo → `fechaEfecto: null` (no se supone) y la fecha va en el motivo.
const RECIBO_ANULADO_OCCIDENT = /P[oó]liza:\s*([A-Z0-9][A-Z0-9.-]*[A-Z0-9])\s+-\s+Recibo:\s*([A-Z0-9-]+)\s+-\s+Anulado\s+en\s+fecha:\s*(\d{2}\.\d{2}\.\d{4})/gi

/** Motivo de una anulación por recibo impagado (lo usa también el puerto de asegura, una por póliza). */
export const motivoReciboAnulado = (r: Pick<ReciboAnulado, 'idRecibo' | 'fechaAnulacion'>): string =>
  `Recibo ${r.idRecibo} anulado por impago${r.fechaAnulacion ? ` el ${r.fechaAnulacion.split('-').reverse().join('/')}` : ''} (anulación automática)`

function leerOccidentAnuladosImpago(c: CorreoEventoAseguradora): EventoAnulacion | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  if (!/^\s*resumen\s+de\s+recibos\s+anulados\s+por\s+impago\b/i.test(c.asunto)) return null
  const t = plano(`${c.cuerpoTexto}\n${c.textoAdjuntos ?? ''}`)
  const recibos: ReciboAnulado[] = []
  let filas = 0
  for (const m of t.matchAll(RECIBO_ANULADO_OCCIDENT)) {
    filas++
    if (recibos.some((r) => r.numeroPoliza === m[1] && r.idRecibo === m[2])) continue
    recibos.push({ numeroPoliza: m[1], idRecibo: m[2], fechaAnulacion: isoDeFecha(m[3]) })
  }
  const menciones = t.match(/P[oó]liza:/gi)?.length ?? 0
  const unico = recibos.length === 1 ? recibos[0] : null
  return {
    ...base('occident'), tipo: 'anulacion',
    numeroPoliza: null,
    fechaEfecto: null,
    motivo: unico ? motivoReciboAnulado(unico) : recibos.length > 1 ? `${recibos.length} recibos anulados por impago (anulación automática)` : null,
    recibos,
    // «Póliza:» que no se ha sabido leer como fila; sin ninguna fila, el correo entero es ilegible.
    ilegibles: Math.max(menciones - filas, recibos.length === 0 ? 1 : 0),
  }
}

// ── Occident · suplemento de regularización de RC ────────────────────────────────────────────────
// · clientes@ «<tomador>, Regularización responsabilidad civil»:
//   Ref. póliza de Responsabilidad Civil nº BIDS000001 Tomador: … Período de regularización: 6/2025 a 6/2026
// · mediadores@ «Suscripción RC.constr. - Póliza BIDS000001 - <tomador>»:
//   … Aviso Recordatorio Regularización … no han ingresado suplemento de regularización … Periodo: 18.06.2025 a 18.06.2026.
function mesAnio(m: string, a: string): string | null {
  const mes = Number(m)
  return mes >= 1 && mes <= 12 ? `${a}-${String(mes).padStart(2, '0')}` : null
}

function leerOccidentSuplemento(c: CorreoEventoAseguradora): EventoSuplemento | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  const t = plano(c.cuerpoTexto)
  if (/regularizaci[oó]n\s+responsabilidad\s+civil\s*$/i.test(c.asunto.trim())) {
    const poliza = /p[oó]liza\s+de\s+responsabilidad\s+civil\s+n[ºo°.]*\s*([A-Z0-9]{6,})/i.exec(t)?.[1]
    if (!poliza) return null
    const per = /per[ií]odo\s+de\s+regularizaci[oó]n:\s*(\d{1,2})\/(\d{4})\s+a\s+(\d{1,2})\/(\d{4})/i.exec(t)
    const insiste = /volvemos\s+a\s+insistir|nuevamente/i.test(t)
    return {
      ...base('occident'), tipo: 'suplemento', numeroPoliza: poliza,
      descripcion: `Regularización de RC: la compañía ${insiste ? 'vuelve a pedir' : 'pide'} al asegurado los datos de facturación`,
      periodoDesde: per ? mesAnio(per[1], per[2]) : null,
      periodoHasta: per ? mesAnio(per[3], per[4]) : null,
      ilegibles: per ? 0 : 1,
    }
  }
  const asunto = /^\s*suscripci[oó]n\s+RC\.?\s*constr\.?\s+-\s+P[oó]liza\s+([A-Z0-9]{6,})\s+-/i.exec(c.asunto)
  if (!asunto) return null
  const recordatorio = /aviso\s+recordatorio\s+regularizaci[oó]n/i.test(t) && /no\s+han\s+ingresado\s+suplemento\s+de\s+regularizaci[oó]n/i.test(t)
  const per = /periodo:\s*(\d{2}\.\d{2}\.\d{4})\s+a\s+(\d{2}\.\d{2}\.\d{4})/i.exec(t)
  return {
    ...base('occident'), tipo: 'suplemento', numeroPoliza: asunto[1],
    descripcion: recordatorio ? 'Recordatorio: suplemento de regularización de RC sin ingresar (falta el dato real de facturación)' : null,
    periodoDesde: per ? isoDeFecha(per[1]) : null,
    periodoHasta: per ? isoDeFecha(per[2]) : null,
    ilegibles: recordatorio && per ? 0 : 1,
  }
}

// ── Reale · «… Informacion de Pre-anulaciones Automaticas 10/10/26 . Mediador 00000» ─────────────
//      POLIZA TOMADOR RECIBO GESTOR
//   3021700000001 NOMBRE DEL TOMADOR 690000000001 MEDIADOR
// «de continuar en esta situación al cierre del presente mes procederemos a la anulación» → fin de mes.
const FILA_REALE_PRE = /^(\d{10,})\s+.+?\s+(\d{10,})\s+[A-Z]{2,}\b.*$/

function leerRealePreAnulacion(c: CorreoEventoAseguradora): EventoPreAnulacion | null {
  if (!esDe(c.remitente, 'reale.es') || !/pre-?\s*anulaciones\s+autom/i.test(c.asunto)) return null
  const out: EventoPreAnulacion = { ...base('reale'), tipo: 'pre_anulacion', recibos: [] }
  const ref = isoDeFecha(/(\d{2}\/\d{2}\/\d{2,4})/.exec(c.asunto)?.[1])
  const finMes = ref && /al\s+cierre\s+del\s+presente\s+mes/i.test(plano(c.cuerpoTexto)) ? finDeMes(ref) : null
  for (const bruta of lineas(`${c.cuerpoTexto}\n${c.textoAdjuntos ?? ''}`)) {
    const l = plano(bruta)
    if (!/^\d{10,}\b/.test(l)) continue
    const m = FILA_REALE_PRE.exec(l)
    if (!m) { out.ilegibles++; continue }
    out.recibos.push({ numeroPoliza: m[1], idRecibo: m[2], importe: null, fechaLimite: finMes })
  }
  if (out.recibos.length === 0 && out.ilegibles === 0) out.ilegibles++
  return out
}

// ── Mapfre · «DELEGACIÓN RECIBO Nº 8800000001 PÓLIZA MAPFRE» ─────────────────────────────────────
// Agotadas las gestiones para el cobro de la póliza 0008400000001 con recibo número 8800000001 e
// importe 494,69 euros delegamos para su intervención. Si en el plazo de 12 días no recibimos …
function leerMapfreDelegacion(c: CorreoEventoAseguradora): EventoImpago | null {
  if (!esDe(c.remitente, 'mapfre.com') && !esDe(c.remitente, 'mapfre.es')) return null
  const asunto = /delegaci[oó]n\s+recibo\s+n[ºo°.]*\s*(\d{6,})/i.exec(c.asunto)
  if (!asunto) return null
  const out: EventoImpago = { ...base('mapfre'), tipo: 'impago', recibos: [] }
  const t = plano(c.cuerpoTexto)
  const m = /cobro\s+de\s+la\s+p[oó]liza\s+(\d{6,})\s+con\s+recibo\s+n[uú]mero\s+(\d{6,})\s+e\s+importe\s+([\d.,]+)\s*(?:euros|eur|€)/i.exec(t)
  if (!m || m[2] !== asunto[1]) { out.ilegibles++; return out }
  const plazo = /en\s+el\s+plazo\s+de\s+(\d{1,3})\s+d[ií]as/i.exec(t)
  out.recibos.push({
    numeroPoliza: m[1],
    idRecibo: m[2],
    importe: importeEs(m[3]),
    fechaLimite: plazo && c.fecha ? sumarDias(c.fecha, Number(plazo[1])) : null,
  })
  return out
}

// ── Allianz · «OSN-CCC: Comunicación Anulación Póliza P-03100000000000» ───────────────────────────
// TOMADOR: … PÓLIZA : 031000000 . … En respuesta a su petición, le informamos que hemos procedido a la
// anulación de la póliza reseñada a partir de la fecha 01-11-2026.
// La póliza se lee del CUERPO: la del asunto lleva relleno y no se sabe con certeza cómo quitarlo.
function leerAllianzAnulacion(c: CorreoEventoAseguradora): EventoAnulacion | null {
  if (!esDe(c.remitente, 'allianz.es')) return null
  if (!/comunicaci[oó]n\s+anulaci[oó]n\s+p[oó]liza\s+P-\d+/i.test(c.asunto)) return null
  const t = plano(c.cuerpoTexto)
  const poliza = /P[ÓO]LIZA\s*:\s*(\d{6,})/i.exec(t)?.[1] ?? null
  const fecha = /anulaci[oó]n\s+de\s+la\s+p[oó]liza\s+rese[ñn]ada\s+a\s+partir\s+de\s+la\s+fecha\s+(\d{2}-\d{2}-\d{4})/i.exec(t)?.[1]
  const fechaEfecto = isoDeFecha(fecha)
  return {
    ...base('allianz'), tipo: 'anulacion', numeroPoliza: poliza, fechaEfecto,
    motivo: /en\s+respuesta\s+a\s+su\s+petici[oó]n/i.test(t) ? 'A petición del mediador' : null,
    ilegibles: poliza && fechaEfecto ? 0 : 1,
  }
}

// ── Allianz · «Rel. Emisión Producción» (pólizas nuevas, lista en un PDF adjunto) ───────────────────
// El correo no trae nada: la lista va en el PDF `ADXP_<aammdd>_….pdf`. Por `pdf-filas` (tabulador = cambio de
// celda) cada documento son TRES filas (visto en 4 PDF reales, 18/09-09/10/2026, uno por día):
//   [Póliza\t]Póliza: 061000001  Recibo: 900000001  F.Vto.: 29-09-2026  Anual Comisión\t12,33 P.Neta\t102,72
//   Allianz Moto V.03  0000-BBB     Bonus: 3  Produccion\tIRPF\t1,85 Imptos.+Recgos.\t10,61
//   APELLIDO, NOMBRE\tLiquidar\t102,85 T.Recibo\t113,33        ← el tomador: NO sale
// El primer «Póliza» (tipo de documento) a veces falta; la segunda fila es «Terceros      Produccion» en los
// de auto a terceros. Solo se leen las filas de «Produccion» (negocio nuevo): un documento de otro origen
// (cartera, suplemento…) no se ha visto y se CUENTA como ilegible, no se toma por póliza nueva.
const FILA_EMISION_ALLIANZ = /P[oó]liza:\s*(\d{6,})\s+Recibo:\s*(\d{6,})\s+F\.\s*Vto\.?:\s*(\d{2}-\d{2}-\d{4})/i
const MATRICULA = /\b(?:C\s?-?\s?)?\d{4}\s?-?\s?[B-DF-HJ-NP-TV-Z]{3}\b|\b[A-Z]{1,2}\s?-?\s?\d{4}\s?-?\s?[A-Z]{0,2}\b/g

/** El producto de la 2.ª fila, sin matrícula, bonus ni «Produccion». Con cualquier resto dudoso (4+ cifras seguidas), `null`. */
function productoEmision(fila: string): string | null {
  const celda = (fila.split('\t')[0] ?? '')
    .replace(/\bproducci[oó]n\b/gi, ' ')
    .replace(/\bbonus\s*:?\s*-?\d+\b/gi, ' ')
    .replace(MATRICULA, ' ')
    .replace(/\s+/g, ' ').trim()
  if (celda === '' || /\d{4,}/.test(celda) || !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,+/-]{2,60}$/.test(celda)) return null
  return celda
}

const esAsuntoEmisionAllianz = (asunto: string): boolean => /^\s*rel\.?\s*emisi[oó]n\s+producci[oó]n\b/i.test(asunto)

function leerAllianzEmision(c: CorreoEventoAseguradora): EventoEmision | null {
  if (!esDe(c.remitente, 'allianz.es') || !esAsuntoEmisionAllianz(c.asunto)) return null
  const out: EventoEmision = { ...base('allianz'), tipo: 'emision', polizas: [] }
  const ls = lineas(c.textoAdjuntos ?? '')
  // Sin la cabecera del listado no se ha leído el PDF (no venía o no salió su texto): NO es «ninguna póliza».
  if (!ls.some((l) => /emisi[oó]n\s+del\s+d[ií]a/i.test(l))) { out.ilegibles++; return out }
  for (let i = 0; i < ls.length; i++) {
    // `Póliza:` con dos puntos: el «Pólizas\t1» de los totales no es una fila.
    if (!/P[oó]liza:/i.test(ls[i])) continue
    const m = FILA_EMISION_ALLIANZ.exec(ls[i].replace(/\t/g, ' '))
    if (!m) { out.ilegibles++; continue }
    // Las dos filas que siguen son de ESTE documento (hasta el siguiente «Póliza:»).
    const siguientes: string[] = []
    for (let j = i + 1; j < ls.length && j <= i + 2 && !/P[oó]liza:/i.test(ls[j]); j++) siguientes.push(ls[j])
    const origen = siguientes[0] ?? ''
    if (!/\bproducci[oó]n\b/i.test(origen)) { out.ilegibles++; continue }
    const total = siguientes.map((l) => /T\.\s*Recibo\s+([\d.,]+)/i.exec(l.replace(/\t/g, ' '))?.[1]).find(Boolean)
    out.polizas.push({
      numeroPoliza: m[1],
      idRecibo: m[2],
      producto: productoEmision(origen),
      fechaEfecto: isoDeFecha(m[3]),
      prima: importeEs(total),
    })
  }
  if (out.polizas.length === 0 && out.ilegibles === 0) out.ilegibles++
  return out
}

// ── Occident · «Suscripción <ramo> - Solicitud <nº> - <tomador truncado a 40>» (estado de un proyecto) ────────
// Contrato mediador: M00000 - <mediador> <ESTADO> <nota libre del suscriptor> https://portaloccident.gco.global/…
//   …urlTransaccion=FE/SGE.Gestion.Proyectos.FE.AccesoProyecto/?idSubscripcio=00<nº> Aviso de confidencialidad: …
// Estados vistos (correos reales, jul 2025-oct 2026): «PRIMA / PROY * PTE DOCUMENTACION» (forma `<disponible> *
// <estado>`, en mayúsculas), «Caducidad de solicitud», «Finalización automática». Otros (p. ej. «RE: SIN FRANQUICIA»,
// la respuesta de un suscriptor) → `estado: null` + ilegible: se avisa «míralo», no se inventa.
// La nota libre y el nombre del mediador NO salen (texto de una persona). El tomador solo va al aviso (ver tipo).
const ASUNTO_SOLICITUD = /^\s*suscripci[oó]n\s+(.+?)\s+-\s+solicitud\s+(\d{6,12})\s*(?:-\s*(.*))?$/i
// Variante SIN guion (oct 2026): «Suscripción <ramo> <nº>, <tomador>». Cuerpo visto (3 reales, 15-19/10/2026):
//   Le informamos que la solicitud de póliza referenciada ha sido rechazada: Contrato mediador: … Solicitud: <nº>
//   Modalidad: … Tomador: … [Motivo del rechazo: …] Observaciones: <nota libre> … ?idSubscripcio=00<nº> …
// El asunto solo no basta (podría ser otro nº): se lee SOLO si el cuerpo dice «Solicitud: <el mismo nº>». La
// «solicitud del SUPLEMENTO de la póliza referenciada» (mismo asunto, trae además «Póliza: <nº>») NO es un proyecto
// de una oportunidad: no se lee como `solicitud` (no se casaría con nada y diría «apunta el nº en la oportunidad»).
const ASUNTO_SOLICITUD_COMA = /^\s*suscripci[oó]n\s+(\S.*?)\s+(\d{6,12})\s*,\s*(.*)$/i
const SOLICITUD_RECHAZADA = /la\s+solicitud\s+de\s+p[oó]liza\s+referenciada\s+ha\s+sido\s+rechazada/i
// Emitida / aceptada (21/10/2026, correos reales jun 2025-oct 2026, mismo asunto SIN guion):
//   Le confirmamos que la solicitud de póliza referenciada ha sido emitida: Contrato mediador: … Usuario solicitante: …
//   Póliza: 540000001 Modalidad: … Tomador: Observaciones: Ingresada póliza número 540000001 … ?…refpoli=540000001…
//   Le confirmamos que la solicitud de póliza referenciada ha sido aceptada y está pendiente de emisión: … Solicitud: <nº> …
// La EMITIDA no trae «Solicitud:» (la sustituye «Póliza:»): el nº del asunto se acepta como nº de solicitud SOLO con la
// frase «ha sido emitida» + «Póliza: <nº>»; si el cuerpo trae además «Solicitud:», «Ingresada póliza número» o el
// `refpoli` del enlace, tienen que cuadrar (si no, la póliza es `null` y se cuenta ilegible: no se apunta un nº dudoso).
const SOLICITUD_EMITIDA = /la\s+solicitud\s+de\s+p[oó]liza\s+referenciada\s+ha\s+sido\s+emitida/i
const SOLICITUD_ACEPTADA = /la\s+solicitud\s+de\s+p[oó]liza\s+referenciada\s+ha\s+sido\s+aceptada/i
const POLIZA_EMITIDA = /\bP[oó]liza:\s*([A-Z0-9][A-Z0-9.-]{4,}[A-Z0-9])(?=\s|$)/i
// «Motivo del rechazo: RIESGO EXCLUIDO Observaciones: …»: solo el código en MAYÚSCULAS de la compañía.
const MOTIVO_RECHAZO = /Motivo\s+del\s+rechazo:\s*([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 .,/-]{1,58}[A-ZÁÉÍÓÚÑ0-9.])(?=\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]|\s*$)/
const SOLICITUD_SUPLEMENTO = /la\s+solicitud\s+del?\s+suplemento/i
const ESTADOS_SOLICITUD_FIJOS: readonly RegExp[] = [/caducidad\s+de\s+solicitud/i, /finalizaci[oó]n\s+autom[aá]tica/i]
// `<DISPONIBLE> * <ESTADO>`, todo en mayúsculas (el texto que sigue, la nota, ya lleva minúsculas o un enlace).
const ESTADO_ASTERISCO = /\b([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9.]*(?:\s*\/\s*[A-ZÁÉÍÓÚÑ0-9.]+|\s+[A-ZÁÉÍÓÚÑ0-9.]+)*)\s+\*\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9.]*(?:\s+[A-ZÁÉÍÓÚÑ0-9.]+)*)(?=\s+[A-ZÁÉÍÓÚÑ]?[a-záéíóúñ]|\s+https?:|\s*\||\s*$)/

/** Tope del texto sobre el que se aplica `ESTADO_ASTERISCO` (backtracking cuadrático en un texto largo en mayúsculas). */
export const MAX_CHARS_ESTADO_ASTERISCO = 20_000

function estadoSolicitud(t: string): string | null {
  const m = ESTADO_ASTERISCO.exec(t.slice(0, MAX_CHARS_ESTADO_ASTERISCO))
  if (m) return `${m[1].replace(/\s*\/\s*/g, ' / ').trim()} * ${m[2].trim()}`
  for (const re of ESTADOS_SOLICITUD_FIJOS) {
    const f = re.exec(t)
    if (f) return f[0].charAt(0).toUpperCase() + f[0].slice(1)
  }
  return null
}

function urlSolicitudOccident(t: string, numero: string): string | null {
  for (const m of t.matchAll(/https:\/\/portaloccident\.gco\.global\/[^\s|<>"')\]]+/gi)) {
    const id = /[?&]idSubscripcio=0*(\d{6,12})\b/i.exec(m[0])?.[1]
    if (id === numero.replace(/^0+/, '')) return m[0]
  }
  return null
}

function leerOccidentSolicitud(c: CorreoEventoAseguradora): EventoSolicitud | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  const conGuion = ASUNTO_SOLICITUD.exec(c.asunto)
  const a = conGuion ?? ASUNTO_SOLICITUD_COMA.exec(c.asunto)
  if (!a) return null
  const t = plano(c.cuerpoTexto)
  const numero = a[2].replace(/^0+/, '')
  const enCuerpo = /\bSolicitud:\s*0*(\d{6,12})\b/i.exec(t)?.[1]
  let ilegibles = 0
  let fase: FaseSolicitud | null = null
  let numeroPoliza: string | null = null
  let estado: string | null
  if (!conGuion) {
    if (SOLICITUD_SUPLEMENTO.test(t)) return null
    // Otro nº de solicitud en el cuerpo: el del asunto no se sabe qué es.
    if (enCuerpo !== undefined && enCuerpo !== numero) return null
    if (SOLICITUD_EMITIDA.test(t)) {
      // La única fase que se lee SIN «Solicitud:» en el cuerpo, y solo con su frase + «Póliza: N».
      const poliza = POLIZA_EMITIDA.exec(t)?.[1]
      if (!poliza) return null
      fase = 'emitida'
      numeroPoliza = polizaEmitidaCuadra(t, poliza) ? poliza : null
      if (!numeroPoliza) ilegibles++
    } else {
      if (enCuerpo !== numero) return null
      if (SOLICITUD_RECHAZADA.test(t)) fase = 'rechazada'
      else if (SOLICITUD_ACEPTADA.test(t)) fase = 'aceptada'
    }
    estado = fase === 'emitida' ? (numeroPoliza ? `Solicitud emitida · póliza ${numeroPoliza}` : 'Solicitud emitida (nº de póliza dudoso: míralo)')
      : fase === 'rechazada' ? 'Solicitud rechazada'
      : fase === 'aceptada' ? 'Solicitud aceptada, pendiente de emisión'
      : textoCorto(estadoSolicitud(t), 80)
  } else {
    estado = textoCorto(estadoSolicitud(t), 80)
  }
  if (fase === null && pideDocumentacionSolicitud(estado)) fase = 'pte_documentacion'
  const motivo = fase === 'rechazada' ? MOTIVO_RECHAZO.exec(t)?.[1]?.trim() ?? null : null
  const ramo = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,/-]{2,40}$/.test(a[1].trim()) ? a[1].trim() : null
  return {
    ...base('occident'), tipo: 'solicitud', numeroSolicitud: a[2], ramo,
    tomador: textoCorto(a[3], 60), estado, url: urlSolicitudOccident(t, a[2]),
    fase, numeroPoliza, motivoRechazo: motivo ? textoCorto(motivo, 60) : null,
    ilegibles: ilegibles + (estado ? 0 : 1),
  }
}

/** Mismo criterio que `pideDocumentacion` de `solicitud-compania.ts` (no se importa: este módulo no depende de aquel). */
function pideDocumentacionSolicitud(estado: string | null): boolean {
  return /\bPTE\.?\s+DOCUMENTACI[OÓ]N\b|\bPENDIENTE\s+(?:DE\s+)?DOCUMENTACI[OÓ]N\b/i.test(estado ?? '')
}

/** ¿Los otros sitios donde la emitida repite el nº de póliza («Ingresada póliza número», `refpoli=` del enlace) cuadran? */
function polizaEmitidaCuadra(t: string, poliza: string): boolean {
  const n = (s: string) => s.replace(/[.\-\s]/g, '').replace(/^0+/, '').toUpperCase()
  const otros = [
    ...[...t.matchAll(/ingresada\s+p[oó]liza\s+n[uú]mero\s+([A-Z0-9][A-Z0-9.-]*[A-Z0-9])/gi)].map((m) => m[1]),
    ...[...t.matchAll(/[?&]refpoli=([A-Z0-9.-]+)/gi)].map((m) => m[1]),
    ...[...t.matchAll(/\bP[oó]liza:\s*([A-Z0-9][A-Z0-9.-]{4,}[A-Z0-9])(?=\s|$)/gi)].map((m) => m[1]),
  ]
  return otros.every((o) => n(o) === n(poliza))
}

/**
 * Segunda red: los campos de TEXTO LIBRE de un evento nunca llevan IBAN ni NIF, aunque un formato nuevo
 * los colara. Los identificadores (póliza, recibo, siniestro) no se tocan: ya salen de una regex estricta
 * y «limpiarlos» podría romper una póliza con forma de CIF.
 */
const CAMPOS_LIBRES = new Set(['accion', 'descripcion', 'motivo', 'ramo', 'producto', 'tomador', 'estado'])
function limpiarEvento<E extends EventoAseguradora>(e: E): E {
  const limpia = (v: unknown, clave = ''): unknown => {
    if (typeof v === 'string') return CAMPOS_LIBRES.has(clave) ? sinDatosSensibles(v) : v
    if (Array.isArray(v)) return v.map((x) => limpia(x))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpia(x, k)]))
    return v
  }
  return limpia(e) as E
}

/**
 * ¿Este correo es de un formato cuyo lector mira el texto de los ADJUNTOS? Las listas de pre-anulación
 * (Occident, Reale) pueden traer la tabla adjunta, y la «Rel. Emisión Producción» de Allianz la trae SIEMPRE. El triaje lo pregunta ANTES de leer ningún PDF: para el
 * resto no hace falta abrirlos. Decide solo por remitente + asunto (no hace falta el cuerpo).
 */
export function eventoNecesitaAdjuntos(c: { remitente: string; asunto: string }): boolean {
  if (/^\s*(fwd?|rv|re)\s*:/i.test(c.asunto)) return false
  if (esDe(c.remitente, 'occidentinforma.com') && /recibos\s+pr[oó]ximos\s+a\s+la\s+anulaci[oó]n/i.test(c.asunto)) return true
  if (esDe(c.remitente, 'allianz.es') && esAsuntoEmisionAllianz(c.asunto)) return true
  return esDe(c.remitente, 'reale.es') && /pre-?\s*anulaciones\s+autom/i.test(c.asunto)
}

/**
 * `null` = no es un correo de compañía que se sepa leer con certeza (comercial, campaña, conversación
 * con la sucursal, recibo devuelto —ese va por `leerCorreoDevolucion`—…).
 */
export function leerCorreoEventoAseguradora(c: CorreoEventoAseguradora): EventoAseguradora | null {
  // Un reenvío («Fwd:», de un cliente o del propio Alberto) no es la compañía: no se lee aquí.
  if (/^\s*(fwd?|rv|re)\s*:/i.test(c.asunto)) return null
  const e =
    leerOccidentSiniestroDetalle(c) ??
    leerOccidentSiniestroResumen(c) ??
    leerOccidentTramitador(c) ??
    leerOccidentPreAnulacion(c) ??
    leerOccidentMensajeRecibo(c) ??
    leerOccidentAnuladosImpago(c) ??
    leerOccidentSolicitud(c) ??
    leerOccidentSuplemento(c) ??
    leerRealePreAnulacion(c) ??
    leerMapfreDelegacion(c) ??
    leerAllianzAnulacion(c) ??
    leerAllianzEmision(c)
  return e ? limpiarEvento(e) : null
}
