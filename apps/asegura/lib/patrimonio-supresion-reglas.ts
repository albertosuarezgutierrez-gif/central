// Supresión (art. 17 RGPD) y señales de patrimonio — reglas PURAS (§0.2 de docs/legal/2026-10-26-borrador-p15-patrimonio.md).
// Al atender una supresión se BORRAN las filas de `portal_patrimonio_senal` de las fichas del suprimido. Aquí solo se decide
// QUÉ fichas y QUÉ ids; el SQL está en `patrimonio-supresion.ts`.

export type VinculoParaSupresion = { clienteId: string; origen: string; puedeAutorizar: boolean }
export type SenalParaSupresion = { id: string; correduriaId: string; clienteId: string }

/**
 * Fichas cuyas señales se borran: la ficha de la solicitud (si la hay) y las que la identidad opera COMO PROPIAS
 * (vínculo que autoriza y que no es la vista del corredor, igual que `identidadesDeFicha`). Un vínculo de solo lectura
 * o de gestor sobre la ficha de OTRA persona no arrastra las señales de esa otra persona.
 */
export function fichasASuprimir(clienteIdSolicitud: string | null, vinculos: readonly VinculoParaSupresion[]): string[] {
  const propias = vinculos.filter((v) => v.origen !== 'corredor' && v.puedeAutorizar).map((v) => v.clienteId)
  return [...new Set([...(clienteIdSolicitud ? [clienteIdSolicitud] : []), ...propias])]
}

/** Ids a borrar: SOLO de esta correduría y SOLO de las fichas indicadas (defensa en profundidad sobre el `where` del SQL). */
export function idsDeSenalesASuprimir(
  senales: readonly SenalParaSupresion[],
  correduriaId: string,
  fichas: readonly string[],
): string[] {
  const permitidas = new Set(fichas)
  return senales.filter((s) => s.correduriaId === correduriaId && permitidas.has(s.clienteId)).map((s) => s.id)
}

/** Estados de una supresión que la dan por ATENDIDA (la denegada no excluye nada). */
export const ESTADOS_SUPRESION_ATENDIDA = ['resuelta_total', 'resuelta_parcial'] as const

export type SupresionParaExcluir = { estado: string; clienteId: string | null; identidadId: string }

/** ¿Hay una supresión atendida de esta ficha, o de alguna identidad que la opera? El cron NO calcula entonces. */
export function fichaSuprimida(fichaId: string, identidades: readonly string[], supresiones: readonly SupresionParaExcluir[]): boolean {
  return supresiones.some(
    (s) => (ESTADOS_SUPRESION_ATENDIDA as readonly string[]).includes(s.estado) && (s.clienteId === fichaId || identidades.includes(s.identidadId)),
  )
}

/** ¿Hay que escribir la oposición? Solo si no hay ya una VIGENTE (`true`); `false` (la retiró) y `null` (nunca) sí. */
export function hayQueRegistrarOposicion(oposicionVigente: boolean | null): boolean {
  return oposicionVigente !== true
}

/** Frase para el registro de la supresión (`portal_supresion.respuesta`). `null` = no se pudo borrar: se dice, no se calla. */
export function constanciaSenales(borradas: number | null, oposicion: 'registrada' | 'ya_vigente' | 'error' = 'ya_vigente'): string {
  const base =
    borradas === null
      ? 'Señales de patrimonio: NO se pudieron borrar automáticamente; revisar y borrar a mano.'
      : `Señales de patrimonio borradas: ${borradas}.`
  const op =
    oposicion === 'registrada'
      ? ' Oposición a nuevas señales registrada.'
      : oposicion === 'error'
        ? ' Oposición a nuevas señales NO registrada (la ficha queda excluida del cálculo por la supresión).'
        : ' Ya tenía oposición vigente.'
  return base + op
}
