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
//   hashes. Ni el documento ni su titular cruzan el puerto. El NOMBRE se lee
//   —hace falta para detectar el DNI centinela— pero tampoco se emite.
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
  /**
   * Grupos cuyo DNI está escrito en fichas de personas DISTINTAS: centinelas.
   * No son candidatos a fusión — son un dato que hay que corregir a mano.
   */
  compartidos: { fichas: string[]; nombresDistintos: number }[]
  /** Cuántos hashes se han escrito de verdad. `0` en seco. */
  escritos: number
  /** Fichas que no se pudieron escribir pese a no chocar en el plan (carrera con otra escritura). */
  fallidos: string[]
  /**
   * Cuántas quedan por escribir tras esta pasada. `0` = terminado. Sólo puede
   * ser > 0 si se pidió un `limite`.
   */
  restantes: number
  seco: boolean
}

/**
 * Cuántas filas van en cada `UPDATE`. El bulk existe porque la escritura de una
 * en una son ~15.000 idas y vueltas al pooler y no cabe en los 300 s del
 * endpoint; el troceo, porque un `VALUES` de 15.000 filas es una sentencia de
 * varios megas.
 */
const TANDA = 500

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
  opciones: { seco: boolean; limite?: number },
): Promise<ResultadoBackfill> {
  const db = prismaAsegura()
  const filas = await db.cliente.findMany({
    where: { correduriaId, mergedIntoClienteId: null },
    select: { id: true, dni: true, dniLookupHash: true, tipo: true, nombre: true, apellidos: true },
  })

  const fichas: FichaDni[] = filas.map((f) => {
    const esCliente = String(f.tipo) === 'cliente'
    // El nombre NO se emite: se compara con el de las otras fichas del mismo
    // hash para saber si ese DNI es de una persona o es un centinela.
    const nombre = `${f.nombre ?? ''} ${f.apellidos ?? ''}`.trim()
    if (f.dni === null || f.dni === '') {
      return { id: f.id, esCliente, dni: null, hashActual: f.dniLookupHash, nombre }
    }
    try {
      return { id: f.id, esCliente, dni: decryptField(f.dni), hashActual: f.dniLookupHash, nombre }
    } catch {
      // El campo está y no se puede leer. Eso es un hallazgo, no un hueco.
      return { id: f.id, esCliente, dni: null, descifradoFallido: true, hashActual: f.dniLookupHash, nombre }
    }
  })

  const plan = planBackfillDni(fichas, computeDniLookupHash, looksLikeDniNieCif)
  const choques = plan.choques.map((c) => ({ fichas: c.fichas, hayPreexistente: c.hayPreexistente }))
  const compartidos = plan.compartidos.map((c) => ({
    fichas: c.fichas,
    nombresDistintos: c.nombresDistintos,
  }))

  // Foto del plan en `seguros.backfill_dni_plan` (una fila, se sobreescribe). Los
  // grupos de mismo DNI son la lista de fusiones y los centinelas la lista de
  // datos a corregir, y ninguno de los dos se puede calcular sin la clave; el
  // lote SQL los lee de la BD. Solo ids: ni DNI, ni hash, ni nombre. Si la foto
  // falla no se pierde el plan (se devuelve igual): un GET en seco no debe morir
  // por una tabla de apoyo.
  // Sin prefijar el schema: la conexión de la cartera ya trae `?schema=seguros`
  // (lib/asegura-url.ts), como el resto de libs; un `seguros.x` en SQL crudo
  // dispara el guardián de aislamiento, y aquí el ámbito ya viene en
  // `correduriaId`, que se escribe en la propia fila.
  try {
    await db.$executeRaw`
      insert into backfill_dni_plan (id, calculado_en, seco, correduria_id, resumen, choques, compartidos)
      values (1, now(), ${opciones.seco}, ${correduriaId}::uuid,
              ${JSON.stringify(plan.resumen)}::jsonb, ${JSON.stringify(choques)}::jsonb,
              ${JSON.stringify(compartidos)}::jsonb)
      on conflict (id) do update
        set calculado_en = excluded.calculado_en, seco = excluded.seco,
            correduria_id = excluded.correduria_id, resumen = excluded.resumen,
            choques = excluded.choques, compartidos = excluded.compartidos`
  } catch (e) {
    console.warn('[backfill-dni] no se pudo guardar la foto del plan', e instanceof Error ? e.message : e)
  }

  const pendientes = plan.filas.filter(
    (f): f is { id: string; destino: 'rellenable'; hash: string } =>
      f.destino === 'rellenable' && f.hash !== null,
  )

  if (opciones.seco) {
    return {
      resumen: plan.resumen,
      choques,
      compartidos,
      escritos: 0,
      fallidos: [],
      restantes: pendientes.length,
      seco: true,
    }
  }

  const tope = opciones.limite !== undefined && opciones.limite > 0 ? opciones.limite : pendientes.length
  const aEscribir = pendientes.slice(0, tope)

  let escritos = 0
  const fallidos: string[] = []
  for (let i = 0; i < aEscribir.length; i += TANDA) {
    const tanda = aEscribir.slice(i, i + TANDA)
    try {
      escritos += await escribirTanda(db, correduriaId, tanda)
    } catch (e) {
      // Una tanda entera se pierde por UNA fila, y queremos saber cuál: se
      // repite de una en una. Sólo debería pasar en una carrera con otra
      // escritura (el plan ya excluye los choques y los centinelas).
      console.warn('[backfill-dni] tanda rechazada, se reintenta fila a fila', e instanceof Error ? e.message : e)
      for (const fila of tanda) {
        try {
          await db.cliente.update({ where: { id: fila.id }, data: { dniLookupHash: fila.hash } })
          escritos += 1
        } catch {
          fallidos.push(fila.id)
        }
      }
    }
  }

  return {
    resumen: plan.resumen,
    choques,
    compartidos,
    escritos,
    fallidos,
    restantes: pendientes.length - aEscribir.length,
    seco: false,
  }
}

/**
 * Un solo `UPDATE` para toda la tanda.
 *
 * `dni_lookup_hash is null` en el WHERE no es adorno: hace la escritura
 * idempotente y a prueba de carreras (si otra pasada ya escribió esa fila, ésta
 * no la pisa). `correduria_id` tampoco: con BYPASSRLS un id de otra correduría
 * no daría error, escribiría en su cartera.
 */
async function escribirTanda(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  tanda: { id: string; hash: string }[],
): Promise<number> {
  const ids = tanda.map((t) => t.id)
  const hashes = tanda.map((t) => t.hash)
  return db.$executeRaw`
    update clientes c
       set dni_lookup_hash = v.hash
      from (select unnest(${ids}::uuid[]) as id, unnest(${hashes}::text[]) as hash) v
     where c.id = v.id
       and c.correduria_id = ${correduriaId}::uuid
       and c.dni_lookup_hash is null`
}
