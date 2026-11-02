// Mapfre HOGAR v0.3.4 · pantalla #/emision-hogar/modalidades. HTML SINTÉTICO reducido (sin PII; importes ficticios) con las clases/ids del volcado real.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import {
  AVISO_CONTROLES_TECNICOS,
  coberturaDeCelda,
  coberturasPorModalidad,
  hayControlesTecnicos,
  modalidadesAsentadas,
  leerModalidadesDom,
  primasDesdeSnapshot,
  primerReciboDe,
  type CeldaSnap,
  type SnapshotModalidades,
} from '../src/adapters/mapfre/hogar-modalidades.ts'
import { mapfreHogar, ofertasDesdePrimasHogar } from '../src/adapters/mapfre/hogar.ts'
import { card, pantalla } from './mapfre-hogar-modalidades-fixture.ts'

const celda = (o: Partial<CeldaSnap> = {}): CeldaSnap => ({ noContratada: false, noModificable: false, adicional: '', importes: [], switchOn: null, ...o })
const tarjeta = (nombre: string, prima: string, o: Partial<SnapshotModalidades['tarjetas'][number]> = {}): SnapshotModalidades['tarjetas'][number] => ({
  nombre, prima, noAplicable: false, recuadro: 'Anual 1ª CUOTA SIGUIENTES (0)',
  cuotas: [{ k: 'l', t: '1ª CUOTA' }, { k: 'i', t: '10,00 €' }, { k: 'l', t: 'SIGUIENTES (0)' }, { k: 'i', t: '0,00 €' }], ...o,
})
const SNAP = (): SnapshotModalidades => ({
  tarjetas: [tarjeta('HOGAR TÚ ELIGES', '100,50 €'), tarjeta('HOGAR FAMILIAR', '1.234,56 €'), tarjeta('HOGAR PLATINO', '300,00 €', { noAplicable: true })],
  filas: [
    { titulo: 'Incendio', celdas: [celda({ importes: ['30.000 €'] }), celda({ importes: ['45.000 €'] }), celda({ importes: ['60.000 €'] })] },
    { titulo: 'Daños por agua', celdas: [celda({ noContratada: true }), celda({ switchOn: true }), celda({ adicional: 'Incluida' })] },
  ],
  modales: [],
})

test('0.3.4 · versión', () => assert.equal(mapfreHogar.version, '0.3.4'))

test('0.3.4 · pura: tarjetas → primas; omite tarifa no aplicable; 1ª cuota = primer recibo', () => {
  const p = primasDesdeSnapshot(SNAP())
  assert.deepEqual(p.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [['HOGAR TÚ ELIGES', 100.5, 10], ['HOGAR FAMILIAR', 1234.56, 10]])
})

test('0.3.4 · pura: nombre desconocido, prima ilegible o repetida → fuera (fail-closed)', () => {
  const s = SNAP()
  s.tarjetas = [tarjeta('HOGAR RARO', '10,00 €'), tarjeta('HOGAR FAMILIAR', 'sin precio'), tarjeta('HOGAR FAMILIAR', '50,00 €'), tarjeta('HOGAR FAMILIAR', '60,00 €')]
  assert.deepEqual(primasDesdeSnapshot(s).map((x) => x.primaAnualEur), [50])
  assert.deepEqual(primasDesdeSnapshot({ tarjetas: [], filas: [], modales: [] }), [])
})

test('0.3.4 · pura: primer recibo solo con 1ª CUOTA y periodicidad anual', () => {
  assert.equal(primerReciboDe(tarjeta('x', 'y')), 10)
  assert.equal(primerReciboDe(tarjeta('x', 'y', { recuadro: 'Mensual', cuotas: [{ k: 'l', t: '1ª CUOTA' }, { k: 'i', t: '10,00 €' }] })), null)
  assert.equal(primerReciboDe(tarjeta('x', 'y', { cuotas: [{ k: 'l', t: 'SIGUIENTES (0)' }, { k: 'i', t: '5,00 €' }] })), null)
})

