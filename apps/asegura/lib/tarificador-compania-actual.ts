// Compañía ACTUAL del vehículo para el bot de Allianz Turismos (18/10/2026). PURO: sin BD ni red (`node --test`).
//
// Causa: el desplegable «Compañía actual del vehículo» (Antecedentes) es obligatorio y el bot solo lee `companiaAnterior` /
// `companiaActual` del riesgo, que viene del formulario de bots. Si nadie la tecleó llega «no consta» aunque la ficha la sepa.
// Se rellena AL ENTREGAR (solo en la respuesta del worker, nunca en BD) con, por orden:
//   1. la póliza que el cliente tiene HOY en otra compañía, leída de su PDF y guardada en la oportunidad
//      (`oportunidades.poliza_competencia.aseguradora`): es la que de verdad vence y se sustituye;
//   2. si no hay, la aseguradora de la póliza de AUTO en vigor de nuestra cartera (`esCarteraEnVigor`), la de efecto más reciente.
// Sin ninguna → `null` (no se inventa). Nunca se pisa lo que el riesgo ya trae. Solo compañía (dato no personal).

import { esCarteraEnVigor } from '@central/module-seguros'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Valores de cajón que NO son una compañía. */
const CAJON = new Set(['otro', 'otra', 'otros', 'n/a', 'na', 'ninguna', 'ninguno', 'desconocida', 'desconocido', 'no consta', 'sin datos', '-', '?'])

/** Nombre de compañía utilizable o `null` (vacío, de cajón o con forma rara). */
export function nombreCompaniaUtil(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || t.length > 120 || CAJON.has(t.toLowerCase())) return null
  return t
}

/** Póliza de cartera tal como la necesita esta regla (columnas NO personales). */
export type PolizaParaCompaniaActual = {
  tipo: string | null
  aseguradora: string | null
  companiaDeclarada?: string | null
  estado: string | null
  importRef: string | null
  eiacXmlHash: string | null
  sustituidaAt?: unknown
  /** `aaaa-mm-dd` del efecto vigente (o inicio). `null` = no se sabe: ordena la última. */
  fechaEfecto: string | null
}

/** Compañía con la que está asegurado hoy el cliente, o `null` si no se sabe. PURA. */
export function companiaActualDeCliente(competencia: unknown, polizas: readonly PolizaParaCompaniaActual[] | null): string | null {
  const deOportunidad = esObj(competencia) ? nombreCompaniaUtil(competencia.aseguradora) : null
  if (deOportunidad) return deOportunidad
  const enVigor = (polizas ?? [])
    .filter((p) => p.tipo === 'auto' && esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt }))
    .map((p) => ({ nombre: nombreCompaniaUtil(p.aseguradora) ?? nombreCompaniaUtil(p.companiaDeclarada), fecha: p.fechaEfecto ?? '' }))
    .filter((p): p is { nombre: string; fecha: string } => p.nombre !== null)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  return enVigor[0]?.nombre ?? null
}

/**
 * Variante ESTRICTA para «probar» (riesgo reconstruido, sin nadie delante que lo revise): la compañía de la póliza de AUTO en vigor
 * de la cartera SOLO si hay exactamente UNA (con nombre útil). Cero o varias → `null` (queda sin rellenar; nunca se elige entre dos).
 * Si la oportunidad ya declara una compañía actual (`poliza_competencia.aseguradora`), esa manda. PURA.
 */
export function companiaActualUnica(competencia: unknown, polizas: readonly PolizaParaCompaniaActual[] | null): string | null {
  const deOportunidad = esObj(competencia) ? nombreCompaniaUtil(competencia.aseguradora) : null
  if (deOportunidad) return deOportunidad
  const enVigor = (polizas ?? []).filter((p) => p.tipo === 'auto' && esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt }))
  return enVigor.length === 1 ? nombreCompaniaUtil(enVigor[0]!.aseguradora) ?? nombreCompaniaUtil(enVigor[0]!.companiaDeclarada) : null
}

const vacio = (v: unknown): boolean => typeof v !== 'string' || v.trim() === ''

