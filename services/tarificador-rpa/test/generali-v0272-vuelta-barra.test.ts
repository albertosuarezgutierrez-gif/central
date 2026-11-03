// Generali auto v0.2.72 (trabajo 9aa12762 con 0.2.71): tras completar «Datos de Valoración» la vuelta a «Garantías y Resultados» se intentó SOLO por «Siguiente»
// (`#siguiente`, `eventAndSubmit('NEXT')`), que no cambió de paso, y el trabajo se atascó sin probar la barra de pasos. Ahora se vuelve PRIMERO por la barra
// (`#secundario > li` con `pedirPaso('0','1')`, el mismo control que llevó al paso) y «Siguiente» queda de respaldo.
// Fixture SINTÉTICA con la forma del volcado redactado: menú con una copia anidada de los pasos (fuera de `#secundario`), barra con `pedirPaso('0','n')`,
// aviso `li.information` «Paso con datos incompletos» y un `#siguiente` que no navega. Sin valores reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { completarPasoIncompletoGenerali, ErrorMapaIncompletoGenerali, leerBarraPasosGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
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

type Registro = { pulsados: string[]; siguiente: number }
/** Contexto como el del runner: `pulsar` genérico y la puerta de «Siguiente», que pulsa el `#siguiente` del volcado (no navega). */
const ctxCon = (r: Registro, page: () => Page) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => {
    r.pulsados.push(await l.evaluate((el) => (el.getAttribute('name') || el.textContent || '').replace(/\s+/g, ' ').trim()))
    await l.click()
  },
  pulsarSiguienteGenerali: async () => { r.siguiente++; await page().locator('#siguiente').click(); return { dialogo: null } },
}) as unknown as ContextoPortal

const FICHA = { aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0 }

/** Pantalla con la forma del volcado: «Garantías y Resultados» actual, aviso de paso incompleto y «Datos de Valoración» sin obligatorios vacíos. */
const pantalla = `
<script>
  function pedirPaso(a, b) {
    const n = Number(b);
    document.querySelectorAll('#secundario > li').forEach((li, i) => { li.className = i === n ? 'current' : '' });
    document.getElementById('paso0').style.display = n === 0 ? 'block' : 'none';
    document.getElementById('paso1').style.display = n === 1 ? 'block' : 'none';
    // v0.2.73: «Datos de Valoración» completo → el portal no lo da por incompleto (con el aviso vivo y nada que rellenar el bot para con diagnóstico).
    if (n === 0) document.querySelector('#areaErrores ol').innerHTML = '';
  }
  function eventAndSubmit(ev) { /* en el volcado, «Siguiente» desde «Datos de Valoración» no cambió de paso */ }
</script>
<div id="pestanyas">
  <ul><li><a>Valoración Riesgo</a><ul>
    <li onclick="pedirPaso('0','0');return false;"><a>Datos de Valoración</a></li>
    <li onclick="pedirPaso('0','1');return false;"><a>Garantías y Resultados</a></li>
  </ul></li><li class="mclick"><a class="NOLINK">&nbsp;</a></li></ul>
  <ul id="secundario">
    <li onclick="pedirPaso('0','0');return false;"><a><span>Datos de Valoración</span></a></li>
    <li onclick="pedirPaso('0','1');return false;" class="current"><a><span>Garantías y Resultados</span></a></li>
  </ul>
</div>
<div id="areaErrores" style="display:block;"><ol><li class="information"><a onclick="return false;" value="Empty_Property"> Paso con datos incompletos </a></li></ol></div>
<div id="paso0" style="display:none;"><h2>General</h2><h2>Historial Siniestral</h2></div>
<div id="paso1" style="display:block;"><h2>Garantías y Capitales opcionales</h2></div>
<input type="button" name="siguiente" id="siguiente" value="Siguiente ›" onclick="eventAndSubmit('NEXT');">`

test('v0.2.72 · versión (vigente 0.2.76)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.76'))

test('volcado 9aa12762: tras «Datos de Valoración» vuelve a «Garantías y Resultados» por la barra (`pedirPaso`) aunque «Siguiente» no navegue, sin gastar «Siguiente»', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  let pagina: Page | null = null
  await conPagina(pantalla, async (p) => {
    pagina = p
    const res = await completarPasoIncompletoGenerali(p, ctxCon(r, () => pagina!), FICHA, [], { esperaMs: 1_500 })
    assert.ok(res)
    assert.match(res.nota, /vuelta por barra de pasos/)
    assert.equal(r.siguiente, 0, '«Siguiente» no se pulsa si la barra devuelve')
    assert.deepEqual(r.pulsados, ['Datos de Valoración', 'Garantías y Resultados'])
    assert.equal((await leerBarraPasosGenerali(p))?.pasos.find((x) => x.actual)?.texto, 'Garantías y Resultados')
  })
})

test('si ni la barra ni «Siguiente» devuelven, el atasco dice lo que se probó (barra y «Siguiente») y no se sigue', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  let pagina: Page | null = null
  await conPagina(pantalla, async (p) => {
    pagina = p
    await p.evaluate(() => { (document.querySelectorAll('#secundario > li')[1] as HTMLElement).onclick = () => false })
    await assert.rejects(completarPasoIncompletoGenerali(p, ctxCon(r, () => pagina!), FICHA, [], { esperaMs: 1_000 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /el paso «Garantías y Resultados» tras completar «Datos de Valoración» \(no se pudo volver: probado barra de pasos y «Siguiente»\)/)
      return true
    })
    assert.equal(r.siguiente, 1)
  })
})
