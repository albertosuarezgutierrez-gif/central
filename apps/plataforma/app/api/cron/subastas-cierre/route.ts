// Todo lo que pasa alrededor del CIERRE de una subasta:
//   1. Vigilancia de PUJAS de las que cierran pronto (pestaña `ver=5` del
//      Portal, la única que dice si alguien ha pujado) → histórico + columnas.
//   2. Recordatorios de las SEGUIDAS (3 días y 24 h) con el depósito a
//      consignar, porque pujar exige tener ese dinero bloqueado.
//   3. 🔨 PARTE DEL DESENLACE: qué pasó con las que ya han cerrado — si hubo
//      pujas y por cuánto se fue. Hasta el 20/08/2026 el remate se capturaba EN
//      SILENCIO (a la BD) y no se enteraba nadie; es justo el dato que interesa
//      el día que termina la subasta, y el que calibra lo que vale pujar.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { eur } from '@/lib/dinero'
import { deposito } from '@central/module-subastas'
import { tesoreriaSubastas } from '@/lib/subastas/tesoreria'
import { guardarObservacionPujas, observarPujas } from '@/lib/subastas/enriquecer'
import { calibracionResultados } from '@/lib/subastas/calibracion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS_AVISO = 3
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']
/** Tope de fichas consultadas por pasada (una llamada al Portal por subasta). */
const MAX_VIGILADAS = 25
/** Ventana hacia atrás para contar desenlaces (la captura reintenta 60 días). */
const DIAS_DESENLACE = 30

/**
 * Vigila las PUJAS de todo lo que cierra en los próximos días y guarda cada
 * observación (columna + histórico `subastas_pujas_obs`).
 *
 * 🚨 Antes esto miraba SOLO las subastas seguidas y leía la pestaña general de
 * la ficha. Las dos cosas estaban mal: `subastas_seguidas` está vacía (Alberto
 * no ha marcado ninguna), y la pestaña general NO publica pujas jamás — así que
 * la columna `mejor_puja` llevaba desde el 08/08/2026 con CERO filas y el aviso
 * de sobrepuja no podía dispararse nunca. Ahora se vigila el corpus vivo que
 * está a punto de cerrar, que es donde el dato tiene valor, y se lee `ver=5`.
 *
 * El sí/no de pujas es público; el IMPORTE en vivo solo se ve con sesión en el
 * Portal (`PORTAL_SUBASTAS_COOKIE`). Sin ella se guarda el sí/no, que ya es la
 * señal de competencia que faltaba.
 */
