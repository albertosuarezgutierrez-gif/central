// PRUEBA NOCTURNA DE HUMO del tarificador RPA — la parte con BD y Telegram (15/10/2026). Reglas puras en
// `tarificador-humo-reglas.ts`. Dos pasadas por cron (hora de Madrid):
//   · 03:15 `encolarHumo`: un trabajo `modo = 'humo'` por cada COMPAÑÍA con integración ACTIVA y `rpa_autorizada` (la primera pareja, orden
//     estable: un solo login por credencial y noche), sin las compañías con alguna pareja pausada (credenciales rechazadas / fallos seguidos). Riesgo vacío, sin cliente. NO pasa por `encolarTrabajo`
//     (nada de deduplicación de trabajos reales). Lo lanza el barrido de la cola (cada 5 min) con las máquinas de siempre.
//   · 04:15 `informarHumo`: lee lo de la noche y, SOLO si alguna compañía ha fallado, manda UN aviso por Telegram a Alberto con
//     la lista y el motivo corto. Todo bien → no avisa. Cierra como fallo lo que siguiera `pendiente` (nadie lo lanzó).
//
// 🚨 Fail-closed: sin `TARIFICADOR_HUMO_ACTIVO=1`, sin `TARIFICADOR_RPA_ACTIVO=1` o sin el SQL
//    `prisma/sql/2026-10-15d_tarificador_humo.sql` (el CHECK de `modo` no admite `humo`), no se encola nada.
// 🚨 TARIFICAR ≠ EMITIR: el humo solo hace login y llega a la pantalla de inicio (worker: src/humo.ts). No envía nada a ningún cliente.

import { tgSend } from '@central/core-telegram'
import { prisma } from './tenant'
import { pausaViva } from './tarificador-robustez'
import { rpaActivo } from './tarificador-reglas'
import {
  ESTADOS_HUMO_VIVOS,
  MODO_HUMO,
  ORIGEN_HUMO,
  RIESGO_HUMO,
  VENTANA_INFORME_HUMO_HORAS,
  humoActivo,
  motivoNadaProbado,
  parejasParaHumo,
  resumirHumo,
  textoAvisoHumo,
  textoNadaProbado,
  type FilaHumo,
  type OmitidaHumo,
  type ParejaActiva,
  type ParejaHumo,
  type ResumenHumo,
} from './tarificador-humo-reglas'

/** ¿Admite la BD el modo `humo`? (el CHECK `tarificacion_trabajos_modo_valido` lo nombra). Sin el SQL → false: no se encola. */
export async function hayHumo(): Promise<boolean> {
  const f = await prisma.$queryRaw<{ ok: boolean }[]>`
    select exists (
      select 1 from pg_constraint
      where conrelid = 'seguros.tarificacion_trabajos'::regclass and conname = 'tarificacion_trabajos_modo_valido'
        and pg_get_constraintdef(oid) like '%humo%') as ok`
  return f[0]?.ok === true
}

export type ResumenEncolarHumo = {
  estado: 'omitido' | 'ok'
  omitido?: 'humo_apagado' | 'rpa_apagado' | 'sin_esquema_humo'
  encolados?: ParejaHumo[]
  omitidas?: OmitidaHumo[]
}

