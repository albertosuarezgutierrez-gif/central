// Campos extra de «Bots (gratis)» (cilindrada, sexo, compañía anterior): qué se MUESTRA precargado y qué se GUARDA al editarlos
// (20/10/2026). PURO: sin red ni envs, importable desde 'use client' y desde tests. Antes vivían solo en el estado del bloque y
// se rellenaban de cero cada vez. Dónde se guarda cada uno (siempre donde ya se guardan los demás datos, sin migración):
//   cilindrada        → `info_riesgo.datosVehiculo.cilindradaCc` de la oportunidad (PATCH del riesgo, el de «Datos del vehículo»)
//   sexo              → ficha del cliente (`sexo`), SOLO si la ficha no lo tiene (misma regla que el selector del cotizador)
//   compañía anterior → `aseguradora` de la oportunidad Y `historialDeclarado.companiaActual` (UN solo `editar`, ver
//                       `cuerpoGuardarCompania`): así «Historial y bonificaciones» y este campo quedan coherentes; si el historial ya
//                       trae un código o dice «sin seguro», solo `aseguradora`
//   fechaAdquisicion  → `info_riesgo.datosVehiculo.fechaCompra` (mismo PATCH del riesgo; fuente: ese mismo dato, nunca la matriculación)
//   póliza anterior   → `historialDeclarado.numeroPoliza` de la oportunidad (`editar`; donde ya vive el nº de póliza actual: las 5 últimas cifras)
//   justificante      → `historialDeclarado.fotocopiaAnterior` (`editar`; valor cerrado `proximo_anio` | `dos_ultimos_anios`)
import { JUSTIFICANTES_SEGURO_ANTERIOR, MAX_COMPANIA_ANTERIOR } from '@central/module-tarificacion'
import { cilindradaDeTexto, fechaIsoValida, ultimos5CifrasPoliza } from './tarificador-moto-formulario.ts'
import { COMPANIA_CAJON, esCodigoCompania } from './compania-anterior.ts'

export type AccionGuardarExtra =
  | { tipo: 'cilindrada'; cc: number }
  | { tipo: 'sexo'; sexo: 'hombre' | 'mujer' }
  | { tipo: 'compania'; texto: string }
  | { tipo: 'fechaAdquisicion'; fecha: string }
  | { tipo: 'poliza'; ultimos5: string }
  | { tipo: 'justificante'; valor: (typeof JUSTIFICANTES_SEGURO_ANTERIOR)[number] }

/** Compañía tecleada → texto guardable, o `null` (vacío, demasiado larga, o valor de cajón como «otro»/«N/A»). */
export function companiaGuardable(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t.length < 2 || t.length > MAX_COMPANIA_ANTERIOR || COMPANIA_CAJON.has(t.toLowerCase()) ? null : t
}

/**
 * Valor que MUESTRA el campo: lo tecleado (aunque sea vacío) manda; si no, lo precargado por quien monta el bloque; y para
 * sexo/compañía anterior, lo que ya trae el formulario (ficha, póliza vigente). Nada se inventa: sin dato, `porDefecto`/vacío.
 */
export function valorCampoExtra(
  clave: string, extra: Record<string, string>, iniciales: Record<string, string> | undefined,
  formulario: unknown, porDefecto = '',
): string {
  if (extra[clave] !== undefined) return extra[clave]!
  const ini = iniciales?.[clave]
  if (ini !== undefined && ini !== '') return ini
  if (clave === 'sexo' || clave === 'companiaAnterior') {
    const f = (formulario && typeof formulario === 'object' ? (formulario as Record<string, unknown>)[clave] : undefined)
    if (typeof f === 'string' && f.trim() !== '' && (clave !== 'sexo' || f === 'hombre' || f === 'mujer')) return f.trim()
  }
  return ini ?? porDefecto
}

/** Mapa efectivo que se pasa al adaptador: precargados + tecleado (lo tecleado manda). */
export function extraEfectivo(extra: Record<string, string>, iniciales: Record<string, string> | undefined): Record<string, string> {
  return { ...iniciales, ...extra }
}

/**
 * ¿Hay que guardar este valor al terminar de editarlo? `null` = no (sin oportunidad/ficha donde guardar, valor no válido o igual
 * al ya guardado). `guardado` es lo que ya constaba. Nunca borra: un campo vaciado no pisa el dato guardado.
 */
