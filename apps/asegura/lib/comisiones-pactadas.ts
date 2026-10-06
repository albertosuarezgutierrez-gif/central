import { esCodigoProducto, lineasComision, type CuadroFila, type LineaComision, type ReciboComision } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

// Cuadro de comisiones pactado contra el % que la compañía ha aplicado en los recibos de CIMA de los
// últimos 24 meses. El cruce lo hace `lineasComision` (module-seguros).
//
// 🔁 Desde el 06/10/2026 (fase 2 de acuerdos con compañías) el cuadro se lee de las tablas de ACUERDOS
// (`acuerdo_comisiones` + `acuerdos_compania`), no de `comision_pactada`: una sola fuente para lo firmado,
// directo o de asociación. `comision_pactada` queda sin lector y se retira aparte. Lo que esa tabla no
// podía tener y aquí sí existe se filtra ANTES del cruce, porque `CuadroFila` exige un cuadro completo:
//   · una línea con un % que no consta (NULL) no entra — no se compara contra un 0 inventado;
//   · una línea cuyo `producto` es un nombre comercial y no un código de CIMA (`esCodigoProducto`) no
//     entra — nunca casaría con un recibo y solo añadiría filas «sin recibos»;
//   · un acuerdo ya vencido (`vigencia_hasta` pasada) no entra.
// Todas siguen en la ficha de la compañía; aquí solo se cuentan (`lineasSinCruce`).
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md §6 (F2).

/** Techo de recibos leídos; si se alcanza, la respuesta lo dice (`truncado`) en vez de dar el % por completo. */
const LIMITE_RECIBOS = 5000

export type ComisionesPactadas = {
  lineas: LineaComision[]
  truncado: boolean
  /** Recibos de CIMA cuya póliza no trae código de producto: no se pueden cruzar con ningún cuadro. */
  sinProducto: number
  /** Líneas de acuerdo que no entran en el cruce: % que no consta o producto sin código de CIMA. */
  lineasSinCruce: number
}

export async function comisionesPactadas(correduriaId: string, hoy: string): Promise<ComisionesPactadas> {
  const db = prismaAsegura()
  const [filas, recibos] = await Promise.all([
    db.$queryRaw<{
      companiaCodigo: string; producto: string | null; productoNombre: string | null; modalidad: string | null
      acuerdo: string; pctNueva: string | null; pctCartera: string | null; vigenteDesde: string; fuente: string
    }[]>`
      select a.compania_codigo_dgs as "companiaCodigo", l.producto, l.ramo_texto as "productoNombre", l.modalidad,
             case a.fuente when 'directo' then 'directo' when 'apromes' then 'APROMES'
                           else coalesce(a.fuente_nombre, a.fuente) end as acuerdo,
             l.pct_np::text as "pctNueva", l.pct_cartera::text as "pctCartera",
             to_char(a.vigencia_desde, 'YYYY-MM-DD') as "vigenteDesde", a.documento_fuente as fuente
      from acuerdo_comisiones l
      join acuerdos_compania a on a.id = l.acuerdo_id
      where a.correduria_id = ${correduriaId}::uuid
        and (a.vigencia_hasta is null or a.vigencia_hasta >= ${hoy}::date)`,
    // Solo recibos que ha traído CIMA (`eiac_xml_hash`): los del volcado histórico no son de este cuadro.
    db.$queryRaw<(Omit<ReciboComision, 'producto'> & { producto: string | null })[]>`
      select r.codigo_entidad_dgs as "companiaCodigo",
             p.datos_especificos -> 'producto' ->> 'ramoEntidad' as producto,
             p.datos_especificos -> 'producto' ->> 'descripcionRamo' as "productoNombre",
             to_char(r.fecha_efecto_actual, 'YYYY-MM-DD') as fecha,
             r.clase_recibo as clase, r.comision_bruta as comision, r.prima_neta as prima
      from poliza_recibos r
      join polizas p on p.id = r.poliza_id
      where r.correduria_id = ${correduriaId}::uuid
        and r.eiac_xml_hash is not null
        and r.codigo_entidad_dgs is not null
        and r.fecha_efecto_actual >= now() - interval '24 months'
      -- Los más recientes primero: si se alcanza el techo, lo que se cae es lo viejo, no lo emitido bajo el cuadro vigente.
      order by r.fecha_efecto_actual desc
      limit ${LIMITE_RECIBOS}`,
  ])

  const cruzables = filas.filter((f) => esCodigoProducto(f.producto) && f.pctNueva !== null && f.pctCartera !== null)
  const cuadro: CuadroFila[] = cruzables.map((f) => ({
    ...f, producto: f.producto as string, pctNueva: Number(f.pctNueva), pctCartera: Number(f.pctCartera),
  }))
  const conProducto = recibos.filter((r): r is ReciboComision => typeof r.producto === 'string' && r.producto !== '' && r.fecha !== null)
  return {
    lineas: lineasComision(cuadro, conProducto, hoy),
    truncado: recibos.length >= LIMITE_RECIBOS,
    sinProducto: recibos.length - conProducto.length,
    lineasSinCruce: filas.length - cruzables.length,
  }
}
