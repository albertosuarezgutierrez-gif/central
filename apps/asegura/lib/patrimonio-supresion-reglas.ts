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

/** Frase para el registro de la supresión (`portal_supresion.respuesta`). `null` = no se pudo borrar: se dice, no se calla. */
export function constanciaSenales(borradas: number | null): string {
  if (borradas === null) return 'Señales de patrimonio: NO se pudieron borrar automáticamente; revisar y borrar a mano.'
  return `Señales de patrimonio borradas: ${borradas}.`
}
