// Panel de conversión de Patrimonio (27/10/2026) — lado de BD del puerto `GET /api/operador/patrimonio-conversion`.
// Contrato: cabecera de `apps/plataforma/lib/correduria/patrimonio-conversion.ts`. Agregación pura: `patrimonio-conversion-reglas.ts`.
//
// SOLO LECTURA. Todo filtrado por la correduría (con BYPASSRLS el aislamiento es del código). Sin PII: no se lee NIF, IBAN,
// teléfono ni dirección; solo id, nombre visible de la ficha y cifras.
// Las lecturas que dependen de SQL aún sin aplicar (`inmueble_padre_id`, `volcado`) y las de pólizas/recibos fallan AISLADAS:
// el campo sale `null` («no se sabe») y el resto sigue. Las facturas y los titulares son la base: si fallan, error del puerto.
// Las tablas `portal_patrimonio_*` no están en `prisma/asegura.prisma` (las modela el portal): SQL crudo parametrizado.
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { registrarErrorCartera } from './error-cartera'
import {
  armarTitulares, desdeRecibos,
  type FilaInmuebles, type FilaLecturas, type FilaPoliza, type FilaRecibo, type FilaTitular, type Parte, type TitularPuerto,
} from './patrimonio-conversion-reglas'

export type RespuestaConversion =
  | { estado: 'ok'; titulares: TitularPuerto[] }
  | { estado: 'sin_configurar' }
  | { estado: 'sin_correduria' }

/** Una lectura que puede fallar sin tumbar el resto: el fallo se registra (sin URL) y la parte queda en «no se sabe». */
async function aislada<T>(origen: string, leer: () => Promise<T>): Promise<Parte<T>> {
  try {
    return { ok: true, valor: await leer() }
  } catch (e) {
    registrarErrorCartera(`operador/patrimonio-conversion:${origen}`, e)
    return { ok: false }
  }
}

