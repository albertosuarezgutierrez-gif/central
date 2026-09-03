// lib/sivra/pricing-ancla-global.ts — de qué corpus sale el ANCLA GLOBAL del motor de precios.
//
// 🚨 EL SERRUCHO, SEGUNDA MITAD (diagnosticado el 27/08/2026).
//
// El 25/08 se documentó «el serrucho» en `pricing-base-evento.ts` y se arregló SOLO la rama de
// EVENTO: el salto de evento pasó a multiplicarse sobre el bucket del MES en vez de sobre el ancla
// global. Pero el ancla global siguió siendo lo que era —el percentil del barrido de ESA mañana— y
// sigue siendo la base de TODA fecha que no llega a bucket de mes (`useMonth === false`: hacen
// falta 3 comps de 3 fechas distintas de ese mes). Esas fechas seguían oscilando.
//
// Caso reproducible, `prop_busto_reform` / 2026-08-30, una pasada por día a las 08:30:
//
//     99 → 95 → 78 → 94 → 105 → 84 → 101 → 81 → 97 → 78
//
// No es el mercado: es el ancla. Medida día a día para ese piso, `med_guest_global` valía
// 153, 145, 116, 135, 130, 110, 180, 95, 208, 114 — porque el barrido muestrea **6-7 fechas de
// entrada** de las ~110 del horizonte y cada mañana OTRAS: un día caen cinco noches muertas de
// enero, al día siguiente entra Semana Santa. La fecha no tiene comps propios, cae al ancla, la
// persigue, y el raíl ±20% satura alternativamente arriba y abajo. Un ciclo límite de periodo 2.
//
// La cura es la misma que ya usaba el bucket del mes: **medir sobre el corpus ACUMULADO**, no
// sobre el barrido del día. Una lectura por comparable × fecha (la más reciente) en una ventana de
// 30 días. Medido el 27/08/2026 sobre los cuatro pisos:
//
//     piso                  volatilidad hoy   acumulada   fechas muestreadas
//     prop_busto_reform          1,96×          1,05×        6-7 → 73-116
//     prop_duplex_center         2,19×          1,07×        6-7 → 77-115
//     prop_house_sevillana       2,27×          1,07×        6-7 → 79-119
//     prop_luxury_busto          8,34×          1,03×        6-7 → 73-113
//
// 🚦 Lo que este módulo NO toca, a propósito: `sample_n` y `market_age_days` siguen midiéndose
// sobre la ÚLTIMA PASADA ÚTIL (`pricing-corpus-utilizable.ts`). Son la guarda de FRESCURA —«¿ha
// mirado alguien el mercado esta semana?»— y calcularlas sobre una ventana de 30 días las dejaría
// en verde para siempre: el motor seguiría tarifando con corpus de hace un mes sin decirlo.
// Estabilidad y frescura son dos preguntas distintas y cada una conserva su medida.
//
// Módulo PURO (sin Prisma ni `@/`), testeable con `node --test`.
import { sqlCompPlausible } from './pricing-comps-plausibles.ts'
import { sqlCompDeNuestraLiga } from './pricing-comps-liga.ts'

/** Ventana del corpus acumulado, en días de `search_date`. */
export const VENTANA_ANCLA_DIAS = 30

/**
 * Fechas de entrada distintas que debe cubrir el corpus acumulado para mandar sobre el barrido.
 *
 * No es un número redondo elegido a ojo: el barrido de una mañana daba **6-7** fechas y el
 * acumulado de 30 días da **73-119** (medido en los cuatro pisos el 27/08/2026). El umbral tiene
 * que caer con holgura entre ambos — por debajo dejaría pasar al barrido disfrazado de corpus, y
 * muy por encima dejaría a un piso nuevo sin ancla estable el día que estrene mercado.
 */
export const MIN_FECHAS_ANCLA = 15

/** Fuentes cuyo precio está medido PARA ESA FECHA (espejo de `FUENTES_FIABLES_BUCKET`). */
export const FUENTES_FIABLES_ANCLA = ['booking_mcp', 'manual'] as const

/**
 * Cuerpo del CTE del CORPUS del ancla: una fila por comparable × fecha (la lectura MÁS RECIENTE)
 * en los últimos `VENTANA_ANCLA_DIAS` días, **ya elegida entre corpus fiable y mezcla**.
 *
 * 🚨 La preferencia de fuente vive AQUÍ y solo aquí. El motor la necesita agregada (percentiles) y
 * el panel `pricing/settings` la necesita en filas para su propio percentil: si cada uno aplicara
 * su versión de la regla, el panel acabaría enseñando un número que el motor no usa — que es el
 * fallo que este repo ya conoce con otro nombre («alarma y panel afirmando lo contrario sobre el
 * mismo hecho»). Una definición, dos formas de leerla.
 *
 * La regla es la misma del bucket del mes (`pricing-bucket-fuente.ts`): el corpus FIABLE (medido
 * para esa fecha) manda **solo si por sí mismo** cubre `MIN_FECHAS_ANCLA` fechas; si no, la mezcla.
 * Así esta preferencia nunca deja a un piso sin ancla — el peor caso es lo que había antes.
 *
 * Texto plano (no `Prisma.sql`) para que el módulo siga siendo puro y testeable con `node --test`.
 * Va a `Prisma.raw`, y puede: no interpola NADA de fuera, solo constantes de este repo.
 */
