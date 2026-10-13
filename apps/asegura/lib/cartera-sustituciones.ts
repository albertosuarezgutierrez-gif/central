// Seguimiento de sustituciones por retarificación (cambio de compañía).
//
// Cuando se emite una póliza que sustituye a otra (ver `lib/emision.ts`), la
// vieja se marca `sustituida_at` y la nueva guarda `poliza_origen_id`. Esto
// NO se da por hecho: hasta que CIMA confirme la nueva (`id_poliza_entidad`),
// no hay prueba de que el cliente la esté pagando de verdad. Esta lista es el
// «pendiente de comprobar», para que el seguimiento no dependa de acordarse
// de abrir la ficha — Alberto, 20/09/2026: «hay que hacerle seguimiento a que
// el cliente la pague y eso lo confirma CIMA».
//
// Entran mientras la nueva no tenga ficha CIMA O la vieja siga en vigor en CIMA (13/10/2026).
// Solo entran las que llevan sustituidas ≥3 días: CIMA tarda en traer la
// confirmación (no es instantáneo) y meter aquí lo de esta misma mañana solo
// añadiría ruido a una lista que se supone que hay que trabajar.

import { POLIZA_ESTADOS_VIGENTES, avisoDobleSeguro } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

const DIAS_GRACIA = 3

export type SustitucionSeguimiento = {
  clienteId: string
  cliente: string
  diasSustituida: number
  sustituidaAt: string
  polizaVieja: { id: string; aseguradora: string; numeroPoliza: string | null }
  polizaNueva: { id: string; aseguradora: string; numeroPoliza: string | null } | null
  /** La nueva ya tiene ficha CIMA (`id_poliza_entidad`). `null` = no hay nueva enlazada (no se sabe). */
  nuevaConfirmadaCima: boolean | null
  /** CIMA ya trajo algún RECIBO COBRADO de la nueva (`poliza_recibos.origen = 'cima'` y `situacion = 'cobrado'`). `null` = no hay nueva enlazada. */
  nuevaReciboCima: boolean | null
  /** La vieja sigue EN VIGOR para CIMA: estado vigente + `id_poliza_entidad` + sin baja CIMA. `null` = estado ilegible. */
  viejaEnVigorCima: boolean | null
}

/** `null` = no se pudo leer (no es «no hay ninguna pendiente»). */
export async function sustitucionesEnSeguimiento(correduriaId: string): Promise<SustitucionSeguimiento[] | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<
      {
        cliente_id: string
        cliente: string
        sustituida_at: Date
        dias: number
        vieja_id: string
        vieja_aseguradora: string
        vieja_numero: string | null
        nueva_id: string | null
        nueva_aseguradora: string | null
        nueva_numero: string | null
        nueva_confirmada: boolean | null
        nueva_recibo_cima: boolean | null
        vieja_en_vigor_cima: boolean | null
      }[]
    >`
      select
        c.id::text as cliente_id, (c.nombre || ' ' || c.apellidos) as cliente,
        v.sustituida_at, extract(day from now() - v.sustituida_at)::int as dias,
        v.id::text as vieja_id, v.aseguradora as vieja_aseguradora, v.numero_poliza as vieja_numero,
        n.id::text as nueva_id, n.aseguradora as nueva_aseguradora, n.numero_poliza as nueva_numero,
        case when n.id is null then null else (n.id_poliza_entidad is not null) end as nueva_confirmada,
        case when n.id is null then null else exists (
          select 1 from poliza_recibos r
          where r.poliza_id = n.id and r.origen::text = 'cima' and r.situacion::text = 'cobrado') end as nueva_recibo_cima,
        case when v.estado is null then null
             else (v.estado::text = any(${[...POLIZA_ESTADOS_VIGENTES]}::text[])
                   and v.id_poliza_entidad is not null
                   and v.baja_cima_at is null and v.baja_estado_cima is null) end as vieja_en_vigor_cima
      from polizas v
      join clientes c on c.id = v.cliente_id
      left join polizas n on n.poliza_origen_id = v.id
      where v.correduria_id = ${correduriaId}::uuid
        and v.sustituida_at is not null
        and v.sustituida_at <= now() - make_interval(days => ${DIAS_GRACIA}::int)
        -- Entra mientras la nueva no tenga ficha CIMA O la vieja siga en vigor en CIMA (posible doble seguro).
        and (n.id is null or n.id_poliza_entidad is null
             or (v.estado::text = any(${[...POLIZA_ESTADOS_VIGENTES]}::text[])
                 and v.id_poliza_entidad is not null
                 and v.baja_cima_at is null and v.baja_estado_cima is null))
      order by v.sustituida_at asc
      limit 200`
    return filas.map((f) => ({
      clienteId: f.cliente_id,
      cliente: f.cliente,
      diasSustituida: f.dias,
      sustituidaAt: f.sustituida_at.toISOString().slice(0, 10),
      polizaVieja: { id: f.vieja_id, aseguradora: f.vieja_aseguradora, numeroPoliza: f.vieja_numero },
      polizaNueva: f.nueva_id
        ? { id: f.nueva_id, aseguradora: f.nueva_aseguradora ?? '', numeroPoliza: f.nueva_numero }
        : null,
      nuevaConfirmadaCima: f.nueva_confirmada,
      nuevaReciboCima: f.nueva_recibo_cima,
      viejaEnVigorCima: f.vieja_en_vigor_cima,
    }))
  } catch {
    return null
  }
}

