// Mapfre HOGAR v0.3.3 · pantalla #/emision-hogar/modalidades. HTML SINTÉTICO (sin PII; importes ficticios) con las clases del volcado real.
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
  leerModalidadesDom,
  primasDesdeSnapshot,
  primerReciboDe,
  type CeldaSnap,
  type SnapshotModalidades,
} from '../src/adapters/mapfre/hogar-modalidades.ts'
import { mapfreHogar, ofertasDesdePrimasHogar } from '../src/adapters/mapfre/hogar.ts'

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

test('0.3.3 · versión', () => assert.equal(mapfreHogar.version, '0.3.3'))

test('0.3.3 · pura: tarjetas → primas; omite tarifa no aplicable; 1ª cuota = primer recibo', () => {
  const p = primasDesdeSnapshot(SNAP())
  assert.deepEqual(p.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [['HOGAR TÚ ELIGES', 100.5, 10], ['HOGAR FAMILIAR', 1234.56, 10]])
})

test('0.3.3 · pura: nombre desconocido, prima ilegible o repetida → fuera (fail-closed)', () => {
  const s = SNAP()
  s.tarjetas = [tarjeta('HOGAR RARO', '10,00 €'), tarjeta('HOGAR FAMILIAR', 'sin precio'), tarjeta('HOGAR FAMILIAR', '50,00 €'), tarjeta('HOGAR FAMILIAR', '60,00 €')]
  assert.deepEqual(primasDesdeSnapshot(s).map((x) => x.primaAnualEur), [50])
  assert.deepEqual(primasDesdeSnapshot({ tarjetas: [], filas: [], modales: [] }), [])
})

test('0.3.3 · pura: primer recibo solo con 1ª CUOTA y periodicidad anual', () => {
  assert.equal(primerReciboDe(tarjeta('x', 'y')), 10)
  assert.equal(primerReciboDe(tarjeta('x', 'y', { recuadro: 'Mensual', cuotas: [{ k: 'l', t: '1ª CUOTA' }, { k: 'i', t: '10,00 €' }] })), null)
  assert.equal(primerReciboDe(tarjeta('x', 'y', { cuotas: [{ k: 'l', t: 'SIGUIENTES (0)' }, { k: 'i', t: '5,00 €' }] })), null)
})

test('0.3.3 · garantías: cada fila se cruza con la columna de su modalidad', () => {
  const p = primasDesdeSnapshot(SNAP())
  assert.deepEqual(p[0]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 30000], ['Daños por agua', 'excluida', null]])
  assert.deepEqual(p[1]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 45000], ['Daños por agua', 'incluida', null]])
  const o = ofertasDesdePrimasHogar(p)
  assert.equal(o[0]!.coberturas.length, 2)
  assert.ok(o[0]!.avisos.some((a) => /leídos de la pantalla de modalidades/.test(a)))
})

test('0.3.3 · garantías: fila sin asignar o con nº de celdas distinto → aviso, nunca «No incluida» inventada', () => {
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

test('0.3.3 · modal de controles técnicos → aviso genérico sin datos personales', () => {
  const s = SNAP()
  assert.equal(hayControlesTecnicos(s), false)
  s.modales = ['CONTROLES TÉCNICOS Se han detectado controles… CERRAR']
  assert.equal(hayControlesTecnicos(s), true)
  const p = primasDesdeSnapshot(s)
  assert.ok(p.every((x) => x.avisos!.includes(AVISO_CONTROLES_TECNICOS)))
  assert.ok(ofertasDesdePrimasHogar(p)[0]!.avisos.includes(AVISO_CONTROLES_TECNICOS))
})

// ── DOM real (Chromium) con HTML sintético ──
const col = (inner: string) => `<div class="col-md-4">${inner}</div>`
const HTML = `<html><body>
<div class="modal in"><div class="modal-dialog"><h4>CONTROLES TÉCNICOS</h4><button>CERRAR</button></div></div>
${[['HOGAR TÚ ELIGES', '100,50 €', true], ['HOGAR FAMILIAR', '1.234,56 €', true], ['HOGAR PLATINO', '300,00 €', false]].map(([n, p, ok]) => `
<div ng-repeat="modalidades in pchctrl.modalidadesCoberturas"><div heading="x">
  <span class="cabecera-modalidad texto-modalidad">  ${n} </span><span class="cabecera-modalidad importe">${p}</span>
  <div class="tarifa-no-aplicable ${ok ? 'ng-hide' : ''}">ESTA TARIFA NO ES APLICABLE</div>
  <div class="recuadro-cuotas">Anual <span class="label-cuota">1ª CUOTA</span><span class="importeCuota">10,00 €</span><span class="label-cuota">SIGUIENTES (0)</span><span class="importeCuota">0,00 €</span></div>
</div></div>`).join('')}
<div class="row"><div class="col-md-3"><span class="titulo-cobertura">Incendio</span></div>
  <div class="col-md-9">${col('<button class="select-importe">30.000 €</button>')}${col('<label class="texto-importe">45.000 €</label>')}${col('<button class="select-importe">60.000 €</button>')}</div></div>
<div class="row"><div class="col-md-3"><span class="titulo-garantia">Daños por agua</span></div>
  <div class="col-md-9">${col('<span class="cobertura-no-contratada">No contratada</span><span class="cobertura-no-modificable ng-hide">x</span>')}${col('<span class="cobertura-no-contratada ng-hide">No contratada</span><span class="switch_checkbox"><input type="checkbox" checked></span>')}${col('<span class="texto-adicional-cobertura">Incluida</span>')}</div></div>
<div class="row"><div class="col-md-3"><span class="titulo-garantia">Fila rara</span></div><div class="col-md-9">${col('a')}</div></div>
</body></html>`

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

test('0.3.3 · DOM: lee tarjetas, garantías por columna, ng-hide y el modal sin pulsar nada', async () => {
  const page = await browser!.newPage()
  try {
    await page.setContent(HTML)
    const { primas, error } = await leerModalidadesDom(page)
    assert.equal(error, null)
    assert.deepEqual(primas.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [['HOGAR TÚ ELIGES', 100.5, 10], ['HOGAR FAMILIAR', 1234.56, 10]])
    assert.deepEqual(primas[0]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 30000], ['Daños por agua', 'excluida', null]])
    assert.deepEqual(primas[1]!.coberturas!.map((c) => [c.literal, c.estado, c.capital]), [['Incendio', 'incluida', 45000], ['Daños por agua', 'incluida', null]])
    assert.ok(primas[0]!.avisos!.includes(AVISO_CONTROLES_TECNICOS))
    assert.ok(primas[0]!.avisos!.some((a) => /1 fila/.test(a)), 'la fila con 1 celda queda sin asignar')
    assert.equal(await page.locator('.modal.in').count(), 1, 'no se cerró el modal')
  } finally { await page.close() }
})

test('0.3.3 · DOM: error del evaluate se devuelve, no se traga', async () => {
  const page = await browser!.newPage()
  try {
    await page.close()
    const r = await leerModalidadesDom(page)
    assert.deepEqual(r.primas, [])
    assert.ok(r.error && r.error.length > 0)
  } finally { /* ya cerrada */ }
})
