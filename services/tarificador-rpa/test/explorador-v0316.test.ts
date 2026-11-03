// Explorador 0.3.16 (29/10/2026) · el EXTRACTOR del navegador captura el onclick COMPLETO (hasta 2000) de avances y casillas.
// Mapfre NSE: «Siguiente >>» (<a>) con `A4J.AJAX.Submit('formProductos',…` de más de 200 car. llegaba recortado → onclick_truncado.
// Fixtures sintéticas, sin PII.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { bloqueoAvance, conOnclickCompleto, ONCLICK_REDACTADO, type ElementoInventario } from '@central/module-tarificacion'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'

const MF = 'mapfre:automoviles:patinetes'
let browser: Browser
before(async () => {
  // Sin red: el navegador no sale a ningún sitio (setContent). Mismo arranque que explorador-v032 (binario local si falta el de la versión).
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

const a4j = (n: number, fin = '') =>
  `A4J.AJAX.Submit('formProductos',event,{'similarityGroupingId':'formProductos:btnSiguiente','parameters':{'formProductos:btnSiguiente':'formProductos:btnSiguiente'},'containerId':'j_id_${'x'.repeat(n)}'${fin}});return false;`
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

async function capturar(cuerpo: string) {
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><h1>Oferta / contratación</h1>${cuerpo}</body></html>`)
    const cap = (await capturarInventarioExploracion(page))!
    const els = cap.inventario.marcos.flatMap((m) => m.elementos.map((el) => ({ el, marco: m })))
    await cap.liberar()
    return els
  } finally {
    await page.close()
  }
}
const por = <T extends { el: ElementoInventario }>(els: T[], id: string): T => els.find((x) => x.el.id === id)!

test('0.3.16 · <a> «Siguiente >>» con A4J de 200-2000 car.: onclick ENTERO y avance permitido; con acción final al final, bloqueado', async () => {
  const largo = a4j(400)
  const emite = a4j(400, ",'oncomplete':'emitirPoliza()'")
  const els = await capturar(`<form id="formProductos">
    <a href="#" id="formProductos:btnSiguiente" onclick="${attr(largo)}">Siguiente &gt;&gt;</a>
    <a href="#" id="formProductos:btnOtro" onclick="${attr(emite)}">Siguiente &gt;&gt;</a>
    <a href="#" id="formProductos:btnEnorme" onclick="${attr(a4j(2100))}">Siguiente &gt;&gt;</a></form>`)
  const ok = por(els, 'formProductos:btnSiguiente')
  assert.equal(ok.el.onclick, largo)
  assert.equal(bloqueoAvance(MF, ok.el, ok.marco), null)
  const malo = por(els, 'formProductos:btnOtro')
  assert.equal(bloqueoAvance(MF, malo.el, malo.marco), 'boton_de_emision')
  const enorme = por(els, 'formProductos:btnEnorme')
  assert.ok(enorme.el.onclick!.endsWith('…'))
  assert.equal(bloqueoAvance(MF, enorme.el, enorme.marco), 'onclick_truncado')
})

test('0.3.16 · radio con onclick largo: entero; con dato personal: REDACTADO (nunca «sin onclick»)', async () => {
  const largo = `mojarra.ab(this,event,'click',0,'tabla ${'y'.repeat(500)}')`
  const els = await capturar(`<input type="radio" id="r1" name="g" onclick="${attr(largo)}"><label for="r1">Uno</label>
    <input type="radio" id="r2" name="g" onclick="seleccionar('12345678Z')"><label for="r2">Dos</label>`)
  assert.equal(por(els, 'r1').el.onclick, largo)
  assert.equal(por(els, 'r2').el.onclick, ONCLICK_REDACTADO)
})

test('0.3.17 · el extractor captura el onclick hasta 8000 car. (onclickCompleto); >8000 recortado; y la clase CSS del control de acción', async () => {
  const tres = a4j(3000)
  const els = await capturar(`<form id="formProductos">
    <a href="#" id="formProductos:btnTres" class="rich-link grande otra cuarta" onclick="${attr(tres)}">Siguiente &gt;&gt;</a>
    <a href="#" id="formProductos:btnTresEmite" onclick="${attr(a4j(3000, ",'oncomplete':'emitirPoliza()'"))}">Siguiente &gt;&gt;</a>
    <a href="#" id="formProductos:btnMuyLargo" onclick="${attr(a4j(8100))}">Siguiente &gt;&gt;</a></form>`)
  const ok = por(els, 'formProductos:btnTres')
  assert.equal(ok.el.onclickCompleto, tres)
  assert.ok(ok.el.onclick!.endsWith('…') && ok.el.onclick!.length <= 2000)
  assert.equal(ok.el.clase, 'rich-link grande otra')
  const evaluado = (id: string) => {
    const x = por(els, id)
    return bloqueoAvance(MF, conOnclickCompleto({ version: 1, marcos: [{ ...x.marco, elementos: [x.el] }], totalElementos: 1, recortado: null, textosDescartados: 0 }).marcos[0].elementos[0], x.marco)
  }
  assert.equal(evaluado('formProductos:btnTres'), null)
  assert.equal(evaluado('formProductos:btnTresEmite'), 'boton_de_emision')
  const largo = por(els, 'formProductos:btnMuyLargo')
  assert.equal(largo.el.onclickCompleto, undefined)
  assert.equal(evaluado('formProductos:btnMuyLargo'), 'onclick_truncado')
})

// ─── Revisión 0.3.17: el `control` del rechazo en el LOG del worker no lleva valores del riesgo ───────────────────────────────
test('revisión 0.3.17 · rechazosParaLog: texto del control con un valor del riesgo, o sin riesgo legible con datos reales → «control redactado»', async () => {
  const { rechazosParaLog } = await import('../src/explorador.ts')
  const r = (texto: string) => ({ indice: 0, accion: 'avanzar' as const, ref: 'r1', causa: 'onclick_truncado', control: `tag=td type=- name=- clase=fila texto=«${texto}»` })
  const k = { conDatosReales: true, riesgo: { tomador: { nombre: 'Zacarías', apellido1: 'Ejemplar' } }, env: {}, entrada: 'allianz:autos:movilidad_personal' }
  const [a, b] = rechazosParaLog([r('ZACARIAS EJEMPLAR'), r('Siguiente')], k)
  assert.doesNotMatch(a, /ZACARIAS|EJEMPLAR/)
  assert.match(a, /\[control redactado\]$/)
  assert.match(b, /texto=«Siguiente»/)
  const [c] = rechazosParaLog([r('Siguiente')], { ...k, riesgo: null })
  assert.match(c, /\[control redactado\]$/)
})
