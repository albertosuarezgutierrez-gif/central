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

import {
  POLIZA_ESTADOS_VIGENTES, avisoDobleSeguro, solapeViejaNueva, textoAnulacionConfirmada, viejaPendienteDeAnular,
  type AnulacionConfirmadaEntrada, type AvisoViejaSustituida, type CierreViejaSustituida,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { hayAnulacionConfirmada } from './esquema-bd'

const DIAS_GRACIA = 3

/**
 * «La compañía ya confirmó la anulación de la vieja» (17/10/2026): sellado por el corredor
 * (`anulacion_confirmada_at`, si el SQL está aplicado) o expediente de anulación `confirmada`.
 * Sin el SQL solo cuenta el expediente: la consulta no se rompe por una columna que aún no existe.
 */
function sqlAnulacionConfirmada(conColumna: boolean): Prisma.Sql {
  const expediente = Prisma.sql`exists (select 1 from anulacion a
    where a.poliza_id = v.id and a.correduria_id = v.correduria_id and a.estado = 'confirmada')`
  return conColumna ? Prisma.sql`(v.anulacion_confirmada_at is not null or ${expediente})` : expediente
}

/** Efecto (`YYYY-MM-DD`) del recibo más tardío de la vieja que no está anulado ni devuelto (lo que lee `avisoDobleSeguro`). */
const SQL_EFECTO_ULTIMO_RECIBO = Prisma.sql`to_char((select max(r.fecha_efecto_actual) from poliza_recibos r
  where r.poliza_id = v.id and coalesce(r.situacion::text, '') not in ('anulado', 'devuelto')) at time zone 'Europe/Madrid', 'YYYY-MM-DD')`

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
  /**
   * ¿Sigue pendiente confirmar la anulación de la vieja? `viejaPendienteDeAnular()`: `false` solo si CIMA ya no
   * la da en vigor o la compañía confirmó la anulación (la FECHA nunca cierra: la vieja renovaría tácitamente).
   * `null` = no se sabe. Es lo que decide el ⚠️ del digest; `viejaEnVigorCima` queda como dato crudo.
   */
  viejaPendienteAnular: boolean | null
  /** Por qué ya no está pendiente aunque CIMA la siga dando en vigor. `null` = no aplica. */
  viejaCierre: CierreViejaSustituida | null
  /** Si está pendiente: `doble_seguro` (la vieja cubre después del efecto de la nueva) o `no_renovacion` (vence a más tardar ese día). */
  viejaAviso: AvisoViejaSustituida | null
  /** Vencimiento de la vieja (`YYYY-MM-DD`), para decir hasta cuándo hay que confirmar que no renueva. `null` = no consta. */
  viejaVence: string | null
}

