// Explorador 0.3.45 (04/11/2026) · PERMISOS DE NAVEGACIÓN DE BD en el worker (guard VIVO). Portal SINTÉTICO (sin PII): `page.route`
// sirve solo las URLs exactas; el resto cae al guard de contexto y a un proxy muerto.
//   · ruta exacta de BD: tolerada SOLO en navegación GET; un POST a la misma URL sigue bloqueado; otra ruta, bloqueada;
//   · avance de BD: pulsa SOLO el control exacto (texto, marco, tag, contenedor, único, sin precio) y hasta su `maxUsos`;
//   · los permisos se REVALIDAN al fijarlos: uno forjado con un verbo final no llega al guard; dos veces = fase.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, permisosNavegacionDe, type ElementoInventario, type PermisosNavegacion } from '@central/module-tarificacion'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import { fijarPermisosNavegacion, instalarGuardEmision, permisosNavegacionEn, pulsar, pulsarExploracionAutorizada, type GuardEmision } from '../src/guard.ts'

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
after(async () => { await browser?.close() })

const E = 'pelayo:presupuestos:auto'
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DATOS = 'https://mediadores.pelayo.com/portalmediador-datos'
const RUTA_BD = 'https://apps.pelayo.com/contratacion-autos/drivers'
const permisos = (filas: unknown[]): PermisosNavegacion => permisosNavegacionDe(E, filas).permisos
const filaRuta = (pulsable = false) => ({ id: ID(1), entrada: E, tipo: 'ruta_tolerada', datos: { origen: 'https://apps.pelayo.com', ruta: '/contratacion-autos/drivers', pulsable } })
const filaAvance = (extra: Record<string, unknown> = {}) => ({ id: ID(2), entrada: E, tipo: 'avance_texto', datos: { texto: 'Aceptar', origen: 'https://mediadores.pelayo.com', rutaMarco: '/portalmediador-datos', tag: 'button', contenedor: 'section.aviso', maxUsos: 2, ...extra } })

async function abrir(html: string, p: PermisosNavegacion | null): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  if (p) fijarPermisosNavegacion(guard, p, 'pelayo')
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.route('https://**/*', (route) => (route.request().url() === DATOS ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.fallback()))
  await page.goto(DATOS)
  return { context, page, guard }
}

const PAGINA_NAV = (destino: string, metodo: 'get' | 'post') => `<!doctype html><html><body><h1>Datos</h1>
<form id="f" method="${metodo}" action="${destino}"><input name="x" value="1"></form>
<button type="button" id="ir">Ir</button>
<script>document.getElementById('ir').addEventListener('click', () => { ${metodo === 'get' ? `location.href = ${JSON.stringify(destino)}` : `document.getElementById('f').submit()`} })</script>
</body></html>`

test('versión del explorador 0.3.45', () => assert.equal(EXPLORADOR_VERSION, '0.3.45'))

test('ruta exacta de BD: la navegación GET pasa; sin el permiso, el guard la corta', async () => {
  for (const [p, esperaViolacion] of [[permisos([filaRuta()]), false], [null, true]] as const) {
    const { context, page, guard } = await abrir(PAGINA_NAV(RUTA_BD, 'get'), p)
    try {
      // Un bloqueo de red hace que `pulsar` lance tras el clic (guard.comprobar): lo que cuenta es la violación registrada.
      await pulsar(page.locator('#ir'), guard).catch(() => undefined)
      await page.waitForTimeout(400)
      assert.equal(guard.violacion() !== null, esperaViolacion, String(guard.violacion()))
    } finally {
      await context.close()
    }
  }
})

