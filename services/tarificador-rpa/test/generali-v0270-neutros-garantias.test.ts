// Generali auto v0.2.70 (trabajo a42d9628): obligatorios vacíos de «Garantías y Resultados» en valor NEUTRO antes del ÚNICO «Recalcular»; atasco con los aún vacíos.
// Fixtures SINTÉTICAS con la estructura del volcado redactado (sin valores).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, rellenarNeutrosGarantiasGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { decidirNeutroGarantiasGenerali, NEUTROS_GARANTIAS_GENERALI, resumenTrasRecalcularGenerali } from '../src/adapters/generali/reglas.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    return await fn(page)
  } finally { await context.close() }
}
const ctxCon = (pulsados: string[]) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => { pulsados.push(await l.evaluate((el) => el.getAttribute('name') ?? '')); await l.click() },
}) as unknown as ContextoPortal

const req = '<div class="trueInline required"><span> * </span></div>'
const radio = (name: string, rotulo: string, marcada: 'No' | 'Sí' | null) => {
  const id = name.replace(/\./g, '_')
  const op = (t: 'No' | 'Sí') => `<input type="radio" name="${name}" value="x"${marcada === t ? ' checked' : ''}> <span> ${t} </span>`
  return `<div class="falseInline simple" id="${id}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2">${op('No')}${op('Sí')}</div></div>`
}
const texto = (name: string, rotulo: string, valor: string, extra = '') => `<div class="falseInline simple" id="${name.replace(/\./g, '_')}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2"><input type="text" name="${name}" value="${valor}"${extra}></div></div>`
const [TALLERES, LUNAS, ABOGADO, RECARGO] = NEUTROS_GARANTIAS_GENERALI as [typeof NEUTROS_GARANTIAS_GENERALI[number], typeof NEUTROS_GARANTIAS_GENERALI[number], typeof NEUTROS_GARANTIAS_GENERALI[number], typeof NEUTROS_GARANTIAS_GENERALI[number]]
const PRIMA_MAX = texto('reg1063E.qprimx', 'Prima máxima a pagar por los Kilometros declarados', '', ' readonly')

test('v0.2.70 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.70'))

test('decisión pura: vacío → «No» exacto; ya marcado (también «Sí») → nada; rótulo distinto o sin «No» → error con nombre', () => {
  const op = (no: boolean, si: boolean) => [{ texto: 'No', marcada: no }, { texto: 'Sí', marcada: si }]
  assert.deepEqual(decidirNeutroGarantiasGenerali(TALLERES, { rotulo: TALLERES.rotulo, opciones: op(false, false), vacio: false, soloLectura: false }), { accion: 'marcar', indice: 0 })
  assert.deepEqual(decidirNeutroGarantiasGenerali(TALLERES, { rotulo: TALLERES.rotulo, opciones: op(false, true), vacio: false, soloLectura: false }), { accion: 'nada' })
  assert.deepEqual(decidirNeutroGarantiasGenerali(LUNAS, { rotulo: `${LUNAS.rotulo} *`, opciones: op(true, false), vacio: false, soloLectura: false }), { accion: 'nada' })
  const e1 = decidirNeutroGarantiasGenerali(ABOGADO, { rotulo: 'Otra pregunta', opciones: op(false, false), vacio: false, soloLectura: false })
  assert.equal(e1.accion, 'error')
  const e2 = decidirNeutroGarantiasGenerali(ABOGADO, { rotulo: ABOGADO.rotulo, opciones: [{ texto: 'Quizá', marcada: false }], vacio: false, soloLectura: false })
  assert.ok(e2.accion === 'error' && /«No»/.test(e2.motivo) && /Quizá/.test(e2.motivo))
  assert.deepEqual(decidirNeutroGarantiasGenerali(RECARGO, { rotulo: RECARGO.rotulo, opciones: [], vacio: true, soloLectura: false }), { accion: 'escribir', valor: '0' })
  assert.deepEqual(decidirNeutroGarantiasGenerali(RECARGO, { rotulo: RECARGO.rotulo, opciones: [], vacio: false, soloLectura: false }), { accion: 'nada' })
  assert.deepEqual(decidirNeutroGarantiasGenerali(RECARGO, { rotulo: RECARGO.rotulo, opciones: [], vacio: true, soloLectura: true }), { accion: 'nada' })
})

test('los neutros nunca incluyen «Prima máxima» (solo lectura del portal) y todos dejan aviso «Supuesto» (precio estimado)', () => {
  assert.ok(!NEUTROS_GARANTIAS_GENERALI.some((n) => /prima/i.test(n.rotulo) || /qprimx|qpr17m/.test(n.name)))
  for (const n of NEUTROS_GARANTIAS_GENERALI) assert.match(n.aviso, /^Supuesto: /)
})