/** Tope de `companiaAnterior` en el validador del formulario (`MAX_COMPANIA_ANTERIOR`): por encima, el validador da ERROR y tumba el trabajo. */
const MAX_COMPANIA_ANTERIOR = 80
/** Caracteres que el validador rechaza en texto libre (copia de `CARACTERES_PROHIBIDOS` de module-tarificacion). */
const CARACTERES_PROHIBIDOS = /[<>{}\[\]\\`$]|[\u0000-\u001f]/

/** Compañías de auto cuyo bot pide la compañía anterior (Allianz Turismos, Mapfre NSEI). */
const COMPANIAS_CON_COMPANIA_ANTERIOR = ['allianz', 'mapfre']

/**
 * ¿Hay que buscar la compañía del cliente para este riesgo? Auto de Allianz/Mapfre sin `companiaAnterior` ni `companiaActual`, y
 * sin la declaración «0 años asegurado» (sin seguro anterior: poner compañía cambiaría la procedencia). PURA; evita lecturas de BD.
 */
export function necesitaCompaniaActual(compania: string, ramo: string, riesgo: unknown): boolean {
  if (!COMPANIAS_CON_COMPANIA_ANTERIOR.includes(compania) || ramo !== 'auto' || !esObj(riesgo)) return false
  if (riesgo.aniosAseguradoAnterior === 0) return false
  return vacio(riesgo.companiaAnterior) && vacio(riesgo.companiaActual)
}

/**
 * Si el riesgo (Allianz o Mapfre auto) no trae compañía actual ni anterior, le pone `companiaAnterior` = la del cliente (es la clave que
 * `validarFormularioAuto` conserva y que el bot lee primero; `companiaActual` se descartaba y el bot veía «no consta»).
 * Si ya trae alguna, no se sabe la del cliente o no cabe en el validador (>80 o caracteres prohibidos: no se pone, nunca se
 * recorta ni se rompe el trabajo), devuelve el MISMO riesgo. Solo para auto; no toca otros ramos ni compañías. PURA.
 */
export function aplicarCompaniaActual(compania: string, ramo: string, riesgo: unknown, actual: string | null): unknown {
  if (!esObj(riesgo) || !necesitaCompaniaActual(compania, ramo, riesgo) || actual === null) return riesgo
  if (actual.length > MAX_COMPANIA_ANTERIOR || CARACTERES_PROHIBIDOS.test(actual)) return riesgo
  return { ...riesgo, companiaAnterior: actual }
}

// ── Últimos 5 dígitos de la póliza ACTUAL (19/10/2026) ──
// Allianz Turismos pide en «Antecedentes» «Cinco últimos dígitos de la póliza actual» (obligatorio si hay compañía actual). El dato
// está en `oportunidades.poliza_competencia -> historialDeclarado -> numeroPoliza`. Al riesgo viaja SOLO la cola de 5 cifras, en
// `polizaAnteriorUltimos5` (clave que conserva `validarFormularioAuto`); el número entero nunca sale de aquí. Dato sensible: sin logs.

/** Clave del riesgo (la misma del validador de module-tarificacion). */
export const CLAVE_POLIZA_ANTERIOR_5 = 'polizaAnteriorUltimos5'

/** Últimas 5 cifras de un número de póliza (solo dígitos; ≥5), o `null` si no hay dato utilizable. PURA. */
export function ultimosCincoDigitosPoliza(numero: unknown): string | null {
  if (typeof numero !== 'string') return null
  const cifras = numero.replace(/\D/g, '')
  return cifras.length >= 5 ? cifras.slice(-5) : null
}

/**
 * Si el riesgo (Allianz auto) no trae ya `polizaAnteriorUltimos5`, se la pone con las 5 últimas cifras de `numeroPoliza`. Si ya trae
 * algo, o no hay ≥5 cifras, devuelve el MISMO riesgo. Solo Allianz auto. PURA.
 */
export function aplicarPolizaAnteriorUltimos5(compania: string, ramo: string, riesgo: unknown, numeroPoliza: unknown): unknown {
  if (compania !== 'allianz' || ramo !== 'auto' || !esObj(riesgo)) return riesgo
  if (!vacio(riesgo[CLAVE_POLIZA_ANTERIOR_5])) return riesgo
  const ultimos = ultimosCincoDigitosPoliza(numeroPoliza)
  return ultimos === null ? riesgo : { ...riesgo, [CLAVE_POLIZA_ANTERIOR_5]: ultimos }
}
