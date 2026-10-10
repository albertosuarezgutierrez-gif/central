// Emparejado 1↔1 de movimientos importados (xls/norma43) con su gemelo del feed del banco (psd2).
// Lógica PURA (sin BD). Cada gemelo psd2 se CONSUME al emparejarse: un psd2 solo puede cubrir UN
// movimiento importado, nunca varios. Así los cargos recurrentes del mismo importe en días
// distintos (p. ej. 7 cargos de -170 € en 3 semanas) no se toman por duplicados unos de otros, y si
// hay dos cargos iguales el mismo día con un solo gemelo, solo UNO se marca.
// Tolerancia de fecha por defecto = 0 días: el feed y el Excel traen la MISMA fecha_operacion; ampliarla
// funde cargos recurrentes legítimos (suscripciones diarias/semanales del mismo importe).

export type MovGemelo = { id: string; fecha: string; importe: number }

export function emparejarGemelos(
  importados: MovGemelo[],
  feed: MovGemelo[],
  toleranciaDias = 0,
): Array<{ importadoId: string; feedId: string }> {
  const dia = (f: string) => Math.floor(Date.parse(`${f.slice(0, 10)}T00:00:00Z`) / 86_400_000)
  const libres = feed
    .filter(f => Number.isFinite(f.importe) && Number.isFinite(dia(f.fecha)))
    .map(f => ({ ...f, d: dia(f.fecha), usado: false }))
  const pares: Array<{ importadoId: string; feedId: string }> = []
  const orden = [...importados].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
  for (const m of orden) {
    const d = dia(m.fecha)
    if (!Number.isFinite(d) || !Number.isFinite(m.importe)) continue
    let mejor: (typeof libres)[number] | null = null
    for (const f of libres) {
      if (f.usado || Math.round(f.importe * 100) !== Math.round(m.importe * 100)) continue
      const dist = Math.abs(f.d - d)
      if (dist > toleranciaDias) continue
      if (!mejor || dist < Math.abs(mejor.d - d)) mejor = f
    }
    if (mejor) {
      mejor.usado = true
      pares.push({ importadoId: m.id, feedId: mejor.id })
    }
  }
  return pares
}
