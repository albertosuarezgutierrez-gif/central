// Contraste de ETIQUETA del formador sobre DOM real (revisión de seguridad 06/10/2026). Lo que señale la IA o
// lo aprendido solo vale si la etiqueta de SU fila es la del campo pedido, si no es una casilla y si ese
// elemento no se resolvió ya para otra clave en el trabajo. Chromium sin red ni JavaScript de página;
// corre con tsx (keepNames): también es el cepo de `enPagina` (sin él, `__name` no existe en la página).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { describirElemento, prepararFormador, resolverConFormador, type EntradaConocimiento } from '../src/formador.ts'

const HTML = `<!doctype html><html><body><form>
<table>
  <tr><td>Fecha Inicio *</td><td><input id="ini"></td><td><label for="fin">Fecha Término *</label></td><td><input id="fin"></td></tr>
  <tr><td>Metros Cuadrados</td><td><input id="m2"></td></tr>
  <tr><td>DNI/NIF/NIE/CIF</td><td><input id="dni"></td><td><select id="tipodoc"><option>Metros Cuadrados</option></select></td></tr>
  <tr><td><input type="checkbox" id="chk"></td><td>Asistencia y Control de Plagas</td></tr>
</table>
</form></body></html>`

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
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.route('**/*', (r) => r.abort())
  page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(HTML)
})
after(async () => browser?.close())

const base = { trabajoId: '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b', compania: 'allianz', ramo: 'comunidades', apiUrl: 'https://x.test', secreto: 's'.repeat(20), redactar: (t: string) => t, log: () => undefined }

/** Contexto ACTIVO con lo aprendido dado; cualquier otra llamada a asegura (sugerir/confirmar) → 503 (sin IA). */
async function ctxCon(conocimiento: EntradaConocimiento[]) {
  const fetchImpl = (async (url: string) =>
    String(url).includes('/conocimiento?')
      ? new Response(JSON.stringify({ formadorActivo: true, conocimiento, acompanamiento: { activo: false } }))
      : new Response('{}', { status: 503 })) as unknown as typeof fetch
  return prepararFormador({ ...base, fetchImpl })
}
const aprendido = (clave: string, selector: string): EntradaConocimiento => ({ clave, tipo: 'campo', selector, marco: 'principal', origen: 'ia', confirmaciones: 5 })

test('describirElemento: etiquetaFila sale de la celda anterior / label[for], sin el texto de las opciones; lee onchange', async () => {
  const d = async (sel: string) => (await describirElemento(page.locator(sel), 1))!
  assert.match((await d('#ini')).etiquetaFila ?? '', /Fecha Inicio/)
  assert.doesNotMatch((await d('#ini')).etiquetaFila ?? '', /Término/)
  assert.match((await d('#fin')).etiquetaFila ?? '', /Fecha Término/)
  assert.doesNotMatch((await d('#fin')).etiquetaFila ?? '', /Inicio/)
  const tipodoc = await d('#tipodoc')
  assert.match(tipodoc.etiquetaFila ?? '', /DNI/)
  assert.doesNotMatch(tipodoc.etiquetaFila ?? '', /Metros/, 'el texto de las <option> no es etiqueta')
  assert.ok('onchange' in tipodoc)
})

test('lo aprendido con OTRA etiqueta se rechaza: «Fecha Término» no puede escribir en el input de «Fecha Inicio»', async () => {
  const malo = await ctxCon([aprendido('fecha_termino', '#ini')])
  assert.equal(await resolverConFormador(page, malo, { clave: 'fecha_termino', tipo: 'campo', descripcion: 'x', etiqueta: 'Fecha Término' }), null)
  const bueno = await ctxCon([aprendido('fecha_termino', '#fin')])
  const r = await resolverConFormador(page, bueno, { clave: 'fecha_termino', tipo: 'campo', descripcion: 'x', etiqueta: 'Fecha Término' })
  assert.equal(await r?.locator.evaluate((el) => el.id), 'fin')
})

test('el select de tipo de documento no vale para «Metros Cuadrados» aunque su opción lo diga', async () => {
  const ctx = await ctxCon([aprendido('metros_cuadrados', '#tipodoc')])
  assert.equal(await resolverConFormador(page, ctx, { clave: 'metros_cuadrados', tipo: 'campo', descripcion: 'x', etiqueta: 'Metros Cuadrados' }), null)
})

test('una casilla nunca sale del formador, aunque la etiqueta case', async () => {
  const ctx = await ctxCon([aprendido('asistencia_y_control_de_plagas', '#chk')])
  assert.equal(await resolverConFormador(page, ctx, { clave: 'asistencia_y_control_de_plagas', tipo: 'campo', descripcion: 'x', etiqueta: 'Asistencia y Control de Plagas' }), null)
})

test('un mismo elemento no se resuelve para dos claves en el trabajo', async () => {
  const ctx = await ctxCon([aprendido('metros_cuadrados', '#m2'), aprendido('metros_cuadrados_bis', '#m2')])
  assert.ok(await resolverConFormador(page, ctx, { clave: 'metros_cuadrados', tipo: 'campo', descripcion: 'x', etiqueta: 'Metros Cuadrados' }))
  assert.equal(await resolverConFormador(page, ctx, { clave: 'metros_cuadrados_bis', tipo: 'campo', descripcion: 'x', etiqueta: 'Metros Cuadrados' }), null)
  assert.ok(await resolverConFormador(page, ctx, { clave: 'metros_cuadrados', tipo: 'campo', descripcion: 'x', etiqueta: 'Metros Cuadrados' }), 'la misma clave, otra vez, sí')
})

test('lo que señala la IA pasa por el mismo contraste: un índice a la fila equivocada → null', async () => {
  let pedidos = 0
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (String(url).includes('/conocimiento?')) return new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))
    if (String(url).endsWith('/sugerir')) {
      pedidos++
      const cuerpo = JSON.parse(String(init?.body))
      const i = cuerpo.estructura.findIndex((c: { id: string | null }) => c.id === 'ini')
      return new Response(JSON.stringify({ indice: i }))
    }
    return new Response('{}', { status: 503 })
  }) as unknown as typeof fetch
  const ctx = await prepararFormador({ ...base, fetchImpl })
  assert.equal(await resolverConFormador(page, ctx, { clave: 'fecha_termino', tipo: 'campo', descripcion: 'x', etiqueta: 'Fecha Término' }), null)
  assert.equal(pedidos, 1, 'se preguntó a la IA (hubo candidatos: enPagina funciona con keepNames)')
})
