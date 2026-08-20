// ────────────────────────────────────────────────────────────────────────────
// Avisos de CIERRE de subastas. Dos, no uno (petición de Alberto, 20/08/2026):
//
//   1. «PREPARA EL DEPÓSITO» a 5 días — el cuello de botella real es el DINERO,
//      no la documentación. Para pujar hay que tener el depósito consignado
//      ANTES, y el Portal llega a pedir el 20% del tipo (SUB-JA-2026-262097:
//      3.108,68€ sobre 15.543,40€). Avisar la víspera no da tiempo a moverlo.
//   2. «ÚLTIMAS 24 HORAS» — con el estado de pujas de HOY.
//
// 🚨 Y sobre todo: los avisos cuelgan ahora del RADAR (lo que ya pasó el filtro
// de rentabilidad), no solo de `subastas_seguidas`. Auditado el 20/08/2026: 19
// filas en el radar, 18 avisadas y **0 seguidas** — Alberto no ha pulsado nunca
// «👀 Seguir», así que toda esta maquinaria estaba completa y no se había
// disparado JAMÁS (`mejor_puja_at` sin estrenar en las 26 filas del corpus).
// Un aviso que depende de un botón que nadie pulsa es un aviso que no existe.
//
// Las seguidas conservan su camino (techo declarado a mano, sobrepuja) y el
// radar excluye lo que ya está en seguimiento activo para no avisar dos veces.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { eur } from '@/lib/dinero'
import { deposito, titularCargas, umbralesPuja, viviendaHabitualDeNotas, type PujasFicha } from '@central/module-subastas'
import { tesoreriaSubastas } from '@/lib/subastas/tesoreria'
import { estadoPujasViva } from '@/lib/subastas/enriquecer'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'
import { calibracionResultados } from '@/lib/subastas/calibracion'
import { bloqueSubasta, escapar, lecturaRatio, urlFicha, type DatosAviso } from '@/lib/subastas/aviso-cierre'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Días de antelación del aviso de «prepara el depósito». */
const DIAS_PREPARAR = 5
const DIAS_AVISO = 3
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']
/** Tope de fichas consultadas por pasada (una llamada al Portal por subasta). */
const MAX_VIGILADAS = 12
const PRESUPUESTO_VIGILANCIA_MS = 35_000

/** Subastas en seguimiento ACTIVO: el radar no las vuelve a avisar. */
const SIN_SEGUIMIENTO_ACTIVO = Prisma.sql`
  NOT EXISTS (
    SELECT 1 FROM subastas_seguidas ss
    WHERE ss.dedupe_key = r.dedupe_key AND ss.estado = ANY(${ESTADOS_ACTIVOS}::text[])
  )
`

/** Fila del corpus por `dedupe_key`, con las columnas canónicas (sin `SELECT *`). */
async function corpusPorClave(claves: string[]): Promise<Map<string, any>> {
  if (!claves.length) return new Map()
  const filas = await prisma.$queryRaw<any[]>(
    Prisma.sql`SELECT ${COLS_SUBASTA} FROM subastas WHERE dedupe_key IN (${Prisma.join(claves)})`,
  )
  return new Map(filas.map((f) => [f.dedupe_key as string, f]))
}

/**
 * Refresca el estado de PUJAS de lo que cierra pronto (radar + seguidas).
 *
 * 🚨 Lee la pestaña «Pujas» (`ver=5`), que es la única que lo publica: la
 * versión anterior miraba la general, donde solo están la puja MÍNIMA y los
 * tramos, y por eso no encontró nunca nada. Sin sesión el Portal no da el
 * IMPORTE mientras la subasta está abierta —solo si hay pujas o no—, así que un
 * `estado: 'con_puja'` con `importe: null` es el dato completo, no uno a medias.
 *
 * Un fallo de lectura NO escribe: deja el último estado conocido con su fecha.
 */
