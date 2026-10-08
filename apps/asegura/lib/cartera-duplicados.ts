// Fuente del AVISO diario de duplicados nuevos (`correduria-sustituciones`, vía `/api/operador/duplicados/vivos`).
//
// 🚨 Un solo criterio (merge con main, 07/10/2026): ya NO hay SQL propio ni lista propia de comodines. Los
// grupos salen de `duplicadasCartera` → `leerFichasCandidatasDuplicadas` + `agruparDuplicadas`, lo mismo que
// ve la pantalla «Duplicadas» y la señal 🔁 del vigía, con los pares «no duplicado» ya descontados.
// Solo lectura. Número comparable, nº de fichas y compañía DGS; sin nombres ni DNI.

import { duplicadasCartera } from './cartera-historial'

export const TOPE_MUESTRA_DUPLICADOS = 50

/** `total` cuenta GRUPOS; `muestra` trae como mucho `TOPE_MUESTRA_DUPLICADOS`. */
export type DuplicadosVivos = {
  total: number
  muestra: Array<{ numero: string; filas: number; dgs: string | null }>
}

/** `null` = no se pudo leer (no es «no hay ninguno»). */
export async function duplicadosVivos(correduriaId: string): Promise<DuplicadosVivos | null> {
  const grupos = await duplicadasCartera(correduriaId)
  if (grupos === null) return null
  return {
    total: grupos.length,
    muestra: grupos
      .slice(0, TOPE_MUESTRA_DUPLICADOS)
      .map((g) => ({ numero: g.numero, filas: g.polizas.length, dgs: g.compania })),
  }
}