test('0.3.4 · garantías: cada fila se cruza con la columna de su modalidad', () => {
  const p = primasDesdeSnapshot(SNAP())
  assert.deepEqual(p[0]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 30000], ['Daños por agua', 'excluida', null]])
  assert.deepEqual(p[1]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 45000], ['Daños por agua', 'incluida', null]])
  const o = ofertasDesdePrimasHogar(p)
  assert.equal(o[0]!.coberturas.length, 2)
  assert.ok(o[0]!.avisos.some((a) => /leídos de la pantalla de modalidades/.test(a)))
})

test('0.3.4 · garantías: fila sin asignar o con nº de celdas distinto → aviso, nunca «No incluida» inventada', () => {
  const s = SNAP()
  s.filas.push({ titulo: 'Robo', celdas: [] }, { titulo: 'Cristales', celdas: [celda({ noContratada: true })] })
  const { porColumna, sinAsignar } = coberturasPorModalidad(s.filas, 3)
  assert.equal(sinAsignar, 2)
  assert.ok(porColumna.every((c) => c.every((x) => x.literal !== 'Robo' && x.literal !== 'Cristales')))
  assert.ok(primasDesdeSnapshot(s)[0]!.avisos!.some((a) => /incompletas/.test(a)))
  assert.equal(coberturaDeCelda('X', celda({ noModificable: true })), null)
  assert.equal(coberturaDeCelda('X', celda({ switchOn: false })), null)
  assert.equal(coberturaDeCelda('', celda({ noContratada: true })), null)
})

test('0.3.4 · modal de controles técnicos → aviso genérico sin datos personales', () => {
  const s = SNAP()
  assert.equal(hayControlesTecnicos(s), false)
  s.modales = ['CONTROLES TÉCNICOS Se han detectado controles… CERRAR']
  assert.equal(hayControlesTecnicos(s), true)
  const p = primasDesdeSnapshot(s)
  assert.ok(p.every((x) => x.avisos!.includes(AVISO_CONTROLES_TECNICOS)))
  assert.ok(ofertasDesdePrimasHogar(p)[0]!.avisos.includes(AVISO_CONTROLES_TECNICOS))
})

