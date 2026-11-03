// «Tarificar con bots (gratis)» en Retarificar (28/10/2026, «siempre las dos opciones, Avant2 o bot»).
// PURO: sin red ni envs, importable desde 'use client' y desde tests.
//
// Retarificar solo ofrecía «Pedir precio — cuesta 0,50€», y la oportunidad con el vehículo no existía hasta pagar (el bot
// contestaba 409 `sin_riesgo_previo`). Aquí se decide, SIN pagar ni llamar a Codeoscopic, qué del formulario se guarda en
// `info_riesgo.datosVehiculo` (PATCH gratis del riesgo) y a dónde se va después: la pantalla del riesgo, que ya monta
// «Bots (gratis)» (`BotsAutoRiesgo`/`BotsHogarRiesgo`, «Pedir precio a todas»).
//
// 🚨 `null` = «no se sabe»: lo que el formulario no tiene NO se manda (clave ausente = no se toca), nunca `''`/`null`/0.
// Estado civil, tipo de vía y municipio salen de la FICHA del tomador (los bots los leen de ahí) y la fecha de efecto es de
// Avant2: no viajan. No se confirma (`confirmadoAt` queda sin sello): lo tecleado aquí es un borrador hasta que la
// corredora lo confirme en el riesgo.
import { payloadVersion, ramoCatalogo, seleccionDeVersion } from '../app/(usuario)/correduria/oportunidad/[id]/catalogo-vehiculo.ts'

export const TEXTO_BOTS_GRATIS = 'Tarificar con bots (gratis)'
export const TEXTO_AVANT2 = 'Pedir precio — cuesta 0,50€'

type Op = { id: string; nombre: string }

export type EntradaDatosVehiculo = {
  ramo: string | null
  marcas: readonly Op[]
  modelos: readonly Op[]
  versiones: readonly Op[]
  marcaId: string
  modeloId: string
  motorId: string
  codigoVehiculo: string
  garaje: string
  fechaMatriculacion: string
}

export type DatosVehiculoAGuardar =
  | { ok: true; datos: Record<string, string> }
  | { ok: false; motivo: 'no_aplica' | 'falta_version' }

function fechaIsoReal(f: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/**
 * El cuerpo de `datosVehiculo` para el PATCH del riesgo. Con la cascada marca → modelo → versión completa van los 7 campos
 * juntos (`payloadVersion`: el PATCH borra los ids si llegan nombres sin código); con la versión recuperada de una cotización
 * (sin cascada), solo el código. Garaje y matriculación, solo si están (y la fecha, si es real).
 */
export function datosVehiculoDeRetarificar(e: EntradaDatosVehiculo): DatosVehiculoAGuardar {
  if (e.ramo === null || ramoCatalogo(e.ramo) === null) return { ok: false, motivo: 'no_aplica' }
  const codigo = e.codigoVehiculo.trim()
  if (codigo === '') return { ok: false, motivo: 'falta_version' }
  const sel = seleccionDeVersion({
    marcas: e.marcas, modelos: e.modelos, versiones: e.versiones,
    marcaId: e.marcaId, modeloId: e.modeloId, motorId: e.motorId, codigoVehiculo: codigo,
  })
  const datos: Record<string, string> = sel ? payloadVersion(sel) : { codigoVehiculo: codigo }
  const garaje = e.garaje.trim()
  if (garaje !== '') datos.garaje = garaje
  const mat = e.fechaMatriculacion.trim()
  if (fechaIsoReal(mat)) datos.fechaMatriculacion = mat
  return { ok: true, datos }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El id de la oportunidad abierta por `/api/correduria/oportunidad/de-poliza`, o `null` (no se inventa ninguno). */
export function idOportunidadAbierta(status: number, json: unknown): string | null {
  if (status < 200 || status >= 300 || typeof json !== 'object' || json === null) return null
  const j = json as Record<string, unknown>
  return j.estado === 'ok' && typeof j.oportunidadId === 'string' && UUID.test(j.oportunidadId) ? j.oportunidadId : null
}

/** Dónde aparecen los precios de los bots: el bloque «Bots (gratis)» de la oportunidad. */
export function urlBotsGratis(oportunidadId: string): string {
  return `/correduria/oportunidad/${encodeURIComponent(oportunidadId)}#bots-gratis`
}
