import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VENTANA_ANCLA_DIAS, MIN_FECHAS_ANCLA, FUENTES_FIABLES_ANCLA,
  sqlCorpusAncla, sqlAnclaGlobalAcumulada, sqlCompsAncla, elegirAnclaGlobal,
} from './pricing-ancla-global.ts'
import { MIN_EUR_PLAZA_COMP } from './pricing-comps-plausibles.ts'

// ─── El invariante que se violaba: el ancla NO puede salir de UNA pasada ────────────────────
// Este test lee el FUENTE del motor a propósito (mismo patrón que cols-subasta.test.ts y
// lector-registral-enrutado.test.ts): ni `tsc` ni `next build` miran dentro de un `Prisma.sql`,
// y el bug vivía justo ahí — `med_guest_global` salía de `mkt`, el percentil del barrido de esa
// mañana. Si alguien vuelve a colgarlo del barrido, esto se pone rojo.
test('el ancla global del motor NO sale del barrido de una sola pasada', () => {
  const fuente = readFileSync(new URL('../../app/api/sivra/pricing/apply/route.ts', import.meta.url), 'utf8')
  assert.ok(fuente.includes('sqlAnclaGlobalAcumulada()'), 'el motor debe montar el CTE del ancla acumulada')
  assert.ok(fuente.includes('elegirAnclaGlobal({'), 'la elección del ancla vive en el helper testeado, no en el SQL')
})

test('ninguna columna del ancla global se sirve del percentil del barrido', () => {
  // El bug era literalmente `ROUND(mkt.med)::int AS med_guest_global` (y sus dos hermanas
  // floor_guest/ceil_guest): `mkt` es el percentil de UNA pasada. Si alguien vuelve a cablear el
  // ancla, el suelo o el techo globales ahí, esto se pone rojo.
  const fuente = readFileSync(new URL('../../app/api/sivra/pricing/apply/route.ts', import.meta.url), 'utf8')
  for (const col of ['med_guest_global', 'AS floor_guest', 'AS ceil_guest']) {
    assert.ok(!fuente.includes(col), `${col} salía del barrido de una pasada; ya no debe existir`)
  }
  // Y el respaldo tiene que seguir declarándose como lo que es.
  assert.ok(fuente.includes('AS med_pasada'), 'el barrido sigue viajando, pero con su nombre')
})

test('los tres consumidores del ancla leen el mismo corpus, no el barrido', () => {
  // settings = el panel del propietario; pilot-track = el vigía que juzga el precio aplicado. Los
  // dos calculaban su recomendado sobre el barrido del día. Con el motor anclado al corpus
  // acumulado, eso los deja midiendo contra una referencia que nadie usa: el panel enseñaría otro
  // número y el vigía pintaría rojos inexistentes.
  for (const ruta of ['settings', 'pilot-track']) {
    const src = readFileSync(new URL(`../../app/api/sivra/pricing/${ruta}/route.ts`, import.meta.url), 'utf8')
    assert.ok(src.includes('sqlCompsAncla()'), `${ruta} debe leer el corpus del ancla`)
    assert.ok(!src.includes('sqlUltimaPasadaUtil'), `${ruta} seguía leyendo el barrido de una pasada`)
  }
})

// ─── El SQL ─────────────────────────────────────────────────────────────────────────────────
test('el ancla acumulada deduplica por comparable × fecha y se queda la lectura MÁS RECIENTE', () => {
  const sql = sqlCorpusAncla()
  // Sin el DISTINCT ON, un comparable medido 20 mañanas seguidas pesa 20 veces en el percentil y
  // el ancla vuelve a describir el barrido en vez del mercado.
  assert.match(sql, /DISTINCT ON \(m\.scenario, m\.checkin_date, m\.comp_name\)/)
  assert.match(sql, /ORDER BY m\.scenario, m\.checkin_date, m\.comp_name, m\.search_date DESC/)
})

test('el ancla acumulada mira una VENTANA de días, no una sola search_date', () => {
  assert.match(sqlCorpusAncla(), new RegExp(`search_date >= CURRENT_DATE - ${VENTANA_ANCLA_DIAS}`))
  // El barrido de la mañana muestreaba 6-7 fechas de las ~110 del horizonte, y cada mañana otras:
  // de ahí el serrucho. Solo fechas por venir: el ancla tarifa el futuro.
  assert.match(sqlCorpusAncla(), /checkin_date >= CURRENT_DATE/)
})

test('el ancla acumulada hereda las dos guardas del corpus del motor', () => {
  const sql = sqlCorpusAncla()
  // Plausibilidad €/plaza: una habitación vestida de piso entero hunde el percentil del piso grande.
  assert.match(sql, new RegExp(`price_night >= ${MIN_EUR_PLAZA_COMP} \\* m\\.guests`))
  // Corpus clonado: pasadas que devolvían el MISMO precio para fechas distintas = estacionalidad
  // inventada. Fuera, igual que en el bucket del mes.
  assert.match(sql, /NOT m\.corpus_clonado/)
})