// ── DOM real (Chromium) con HTML sintético de la estructura real (ver mapfre-hogar-modalidades-fixture.ts) ──
let browser: Browser | undefined
before(async () => {
  try { browser = await chromium.launch({ headless: true }) } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => browser?.close())

const resumen = (c: { literal: string; estado: string | null; capital: number | null }) => [c.literal, c.estado, c.capital]

test('0.3.4 · DOM real: TRES ofertas con su prima, 1ª cuota y garantías por columna; 0 filas sin asignar', async () => {
  const page = await browser!.newPage()
  try {
    await page.setContent(pantalla())
    const { primas, error, asentada, tarjetas } = await leerModalidadesDom(page)
    assert.equal(error, null)
    assert.equal(tarjetas, 3)
    assert.equal(asentada, true)
    assert.deepEqual(primas.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [['HOGAR TÚ ELIGES', 100.5, 100.5], ['HOGAR FAMILIAR', 200, 200], ['HOGAR PLATINO', 300.25, 300.25]])
    for (const p of primas) assert.ok(!(p.avisos ?? []).some((a) => /no se pudieron asignar/.test(a)), 'ninguna fila sin asignar')
    // 5 filas principales; «Sin todo riesgo» (interruptor apagado) y el desglose plegado no tienen evidencia → no se informan.
    assert.deepEqual(primas[0]!.coberturas!.map(resumen), [['JOYAS', 'excluida', null], ['RESPONSABILIDAD CIVIL', 'incluida', 60000], ['ASISTENCIA URGENTE', 'incluida', null], ['CONSORCIO', 'incluida', 94875.76]])
    assert.deepEqual(primas[1]!.coberturas!.map(resumen).find((r) => r[0] === 'JOYAS'), ['JOYAS', 'incluida', 1500])
    assert.deepEqual(primas[2]!.coberturas!.map(resumen).find((r) => r[0] === 'RESPONSABILIDAD CIVIL'), ['RESPONSABILIDAD CIVIL', 'incluida', 300000])
    assert.equal(primas.map((p) => p.coberturas!.length).join(','), '4,4,4')
    const o = ofertasDesdePrimasHogar(primas)
    assert.equal(o.length, 3)
    assert.ok(o.every((x) => x.avisos.some((a) => /leídos de la pantalla de modalidades/.test(a)) && !x.avisos.some((a) => /sin mapear/.test(a))))
  } finally { await page.close() }
})

test('0.3.4 · DOM real: interruptor apagado (checkbox oculto, label visible): el importe no prueba nada', async () => {
  const page = await browser!.newPage()
  try {
    await page.setContent(pantalla())
    await page.evaluate(() => { const i = document.querySelector('#toggle_combo_checkbox_cobertura_1_1') as HTMLInputElement; i.checked = false })
    const apagado = (await leerModalidadesDom(page)).primas[1]!.coberturas!.find((c) => c.literal === 'JOYAS')
    assert.equal(apagado, undefined, 'interruptor apagado: el importe visible no prueba nada')
  } finally { await page.close() }
})

test('0.3.4 · DOM real: pantalla a medio calcular (solo una tarjeta con prima) NO está asentada; terminada, sí', async () => {
  const page = await browser!.newPage()
  try {
    const a = card(0, 'HOGAR TÚ ELIGES', '- €', '- €') + card(1, 'HOGAR FAMILIAR', '- €', '- €') + card(2)
    await page.setContent(pantalla({ cards: a }))
    const parcial = await leerModalidadesDom(page)
    assert.deepEqual(parcial.primas.map((x) => x.modalidad), ['HOGAR PLATINO'])
    assert.equal(parcial.asentada, false, 'dos de tres tarjetas aún sin calcular')
    await page.setContent(pantalla())
    assert.equal((await leerModalidadesDom(page)).asentada, true)
  } finally { await page.close() }
})

test('0.3.4 · DOM real: títulos y celdas que no cuadran → todas sin asignar (aviso con el nº), nunca garantías inventadas', async () => {
  const page = await browser!.newPage()
  try {
    await page.setContent(pantalla().replace('<div class="col-md-12 recuadro-coberturas descripcion"><div class="col-md-1 descripcionMas">+</div><div title="JOYAS" class="col-md-11 titulo-cobertura ng-binding">JOYAS</div></div>', ''))
    const { primas } = await leerModalidadesDom(page)
    assert.equal(primas.length, 3)
    assert.ok(primas.every((p) => p.coberturas!.length === 0 && p.avisos!.some((a) => /6 fila\(s\)/.test(a))))
    assert.ok(ofertasDesdePrimasHogar(primas)[0]!.avisos.some((a) => /no mostró garantías con evidencia/.test(a)))
  } finally { await page.close() }
})

test('0.3.4 · pura: capital 0 y check «no modificable» (incluida de serie)', () => {
  assert.equal(coberturaDeCelda('X', celda({ importes: ['0,00 €'] })), null)
  assert.deepEqual(coberturaDeCelda('X', celda({ noModificable: true, conCheck: true }))?.estado, 'incluida')
  assert.equal(coberturaDeCelda('X', celda({ switchOn: false, importes: ['3.000,00 €'] })), null)
  assert.equal(modalidadesAsentadas({ tarjetas: [tarjeta('a', '1,00 €'), tarjeta('b', '2,00 €', { noAplicable: true })] }), true)
  assert.equal(modalidadesAsentadas({ tarjetas: [tarjeta('a', '1,00 €'), tarjeta('b', '- €', { cuotas: [] })] }), false)
  assert.equal(modalidadesAsentadas({ tarjetas: [] }), false)
})

test('0.3.4 · DOM: error del evaluate se devuelve, no se traga', async () => {
  const page = await browser!.newPage()
  try {
    await page.close()
    const r = await leerModalidadesDom(page)
    assert.deepEqual(r.primas, [])
    assert.ok(r.error && r.error.length > 0)
  } finally { /* ya cerrada */ }
})
