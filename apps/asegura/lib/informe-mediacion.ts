// Informe anual de mediación (base de la documentación estadístico-contable a la DGSFP). Solo
// lectura. La suma vive en `@central/module-seguros` (informe-mediacion.ts); aquí, las consultas.
//
// Tres bloques: primas del año por compañía y ramo (recibos de CIMA de la cartera viva), pólizas en
// vigor HOY por compañía y ramo (la cartera a 31/12 de un año pasado no se puede reconstruir: se
// dice), y el informe del SAC del año. Sin un solo dato personal.

import { informeMediacion, sqlCarteraEnVigor, sqlCarteraViva, type InformeMediacion, type InformeSac, type ReciboInforme } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { informeQuejas } from './quejas'

export type CarteraEnVigor = { compania: string | null; ramo: string | null; polizas: number }

export type ResultadoInforme = {
  estado: 'ok'
  primas: InformeMediacion
  /** Nombre común de cada código DGS que aparece. Un código sin nombre se pinta tal cual. */
  companias: Record<string, string>
  /** Foto de HOY, no a 31/12 del año pedido. */
  carteraHoy: CarteraEnVigor[]
  quejas: InformeSac
}

export async function informeMediacionAnual(correduriaId: string, año: number): Promise<ResultadoInforme> {
  const db = prismaAsegura()
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const vigor = Prisma.raw(sqlCarteraEnVigor('p'))
  const [recibos, cartera, nombres, quejas] = await Promise.all([
    db.$queryRaw<ReciboInforme[]>`
      select coalesce(r.codigo_entidad_dgs, p.codigo_entidad_dgs) as compania, p.tipo::text as ramo,
             r.situacion::text as situacion, r.clase_recibo as clase, r.prima_total as prima,
             to_char(coalesce(r.fecha_efecto_actual, r.fecha_efecto_inicial) at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto
      from poliza_recibos r join polizas p on p.id = r.poliza_id
      where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null and ${viva}
        and (coalesce(r.fecha_efecto_actual, r.fecha_efecto_inicial) is null
             or extract(year from coalesce(r.fecha_efecto_actual, r.fecha_efecto_inicial) at time zone 'Europe/Madrid') = ${año}::int)`,
    db.$queryRaw<CarteraEnVigor[]>`
      select p.codigo_entidad_dgs as compania, p.tipo::text as ramo, count(*)::int as polizas
      from polizas p
      where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null and ${vigor}
      group by 1, 2 order by 1, 2`,
    db.$queryRaw<{ codigo: string; nombre: string }[]>`
      select codigo_dgs as codigo, coalesce(nombre_comun, nombre_cima, codigo_dgs) as nombre from companias_dgs`,
    informeQuejas(correduriaId, año),
  ])
  return {
    estado: 'ok',
    primas: informeMediacion(recibos, año),
    companias: Object.fromEntries(nombres.map((n) => [n.codigo, n.nombre])),
    carteraHoy: cartera,
    quejas,
  }
}
