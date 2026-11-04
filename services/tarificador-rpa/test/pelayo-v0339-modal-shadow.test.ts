// Pelayo · explorador 0.3.39: el interceptor es un CUSTOM ELEMENT (`<pelayo-modal class="no-footer">`, z-index 1040) con contenido en su shadowRoot abierto
// (hecho real, pilotaje 2436c56f: `cerrar_modal` respondía «sin modal visible» y el host no tenía texto ni controles en el light DOM).
//   · el diagnóstico describe el shadow (modo, tamaño del host y del hijo, texto redactado, controles) y el inventario lista el «×» del shadow;
//   · `cerrarModalInformativo` trata el custom element como modal (tag modal|dialog|popup|aviso, o cubre ≥ 50 % con z ≥ 1000) con las MISMAS reglas;
//   · un host sin contenido visible alguno NO se toca: `vacio=1` y se para (lo decide la sesión principal).
// Portal SINTÉTICO. Nunca force/dispatchEvent.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { AJUSTES_CLIC_TARJETA, cerrarModalInformativo, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { EXPLORADOR_VERSION, type CtxEntrada } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo } from '../src/adapters/pelayo/entrada.ts'
import { leerDiagnosticoClic } from '../src/diagnostico-clic.ts'
import { lineasInterceptor, veredictoModal } from '../src/modal-informativo.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
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
  AJUSTES_CLIC_TARJETA.pasoMs = 1_500
  AJUSTES_CLIC_TARJETA.hoverMs = 500
})
after(async () => { await browser.close() })

const gv = <T>(p: Page, k: string) => p.evaluate((n) => (window as unknown as Record<string, T>)[n], k)
const CAJA = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1040'

/** Registra un custom element con shadowRoot ABIERTO cuyo contenido es `contenido`. */
const definir = (tag: string, contenido: string) =>
  `<script>customElements.define('${tag}',class extends HTMLElement{constructor(){super();const r=this.attachShadow({mode:'open'});r.innerHTML=${JSON.stringify(contenido)};const x=r.getElementById('x');if(x)x.onclick=()=>{window.__cierre=(window.__cierre||0)+1;this.remove()};const a=r.getElementById('acep');if(a)a.onclick=()=>{window.__acepto=1}}})</script>`
const ESTILO = '<style>.caja{background:#fff;padding:20px;margin:40px}</style>'
const SHADOW_X = `${ESTILO}<div class="caja"><p>Aviso informativo del portal.</p><button type="button" class="close" aria-label="Cerrar" id="x">×</button></div>`
const SHADOW_ACEPTAR = `${ESTILO}<div class="caja"><p>Para continuar debe leer el documento.</p><button type="button" id="acep">Aceptar condiciones</button><button type="button" class="close" aria-label="Cerrar" id="x">×</button></div>`
const SHADOW_VACIO = '<style>:host{display:block}</style><div></div>'
const TARJETA = '<a class="card" id="a" style="position:absolute;left:10px;top:10px;width:200px;height:100px" onclick="window.__clics=(window.__clics||0)+1">AUTOS</a>'
const ESCAPE = "<script>document.addEventListener('keydown',function(e){if(e.key==='Escape')window.__esc=(window.__esc||0)+1})</script>"

async function pagina(cuerpo: string) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${cuerpo}</body></html>` }))
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { context, page, guard }
}
const portal = (tag: string, shadow: string, estiloHost = `${CAJA};background:#fff`) =>
  `<h1>Nuevo presupuesto</h1>${TARJETA}<${tag} class="no-footer" style="${estiloHost}"></${tag}>${definir(tag, shadow)}`

test('versión del explorador 0.3.45', () => {
  assert.equal(EXPLORADOR_VERSION, '0.3.45')
})