export async function encolarHumo(correduriaId: string, env: Record<string, string | undefined> = process.env): Promise<ResumenEncolarHumo> {
  if (!humoActivo(env)) return { estado: 'omitido', omitido: 'humo_apagado' }
  if (!rpaActivo(env)) return { estado: 'omitido', omitido: 'rpa_apagado' }
  if (!(await hayHumo())) return { estado: 'omitido', omitido: 'sin_esquema_humo' }

  // Las parejas que el negocio tiene encendidas: activas y autorizadas para el RPA (la misma puerta que `encolarTrabajo`).
  const activas = await prisma.$queryRaw<{ compania: string; ramo: string }[]>`
    select compania, ramo from seguros.companias_integracion
    where correduria_id = ${correduriaId}::uuid and activo and modo = 'rpa_autorizada'
    order by compania, ramo`
  const vivos = await prisma.$queryRaw<{ compania: string }[]>`
    select distinct compania from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and to_jsonb(t)->>'modo' = ${MODO_HUMO} and t.estado = any(${[...ESTADOS_HUMO_VIVOS]}::text[])`
  const hayVivo = new Set(vivos.map((v) => v.compania))
  const parejas: ParejaActiva[] = []
  for (const a of activas) {
    // PAUSA por credenciales o fallos seguidos (la misma de `encolarTrabajo`): esa pareja no se lanza.
    const pausada = await pausaViva(prisma, correduriaId, a.compania, a.ramo)
    parejas.push({ compania: a.compania, ramo: a.ramo, pausada, humoVivo: hayVivo.has(a.compania) })
  }
  const { lanzar, omitidas } = parejasParaHumo(parejas)

  const encolados: ParejaHumo[] = []
  for (const p of lanzar) {
    try {
      // Riesgo VACÍO, sin cliente/póliza/oportunidad. El `not exists` + el índice único parcial del SQL impiden apilar dos vivos.
      const n = await prisma.$executeRaw`
        insert into seguros.tarificacion_trabajos (correduria_id, compania, ramo, modo, riesgo, solicitado_por)
        select ${correduriaId}::uuid, ${p.compania}, ${p.ramo}, ${MODO_HUMO}, ${JSON.stringify(RIESGO_HUMO)}::jsonb, ${ORIGEN_HUMO}
        where not exists (
          select 1 from seguros.tarificacion_trabajos x
          where x.correduria_id = ${correduriaId}::uuid and x.compania = ${p.compania}
            and to_jsonb(x)->>'modo' = ${MODO_HUMO} and x.estado = any(${[...ESTADOS_HUMO_VIVOS]}::text[]))`
      if (n > 0) encolados.push(p)
    } catch (e) {
      console.error('[tarificador-humo] no se pudo encolar', p.compania, p.ramo, e instanceof Error ? e.message.slice(0, 200) : e)
    }
  }
  return { estado: 'ok', encolados, omitidas }
}

export type ResumenInformeHumo = {
  estado: 'omitido' | 'ok' | 'ya_informado' | 'telegram_no_enviado'
  omitido?: 'humo_apagado'
  total?: number
  ok?: number
  fallan?: number
  sinBot?: number
  avisado?: boolean
  /** Humos que seguían `pendiente` y se cerraron como fallo (nadie los lanzó). */
  cerrados?: number
  /** Si no se probó nada: por qué. */
  nadaProbado?: string
}

type FilaBd = { compania: string; ramo: string; estado: string; tipo: string | null; mensaje: string | null; con_bot: unknown }

/** Lo que sale por Telegram: inyectable para los tests; en producción, `tgSend` (devuelve el id del mensaje o `null`). */
export type EnviarTelegram = (texto: string) => Promise<number | null>

const conBotValido = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null)

/**
 * Informe de la noche. Cierra como fallo los humos aún `pendiente`, lee los de las últimas `VENTANA_INFORME_HUMO_HORAS` y manda UN
 * aviso si: falla alguna compañía, hay integraciones activas sin bot en la imagen, o NO SE PROBÓ NINGUNA (el silencio no vale como
 * «todo bien»). Todo bien → nada. Con el interruptor apagado no lee ni avisa. IDEMPOTENTE: el día (de Madrid) se marca en
 * `tarificador_humo_informes` ANTES de enviar; si el cron se repite no sale un segundo Telegram (si el envío falla, se desmarca).
 */
