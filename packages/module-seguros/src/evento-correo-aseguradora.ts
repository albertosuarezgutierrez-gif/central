// packages/module-seguros/src/evento-correo-aseguradora.ts
//
// Lee los correos de las compañías que NO son recibos devueltos (eso es `devolucion-correo.ts`) y los
// convierte en EVENTOS de la correduría: siniestro, pre-anulación/impago, anulación, suplemento. PURO.
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
//   por no tener con qué leerlos sin inventar: Allianz «Rel. Emisión Producción» (la lista va en un PDF
//   que no se ha visto en texto), Mapfre «Welcome Pack Digital» (no trae nº de póliza), Reale «Recibos
//   Pendientes» (la tabla va en un .xls) y Reale «Impago de recibo» (va al cliente y no trae datos).

export type CompaniaEvento = 'occident' | 'reale' | 'mapfre' | 'allianz'

const CODIGO: Record<CompaniaEvento, string> = { reale: 'C0613', occident: 'C0468', mapfre: 'C0058', allianz: 'C0109' }

export type CorreoEventoAseguradora = {
  remitente: string
  asunto: string
  /** Cuerpo en texto plano (las tablas HTML llegan con `|`). */
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
  /** Qué ha pasado, en corto y sin datos personales. */
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
export type EventoAnulacion = Base & {
  tipo: 'anulacion'
  numeroPoliza: string | null
  /** `YYYY-MM-DD`: desde cuándo deja de tener efecto. */
  fechaEfecto: string | null
  motivo: string | null
}
export type EventoSuplemento = Base & {
  tipo: 'suplemento'
  numeroPoliza: string
  descripcion: string | null
  /** `YYYY-MM-DD`, o `YYYY-MM` cuando la compañía da solo mes/año. */
  periodoDesde: string | null
  periodoHasta: string | null
}

export type EventoAseguradora = EventoSiniestro | EventoPreAnulacion | EventoImpago | EventoAnulacion | EventoSuplemento

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
    const f = /^\|\s*(\d{4})-(\d{2})-(\d{2})-\d{2}\.\d{2}\s*\|/.exec(ls[i].trim())
    if (!f) continue
    const siguiente = ls.slice(i + 1).find((l) => l.trim() !== '')
    const texto = siguiente ? plano(siguiente) : ''
    if (texto === '' || texto.startsWith('*')) { out.ilegibles++; continue }
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
function leerOccidentSiniestroResumen(c: CorreoEventoAseguradora): EventoSiniestro | null {
  if (!esDe(c.remitente, 'occidentinforma.com')) return null
  if (!/comunicaci[oó]n\s+de\s+las\s+acciones\s+generadas\s+en\s+su\s+expediente/i.test(c.asunto)) return null
  const out: EventoSiniestro = { ...base('occident'), tipo: 'siniestro', siniestros: [] }
  let seccion: 'apertura' | 'cierre' | 'pagos' | null = null
  let vistaSeccion = false
  for (const l of lineas(c.cuerpoTexto)) {
    const p = plano(l)
    if (/^apertura\s+de\s+siniestros$/i.test(p)) { seccion = 'apertura'; vistaSeccion = true; continue }
    if (/^terminaciones$/i.test(p)) { seccion = 'cierre'; vistaSeccion = true; continue }
    if (/^pagos\s+realizados$/i.test(p)) { seccion = 'pagos'; vistaSeccion = true; continue }
    const cs = celdas(l.trim())
    if (cs.length === 0 || !/^\d{6,}$/.test(cs[0] ?? '')) continue
    if (seccion === null || seccion === 'pagos' || cs.length !== 7) { out.ilegibles++; continue }
    const [numero, poliza, , , , fecha, subtipoTexto] = cs
    out.siniestros.push({
      subtipo: seccion,
      numeroSiniestro: numero,
      numeroPoliza: /^[A-Z0-9-]{4,}$/i.test(poliza) ? poliza : null,
      ramo: null,
      fechaOcurrencia: isoDeFecha(fecha),
      fechaAccion: null,
      accion: textoCorto(`${seccion === 'apertura' ? 'Apertura' : 'Terminación'}${subtipoTexto ? `: ${subtipoTexto}` : ''}`),
    })
  }
  if (!vistaSeccion) out.ilegibles++
  return out
}

// ── Occident · «Tramitador Siniestro <ramo> - <nº> - <asegurado>» (nota del tramitador) ───────────
// Contrato: M00000            ← el contrato del MEDIADOR, no la póliza: no sale
// <primer párrafo = lo que dice el tramitador>
// https://…NUMSINI=…
function leerOccidentTramitador(c: CorreoEventoAseguradora): EventoSiniestro | null {
  if (!esDe(c.remitente, 'comunicacionesoccident.com')) return null
  const m = /^\s*tramitador\s+siniestro\s+(.+?)\s+-\s+(\d{6,})\s+-/i.exec(c.asunto)
  if (!m) return null
  const out: EventoSiniestro = { ...base('occident'), tipo: 'siniestro', siniestros: [] }
  const parrafos = c.cuerpoTexto.replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
  const nota = parrafos.find((x) => !/^contrato:/i.test(x) && !/^https?:\/\//i.test(x) && !/^LOPD/i.test(x)) ?? null
  if (!nota) out.ilegibles++
  const accion = textoCorto(nota)
  out.siniestros.push({
    subtipo: accion && /\b(finalizad[oa]|cerrad[oa]|cierre\s+del?\s+(expediente|siniestro))\b/i.test(accion) ? 'cierre' : 'actualizacion',
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

/**
 * Segunda red: los campos de TEXTO LIBRE de un evento nunca llevan IBAN ni NIF, aunque un formato nuevo
 * los colara. Los identificadores (póliza, recibo, siniestro) no se tocan: ya salen de una regex estricta
 * y «limpiarlos» podría romper una póliza con forma de CIF.
 */
const CAMPOS_LIBRES = new Set(['accion', 'descripcion', 'motivo', 'ramo'])
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
    leerOccidentSuplemento(c) ??
    leerRealePreAnulacion(c) ??
    leerMapfreDelegacion(c) ??
    leerAllianzAnulacion(c)
  return e ? limpiarEvento(e) : null
}
