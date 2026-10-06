// Varias opciones (06/10/2026): HTML mínimo INVENTADO con la forma de Datos Básicos (fila «COSTE ANUAL DEL SEG.
// SEGÚN OPCIÓN», `#calcular`, grupo «Responsabilidad Civil» → fila «Suma Asegurada» con `select#personalizado…`).
// Comprueba que la variante se calcula, que la base se RESTAURA (select y coste) y que, si no vuelve, se aborta.
// `ctx.pulsar` aquí es un click directo de prueba (el de verdad pasa por el guard). El script usa `var`: setContent
// reutiliza el realm de JS y un `let` repetido no se redeclara (el onclick no se instalaría).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { calcularVariantes, type VarianteOferta } from '../src/adapters/allianz/comunidades.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

// `rotoTrasN`: a partir del N-ésimo cálculo el coste ya no depende del select (simula un portal que no vuelve).
const pagina = (rotoTrasN = 99) => `<body><table>
<tr><td>COSTE ANUAL DEL SEG. SEGÚN OPCIÓN</td><td><input id="ce" value="1.000,00"></td><td><input id="cp" value="1.200,00"></td></tr>
<tr><td>Responsabilidad Civil</td></tr>
<tr><td>Suma Asegurada</td><td><input id="estandarRc" value="300.000,00"></td>
<td><select id="personalizadoRc"><option value="300000">300.000,00</option><option value="600000">600.000,00</option></select></td></tr>
</table>
<div id="calcular" class="footerButton">Calcular</div>
<script>
var n = 0
document.getElementById('calcular').onclick = () => {
  n++
  const extra = n >= ${rotoTrasN} ? 7 : (document.getElementById('personalizadoRc').value === '600000' ? 150 : 0)
  setTimeout(() => { document.getElementById('ce').value = (1000 + extra) + ',00' }, 150)
}
</script></body>`

let browser: Browser
let page: Page
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
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
})
after(async () => browser?.close())

const pulsaciones: string[] = []
const ctx = {
  pulsar: async (l: { click(): Promise<void>; getAttribute(n: string): Promise<string | null> }) => {
    pulsaciones.push((await l.getAttribute('id')) ?? '?')
    await l.click()
  },
  log: () => undefined,
  pausa: async () => undefined,
  pausaAccion: async () => undefined,
  exigirSinCaptcha: async () => undefined,
} as unknown as ContextoPortal

const RC: VarianteOferta = { etiqueta: 'RC 600.000 €', cambios: [{ partida: 'rc_suma_asegurada', columna: 'personalizado', opcion: '600.000,00' }] }

test('sin variantes declaradas: solo un aviso, nada se toca', async () => {
  await page.setContent(pagina())
  pulsaciones.length = 0
  const r = await calcularVariantes(page, page.mainFrame(), ctx, 'estandar', 1000, [])
  assert.equal(r.ofertas.length, 0)
  assert.match(r.avisos[0], /VARIANTES vacía/)
  assert.deepEqual(pulsaciones, [])
})

test('variante: oferta extra con su etiqueta y la base restaurada (select y coste); solo se pulsa «Calcular»', { timeout: 60_000 }, async () => {
  await page.setContent(pagina())
  pulsaciones.length = 0
  const r = await calcularVariantes(page, page.mainFrame(), ctx, 'estandar', 1000, [RC])
  assert.deepEqual(r.avisos, [])
  assert.equal(r.ofertas.length, 1)
  assert.equal(r.ofertas[0].producto, 'Comunidades 2020 · Estándar · RC 600.000 €')
  assert.equal(r.ofertas[0].primaAnualEur, 1150)
  assert.equal(r.ofertas[0].pdf, null)
  assert.equal(await page.locator('#personalizadoRc').inputValue(), '300000', 'el select vuelve al valor original')
  assert.equal(await page.locator('#ce').inputValue(), '1000,00', 'el coste vuelve al de la base')
  assert.deepEqual(pulsaciones, ['calcular', 'calcular'])
})

test('opción que el desplegable no tiene: aviso, sin oferta y sin recalcular', async () => {
  await page.setContent(pagina())
  pulsaciones.length = 0
  const r = await calcularVariantes(page, page.mainFrame(), ctx, 'estandar', 1000, [{ ...RC, cambios: [{ ...RC.cambios[0], opcion: '900.000,00' }] }])
  assert.equal(r.ofertas.length, 0)
  assert.match(r.avisos[0], /no admite «900\.000,00»/)
  assert.deepEqual(pulsaciones, [])
})

test('si la base no vuelve tras la variante → portal (no se avanza con otra configuración)', { timeout: 60_000 }, async () => {
  await page.setContent(pagina(2))
  await assert.rejects(calcularVariantes(page, page.mainFrame(), ctx, 'estandar', 1000, [RC]), /no se recuperó el coste base/)
})
