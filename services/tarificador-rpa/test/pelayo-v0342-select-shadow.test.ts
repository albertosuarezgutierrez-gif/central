// Pelayo · explorador 0.3.42 (pilotaje real 04/11/2026): en el modal «Nueva contratación / Datos del Tomador» (<pelayo-modal>, shadow ABIERTO) el inventario
// listaba los inputs, las labels y los botones, pero NO el desplegable «Tipo de documento» (placeholder «Seleccionar tipo de documento» y flechita de <select>):
// sin él, «Nueva contratación» seguía deshabilitado. Causa: el <select> nativo vive OCULTO (display:none o caja 0x0) dentro del shadow de OTRO custom element
// (<pelayo-select>), que pinta su propia caja; el extractor descartaba todo control sin caja/oculto. Arreglo GENERAL (no de Pelayo):
//   · un <select> OCULTO que sostiene un custom element VISIBLE (el más cercano, cruzando shadow roots; que no sea el modal; con UN solo select) se inventaría
//     con sus OPCIONES y la marca `selectOculto` (como el `selectpicker` de bootstrap-select); `seleccionar` lo elige con `selectOption` forzado tras comprobarlo VIVO;
//   · un custom element con role=combobox/listbox, o de tag de desplegable (select/dropdown/combo/picker/listbox) sin <select> dentro, se inventaría (visible);
//   · `inspeccionar` añade la lista de TAGS de los controles del interior del modal (sin textos de valor).
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
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerTagsModal, lineasTagsModal } from '../src/diagnostico-clic.ts'
import { leerComando, motivoValorLiteralProhibido } from '../src/pilotaje-reglas.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
const ENTRADA = 'pelayo:presupuestos:auto'
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

/** Variante del <select> nativo dentro del shadow de <pelayo-select>: `none` (display:none) o `cero` (caja 0x0, posición absoluta). */
type Variante = 'none' | 'cero'
const estiloSelect = (v: Variante) => (v === 'none' ? 'display:none' : 'position:absolute;left:0;top:0;width:0;height:0;border:0;padding:0;opacity:0')

/** <pelayo-select>: shadow ABIERTO con su caja visible (placeholder + flecha) y el <select> nativo OCULTO con la opción placeholder DESHABILITADA. */
const definir = (v: Variante) => `<script>
customElements.define('pelayo-select', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'});
  r.innerHTML = '<div class="pelayo-select__box" style="position:relative;display:flex;width:260px;height:36px;border:1px solid #999"><span class="ph">'+(this.getAttribute('placeholder')||'')+'</span><span class="arrow">&#9662;</span>'
    + '<select class="native" style="${estiloSelect(v)}"><option value="" disabled selected>Seleccionar tipo de documento</option><option value="DNI">DNI</option><option value="CIF">CIF</option><option value="NIE">NIE</option><option value="PAS">Pasaporte</option></select></div>';
  const s = r.querySelector('select');
  s.addEventListener('change', () => { window.__tipo = s.value; this.dispatchEvent(new CustomEvent('pelayoChange', { bubbles: true, composed: true, detail: s.value })) });
} });
customElements.define('pelayo-dropdown', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = '<div style="width:200px;height:30px;border:1px solid #999">Seleccionar provincia</div>' } });
customElements.define('pelayo-input', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = '<label for="i">'+(this.getAttribute('label')||'')+'</label><input id="i" type="text" name="'+(this.getAttribute('name')||'')+'">' } });
customElements.define('pelayo-modal', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'open'}); r.innerHTML = ${JSON.stringify(SHADOW_MODAL)};
  const b = r.getElementById('nc'); r.addEventListener('pelayoChange', () => { b.disabled = false }); b.onclick = () => { window.__nc = (window.__nc||0)+1 } } });
</script>`
const SHADOW_MODAL = `<div style="background:#fff;padding:20px;margin:40px">
  <h3 class="modal-title">Nueva contratación</h3><h4>Datos del Tomador</h4>
  <pelayo-select label="Tipo de documento" placeholder="Seleccionar tipo de documento"></pelayo-select>
  <pelayo-input label="Número de documento" name="documentNumber"></pelayo-input>
  <pelayo-input label="Nombre" name="name"></pelayo-input>
  <pelayo-dropdown role="listbox" aria-label="Provincia"></pelayo-dropdown>
  <x-combobox aria-label="Municipio" style="display:inline-block;width:120px;height:30px"></x-combobox>
  <button type="button" id="cancel">Cancelar</button>
  <button type="button" id="nc" disabled>Nueva contratación</button>
</div>`
const CAJA = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1040;background:#fff'
const pagina = (v: Variante) => `<!doctype html><html><body><h1>Nuevo presupuesto</h1><a class="card" id="a">AUTOS</a><pelayo-modal class="no-footer" style="${CAJA}"></pelayo-modal>${definir(v)}</body></html>`

