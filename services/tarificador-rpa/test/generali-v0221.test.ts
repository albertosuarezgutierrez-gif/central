// Generali Turismos v0.2.21 (22/10/2026, trabajo 304ac3a2 con 0.2.20): «ffnain/ffcain no_existe» era el tope de 60 del lector llenado de `div`.
// Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { MEDIADOR_GENERALI, motivosInteresadoGenerali, camposInteresadoGenerali, resumenPersonasGenerali, type ControlPersonasGenerali } from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO, leerPersonasGenerali, localizarPestanaPersonasGenerali, rellenarInteresadoGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const ctl = (sufijo: string, extra: Partial<ControlPersonasGenerali> = {}): ControlPersonasGenerali => ({ id: `${P}${sufijo}`, tag: 'input', tipo: 'text', visible: true, habilitado: true, editable: true, vacio: true, ...extra })

test('v0.2.21 · versión (vigente 0.2.27)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.27'))

test('v0.2.21 · resumen: los contenedores no cuentan, radios juntos con marcados y opción del desplegable de roles', () => {
  const r = resumenPersonasGenerali([
    ctl('rolesIdentification', { tag: 'div' }),
    ctl('roles_zprieqIdentification', { tag: 'div' }),
    ctl('roles_zprieq', { tipo: 'radio', vacio: false, marcado: false }),
    ctl('roles_zprieq', { tipo: 'radio', vacio: false, marcado: true }),
    ctl('roles_ycond1', { tag: 'select', tipo: 'select', vacio: false, opcion: 'TOMADOR' }),
    ctl('interesado_ffnain'),
  ])
  assert.ok(!/Identification/.test(r), r)
  assert.match(r, /roles_zprieq \[radio×2, marcados 1\]/)
  assert.match(r, /roles_ycond1 \[select\/select\] =«TOMADOR» con valor/)
  assert.match(r, /interesado_ffnain \[input\/text\] vacío/)
  assert.equal(resumenPersonasGenerali([ctl('x', { tag: 'div' })]), 'solo contenedores, ningún control')
})

test('v0.2.21 · el motivo ya no dice no_existe si el control está tras decenas de contenedores', () => {
  const muchos = Array.from({ length: 70 }, (_, i) => ctl(`c${i}Identification`, { tag: 'div' }))
  const m = motivosInteresadoGenerali([{ campo: 'ffnain' }], [...muchos, ctl('interesado_ffnain')])
  assert.equal(m, 'ffnain:ok')
})

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

const DIVS = Array.from({ length: 70 }, (_, i) => `<div id="${P}rolesX${i}Identification"></div>`).join('')
const BLOQUE = `<div id="personas" style="display:none">${DIVS}
  <input type="radio" name="z" id="${P}roles_zprieq"><input type="radio" name="z" id="${P}roles_zprieq">
  <select id="${P}roles_ycond1"><option>TOMADOR</option><option>OTRO</option></select>
  <input id="${P}roles_lnkPers" type="button" value="Buscar">
  <input id="${P}interesado_nombre" type="text"><input id="${P}interesado_papell" type="text"><input id="${P}interesado_sapell" type="text">
  <input id="${P}interesado_nifcif" type="text"><input id="${P}interesado_ffnain" type="text"><input id="${P}interesado_ffcain" type="text">
</div>`
const FORM = { documentoTomador: '00000000T', datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' }, conductor: { fechaCarne: '2000-06-01' } }

test('v0.2.21 · pestaña «Personas» que es un <li onclick> (no botón): se halla por texto, se pulsa y se rellena; el lector ve ffnain tras 70 divs', async () => {
  const pestana = `<ul><li>Vehículo</li><li id="pers" onclick="document.getElementById('personas').style.display='block'">Personas</li></ul>`
  const { page, guard, cerrar } = await abrir(pestana + BLOQUE)
  try {
    const omitidos: string[] = []
    const hechos = await rellenarInteresadoGenerali(page.mainFrame(), FORM, ctxDe(guard), omitidos)
    assert.ok(hechos.includes('pestana.personas'), `${hechos.join(',')} | ${omitidos.join(',')}`)
    assert.equal(await page.locator(`[id="${P}interesado_ffnain"]`).inputValue(), '17/05/1980')
    const inv = await leerPersonasGenerali(page)
    assert.ok(inv.every((c) => !/^(div|fieldset)$/.test(c.tag)))
    assert.equal(motivosInteresadoGenerali(camposInteresadoGenerali(FORM), inv).includes('no_existe'), false)
    assert.equal(inv.find((c) => c.id.endsWith('roles_ycond1'))?.opcion, 'TOMADOR')
    assert.equal(inv.filter((c) => c.id.endsWith('roles_zprieq')).every((c) => c.marcado === false), true)
    // Los radios, el desplegable de roles y el buscador de personas NO se tocan.
    assert.equal(await page.locator(`[id="${P}roles_ycond1"]`).inputValue(), 'TOMADOR')
  } finally {
    await cerrar()
  }
})

test('v0.2.21 · sin pestaña localizable: no se pulsa nada y el motivo queda dicho', async () => {
  const { page, guard, cerrar } = await abrir(BLOQUE)
  try {
    const omitidos: string[] = []
    const hechos = await rellenarInteresadoGenerali(page.mainFrame(), FORM, ctxDe(guard), omitidos)
    assert.deepEqual(hechos, [])
    assert.ok(omitidos.some((o) => o.startsWith('pestana:no_hallada(')), omitidos.join(','))
    assert.ok(omitidos.includes('nifcif:oculto'), omitidos.join(','))
    const { control } = await localizarPestanaPersonasGenerali(page.mainFrame())
    assert.equal(control, null)
  } finally {
    await cerrar()
  }
})