export async function informarHumo(correduriaId: string, env: Record<string, string | undefined> = process.env, enviar: EnviarTelegram = (t) => tgSend(t)): Promise<ResumenInformeHumo> {
  if (!humoActivo(env)) return { estado: 'omitido', omitido: 'humo_apagado' }
  const esquemaHumo = await hayHumo()
  const rpa = rpaActivo(env)

  let resumen: ResumenHumo = { total: 0, ok: 0, fallos: [], sinBot: [], omitidos: 0 }
  let cerrados = 0
  let filasN = 0
  let companiasActivas = 0
  let companiasPausadas = 0
  if (esquemaHumo) {
    cerrados = await prisma.$executeRaw`
      update seguros.tarificacion_trabajos t
      set estado = 'cancelado', terminado_at = now(), updated_at = now(),
          error = jsonb_build_object('tipo', 'infra', 'mensaje', 'no se lanzó la máquina de la prueba esta noche')
      where t.correduria_id = ${correduriaId}::uuid and to_jsonb(t)->>'modo' = ${MODO_HUMO} and t.estado = 'pendiente'
        and t.created_at < now() - interval '30 minutes' and t.created_at > now() - make_interval(hours => ${VENTANA_INFORME_HUMO_HORAS}::int)`
    const filas = await prisma.$queryRaw<FilaBd[]>`
      select t.compania, t.ramo, t.estado, t.error->>'tipo' as tipo, t.error->>'mensaje' as mensaje, t.error->'humo'->'conBot' as con_bot
      from seguros.tarificacion_trabajos t
      where t.correduria_id = ${correduriaId}::uuid and to_jsonb(t)->>'modo' = ${MODO_HUMO}
        and t.created_at > now() - make_interval(hours => ${VENTANA_INFORME_HUMO_HORAS}::int)
      order by t.created_at desc`
    const activas = await prisma.$queryRaw<{ compania: string; ramo: string }[]>`
      select compania, ramo from seguros.companias_integracion
      where correduria_id = ${correduriaId}::uuid and activo and modo = 'rpa_autorizada' order by compania, ramo`
    filasN = filas.length
    const companias = [...new Set(activas.map((a) => a.compania))]
    companiasActivas = companias.length
    for (const c of companias) {
      let pausada = false
      for (const a of activas.filter((x) => x.compania === c)) pausada = pausada || (await pausaViva(prisma, correduriaId, a.compania, a.ramo))
      if (pausada) companiasPausadas++
    }
    resumen = resumirHumo(filas.map((f): FilaHumo => ({ compania: f.compania, ramo: f.ramo, estado: f.estado, tipoError: f.tipo, mensaje: f.mensaje, conBot: conBotValido(f.con_bot) })), activas)
  }

  const base = { total: resumen.total, ok: resumen.ok, fallan: resumen.fallos.length, sinBot: resumen.sinBot.length, cerrados }
  let texto: string | null
  let nadaProbado: string | undefined
  if (resumen.total === 0) {
    nadaProbado = motivoNadaProbado({ rpaActivo: rpa, esquemaHumo, companiasActivas, companiasPausadas, filas: filasN, omitidos: resumen.omitidos })
    texto = textoNadaProbado(nadaProbado, resumen)
  } else {
    texto = textoAvisoHumo(resumen)
  }
  if (!texto) return { estado: 'ok', ...base, avisado: false }

  // IDEMPOTENCIA: el día de Madrid se marca antes de enviar. Sin el SQL no hay dónde marcar (solo el aviso de «falta el SQL»).
  let marcado = false
  if (esquemaHumo) {
    const n = await prisma.$executeRaw`
      insert into seguros.tarificador_humo_informes (correduria_id, dia)
      values (${correduriaId}::uuid, (now() at time zone 'Europe/Madrid')::date)
      on conflict (correduria_id, dia) do nothing`
    if (n === 0) return { estado: 'ya_informado', ...base, avisado: false, ...(nadaProbado ? { nadaProbado } : {}) }
    marcado = true
  }
  const id = await enviar(texto).catch(() => null)
  if (id === null && marcado) {
    // No salió: se desmarca para que el siguiente intento del cron lo reenvíe.
    await prisma.$executeRaw`
      delete from seguros.tarificador_humo_informes
      where correduria_id = ${correduriaId}::uuid and dia = (now() at time zone 'Europe/Madrid')::date`
  }
  return { estado: id === null ? 'telegram_no_enviado' : 'ok', ...base, avisado: id !== null, ...(nadaProbado ? { nadaProbado } : {}) }
}
