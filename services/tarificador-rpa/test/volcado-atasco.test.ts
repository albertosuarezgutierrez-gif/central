// VOLCADO de un atasco / hueco de mapa (27/10/2026): un HTML por marco + resumen de pantalla, sin valores de campos, con
// recorte por marco y mensaje que conserva cabeza y referencia. Fixtures SINTÉTICOS; el extractor corre en Chromium sin red.
//   npm test
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { redactarHtml, redactarHtmlGrabacion, redactarTextoGrabacion, redactarUrl } from '@central/module-tarificacion'
import { separarMarcos } from '../src/evidencia.ts'
import {
  construirResumen,
  construirVolcado,
  leerResumen,
  MAX_BYTES_RESUMEN,
  nombreDocumentoVolcado,
  recogerMarcosCrudos,
  recortarHtmlBytes,
  truncarMensajeConReferencia,
  vaciarValoresCampos,
  type MarcoCrudo,
  type Saneadores,
} from '../src/volcado-atasco.ts'

const CENTINELA = 'ZZQ-VALOR-TECLEADO-77'
// La MISMA cadena de saneado que el runner.
const san: Saneadores = {
  html: (h) => redactarHtml(vaciarValoresCampos(redactarHtmlGrabacion(h)), []),
  texto: (t) => redactarTextoGrabacion(t),
  url: (u) => redactarUrl(u),
}

const marco = (ruta: string, html: string | null, url = 'https://portal.invalido/app?x=1'): MarcoCrudo => ({ ruta, url, html, resumen: null })
const campo = (id: string) => `<label for="${id}">Etiqueta ${id}</label><input id="${id}" name="${id}" value="${CENTINELA}">`

test('varios marcos → un HTML por marco, cada uno con su URL saneada, y ningún valor de campo', () => {
  const v = construirVolcado([
    marco('', `<html><body>${campo('a')}<iframe name="appArea"></iframe></body></html>`, 'https://portal.invalido/inicio'),
    marco('appArea', `<form>${campo('b')}<textarea id="t">${CENTINELA}</textarea><select><option selected value="k">Sevilla</option></select></form>`, 'https://portal.invalido/f?jsessionid=ABC&token=CENTINELA123'),
    marco('appArea/#0', `<div>${campo('c')} <input type="submit" value="Calcular"></div>`),
  ], san)
  assert.equal(v.marcos, 3)
  const sep = separarMarcos(v.html)
  assert.deepEqual(sep.marcos.map((m) => m.ruta), [['appArea'], ['appArea', '#0']])
  assert.match(sep.principal, /Etiqueta a/)
  assert.match(sep.marcos[0].html, /Etiqueta b/)
  assert.match(sep.marcos[1].html, /Etiqueta c/)
  assert.match(sep.marcos[1].html, /value="Calcular"/, 'la etiqueta de un botón se conserva')
  assert.ok(!v.html.includes(CENTINELA), 'el valor de un input no puede salir')
  assert.ok(!/ selected/.test(v.html), 'la opción elegida no sale')
  assert.match(v.html, /<!-- tarificador:url https:\/\/portal\.invalido\/f\?jsessionid=[^&]*&token=\[REDACTADO\]/, 'URL del marco, con el parámetro de sesión tapado')
  assert.ok(!v.html.includes('CENTINELA123'))
})

test('un marco ilegible queda marcado, no desaparece', () => {
  const v = construirVolcado([marco('', '<p>ok</p>'), marco('otro', null)], san)
  assert.deepEqual(v.ilegibles, ['otro'])
  assert.match(separarMarcos(v.html).marcos[0].html, /ilegible/)
  assert.ok(leerResumen(v.html)?.marcosIlegibles.includes('otro'))
})

test('vaciarValoresCampos: idempotente, deja las etiquetas de botón y borra el modelo de Angular', () => {
  const h = `<input value="${CENTINELA}"><input type="button" value="Seguir"><input ng-reflect-model="${CENTINELA}" value=${CENTINELA}><textarea>${CENTINELA}</textarea>`
  const una = vaciarValoresCampos(h)
  assert.ok(!una.includes(CENTINELA))
  assert.match(una, /value="Seguir"/)
  assert.equal(vaciarValoresCampos(una), una)
})

