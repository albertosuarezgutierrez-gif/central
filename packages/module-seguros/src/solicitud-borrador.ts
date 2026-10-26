/**
 * Enlace de datos `/datos/<token>`, FASE B (26/10/2026). Tres piezas PURAS:
 *
 * 1. `valoresDePolizaLeida`: lo que el lector de pólizas de asegura (`leerPoliza`) sacó de la póliza ACTUAL que sube el
 *    cliente → valores para los campos del formulario QUE SE PIDIERON, cada uno pasado por la misma validación que el
 *    formulario. Solo datos del seguro (compañía, vencimiento, capitales, vehículo/vivienda); nunca DNI ni nacimiento
 *    (en la póliza sale el TOMADOR, que no tiene por qué ser quien rellena). El cliente lo CONFIRMA: es una propuesta.
 * 2. `limpiarBorrador`: el borrador que se guarda por token mientras el cliente rellena (guardado automático). Solo
 *    claves pedidas, valores escalares y con tope. Un borrador NUNCA cuenta como completado.
 * 3. `ultimoPasoDe`: la última sección (o pregunta) a la que llegó, para el aviso de abandono. Solo etiquetas de la casa.
 */
import {
  CLAVE_NO_LO_SE,
  SUBCLAVES_DIRECCION,
  TRAMOS_CONTENIDO,
  TRAMOS_CONTINENTE,
  claveDireccion,
  validarRespuestas,
  type CampoSolicitud,
  type Respuesta,
  type TramoCapital,
} from './solicitud-datos.ts'

// ─── 1. La póliza actual, leída ──────────────────────────────────────────────

/**
 * El tramo que CUBRE un capital: el de techo más bajo que no se queda corto (asegurar de menos es infraseguro, art. 30
 * LCS). Por encima de todos los techos, el tramo abierto. `null` = no hay capital utilizable (no se propone nada).
 */
export function tramoDeCapital(tramos: readonly TramoCapital[], capital: unknown): string | null {
  if (typeof capital !== 'number' || !Number.isFinite(capital) || capital <= 0) return null
  const conTecho = tramos.filter((t) => t.importe !== null).sort((a, b) => (a.importe as number) - (b.importe as number))
  const cubre = conTecho.find((t) => (t.importe as number) >= capital)
  if (cubre) return cubre.valor
  // El abierto por arriba es el de importe null que NO es «que me lo calculen».
  return tramos.find((t) => t.importe === null && t.valor !== 'calcular')?.valor ?? null
}

/** Lo mínimo que se usa del resultado de `leerPoliza` (asegura). `fase: 'ninguno'` = no se leyó nada. */
export type PolizaLeidaSolicitud = {
  fase: string
  datos?: Record<string, unknown> | null
  bruto?: Record<string, unknown> | null
}

/** Claves de PERSONA que una póliza nunca propone (sale el tomador). */
const NUNCA_DE_POLIZA = new Set(['dni', 'fechaNacimiento', 'tipoCarnet', 'fechaCarnet'])

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function valoresDePolizaLeida(
  lectura: PolizaLeidaSolicitud,
  campos: readonly CampoSolicitud[],
  hoy: Date = new Date(),
): Record<string, Respuesta> {
  if (lectura.fase === 'ninguno') return {}
  const d = lectura.datos && typeof lectura.datos === 'object' ? lectura.datos : {}
  const b = lectura.bruto && typeof lectura.bruto === 'object' ? lectura.bruto : {}
  const candidato: Record<string, unknown> = {
    companiaActual: txt(d.compania) ?? txt(b.compania),
    vencimientoActual: txt(d.fechaVencimiento) ?? txt(b.fechaVencimiento),
    // Vehículo (si es una póliza de motor y el enlace lo pide).
    matricula: txt(d.matricula),
    marca: txt(d.marca),
    modelo: [txt(d.modelo), txt(d.version)].filter(Boolean).join(' ') || null,
    fechaMatriculacion: txt(d.fechaMatriculacion),
    aniosSinSiniestros: num(d.aniosSinSiniestros),
    // Hogar: capitales a su tramo; m² y año (solo se ven si el Catastro no los da).
    tramoContenido: tramoDeCapital(TRAMOS_CONTENIDO, num(d.capitalContenido) ?? num(b.capitalContenido)),
    tramoContinente: tramoDeCapital(TRAMOS_CONTINENTE, num(d.capitalContinente) ?? num(b.capitalContinente)),
    metrosCuadrados: num(d.metrosCuadrados),
    anioConstruccion: num(d.anioConstruccion),
    // Vida: el capital de la póliza actual como punto de partida.
    capitalDeseado: num(b.capitalAsegurado),
  }
  // Una póliza leída con compañía o vencimiento = tiene seguro (lo que cuelga de «sí» se ve).
  if (candidato.companiaActual || candidato.vencimientoActual) candidato.tieneSeguro = true

  const valores: Record<string, Respuesta> = {}
  for (const c of campos) {
    if (NUNCA_DE_POLIZA.has(c.clave)) continue
    const v = candidato[c.clave]
    if (v === null || v === undefined || v === '') continue
    // Un vencimiento ya pasado es de una póliza vieja: se propone igual (el cliente confirma); la validación manda.
    const r = validarRespuestas([{ ...c, obligatorio: true, siMarcado: undefined, admiteNoLoSe: false }], { [c.clave]: v }, hoy)
    if (r.ok && r.respuestas[c.clave] !== null && r.respuestas[c.clave] !== undefined) valores[c.clave] = r.respuestas[c.clave]
  }
  return valores
}