async function vigilarPujas(): Promise<{ vigiladas: number; leidas: number }> {
  // Sin DISTINCT a propósito: se consulta `subastas` con dos EXISTS, no con un
  // JOIN, así que cada subasta sale UNA vez. Con `DISTINCT` esto era SQL
  // inválido —`ORDER BY s.fecha_fin` sobre una columna fuera del SELECT, error
  // 42P10— y el vigía moría en cada pasada. No lo caza ni `tsc` ni el build.
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; identificador: string }>>(Prisma.sql`
    SELECT s.dedupe_key, s.identificador
    FROM subastas s
    WHERE s.fuente = 'boe' AND s.identificador IS NOT NULL
      AND s.archivada_at IS NULL
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin >= now()
      AND s.fecha_fin <= now() + make_interval(days => ${DIAS_PREPARAR + 1}::int)
      AND (
        EXISTS (SELECT 1 FROM subastas_radar r WHERE r.dedupe_key = s.dedupe_key AND r.descartado = false)
        OR EXISTS (SELECT 1 FROM subastas_seguidas ss WHERE ss.dedupe_key = s.dedupe_key AND ss.estado = ANY(${ESTADOS_ACTIVOS}::text[]))
      )
    ORDER BY s.fecha_fin ASC
    LIMIT ${MAX_VIGILADAS}
  `)

  const inicio = Date.now()
  let leidas = 0
  for (const f of filas) {
    if (Date.now() - inicio > PRESUPUESTO_VIGILANCIA_MS) break
    let p: PujasFicha
    try {
      p = await estadoPujasViva(f.identificador)
    } catch (e) {
      // Ficha ilegible ahora mismo: se reintenta mañana. No se toca la fila —
      // un fallo de red no es «no hay pujas».
      console.error('[subastas-cierre vigilar]', f.identificador, e)
      continue
    }
    // Tampoco se persiste un «no he sabido leerlo»: pisaría un estado bueno de
    // ayer con un hueco de hoy.
    if (p.estado === 'desconocido') continue
    leidas++
    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        pujas_estado = ${p.estado},
        pujas_estado_at = now(),
        -- El importe solo llega cuando el Portal lo publica (subasta concluida).
        -- COALESCE porque una puja solo puede subir: un null no borra lo visto.
        mejor_puja = COALESCE(${p.importe}, mejor_puja),
        mejor_puja_at = CASE WHEN ${p.importe}::numeric IS NULL THEN mejor_puja_at ELSE now() END,
        actualizado_en = now()
      WHERE dedupe_key = ${f.dedupe_key}
    `)
  }
  return { vigiladas: filas.length, leidas }
}

/** Traduce una fila del corpus al bloque de aviso (con cargas, pujas y umbral). */
function datosDe(f: any): DatosAviso {
  const s = filaASubasta(f)
  const pub = f.deposito == null ? null : Number(f.deposito)
  const dep = pub != null && pub > 0 ? pub : deposito(s.valorSubasta)
  const u = umbralesPuja(s, { viviendaHabitual: viviendaHabitualDeNotas(f.notas_edicto) })
  const cargas = titularCargas({
    cargas: s.cargas,
    cargasConocidas: s.cargasConocidas,
    documentos: Array.isArray(f.documentos) ? f.documentos : null,
    publicaAdjuntos: (f.fuente ?? 'boe') === 'boe',
    muro: f.documentos_muro ?? 'ninguno',
  })
  return {
    identificador: f.identificador ?? f.dedupe_key,
    descripcion: f.descripcion,
    municipio: f.municipio,
    provincia: f.provincia,
    valorSubasta: s.valorSubasta,
    deposito: dep,
    fechaFin: s.fechaFin,
    // `pujas_estado` NULL = nunca se ha comprobado, y eso se dice tal cual.
    pujas: {
      estado: (f.pujas_estado ?? 'desconocido') as PujasFicha['estado'],
      importe: f.mejor_puja == null ? null : Number(f.mejor_puja),
    },
    pujasAt: f.pujas_estado_at ? new Date(f.pujas_estado_at).toISOString() : null,
    sueloLaj: u.umbrales.find((x) => x.clave === 'suelo_laj')?.importe ?? null,
    techoPuja: f.puja_maxima_calc == null ? null : Number(f.puja_maxima_calc),
    cargas: `${cargas.emoji} ${cargas.texto}`,
    url: urlFicha(f.identificador ?? ''),
  }
}

/** Bloque de tesorería de una cuenta (reusa el plan que ya cae al radar solo). */
async function bloqueTesoreria(cuentaId: string): Promise<string[]> {
  const l: string[] = []
  const { plan, saldo, origen } = await tesoreriaSubastas(cuentaId)
  if (plan.pico <= 0) return l
  l.push('', `💰 Necesitas <b>${eur(plan.pico)}</b> bloqueados a la vez` +
    (plan.picoDesde ? ` desde el ${new Date(plan.picoDesde).toLocaleDateString('es-ES')}` : '') +
    (plan.picoSubastas.length > 1 ? ` (${plan.picoSubastas.length} subastas solapadas)` : ''))
  if (origen === 'radar') {
    l.push('  <i>Simulación: es lo que haría falta si pujaras en TODAS las del radar, no un compromiso.</i>')
  }
  if (saldo.cuentas === 0) {
    l.push('  ⚠️ No hay saldo de cuentas corrientes para contrastar.')
  } else if (plan.deficit != null && plan.deficit > 0) {
    l.push(`  🚨 Disponible ${eur(saldo.total)} → <b>faltan ${eur(plan.deficit)}</b>.`)
  } else {
    l.push(`  ✅ Disponible ${eur(saldo.total)}, suficiente.`)
  }
  if (saldo.desactualizado) {
    l.push(`  <i>Ojo: el saldo más antiguo es del ${new Date(saldo.masAntiguo!).toLocaleDateString('es-ES')}.</i>`)
  }
  return l
}

/**
 * Aviso del RADAR. `ventana` elige cuál de los dos: el de preparar el depósito
 * (a `DIAS_PREPARAR` días, dejando fuera las últimas 24 h, que van en el otro) o
 * el urgente de la víspera. Cada uno lleva su marca para mandarse UNA vez.
 */
async function avisarRadar(ventana: 'deposito' | 'cierre'): Promise<number> {
  const esDeposito = ventana === 'deposito'
  const marca = esDeposito ? Prisma.sql`r.aviso_deposito_at` : Prisma.sql`r.aviso_cierre_at`
  const rango = esDeposito
    ? Prisma.sql`s.fecha_fin > now() + interval '24 hours' AND s.fecha_fin <= now() + make_interval(days => ${DIAS_PREPARAR}::int)`
    : Prisma.sql`s.fecha_fin <= now() + interval '24 hours'`

  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.cuenta_id, r.dedupe_key
    FROM subastas_radar r
    JOIN subastas s ON s.dedupe_key = r.dedupe_key
    WHERE r.descartado = false
      AND ${marca} IS NULL
      AND s.archivada_at IS NULL
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin >= now()
      AND ${rango}
      AND ${SIN_SEGUIMIENTO_ACTIVO}
    ORDER BY s.fecha_fin ASC
    LIMIT 20
  `)
  if (!filas.length) return 0

  const corpus = await corpusPorClave(filas.map((f) => String(f.dedupe_key)))
  // El histórico de remates: lo que de verdad se pagó en esa provincia. Se pide
  // una vez para todo el mensaje (es una consulta sobre el corpus concluido).
  const calibracion = await calibracionResultados().catch((e) => {
    console.error('[subastas-cierre] calibración', e)
    return []
  })

  const lineas: string[] = esDeposito
    ? [`💶 <b>Prepara el depósito</b> — cierran en ${DIAS_PREPARAR} días o menos`, '',
       '<i>Sin el depósito consignado no se puede pujar, y moverlo lleva días.</i>', '']
    : ['🚨 <b>ÚLTIMAS 24 HORAS</b>', '']

  const avisadas: string[] = []
  for (const f of filas) {
    const fila = corpus.get(String(f.dedupe_key))
    if (!fila) continue
    const d = datosDe(fila)
    lineas.push(...bloqueSubasta(d, lecturaRatio(calibracion, d.provincia)), '')
    avisadas.push(String(f.id))
  }
  if (!avisadas.length) return 0

  if (esDeposito) {
    for (const cuentaId of [...new Set(filas.map((f) => String(f.cuenta_id)))]) {
      lineas.push(...(await bloqueTesoreria(cuentaId).catch(() => [])))
    }
  }

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  await prisma.$executeRaw(
    esDeposito
      ? Prisma.sql`UPDATE subastas_radar SET aviso_deposito_at = now() WHERE id = ANY(${avisadas}::uuid[])`
      : Prisma.sql`UPDATE subastas_radar SET aviso_cierre_at = now() WHERE id = ANY(${avisadas}::uuid[])`,
  )
  return avisadas.length
}

