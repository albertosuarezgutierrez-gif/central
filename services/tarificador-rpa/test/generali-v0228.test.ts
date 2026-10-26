// Generali Turismos v0.2.28 (26/10/2026, prueba real con 0.2.27): tras «Confirmar» de «Datos personas» el bot vuelve a emiAutosGenB028.do con botones
// solo «Vehículo»/«Personas», pestañas de sección (sin «Datos de Valoración») y SIN #siguiente; se atascaba sin decir por qué el gate de «Siguiente» no actuó.
// Ahora el atasco lleva, al principio, el motivo del gate y la lista de controles de navegación de todos los marcos. Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { validarFormularioAuto, EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'
import { resumenNavegacionGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, volcarNavegacionGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, pulsarSiguienteValoracionGenerali, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.28 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.28'))

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

const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'

/** Lo visto tras «Confirmar»: secciones como pestañas, solo botones «Vehículo»/«Personas», tomador ya en solo lectura. Sin #siguiente. */
const TRAS_CONFIRMAR = `<ul class="tabs"><li class="current"><a href="#">General</a></li><li><a href="#">Vehículo</a></li><li><a href="#">Personas que intervienen</a></li></ul>
  <fieldset><legend>Identificación del vehículo</legend><label for="m">Matrícula</label><input id="m" value="SECRETO-MAT" readonly></fieldset>
  <input id="reg1063A_personas_interesado_nifcif" type="text" value="SECRETO-NIF" readonly>
  <input id="reg1063A_personas_interesado_nombre" type="text" value="SECRETO-NOMBRE" readonly>
  <input id="btnVehiculo" name="bVeh" type="button" value="Vehículo" onclick="parent.__x=(parent.__x||0)+1">
  <input id="btnPersonas" type="button" value="Personas" onclick="parent.__x=(parent.__x||0)+1">
  <a href="#" onclick="parent.__x=(parent.__x||0)+1;return false">Paso con datos incompletos</a>`

async function abrir(cuerpo = TRAS_CONFIRMAR): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    const html = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>` : cuerpo
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${html}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  for (let i = 0; i < 40 && !page.frames().some((f) => f.name() === 'mainFrame' && f.url().startsWith(B028)); i++) await new Promise((x) => setTimeout(x, 100))
  await page.frames().find((f) => f.name() === 'mainFrame')!.locator('#btnPersonas').waitFor()
  return { page, guard, cerrar: () => context.close() }
}
const clics = (page: Page) => page.evaluate(() => (window as unknown as { __x?: number }).__x ?? 0)

const coche = (): FormularioAuto => {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}

test('v0.2.28 · inventario de navegación: botones de todos los marcos con id/name/texto, pestañas con la activa, SIN valores de campos de datos', async () => {
  const { page, cerrar } = await abrir()
  try {
    const nav = await volcarNavegacionGenerali(page)
    const r = resumenNavegacionGenerali(nav, 2_000)
    assert.match(r, /mainFrame\(emiAutosGenB028\.do\)/, r)
    assert.match(r, /input:button#btnVehiculo\/bVeh «Vehículo» v/, r)
    assert.match(r, /input:button#btnPersonas «Personas» v/, r)
    assert.match(r, /a «Paso con datos incompletos» v/, r)
    assert.match(r, /General\*/, r)
    assert.doesNotMatch(r, /Vehículo\*/, r)
    assert.doesNotMatch(r, /SECRETO/, r)
    assert.equal(await clics(page), 0, 'solo lee')
  } finally {
    await cerrar()
  }
})

test('v0.2.28 · atasco tras Confirmar: el mensaje trae PRONTO el motivo del gate de «Siguiente» y los controles, y no se pulsa nada', async () => {
  const { page, guard, cerrar } = await abrir()
  try {
    const ctx = {
      pausaAccion: async () => {},
      pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard),
      log: () => {},
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: () => pulsarSiguienteValoracionGenerali(page, guard, 50),
    } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 500 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      const m = e.message
      assert.match(m, /ningún importe legible/)
      assert.match(m, /Avance: Siguiente×1 no pulsado: .*fuera de «Valoración Riesgo»/, m)
      assert.match(m, /Navegación: .*#btnPersonas «Personas» v/, m)
      assert.doesNotMatch(m, /SECRETO/)
      // Con el corte a 2000 del runner, el motivo y la navegación tienen que seguir dentro.
      assert.ok(m.indexOf('Navegación:') < 1_500 && m.indexOf('Avance:') < m.indexOf('Navegación:'), `${m.indexOf('Avance:')} ${m.indexOf('Navegación:')}`)
      return true
    })
    assert.equal(await clics(page), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.28 · el gate NO se amplía: en esa pantalla (sin #siguiente) sigue bloqueando', async () => {
  const { page, guard, cerrar } = await abrir()
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), EmisionBloqueadaError)
    assert.equal(await clics(page), 0)
  } finally {
    await cerrar()
  }
})