test('BRAZO ruta de BD: un POST a la MISMA URL sigue bloqueado (solo GET)', async () => {
  const { context, page, guard } = await abrir(PAGINA_NAV(RUTA_BD, 'post'), permisos([filaRuta()]))
  try {
    await pulsar(page.locator('#ir'), guard).catch(() => undefined)
    await page.waitForTimeout(400)
    assert.ok(guard.violacion() instanceof EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})

test('BRAZO ruta de BD: otra ruta del mismo prefijo sigue bloqueada', async () => {
  const { context, page, guard } = await abrir(PAGINA_NAV('https://apps.pelayo.com/contratacion-autos/payment', 'get'), permisos([filaRuta()]))
  try {
    await pulsar(page.locator('#ir'), guard).catch(() => undefined)
    await page.waitForTimeout(400)
    assert.ok(guard.violacion() instanceof EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})

const PAGINA_AVANCE = (cuerpo: string) => `<!doctype html><html><body><h1>Datos del conductor</h1>${cuerpo}
<div id="hecho"></div>
<script>for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => { document.getElementById('hecho').textContent = (document.getElementById('hecho').textContent || '') + 'x' })</script>
</body></html>`
const ACEPTAR = '<section class="aviso"><p>Revise los datos.</p><button type="button" id="ok">Aceptar</button></section>'
const el: ElementoInventario = { tag: 'button', texto: 'Aceptar', id: 'ok', type: 'button' }
const marco = (elementos: ElementoInventario[] = [el], extra = {}) => ({ url: DATOS, nombre: null, elementos, ...extra })
const pulsarBd = (page: Page, guard: GuardEmision, m = marco()) => pulsarExploracionAutorizada(page, guard, page.locator('#ok'), { entrada: E, el, marco: m })

test('avance de BD: el «Aceptar» exacto se pulsa, hasta su maxUsos', async () => {
  const { context, page, guard } = await abrir(PAGINA_AVANCE(ACEPTAR), permisos([filaAvance()]))
  try {
    assert.equal(permisosNavegacionEn(guard)?.avances.length, 1)
    await pulsarBd(page, guard)
    await pulsarBd(page, guard)
    assert.equal(await page.locator('#hecho').textContent(), 'xx')
    await assert.rejects(pulsarBd(page, guard), /ya se usó 2 veces/)
    assert.equal(await page.locator('#hecho').textContent(), 'xx')
  } finally {
    await context.close()
  }
})

test('BRAZO avance sin permiso de BD: no se pulsa', async () => {
  const { context, page, guard } = await abrir(PAGINA_AVANCE(ACEPTAR), null)
  try {
    await assert.rejects(pulsarBd(page, guard), EmisionBloqueadaError)
    assert.equal(await page.locator('#hecho').textContent(), '')
  } finally {
    await context.close()
  }
})

test('BRAZOS avance de BD vivo: fuera del contenedor, dos «Aceptar», precio a la vista o título de emisión → no se pulsa', async () => {
  const casos: [string, RegExp][] = [
    ['<div><button type="button" id="ok">Aceptar</button></div>', /contenedor/],
    [`${ACEPTAR}<button type="button" id="ok2">Aceptar</button>`, /no_unico/],
    [`${ACEPTAR}<p>Prima total: <span>312,40 €</span></p>`, /precio/],
    [`<h2>Resumen y contratación</h2>${ACEPTAR}`, /título vivo/],
  ]
  for (const [cuerpo, re] of casos) {
    const { context, page, guard } = await abrir(PAGINA_AVANCE(cuerpo), permisos([filaAvance()]))
    try {
      await assert.rejects(pulsarBd(page, guard), re, cuerpo)
      assert.equal(await page.locator('#hecho').textContent(), '', cuerpo)
    } finally {
      await context.close()
    }
  }
})

test('BRAZO permisos FORJADOS (verbo final) se revalidan al fijarlos y se caen; fijar dos veces = fase', async () => {
  const forjado: PermisosNavegacion = { entrada: E, rutas: [], avances: [{ id: ID(3), texto: 'aceptar y emitir', origen: 'https://mediadores.pelayo.com', rutaMarco: '/portalmediador-datos', tag: 'button', contenedor: null, maxUsos: 3 }] }
  const html = PAGINA_AVANCE('<button type="button" id="ok">Aceptar y emitir</button>')
  const { context, page, guard } = await abrir(html, forjado)
  try {
    assert.equal(permisosNavegacionEn(guard)?.avances.length, 0)
    const elE: ElementoInventario = { tag: 'button', texto: 'Aceptar y emitir', id: 'ok', type: 'button' }
    await assert.rejects(pulsarExploracionAutorizada(page, guard, page.locator('#ok'), { entrada: E, el: elE, marco: marco([elE]) }), EmisionBloqueadaError)
    assert.equal(await page.locator('#hecho').textContent(), '')
    assert.throws(() => fijarPermisosNavegacion(guard, permisos([filaAvance()]), 'pelayo'), EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})
