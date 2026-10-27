// PATRIMONIO (27/10/2026) — qué vale el grupo de un titular para la correduría, para el CUPO mensual de lectura de facturas
// con IA (`cupoMensualIa` de @central/module-patrimonio). PURO: las filas entran ya leídas.
//
// Grupo = el titular + las personas a las que ÉL autoriza (autorizaciones vivas que ha dado, a una ficha de cliente).
// Valor = nº de pólizas EN VIGOR del grupo (`esCarteraEnVigor`, no `clientes.tipo`): la comisión anual NO se usa hoy porque el
// rol del portal no tiene GRANT sobre las columnas de comisión de `poliza_recibos` y anualizar recibos no es fiable.
import { esCarteraEnVigor } from '@central/module-seguros'
import type { ValorCliente } from '@central/module-patrimonio'

export type FilaPolizaValor = {
  importRef: string | null
  eiacXmlHash: string | null
  estado: string | null
  sustituidaAt: Date | null
  mergedIntoPolizaId: string | null
}

/** Pólizas en vigor de las filas dadas. Una fusionada en otra no cuenta (sería contarla dos veces). */
export function contarPolizasEnVigor(filas: readonly FilaPolizaValor[]): number {
  return filas.filter((f) => f.mergedIntoPolizaId === null && esCarteraEnVigor({ importRef: f.importRef, eiacXmlHash: f.eiacXmlHash, estado: f.estado, sustituidaAt: f.sustituidaAt })).length
}

/** `filas` = `null` cuando la lectura falló o no se hizo: NO SE SABE (nunca 0). La comisión no se calcula hoy: siempre `null`. */
export function valorDelGrupo(filas: readonly FilaPolizaValor[] | null, recompensaVigente = false): ValorCliente {
  const v: ValorCliente = { comisionAnualCent: null, polizasEnVigor: filas === null ? null : contarPolizasEnVigor(filas) }
  // Recomendación canjeada hace menos de 90 días (`recomendacion.ts`): `cupoMensualIa` sube el básico a amplio, nunca rebaja. Solo
  // se pone cuando es `true`: ausente = sin recompensa o no se pudo comprobar.
  return recompensaVigente ? { ...v, recompensaVigente: true } : v
}