// ─── 2. El borrador ──────────────────────────────────────────────────────────

export type ValorBorrador = string | boolean | string[]
export type BorradorSolicitud = Record<string, ValorBorrador>

/** Tope del borrador serializado: de sobra para el formulario más largo (hogar), corto para no ser un almacén. */
export const MAX_BORRADOR_CARACTERES = 20_000
const MAX_VALOR = 1000

/** Claves que puede llevar un borrador: las pedidas, las subclaves de cada dirección y la lista de «No lo sé». */
export function clavesBorrador(campos: readonly CampoSolicitud[]): Set<string> {
  const s = new Set<string>([CLAVE_NO_LO_SE])
  for (const c of campos) {
    if (c.tipo === 'direccion') for (const sub of SUBCLAVES_DIRECCION) s.add(claveDireccion(c.clave, sub))
    else s.add(c.clave)
  }
  return s
}

/**
 * Lo que manda el navegador → borrador guardable. Solo claves pedidas; texto (recortado), sí/no y la lista de «No lo
 * sé» (solo de claves pedidas). Vacíos fuera. `null` = no es un objeto o pasa del tope (no se guarda nada).
 * NO valida como al enviar: un borrador puede estar a medias o mal escrito; eso se corrige al enviar.
 */
export function limpiarBorrador(campos: readonly CampoSolicitud[], entrada: unknown): BorradorSolicitud | null {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) return null
  const permitidas = clavesBorrador(campos)
  const pedidas = new Set(campos.map((c) => c.clave))
  const out: BorradorSolicitud = {}
  for (const [k, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (!permitidas.has(k)) continue
    if (k === CLAVE_NO_LO_SE) {
      if (!Array.isArray(v)) continue
      const lista = [...new Set(v.filter((x): x is string => typeof x === 'string' && pedidas.has(x)))]
      if (lista.length > 0) out[k] = lista
      continue
    }
    if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v)
    else if (typeof v === 'string' && v.trim() !== '') out[k] = v.slice(0, MAX_VALOR)
  }
  return JSON.stringify(out).length > MAX_BORRADOR_CARACTERES ? null : out
}

/**
 * Datos de la PERSONA que un enlace de TERCERO no devuelve (26/10/2026, revisión del PR #5068). La regla de tercero
 * no trae nada relleno (el enlace puede reenviarse y abrirlo otro), así que lo que se tecleó de esa persona tampoco
 * vuelve al reabrir: identidad, carné, CP, salud y profesión. Lo del riesgo (vehículo, vivienda, capitales) sí vuelve.
 */
export const CLAVES_PERSONALES_BORRADOR: ReadonlySet<string> = new Set([
  'dni', 'fechaNacimiento', 'tipoCarnet', 'fechaCarnet', 'codigoPostal', 'fumador', 'profesion', 'edades',
])

/** El borrador de un enlace de tercero, sin los datos personales (también fuera de la lista de «No lo sé»). */
export function borradorParaTercero(borrador: BorradorSolicitud | null): BorradorSolicitud | null {
  if (!borrador) return null
  const out: BorradorSolicitud = {}
  for (const [k, v] of Object.entries(borrador)) {
    if (CLAVES_PERSONALES_BORRADOR.has(k)) continue
    if (k === CLAVE_NO_LO_SE && Array.isArray(v)) {
      const lista = v.filter((x) => !CLAVES_PERSONALES_BORRADOR.has(x))
      if (lista.length > 0) out[k] = lista
      continue
    }
    out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

// ─── 3. Hasta dónde llegó ────────────────────────────────────────────────────

/**
 * El último paso alcanzado: la sección (o, sin secciones, la pregunta) del ÚLTIMO campo, en el orden del formulario,
 * que tiene algo contestado en el borrador. Con «(n de m)» para dar idea del avance. `null` = no ha contestado nada.
 * Solo etiquetas de la casa: nunca un valor del cliente.
 */
export function ultimoPasoDe(campos: readonly CampoSolicitud[], borrador: BorradorSolicitud): string | null {
  const noLoSe = new Set(Array.isArray(borrador[CLAVE_NO_LO_SE]) ? (borrador[CLAVE_NO_LO_SE] as string[]) : [])
  const contestado = (c: CampoSolicitud): boolean => {
    if (noLoSe.has(c.clave)) return true
    if (c.tipo === 'direccion') return SUBCLAVES_DIRECCION.some((s) => borrador[claveDireccion(c.clave, s)] !== undefined)
    return borrador[c.clave] !== undefined
  }
  let ultimo = -1
  campos.forEach((c, i) => { if (contestado(c)) ultimo = i })
  if (ultimo < 0) return null
  const c = campos[ultimo]
  return `${c.seccion ?? c.etiqueta} (pregunta ${ultimo + 1} de ${campos.length})`.slice(0, 200)
}
