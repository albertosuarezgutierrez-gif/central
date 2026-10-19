// Checklist de «datos necesarios» por compañía ANTES de pulsar «Tarificar» (15/10/2026, fase 2 de «datos obligatorios»).
// PURO: sin red ni envs, importable desde 'use client'. La fuente de qué pide cada bot es `obligatoriosPara` /
// `faltanParaTarificar` de `@central/module-tarificacion` (la misma que valida asegura al encolar); aquí solo se PROYECTA a
// filas ✓ / ✗ / «se toma de la ficha» y a la decisión de bloquear el botón.
//
// 🚨 Sin datos personales: claves y etiquetas, jamás valores. 🚨 Sin declaración para esa compañía/ramo (`null`) = NO
// disponible (nunca «todo ok»). 🚨 Un dato de la ficha que plataforma no ve NO bloquea (asegura lo valida al encolar).
import { faltanParaTarificar, mensajeFaltan, obligatoriosPara, supuestosFavorablesPara, conAntecedentesFavorables, type Faltante } from '@central/module-tarificacion'
import type { CampoDeFicha } from './tarificador-moto-formulario.ts'

/**
 * `ok` = el riesgo lo trae · `ficha` = se toma de la ficha del cliente (no bloquea) · `falta` = hay que completarlo ·
 * `supuesto` (18/10/2026) = no consta y el bot usa el SUPUESTO FAVORABLE declarado (antecedentes; no bloquea, nunca «listo»).
 */
export type EstadoFila = 'ok' | 'ficha' | 'falta' | 'supuesto'
export type FilaChecklist = { clave: string; etiqueta: string; estado: EstadoFila }

export type ChecklistCompania =
  /** Sin declaración de obligatorios para esta compañía/ramo: no se sabe qué pide, el botón no se ofrece. */
  | { estado: 'no_disponible'; motivo: string }
  /** El formulario del ramo aún no produce un riesgo (faltan datos generales, listados arriba): no hay nada que evaluar. */
  | { estado: 'sin_formulario' }
  | { estado: 'evaluado'; filas: FilaChecklist[]; faltan: Faltante[]; deFicha: number; bloquea: boolean; resumen: string }

/** Campos que el adaptador deja a la ficha (`completarDesdeFicha`) → ruta en el riesgo que cubre `obligatorios.ts`. */
const RUTA_DE_CAMPO_FICHA: Record<CampoDeFicha, string> = {
  codigoPostal: 'codigoPostal',
  fechaNacimiento: 'conductor.fechaNacimiento',
  fechaCarne: 'conductor.fechaCarne',
}

export const MOTIVO_SIN_DECLARACION = 'No se sabe qué datos pide el bot de esta compañía en este ramo: de momento no se puede tarificar desde aquí.'

/**
 * Checklist de una compañía sobre el `riesgo` que construyó el adaptador. `completarDesdeFicha`: campos que el servidor pone
 * desde la ficha (cuentan como cubiertos, «se toma de la ficha»). Los obligatorios de origen ficha (NIF y datos del
 * tomador) que el riesgo no trae tampoco bloquean: asegura los pone al entregar el trabajo y los valida al encolar, SALVO los
 * de `sinDatoEnFicha` (claves que la precalificación ya sabe que la ficha no tiene, p. ej. `conductor.sexo`): esos faltan. PURA.
 */
export function checklistCompania(compania: string, ramo: string, riesgo: Record<string, unknown>, completarDesdeFicha: readonly CampoDeFicha[] = [], sinDatoEnFicha: readonly string[] = []): ChecklistCompania {
  const lista = obligatoriosPara(compania, ramo)
  const sinFicha = faltanParaTarificar(compania, ramo, riesgo, { sinFicha: true })
  const conFicha = faltanParaTarificar(compania, ramo, riesgo)
  if (!lista || sinFicha === null || conFicha === null) return { estado: 'no_disponible', motivo: MOTIVO_SIN_DECLARACION }

  const rutasFicha = new Set(completarDesdeFicha.map((c) => RUTA_DE_CAMPO_FICHA[c]))
  const faltaForm = new Set(sinFicha.map((f) => f.clave))
  const faltaTodo = new Set(conFicha.map((f) => f.clave))
  const supuestas = new Set(supuestosFavorablesPara(compania, ramo, riesgo) ?? [])
  const filas: FilaChecklist[] = []
  const faltan: Faltante[] = []
  for (const c of lista) {
    // `aplica` sobre el riesgo CON los supuestos favorables (p. ej. Mapfre: 5 años supuestos ⇒ pide la compañía anterior).
    if (c.aplica && !c.aplica(ramo === 'auto' || ramo === 'moto' ? conAntecedentesFavorables(riesgo).formulario : riesgo)) continue
    let estado: EstadoFila
    if (faltaForm.has(c.clave)) estado = rutasFicha.has(c.clave) ? 'ficha' : 'falta'
    else if (faltaTodo.has(c.clave)) estado = sinDatoEnFicha.includes(c.clave) ? 'falta' : 'ficha' // origen ficha: lo pone asegura; salvo que se SEPA que la ficha no lo tiene
    else if (supuestas.has(c.clave)) estado = 'supuesto'
    else estado = 'ok'
    filas.push({ clave: c.clave, etiqueta: c.etiqueta, estado })
    if (estado === 'falta') faltan.push({ clave: c.clave, etiqueta: c.etiqueta })
  }
  return { estado: 'evaluado', filas, faltan, deFicha: filas.filter((f) => f.estado === 'ficha').length, bloquea: faltan.length > 0, resumen: mensajeFaltan(faltan) }
}

/** Texto bajo el botón de la compañía cuando NO se puede tarificar; `null` = se puede (o se espera al formulario). PURA. */
export function avisoDeChecklist(c: ChecklistCompania): string | null {
  if (c.estado === 'no_disponible') return c.motivo
  if (c.estado === 'evaluado' && c.bloquea) return c.resumen
  return null
}

/** «7 de 9 listos» (los de ficha cuentan aparte): resumen del desplegable. PURA. */
export function resumenFilas(c: Extract<ChecklistCompania, { estado: 'evaluado' }>): string {
  const ok = c.filas.filter((f) => f.estado === 'ok').length
  const base = `${ok} de ${c.filas.length} datos listos`
  return c.deFicha > 0 ? `${base} · ${c.deFicha} de la ficha` : base
}

/**
 * Etiquetas de lo que pide un bot (sin estado ✓/✗): para pantallas que NO tienen el riesgo en el navegador (p. ej. «Probar
 * tarificación», que reencola el último riesgo en servidor). `null` = sin declaración (no se sabe). PURA.
 */
export function datosQuePide(compania: string, ramo: string): string[] | null {
  const l = obligatoriosPara(compania, ramo)
  return l ? l.map((c) => c.etiqueta) : null
}