export async function leerPatrimonioConversion(desdeMes: Date, ahora: Date = new Date()): Promise<RespuestaConversion> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  const correduria = await correduriaUnica()
  if (!correduria) return { estado: 'sin_correduria' }
  const db = prismaAsegura()
  const cid = correduria.id

  const titulares = (await db.$queryRaw<{ titular_id: string; cliente_id: string; nombre: string | null; creado_en: Date }[]>(Prisma.sql`
    select t.id::text as titular_id, t.cliente_id::text as cliente_id,
           trim(c.nombre || ' ' || coalesce(c.apellidos, '')) as nombre, t.creado_en
    from portal_patrimonio_titular t
    join clientes c on c.id = t.cliente_id and c.correduria_id = t.correduria_id
    where t.correduria_id = ${cid}::uuid and t.archivado_en is null
    order by t.creado_en, t.id`))
    .map((t): FilaTitular => ({ titularId: t.titular_id, clienteId: t.cliente_id, nombre: t.nombre, activoDesde: t.creado_en }))
  if (titulares.length === 0) return { estado: 'ok', titulares: [] }
  const tids = titulares.map((t) => t.titularId)
  const cids = titulares.map((t) => t.clienteId)

  // Facturas leídas con IA (`origen='factura'`), como las cuenta el cupo del portal (`volcado-tx.ts`): base, no aislada.
  const facturas = (await db.$queryRaw<{ titular_id: string; total: number; mes: number }[]>(Prisma.sql`
    select titular_id::text as titular_id, count(*)::int as total, (count(*) filter (where creado_en >= ${desdeMes}))::int as mes
    from portal_patrimonio_gasto
    where origen = 'factura' and titular_id = any(${tids}::uuid[])
    group by titular_id`)).map((f): FilaLecturas => ({ titularId: f.titular_id, total: f.total, mes: f.mes }))

  const inmuebles = await aislada('inmuebles', async () => {
    try {
      const filas = await db.$queryRaw<{ titular_id: string; sueltos: number; unidades: number }[]>(Prisma.sql`
        select titular_id::text as titular_id,
               (count(*) filter (where inmueble_padre_id is null))::int as sueltos,
               (count(*) filter (where inmueble_padre_id is not null))::int as unidades
        from portal_patrimonio_inmueble
        where archivado_en is null and titular_id = any(${tids}::uuid[])
        group by titular_id`)
      return { conUnidades: true, filas: filas.map((f): FilaInmuebles => ({ titularId: f.titular_id, sueltos: f.sueltos, unidades: f.unidades })) }
    } catch (e) {
      // Sin la columna `inmueble_padre_id` (SQL del edificio sin aplicar) no puede haber unidades: todas las filas son sueltas.
      registrarErrorCartera('operador/patrimonio-conversion:inmueble_padre_id', e)
      const filas = await db.$queryRaw<{ titular_id: string; sueltos: number }[]>(Prisma.sql`
        select titular_id::text as titular_id, count(*)::int as sueltos
        from portal_patrimonio_inmueble
        where archivado_en is null and titular_id = any(${tids}::uuid[])
        group by titular_id`)
      return { conUnidades: false, filas: filas.map((f): FilaInmuebles => ({ titularId: f.titular_id, sueltos: f.sueltos, unidades: 0 })) }
    }
  })

  const volcados = await aislada('volcados', async () =>
    (await db.$queryRaw<{ titular_id: string; total: number; mes: number }[]>(Prisma.sql`
      select titular_id::text as titular_id, count(*)::int as total, (count(*) filter (where creado_en >= ${desdeMes}))::int as mes
      from portal_patrimonio_importacion
      where volcado = true and titular_id = any(${tids}::uuid[])
      group by titular_id`)).map((f): FilaLecturas => ({ titularId: f.titular_id, total: f.total, mes: f.mes })))

  const polizas = await aislada('polizas', async () =>
    (await db.$queryRaw<{
      cliente_id: string; import_ref: string | null; eiac_xml_hash: string | null; estado: string | null
      sustituida_at: Date | null; merged_into_poliza_id: string | null; created_at: Date | null
    }[]>(Prisma.sql`
      select p.cliente_id::text as cliente_id, p.import_ref, p.eiac_xml_hash, p.estado::text as estado, p.sustituida_at,
             p.merged_into_poliza_id::text as merged_into_poliza_id, p.created_at
      from polizas p
      where p.correduria_id = ${cid}::uuid and p.cliente_id = any(${cids}::uuid[])`))
      .map((p): FilaPoliza => ({
        clienteId: p.cliente_id, importRef: p.import_ref, eiacXmlHash: p.eiac_xml_hash, estado: p.estado,
        sustituidaAt: p.sustituida_at, mergedIntoPolizaId: p.merged_into_poliza_id, creadaEn: p.created_at,
      })))

  // Recibos de ~12 meses (fecha = emisión ?? efecto actual) + los sin fecha (plataforma los cuenta como ilegibles).
  const desde = desdeRecibos(ahora)
  const recibos = await aislada('recibos', async () =>
    (await db.$queryRaw<{ cliente_id: string; fecha: Date | null; comision_bruta: string | null }[]>(Prisma.sql`
      select p.cliente_id::text as cliente_id, coalesce(r.fecha_emision, r.fecha_efecto_actual) as fecha, r.comision_bruta
      from poliza_recibos r
      join polizas p on p.id = r.poliza_id and p.correduria_id = r.correduria_id
      where r.correduria_id = ${cid}::uuid and p.cliente_id = any(${cids}::uuid[])
        and (coalesce(r.fecha_emision, r.fecha_efecto_actual) is null or coalesce(r.fecha_emision, r.fecha_efecto_actual) >= ${desde})`))
      .map((r): FilaRecibo => ({ clienteId: r.cliente_id, fecha: r.fecha, comisionBruta: r.comision_bruta })))

  return { estado: 'ok', titulares: armarTitulares({ titulares, inmuebles, facturas, volcados, polizas, recibos }, ahora) }
}