export function accionGuardarExtra(
  clave: string, valor: string,
  ctx: { oportunidadId: string | null; guardado?: string | null; sexoSinFicha?: boolean },
): AccionGuardarExtra | null {
  const guardado = (ctx.guardado ?? '').trim()
  if (clave === 'cilindrada') {
    const cc = cilindradaDeTexto(valor)
    if (!ctx.oportunidadId || cc === null || cc < 51 || cc > 3000) return null
    return String(cc) === guardado ? null : { tipo: 'cilindrada', cc }
  }
  if (clave === 'sexo') {
    return ctx.sexoSinFicha === true && (valor === 'hombre' || valor === 'mujer') ? { tipo: 'sexo', sexo: valor } : null
  }
  if (clave === 'companiaAnterior') {
    const t = companiaGuardable(valor)
    if (!ctx.oportunidadId || t === null) return null
    return t === guardado ? null : { tipo: 'compania', texto: t }
  }
  if (clave === 'fechaAdquisicion') {
    const f = fechaIsoValida(valor)
    return !ctx.oportunidadId || f === null || f === guardado ? null : { tipo: 'fechaAdquisicion', fecha: f }
  }
  if (clave === 'polizaAnteriorUltimos5') {
    const p = ultimos5CifrasPoliza(valor)
    return !ctx.oportunidadId || p === null || p === ultimos5CifrasPoliza(guardado) ? null : { tipo: 'poliza', ultimos5: p }
  }
  if (clave === 'fotocopiaAnterior') {
    const j = JUSTIFICANTES_SEGURO_ANTERIOR.find((x) => x === valor)
    return !ctx.oportunidadId || j === undefined || j === guardado ? null : { tipo: 'justificante', valor: j }
  }
  return null
}

/**
 * Cuerpo del `editar` que guarda la compañía anterior: `aseguradora` (lo que ya leía el bot) y, en la MISMA llamada,
 * `historialDeclarado.companiaActual` (lo que muestra «Historial y bonificaciones»). Una sola fuente, dos sitios coherentes.
 * Pero NO se envía el historial si ya trae un CÓDIGO de la lista (no se pisa con texto libre) o dice «sin seguro actual»
 * (el servidor lo rechaza con 422 y tumbaría también el guardado de `aseguradora`): entonces solo `aseguradora`. PURA.
 */
export function cuerpoGuardarCompania(
  oportunidadId: string, texto: string,
  historial?: { companiaActual?: string | null; tieneSeguroActual?: boolean | null } | null,
): Record<string, unknown> {
  const base = { accion: 'editar', id: oportunidadId, aseguradora: texto }
  if (historial && (esCodigoCompania(historial.companiaActual) || historial.tieneSeguroActual === false)) return base
  return { ...base, historialDeclarado: { companiaActual: texto } }
}

/**
 * Cuerpo del `editar` que guarda un dato de «Póliza actual» en el historial declarado (póliza anterior o justificante). Una sola
 * clave: no toca el resto del historial. Si el historial dice «sin seguro actual» el servidor lo rechaza con 422 y se dice. PURA.
 */
export function cuerpoGuardarHistorial(oportunidadId: string, clave: 'numeroPoliza' | 'fotocopiaAnterior', valor: string): Record<string, unknown> {
  return { accion: 'editar', id: oportunidadId, historialDeclarado: { [clave]: valor } }
}

/**
 * Opciones de un campo desplegable. El sexo vacío se llama «Elegir…» solo si la ficha NO lo tiene (`sexoSinFicha !== false`); si
 * la ficha ya lo tiene (`false`: ya guardado, p. ej. por este mismo campo) el vacío dice «Según la ficha»: el servidor lo toma de
 * ella al encolar, y el navegador no lo conoce (antes parecía no recordarse). PURA.
 */
export function opcionesDeCampoExtra<O extends { valor: string; etiqueta: string }>(clave: string, opciones: readonly O[], formulario: unknown): readonly O[] {
  const sinFicha = formulario && typeof formulario === 'object' ? (formulario as { sexoSinFicha?: unknown }).sexoSinFicha : undefined
  if (clave !== 'sexo' || sinFicha !== false) return opciones
  return opciones.map((o) => (o.valor === '' ? { ...o, etiqueta: 'Según la ficha' } : o))
}
