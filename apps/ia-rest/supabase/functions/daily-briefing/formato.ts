// Formato del briefing diario — PURO (sin Deno, sin red, sin imports remotos) para que lo
// pueda cubrir un test de node en CI: el resto de `index.ts` es un edge function Deno que el
// typecheck del monorepo ni mira (`tsconfig.json` de ia-rest excluye `supabase/`).
//
// Aquí vive lo que el 27-28/08/2026 falló en Telegram: el briefing EN CRUDO que se manda cuando
// ningún LLM responde (v2 tiraba los datos y mandaba solo «⚠️ NVIDIA 410») y los tres estados
// del stock (regla de CLAUDE.md: `null` = no consultado ≠ `[]` = consultado y sin alertas).

export interface Metricas {
  numComandas: number
  totalVentas: number
  ticketMedio: number
  top5: string[]
  personalActivo: number
  /** null = NO se pudo consultar el stock (≠ `[]`, que es «consultado, nada bajo mínimo»). */
  alertas: string[] | null
}

/** Importe en euros en formato ESPAÑOL (`2.162,49€`) — regla global del monorepo. */
export function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/** Bloque de un restaurante para el prompt del LLM. */
export function bloqueContexto(nombre: string, m: Metricas): string {
  let t = `RESTAURANTE: ${nombre}\n`
  t += `- Comandas ayer: ${m.numComandas}\n`
  t += `- Ventas: ${eur(m.totalVentas)} · ticket medio: ${eur(m.ticketMedio)}\n`
  t += `- Top: ${m.top5.join(', ') || 'Sin datos'}\n`
  t += `- Personal activo ahora: ${m.personalActivo}\n`
  if (m.alertas === null) t += '- STOCK: no se pudo consultar (no afirmes que no hay alertas)\n'
  else if (m.alertas.length) t += `- ALERTAS STOCK: ${m.alertas.join(', ')}\n`
  else t += '- STOCK: revisado, nada bajo mínimo\n'
  return `${t}\n`
}

/** Briefing SIN IA: los mismos datos, sin prosa. Es lo que se manda cuando ningún LLM responde. */
export function bloquePlano(nombre: string, m: Metricas): string {
  const lineas = [
    `🍽️ <b>${nombre}</b>`,
    `Ayer: ${m.numComandas} comandas · ${eur(m.totalVentas)} · ticket medio ${eur(m.ticketMedio)}`,
    `Top platos: ${m.top5.join(', ') || 'sin datos'}`,
    `Personal activo: ${m.personalActivo}`,
  ]
  if (m.alertas === null) lineas.push('Stock: ❓ no se pudo consultar')
  else if (m.alertas.length) lineas.push(`⚠️ Stock bajo mínimo: ${m.alertas.join(', ')}`)
  return lineas.join('\n')
}

/**
 * Mensaje completo de Telegram. `texto` null = ningún proveedor de IA sirvió → se manda el
 * briefing en crudo y el pie DICE por qué no hay prosa (en vez de un ⚠️ sin datos).
 */
export function mensajeBriefing(
  fecha: string,
  filas: Array<{ nombre: string; m: Metricas }>,
  narrativa: { texto: string | null; via: string | null; fallos: string[] },
): string {
  const cuerpo = narrativa.texto ?? filas.map(f => bloquePlano(f.nombre, f.m)).join('\n\n')
  const pie = narrativa.texto
    ? `<i>🤖 ${narrativa.via} · ia.rest</i>`
    : `<i>⚠️ Sin IA — briefing en crudo. Motivos: ${narrativa.fallos.join(' · ')}</i>`
  return `📊 <b>Briefing ia.rest — ${fecha}</b>\n\n${cuerpo}\n\n${pie}`
}