test('el SQL no interpola nada de fuera (va a Prisma.raw)', () => {
  for (const f of [sqlCorpusAncla, sqlAnclaGlobalAcumulada, sqlCompsAncla]) {
    assert.equal(f.length, 0, `${f.name} no debe aceptar argumentos`)
    assert.doesNotMatch(f(), /\$\{|\$\d/, `${f.name}: sin marcadores de parámetro`)
  }
})

// ─── Una sola definición del corpus, dos formas de leerla ───────────────────────────────────
test('el motor y el panel leen EXACTAMENTE el mismo corpus', () => {
  // El panel calcula su propio percentil sobre filas y el motor lo pide agregado a Postgres. Si
  // cada uno definiera su corpus, el panel enseñaría un recomendado que el motor no usa — que es
  // el fallo de «alarma y panel afirmando lo contrario sobre el mismo hecho» (PR #1575).
  const corpus = sqlCorpusAncla()
  assert.ok(sqlAnclaGlobalAcumulada().includes(corpus), 'el CTE del motor debe montar sqlCorpusAncla()')
  assert.ok(sqlCompsAncla().includes(corpus), 'la consulta del panel debe montar sqlCorpusAncla()')
})

test('la preferencia de fuente vive SOLO en el corpus, no repetida en cada consumidor', () => {
  // Si la regla fiable-vs-mezcla se escribiera también en el agregado o en las filas, las dos
  // copias derivarían: es justo lo que pasó con las tres listas de subcategorías (07/07/2026).
  const fiables = FUENTES_FIABLES_ANCLA.map(f => `'${f}'`).join(',')
  const corpus = sqlCorpusAncla()
  assert.match(corpus, new RegExp(`f\\.n >= ${MIN_FECHAS_ANCLA} AND d\\.fuente IN \\(${fiables}\\)`))
  assert.match(corpus, new RegExp(`OR f\\.n < ${MIN_FECHAS_ANCLA}`),
    'sin corpus fiable suficiente se usa la mezcla: la preferencia nunca deja a un piso sin ancla')
  // Fuera del corpus, `fuente` solo puede aparecer para DECLARAR de dónde salió (corpus_fiable).
  const soloAgregado = sqlAnclaGlobalAcumulada().replace(corpus, '')
  assert.doesNotMatch(soloAgregado, new RegExp(`f\\.n|${MIN_FECHAS_ANCLA}`),
    'el agregado no puede re-aplicar el umbral de fuente')
  assert.match(soloAgregado, /BOOL_AND\(a\.fuente IN/, 'pero sí debe declarar si el corpus salió fiable')
  assert.equal(sqlCompsAncla().replace(corpus, '').includes(String(MIN_FECHAS_ANCLA)), false)
})

// ─── La elección ────────────────────────────────────────────────────────────────────────────
const PASADA = { med: 208, flo: 150, cei: 300 }

test('con fechas suficientes manda el ancla acumulada', () => {
  const r = elegirAnclaGlobal({
    acumulada: { valores: { med: 140, flo: 100, cei: 190 }, fechas: 113 },
    pasada: PASADA,
  })
  assert.equal(r.origen, 'acumulada')
  assert.equal(r.valores.med, 140)
})

test('un ancla acumulada de POCAS fechas no es mejor que el barrido: se cae a la pasada', () => {
  // El barrido daba 6-7 fechas. Si el corpus acumulado no supera con holgura eso, no aporta la
  // diversidad que es toda la razón de este cambio — y entonces mentir sobre su origen es peor.
  const r = elegirAnclaGlobal({
    acumulada: { valores: { med: 140, flo: 100, cei: 190 }, fechas: MIN_FECHAS_ANCLA - 1 },
    pasada: PASADA,
  })
  assert.equal(r.origen, 'pasada')
  assert.deepEqual(r.valores, PASADA)
})

test('sin corpus acumulado se cae a la pasada, NUNCA a cero', () => {
  // Un ancla a 0 se propagaría al precio de todas las fechas sin bucket de mes. La pasada es peor
  // pero es un precio de mercado; el 0 es una avería servida como dato.
  for (const acumulada of [
    { valores: null, fechas: 0 },
    { valores: { med: 0, flo: 0, cei: 0 }, fechas: 113 },
    { valores: { med: Number.NaN, flo: 100, cei: 190 }, fechas: 113 },
  ] as const) {
    const r = elegirAnclaGlobal({ acumulada, pasada: PASADA })
    assert.equal(r.origen, 'pasada', `no debería usarse ${JSON.stringify(acumulada)}`)
    assert.deepEqual(r.valores, PASADA)
  }
})

test('el umbral de fechas distingue de verdad el barrido del corpus acumulado', () => {
  // Medido el 27/08/2026: el barrido daba 6-7 fechas por piso; el acumulado de 30 días, 73-119.
  // Un umbral por debajo de 7 dejaría pasar al barrido disfrazado de corpus.
  assert.ok(MIN_FECHAS_ANCLA > 7, 'el umbral tiene que dejar fuera al barrido de una mañana')
  assert.ok(MIN_FECHAS_ANCLA <= 65, 'y no puede ser tan alto que ningún piso lo alcance')
})
