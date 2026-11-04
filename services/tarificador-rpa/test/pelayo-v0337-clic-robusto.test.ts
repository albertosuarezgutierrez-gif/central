// Pelayo · explorador 0.3.37: la tarjeta de RAMO (a.card sin href) se pulsa con clic ROBUSTO por la puerta del guard (scroll › hover › animaciones ›
// clic › hijo de texto exacto › prueba `trial`) y, si caduca por accionabilidad, deja un DIAGNÓSTICO cerrado y sin PII en la nota. Portal SINTÉTICO.
// Hecho real (pilotaje fc136562): AUTOS y HOGAR no se podían pulsar (`locator.click: Timeout 30000ms exceeded … locator resolved to <a class=…`).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { AJUSTES_CLIC_TARJETA, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado, pulsarTarjetaRamoPelayo, tarjetaRamoPelayoViva } from '../src/guard.ts'
import type { CtxEntrada } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo } from '../src/adapters/pelayo/entrada.ts'
import { RE_CUERPO_DIAGNOSTICO_CLIC, RE_NOTA_CLIC_PELAYO, cuerpoDiagnosticoClic, esTimeoutAccionabilidad, leerDiagnosticoClic, notaClicPelayo } from '../src/diagnostico-clic.ts'
import { pareceDatoPersonalInventario } from '@central/module-tarificacion'

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

const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a>
  <div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
const FORM = '<h2>Datos del vehículo</h2><label>Matrícula <input name="mat"></label><label>Fecha <input name="f"></label><select name="u"><option>Uso</option></select>'
const REPINTA = `document.getElementById('r').innerHTML='${FORM.replace(/'/g, "\\'")}'`
const CUENTA = `window.__clics=(window.__clics||0)+1;${REPINTA}`

type Modo = 'tapada' | 'banner' | 'animacion' | 'pe_ancestro' | 'hijo' | 'normal'
const nuevoPresupuesto = (m: Modo): string => {
  const base = (cuerpo: string, extra = '', js = '') =>
    `<!doctype html><html><head><style>${extra}</style></head><body><h1>Nuevo presupuesto</h1><div id="r">${cuerpo}<a class="card" id="b">COMERCIO</a></div><script>window.__clics=0;${js}</script></body></html>`
  switch (m) {
    case 'normal':
      return base('<a class="card" id="a">AUTOS</a>', '', `document.getElementById('a').onclick=function(){${CUENTA}}`)
    case 'tapada': // un velo a pantalla completa (sin nada de cookies) tapa la tarjeta
      return base('<a class="card" id="a">AUTOS</a><div id="ov" class="velo-modal" style="position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.3)"></div>', '', `document.getElementById('a').onclick=function(){${CUENTA}}`)
    case 'banner': // lo mismo, pero es un banner de cookies con su «Aceptar cookies» (que NO se debe pulsar)
      return base('<a class="card" id="a">AUTOS</a><div id="ov" class="onetrust-banner-sdk" style="position:fixed;left:0;top:0;right:0;bottom:0;background:#fff"><p>Usamos cookies</p><button type="button" id="ok" onclick="window.__ok=1">Aceptar cookies</button></div>', '', `document.getElementById('a').onclick=function(){${CUENTA}}`)
    case 'animacion': // opacity 0 → 1 en 2,2 s; el manejador solo existe cuando termina la animación (un clic antes no hace nada)
      return base('<a class="card" id="a">AUTOS</a>', '@keyframes ap{from{opacity:0}to{opacity:1}} #a{animation:ap 2200ms linear forwards}', `document.getElementById('a').addEventListener('animationend',function(){document.getElementById('a').onclick=function(){${CUENTA}}})`)
    case 'pe_ancestro': // un ancestro con pointer-events:none: el clic "atraviesa" la tarjeta
      return base('<div id="env" class="envoltura" style="pointer-events:none"><a class="card" id="a">AUTOS</a></div>', '', `document.getElementById('a').onclick=function(){${CUENTA}}`)
    case 'hijo': // la tarjeta no recibe el clic en su centro (pointer-events:none) pero su <span> de texto sí, y está en una esquina
      return base('<a class="card" id="a" style="position:relative;display:block;width:240px;height:120px;pointer-events:none"><span id="s" style="position:absolute;left:0;top:0;pointer-events:auto">AUTOS</span></a>', '', `document.getElementById('s').onclick=function(){${CUENTA}}`)
  }
}

async function abrir(m: Modo) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? nuevoPresupuesto(m) : HOME
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
  return { context, page, ctx, notas, logs, guard }
}
const ESP = { menuMs: 4_000, paginaMs: 4_000, formularioMs: 4_000, reintentoMs: 1_500 }
const hayFormulario = async (p: Page) => (await p.getByText('Datos del vehículo').count()) > 0
const clics = (p: Page) => p.evaluate(() => (window as unknown as { __clics: number }).__clics)

// ─── Puras ───────────────────────────────────────────────────────────────────