export function sqlCorpusAncla(): string {
  const fiables = FUENTES_FIABLES_ANCLA.map(f => `'${f}'`).join(',')
  return `
        WITH dedup AS (
          -- Una lectura por comparable × fecha: la MÁS RECIENTE. Sin este dedupe, un comparable
          -- medido 20 mañanas seguidas pesaría 20 veces y el ancla volvería a describir el barrido.
          -- price_night NORMALIZADO al aforo del piso (ver pricing_factor_aforo).
          SELECT DISTINCT ON (m.scenario, m.checkin_date, m.comp_name)
            m.scenario, m.checkin_date, m.comp_name, m.fuente, m.score,
            m.price_night * pricing_factor_aforo(z.max_guests, m.guests) AS price_night
          FROM market_rates m
          LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
          -- LEFT y no JOIN a proposito: sin fila de ajustes no sabemos en que liga jugamos, y eso
          -- DEJA PASAR al comparable (ver pricing-comps-liga.ts), nunca lo descarta en silencio.
          LEFT JOIN pricing_settings sl ON sl.property_id = m.scenario
          WHERE m.price_night > 0 AND m.scenario LIKE 'prop_%'
            AND m.checkin_date >= CURRENT_DATE
            AND m.search_date >= CURRENT_DATE - ${VENTANA_ANCLA_DIAS}::int
            -- Mismas dos guardas que el bucket del mes: pasadas cuyo corpus no distingue la fecha
            -- (estacionalidad inventada) y habitaciones vestidas de piso entero.
            AND NOT m.corpus_clonado
            AND ${sqlCompPlausible("m.")}
            -- Y fuera los que no son competencia nuestra: el corpus de un piso puntuado 6,9 traia
            -- Mercer Residences (9,1) y Palacio Bucarelli (9,1). Ver pricing-comps-liga.ts.
            AND ${sqlCompDeNuestraLiga("m.", "sl.own_score")}
          ORDER BY m.scenario, m.checkin_date, m.comp_name, m.search_date DESC
        ),
        fiab AS (
          SELECT scenario, COUNT(DISTINCT checkin_date) FILTER (WHERE fuente IN (${fiables})) AS n
          FROM dedup GROUP BY scenario
        )
        SELECT d.scenario, d.checkin_date, d.fuente, d.score, d.price_night
        FROM dedup d JOIN fiab f ON f.scenario = d.scenario
        WHERE (f.n >= ${MIN_FECHAS_ANCLA} AND d.fuente IN (${fiables})) OR f.n < ${MIN_FECHAS_ANCLA}`
}

/**
 * Cuerpo del CTE `anc` del motor: una fila por `scenario` con los percentiles objetivo/suelo/techo
 * sobre el corpus de `sqlCorpusAncla()`, más cuántas fechas distintas cubre y si salió del corpus
 * fiable. Quién manda entre esto y el barrido lo decide `elegirAnclaGlobal`, que tiene tests.
 */
export function sqlAnclaGlobalAcumulada(): string {
  const fiables = FUENTES_FIABLES_ANCLA.map(f => `'${f}'`).join(',')
  return `
      WITH acum AS (${sqlCorpusAncla()}
      )
      SELECT a.scenario,
        percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY a.price_night)::numeric AS med,
        percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY a.price_night)::numeric AS flo,
        percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY a.price_night)::numeric AS cei,
        COUNT(DISTINCT a.checkin_date)::int AS fechas,
        BOOL_AND(a.fuente IN (${fiables})) AS corpus_fiable
      FROM acum a JOIN pricing_settings s ON s.property_id = a.scenario
      GROUP BY a.scenario, s.target_pctl, s.floor_pctl, s.ceil_pctl`
}

/**
 * Cuerpo de la consulta de COMPARABLES del ancla, en filas, para los consumidores que calculan su
 * propio percentil (el panel `pricing/settings`, vía `computeRecommendation`). Mismo corpus exacto
 * que el del motor.
 */
export function sqlCompsAncla(): string {
  return `
      WITH acum AS (${sqlCorpusAncla()}
      )
      SELECT a.scenario, a.price_night::float8 AS price, a.score::float8 AS score FROM acum a`
}

export type ValoresAncla = { med: number; flo: number; cei: number }

export type AnclaGlobalInput = {
  /** Percentiles sobre el corpus acumulado. `valores` a `null` = ese piso no tiene corpus. */
  acumulada: { valores: ValoresAncla | null; fechas: number }
  /** Percentiles del barrido de la última pasada útil. Respaldo, nunca se queda sin ancla. */
  pasada: ValoresAncla
}

export type AnclaGlobalResult = {
  valores: ValoresAncla
  /** De dónde salió. Viaja a la respuesta del motor: un ancla de barrido oscila y hay que verlo. */
  origen: 'acumulada' | 'pasada'
}

/**
 * Elige el ancla global. El corpus ACUMULADO manda siempre que cubra `MIN_FECHAS_ANCLA` fechas
 * distintas y dé un percentil utilizable; si no, se cae al barrido de la última pasada útil.
 *
 * 🚨 Nunca devuelve 0 ni NaN: un ancla a cero se propagaría al precio de TODAS las fechas sin
 * bucket de mes. El barrido es peor, pero es un precio de mercado real; el 0 es una avería servida
 * como dato.
 */
export function elegirAnclaGlobal(i: AnclaGlobalInput): AnclaGlobalResult {
  const a = i.acumulada.valores
  const util = a != null
    && [a.med, a.flo, a.cei].every(v => Number.isFinite(v) && v > 0)
    && i.acumulada.fechas >= MIN_FECHAS_ANCLA
  return util ? { valores: a!, origen: 'acumulada' } : { valores: i.pasada, origen: 'pasada' }
}
