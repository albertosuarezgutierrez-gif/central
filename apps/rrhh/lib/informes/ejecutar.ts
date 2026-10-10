// Orquestación servidor: consulta (filtrada por la empresa de SESIÓN) + motor + cabecera.

import { entidad as buscarEntidad, LIMITE_FILAS } from './catalogo'
import { construirCabecera, type CabeceraInforme } from './cabecera'
import { contextoCabecera, leerFilas } from './consultas'
import { calcularInforme, type ResultadoInforme } from './motor'
import type { PeticionInforme } from './validador'

/** `empresaId` SOLO puede venir de getSesion(). La petición ya está validada (validador.ts). */
export async function ejecutarInforme(empresaId: string, pet: PeticionInforme): Promise<{ resultado: ResultadoInforme; cabecera: CabeceraInforme }> {
  const ent = buscarEntidad(pet.entidad)
  if (!ent) throw new Error(`Entidad fuera del catálogo: ${pet.entidad}`)
  const [filas, ctx] = await Promise.all([leerFilas(empresaId, pet, LIMITE_FILAS), contextoCabecera(empresaId, pet)])
  const resultado = calcularInforme(ent, pet, filas, LIMITE_FILAS)
  return { resultado, cabecera: construirCabecera(ent, pet, ctx.empresa, ctx.nombres) }
}