test('custom element con «×» en su shadowRoot: se cierra por el botón de cierre del shadow y la tarjeta se pulsa (sin force)', async () => {
  const { context, page, guard } = await pagina(portal('pelayo-modal', SHADOW_X))
  try {
    await assert.rejects(page.locator('#a').click({ timeout: 800 }), /intercepts pointer events|Timeout/)
    const r = await cerrarModalInformativo(page, guard, 250)
    assert.equal(r.estado, 'cerrado', JSON.stringify(r))
    if (r.estado === 'cerrado') assert.equal(r.via, 'boton')
    assert.equal(await gv<number>(page, '__cierre'), 1)
    assert.equal(await page.locator('pelayo-modal').count(), 0)
    await page.locator('#a').click({ timeout: 2_000 })
    assert.equal(await gv<number>(page, '__clics'), 1)
    assert.equal(guard.violacion(), null)
  } finally { await context.close() }
})

test('custom element con «Aceptar condiciones» en el shadow: NO se toca (ni Escape, ni «×», ni «Aceptar»)', async () => {
  const { context, page, guard } = await pagina(portal('pelayo-modal', SHADOW_ACEPTAR) + ESCAPE)
  try {
    const r = await cerrarModalInformativo(page, guard, 150)
    assert.equal(r.estado, 'no_cerrable', JSON.stringify(r))
    if (r.estado === 'no_cerrable') assert.equal(r.motivo, 'termino_prohibido')
    assert.equal(await gv<number>(page, '__esc') ?? 0, 0)
    assert.equal(await gv<number>(page, '__cierre') ?? 0, 0)
    assert.equal(await gv<number>(page, '__acepto') ?? 0, 0)
    assert.equal(await page.locator('pelayo-modal').count(), 1)
  } finally { await context.close() }
})

test('host vacío y transparente que intercepta: vacio=1, NO se toca ni se borra del DOM', async () => {
  const { context, page, guard } = await pagina(portal('pelayo-modal', SHADOW_VACIO, `${CAJA};background:transparent`) + ESCAPE)
  try {
    const r = await cerrarModalInformativo(page, guard, 150)
    assert.equal(r.estado, 'no_cerrable', JSON.stringify(r))
    if (r.estado !== 'no_cerrable') return
    assert.equal(r.motivo, 'vacio')
    assert.equal(r.modal?.vacio, true)
    assert.equal(r.modal?.shd, true)
    assert.ok(lineasInterceptor(r.modal!).some((l) => /^int-shd: shadow=open host=\d+x\d+ hijo=\S+ vacio=1$/.test(l)), lineasInterceptor(r.modal!).join('\n'))
    assert.equal(await gv<number>(page, '__esc') ?? 0, 0, 'ni Escape')
    assert.equal(await page.locator('pelayo-modal').count(), 1, 'el host sigue en el DOM')
    const d = await leerDiagnosticoClic(page.locator('#a'))
    assert.equal(d?.int?.vacio, true)
    assert.deepEqual(veredictoModal(d!.int!), { ok: false, motivo: 'vacio' })
  } finally { await context.close() }
})

test('un custom element SIN «modal» en el tag que cubre ≥ 50 % con z ≥ 1000 también es modal; con caja pequeña o z bajo, no', async () => {
  const a = await pagina(portal('x-panel', SHADOW_X))
  try {
    const r = await cerrarModalInformativo(a.page, a.guard, 250)
    assert.equal(r.estado, 'cerrado', JSON.stringify(r))
    assert.equal(await gv<number>(a.page, '__cierre'), 1)
  } finally { await a.context.close() }
  const b = await pagina(portal('x-panel', SHADOW_X, 'position:fixed;left:300px;top:300px;width:100px;height:100px;z-index:1040'))
  try {
    assert.deepEqual(await cerrarModalInformativo(b.page, b.guard, 100), { estado: 'sin_modal' })
  } finally { await b.context.close() }
  const c = await pagina(portal('x-panel', SHADOW_X, `${CAJA};z-index:10`))
  try {
    assert.deepEqual(await cerrarModalInformativo(c.page, c.guard, 100), { estado: 'sin_modal' })
  } finally { await c.context.close() }
})