test('pestaña con los cuatro vacíos: marca «No» en talleres/lunas/abogado, escribe 0 en recargo, no toca la prima máxima, 4 avisos', async () => {
  const pulsados: string[] = []
  const html = radio(TALLERES.name, TALLERES.rotulo, null) + radio(LUNAS.name, LUNAS.rotulo, null) + radio(ABOGADO.name, ABOGADO.rotulo, null) + texto(RECARGO.name, RECARGO.rotulo, '') + PRIMA_MAX
  await conPagina(html, async (p) => {
    const avisos = await rellenarNeutrosGarantiasGenerali(p, ctxCon(pulsados))
    assert.deepEqual(avisos, NEUTROS_GARANTIAS_GENERALI.map((n) => n.aviso))
    for (const n of [TALLERES, LUNAS, ABOGADO]) {
      assert.equal(await p.locator(`input[name="${n.name}"]`).nth(0).isChecked(), true, n.name)
      assert.equal(await p.locator(`input[name="${n.name}"]`).nth(1).isChecked(), false, n.name)
    }
    assert.equal(await p.locator(`input[name="${RECARGO.name}"]`).inputValue(), '0')
    assert.equal(await p.locator('input[name="reg1063E.qprimx"]').inputValue(), '')
  })
  assert.deepEqual(pulsados, [TALLERES.name, LUNAS.name, ABOGADO.name])
})

test('ya puestos por el portal (incluido «Sí» y un recargo con valor): no se pulsa ni se escribe nada, sin avisos', async () => {
  const pulsados: string[] = []
  const html = radio(TALLERES.name, TALLERES.rotulo, 'No') + radio(LUNAS.name, LUNAS.rotulo, 'Sí') + radio(ABOGADO.name, ABOGADO.rotulo, 'No') + texto(RECARGO.name, RECARGO.rotulo, '5,00')
  await conPagina(html, async (p) => {
    assert.deepEqual(await rellenarNeutrosGarantiasGenerali(p, ctxCon(pulsados)), [])
    assert.equal(await p.locator(`input[name="${LUNAS.name}"]`).nth(1).isChecked(), true)
    assert.equal(await p.locator(`input[name="${RECARGO.name}"]`).inputValue(), '5,00')
  })
  assert.deepEqual(pulsados, [])
})

test('rótulo cambiado en el portal: error que nombra el campo, sin pulsar', async () => {
  const pulsados: string[] = []
  await conPagina(radio(TALLERES.name, '¿Quieres algo distinto?', null), async (p) => {
    await assert.rejects(rellenarNeutrosGarantiasGenerali(p, ctxCon(pulsados)), (e) => e instanceof ErrorMapaIncompletoGenerali && /talleres Concertados/.test(e.message) && /algo distinto/.test(e.message))
  })
  assert.deepEqual(pulsados, [])
})

test('sin los bloques en la pestaña: no hace nada (no es error)', async () => {
  assert.deepEqual(await conPagina('<p>Garantías</p>', (p) => rellenarNeutrosGarantiasGenerali(p, ctxCon([]))), [])
})

test('tras Recalcular con «datos incompletos»: lista los obligatorios aún vacíos (saneados) y señala el paso anterior; sin ese aviso → null', () => {
  const r = resumenTrasRecalcularGenerali(['El paso anterior no tiene los datos completos'], ['Prima máxima a pagar por los Kilometros declarados *', 'Tomador 12345678Z'], ['Fecha carnet'])
  assert.ok(r)
  assert.match(r!, /aún vacíos en «Garantías y Resultados»: «Prima máxima a pagar por los Kilometros declarados»/)
  assert.match(r!, /\[doc\]/)
  assert.doesNotMatch(r!, /12345678Z/)
  assert.match(r!, /«Datos de Valoración»: «Fecha carnet»/)
  assert.match(r!, /apunta a «Datos de Valoración»/)
  assert.match(resumenTrasRecalcularGenerali(['No se puede calcular con datos incompletos'], [])!, /\(ninguno detectado\)/)
  assert.equal(resumenTrasRecalcularGenerali([], ['X']), null)
})

test('adaptador: un solo «Recalcular» por trabajo (el 2º de 0.2.63 lo abortaba el guard) y sin «aceptar» nuevo', () => {
  const src = readFileSync(new URL('../src/adapters/generali/auto.ts', import.meta.url), 'utf8')
  const tramo = src.slice(src.indexOf('const recalcularSiHaceFalta'), src.indexOf('const trasRecalcular = await recalcularSiHaceFalta()'))
  assert.ok(tramo.length > 0)
  assert.equal((tramo.match(/puerta\(\)/g) ?? []).length, 1)
  assert.doesNotMatch(tramo, /Recalcular×2/)
  const llamada = tramo.search(/const neutros = await rellenarNeutrosGarantiasGenerali\(page, ctx\)/)
  assert.ok(llamada >= 0 && llamada < tramo.indexOf('puerta()'), 'los neutros se rellenan ANTES del único «Recalcular»')
  assert.ok(llamada < tramo.indexOf('elegirSumaAbogadoVisibleGenerali'), 'reducir abogado = «No» antes de elegir la suma')
  assert.match(tramo, /\.\.\.neutros/)
})
