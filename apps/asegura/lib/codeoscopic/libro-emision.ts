// El embudo del ReRate y del Submit: la línea en el libro de consumo que hasta
// el 21/09/2026 NO se abría. Impuro (BD), como `consumo.ts`.
//
// ─── Qué copia de `cotizar.ts`, y por qué se copia el ORDEN y no el código ───
// `cotizar.ts` sigue siendo el embudo de `POST /insurances` y **no se toca**.
// Lo que se reutiliza aquí es su orden, que es el diseño:
//
//   1. Libro    → si no se puede leer, NO se llama (fail closed).
//   2. Tope     → decisión pura (`puedeGastarEmision`), sobre el libro ya escrito.
//   3. Reserva  → se escribe ANTES de llamar.
//   4. Llamada  → un solo intento. Lo hace el caller; aquí solo se envuelve.
//   5. Cierre   → facturable, o descartado CON evidencia.
//
// Y con él, la regla que lo sostiene: **una llamada sin desenlace cuenta como
// gastada**. Un timeout o un 5xx dejan la línea en `reservado`, que sigue
// contando, porque «no sé si me han cobrado» no es «fue gratis». Solo libera
// cupo un cierre con evidencia de que el vendor no llegó a hacer nada.
//
// ⚠️ Lo que este fichero NO hace: mirar el interruptor. El ReRate y el Submit
// van detrás de `CODEOSCOPIC_EMISION_ACTIVA` (`resolverConfigEmision`), que ya
// ha comprobado el caller antes de llegar aquí — igual que `cotizar()` mira el
// suyo. Duplicar esa comprobación aquí daría dos sitios donde apagar lo mismo.

import { randomUUID } from 'node:crypto'
import { ErrorCodeoscopic } from './cliente.ts'
import { cerrarDescartado, cerrarEmisionFacturable, consumoEmision, reservarEmision } from './consumo.ts'
import {
  costeEmisionCents,
  describirCoste,
  puedeGastarEmision,
  topesEmision,
  type OperacionEmision,
} from './gasto-emision.ts'

export type GastoEmision<T> =
  | {
      ok: true
      valor: T
      /** Qué se ha apuntado. Con la env a 0 dice que el coste no está confirmado. */
      coste: string
      /** Cuántas llamadas de ESTA operación quedan hoy tras esta. */
      restantesHoy: number
    }
  | { ok: false; razon: 'sin-libro' | 'tope'; mensaje: string }

/** Evidencia de que el vendor NO llegó a cobrar. Exige texto, como la BD. */
export type EvidenciaSinCargo = { evidencia: string; codigo: string }

/**
 * Envuelve UNA llamada al vendor con su línea en el libro.
 *
 * `llamada` se invoca **una sola vez** y su excepción se propaga tal cual: el
 * caller (la cascada de reparación de `/oferta` y `/emitir`) necesita el
 * `ErrorCodeoscopic` original para traducir el 400. Lo que este envoltorio hace
 * antes de dejarla pasar es cerrar la línea como corresponda.
 *
 * `evidenciaSinCargo` existe porque las dos operaciones fallan distinto: el
 * ReRate lanza `ErrorCodeoscopic` (y `pruebaQueNoHuboCargo` ya sabe decidir),
 * mientras que el Submit devuelve su fallo como valor. Sin este gancho, un
 * rechazo del Submit se quedaría contado como gasto para siempre.
 */
