// Vigilancia diaria de DUPLICADOS VIVOS nuevos (03/10/2026). PURO: sin red ni BD.
//
// El cron `correduria-sustituciones` lee `duplicadosAsegura()` y avisa por Telegram SOLO de los grupos que no
// estaban en el último aviso. Lo ya visto se guarda como lista de claves `numero|dgs` en el evento
// `duplicados_vivos_visto` de asegura (misma idea que la firma de `correduria-ingesta`: se compara con lo
// último dicho, no con «lo de ayer»). El mensaje lleva número y compañía, NUNCA nombres.

export type GrupoDuplicadoVisto = { numero: string; filas: number; dgs: string | null }

export const TOPE_LINEAS_DUPLICADOS = 20

/** `numero|dgs`; sin compañía, `numero|`. */
export function claveGrupoDuplicado(g: Pick<GrupoDuplicadoVisto, 'numero' | 'dgs'>): string {
  return `${g.numero}|${g.dgs ?? ''}`
}

/** Los grupos de `actuales` cuya clave no está en `vistosAnteriores` (`null` = nunca se avisó: todos son nuevos). */
export function gruposDuplicadosNuevos(
  actuales: readonly GrupoDuplicadoVisto[],
  vistosAnteriores: readonly string[] | null,
): GrupoDuplicadoVisto[] {
  const vistos = new Set(vistosAnteriores ?? [])
  return actuales.filter((g) => !vistos.has(claveGrupoDuplicado(g)))
}

/** `null` = nada nuevo: no se manda. `total` = grupos vivos ahora (la muestra del puerto tiene tope). */
export function mensajeDuplicadosNuevos(nuevos: readonly GrupoDuplicadoVisto[], total: number): string | null {
  if (nuevos.length === 0) return null
  const lineas = nuevos
    .slice(0, TOPE_LINEAS_DUPLICADOS)
    .map((g) => `• ${g.numero} · ${g.dgs ?? 'sin compañía'} (${g.filas} filas)`)
    .join('\n')
  const pie = nuevos.length > TOPE_LINEAS_DUPLICADOS ? `\n… y ${nuevos.length - TOPE_LINEAS_DUPLICADOS} más` : ''
  return `🧬 *Pólizas duplicadas nuevas · Grupo ASegura*\n${nuevos.length} grupo(s) nuevo(s) de pólizas vivas con el mismo número y compañía (${total} en total):\n\n${lineas}${pie}\nRevísalas en /correduria.`
}