test('diagnóstico: describe el shadowRoot (modo, host, hijo), el texto redactado ≤160 y los controles del shadow', async () => {
  const { context, page } = await pagina(portal('pelayo-modal', `${ESTILO}<div class="caja"><p>Titular 12345678Z pendiente.</p><button type="button" class="close" aria-label="Cerrar" id="x">×</button><a href="#">Más información</a></div>`))
  try {
    const d = await leerDiagnosticoClic(page.locator('#a'))
    assert.ok(d?.int, JSON.stringify(d))
    assert.equal(d.int.tag, 'pelayo-modal')
    assert.equal(d.int.cls, 'no-footer')
    assert.equal(d.int.shd, true)
    assert.equal(d.int.esModal, true)
    assert.equal(d.int.vacio, false)
    assert.notEqual(d.int.hijo, '-')
    assert.equal(d.int.texto, '(texto redactado)')
    assert.equal(d.int.nCierre, 1)
    assert.deepEqual(d.int.ctl.map((c) => [c.tag, c.sh, c.cierre]), [['button', true, true], ['a', true, false]])
    const l = lineasInterceptor(d.int)
    assert.ok(l.length <= 9)
    for (const x of l) assert.ok(x.length <= 160 && !/12345678Z/.test(x), x)
    assert.ok(l.some((x) => /^int-shd: shadow=open host=\d+x\d+ hijo=\d+x\d+ vacio=0$/.test(x)), l.join('\n'))
    assert.ok(l.some((x) => /^int-ctl: button\/button\/close sh=1 cierre=1 aria=«Cerrar»/.test(x)), l.join('\n'))
  } finally { await context.close() }
})

test('el inventario incluye el control de cierre del shadowRoot de un custom element que cubre la página', async () => {
  const { context, page } = await pagina(portal('x-panel', `${ESTILO}<div class="caja"><p>Aviso.</p><span class="close" id="x">×</span></div>`))
  try {
    const cap = await capturarInventarioExploracion(page)
    assert.ok(cap)
    const els = cap.inventario.marcos.flatMap((m) => m.elementos)
    const cierres = els.filter((e) => e.tag === 'span' && e.texto === '×')
    assert.equal(cierres.length, 1, JSON.stringify(els))
    assert.ok(cierres[0].ref)
    await cap.liberar()
  } finally { await context.close() }
})

test('entrada de Pelayo: el custom element tapa la tarjeta, se cierra por el «×» del shadow y la tarjeta se pulsa', async () => {
  const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a><div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
  const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
  const NUEVO = `<!doctype html><html><body><h1>Nuevo presupuesto</h1><div id="r"><a class="card" id="a" onclick="document.getElementById('r').innerHTML='<h2>Datos del vehículo</h2>'">AUTOS</a><a class="card" id="b">COMERCIO</a></div><pelayo-modal class="no-footer" style="${CAJA};background:#fff"></pelayo-modal>${definir('pelayo-modal', SHADOW_X)}</body></html>`
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? NUEVO : HOME })
  })
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const logs: string[] = []
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' }, log: (l: string) => { logs.push(l) }, pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard), exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0], o?: { reintento?: boolean }) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo', o),
    diagnostico: () => undefined, cerrarModal: (p: Page) => cerrarModalInformativo(p, guard, 250),
  } satisfies CtxEntrada
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', { menuMs: 4_000, paginaMs: 4_000, formularioMs: 4_000, reintentoMs: 1_500 })
    assert.equal((await dest.getByText('Datos del vehículo').count()) > 0, true)
    assert.equal(await gv<number>(dest, '__cierre'), 1)
    assert.ok(logs.includes('pelayo_modal cerrado boton'), logs.join(' | '))
    assert.equal(guard.violacion(), null)
  } finally { await context.close() }
})
