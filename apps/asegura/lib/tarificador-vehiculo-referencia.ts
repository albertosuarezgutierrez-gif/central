// Tarificador RPA — VEHÍCULO DE REFERENCIA de la oportunidad (01/11/2026, Alberto). PURO: sin BD ni red (`node --test`).
//
// «Identificar el vehículo UNA vez y que todas las compañías usen el mismo.» El vehículo vive en la OPORTUNIDAD, en su jsonb de
// siempre (`oportunidades.info_riesgo.vehiculoReferencia = { porOrigen: { humano?, mapfre?, poliza?, allianz? } }`: sin tabla ni
// migración). Uno por origen; el que MANDA lo decide `vehiculoReferenciaEfectivo` (humano > Mapfre por matrícula > póliza viva >
// Allianz). La póliza no se copia: se lee al entregar (siempre la de hoy).
//   · `ok` de Mapfre/Allianz con vehículo → se guarda su origen (`referenciaDeResultadoOrigen`).
//   · ENTREGA al worker (auto/moto): el riesgo lleva `vehiculoReferencia` = la efectiva (solo en la respuesta, nunca en BD).
//   · Un bot que aun así para por versión (`requiere_humano` con `error.opcionesVersion`) → asegura elige con el MISMO helper
//     (`elegirOpcionPorVehiculoReferencia`) contra la lista guardada y lo relanza por el camino de la bandeja (`eleccionVersion`),
//     con la marca `eleccionVersionReferencia` = el supuesto; al guardar la oferta, ese supuesto va a sus avisos → precio `estimado`.
//   · Elección de una PERSONA en la bandeja → referencia `humano` de la oportunidad y se propaga a los demás trabajos parados por
//     versión de esa oportunidad.
// 🚨 Solo catálogo (marca, modelo, versión, cifras técnicas). La matrícula nunca entra (el validador rechaza claves extra y formas
//    de dato personal) ni sale en avisos/logs.

import {
  elegirOpcionPorVehiculoReferencia,
  validarOpcionesVersion,
  validarVehiculoReferencia,
  vehiculoReferenciaDesdeConfirmado,
  vehiculoReferenciaDesdeSeleccion,
  vehiculoReferenciaEfectivo,
  claveCompania,
  ORIGENES_VEHICULO_REFERENCIA,
  type VehiculoReferencia,
} from '@central/module-tarificacion'
import { vehiculoDePolizaViva, type VehiculoEncadenado } from './tarificador-espera-vehiculo.ts'

/** Clave en `oportunidades.info_riesgo`. */
export const CLAVE_VEHICULO_REFERENCIA = 'vehiculoReferencia'
/** Marca en el riesgo del trabajo: la versión la eligió asegura por la referencia (texto del supuesto). */
export const MARCA_ELECCION_REFERENCIA = 'eleccionVersionReferencia'

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Ramos donde aplica (los de vehículo). */
export const esRamoVehiculo = (ramo: string): boolean => ramo === 'auto' || ramo === 'moto'

/** Las referencias guardadas en `info_riesgo` (solo las válidas, cada una con el origen de su casilla). PURA. */
export function referenciasDeInfo(info: unknown): VehiculoReferencia[] {
  const por = obj(obj(obj(info)?.[CLAVE_VEHICULO_REFERENCIA])?.porOrigen)
  if (!por) return []
  const out: VehiculoReferencia[] = []
  for (const o of ORIGENES_VEHICULO_REFERENCIA) {
    const v = validarVehiculoReferencia(por[o])
    if (v.ok && v.valor.origen === o) out.push(v.valor)
  }
  return out
}

/** `info_riesgo` con la referencia de su origen puesta (pisa solo esa casilla; lo demás intacto). PURA. */
export function infoConReferencia(info: unknown, v: VehiculoReferencia): Record<string, unknown> {
  const i = obj(info) ?? {}
  const actual = obj(i[CLAVE_VEHICULO_REFERENCIA]) ?? {}
  const por = obj(actual.porOrigen) ?? {}
  return { ...i, [CLAVE_VEHICULO_REFERENCIA]: { ...actual, porOrigen: { ...por, [v.origen]: v } } }
}

/** La referencia que da el `ok` de un bot de ORIGEN (Mapfre: su vehículo confirmado por matrícula; Allianz: su catálogo). PURA. */
export function referenciaDeResultadoOrigen(compania: string, ramo: string, v: VehiculoEncadenado | null): VehiculoReferencia | null {
  if (!v || !esRamoVehiculo(ramo)) return null
  const c = claveCompania(compania)
  if (c === 'mapfre' && v.vehiculoConfirmado) {
    const r = vehiculoReferenciaDesdeConfirmado(v.vehiculoConfirmado)
    if (!r) return null
    const s = v.seleccionVehiculo
    return s ? { ...r, marca: s.marca, modelo: s.modelo } : r
  }
  if (c === 'allianz' && v.seleccionVehiculo) return vehiculoReferenciaDesdeSeleccion(v.seleccionVehiculo, 'allianz')
  return null
}

/** De `datos_especificos` de la póliza VIVA (solo marca/modelo/versión, `vehiculoDePolizaViva`). PURA. */
export function referenciaDePoliza(datosEspecificos: unknown): VehiculoReferencia | null {
  const v = vehiculoDePolizaViva(datosEspecificos)
  return v?.seleccionVehiculo ? vehiculoReferenciaDesdeSeleccion(v.seleccionVehiculo, 'poliza') : null
}

