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

  // Foto del plan en `seguros.backfill_dni_plan` (una fila, se sobreescribe). Los
  // grupos de mismo DNI son la lista de fusiones y solo se pueden calcular aquí,
  // con la clave; el lote SQL los lee de la BD. Solo ids: ni DNI, ni hash, ni
  // nombre. Si la foto falla no se pierde el plan (se devuelve igual): un GET
  // en seco no debe morir por una tabla de apoyo.
  // Sin prefijar el schema: la conexión de la cartera ya trae `?schema=seguros`
  // (lib/asegura-url.ts), como el resto de libs; un `seguros.x` en SQL crudo
  // dispara el guardián de aislamiento, y aquí el ámbito ya viene en
  // `correduriaId`, que se escribe en la propia fila.
  try {
    await db.$executeRaw`
      insert into backfill_dni_plan (id, calculado_en, seco, correduria_id, resumen, choques)
      values (1, now(), ${opciones.seco}, ${correduriaId}::uuid,
              ${JSON.stringify(plan.resumen)}::jsonb, ${JSON.stringify(choques)}::jsonb)
      on conflict (id) do update
        set calculado_en = excluded.calculado_en, seco = excluded.seco,
            correduria_id = excluded.correduria_id, resumen = excluded.resumen, choques = excluded.choques`
  } catch (e) {
    console.warn('[backfill-dni] no se pudo guardar la foto del plan', e instanceof Error ? e.message : e)
  }

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