async function vigilarPujas(): Promise<{ vigiladas: number; conPujas: number; sobrepujas: number }> {
  const vivas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.dedupe_key, s.identificador, s.fecha_fin, s.valor_subasta, s.puja_maxima_calc,
           s.hay_pujas AS hay_pujas_previo,
           sg.id AS seguida_id, sg.puja_maxima, sg.sobrepuja_avisada_at
    FROM subastas s
    LEFT JOIN subastas_seguidas sg
      ON sg.dedupe_key = s.dedupe_key AND sg.estado = ANY(${ESTADOS_ACTIVOS}::text[])
    WHERE s.es_inmueble = true AND s.fuente = 'boe' AND s.identificador IS NOT NULL
      AND s.fecha_fin >= now()
      AND s.fecha_fin <= now() + make_interval(days => ${DIAS_AVISO}::int)
    ORDER BY s.fecha_fin ASC
    LIMIT ${MAX_VIGILADAS}
  `)

  // Presupuesto de tiempo (lección de facturas-scan, 31/07/2026): subir el
  // techo solo mueve la pared — lo que garantiza que la pasada VUELVE y llega
  // a los recordatorios de abajo es cortar aquí. Lo no consultado hoy se
  // consulta mañana; las fichas ya vistas conservan su último valor.
  const inicio = Date.now()
  const PRESUPUESTO_MS = 35_000

  let conPujas = 0
  let sobrepujas = 0
  for (const v of vivas) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break
    let obs
    try {
      obs = await observarPujas(v.identificador)
    } catch (e) {
      // Ficha no legible ahora mismo: se reintenta en la pasada siguiente. No
      // se toca la fila — un fallo de lectura no es un dato.
      console.error('[subastas-cierre vigilar]', v.identificador, e)
      continue
    }
    await guardarObservacionPujas({
      dedupeKey: v.dedupe_key, identificador: v.identificador, obs, fechaFin: v.fecha_fin,
    })
    if (obs.estado !== 'hay_pujas') continue
    conPujas++

    // Sobrepuja: solo se puede afirmar con el importe delante, que exige sesión
    // en el Portal. Sin importe no se avisa — «hay pujas» no es «te han pasado».
    if (obs.importe == null || v.seguida_id == null || v.sobrepuja_avisada_at != null) continue
    const techo = v.puja_maxima != null ? Number(v.puja_maxima)
      : v.puja_maxima_calc != null ? Number(v.puja_maxima_calc) : null
    if (techo == null || obs.importe <= techo) continue

    const valor = v.valor_subasta == null ? null : Number(v.valor_subasta)
    const pct = valor && valor > 0 ? ` (${Math.round((obs.importe / valor) * 100)}% del tipo)` : ''
    await tgSend(
      `🔥 <b>${escapar(v.identificador)}</b> — ya pujan <b>${escapar(eur(obs.importe))}</b>${escapar(pct)}, ` +
        `por encima de tu techo de ${escapar(eur(techo))}. A este precio deja de ser negocio: ` +
        `puja solo si asumes menos descuento.`,
      { html: true },
    ).catch(() => {})
    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas_seguidas SET sobrepuja_avisada_at = now() WHERE id = ${v.seguida_id}::uuid
    `)
    sobrepujas++
  }
  return { vigiladas: vivas.length, conPujas, sobrepujas }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    // Antes de los recordatorios: refrescar la mejor puja de las que cierran
    // pronto, para que los avisos de abajo hablen con el dato de HOY.
    const vigilancia = await vigilarPujas().catch((e) => {
      console.error('[subastas-cierre] vigilancia', e)
      return { vigiladas: 0, conPujas: 0, sobrepujas: 0 }
    })

    // El desenlace va SIEMPRE, haya o no seguidas que recordar: es el único
    // aviso que cuenta qué pasó de verdad con lo que ya cerró.
    const desenlaces = await avisarDesenlaces().catch((e) => {
      console.error('[subastas-cierre] desenlaces', e)
      return 0
    })

    const proximas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cuenta_id, dedupe_key, subasta, estado, fecha_fin, puja_maxima
      FROM subastas_seguidas
      WHERE recordatorio_cierre_at IS NULL
        AND estado = ANY(${ESTADOS_ACTIVOS}::text[])
        AND fecha_fin IS NOT NULL
        AND fecha_fin >= now()
        AND fecha_fin <= now() + make_interval(days => ${DIAS_AVISO}::int)
      ORDER BY fecha_fin ASC
    `)

    if (!proximas.length) {
      return NextResponse.json({ ok: true, avisados: 0, desenlaces, urgentes: await avisarUltimas24h(), ...vigilancia })
    }

    const lineas: string[] = [`⏰ <b>Subastas que cierran en ${DIAS_AVISO} días o menos</b>`, '']

    for (const p of proximas) {
      const s = p.subasta ?? {}
      // El depósito publicado por el Portal manda; si falta, el 5% legal.
      const dep = s.deposito != null && Number(s.deposito) > 0 ? Number(s.deposito) : deposito(s.valorSubasta ?? null)
      const cierre = new Date(p.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

      lineas.push(`• <b>${s.identificador ?? p.dedupe_key}</b> — cierra ${cierre}`)
      if (s.descripcion) lineas.push(`  ${String(s.descripcion).slice(0, 140)}`)
      lineas.push(`  Depósito para pujar: ${dep ? eur(dep) : 'sin valor de subasta publicado'}`)
    }

    // ── Tesorería ───────────────────────────────────────────────────────────
    // No basta con sumar los depósitos de las que cierran esta semana: cuenta
    // el MÁXIMO SIMULTÁNEO de TODAS las seguidas (las que se solapan coinciden
    // en la cuenta) y se contrasta con el saldo real.
    for (const cuentaId of [...new Set(proximas.map((p) => String(p.cuenta_id)))]) {
      const { plan, saldo } = await tesoreriaSubastas(cuentaId)
      if (plan.pico <= 0) continue

      lineas.push('', `💰 Necesitas <b>${eur(plan.pico)}</b> bloqueados a la vez` +
        (plan.picoDesde ? ` desde el ${new Date(plan.picoDesde).toLocaleDateString('es-ES')}` : '') +
        (plan.picoSubastas.length > 1 ? ` (${plan.picoSubastas.length} subastas solapadas)` : ''))
      if (plan.total > plan.pico) {
        lineas.push(`  <i>Suma de depósitos ${eur(plan.total)}, pero no coinciden todos en el tiempo.</i>`)
      }
      if (saldo.cuentas === 0) {
        lineas.push('  ⚠️ No hay saldo de cuentas corrientes para contrastar.')
      } else if (plan.deficit != null && plan.deficit > 0) {
        lineas.push(`  🚨 Disponible ${eur(saldo.total)} → <b>faltan ${eur(plan.deficit)}</b>.`)
      } else {
        lineas.push(`  ✅ Disponible ${eur(saldo.total)}, suficiente.`)
      }
      if (saldo.desactualizado) {
        lineas.push(`  <i>Ojo: el saldo más antiguo es del ${new Date(saldo.masAntiguo!).toLocaleDateString('es-ES')}.</i>`)
      }
      if (plan.incompletos.length) {
        lineas.push(`  <i>Sin depósito o sin fecha de cierre: ${plan.incompletos.join(', ')}.</i>`)
      }
    }

    await tgSend(lineas.join('\n'), { html: true }).catch(() => {})

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas_seguidas SET recordatorio_cierre_at = now()
      WHERE id = ANY(${proximas.map((p) => p.id)}::uuid[])
    `)

    const urgentes = await avisarUltimas24h()
    return NextResponse.json({ ok: true, avisados: proximas.length, desenlaces, urgentes, ...vigilancia })
  } catch (e: any) {
    console.error('[subastas-cierre]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}

/**
 * Segundo recordatorio, URGENTE, en las últimas 24 h — con lo que hay que
 * tener delante para decidir la puja: depósito, semáforo documental, las notas
 * de la CERTIFICACIÓN registral y el €/m² de la zona frente al del tipo.
 * `recordatorio_24h_at` fija que se manda una sola vez.
 */
async function avisarUltimas24h(): Promise<number> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT sg.id, sg.dedupe_key, sg.subasta, sg.fecha_fin, sg.puja_maxima,
           s.semaforo, s.notas_edicto, s.precio_m2_zona, s.zona_portal,
           COALESCE(s.superficie_catastro, s.superficie) AS m2, s.valor_subasta,
           s.mejor_puja, s.mejor_puja_at, s.hay_pujas, s.pujas_at
    FROM subastas_seguidas sg
    LEFT JOIN subastas s ON s.dedupe_key = sg.dedupe_key
    WHERE sg.recordatorio_24h_at IS NULL
      AND sg.estado = ANY(${ESTADOS_ACTIVOS}::text[])
      AND sg.fecha_fin IS NOT NULL
      AND sg.fecha_fin >= now()
      AND sg.fecha_fin <= now() + interval '24 hours'
    ORDER BY sg.fecha_fin ASC
  `)
  if (!filas.length) return 0

  const SEMAFORO_EMOJI: Record<string, string> = { verde: '🟢', ambar: '🟡', rojo: '🔴' }
  const lineas: string[] = ['🚨 <b>ÚLTIMAS 24 HORAS</b> — subastas seguidas a punto de cerrar', '']
  for (const f of filas) {
    const s = f.subasta ?? {}
    const cierre = new Date(f.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })
    const dep = s.deposito != null && Number(s.deposito) > 0 ? Number(s.deposito) : deposito(s.valorSubasta ?? null)
    lineas.push(`• <b>${s.identificador ?? f.dedupe_key}</b> — cierra ${cierre} (hora Madrid)`)
    if (s.descripcion) lineas.push(`  ${String(s.descripcion).slice(0, 140)}`)
    lineas.push(`  Depósito: ${dep ? eur(dep) : 'sin valor de subasta publicado'}` +
      (f.puja_maxima != null ? ` · tu puja máx.: ${eur(Number(f.puja_maxima))}` : ''))
    // Las pujas en la última hora: TRES estados. Un hueco es «no lo hemos
    // mirado», nunca «nadie ha pujado».
    if (f.mejor_puja != null) {
      const valor = f.valor_subasta == null ? null : Number(f.valor_subasta)
      const pct = valor && valor > 0 ? ` (${Math.round((Number(f.mejor_puja) / valor) * 100)}% del tipo)` : ''
      lineas.push(`  🔥 Mejor puja vista: ${eur(Number(f.mejor_puja))}${pct}`)
    } else if (f.hay_pujas === true) {
      lineas.push('  🔥 Ya hay pujas (el Portal no publica el importe sin sesión iniciada)')
    } else if (f.hay_pujas === false) {
      lineas.push('  🟢 Todavía nadie ha pujado')
    }
    if (f.semaforo) lineas.push(`  ${SEMAFORO_EMOJI[f.semaforo] ?? ''} Semáforo documental: ${f.semaforo}`)
    // El €/m² al tipo frente al de la zona: la cifra que resume la oportunidad.
    const valor = f.valor_subasta == null ? null : Number(f.valor_subasta)
    const m2 = f.m2 == null ? null : Number(f.m2)
    if (valor && m2 && m2 > 0 && f.precio_m2_zona != null) {
      lineas.push(`  📍 Al tipo sale a ${Math.round(valor / m2)}€/m² — la zona${f.zona_portal ? ` (${f.zona_portal})` : ''} está a ~${Math.round(Number(f.precio_m2_zona))}€/m²`)
    }
    for (const nota of String(f.notas_edicto ?? '').split('\n').filter(Boolean).slice(0, 4)) {
      lineas.push(`  📄 ${nota}`)
    }
    lineas.push('')
  }

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_seguidas SET recordatorio_24h_at = now()
    WHERE id = ANY(${filas.map((f) => f.id)}::uuid[])
  `)
  return filas.length
}

