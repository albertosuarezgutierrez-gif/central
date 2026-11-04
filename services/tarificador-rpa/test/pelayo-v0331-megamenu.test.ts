// Pelayo · explorador 0.3.31 (exploración real 03/11/2026 con 0.3.29, ~14:25: el login ya entra, pero «no se localiza «Presupuestos» en el desplegable de
// «Contratación» (hueco)»). Según la captura de Alberto, el desplegable es un MEGA-MENÚ: columna con ENCABEZADO en negrita «Presupuestos» y debajo el
// ENLACE «Presupuestos» (destino https://mediadores.pelayo.com/portalmediador-presupuestos/), y otra columna. El panel se abre al pasar el ratón; el clic
// en «Contratación» lo alterna (y lo cerraba); un `hover` con el ratón ya encima no dispara nada. Ahora: espera al panel con re-hover y pulsa el ENLACE
// (href exacto), nunca el encabezado; la puerta del guard (texto exacto + origen + orden + una vez) no cambia. Portal SINTÉTICO por `page.route`.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { EXPLORADOR_VERSION, type CtxEntrada } from '../src/explorador.ts'
import { abrirPresupuestosPelayo, elegirControlPresupuestosPelayo, esUrlPresupuestosPelayo } from '../src/adapters/pelayo/entrada.ts'

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
})
after(async () => { await browser.close() })

/** Mega-menú con la forma de la captura: el panel se abre con `mouseenter`, se cierra con `mouseleave`, y el clic en «Contratación» lo ALTERNA. */
const inicio = (o: { abreConHover?: boolean } = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>
  .mega{display:none;position:absolute;top:40px;left:0;width:600px;background:#fff} #mContr.abierto .mega{display:flex}
  #mContr{position:relative;display:inline-block;padding:10px} .col{padding:10px}
</style></head><body>
<nav><ul style="list-style:none;margin:0;padding:0"><li id="mContr"><a href="#" id="contr">Contratación</a>
  <div class="mega">
    <div class="col"><a class="titulo"><b>Presupuestos</b></a><ul><li><a id="enl" href="/portalmediador-presupuestos/">Presupuestos</a></li></ul></div>
    <div class="col"><b>Nuevo negocio</b><ul><li><a href="/portalmediador-polizas/">Pólizas</a></li></ul></div>
  </div></li><li style="display:inline-block;padding:10px"><a href="/portalmediador-siniestros/">Siniestros</a></li></ul></nav>
<div style="height:600px"></div>
<script>
  const li = document.getElementById('mContr');
  ${o.abreConHover === false ? '' : "li.addEventListener('mouseenter', () => li.classList.add('abierto')); li.addEventListener('mouseleave', () => li.classList.remove('abierto'));"}
  document.getElementById('contr').addEventListener('click', (ev) => { ev.preventDefault(); li.classList.toggle('abierto'); });
</script></body></html>`
const PRESUPUESTOS = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button">Nuevo Presupuesto</button></body></html>'

async function abrir(o: { abreConHover?: boolean } = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: new URL(r.request().url()).pathname === '/portalmediador-presupuestos/' ? PRESUPUESTOS : inicio(o) }))
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo'),
  } satisfies CtxEntrada
  return { context, page, ctx }
}
const ruta = (p: Page) => new URL(p.url()).pathname

test('versión del explorador 0.3.38', () => assert.equal(EXPLORADOR_VERSION, '0.3.38'))

test('puras: URL EXACTA de la página de presupuestos (https, mediadores.pelayo.com, con o sin barra final) y elección del control', () => {
  for (const u of [`${ORIGEN}/portalmediador-presupuestos/`, `${ORIGEN}/portalmediador-presupuestos`, `${ORIGEN}/portalmediador-presupuestos/?x=1`]) assert.equal(esUrlPresupuestosPelayo(u), true, u)
  for (const u of ['http://mediadores.pelayo.com/portalmediador-presupuestos/', 'https://mediadores.pelayo.com.evil.example/portalmediador-presupuestos/', `${ORIGEN}/portalmediador-presupuestos/emitir/`,
    `${ORIGEN}:8443/portalmediador-presupuestos/`, 'https://u:p@mediadores.pelayo.com/portalmediador-presupuestos/', `${ORIGEN}/portalmediador-polizas/`, '', null]) assert.equal(esUrlPresupuestosPelayo(u), false, String(u))
  const enc = { href: null, visible: true, enlace: false }
  const enl = (visible: boolean) => ({ href: `${ORIGEN}/portalmediador-presupuestos/`, visible, enlace: true })
  assert.deepEqual(elegirControlPresupuestosPelayo([enc, enl(true)]), { indice: 1 }, 'el enlace, no el encabezado')
  assert.match(JSON.stringify(elegirControlPresupuestosPelayo([enc, enl(false)])), /ninguno visible \(panel cerrado\)/)
  assert.match(JSON.stringify(elegirControlPresupuestosPelayo([enc])), /sin enlace \(encabezado de columna\)/)
  // Sin ningún enlace a esa ruta en el DOM, vale el control pulsable de rótulo exacto (portales con onclick); nunca el encabezado.
  assert.deepEqual(elegirControlPresupuestosPelayo([enc, { href: null, visible: true, enlace: true }]), { indice: 1 })
})

test('mega-menú de la captura: el clic en «Contratación» cierra el panel abierto por hover → re-hover y se pulsa el ENLACE «Presupuestos» (no el encabezado)', async () => {
  const { context, page, ctx } = await abrir()
  try {
    await abrirPresupuestosPelayo(page, ctx, { menuMs: 6_000 })
    assert.equal(ruta(page), '/portalmediador-presupuestos/')
    assert.equal(await page.getByRole('button', { name: 'Nuevo Presupuesto' }).isVisible(), true)
  } finally { await context.close() }
})

test('el panel no se abre nunca (enlace en el DOM pero oculto): hueco con lo visto y sin pulsar nada más que «Contratación»', async () => {
  const { context, page, ctx } = await abrir({ abreConHover: false })
  try {
    // El clic abre el panel; se cierra a mano antes de mirar (como el portal real tras el clic) y el hover no lo abre.
    await page.evaluate(() => { document.getElementById('contr')!.addEventListener('click', () => setTimeout(() => document.getElementById('mContr')!.classList.remove('abierto'), 0)) })
    await assert.rejects(() => abrirPresupuestosPelayo(page, ctx, { menuMs: 2_000 }),
      /no se localiza el enlace «Presupuestos» en el desplegable de «Contratación» \(1 enlace\(s\) a \/portalmediador-presupuestos\/ en el DOM, ninguno visible \(panel cerrado\)\) \(hueco\)/)
    assert.equal(ruta(page), '/portalmediador-pagina-inicio/')
  } finally { await context.close() }
})