const D = {
  bb: { w: 240, h: 120, x: 10.4, y: 300.6 }, vis: true, op: 0.5, vs: 'v', dp: 'block', pe: 'auto',
  anc: { tag: 'div', cls: 'envoltura', op: 1, pe: 'none' }, hit: { rel: 'otro', tag: 'div', cls: 'velo-modal' }, cookie: false, ifr: false, shd: false, anim: 2,
} as const

test('versión del explorador 0.3.44', async () => {
  const { EXPLORADOR_VERSION } = await import('../src/explorador.ts')
  assert.equal(EXPLORADOR_VERSION, '0.3.44')
})

test('diagnóstico: forma CERRADA, redondeada, acotada, sin forma de dato personal; la nota casa su regex', () => {
  const c = cuerpoDiagnosticoClic(D)
  assert.equal(c, 'bb=240x120@10,301 vis=1 op=0.5 vs=v dp=block pe=auto anc=div/envoltura/1/none hit=otro/div/velo-modal cookie=0 ifr=0 shd=0 anim=2')
  assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(c))
  assert.equal(pareceDatoPersonalInventario(`diag: ${c}`), false, 'no debe redactarse en asegura')
  const n = notaClicPelayo(D, true)
  assert.ok(RE_NOTA_CLIC_PELAYO.test(n), n)
  // Hostil: clases con basura / larguísimas / sin caja → siempre dentro de la forma cerrada.
  const raro = cuerpoDiagnosticoClic({ ...D, bb: null, anc: null, hit: { rel: 'ninguno' }, vs: 'o', dp: 'Inline Block!!', pe: '', op: Number.NaN, anim: 4000 })
  assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(raro), raro)
  const sucio = notaClicPelayo({ ...D, hit: { rel: 'otro', tag: 'DIV<script>', cls: 'ES91 2100 0418 4502 0005 1332 '.repeat(5) }, bb: { w: 1e9, h: -4, x: -1e9, y: 2 } }, false)
  assert.ok(RE_NOTA_CLIC_PELAYO.test(sucio), sucio)
  assert.ok(!/ /.test(sucio.slice('clic pelayo: '.length).split(' ').find((p) => p.startsWith('hit='))!))
  for (const mala of [`${n} IBAN ES91`, n.replace('ch=1', 'ch=2'), n.replace('hit=otro/div/velo-modal', 'hit=otro/div/Velo Modal'), ` ${n}`, `${n}\n`]) assert.equal(RE_NOTA_CLIC_PELAYO.test(mala), false, mala)
})

test('esTimeoutAccionabilidad: solo el TimeoutError de accionabilidad; si el clic YA se ejecutó, no se reintenta', () => {
  const t = (message: string, name = 'TimeoutError') => Object.assign(new Error(message), { name })
  assert.equal(esTimeoutAccionabilidad(t('locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator(\'a\')\n    - locator resolved to <a class="card">…</a>\n  - attempting click action\n    - waiting for element to be visible, enabled and stable')), true)
  assert.equal(esTimeoutAccionabilidad(t('<div class="velo"></div> intercepts pointer events')), true)
  assert.equal(esTimeoutAccionabilidad(t('locator.click: Timeout 1ms exceeded.\n  - attempting click action\n  - performing click action\n  - waiting for scheduled navigations to finish')), false)
  assert.equal(esTimeoutAccionabilidad(t('lo que sea, not visible', 'Error')), false)
  assert.equal(esTimeoutAccionabilidad(null), false)
})

// ─── Portal falso ────────────────────────────────────────────────────────────

test('tarjeta de ramo: el criterio estrecho (a.card + rótulo de ramo, origen Pelayo) la reconoce; COMERCIO es ramo de la lista, un enlace cualquiera no', async () => {
  const { context, page } = await abrir('normal')
  try {
    await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
    assert.deepEqual(await tarjetaRamoPelayoViva(page.locator('#a')), { texto: 'AUTOS' })
    await page.evaluate(() => { document.getElementById('a')!.classList.remove('card') })
    assert.equal(await tarjetaRamoPelayoViva(page.locator('#a')), null, 'sin la clase card no')
  } finally { await context.close() }
})

test('tarjeta normal: el clic robusto la pulsa y llega al formulario sin nota', async () => {
  const { context, page, ctx, notas } = await abrir('normal')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), true)
    assert.equal(await clics(dest), 1)
    assert.equal(notas.length, 0)
  } finally { await context.close() }
})

test('TAPADA por un velo: no se fuerza ni se pulsa nada; la nota dice qué intercepta (otro/div/velo-modal, no cookies) y la pantalla se vuelca', async () => {
  const { context, page, ctx, notas, logs } = await abrir('tapada')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), false)
    assert.equal(await clics(dest), 0, 'el manejador de la tarjeta NO se ejecutó (sin force)')
    const nota = notas.at(-1)!
    assert.ok(RE_NOTA_CLIC_PELAYO.test(nota), nota)
    assert.match(nota, /^clic pelayo: ch=0 bb=\d+x\d+@\d+,\d+ vis=1 op=1 vs=v dp=\w[\w-]* pe=auto anc=- hit=otro\/div\/velo-modal cookie=0 ifr=0 shd=0 anim=0 int=div\/velo-modal\/d0m1f0x0\/z0$/)
    assert.ok(logs.some((l) => l.startsWith('pelayo_clic_no_accionable ')))
  } finally { await context.close() }
})

