// Pelayo · explorador 0.3.33: la elección del ramo deja un DIAGNÓSTICO persistente (nota cerrada → huecos del mapa) y, si el primer clic no cambia nada,
// hace UN reintento sobre el elemento interior de texto exacto por la puerta del guard. Portal SINTÉTICO por `page.route`; sin datos reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { EXPLORADOR_VERSION, type CtxEntrada } from '../src/explorador.ts'
import { RE_NOTA_ENTRADA_PELAYO, abrirNuevoPresupuestoPelayo, notaDiagnosticoRamoPelayo } from '../src/adapters/pelayo/entrada.ts'

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

const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a>
  <div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
const FORM = '<h2>Datos del vehículo</h2><label>Matrícula <input name="mat"></label><label>Fecha <input name="f"></label><select name="u"><option>Uso</option></select>'
const REPINTA = `document.getElementById('r').innerHTML='${FORM.replace(/'/g, "\\'")}'`

type Modo = 'tardio' | 'nunca' | 'modal' | 'confirm' | 'hijo'
// 'tardio': el 1.er clic no hace nada (manejador aún sin enlazar) y el 2.º sí; 'nunca': ningún manejador; 'modal': abre un diálogo sin cambiar la estructura;
// 'confirm': un confirm() nativo; 'hijo': la tarjeta contiene un <span>AUTOS</span> y el manejador cuelga SOLO del hijo (el clic al centro lo recibe igual).
const tarjetas = (m: Modo) => {
  const a = m === 'hijo' ? `<a class="card" id="a"><span id="s">AUTOS</span></a>` : `<a class="card" id="a">AUTOS</a>`
  const js = m === 'tardio' ? `var n=0;document.getElementById('a').onclick=function(){if(++n>=2){${REPINTA}}}`
    : m === 'modal' ? `document.getElementById('a').onclick=function(){var d=document.createElement('div');d.setAttribute('role','dialog');d.textContent='Aviso';d.style.cssText='position:fixed;top:10px;left:10px;width:200px;height:80px;background:#fff';document.body.appendChild(d)}`
    : m === 'confirm' ? `document.getElementById('a').onclick=function(){confirm('seguro')}`
    : m === 'hijo' ? `document.getElementById('s').onclick=function(){${REPINTA}}`
    : ''
  return `<!doctype html><html><body><h1>Nuevo presupuesto</h1><div id="r">${a}<a class="card" id="b">COMERCIO</a></div><script>${js}</script></body></html>`
}

async function abrir(m: Modo) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  page.on('dialog', (d) => { d.dismiss().catch(() => {}) })
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? tarjetas(m) : HOME
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const notas: string[] = []
  const logs: string[] = []
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' },
    log: (l: string) => { logs.push(l) },
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0], o?: { reintento?: boolean }) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo', o),
    diagnostico: (n: string) => { notas.push(n) },
  } satisfies CtxEntrada
  return { context, page, ctx, notas, logs }
}
const ESP = { menuMs: 4_000, paginaMs: 4_000, formularioMs: 6_000, reintentoMs: 2_500 }
const hayFormulario = async (p: import('playwright').Page) => (await p.getByText('Datos del vehículo').count()) > 0

test('versión del explorador 0.3.42', () => assert.equal(EXPLORADOR_VERSION, '0.3.42'))

test('nota de diagnóstico: forma cerrada (solo contadores), acotada', () => {
  const n = notaDiagnosticoRamoPelayo({ tarjetas: 1, clic: true, cambio: false, pestana: false, dialogo: 0, modal: 1, reintento: true })
  assert.equal(n, 'entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=0 modal=1 reintento=1')
  assert.ok(RE_NOTA_ENTRADA_PELAYO.test(n))
  assert.ok(RE_NOTA_ENTRADA_PELAYO.test(notaDiagnosticoRamoPelayo({ tarjetas: 500, clic: false, cambio: false, pestana: true, dialogo: -3, modal: NaN, reintento: false })))
  for (const mala of ['entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=0 modal=0 reintento=1 IBAN ES1234', 'entrada pelayo: tarjetas=x clic=1', 'otra cosa']) {
    assert.equal(RE_NOTA_ENTRADA_PELAYO.test(mala), false)
  }
})