/** `null` = no se pudo leer (no es «no hay ninguna pendiente»). */
export async function sustitucionesEnSeguimiento(correduriaId: string): Promise<SustitucionSeguimiento[] | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const conColumna = await hayAnulacionConfirmada()
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
        anulacion_confirmada: boolean
        vence: string | null
        efecto_recibo: string | null
        efecto_nueva: string | null
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
                   and v.baja_cima_at is null and v.baja_estado_cima is null) end as vieja_en_vigor_cima,
        ${sqlAnulacionConfirmada(conColumna)} as anulacion_confirmada,
        to_char(v.fecha_vencimiento::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as vence,
        ${SQL_EFECTO_ULTIMO_RECIBO} as efecto_recibo,
        to_char(coalesce(n.fecha_efecto_inicial, n.fecha_inicio)::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto_nueva
      from polizas v
      join clientes c on c.id = v.cliente_id
      left join polizas n on n.poliza_origen_id = v.id
      where v.correduria_id = ${correduriaId}::uuid
        and v.sustituida_at is not null
        and v.sustituida_at <= now() - make_interval(days => ${DIAS_GRACIA}::int)
        -- Entra mientras la nueva no tenga ficha CIMA O la vieja siga en vigor en CIMA (posible doble seguro).
        -- Esa segunda rama se AFINA abajo con viejaPendienteDeAnular (solo la cierra la anulación confirmada; la fecha NO).
        and (n.id is null or n.id_poliza_entidad is null
             or (v.estado::text = any(${[...POLIZA_ESTADOS_VIGENTES]}::text[])
                 and v.id_poliza_entidad is not null
                 and v.baja_cima_at is null and v.baja_estado_cima is null))
      order by v.sustituida_at asc
      limit 200`
    return filas.flatMap((f): SustitucionSeguimiento[] => {
      const v = viejaPendienteDeAnular({
        enVigorCima: f.vieja_en_vigor_cima,
        anulacionConfirmada: f.anulacion_confirmada === true,
        // Tolerancia 0: vence a más tardar el día que empieza la nueva → «confirma que no renueva», no doble seguro.
        solape: f.nueva_id ? solapeViejaNueva({ fechaVencimiento: f.vence, fechaEfectoUltimoRecibo: f.efecto_recibo }, f.efecto_nueva, 0).solape : null,
      })
      // Sin nueva enlazada o sin su ficha CIMA sigue entrando («falta la ficha»): eso no lo cierra la vieja.
      const faltaNueva = f.nueva_id === null || f.nueva_confirmada !== true
      if (!faltaNueva && v.pendiente === false) return []
      return [{
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
      viejaPendienteAnular: v.pendiente,
      viejaCierre: v.cierre,
      viejaAviso: v.aviso,
      viejaVence: f.vence,
      }]
    })
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
    const conColumna = await hayAnulacionConfirmada()
    const filas = await db.$queryRaw<
      {
        vieja_id: string; nueva_id: string; aseguradora: string; numero: string | null; estado: string
        vence: string | null; efecto_recibo: string | null; efecto_nueva: string | null; estado_nueva: string
      }[]
    >`
      select distinct on (v.id) v.id::text as vieja_id, n.id::text as nueva_id, v.aseguradora, v.numero_poliza as numero, v.estado::text as estado,
             to_char(v.fecha_vencimiento::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as vence,
             ${SQL_EFECTO_ULTIMO_RECIBO} as efecto_recibo,
             to_char(coalesce(n.fecha_efecto_inicial, n.fecha_inicio)::timestamptz at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto_nueva,
             n.estado::text as estado_nueva
      from polizas v
      join polizas n on n.poliza_origen_id = v.id
      where v.correduria_id = ${correduriaId}::uuid and v.sustituida_at is not null
        -- La compañía ya confirmó la anulación (sello del corredor o expediente): no hay nada que pedirle.
        and not ${sqlAnulacionConfirmada(conColumna)}
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

// ── «Anulación confirmada por la compañía» (17/10/2026) ──────────────────────────────────────────
// La compañía confirmó la baja de la vieja por su cauce antes que CIMA. Se SELLA en la vieja (columnas propias,
// SQL 2026-10-17) con el motivo obligatorio y, si se sabe, el efecto. 🚨 NO toca `estado` (lo manda CIMA) ni
// `baja_verificada_*` («el cliente se va»: cancelaría ya la póliza y activaría su trigger). Solo vale sobre una
// póliza SUSTITUIDA: es el cierre del seguimiento, no una baja general.

export type ResultadoAnulacionConfirmada =
  | { estado: 'ok'; polizaViejaId: string }
  | { estado: 'no_encontrada' | 'no_sustituida' | 'ya_confirmada' | 'sin_migracion'; motivo: string }

export async function confirmarAnulacionCompania(
  correduriaId: string, e: AnulacionConfirmadaEntrada, actor: string,
): Promise<ResultadoAnulacionConfirmada> {
  if (!(await hayAnulacionConfirmada())) {
    return { estado: 'sin_migracion', motivo: 'Falta aplicar el SQL 2026-10-17_poliza_anulacion_confirmada: no se ha sellado nada.' }
  }
  const quien = actor.slice(0, 120)
  return prismaAsegura().$transaction(async (tx) => {
    const [p] = await tx.$queryRaw<{ clienteId: string; numero: string | null; compania: string | null; sustituida: boolean; sellada: boolean }[]>`
      select cliente_id::text as "clienteId", numero_poliza as numero, aseguradora as compania,
             sustituida_at is not null as sustituida, anulacion_confirmada_at is not null as sellada
      from polizas
      where id = ${e.polizaViejaId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_poliza_id is null
      for update`
    if (!p) return { estado: 'no_encontrada' as const, motivo: 'Esa póliza no es de esta correduría.' }
    if (!p.sustituida) return { estado: 'no_sustituida' as const, motivo: 'Solo se sella sobre la póliza VIEJA de una sustitución.' }
    if (p.sellada) return { estado: 'ya_confirmada' as const, motivo: 'Ya consta la anulación confirmada por la compañía.' }
    await tx.$executeRaw`
      update polizas set anulacion_confirmada_at = now(), anulacion_confirmada_por = ${quien},
             anulacion_confirmada_motivo = ${e.motivo}, anulacion_efecto = ${e.fechaEfectoBaja}::date
      where id = ${e.polizaViejaId}::uuid and correduria_id = ${correduriaId}::uuid`
    anotarCambio({ entidad: 'poliza', id: e.polizaViejaId, campo: 'anulacion_confirmada', antes: null, despues: e.fechaEfectoBaja })
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.clienteId}::uuid, ${e.polizaViejaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${textoAnulacionConfirmada({ numeroPoliza: p.numero, compania: p.compania, motivo: e.motivo, fechaEfectoBaja: e.fechaEfectoBaja, actor: quien })})`
    return { estado: 'ok' as const, polizaViejaId: e.polizaViejaId }
  })
}
