// El gasto de IA de los RESÚMENES AUTOMÁTICOS de estudio en las últimas 24 h (lo cuenta `decidirIaAuto`). Sale de
// `presupuesto-rpa.ts` (21/10/2026) porque el presupuesto de Avant2 también redacta su resumen y comparte el MISMO
// tope: `presupuesto.ts` no puede importar `presupuesto-rpa.ts` (este importa a aquél).
// Cuenta los eventos `preparado` (y `ia_resumen`: IA pagada cuyo presupuesto no se creó, o la de rehacer el estudio
// al ocultar una opción) con `detalle.iaAuto = 'intentada'` de esta correduría. Un fallo devuelve NaN y
// `decidirIaAuto` dice que NO (fail-closed): sin poder contar no se gasta.

import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'

export async function gastoIaAuto(correduriaId: string): Promise<{ llamadas24h: number; eur24h: number }> {
  try {
    const [g] = await prismaAsegura().$queryRaw<{ n: number; eur: number }[]>`
      select count(*)::int as n, coalesce(sum(coalesce((e.detalle->>'eurEstimados')::numeric, 0)), 0)::float8 as eur
      from presupuesto_evento e join presupuesto p on p.id = e.presupuesto_id
      where p.correduria_id = ${correduriaId}::uuid and e.tipo in ('preparado', 'ia_resumen')
        and e.detalle->>'iaAuto' = 'intentada' and e.ocurrido_at >= now() - interval '24 hours'`
    return { llamadas24h: g?.n ?? Number.NaN, eur24h: g?.eur ?? Number.NaN }
  } catch (e) {
    registrarErrorCartera('presupuesto/tope-ia', e)
    return { llamadas24h: Number.NaN, eur24h: Number.NaN }
  }
}