/** La que MANDA en la oportunidad: guardadas + la de la póliza viva. PURA. */
export function referenciaEfectiva(info: unknown, datosPoliza: unknown): VehiculoReferencia | null {
  return vehiculoReferenciaEfectivo([...referenciasDeInfo(info), referenciaDePoliza(datosPoliza)])
}

/**
 * La referencia HUMANA a partir de la opción que eligió una persona en la bandeja: su etiqueta de catálogo es la versión (el modelo
 * NO se hereda: la persona puede haber elegido otro distinto del de la referencia previa); la marca, de la previa si la hay. PURA.
 */
export function referenciaDeEleccionHumana(etiqueta: string, previa: VehiculoReferencia | null): VehiculoReferencia | null {
  const v = validarVehiculoReferencia({ origen: 'humano', marca: previa?.marca ?? null, version: etiqueta })
  return v.ok ? v.valor : null
}

/** El riesgo con `vehiculoReferencia` (solo vehículo y riesgo objeto; sin referencia → el mismo objeto). PURA. */
export function riesgoConReferencia<T>(riesgo: T, ramo: string, v: VehiculoReferencia | null): T {
  const r = obj(riesgo)
  if (!v || !r || !esRamoVehiculo(ramo)) return riesgo
  return { ...r, [CLAVE_VEHICULO_REFERENCIA]: v } as T
}

export type FilaParadaVersion = { id: string; ramo: string; estado: string; modo: string | null; error: unknown; riesgo: unknown }

export type EleccionPorReferenciaTrabajo =
  | { aplicar: true; eleccion: { codigo: string | null; etiqueta: string }; supuesto: string }
  | { aplicar: false; motivo: string }

/**
 * ¿Se puede resolver por la referencia un trabajo parado por versión? Exige: `requiere_humano`, tarificar, vehículo, `error.tipo`
 * `eleccion` con su lista (`opcionesVersion`). Tope de UN intento automático (`humano: false`): con cualquier elección previa en el
 * riesgo (persona, IA o referencia) queda para una persona. Con `humano: true` (propagar la elección de una persona) solo se respeta
 * una elección HUMANA previa de ese trabajo (`eleccionVersion` sin marca automática). La opción sale de SU lista. PURA.
 */
export function eleccionPorReferenciaParaTrabajo(f: FilaParadaVersion, ref: VehiculoReferencia | null, o: { humano: boolean }): EleccionPorReferenciaTrabajo {
  if (!ref) return { aplicar: false, motivo: 'sin vehículo de referencia' }
  if (f.estado !== 'requiere_humano') return { aplicar: false, motivo: `estado ${f.estado}` }
  if ((f.modo ?? 'tarificar') !== 'tarificar') return { aplicar: false, motivo: `modo ${f.modo}` }
  if (!esRamoVehiculo(f.ramo)) return { aplicar: false, motivo: `ramo ${f.ramo}` }
  const err = obj(f.error)
  if (err?.tipo !== 'eleccion') return { aplicar: false, motivo: 'no es una elección de versión' }
  const opciones = validarOpcionesVersion(err.opcionesVersion)
  if (!opciones) return { aplicar: false, motivo: 'sin lista de versiones' }
  const rg = obj(f.riesgo)
  const tieneEleccion = rg?.eleccionVersion !== undefined && rg?.eleccionVersion !== null
  const marcaAuto = rg?.eleccionVersionIa !== undefined || rg?.[MARCA_ELECCION_REFERENCIA] !== undefined
  if (o.humano ? tieneEleccion && !marcaAuto : tieneEleccion || marcaAuto) return { aplicar: false, motivo: 'el trabajo ya tuvo una elección de versión' }
  const e = elegirOpcionPorVehiculoReferencia(opciones, ref)
  if (e.tipo !== 'coincidencia' && e.tipo !== 'aproximacion') return { aplicar: false, motivo: e.tipo }
  const elegida = opciones[e.indice]!
  return { aplicar: true, eleccion: { codigo: elegida.codigo, etiqueta: elegida.etiqueta }, supuesto: e.supuesto }
}

export type FilaPropagacion = FilaParadaVersion & { compania: string }
export type TrabajoPropagado = { id: string; compania: string; eleccion: { codigo: string | null; etiqueta: string }; supuesto: string }

/**
 * Propagar la elección de una PERSONA (ya convertida en referencia `humano`) a los DEMÁS trabajos de la oportunidad parados por
 * versión: los que `eleccionPorReferenciaParaTrabajo` (modo humano) resuelve. El trabajo donde eligió la persona queda fuera
 * (su elección es exacta, sin supuesto). PURA.
 */
export function planPropagacion(filas: readonly FilaPropagacion[], ref: VehiculoReferencia | null, origenId: string): TrabajoPropagado[] {
  const out: TrabajoPropagado[] = []
  for (const f of filas) {
    if (f.id === origenId) continue
    const d = eleccionPorReferenciaParaTrabajo(f, ref, { humano: true })
    if (d.aplicar) out.push({ id: f.id, compania: f.compania, eleccion: d.eleccion, supuesto: d.supuesto })
  }
  return out
}

/** Las ofertas con el supuesto de la referencia en sus avisos (si el riesgo lleva la marca y no está ya). PURA. */
export function ofertasConSupuestoReferencia<O extends { avisos?: unknown }>(ofertas: readonly O[], riesgo: unknown): O[] {
  const s = obj(riesgo)?.[MARCA_ELECCION_REFERENCIA]
  if (typeof s !== 'string' || s.trim() === '') return [...ofertas]
  return ofertas.map((o) => {
    const avisos = Array.isArray(o.avisos) ? (o.avisos as unknown[]) : []
    return avisos.includes(s) ? o : { ...o, avisos: [...avisos, s] }
  })
}