async function abrir(v: Variante): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: pagina(v) }))
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { page, guard, cerrar: () => context.close() }
}

const elementos = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos)

test('versión del explorador 0.3.44', () => assert.equal(EXPLORADOR_VERSION, '0.3.44'))

for (const v of ['none', 'cero'] as const) {
  test(`inventario (${v}): el <select> OCULTO del custom element anidado en el shadow del modal se lista con sus opciones (texto) y «selectOculto»`, async () => {
    const { page, cerrar } = await abrir(v)
    const cap = await capturarInventarioExploracion(page)
    try {
      assert.ok(cap)
      const els = elementos(cap!.inventario)
      const sel = els.filter((e) => e.tag === 'select')
      assert.equal(sel.length, 1, JSON.stringify(els.map((e) => e.tag)))
      assert.equal(sel[0].selectOculto, true)
      assert.ok(sel[0].ref && cap!.nodos.has(sel[0].ref))
      assert.equal(sel[0].etiqueta, 'Tipo de documento', JSON.stringify(sel[0]))
      assert.deepEqual((sel[0].opciones ?? []).map((o) => o.texto), ['Seleccionar tipo de documento', 'DNI', 'CIF', 'NIE', 'Pasaporte'])
      assert.equal(sel[0].conValor, false)
      // los demás controles del modal siguen ahí; las tarjetas de detrás no
      assert.equal(els.filter((e) => e.tag === 'input' && e.type === 'text').length, 2)
      assert.ok(els.some((e) => e.tag === 'button' && e.texto === 'Nueva contratación' && e.deshabilitado === true))
      assert.equal(els.filter((e) => e.texto === 'AUTOS').length, 0)
      // el custom element que envuelve el select NO se lista aparte (se elige sobre el select)
      assert.equal(els.filter((e) => e.tag === 'pelayo-select').length, 0)
    } finally { await cap?.liberar(); await cerrar() }
  })
}

test('inventario: un custom element con role=listbox, o de tag de desplegable (x-combobox), sin <select> dentro se expone como control', async () => {
  const { page, cerrar } = await abrir('none')
  const cap = await capturarInventarioExploracion(page)
  try {
    const dd = elementos(cap!.inventario).filter((e) => e.tag === 'pelayo-dropdown')
    assert.equal(dd.length, 1, JSON.stringify(elementos(cap!.inventario).map((e) => e.tag)))
    assert.equal(dd[0].role, 'listbox')
    assert.equal(dd[0].ariaLabel, 'Provincia')
    const cb = elementos(cap!.inventario).filter((e) => e.tag === 'x-combobox')
    assert.equal(cb.length, 1)
    assert.equal(cb[0].ariaLabel, 'Municipio')
  } finally { await cap?.liberar(); await cerrar() }
})

test('regla de valores del pilotaje: «seleccionar» con los textos de opción DNI/CIF/NIE/Pasaporte se admite (no son dato personal)', () => {
  for (const v of ['DNI', 'CIF', 'NIE', 'Pasaporte']) {
    assert.deepEqual(leerComando({ accion: 'seleccionar', ref: 'm0e3', valor: v }), { ok: true, c: { accion: 'seleccionar', ref: 'm0e3', valor: v } })
    assert.equal(motivoValorLiteralProhibido(v), null, v)
  }
})