// ── «Póliza sustituida que sigue viva» → posible doble seguro (03/10/2026) ──────────────────────
// La regla es PURA y vive en `@central/module-seguros` (`avisoDobleSeguro`); aquí solo se leen las
// parejas vieja → nueva ya registradas (`poliza_origen_id`). Incluye las nuevas YA confirmadas por CIMA:
// la confirmación no anula la vieja. Sin datos personales en el resultado (solo ids, nº de póliza, compañía).

export type DobleSeguroAviso = {
  polizaViejaId: string
  polizaNuevaId: string
  motivos: Array<'vencimiento_posterior' | 'recibo_posterior'>
  texto: string
}

/** `null` = no se pudo leer (no es «no hay ninguno»). */
export async function dobleSeguroEnSeguimiento(correduriaId: string): Promise<DobleSeguroAviso[] | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<
      {
        vieja_id: string; nueva_id: string; aseguradora: string; numero: string | null; estado: string
        vence: string | null; efecto_recibo: string | null; efecto_nueva: string | null; estado_nueva: string
      }[]
    >`
      select distinct on (v.id) v.id::text as vieja_id, n.id::text as nueva_id, v.aseguradora, v.numero_poliza as numero, v.estado::text as estado,
             to_char(v.fecha_vencimiento::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as vence,
             to_char((select max(r.fecha_efecto_actual) from poliza_recibos r
                      where r.poliza_id = v.id and coalesce(r.situacion::text, '') not in ('anulado', 'devuelto')) at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto_recibo,
             to_char(coalesce(n.fecha_efecto_inicial, n.fecha_inicio)::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto_nueva,
             n.estado::text as estado_nueva
      from polizas v
      join polizas n on n.poliza_origen_id = v.id
      where v.correduria_id = ${correduriaId}::uuid and v.sustituida_at is not null
      -- Con 2 nuevas, una sola fila por vieja: la vigente primero, y entre ellas la más reciente.
      order by v.id, (n.estado::text = any(${[...POLIZA_ESTADOS_VIGENTES]}::text[])) desc, coalesce(n.fecha_efecto_inicial, n.fecha_inicio) desc nulls last
      limit 500`
    const out: DobleSeguroAviso[] = []
    for (const f of filas) {
      const a = avisoDobleSeguro(
        { aseguradora: f.aseguradora, numeroPoliza: f.numero, estado: f.estado, fechaVencimiento: f.vence, fechaEfectoUltimoRecibo: f.efecto_recibo },
        { fechaEfecto: f.efecto_nueva, estado: f.estado_nueva },
      )
      if (a) out.push({ polizaViejaId: f.vieja_id, polizaNuevaId: f.nueva_id, motivos: a.motivos, texto: a.texto })
    }
    return out
  } catch {
    return null
  }
}
