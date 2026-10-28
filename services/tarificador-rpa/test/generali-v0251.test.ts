// Generali Turismos v0.2.51 (28/10/2026, prueba real con 0.2.50, trabajo d8584313): «Tipo de vehículo» (`wclasv`, solo lectura) seguía vacío con el
// selector bien marcado. Antes de declararlo vacío el bot ESPERA (hasta 15 s) a que el portal lo rellene y a que no quede nada con controlbloqueo="1";
// la parada dice lo esperado y el último refresco (`ocultoIF`). Fixtures SINTÉTICAS (estructura Genernet).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, tareaRefrescoGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.51 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.51'))

test('v0.2.51 · puro: tarea del último refresco sin valores', () => {
  assert.equal(tareaRefrescoGenerali('https://www.generali.es/emi_genAutosFormWeb/refreshEmiAutosGenA.do?tarea=updatedCampoSini&valueParameter=x&x=C0109'), 'refreshEmiAutosGenA.do tarea=updatedCampoSini')
  assert.equal(tareaRefrescoGenerali('https://www.generali.es/arq_resourcesFormWeb/20090108.0/arq/html/blanco.html'), '(ninguno)')
  assert.equal(tareaRefrescoGenerali('about:blank'), '(ninguno)')
  assert.equal(tareaRefrescoGenerali(undefined), '(ninguno)')
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
after(async () => { await browser?.close() })

const P = 'reg1063A_vehiculo_caracVehiculo_'
const bloque = (id: string, rotulo: string, controles: string) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"><div class="falseInline column1"><span>${rotulo}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const protegido = (id: string, valor: string) => `<input type="text" name="${P}${id}" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}">`
/** «Tipo de vehículo» vacío que el portal rellena a los `tardaMs` (si ≥ 0). */
const VALORACION = (tardaMs: number) => `<fieldset><legend><span>Características del vehículo</span></legend>${bloque('wclavh', 'Clase de vehículo', protegido('wclavh', 'TURISMO'))}${bloque('wclasv', 'Tipo de vehículo', protegido('wclasv', ''))}</fieldset><h3>Identificación del vehículo</h3>
  <script>if (${tardaMs} >= 0) setTimeout(() => { document.getElementById('${P}wclasv').value = 'TURISMO PARTICULAR' }, ${tardaMs})</script>`
const SEL = 'ra' + 'dio'
const GARANTIAS = `<h3>Garantías y Resultados</h3><div id="areaNegocio"><table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody><tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr></tbody></table></div>`

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
async function conPagina(html: string, fn: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.51 · caso d8584313: el portal rellena «Tipo de vehículo» TARDE (1,5 s) → se espera y se sigue hasta el precio', async () => {
  await conPagina(VALORACION(1_500), async (page) => {
    let pulsada = 0
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => { pulsada++; await page.setContent(`<html><body>${GARANTIAS}</body></html>`) } } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 6_000 })
    assert.equal(pulsada, 1)
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
})

test('v0.2.51 · si nunca llega: para tras la espera diciendo lo esperado y el último refresco', async () => {
  await conPagina(VALORACION(-1), async (page) => {
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => {} } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 1_000 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match((e as Error).message, /: Tipo de vehículo\. No se pasa a «Garantías y Resultados»\. Esperado 1 s \(v0\.2\.51\): bloqueados por refresco 0; último refresco del portal: \(ninguno\)\./)
      return true
    })
  })
})