function contexto(guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown) {
  const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000042', compania: 'pelayo', ramo: 'auto', entrada: ENTRADA, env: {}, guard,
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

for (const v of ['none', 'cero'] as const) {
  test(`pilotaje (${v}): «seleccionar» con el texto literal «DNI» elige la opción dentro del shadow anidado (change → «Nueva contratación» se habilita); «inspeccionar» lista los tags del modal`, async () => {
    const { page, guard, cerrar } = await abrir(v)
    try {
      const refSel = (inv: InventarioDom) => elementos(inv).find((e) => e.tag === 'select')?.ref ?? 'm9e999'
      const { k, publicados } = contexto(guard, (inv, n) => {
        if (n === 1) return { accion: 'seleccionar', ref: refSel(inv), valor: 'DNI' }
        if (n === 2) return { accion: 'inspeccionar', ref: refSel(inv) }
        return { accion: 'fin' }
      })
      const fin = await buclePilotaje(page, k)
      assert.equal(fin.motivo, 'fin')
      const r1 = publicados[1]?.resultadoAnterior
      assert.equal(r1?.estado, 'hecho', JSON.stringify(r1))
      assert.equal(await page.evaluate(() => (window as unknown as { __tipo?: string }).__tipo), 'DNI')
      assert.equal(await page.locator('pelayo-modal').locator('#nc').isEnabled(), true, '«Nueva contratación» habilitado tras el change')
      // el inventario siguiente: el select ya con valor y el botón habilitado
      const sel2 = elementos(publicados[1].inventario).find((e) => e.tag === 'select')
      assert.equal(sel2?.conValor, true)
      const r2 = publicados[2]?.resultadoAnterior
      assert.equal(r2?.estado, 'hecho', JSON.stringify(r2))
      const tags = (r2?.detalle ?? []).filter((d) => d.startsWith('modal-ctl'))
      assert.ok(tags.length >= 1, JSON.stringify(r2?.detalle))
      const t = tags.join(' ')
      for (const x of ['pelayo-select', 'select', 'pelayo-input', 'input:text', 'pelayo-dropdown@listbox', 'button']) assert.ok(t.includes(x), `${x} en ${t}`)
      assert.ok(!/DNI|CIF|NIE|Pasaporte|Seleccionar/.test(t), 'sin textos de opción ni de valor')
      assert.equal(guard.violacion(), null)
      assert.equal((await page.evaluate(() => (window as unknown as { __nc?: number }).__nc)) ?? 0, 0, '«Nueva contratación» no se pulsó')
    } finally { await cerrar() }
  })
}

test('tags del modal: forma cerrada, sin textos y con tope (≤3 líneas, ≤190 car.)', async () => {
  const { page, cerrar } = await abrir('none')
  try {
    const d = await leerTagsModal(page.locator('pelayo-modal'))
    assert.ok(d && d.length >= 8, JSON.stringify(d))
    const lineas = lineasTagsModal(d!)
    assert.ok(lineas.length >= 1 && lineas.length <= 3)
    for (const l of lineas) assert.match(l, /^modal-ctl(?: \d+\/\d+)?: (?:(?:[a-z0-9-]+(?::[a-z]+)?(?:@[a-z]+)?(?:\^\d)?(?:~)?(?:!)?|\+\d+) ?)+$/)
    assert.ok(lineas.every((l) => l.length <= 190))
    // basura del portal: un tag o un type con caracteres raros se limpia, nunca pasa texto
    const sucio = lineasTagsModal([{ tag: 'SELECT<script>', type: 'te xt"', role: 'list box', prof: 9, oculto: true, deshabilitado: false }])
    assert.match(sucio[0], /^modal-ctl: selectscript:text@listbox\^9~$/)
    assert.deepEqual(lineasTagsModal([]), ['modal-ctl: -'])
    const muchos = lineasTagsModal(Array.from({ length: 80 }, () => ({ tag: 'pelayo-input', type: 'text', role: '', prof: 2, oculto: false, deshabilitado: true })))
    assert.ok(muchos.length <= 3 && muchos.every((l) => l.length <= 190) && /\+\d+$/.test(muchos[muchos.length - 1]), JSON.stringify(muchos))
  } finally { await cerrar() }
})