// ── 🔨 Parte del desenlace ───────────────────────────────────────────────────
/**
 * Cuenta qué pasó con las subastas que ya han cerrado: si hubo pujas y por
 * cuánto se remató, contra el tipo de salida y contra el techo que habíamos
 * calculado ANTES (`puja_maxima_calc`, congelado al concluir). Es el bucle que
 * cierra el sistema: hasta ahora ese dato entraba en la BD sin que se enterara
 * nadie, y es justo el que dice si merece la pena pujar en esa zona.
 *
 * `resultado_avisado_at` fija que cada subasta se cuenta UNA vez. Las que
 * cerraron pero todavía no tienen desenlace publicado se mencionan en bloque:
 * «pendiente de certificado» NO es «quedó desierta», y confundirlos sería
 * inventar un resultado.
 */
async function avisarDesenlaces(): Promise<number> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT dedupe_key, identificador, municipio, provincia, direccion, descripcion, fecha_fin,
           resultado, valor_subasta, importe_adjudicacion, puja_maxima_calc, hay_pujas
    FROM subastas
    WHERE es_inmueble = true
      AND resultado IS NOT NULL
      AND resultado_avisado_at IS NULL
      AND fecha_fin IS NOT NULL
      AND fecha_fin >= now() - make_interval(days => ${DIAS_DESENLACE}::int)
    ORDER BY fecha_fin DESC
  `)

  // Cerradas sin desenlace: se cuentan como PENDIENTES, con su fecha, para que
  // el silencio no se lea como «no hubo pujas».
  const pendientes = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT count(*) AS n FROM subastas
    WHERE es_inmueble = true AND resultado IS NULL
      AND fecha_fin IS NOT NULL
      AND fecha_fin < now() - interval '6 hours'
      AND fecha_fin >= now() - make_interval(days => ${DIAS_DESENLACE}::int)
  `)
  const nPendientes = Number(pendientes[0]?.n ?? 0)

  if (!filas.length) return 0

  const lineas: string[] = ['🔨 <b>Cómo acabaron</b>', '']
  for (const f of filas) {
    const donde = String(f.direccion ?? f.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
    const cierre = new Date(f.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })
    const tipo = f.valor_subasta == null ? null : Number(f.valor_subasta)
    const remate = f.importe_adjudicacion == null ? null : Number(f.importe_adjudicacion)

    lineas.push(`• <b>${escapar(String(f.identificador ?? f.dedupe_key))}</b> — cerró ${escapar(cierre)}`)
    if (donde) lineas.push(`  ${escapar(donde)}${f.municipio ? escapar(` (${f.municipio})`) : ''}`)

    if (remate != null && tipo != null && tipo > 0) {
      const pct = Math.round((remate / tipo) * 100)
      const dif = remate - tipo
      // Por encima o por debajo del tipo, dicho en euros: el % solo no se lee.
      lineas.push(
        `  💰 Rematada en <b>${escapar(eur(remate))}</b> — ${pct}% del tipo (${escapar(eur(tipo))}), ` +
          `${dif >= 0 ? `${escapar(eur(dif))} POR ENCIMA` : `${escapar(eur(Math.abs(dif)))} por debajo`}`,
      )
    } else if (remate != null) {
      lineas.push(`  💰 Rematada en <b>${escapar(eur(remate))}</b> (sin tipo publicado con el que comparar)`)
    } else if (/desiert/i.test(String(f.resultado))) {
      lineas.push('  🕳️ <b>Quedó DESIERTA</b>: nadie pujó' + (tipo ? escapar(` (tipo ${eur(tipo)})`) : ''))
    } else {
      // Estado reconocido pero sin importe: se dice tal cual, no se rellena.
      lineas.push(`  ⚪ ${escapar(String(f.resultado))} — el Portal no publica importe`)
    }

    // ¿Habríamos ganado? El techo se congeló ANTES del remate, así que la
    // comparación es honesta y es la que calibra el agente.
    const techo = f.puja_maxima_calc == null ? null : Number(f.puja_maxima_calc)
    if (techo != null && remate != null) {
      lineas.push(
        techo >= remate
          ? `  ✅ Nuestro techo era ${escapar(eur(techo))}: habríamos ganado`
          : `  ❌ Nuestro techo era ${escapar(eur(techo))}: se fue ${escapar(eur(remate - techo))} por encima`,
      )
    }
    lineas.push('')
  }

  // La lectura agregada con TODO lo capturado: a qué % del tipo se remata de
  // verdad. Es lo que el agente usa ahora para proyectar el remate esperado.
  try {
    const calibracion = await calibracionResultados()
    const global = calibracion.find((z) => z.provincia === '(todas)')
    if (global?.ratioMediano != null) {
      lineas.push(
        `📊 Con ${global.muestraRatio} remate${global.muestraRatio === 1 ? '' : 's'} real${global.muestraRatio === 1 ? '' : 'es'}, ` +
          `la mediana está en el ${Math.round(global.ratioMediano * 100)}% del tipo — es el ratio con el que el agente ` +
          'proyecta ahora el remate esperado de lo que sigue vivo.',
      )
    }
  } catch (e) {
    console.error('[subastas-cierre] calibración', e)
  }
  if (nPendientes > 0) {
    lineas.push(`⏳ ${nPendientes} cerrada${nPendientes === 1 ? '' : 's'} sin desenlace publicado todavía (no es «desierta»: el Portal aún no lo dice).`)
  }

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas SET resultado_avisado_at = now()
    WHERE dedupe_key = ANY(${filas.map((f) => String(f.dedupe_key))}::text[])
  `)
  return filas.length
}
