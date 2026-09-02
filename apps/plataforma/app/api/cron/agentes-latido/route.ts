import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram'
import { evaluarLatido, AGENTES_VIGILADOS } from '@/lib/monitoring/latidos'
import { purgarBitacora } from '@/lib/telegram/preferencias'

// 💓 Latidos de agentes (cron diario 07:45 UTC ≈ 09:45 CEST). Comprueba que cada agente vigilado
// sigue dejando su huella en BD y avisa por Telegram los que llevan demasiado sin latir. Es el mismo
// concepto que el watchdog de trading, generalizado a la flota. Auth Bearer CRON_SECRET.
// Lógica pura + registro en lib/monitoring/latidos.ts (testeado).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// SQL de la huella por agente (parametrizado con Prisma.sql, nunca interpolación de strings).
// Cada probe devuelve una fila { ultimo: timestamp | null } = el último latido del agente.
const PROBES: Record<string, Prisma.Sql> = {
  // Renovaciones de la correduría. La huella es la de la PASADA, no la tabla de avisos:
  // `correduria_avisos_renovacion` solo crece cuando alguna póliza cruza un hito, así que un día
  // tranquilo y un cron muerto darían exactamente la misma señal.
  correduria_renovaciones: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'correduria_renovaciones'`,
  // Ingesta de CIMA. La huella NO puede ser `cima_ficheros` ni ninguna tabla de datos: si la
  // ingesta se atasca, esas tablas dejan de crecer y el silencio se lee igual que un día sin
  // ficheros. Es la pasada del vigía lo que se vigila.
  correduria_ingesta: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'correduria_ingesta'`,
  // Pricing: manda el piso MÁS VIEJO, no el max global. Con max(), un solo piso fresco
  // (p.ej. luxury) tapaba que el Dúplex y House Sevillana llevaban 23 días sin estudiar
  // (555 h) → el monitor se callaba. La sonda por-piso (min de los max) delata al rezagado.
  //
  // 🚨 La huella dejó de ser `market_rates` (08/08/2026). Cuando se eligió, `scenario = 'prop_*'`
  // solo lo escribía la Rutina semanal; hoy escriben ahí DOS procesos DIARIOS más —el barrido
  // Serper de las 03:00 (`mercado/sweep`) y la rutina de Booking— así que la sonda salía verde
  // aunque la Rutina llevara semanas sin correr. Es EXACTAMENTE la avería que esta sonda nació
  // para cazar (21/07/2026: 16 días parada sin que saltara nada), reaparecida porque el espacio
  // de nombres `prop_*` se volvió compartido y `market_rates.fuente` no distingue a la Rutina
  // (escribe `booking_mcp`, igual que el conector diario).
  //
  // `pricing_decisiones` sí es suya en exclusiva: solo la escribe `pricing/aplicar-propuesta`, que
  // solo se llama desde la Rutina (ver `lib/rutas-rutina.ts`; el cron diario `apply-auto` escribe
  // en `pricing_applied`, otra tabla). Y sigue siendo por-piso: la Rutina decide sobre los 4 en
  // cada ciclo (verificado 08/08/2026), así que un piso rezagado sigue delatando media pasada.
  pricing: Prisma.sql`
    SELECT min(ultimo) AS ultimo FROM (
      SELECT p.piso, max(d.ciclo_at) AS ultimo
      FROM (VALUES ('prop_house_sevillana'), ('prop_busto_reform'),
                   ('prop_luxury_busto'), ('prop_duplex_center')) AS p(piso)
      LEFT JOIN pricing_decisiones d ON d.property_id = p.piso
      GROUP BY p.piso
    ) t`,
  // El vigía de trading: se mide sobre su ÚLTIMA PASADA BUENA, igual que los demás latidos. Trae
  // `ultimo_at` y `detalle` para poder decir si no se dispara o si se dispara y no termina.
  trading_watchdog: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'trading_watchdog'`,
  correo_triaje: Prisma.sql`SELECT max(updated_at) AS ultimo FROM correo_cursor`,
  // ialimp: `last_sync_at` es la columna que el sync escribe DE VERDAD en cada
  // pasada (la del panel, `ultimo_sync`, está a NULL desde siempre — nadie la
  // rellena). Solo cuentan las conexiones activas: una desactivada a mano no es
  // una avería.
  ialimp_pms: Prisma.sql`SELECT max(last_sync_at) AS ultimo FROM pms_connections WHERE activa = true`,
  // Facturas: la frescura se mide sobre la ÚLTIMA PASADA BUENA, no sobre la
  // última ejecución — así un cron que corre y falla siempre también salta.
  // Se traen además `ultimo_at` y `detalle` para poder decir CUÁL de las dos
  // averías es (no se dispara / se dispara y no termina): ver `evaluarLatido`.
  facturas_gmail: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'facturas_gmail'`,
  reservas_booking_vigia: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'reservas_booking_vigia'`,
  // Eventos: NO se puede vigilar `pricing_eventos_auto.updated_at` — esa tabla solo crece cuando
  // aparece un evento NUEVO, así que una semana sin conciertos anunciados sería indistinguible de
  // los dos crons muertos (que es como estuvieron junio y julio de 2026 sin que nadie lo viera).
  // La huella es la de la PASADA: el cron la escribe corra o no corra el descubrimiento.
  sivra_eventos: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_eventos'`,
  // El verificador de previstos escribe su latido desde el 12/08/2026 (eventos/verificar), pero
  // se declaró vigilado sin darle sonda → salía en «Sin poder comprobar» en cada parte.
  sivra_eventos_verificar: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_eventos_verificar'`,
  // El calendario fijo escribe su latido desde el 27/08/2026. Va vigilado desde el mismo PR que
  // lo declara: un cron que repone lo que YA se sabe puede morirse sin que se note, porque la
  // tabla de eventos sigue llenándose por las otras fuentes.
  sivra_eventos_calendario: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_eventos_calendario'`,
  // Canal: la huella es la de la PASADA de calibrado, no `pricing_settings.updated_at` — esa
  // columna solo se mueve cuando hay algo que corregir, así que un canal ya alineado y un cron
  // muerto darían la misma señal (que es como el ×1,20 supuesto sobrevivió sin que saltara nada).
  sivra_canal: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_canal'`,
  // Subastas/mercado: la huella es la de la PASADA que llega a avisar. NO vale
  // mirar `mercado_comparables` (solo crece si el portal manda alertas nuevas)
  // ni `chollo_avisado_at` (cada anuncio avisa UNA vez en su vida): con esas dos
  // huellas, un cron muerto y un día tranquilo son idénticos — que es justo como
  // pasó desapercibido el 504 del 06/08/2026.
  subastas_mercado: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'subastas_mercado'`,
  // Mercado por fecha: lo escribe una RUTINA de Claude (no un cron) por POST /api/internal/latido.
  // Misma huella y misma lectura que los crons — el vigía no distingue quién late, solo si late.
  sivra_mercado_booking: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_mercado_booking'`,
  ses_transporte: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'ses_transporte'`,
  // Motor de precios. La huella NO puede ser `max(applied_at) FROM pricing_applied`: esa tabla
  // solo crece cuando alguna noche cruza el umbral del 3%, así que una pasada tranquila y un cron
  // muerto darían la MISMA señal — que es exactamente la ambigüedad que hubo que deshacer a mano el
  // 22/08/2026. La huella es la de la PASADA: `apply-auto` la escribe corra lo que corra, y además
  // deja marca de INTENTO al arrancar para distinguir «no se dispara» de «no termina».
  sivra_pricing_apply: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_pricing_apply'`,
  sivra_extras_impago: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_extras_impago'`,
  // Mensajes programados a huéspedes: deja marca de INTENTO al arrancar (mismo patrón que
  // pricing_apply) para distinguir «no se dispara» de «se dispara y no termina».
  sivra_domotica_acceso: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_domotica_acceso'`,
  sivra_mensajes_prog: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_mensajes_prog'`,
  sivra_pricing_guard: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_pricing_guard'`,
  paper_tracker: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'paper-tracker'`,
  // La huella NO es `trading_operaciones_sync`: esa tabla solo se escribe cuando el empujón LLEGA,
  // así que una pasada que no pudo leer IBKR no dejaría rastro y su silencio se leería como «no
  // hubo operaciones». El latido lo manda la pasada por /api/internal/latido pase lo que pase.
  trading_operaciones: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'trading_operaciones'`,
  // Los jobs de la cadena de pricing que estaban sin latido (hallazgo 🟡 6, 24/08/2026): snapshot
  // de Smoobu, resumen del día, pilot-track y cierre de experimentos. Todos con huella de PASADA en
  // agente_latidos — sus tablas de trabajo solo crecen cuando hay algo que hacer, así que un día
  // tranquilo y un cron muerto serían la misma señal. (El 5º, `sivra_mercado_cron`, se retiró horas
  // después junto con toda la vía Serper — ver `lib/cron-dispatch.ts`.)
  sivra_rates_snapshot: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_rates_snapshot'`,
  // Foto diaria de la previsión por piso (30/08/2026). Va vigilada desde el mismo PR que la
  // declara (regla del PR #1447): su tabla solo la escribe este cron, así que sin latido un cron
  // muerto y «hoy no había nada nuevo» serían la misma señal.
  sivra_prevision: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_prevision'`,
  sivra_resumen_diario: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_resumen_diario'`,
  sivra_pilot_track: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_pilot_track'`,
  sivra_experimentos: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_experimentos'`,
  // Rutinas de Claude Code que dejan latido por /api/internal/latido (02/09/2026). La huella es la
  // PASADA, con `ultimo_at` para distinguir «no se dispara» de «arranca y no termina».
  psd2_health_check: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'psd2_health_check'`,
  facturas_correo: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'facturas_correo'`,
  fiscal_novedades: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'fiscal_novedades'`,
  rrhh_compliance: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'rrhh_compliance'`,
  github_vigia: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'github_vigia'`,
}

/**
 * Persiste el veredicto de UN agente en `agente_salud` para que lo pueda leer una pantalla.
 *
 * Hasta el 02/09/2026 esto no existía: el vigía evaluaba los 27 agentes y TIRABA el resultado
 * (JSON de respuesta + Telegram). Con 8 rutinas sin ALERTA_TOKEN, ese trabajo desaparecía sin
 * dejar rastro consultable, y /operador/agentes pintaba ⚪ «sin telemetría» sobre 23 agentes
 * cuyo estado real se estaba calculando cada mañana y se perdía.
 *
 * Nunca lanza: un fallo al guardar el parte no puede tumbar al vigía que lo produce.
 * `horas` va como NULL —no como 0— cuando no hay señal: son cosas distintas.
 */
async function guardarSalud(
  ag: { id: string; etiqueta: string; maxHoras: number; nota: string },
  evaluadoAt: Date,
  alerta: boolean,
  horas: number | null,
  motivo: string,
  sondaError: string | null,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO agente_salud (agente, evaluado_at, alerta, horas, motivo, max_horas, etiqueta, nota, sonda_error)
      VALUES (${ag.id}, ${evaluadoAt}, ${alerta}, ${horas}, ${motivo}, ${ag.maxHoras}, ${ag.etiqueta}, ${ag.nota}, ${sondaError})
      ON CONFLICT (agente) DO UPDATE SET
        evaluado_at = EXCLUDED.evaluado_at, alerta = EXCLUDED.alerta, horas = EXCLUDED.horas,
        motivo = EXCLUDED.motivo, max_horas = EXCLUDED.max_horas, etiqueta = EXCLUDED.etiqueta,
        nota = EXCLUDED.nota, sonda_error = EXCLUDED.sonda_error`
  } catch (e) {
    console.error('[agentes-latido] no se pudo persistir la salud de', ag.id, e)
  }
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ahora = new Date()
  const resultados: Array<Record<string, unknown>> = []
  const alertas: string[] = []
  const sondasRotas: string[] = []

  for (const ag of AGENTES_VIGILADOS) {
    const probe = PROBES[ag.id]
    if (!probe) {
      // Un agente declarado en AGENTES_VIGILADOS sin sonda NO se salta en silencio: eso sería un
      // vigilante que no vigila y que además nadie echa de menos. Va al bloque de «sin poder
      // comprobar», que el Telegram muestra aparte de las alertas.
      sondasRotas.push(`${ag.etiqueta}: declarado como vigilado pero sin sonda en PROBES`)
      continue
    }
    try {
      const rows = await prisma.$queryRaw<
        Array<{ ultimo: Date | null; ultimo_intento?: Date | null; detalle?: string | null }>
      >(probe)
      const ultimo = rows[0]?.ultimo ?? null
      const ultimoIntento = rows[0]?.ultimo_intento ?? null
      const ev = evaluarLatido({ ahora, ultimo, maxHoras: ag.maxHoras, ultimoIntento, detalle: rows[0]?.detalle ?? null })
      resultados.push({
        id: ag.id,
        ...ev,
        ultimo: ultimo?.toISOString() ?? null,
        ultimoIntento: ultimoIntento?.toISOString() ?? null,
      })
      if (ev.alerta) alertas.push(`• <b>${ag.etiqueta}</b>: ${ev.motivo}.\n  ${ag.nota}`)
      await guardarSalud(ag, ahora, ev.alerta, ev.horas, ev.motivo, null)
    } catch (e) {
      // 🚨 Una sonda rota NO es un agente sano. Antes se tragaba en silencio
      // "para no dar falsas alarmas", pero eso convierte un vigía averiado en un
      // parte de buena salud: si la tabla desaparece o cambia de nombre, el
      // agente deja de estar vigilado y nadie se entera. Se avisa aparte y con
      // otro tono: «no se ha podido comprobar», que no es «está bien».
      const msg = String((e as Error)?.message ?? e)
      resultados.push({ id: ag.id, error: msg })
      sondasRotas.push(`• <b>${ag.etiqueta}</b>: no se ha podido comprobar (${msg.slice(0, 120)}).`)
      // Una sonda rota se PERSISTE como tal: si no, la pantalla se quedaría con el veredicto
      // bueno de ayer y leería «no se ha podido comprobar» como «sigue estando bien».
      await guardarSalud(ag, ahora, true, null, 'no se ha podido comprobar: la sonda falló', msg.slice(0, 400))
    }
  }

  // El PMS de ialimp marca `last_sync_at` aunque la pasada haya dado errores, así
  // que la frescura sola no lo cubre: una conexión que sincroniza puntual pero
  // falla en cada intento pasaría por sana.
  const conErrores = await prisma
    .$queryRaw<Array<{ cliente_nombre: string; sync_error: string }>>(
      Prisma.sql`SELECT cliente_nombre, sync_error FROM pms_connections WHERE activa = true AND sync_error IS NOT NULL`,
    )
    .catch(() => null)
  if (conErrores == null) {
    sondasRotas.push('• <b>🧹 Errores de sincronización de ialimp</b>: no se ha podido comprobar.')
  } else {
    for (const c of conErrores) {
      alertas.push(
        `• <b>🧹 PMS de ialimp — ${c.cliente_nombre}</b>: sincroniza, pero con errores: ${String(c.sync_error).slice(0, 160)}.\n` +
          '  Las reservas pueden estar entrando a medias: revisa la clave de Smoobu y los iCal.',
      )
    }
  }

  // ── 🔧 Veredicto de las reparaciones automáticas (20/08/2026) ────────────────────────────────
  // Una reparación mergeada NO se declara resuelta a sí misma: lo dice la huella del agente. Pasadas
  // 24 h desde el merge, o el latido volvió a ponerse verde (se cierra en silencio, el éxito no
  // avisa) o sigue rojo — y entonces sí hace falta el ojo de Alberto, porque el arreglo automático
  // ya se gastó su turno. Es la misma regla que rige todo el repo: el que mide no es el interesado.
  const veredictos = await prisma
    .$queryRaw<Array<{ id: bigint; agente: string; pr_numero: number | null; curada: boolean }>>(
      Prisma.sql`
        SELECT r.id, r.agente, r.pr_numero,
               (l.ultimo_ok_at IS NOT NULL AND l.ultimo_ok_at > r.merged_at) AS curada
          FROM agente_reparaciones r
          JOIN agente_latidos l ON l.agente = r.agente
         WHERE r.estado = 'mergeada' AND r.veredicto IS NULL
           AND r.merged_at < now() - interval '24 hours'`,
    )
    .catch(() => null)
  if (veredictos == null) {
    sondasRotas.push('• <b>🔧 Reparaciones automáticas</b>: no se ha podido juzgar si la última reparación funcionó.')
  } else {
    for (const v of veredictos) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE agente_reparaciones
           SET veredicto = ${v.curada ? 'resuelta' : 'sigue_roja'}, veredicto_at = now()
         WHERE id = ${v.id}`)
      if (v.curada) continue // silencio: funcionó
      const etiqueta = AGENTES_VIGILADOS.find(a => a.id === v.agente)?.etiqueta ?? v.agente
      alertas.push(
        `• <b>🔧 ${etiqueta}</b>: lo intenté reparar solo${v.pr_numero ? ` (PR #${v.pr_numero}, mergeado)` : ''} ` +
          'y 24 h después SIGUE sin latir. El arreglo automático ya se gastó su turno: esto necesita tu ojo.',
      )
    }
  }

  if (alertas.length > 0 || sondasRotas.length > 0) {
    const bloques: string[] = []
    if (alertas.length > 0) bloques.push(`<b>Sin señal / con errores (${alertas.length})</b>\n${alertas.join('\n\n')}`)
    if (sondasRotas.length > 0) {
      bloques.push(`<b>Sin poder comprobar (${sondasRotas.length})</b> — esto NO es «todo bien»:\n${sondasRotas.join('\n')}`)
    }
    await tgAviso('sistema.agentes-latido', `💓⚠️ <b>Latidos de agentes</b>\n\n${bloques.join('\n\n')}`, { html: true })
  }

  // Mantenimiento de la bitácora del panel /telegram (mira 30 días; se guardan 90). Best-effort.
  const purgadas = await purgarBitacora()

  return NextResponse.json({ ok: true, alertas: alertas.length, sondasRotas: sondasRotas.length, purgadas, resultados })
}

export { handler as GET, handler as POST }
