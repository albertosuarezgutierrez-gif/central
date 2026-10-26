// Generali Turismos v0.2.20 (22/10/2026, trabajo 304ac3a2 con 0.2.19): el tomador seguía vacío. Pestaña «Personas» + inventario saneado.
// Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import {
  MEDIADOR_GENERALI,
  camposInteresadoGenerali,
  motivoCampoInteresadoGenerali,
  motivosInteresadoGenerali,
  resumenPersonasGenerali,
  type ControlPersonasGenerali,
} from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO, leerPersonasGenerali, rellenarInteresadoGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const ctl = (sufijo: string, extra: Partial<ControlPersonasGenerali> = {}): ControlPersonasGenerali => ({ id: `${P}${sufijo}`, tag: 'input', tipo: 'text', visible: true, habilitado: true, editable: true, vacio: true, ...extra })

test('v0.2.20 · versión (vigente 0.2.27)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.27'))

test('v0.2.20 · motivo por campo', () => {
  const base = { existe: true, visible: true, habilitado: true, editable: true, vacio: true }
  assert.equal(motivoCampoInteresadoGenerali(base), 'ok')
  assert.equal(motivoCampoInteresadoGenerali({ ...base, existe: false }), 'no_existe')
  assert.equal(motivoCampoInteresadoGenerali({ ...base, visible: false }), 'oculto')
  assert.equal(motivoCampoInteresadoGenerali({ ...base, habilitado: false }), 'deshabilitado')
  assert.equal(motivoCampoInteresadoGenerali({ ...base, editable: false }), 'solo_lectura')
  assert.equal(motivoCampoInteresadoGenerali({ ...base, vacio: false }), 'con_valor')
})

test('v0.2.20 · resumen del bloque: sin valores, con banderas y rótulos saneados', () => {
  const r = resumenPersonasGenerali([
    ctl('interesado_nifcif', { visible: false }),
    ctl('interesado_ynidcl', { tag: 'select', tipo: 'select', habilitado: false, editable: false, vacio: false }),
    ctl('roles_lnkPers', { tipo: 'button', vacio: false, texto: 'Buscar 12345678Z' }),
  ])
  assert.match(r, /interesado_nifcif \[input\/text,oculto\] vacío/)
  assert.match(r, /interesado_ynidcl \[select\/select,deshab,ro\] con valor/)
  assert.match(r, /roles_lnkPers \[input\/button\] «Buscar \[doc\]»/)
  assert.ok(!/12345678Z/.test(r))
  assert.match(resumenPersonasGenerali([]), /ningún control/)
})

test('v0.2.20 · motivos cruzan campos del riesgo con controles', () => {
  const campos = camposInteresadoGenerali({ documentoTomador: '00000000T', datosTomador: { tipo: 'fisica', nombre: 'Ana', apellido1: 'Pérez', fechaNacimiento: '1980-05-17' } })
  const m = motivosInteresadoGenerali(campos, [ctl('interesado_nifcif', { visible: false }), ctl('interesado_nombre')])
  assert.match(m, /nifcif:oculto/)
  assert.match(m, /nombre:ok/)
  assert.match(m, /papell:no_existe/)
  assert.match(motivosInteresadoGenerali([], []), /no trae datos/)
})

test('v0.2.20 · fecha de nacimiento y carné caen a fichaTomador', () => {
  const c = camposInteresadoGenerali({ fichaTomador: { documento: '00000000T', fechaNacimiento: '1980-05-17', fechaCarnet: '2000-06-01' } })
  assert.deepEqual(c.map((x) => [x.campo, x.valor]), [['nifcif', '00000000T'], ['ffnain', '17/05/1980'], ['ffcain', '01/06/2000']])
})

// ───────────────────────── con navegador ─────────────────────────

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
after(async () => {
  await browser?.close()
})

const PORTAL = `https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}`

async function abrir(html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.request().url().startsWith(PORTAL.split('?')[0]!) ? `<!doctype html><body>${html}</body>` : '<body>otra</body>' }))
  await page.goto(PORTAL)
  return { page, guard, cerrar: () => context.close() }
}

const ctxDe = (guard: GuardEmision) => ({ pausaAccion: async () => {}, pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard), log: () => {} }) as unknown as ContextoPortal

const BLOQUE = `<div id="personas" style="display:none">
  <input id="${P}roles_lnkPers" type="button" value="Buscar persona">
  <input id="${P}interesado_nombre" type="text"><input id="${P}interesado_papell" type="text"><input id="${P}interesado_sapell" type="text">
  <input id="${P}interesado_nifcif" type="text"><input id="${P}interesado_ffnain" type="text"><input id="${P}interesado_ffcain" type="text">
  <select id="${P}interesado_ynidcl" disabled><option value="0">Persona física</option></select>
</div>`
const PESTANAS = `<input type="button" value="Vehículo"><input type="button" id="pers" value="Personas" onclick="document.getElementById('personas').style.display='block'">`
const FORM = { documentoTomador: '00000000T', datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' }, conductor: { fechaCarne: '2000-06-01' } }

test('v0.2.20 · campos ocultos tras la pestaña «Personas»: se pulsa una vez y se rellena el tomador', async () => {
  const { page, guard, cerrar } = await abrir(PESTANAS + BLOQUE)
  try {
    const hechos = await rellenarInteresadoGenerali(page.mainFrame(), FORM, ctxDe(guard))
    assert.ok(hechos.includes('pestana.personas'), hechos.join(','))
    assert.equal(await page.locator(`[id="${P}interesado_nifcif"]`).inputValue(), '00000000T')
    assert.equal(await page.locator(`[id="${P}interesado_nombre"]`).inputValue(), 'Ana')
    assert.equal(await page.locator(`[id="${P}interesado_ffnain"]`).inputValue(), '17/05/1980')
    // El buscador de personas NO se toca.
    assert.equal(await page.locator(`[id="${P}roles_lnkPers"]`).evaluate((e) => (e as HTMLInputElement).value), 'Buscar persona')
    const inv = await leerPersonasGenerali(page)
    const r = resumenPersonasGenerali(inv)
    assert.match(r, /roles_lnkPers \[input\/button\] «Buscar persona»/)
    assert.ok(!/00000000T|Ana|Pérez/.test(r), r)
  } finally {
    await cerrar()
  }
})

test('v0.2.20 · campos ya visibles: no se pulsa ninguna pestaña', async () => {
  const { page, guard, cerrar } = await abrir(PESTANAS + BLOQUE.replace('display:none', 'display:block'))
  try {
    const hechos = await rellenarInteresadoGenerali(page.mainFrame(), FORM, ctxDe(guard))
    assert.ok(!hechos.includes('pestana.personas'))
    assert.ok(hechos.includes('tomador.nifcif'))
  } finally {
    await cerrar()
  }
})

test('v0.2.20 · campos de solo lectura: no se escribe y el diagnóstico lo dice', async () => {
  const { page, guard, cerrar } = await abrir(BLOQUE.replace('display:none', 'display:block').replace(`id="${P}interesado_nifcif" type="text"`, `id="${P}interesado_nifcif" type="text" readonly`))
  try {
    const hechos = await rellenarInteresadoGenerali(page.mainFrame(), FORM, ctxDe(guard))
    assert.ok(!hechos.includes('tomador.nifcif'))
    const m = motivosInteresadoGenerali(camposInteresadoGenerali(FORM), await leerPersonasGenerali(page))
    assert.match(m, /nifcif:solo_lectura/)
  } finally {
    await cerrar()
  }
})