/**
 * Recordatorio de las SEGUIDAS (interés declarado a mano). Se conserva tal cual
 * porque lleva el techo de puja que Alberto fija en el seguimiento, que el radar
 * no tiene. Con 0 seguidas simplemente no manda nada.
 */
async function avisarSeguidas(): Promise<number> {
  const proximas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, cuenta_id, dedupe_key, fecha_fin, puja_maxima
    FROM subastas_seguidas
    WHERE recordatorio_cierre_at IS NULL
      AND estado = ANY(${ESTADOS_ACTIVOS}::text[])
      AND fecha_fin IS NOT NULL
      AND fecha_fin >= now()
      AND fecha_fin <= now() + make_interval(days => ${DIAS_AVISO}::int)
    ORDER BY fecha_fin ASC
  `)
  if (!proximas.length) return 0

  const corpus = await corpusPorClave(proximas.map((p) => String(p.dedupe_key)))
  const calibracion = await calibracionResultados().catch(() => [])
  const lineas: string[] = [`⏰ <b>Seguidas que cierran en ${DIAS_AVISO} días o menos</b>`, '']

  for (const p of proximas) {
    const fila = corpus.get(String(p.dedupe_key))
    if (!fila) continue
    const d = datosDe(fila)
    lineas.push(...bloqueSubasta(d, lecturaRatio(calibracion, d.provincia)))
    if (p.puja_maxima != null) lineas.push(`  🎯 Tu puja máxima declarada: ${escapar(eur(Number(p.puja_maxima)))}`)
    lineas.push('')
  }

  for (const cuentaId of [...new Set(proximas.map((p) => String(p.cuenta_id)))]) {
    lineas.push(...(await bloqueTesoreria(cuentaId).catch(() => [])))
  }

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_seguidas SET recordatorio_cierre_at = now()
    WHERE id = ANY(${proximas.map((p) => p.id)}::uuid[])
  `)
  return proximas.length
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    // Primero el estado de pujas, para que los avisos hablen con el dato de HOY.
    const vigilancia = await vigilarPujas().catch((e) => {
      console.error('[subastas-cierre] vigilancia', e)
      return { vigiladas: 0, leidas: 0 }
    })

    const deposito5d = await avisarRadar('deposito').catch((e) => {
      console.error('[subastas-cierre] deposito', e)
      return 0
    })
    const urgentes = await avisarRadar('cierre').catch((e) => {
      console.error('[subastas-cierre] cierre', e)
      return 0
    })
    const seguidas = await avisarSeguidas().catch((e) => {
      console.error('[subastas-cierre] seguidas', e)
      return 0
    })

    return NextResponse.json({ ok: true, ...vigilancia, deposito5d, urgentes, seguidas })
  } catch (e: any) {
    console.error('[subastas-cierre]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
