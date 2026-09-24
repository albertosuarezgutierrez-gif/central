// Calidad del dato de la cartera EN VIGOR (`sqlCarteraEnVigor`): las reglas y su texto viven en
// `@central/module-seguros` (calidad-dato.ts); aquí solo la consulta. Solo lectura: no toca nada.
//
// Viajan el NOMBRE del cliente, el número de póliza y la compañía (hacen falta para saber qué
// abrir). Nunca el DNI, un teléfono ni un correo: la regla dice que falta o que se repite, y para
// verlo está la ficha.

import { esReglaCalidad, sqlCarteraEnVigor, type IncidenciaCalidad } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

type Fila = {
  regla: string; cliente_id: string; cliente: string | null; poliza_id: string | null
  numero: string | null; compania: string | null; dato: string | null; relacionado_id: string | null
}

export async function calidadCartera(correduriaId: string): Promise<IncidenciaCalidad[]> {
  const vigor = Prisma.raw(sqlCarteraEnVigor('p'))
  const filas = await prismaAsegura().$queryRaw<Fila[]>`
    with v as (
      select p.* from polizas p
      where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null and ${vigor}),
    cl as (
      select distinct c.id, btrim(concat_ws(' ', c.nombre, c.apellidos)) as nombre, c.dni, c.dni_lookup_hash,
             c.fecha_nacimiento, c.tipo_persona
      from clientes c join v on v.cliente_id = c.id
      where c.merged_into_cliente_id is null)
    -- Activa para CIMA con el vencimiento ya pasado y sin renovación enlazada (ni hija ni sustituta).
    select 'vencida_sin_renovar' as regla, cl.id::text as cliente_id, cl.nombre as cliente, v.id::text as poliza_id,
           v.numero_poliza as numero, v.aseguradora as compania, v.fecha_vencimiento::date::text as dato, null::text as relacionado_id
    from v join cl on cl.id = v.cliente_id
    where v.fecha_vencimiento::date < (now() at time zone 'Europe/Madrid')::date
      and not exists (select 1 from polizas h where h.merged_into_poliza_id is null
                        and (h.poliza_padre_id = v.id or h.poliza_origen_id = v.id))
    union all
    select 'sin_prima', cl.id::text, cl.nombre, v.id::text, v.numero_poliza, v.aseguradora, null, null
    from v join cl on cl.id = v.cliente_id
    where coalesce(v.prima_anual, v.prima_bruta) is null or coalesce(v.prima_anual, v.prima_bruta) <= 0
    union all
    -- Mismo DNI (por su índice ciego) en otra ficha sin fusionar: una fila por cada pareja vista desde la viva.
    select 'dni_duplicado', cl.id::text, cl.nombre, null, null, null, null, o.id::text
    from cl join clientes o on o.correduria_id = ${correduriaId}::uuid and o.dni_lookup_hash = cl.dni_lookup_hash
      and o.id <> cl.id and o.merged_into_cliente_id is null
    -- Si las dos fichas son vivas, la pareja sale UNA vez, no una desde cada lado.
    where cl.dni_lookup_hash is not null and (cl.id < o.id or not exists (select 1 from cl c2 where c2.id = o.id))
    union all
    select 'sin_dni', cl.id::text, cl.nombre, null, null, null, null, null
    from cl
    where cl.dni_lookup_hash is null and nullif(btrim(coalesce(cl.dni, '')), '') is null
      and coalesce(cl.tipo_persona::text, '') <> 'juridica'
    union all
    select 'sin_nacimiento', cl.id::text, cl.nombre, null, null, null, null, null
    from cl
    where cl.fecha_nacimiento is null and coalesce(cl.tipo_persona::text, '') <> 'juridica'
    order by 1, 3 nulls last, 6 nulls last`
  return filas.filter((f) => esReglaCalidad(f.regla)).map((f) => ({
    regla: f.regla as IncidenciaCalidad['regla'],
    clienteId: f.cliente_id,
    cliente: f.cliente || null,
    polizaId: f.poliza_id,
    numeroPoliza: f.numero,
    compania: f.compania,
    dato: f.dato,
    relacionadoId: f.relacionado_id,
  }))
}
