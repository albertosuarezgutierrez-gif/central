import { lineasComision, type CuadroFila, type LineaComision, type ReciboComision } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

// Cuadro de comisiones pactado (`seguros.comision_pactada`) contra el % que la compañía ha aplicado en
// los recibos de CIMA de los últimos 24 meses. El cruce lo hace `lineasComision` (module-seguros).

/** Techo de recibos leídos; si se alcanza, la respuesta lo dice (`truncado`) en vez de dar el % por completo. */
const LIMITE_RECIBOS = 5000

export type ComisionesPactadas = {
  lineas: LineaComision[]
  truncado: boolean
  /** Recibos de CIMA cuya póliza no trae código de producto: no se pueden cruzar con ningún cuadro. */
  sinProducto: number
}

export async function comisionesPactadas(correduriaId: string, hoy: string): Promise<ComisionesPactadas> {
  const db = prismaAsegura()
  const [filas, recibos] = await Promise.all([
    db.$queryRaw<{
      companiaCodigo: string; producto: string; productoNombre: string | null; modalidad: string | null
      acuerdo: string; pctNueva: string; pctCartera: string; vigenteDesde: string; fuente: string
    }[]>`
      select compania_codigo_dgs as "companiaCodigo", producto, producto_nombre as "productoNombre", modalidad,
             acuerdo, pct_nueva::text as "pctNueva", pct_cartera::text as "pctCartera",
             to_char(vigente_desde, 'YYYY-MM-DD') as "vigenteDesde", fuente
      from seguros.comision_pactada`,
    // Solo recibos que ha traído CIMA (`eiac_xml_hash`): los del volcado histórico no son de este cuadro.
    db.$queryRaw<(Omit<ReciboComision, 'producto'> & { producto: string | null })[]>`
      select r.codigo_entidad_dgs as "companiaCodigo",
             p.datos_especificos -> 'producto' ->> 'ramoEntidad' as producto,
             p.datos_especificos -> 'producto' ->> 'descripcionRamo' as "productoNombre",
             to_char(r.fecha_efecto_actual, 'YYYY-MM-DD') as fecha,
             r.clase_recibo as clase, r.comision_bruta as comision, r.prima_neta as prima
      from seguros.poliza_recibos r
      join seguros.polizas p on p.id = r.poliza_id
      where r.correduria_id = ${correduriaId}::uuid
        and r.eiac_xml_hash is not null
        and r.codigo_entidad_dgs is not null
        and r.fecha_efecto_actual >= now() - interval '24 months'
      -- Los más recientes primero: si se alcanza el techo, lo que se cae es lo viejo, no lo emitido bajo el cuadro vigente.
      order by r.fecha_efecto_actual desc
      limit ${LIMITE_RECIBOS}`,
  ])

  const cuadro: CuadroFila[] = filas.map((f) => ({ ...f, pctNueva: Number(f.pctNueva), pctCartera: Number(f.pctCartera) }))
  const conProducto = recibos.filter((r): r is ReciboComision => typeof r.producto === 'string' && r.producto !== '' && r.fecha !== null)
  return {
    lineas: lineasComision(cuadro, conProducto, hoy),
    truncado: recibos.length >= LIMITE_RECIBOS,
    sinProducto: recibos.length - conProducto.length,
  }
}