test('manejador tardío: el 1.er clic no hace nada, UN reintento sobre el interior lo resuelve; formulario con campos y sin nota (todo fue bien)', async () => {
  const { context, page, ctx, notas, logs } = await abrir('tardio')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', { ...ESP, formularioMs: 10_000 })
    assert.equal(await hayFormulario(dest), true)
    assert.equal(notas.length, 0)
    const d = logs.find((l) => l.startsWith('pelayo_diagnostico_ramo '))
    assert.ok(d?.includes('tarjetas=1 clic=1 cambio=1') && d.includes('reintento=1'), d)
  } finally { await context.close() }
})

test('tarjeta que nunca reacciona: la nota dice tarjeta vista, clic dado, sin cambio ni pestaña, con reintento', async () => {
  const { context, page, ctx, notas } = await abrir('nunca')
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.deepEqual(notas, ['entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=0 modal=0 reintento=1'])
  } finally { await context.close() }
})

test('abre un modal sin cambiar la estructura: se cuenta el modal y NO se reintenta (no se pulsa por encima de un diálogo)', async () => {
  const { context, page, ctx, notas } = await abrir('modal')
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.deepEqual(notas, ['entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=0 modal=1 reintento=0'])
  } finally { await context.close() }
})

test('confirm() nativo tras el clic: se cuenta (y el worker lo descarta); sin reintento', async () => {
  const { context, page, ctx, notas } = await abrir('confirm')
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.deepEqual(notas, ['entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=1 modal=0 reintento=0'])
  } finally { await context.close() }
})

test('manejador en el hijo con el texto exacto: llega al formulario', async () => {
  const { context, page, ctx, notas } = await abrir('hijo')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), true)
    assert.equal(notas.length, 0)
  } finally { await context.close() }
})

test('sin tarjeta del ramo: nota con tarjetas=0 clic=0 (no se pulsa nada)', async () => {
  const { context, page, ctx, notas } = await abrir('nunca')
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'hogar', ESP)
    assert.deepEqual(notas, ['entrada pelayo: tarjetas=0 clic=0 cambio=0 pestana=0 dialogo=0 modal=0 reintento=0'])
  } finally { await context.close() }
})

test('guard: la 2.ª pulsación de la misma etiqueta se rechaza; con `reintento` vale UNA vez y solo en tarjetas de ramo de Pelayo', async () => {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body><a class="card" id="a" onclick="window.n=(window.n||0)+1">Autos</a><a href="#" id="m" onclick="window.k=(window.k||0)+1;return false">Contratación</a><a href="#" id="p" onclick="return false">Presupuestos</a><a href="#" id="np" onclick="return false">Nuevo Presupuesto</a></body></html>' }))
  try {
    await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
    const auto = page.locator('#a'), menu = page.locator('#m')
    await pulsarEnlaceEntradaAutorizado(menu, guard, 'pelayo')
    await pulsarEnlaceEntradaAutorizado(page.locator('#p'), guard, 'pelayo')
    await pulsarEnlaceEntradaAutorizado(page.locator('#np'), guard, 'pelayo')
    await pulsarEnlaceEntradaAutorizado(auto, guard, 'pelayo')
    await assert.rejects(pulsarEnlaceEntradaAutorizado(auto, guard, 'pelayo'), EmisionBloqueadaError)
    await pulsarEnlaceEntradaAutorizado(auto, guard, 'pelayo', { reintento: true })
    await assert.rejects(pulsarEnlaceEntradaAutorizado(auto, guard, 'pelayo', { reintento: true }), EmisionBloqueadaError)
    assert.equal(await page.evaluate(() => (window as unknown as { n: number }).n), 2)
    await assert.rejects(pulsarEnlaceEntradaAutorizado(menu, guard, 'pelayo', { reintento: true }), EmisionBloqueadaError)
    assert.equal(await page.evaluate(() => (window as unknown as { k: number }).k), 1)
  } finally { await context.close() }
})
