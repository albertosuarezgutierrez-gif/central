// Tope de gasto en EUROS de Avant2: la parte que toca la BD. La decisión vive en `tope-euros.ts`
// (pura y probada); aquí solo se lee el gasto del mes y se anotan los eventos.
//
// Lo llaman los DOS embudos que gastan, antes de su reserva: `cotizar()` (POST /insurances) y
// `conLibroDeEmision()` (ReRate, Submit, recomendación de capital de hogar).
//
// Telegram NO sale de aquí: asegura no tiene canal propio. Los eventos `aviso`/`bloqueo` quedan
// en `seguros.codeoscopic_tope_evento` con `notificado_at` a NULL, y plataforma los recoge por el
// puerto (`/api/operador/codeoscopic/tope`, cron `correduria-tope-avant2` cada 5 min), los manda
// y los marca. El botón vuelve por el mismo puerto (`accion: 'ampliar'`).
//
// 🔒 Aislamiento: todo filtra por correduría (`lib/tenant`), como el libro.

import { prisma } from '../tenant.ts'
import { gastadoMesCents } from './consumo.ts'
import { costeEmisionCents } from './gasto-emision.ts'
import {
  AMPLIACION_CENTS,
  AVISO_CENTS,
  decidirTopeEuros,
  mesClave,
  topeDelMes,
  validarAmpliacion,
  type GastoMes,
} from './tope-euros.ts'

type Env = Record<string, string | undefined>

/**
 * Lo gastado este mes natural (Madrid) y lo ampliado. NO atrapa errores: quien llama decide, y
 * la decisión correcta ante un fallo es no llamar al vendor.
 *
 * Las líneas de ReRate/Submit/límites escritas cuando su coste por defecto era 0 («sin
 * confirmar») se cuentan al coste vigente de su operación (`greatest`): la regla de Alberto es
 * que valen 0,50 € mientras nadie confirme otra cosa. Solo SUBE una línea, nunca la abarata.
 */
export async function leerGastoMes(correduriaId: string, env: Env = process.env): Promise<GastoMes> {
  const rerate = costeEmisionCents('rerate', env)
  const submit = costeEmisionCents('submit', env)
  const limites = costeEmisionCents('limites_hogar', env)
  const gastadoCents = await gastadoMesCents(correduriaId, { rerate, submit, limites })
  const filas = await prisma.$queryRaw<{ ampliado: bigint }[]>`
    select
      (select coalesce(sum(e.importe_cents), 0)
         from seguros.codeoscopic_tope_evento e
        where e.correduria_id = ${correduriaId}::uuid
          and e.tipo = 'ampliacion'
          and e.mes = date_trunc('month', now() at time zone 'Europe/Madrid')::date)::bigint as ampliado
  `
  const f = filas[0]
  // Sin fila no hay cifra: eso es «no se sabe», no 0 €.
  return { gastadoCents, ampliadoCents: f ? Number(f.ampliado) : null }
}

export type ComprobacionTope = { ok: true } | { ok: false; razon: 'sin-libro' | 'tope'; mensaje: string }

/**
 * La guarda de los dos embudos. Fail-closed: si no se puede leer el gasto, NO se llama.
 * Anotar el aviso o el bloqueo es best-effort: si falla, la decisión no cambia (un bloqueo sigue
 * bloqueando) y el mensaje lo dice.
 */
export async function comprobarTopeEuros(
  correduriaId: string,
  costeCents: number,
  env: Env = process.env,
): Promise<ComprobacionTope> {
  let gasto: GastoMes
  try {
    gasto = await leerGastoMes(correduriaId, env)
  } catch (e) {
    return {
      ok: false,
      razon: 'sin-libro',
      mensaje:
        'No se llama a la compañía: no se puede leer lo gastado este mes en Avant2, y sin esa cifra el ' +
        `tope en euros no existe (${e instanceof Error ? e.message : String(e)}).`,
    }
  }
  const d = decidirTopeEuros(gasto, costeCents)
  if (!d.permitido) {
    if (d.motivo === 'desconocido') return { ok: false, razon: 'sin-libro', mensaje: d.explicacion }
    const anotado = await anotarEvento(correduriaId, 'bloqueo', d.topeCents, d.gastadoCents)
    return {
      ok: false,
      razon: 'tope',
      mensaje: anotado
        ? d.explicacion
        : `${d.explicacion} ⚠️ No se pudo anotar el bloqueo, así que el aviso con el botón puede no llegar.`,
    }
  }
  if (d.cruzaAviso) await anotarEvento(correduriaId, 'aviso', AVISO_CENTS, d.gastadoCents + Math.max(0, costeCents))
  return { ok: true }
}

