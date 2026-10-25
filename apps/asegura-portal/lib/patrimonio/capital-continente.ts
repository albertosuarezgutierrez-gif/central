// PATRIMONIO (24/10/2026, P14) — el CAPITAL DE CONTINENTE de una póliza, en céntimos, para la alerta de infraseguro.
// PURO: lo que lee cada fuente entra como parámetro.
//
// 🚨 `null` = no se sabe (nunca 0): sin cobertura de continente informada, con capital ilegible o AMBIGUO (dos
// coberturas «continente» con capitales distintos) no hay comparación posible y la alerta dice «sin dato».
// · Cartera: las coberturas llegan por nombre; solo cuenta la que ES el continente (nombre que EMPIEZA por continente /
//   edificio / edificación), no «Daños por agua al continente» ni «Robo del continente»: son límites parciales.
// · Declarada: `datos_ramo.capitalContinente` que escribió el cliente (euros, número o texto numérico).

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ES_CONTINENTE = /^(continente|edificio|edificacion)(\s|$|[:(\-–])/

/** `coberturas`: nombre y capital en EUROS (`'ilimitado'`/`null` no cuentan). Devuelve céntimos o `null`. */
export function capitalContinenteDeCartera(coberturas: { lista: readonly string[]; capitales?: readonly (number | 'ilimitado' | null)[] } | null): number | null {
  if (coberturas === null || coberturas.capitales === undefined) return null
  const valores = new Set<number>()
  coberturas.lista.forEach((nombre, i) => {
    const c = coberturas.capitales![i]
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return
    if (ES_CONTINENTE.test(sinTildes(nombre))) valores.add(Math.round(c * 100))
  })
  return valores.size === 1 ? [...valores][0]! : null
}

/** `datos_ramo` de una declarada de hogar/comercio/comunidad. Euros → céntimos; texto o ≤ 0 → `null`. */
export function capitalContinenteDeDeclarada(datosRamo: unknown): number | null {
  if (typeof datosRamo !== 'object' || datosRamo === null || Array.isArray(datosRamo)) return null
  const v = (datosRamo as Record<string, unknown>).capitalContinente
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : Number.NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}
