import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { anclaRail, topeRealSinAncla, avisoRailCiego } from './pricing-ancla-rail.ts'
import { PASADAS_POR_DIA_APPLY } from './pricing-latido-apply.ts'

test('con precio de ayer, ése es el ancla', () => {
  assert.equal(anclaRail({ ref24: 312, primeroHoy: 250, actual: 250 }), 312)
})

test('sin precio de ayer, ancla el precio con el que la fecha empezó el día', () => {
  // Fecha nunca escrita (las 16 de House Sevillana de jun-ago 2027, 19/08/2026): no hay ref24,
  // pero sí sabemos a cuánto llegó la fecha a la primera pasada.
  assert.equal(anclaRail({ ref24: null, primeroHoy: 635, actual: 508 }), 635)
})

test('en la primera pasada del día el ancla es el precio vivo', () => {
  assert.equal(anclaRail({ ref24: null, primeroHoy: null, actual: 180 }), 180)
})

test('el retoque manual en Smoobu no ensancha el raíl del motor', () => {
  // Si alguien sube un precio a mano, `primeroHoy` lo recoge y `ref24` no. El contrato es
  // "±X% respecto a lo que aplicó el MOTOR ayer", así que manda ref24.
  assert.equal(anclaRail({ ref24: 100, primeroHoy: 400, actual: 400 }), 100)
})

test('un ancla a 0 o negativa se descarta en vez de dejar el precio en 0€', () => {
  assert.equal(anclaRail({ ref24: 0, primeroHoy: 250, actual: 200 }), 250)
  assert.equal(anclaRail({ ref24: -5, primeroHoy: 0, actual: 200 }), 200)
  assert.equal(anclaRail({ ref24: null, primeroHoy: NaN, actual: 200 }), 200)
})

test('el tope del día deja de multiplicarse entre pasadas', () => {
  // El fallo real del 19/08/2026: Busto Reform 18/09, tres pasadas con max_change_pct=0,20.
  // Antes cada pasada anclaba en la anterior (312 -> 250 -> 200 -> 160: -49% en un día).
  const PCT = 0.2
  const suelo = (ancla: number) => Math.round(ancla * (1 - PCT))

  const ayer = 312
  let primeroHoy: number | null = null
  let vivo = 312
  const escritos: number[] = []

  for (let pasada = 0; pasada < 3; pasada++) {
    if (primeroHoy === null) primeroHoy = vivo // old_price de la primera pasada
    const objetivoAgresivo = 50 // el mercado pide mucho menos: el raíl es lo único que frena
    const precio = Math.max(objetivoAgresivo, suelo(anclaRail({ ref24: ayer, primeroHoy, actual: vivo })))
    escritos.push(precio)
    vivo = precio
  }

  assert.deepEqual(escritos, [250, 250, 250])
  assert.ok(escritos.at(-1)! >= suelo(ayer), 'el día entero no puede pasar de -20% sobre ayer')
})

test('sin histórico el tope del día también aguanta', () => {
  const PCT = 0.2
  const suelo = (ancla: number) => Math.round(ancla * (1 - PCT))

  let primeroHoy: number | null = null
  let vivo = 635
  const escritos: number[] = []

  for (let pasada = 0; pasada < 3; pasada++) {
    if (primeroHoy === null) primeroHoy = vivo
    const precio = Math.max(50, suelo(anclaRail({ ref24: null, primeroHoy, actual: vivo })))
    escritos.push(precio)
    vivo = precio
  }

  assert.deepEqual(escritos, [508, 508, 508])
})

// ── 🔴 3 de la auditoría del 23/08/2026: el raíl ciego ────────────────────────

test('el tope real sin ancla se calcula, no se escribe a mano', () => {
  // Con el 20% y 3 pasadas es el −49%/+73% que documenta la cabecera del módulo.
  const t = topeRealSinAncla(0.20, 3)
  assert.equal(t.caidaPct, 48.8)
  assert.equal(t.subidaPct, 72.8)
})

test('con UNA sola pasada al día el tope real ES el tope declarado', () => {
  // La prueba de que la fórmula no inventa: sin pasadas que componer no hay ensanchamiento.
  const t = topeRealSinAncla(0.20, 1)
  assert.equal(t.caidaPct, 20)
  assert.equal(t.subidaPct, 20)
})

test('el tope se adapta al max_change_pct del piso', () => {
  // Por eso se calcula: `max_change_pct` es POR PISO. Un número hardcodeado mentiría para el resto.
  assert.equal(topeRealSinAncla(0.10, 3).caidaPct, 27.1)
  assert.equal(topeRealSinAncla(0.10, 3).subidaPct, 33.1)
})

test('sin fallos de lectura NO hay aviso', () => {
  assert.equal(avisoRailCiego([], { maxChangePct: 0.20, pasadasPorDia: 3 }), null)
})

test('🚨 el aviso dice que NO tarificar es lo CORRECTO, no una avería', () => {
  // Si no lo dice, «no se ha tarificado» se lee como motor roto y alguien lo «arregla» quitando
  // la salvaguarda — que es exactamente el agujero que esto cierra.
  const txt = avisoRailCiego(
    [{ nombre: 'ref24', error: '42883 date - bigint' }],
    { maxChangePct: 0.20, pasadasPorDia: 3 },
  )
  assert.ok(txt)
  assert.match(txt, /es lo correcto/)
  assert.match(txt, /Los precios se quedan como estaban/)
  assert.match(txt, /−48\.8% \/ \+72\.8%/)
  assert.match(txt, /42883 date - bigint/, 'el error real viaja al aviso')
})

test('el aviso lista TODAS las lecturas caídas', () => {
  const txt = avisoRailCiego(
    [{ nombre: 'ref24', error: 'timeout' }, { nombre: 'anclaHoy', error: 'ECONNRESET' }],
    { maxChangePct: 0.20, pasadasPorDia: 3 },
  )
  assert.ok(txt)
  assert.match(txt, /ref24: timeout/)
  assert.match(txt, /anclaHoy: ECONNRESET/)
})

test('🚨 PASADAS_POR_DIA sigue cuadrando con el cron real', () => {
  // El aviso cifra el ensanchamiento con este número. Si alguien añade una 4ª pasada a
  // `cron-dispatch.ts` y esto no se actualiza, el aviso subestima el daño — y un aviso con un
  // número falso es peor que uno sin número. Se lee el FUENTE porque el manifiesto no es importable.
  const src = readFileSync(new URL('../cron-dispatch.ts', import.meta.url), 'utf8')
  const linea = src.split('\n').find(l => l.includes('/api/sivra/pricing/apply-auto'))
  assert.ok(linea, 'el job apply-auto sigue en CRON_JOBS')
  const horas = /schedule:\s*'\s*\d+\s+([\d,]+)/.exec(linea)?.[1]
  assert.ok(horas, `no se pudo leer el horario de: ${linea}`)
  assert.equal(horas.split(',').length, PASADAS_POR_DIA_APPLY,
    `el cron corre ${horas.split(',').length} veces/día y el aviso asume ${PASADAS_POR_DIA_APPLY}`)
})