/** Inserta un evento una sola vez por (correduría, mes, tipo, nivel). `false` si no se pudo escribir. */
async function anotarEvento(
  correduriaId: string,
  tipo: 'aviso' | 'bloqueo',
  nivelCents: number,
  gastadoCents: number,
): Promise<boolean> {
  try {
    await prisma.$executeRaw`
      insert into seguros.codeoscopic_tope_evento (correduria_id, mes, tipo, nivel_cents, gastado_cents)
      values (${correduriaId}::uuid, date_trunc('month', now() at time zone 'Europe/Madrid')::date,
              ${tipo}, ${nivelCents}, ${gastadoCents})
      on conflict (correduria_id, mes, tipo, nivel_cents) do nothing`
    return true
  } catch (e) {
    console.error('[tope-euros] no se pudo anotar el evento', tipo, e instanceof Error ? e.message : e)
    return false
  }
}

export type EventoPendiente = { id: string; tipo: 'aviso' | 'bloqueo'; nivelCents: number; gastadoCents: number; mes: string }

/**
 * Lo que plataforma tiene que mandar por Telegram: avisos y bloqueos del mes EN CURSO sin
 * notificar. Un bloqueo cuyo nivel ya se amplió no se manda (llegaría un botón que no hace nada).
 */
export async function eventosPendientes(correduriaId: string): Promise<EventoPendiente[]> {
  const filas = await prisma.$queryRaw<{ id: bigint; tipo: 'aviso' | 'bloqueo'; nivel_cents: number; gastado_cents: number | null; mes: string }[]>`
    select e.id, e.tipo, e.nivel_cents, e.gastado_cents, to_char(e.mes, 'YYYY-MM') as mes
      from seguros.codeoscopic_tope_evento e
     where e.correduria_id = ${correduriaId}::uuid
       and e.tipo in ('aviso', 'bloqueo')
       and e.notificado_at is null
       and e.mes = date_trunc('month', now() at time zone 'Europe/Madrid')::date
       and not (e.tipo = 'bloqueo' and exists (
             select 1 from seguros.codeoscopic_tope_evento a
              where a.correduria_id = e.correduria_id and a.mes = e.mes
                and a.tipo = 'ampliacion' and a.nivel_cents = e.nivel_cents))
     order by e.id`
  return filas.map((f) => ({
    id: String(f.id),
    tipo: f.tipo,
    nivelCents: Number(f.nivel_cents),
    gastadoCents: Number(f.gastado_cents ?? f.nivel_cents),
    mes: f.mes,
  }))
}

export async function marcarNotificados(correduriaId: string, ids: string[]): Promise<number> {
  const limpios = ids.filter((i) => /^\d{1,18}$/.test(i))
  if (limpios.length === 0) return 0
  return prisma.$executeRaw`
    update seguros.codeoscopic_tope_evento set notificado_at = now()
     where correduria_id = ${correduriaId}::uuid
       and id = any(${limpios}::bigint[])
       and notificado_at is null`
}

export type ResultadoAmpliar =
  | { estado: 'ampliado'; topeCents: number }
  | { estado: 'ya_estaba'; topeCents: number }
  | { estado: 'rechazado'; motivo: string }

/**
 * +30 € para el mes en curso, desde el nivel en el que se bloqueó. Idempotente: la clave única
 * (correduría, mes, 'ampliacion', nivel) hace que el mismo botón pulsado dos veces sume una sola.
 */
export async function ampliarTope(
  correduriaId: string,
  pedida: { mes: string; nivelCents: number },
  autor: { autorizadoPor: string; callbackId: string | null },
): Promise<ResultadoAmpliar> {
  const mesActual = mesClave(new Date())
  const [b] = await prisma.$queryRaw<{ hay: boolean }[]>`
    select exists (
      select 1 from seguros.codeoscopic_tope_evento
       where correduria_id = ${correduriaId}::uuid and tipo = 'bloqueo' and nivel_cents = ${pedida.nivelCents}
         and mes = to_date(${pedida.mes}, 'YYYY-MM')) as hay`
  const v = validarAmpliacion(pedida, { mesActual, bloqueoEnEseNivel: !!b?.hay })
  if (!v.ok) return { estado: 'rechazado', motivo: v.motivo }
  const n = await prisma.$executeRaw`
    insert into seguros.codeoscopic_tope_evento
      (correduria_id, mes, tipo, nivel_cents, importe_cents, autorizado_por, telegram_callback_id, notificado_at)
    values (${correduriaId}::uuid, to_date(${pedida.mes}, 'YYYY-MM'), 'ampliacion', ${pedida.nivelCents},
            ${AMPLIACION_CENTS}, ${autor.autorizadoPor.slice(0, 200)}, ${autor.callbackId}, now())
    on conflict (correduria_id, mes, tipo, nivel_cents) do nothing`
  const gasto = await leerGastoMes(correduriaId)
  const topeCents = topeDelMes(gasto.ampliadoCents ?? 0)
  return n > 0 ? { estado: 'ampliado', topeCents } : { estado: 'ya_estaba', topeCents }
}
