/**
 * Prima y vencimiento «con recibos», para las lecturas que NO son la ficha.
 *
 * Allianz (medido 27/09/2026) no manda la prima en el EIAC de póliza
 * (`prima_anual`/`prima_bruta` = NULL) ni avanza `fecha_vencimiento` al
 * renovar: lo único que llega es el recibo anual (`clase_recibo` CA/NP) en
 * `poliza_recibos`. La regla vive en `@central/module-seguros`
 * (`primaConRecibos` / `vencimientoConRecibos`) y la ficha y la póliza ya la
 * usan. Aquí están las dos formas de aplicarla desde otras lecturas:
 *
 *  - `recibosVigenciaDe()`: UNA consulta por lote (nunca por póliza) que
 *    devuelve los recibos de anualidad listos para los helpers puros.
 *  - `sqlPrimaDeRecibo()` / `sqlVencimientoConRecibos()`: la MISMA regla en
 *    SQL, para las consultas crudas que agregan o filtran en la base. Si se
 *    toca el helper del módulo, hay que tocar esto igual.
 */
import type { ReciboVigencia } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

/** Los recibos de anualidad (CA/NP) de esas pólizas, agrupados por póliza. */
export async function recibosVigenciaDe(
  correduriaId: string,
  polizaIds: readonly string[],
): Promise<Map<string, ReciboVigencia[]>> {
  const porPoliza = new Map<string, ReciboVigencia[]>()
  if (polizaIds.length === 0) return porPoliza
  const filas = await prismaAsegura().polizaRecibo.findMany({
    where: { correduriaId, polizaId: { in: [...new Set(polizaIds)] }, claseRecibo: { in: ['CA', 'NP'] } },
    select: { polizaId: true, claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true },
  })
  for (const r of filas) {
    const lista = porPoliza.get(r.polizaId) ?? []
    lista.push({
      claseRecibo: r.claseRecibo ?? null,
      situacion: r.situacion === null ? null : String(r.situacion),
      primaTotal: r.primaTotal,
      fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString() : null,
    })
    porPoliza.set(r.polizaId, lista)
  }
  return porPoliza
}

/** Fin del periodo del recibo como fecha UTC (igual que `toISOString().slice(0, 10)`). */
const FIN_RECIBO = Prisma.raw(`(r.fecha_vencimiento at time zone 'UTC')::date`)

/**
 * La prima del recibo anual, en SQL — equivalente al segundo brazo de
 * `primaConRecibos`: solo con fraccionamiento `anual`; recibos CA/NP no
 * anulados, con fin de periodo y un importe positivo bien formado; el primero
 * que acaba hoy o después y, si todos quedaron atrás, el último.
 *
 * Devuelve `numeric` o NULL. NO mira la prima de la póliza: quien llama la
 * pone delante en un `coalesce` (con su `nullif(…, 0)`).
 *
 * `alias` es el alias de `polizas` en la consulta (constante del código, nunca
 * del usuario). `hoy` va parametrizado, `YYYY-MM-DD`.
 */
export function sqlPrimaDeRecibo(alias: string, hoy: string): Prisma.Sql {
  const p = Prisma.raw(alias)
  // Sin `\d`: dentro de un template etiquetado un escape desconocido deja la
  // cadena «cooked» en undefined. Y el cast va dentro del `case` porque
  // Postgres no garantiza el orden de evaluación de un `and`.
  return Prisma.sql`(case when ${p}.fraccionamiento::text = 'anual' then (
    select case when btrim(r.prima_total) ~ '^[0-9]+([.][0-9]{1,2})?$' then btrim(r.prima_total)::numeric end
    from poliza_recibos r
    where r.poliza_id = ${p}.id
      and r.correduria_id = ${p}.correduria_id
      and r.clase_recibo in ('CA', 'NP')
      and r.situacion::text is distinct from 'anulado'
      and r.fecha_vencimiento is not null
      and (case when btrim(r.prima_total) ~ '^[0-9]+([.][0-9]{1,2})?$' then btrim(r.prima_total)::numeric end) > 0
    order by (${FIN_RECIBO} >= ${hoy}::date) desc,
             case when ${FIN_RECIBO} >= ${hoy}::date then ${FIN_RECIBO} end asc,
             ${FIN_RECIBO} desc
    limit 1
  ) end)`
}

/**
 * El vencimiento real, en SQL — equivalente a `vencimientoConRecibos`: si el
 * de la póliza ya pasó y hay un recibo CA/NP COBRADO que acaba después, vence
 * donde acaba el último de ellos. Un pendiente o devuelto no prueba la
 * renovación. Devuelve `date` (o NULL si la póliza no tiene fecha).
 */
export function sqlVencimientoConRecibos(alias: string, hoy: string): Prisma.Sql {
  const p = Prisma.raw(alias)
  return Prisma.sql`(case when ${p}.fecha_vencimiento < ${hoy}::date then coalesce((
    select max(${FIN_RECIBO})
    from poliza_recibos r
    where r.poliza_id = ${p}.id
      and r.correduria_id = ${p}.correduria_id
      and r.clase_recibo in ('CA', 'NP')
      and r.situacion::text = 'cobrado'
      and ${FIN_RECIBO} > ${p}.fecha_vencimiento
  ), ${p}.fecha_vencimiento) else ${p}.fecha_vencimiento end)`
}
