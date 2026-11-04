// Pelayo · explorador 0.3.43 (pilotaje real 04/11/2026): «Tipo de documento» del modal «Datos del Tomador» NO es un <select> oculto (0.3.42) sino
// `<pelayo-smart-select formControlName=documentType>` (shadow ABIERTO: pelayo-label > label, un div DISPARADOR visible y 4 `li` OCULTOS = opciones,
// sin <select> nativo). El inventario ya lo listaba, pero `seleccionar` caía en el validador («elegir solo en <select> o nx-dropdown») y `pulsar`
// también («no es un botón/pestaña»). Arreglo GENERAL (patrón del nx-dropdown): desplegable custom (`desplegableCustom`) con los TEXTOS de sus
// opciones; `seleccionar`/`elegir` por texto EXACTO normalizado abre el disparador, pulsa la opción por el guard y comprueba que el control la muestra.
// Portal SINTÉTICO por `context.route`. Sin datos reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import type { InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { elegirDesplegableCustom } from '../src/desplegable-custom.ts'
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerComando, motivoValorLiteralProhibido } from '../src/pilotaje-reglas.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
const ENTRADA = 'pelayo:presupuestos:auto'
const OPCIONES = ['Seleccionar tipo de documento', 'DNI/NIF', 'NIE', 'Pasaporte']
let browser: Browser
before(async () => {
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
after(async () => { await browser.close() })

/** <pelayo-smart-select>: label + div disparador (186x58, flex) + 4 li OCULTOS que se muestran al pulsar el div; pulsar un li fija el texto y cierra. */
const DEFINIR = `<script>
customElements.define('pelayo-label', class extends HTMLElement { constructor(){ super(); this.attachShadow({mode:'open'}).innerHTML = '<label>Tipo de documento</label>' } });
customElements.define('pelayo-smart-select', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'});
  r.innerHTML = '<pelayo-label></pelayo-label><div class="trigger" style="display:flex;width:186px;height:58px;border:1px solid #999"><span class="valor">Seleccionar tipo de documento</span></div>'
    + ${JSON.stringify(OPCIONES)}.map((t) => '<li class="op" style="display:none">' + t + '</li>').join('');
  const d = r.querySelector('.trigger');
  const lis = Array.from(r.querySelectorAll('li'));
  d.addEventListener('click', () => { window.__aperturas = (window.__aperturas||0)+1; lis.forEach((l) => { l.style.display = 'block' }) });
  lis.forEach((l, i) => l.addEventListener('click', () => {
    window.__clicsOpcion = (window.__clicsOpcion||0)+1;
    if (i === 0) return;
    r.querySelector('.valor').textContent = l.textContent; lis.forEach((x) => { x.style.display = 'none' });
    window.__tipo = l.textContent; this.dispatchEvent(new CustomEvent('pelayoChange', { bubbles: true, composed: true }));
  }));
} });
customElements.define('pelayo-modal', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = ${JSON.stringify(`<div style="background:#fff;padding:20px;margin:40px">
  <h3 class="modal-title">Nueva contratación</h3><h4>Datos del Tomador</h4>
  <pelayo-smart-select formcontrolname="documentType"></pelayo-smart-select>
  <label for="doc">Número de documento</label><input id="doc" type="text" name="documentNumber">
  <button type="button" id="nc" disabled>Nueva contratación</button>
</div>`)};
  const b = r.getElementById('nc'); r.addEventListener('pelayoChange', () => { b.disabled = false }); b.onclick = () => { window.__nc = (window.__nc||0)+1 } } });
</script>`
const CAJA = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1040;background:#fff'
const PAGINA = `<!doctype html><html><body><h1>Nuevo presupuesto</h1><a class="card" id="a">AUTOS</a><pelayo-modal class="no-footer" style="${CAJA}"></pelayo-modal>${DEFINIR}</body></html>`

async function abrir(): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA }))
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { page, guard, cerrar: () => context.close() }
}
const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)
const ventana = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

test('versión del explorador 0.3.45', () => assert.equal(EXPLORADOR_VERSION, '0.3.45'))

test('inventario: el <pelayo-smart-select> sin <select> se marca `desplegableCustom` con los TEXTOS de sus 4 opciones ocultas', async () => {
  const { page, cerrar } = await abrir()
  const cap = await capturarInventarioExploracion(page)
  try {
    const ss = elementos(cap!.inventario).filter((e) => e.tag === 'pelayo-smart-select')
    assert.equal(ss.length, 1, JSON.stringify(elementos(cap!.inventario).map((e) => e.tag)))
    assert.equal(ss[0].desplegableCustom, true)
    assert.equal(ss[0].formControlName, 'documentType')
    assert.deepEqual((ss[0].opciones ?? []).map((o) => o.texto), OPCIONES)
    assert.ok((ss[0].opciones ?? []).every((o) => o.valor === null))
    assert.equal(elementos(cap!.inventario).filter((e) => e.tag === 'li').length, 0, 'las opciones no van como controles sueltos')
  } finally { await cap?.liberar(); await cerrar() }
})

