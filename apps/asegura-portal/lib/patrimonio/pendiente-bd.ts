// PATRIMONIO (24/10/2026, P13) — lo que «Pendiente de ti» (`lib/pendiente-de-ti.ts`) cuenta del patrimonio: vencimientos
// (calendario) e inmuebles sin revisar (enlace de seguro). Las dos lecturas parten de `accesosPatrimonio()` (dentro de
// `calendarioDeIdentidad` y `resumenPatrimonio`).
//
// Tres desenlaces, ninguno es «nada pendiente» por defecto:
//  · `undefined` = esta identidad no tiene patrimonio a la vista → la lista no dice nada de patrimonio;
//  · `null`      = el calendario no se pudo leer → «sin comprobar»;
//  · objeto      = leído; `sinRevisar: null` si los seguros no se pudieron leer (cartera o declaradas caídas).
import type { EntradaPendientes } from '../pendiente-de-ti'
import { calendarioDeIdentidad } from './calendario-bd'
import { resumirCubre } from './cubre-seguro'
import { avisosCubreSeguro } from './cubre-seguro-bd'
import { puertosSegurosInmueble, resumenPatrimonio } from './seguros-inmueble-bd'

export async function patrimonioParaPendientes(identidadId: string): Promise<EntradaPendientes['patrimonio']> {
  let cal
  try {
    cal = await calendarioDeIdentidad(identidadId)
  } catch (e) {
    console.error('[pendiente-de-ti] calendario del patrimonio ilegible:', e instanceof Error ? e.message : e)
    return null
  }
  if (cal === null) return undefined

  let sinRevisar: number | null = null
  try {
    const vis = await puertosSegurosInmueble(identidadId).visibles()
    // Con cualquiera de las dos fuentes caída no se sabe qué está enlazado: ni «sin revisar» ni «revisado».
    if (vis.cartera !== null && vis.declaradas !== null) {
      const r = await resumenPatrimonio(identidadId, [...vis.cartera, ...vis.declaradas])
      sinRevisar = r === null ? 0 : r.sinRevisar
    }
  } catch (e) {
    console.error('[pendiente-de-ti] seguros del patrimonio ilegibles:', e instanceof Error ? e.message : e)
  }

  // «¿Esto lo cubre tu seguro?»: ilegible → `null` (sinComprobar), nunca «nada que mirar».
  let reparaciones: { cubre: number; sinSeguro: number; sinComprobar: number } | null = null
  try {
    const avisos = await avisosCubreSeguro(identidadId)
    if (avisos) reparaciones = resumirCubre(avisos)
  } catch (e) {
    console.error('[pendiente-de-ti] reparaciones ilegibles:', e instanceof Error ? e.message : e)
  }
  return { ...cal.resumen, sinRevisar, reparaciones }
}
