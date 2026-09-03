// Backfill del blind index de DNI de la cartera (`clientes.dni_lookup_hash`).
//
// El PORQUÉ, la aritmética y el orden de los tres pasos están en la pieza pura,
// `packages/module-seguros/src/backfill-dni.ts`. Aquí sólo se hacen las dos
// cosas que no se pueden hacer sin claves ni sin BD: DESCIFRAR el DNI y, cuando
// se pide expresamente, ESCRIBIR los hashes que no chocan.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - `correduriaId` SIEMPRE explícito: con BYPASSRLS un id ajeno no falla, escribe
//   en otra correduría.
// - **Este módulo no fusiona nada, nunca.** Los choques que devuelve son
//   CANDIDATOS a fusión, y la fusión sigue siendo un lote SQL con los nombres
//   delante de Alberto (`prisma/sql/*_fusion_*.sql`). Dos identificadores
//   distintos no se funden jamás, y aquí ni siquiera se sabe quién es quién.
// - El DNI **no sale de esta app**: lo que se devuelve son recuentos, ids y
//   hashes. Ni el documento ni su titular cruzan el puerto.
// - Tres estados: una ficha cuyo DNI no descifra se cuenta como `ilegible`, no
//   como «sin DNI». Colapsarlas diría que no hay dato donde lo que hay es un
//   dato que no se ha sabido leer.

import {
  decryptField,
  computeDniLookupHash,
  looksLikeDniNieCif,
} from '@central/module-seguros-pii'
import { planBackfillDni, type FichaDni, type PlanBackfillDni } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export interface ResultadoBackfill {
  resumen: PlanBackfillDni['resumen']
  /** Grupos de fichas `tipo='cliente'` que comparten DNI. Candidatos a fusión. */
  choques: { fichas: string[]; hayPreexistente: boolean }[]
  /** Cuántos hashes se han escrito de verdad. `0` en seco. */
  escritos: number
  /** Fichas que no se pudieron escribir pese a no chocar en el plan (carrera con otra escritura). */
  fallidos: string[]
  seco: boolean
}

/**
 * Lee TODAS las fichas de la correduría con DNI, calcula el plan y —sólo si
 * `seco === false`— escribe los hashes que no chocan.
 *
 * El plan se calcula siempre sobre la cartera ENTERA aunque se vaya a escribir
 * poco: un choque sólo se ve mirando a todos a la vez, y escribir a ciegas por
 * lotes es justo lo que dejó la base a medio hashear.
 */
export async function backfillDniLookupHash(
  correduriaId: string,
  opciones: { seco: boolean },
): Promise<ResultadoBackfill> {
  const db = prismaAsegura()
  const filas = await db.cliente.findMany({
    where: { correduriaId, mergedIntoClienteId: null },
    select: { id: true, dni: true, dniLookupHash: true, tipo: true },
  })

  const fichas: FichaDni[] = filas.map((f) => {
    const esCliente = String(f.tipo) === 'cliente'
    if (f.dni === null || f.dni === '') {
      return { id: f.id, esCliente, dni: null, hashActual: f.dniLookupHash }
    }
    try {
      return { id: f.id, esCliente, dni: decryptField(f.dni), hashActual: f.dniLookupHash }
    } catch {
      // El campo está y no se puede leer. Eso es un hallazgo, no un hueco.
      return { id: f.id, esCliente, dni: null, descifradoFallido: true, hashActual: f.dniLookupHash }
    }
  })

  const plan = planBackfillDni(fichas, computeDniLookupHash, looksLikeDniNieCif)
  const choques = plan.choques.map((c) => ({ fichas: c.fichas, hayPreexistente: c.hayPreexistente }))

  if (opciones.seco) {
    return { resumen: plan.resumen, choques, escritos: 0, fallidos: [], seco: true }
  }

  // Una a una y no en un `updateMany`: cada fila lleva su propio hash, y si el
  // índice único rechaza alguna (otra escritura se adelantó entre el plan y
  // aquí) queremos saber CUÁL, no perder el lote entero.
  let escritos = 0
  const fallidos: string[] = []
  for (const fila of plan.filas) {
    if (fila.destino !== 'rellenable' || fila.hash === null) continue
    try {
      await db.cliente.update({
        where: { id: fila.id },
        data: { dniLookupHash: fila.hash },
      })
      escritos += 1
    } catch {
      fallidos.push(fila.id)
    }
  }

  return { resumen: plan.resumen, choques, escritos, fallidos, seco: false }
}