export async function conLibroDeEmision<T>(
  p: {
    correduriaId: string
    operacion: OperacionEmision
    solicitadoPor: string
    /** Para poder explicar la factura línea a línea. Puede no conocerse aún. */
    projectId: string | null
  },
  llamada: () => Promise<T>,
  opciones: {
    evidenciaSinCargo?: (valor: T) => EvidenciaSinCargo | null
    /**
     * Si `llamada()` puede RESOLVER (no lanzar) con un valor que no es un
     * éxito — el caso del Submit, que envuelve el `fetch` entero y devuelve
     * el estado HTTP en vez de lanzar en un 5xx — este predicado dice cuándo
     * ese valor es de verdad un éxito facturable. Por defecto `true`: si no
     * se pasa (el caso del ReRate, que lanza `ErrorCodeoscopic` en cualquier
     * fallo), resolver ya ES el éxito, como hasta ahora.
     */
    exitoso?: (valor: T) => boolean
    env?: Record<string, string | undefined>
  } = {},
): Promise<GastoEmision<T>> {
  const env = opciones.env ?? process.env
  const costeCents = costeEmisionCents(p.operacion, env)

  // 1 — Libro. Si no se puede leer, se para aquí.
  let consumo
  try {
    consumo = await consumoEmision(p.correduriaId, p.operacion)
  } catch (e) {
    return {
      ok: false,
      razon: 'sin-libro',
      mensaje:
        'No se llama a la compañía porque no se puede leer el libro de consumo, y sin él el tope ' +
        `no existe: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // 2 — Tope
  const veredicto = puedeGastarEmision(p.operacion, consumo, topesEmision(p.operacion, env), costeCents)
  if (!veredicto.permitido) return { ok: false, razon: 'tope', mensaje: veredicto.explicacion }

  // 3 — Reserva ANTES de llamar
  const intentoId = randomUUID()
  try {
    await reservarEmision({
      correduriaId: p.correduriaId,
      intentoId,
      operacion: p.operacion,
      solicitadoPor: p.solicitadoPor,
      costeCents,
      projectId: p.projectId,
    })
  } catch (e) {
    return {
      ok: false,
      razon: 'sin-libro',
      mensaje: `No se pudo anotar la reserva, así que no se llama a la compañía: ${
        e instanceof Error ? e.message : String(e)
      }`,
    }
  }

  // 4 — La llamada. Un solo intento.
  let valor: T
  try {
    valor = await llamada()
  } catch (e) {
    if (e instanceof ErrorCodeoscopic && e.pruebaQueNoHuboCargo) {
      await cerrarDescartado(intentoId, `${e.clase}: ${e.detalle}`, e.clase).catch(() => {
        // Si ni el descarte se puede escribir, la reserva se queda abierta y
        // sigue contando. Conservador a propósito, igual que en `cotizar()`.
      })
    }
    // Timeout, 5xx o respuesta ilegible: la línea se queda en `reservado` y
    // sigue contando. No sabemos si nos han cobrado.
    throw e
  }

  // 5 — Cierre
  //
  // 🚨 TRES desenlaces, no dos: `sinCargo` (evidencia de que el vendor no
  // llegó a hacer nada → libera cupo), éxito confirmado (→ facturable), y
  // AMBIGUO (resolvió, pero `exitoso` dice que no fue un éxito y tampoco hay
  // evidencia de que no costara — el 5xx del Submit, «Codeoscopic dejó de
  // esperar a la compañía y no se sabe si emitió»). El ambiguo se queda en
  // `reservado`: es el mismo caso que un timeout, solo que llegó por la rama
  // que SÍ resuelve en vez de lanzar. Cerrarlo como `facturable` sin haberlo
  // confirmado sería la regla `null≠0` incumplida en el sitio que más cuesta.
  const sinCargo = opciones.evidenciaSinCargo?.(valor) ?? null
  const exitoso = opciones.exitoso?.(valor) ?? true
  if (sinCargo) {
    await cerrarDescartado(intentoId, sinCargo.evidencia, sinCargo.codigo).catch(() => {})
  } else if (exitoso) {
    await cerrarEmisionFacturable(intentoId).catch(() => {
      // La llamada ya está hecha y la línea sigue en `reservado`, o sea
      // contada. Perder el cierre encarece la cuenta, nunca la abarata.
    })
  }
  // else: ni sinCargo ni exitoso → se deja tal cual, en `reservado`.

  return {
    ok: true,
    valor,
    coste: describirCoste(p.operacion, 1, costeCents),
    restantesHoy: veredicto.restantesHoy - 1,
  }
}
