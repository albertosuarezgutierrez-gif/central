// Libro registro de pólizas intermediadas: una fila por póliza de la cartera viva que estuvo en vigor
// en algún momento del año (efecto ≤ 31/12 y vencimiento ≥ 1/1, o sin vencimiento). Solo lectura.
//
// Lleva el nombre del tomador (el puerto ya lo sirve en otras pantallas) y NO su DNI: el documento no
// cruza el puerto. Una prima 0 guardada no es una prima (`nullif`): sale vacía, «no consta».

import { sqlCarteraViva } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

export type FilaLibro = {
  numeroPoliza: string | null
  compania: string | null
  ramo: string | null
  tomador: string | null
  efecto: string | null
  vencimiento: string | null
  estado: string | null
  /** `null` = no consta (NULL o 0 guardado). */
  prima: number | null
}

export async function libroRegistro(correduriaId: string, año: number): Promise<{ estado: 'ok'; año: number; filas: FilaLibro[] }> {
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const filas = await prismaAsegura().$queryRaw<FilaLibro[]>`
    select p.numero_poliza as "numeroPoliza",
           coalesce(cd.nombre_comun, cd.nombre_cima, p.codigo_entidad_dgs, p.aseguradora) as compania,
           p.tipo::text as ramo,
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as tomador,
           to_char(p.fecha_efecto_inicial, 'YYYY-MM-DD') as efecto,
           to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento,
           p.estado::text as estado,
           nullif(coalesce(p.prima_bruta, p.prima_anual), 0)::float as prima
    from polizas p
    left join clientes c on c.id = p.cliente_id
    left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null and ${viva}
      and (p.fecha_efecto_inicial is null or p.fecha_efecto_inicial <= make_date(${año}::int, 12, 31))
      and (p.fecha_vencimiento is null or p.fecha_vencimiento >= make_date(${año}::int, 1, 1))
    order by compania nulls last, p.numero_poliza`
  return { estado: 'ok', año, filas }
}