test('banner de cookies que tapa la tarjeta: cookie=1 y NO se pulsa «Aceptar cookies» (la navegación libre no lo admite: queda como hueco)', async () => {
  const { context, page, ctx, notas } = await abrir('banner')
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    const nota = notas.at(-1)!
    assert.ok(RE_NOTA_CLIC_PELAYO.test(nota), nota)
    assert.match(nota, / hit=otro\/\w+\/onetrust-banner-sdk cookie=1 /)
    assert.equal(await page.evaluate(() => (window as unknown as { __ok?: number }).__ok ?? 0), 0, 'el botón del banner NO se pulsó')
    assert.equal(await clics(page), 0)
  } finally { await context.close() }
})

test('ANIMACIÓN (opacity 0 → 1 en 2,2 s): se espera a que termine y entonces se pulsa; el clic llega al formulario', async () => {
  const { context, page, ctx, notas } = await abrir('animacion')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', { ...ESP, formularioMs: 6_000 })
    assert.equal(await hayFormulario(dest), true, 'el manejador solo existe tras animationend: un clic antes no habría hecho nada')
    assert.equal(await clics(dest), 1)
    assert.equal(notas.length, 0)
  } finally { await context.close() }
})

test('la espera de animaciones es REAL: pulsada nada más cargar, el clic llega DESPUÉS de animationend (≥ ~1,5 s) y cuenta una vez', async () => {
  const { context, page, guard } = await abrir('animacion')
  try {
    await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
    const t0 = Date.now()
    await pulsarTarjetaRamoPelayo(page.locator('#a'), guard, 'AUTOS')
    assert.ok(Date.now() - t0 >= 1_200, `esperó ${Date.now() - t0} ms`)
    assert.equal(await clics(page), 1)
  } finally { await context.close() }
})

test('diagnóstico a media animación: opacidad < 1, animaciones en curso y el propio elemento en el centro', async () => {
  const { context, page } = await abrir('animacion')
  try {
    await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
    const d = await leerDiagnosticoClic(page.locator('#a'))
    assert.ok(d)
    assert.ok(d.op < 1 && d.anim >= 1, JSON.stringify(d))
    assert.equal(d.vis, true, 'Playwright da por visible un elemento con opacity 0: la causa es la animación, no la visibilidad')
    assert.equal(d.hit.rel, 'propio')
    assert.ok(d.bb && d.bb.w > 0 && d.bb.h > 0)
  } finally { await context.close() }
})

test('POINTER-EVENTS:NONE en un ancestro: no se pulsa; el diagnóstico señala al ancestro (div/envoltura/pe none) y que el centro lo recibe otro elemento', async () => {
  const { context, page, ctx, notas } = await abrir('pe_ancestro')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), false)
    assert.equal(await clics(dest), 0)
    const nota = notas.at(-1)!
    assert.ok(RE_NOTA_CLIC_PELAYO.test(nota), nota)
    assert.match(nota, / pe=none anc=div\/envoltura\/1\/none hit=otro\/\w+\/(?:-|[\w-]+) cookie=0 /)
  } finally { await context.close() }
})

test('HIJO de texto exacto: si la tarjeta no recibe el clic pero su <span> sí, se pulsa el hijo (por la puerta del guard) y llega al formulario', async () => {
  const { context, page, ctx, notas } = await abrir('hijo')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(await hayFormulario(dest), true)
    assert.equal(await clics(dest), 1)
    assert.equal(notas.length, 0)
  } finally { await context.close() }
})

test('cepo: el clic robusto no usa force ni dispatchEvent y el fichero de diagnóstico no pulsa nada', async () => {
  const { readFileSync } = await import('node:fs')
  const guard = readFileSync(new URL('../src/guard.ts', import.meta.url), 'utf8')
  const ini = guard.indexOf('export async function pulsarTarjetaRamoPelayo')
  const cuerpo = guard.slice(ini, guard.indexOf('/** 0.3.33: etiquetas (normalizadas) de ramo de Pelayo', ini))
  assert.ok(ini > 0 && cuerpo.length > 500)
  assert.doesNotMatch(cuerpo.replace(/\/\/.*$/gm, '').replace(/\/\*[^]*?\*\//g, ''), /force|dispatchEvent|evaluate\(\s*\(?\s*\w*\s*\)?\s*=>\s*\w*\.click/)
  const diag = readFileSync(new URL('../src/diagnostico-clic.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(diag, /\.(click|dblclick|tap|hover|fill|press|check|dispatchEvent)\s*\(/)
})