test('regla de valores del pilotaje: «DNI/NIF» se admite como literal (no es dato personal)', () => {
  assert.deepEqual(leerComando({ accion: 'seleccionar', ref: 'm0e6', valor: 'DNI/NIF' }), { ok: true, c: { accion: 'seleccionar', ref: 'm0e6', valor: 'DNI/NIF' } })
  assert.equal(motivoValorLiteralProhibido('DNI/NIF'), null)
})

function contexto(guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown) {
  const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000043', compania: 'pelayo', ramo: 'auto', entrada: ENTRADA, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pausaAccion: async () => undefined,
    publicar: async (c) => { publicados.push(c); return 'ok' },
    pedirComando: async (n) => ({ estado: 'ok', comando: guion(publicados[publicados.length - 1].inventario, n) }),
    log: () => undefined,
    sinCaptura: true,
    ahora: () => reloj,
    dormir: async (ms) => { reloj += ms },
  }
  return { k, publicados }
}
const refSS = (inv: InventarioDom) => elementos(inv).find((e) => e.tag === 'pelayo-smart-select')?.ref ?? 'm9e999'

test('pilotaje: «seleccionar DNI/NIF» abre el disparador, pulsa la opción exacta y el control la muestra («Nueva contratación» se habilita, no se pulsa)', async () => {
  const { page, guard, cerrar } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'seleccionar', ref: refSS(inv), valor: 'DNI/NIF' } : { accion: 'fin' }))
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin')
    const r1 = publicados[1]?.resultadoAnterior
    assert.equal(r1?.estado, 'hecho', JSON.stringify(r1))
    assert.equal(await ventana(page, '__tipo'), 'DNI/NIF')
    assert.equal(await ventana(page, '__aperturas'), 1)
    assert.equal(await ventana(page, '__clicsOpcion'), 1)
    assert.equal(await page.locator('pelayo-modal').locator('#nc').isEnabled(), true)
    assert.equal(await ventana(page, '__nc'), null, '«Nueva contratación» no se pulsó')
    assert.equal(guard.violacion(), null)
  } finally { await cerrar() }
})

for (const valor of ['NIF', 'DNI', 'dni/nif']) {
  test(`pilotaje: «seleccionar ${valor}» (no es EXACTAMENTE una opción) → rechazado por el validador, sin ningún clic`, async () => {
    const { page, guard, cerrar } = await abrir()
    try {
      const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'seleccionar', ref: refSS(inv), valor } : { accion: 'fin' }))
      await buclePilotaje(page, k)
      const r1 = publicados[1]?.resultadoAnterior
      assert.equal(r1?.estado, 'rechazado', JSON.stringify(r1))
      assert.equal(r1?.motivo, 'validador', JSON.stringify(r1))
      assert.ok((r1?.detalle ?? []).some((d) => /exactamente una de las opciones/.test(d)), JSON.stringify(r1))
      assert.equal(await ventana(page, '__aperturas'), null)
      assert.equal(await ventana(page, '__clicsOpcion'), null)
    } finally { await cerrar() }
  })
}

test('worker: texto sin coincidencia exacta («NIF») o de acción final → no pulsa NADA (ni el disparador)', async () => {
  const { page, guard, cerrar } = await abrir()
  try {
    const host = page.locator('pelayo-smart-select')
    const clics: string[] = []
    const pulsarG = async (b: import('playwright').Locator) => { clics.push('x'); await pulsar(b, guard) }
    assert.equal(await elegirDesplegableCustom(page.mainFrame(), host, 'NIF', pulsarG), 'no_encontrada')
    assert.equal(await elegirDesplegableCustom(page.mainFrame(), host, 'Emitir póliza', pulsarG), 'accion_final')
    assert.equal(clics.length, 0)
    assert.equal(await ventana(page, '__aperturas'), null)
    assert.equal(await elegirDesplegableCustom(page.mainFrame(), host, '  NIE ', pulsarG), 'ok')
    assert.equal(await ventana(page, '__tipo'), 'NIE')
    assert.equal(clics.length, 2, 'disparador + opción')
  } finally { await cerrar() }
})