test('por encima del tope se recorta POR MARCO, se conserva cada marco y se dice', () => {
  const grande = (n: string) => `<main>${`<p class="${n}">relleno ${n}</p>`.repeat(4000)}</main>`
  const peque = '<form><label>Pequeño</label></form>'
  const v = construirVolcado([marco('', peque), marco('a', grande('a')), marco('b', grande('b'))], san, 200_000)
  assert.ok(Buffer.byteLength(v.html) <= 200_000, `cabe en el tope (${Buffer.byteLength(v.html)})`)
  assert.equal(v.recortes.length, 2)
  assert.ok(v.recortes.every((r) => /^marco «(a|b)»: \d+ → \d+ bytes$/.test(r)), v.recortes.join('|'))
  const sep = separarMarcos(v.html)
  assert.equal(sep.marcos.length, 2)
  assert.match(sep.principal, /Pequeño/, 'el marco pequeño queda entero')
  for (const m of sep.marcos) assert.match(m.html, /tarificador:recortado marco="/)
  assert.deepEqual(leerResumen(v.html)?.recortes, v.recortes, 'el resumen también lo dice')
  assert.equal(recortarHtmlBytes('<b>x</b>', 100, 'n'), '<b>x</b>')
})

test('mensaje largo: conserva la cabeza y la cola, termina con la referencia al documento y cabe en el tope', () => {
  const cabeza = 'requiere_verificacion_humana: Mapfre pide un paso que el mapa no conoce.'
  const largo = cabeza + ' ' + 'x'.repeat(5000) + ' LO_IMPORTANTE_AL_FINAL'
  const ref = nombreDocumentoVolcado('4b40fc5b-1111-2222-3333-444455556666')
  assert.equal(ref, 'fallo-4b40fc5b.html')
  const m = truncarMensajeConReferencia(largo, { max: 2000, referencia: ref, recortes: ['marco «a»: 9 → 5 bytes'], cola: ' [bóveda: nota]' })
  assert.ok(m.length <= 2000, String(m.length))
  assert.ok(m.startsWith(cabeza), 'la cabeza se conserva')
  assert.match(m, /LO_IMPORTANTE_AL_FINAL.*\[volcado: fallo-4b40fc5b\.html; recortado en 1 marco\] \[bóveda: nota\]$/, 'cola del texto, referencia y nota de bóveda al final')
  assert.match(m, /caracteres omitidos/)
  // Cabe → intacto + referencia; sin documento → sin referencia.
  assert.equal(truncarMensajeConReferencia('corto', { max: 2000, referencia: ref }), 'corto [volcado: fallo-4b40fc5b.html]')
  assert.equal(truncarMensajeConReferencia('corto', { max: 2000, referencia: null }), 'corto')
})

// ─── Resumen de pantalla: extractor en Chromium ───────────────────────────────────────────

const PAGINA = `<!doctype html><html><body>
  <h1>Datos del vehículo</h1>
  <div role="alert">El campo Fecha de matriculación es obligatorio</div>
  <span style="color:rgb(200,20,20)">Revise los datos del conductor</span>
  <form>
    <label for="nom">Nombre del conductor</label><input id="nom" name="nom" required value="${CENTINELA}">
    <label for="mat">Matrícula</label><input id="mat" required>
    <label for="obs">Observaciones</label><textarea id="obs">${CENTINELA}</textarea>
    <label for="prov">Provincia</label><select id="prov" required><option value="">--</option><option value="41">Sevilla</option></select>
    <button type="button" id="seguir" disabled>Continuar</button>
    <button type="button">Atrás</button>
    <a href="#x">Ayuda</a>
  </form>
  <iframe name="appArea" style="width:600px;height:400px"
    srcdoc="&lt;div class='mat-error'&gt;Falta el código postal&lt;/div&gt;&lt;label for='cp'&gt;Código postal&lt;/label&gt;&lt;input id='cp' required&gt;&lt;button&gt;Calcular&lt;/button&gt;"></iframe>
</body></html>`

let browser: Browser
let page: Page
async function lanzar(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}
before(async () => {
  browser = await lanzar()
  const context = await browser.newContext()
  await context.route('**/*', (r) => r.abort())
  page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(PAGINA)
  await page.frame({ name: 'appArea' })!.waitForSelector('#cp')
  await page.fill('#mat', CENTINELA) // lo que teclearía el robot: tampoco puede salir
})
after(async () => browser?.close())

test('resumen de pantalla en vivo: errores, botones, enlaces, obligatorios vacíos, SIN valores; HTML de TODOS los marcos', async () => {
  const marcos = await recogerMarcosCrudos([page])
  assert.deepEqual(marcos.map((m) => m.ruta), ['', 'appArea'])
  const v = construirVolcado(marcos, san)
  assert.ok(!v.html.includes(CENTINELA), 'ni el resumen ni el HTML llevan el valor tecleado')
  const r = leerResumen(v.html)!
  assert.ok(r.marcos.length === 2 && r.marcosIlegibles.length === 0)
  const [p, app] = r.marcos
  assert.ok(p.errores.includes('El campo Fecha de matriculación es obligatorio'), JSON.stringify(p.errores))
  assert.ok(p.errores.includes('Revise los datos del conductor'), 'texto rojo')
  assert.deepEqual(p.botones, [{ texto: 'Continuar', deshabilitado: true }, { texto: 'Atrás', deshabilitado: false }])
  assert.deepEqual(p.enlaces, [{ texto: 'Ayuda', deshabilitado: false }])
  assert.deepEqual(p.obligatoriosVacios, ['Provincia'], 'solo los obligatorios VACÍOS (nombre y matrícula tienen valor)')
  assert.deepEqual(app.errores, ['Falta el código postal'])
  assert.deepEqual(app.obligatoriosVacios, ['Código postal'])
  assert.deepEqual(app.botones, [{ texto: 'Calcular', deshabilitado: false }])
  assert.equal(typeof app.cargando, 'boolean')
  const sep = separarMarcos(v.html)
  assert.equal(sep.marcos.length, 1)
  assert.match(sep.marcos[0].html, /Código postal/)
  assert.match(sep.principal, /Datos del vehículo/)
})

test('el resumen respeta su tope y nunca lleva un texto sin sanear', () => {
  const crudo: MarcoCrudo = {
    ruta: '', url: 'https://x.invalido/', html: '<p/>',
    resumen: { errores: ['DNI 12345678Z incorrecto', 'a', 'a'], botones: Array.from({ length: 60 }, (_, i) => ({ texto: `Botón ${i} ${'x'.repeat(150)}`, deshabilitado: false })), enlaces: Array.from({ length: 60 }, (_, i) => ({ texto: `Enlace ${i} ${'y'.repeat(150)}`, deshabilitado: i % 2 === 0 })), obligatoriosVacios: [], cargando: true },
  }
  const r = construirResumen(Array.from({ length: 6 }, () => crudo), san)
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= MAX_BYTES_RESUMEN)
  assert.ok(!JSON.stringify(r).includes('12345678Z'))
  assert.equal(r.marcos[0].errores.length, 2, 'sin repetidos')
  assert.equal(r.marcosCargando.length, 6)
})
