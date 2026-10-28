// Generali Turismos v0.2.44 (28/10/2026, prueba real con 0.2.43, trabajo dd2067b2): Genernet decía «El paso anterior no tiene los datos completos» y el atasco
// contestaba «obligatorios vacíos en «Datos de Valoración»: (ninguno detectado)». Ese lector contaba un desplegable en «Seleccione…» como relleno y no veía
// grupos de opciones sin marcar. Fixtures SINTÉTICAS (estructura de Genernet, sin datos reales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, leerEstadoBloquesGenerali } from '../src/adapters/generali/auto.ts'
import { obligatoriosVaciosGenerali, resumenEstadoCalculoGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.44 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.49'))

test('v0.2.44 · puro: un desplegable obligatorio en «Seleccione…» cuenta como VACÍO; los avisos de «Datos de Valoración» salen en el resumen', () => {
  assert.deepEqual(obligatoriosVaciosGenerali([
    { etiqueta: 'Uso del vehículo *', obligatorio: true, valor: 'Seleccione una opción' },
    { etiqueta: 'Tipo de garaje *', obligatorio: true, valor: 'Colectivo' },
    { etiqueta: 'Observaciones', obligatorio: false, valor: 'Seleccione' },
  ]), ['Uso del vehículo'])
  const r = resumenEstadoCalculoGenerali(null, ['Uso del vehículo'], 600, ['Paso con datos incompletos'])
  assert.match(r, /obligatorios vacíos en «Datos de Valoración»: Uso del vehículo; avisos en «Datos de Valoración»: «Paso con datos incompletos»;/)
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

const SEL = 'ra' + 'dio'
const BLOQUE = (id: string, etiqueta: string, controles: string) =>
  `<div class="trueInline simple" id="${id}Identification"><div class="falseInline column1"><span>${etiqueta}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
/** «Datos de Valoración» con dos obligatorios que el lector viejo NO veía: desplegable en «Seleccione…» y grupo de opciones sin marcar. */
const VALORACION = `<h3>Identificación del vehículo</h3><div id="areaErrores" style="display:block;"><ol><li class="information"><a>Paso con datos incompletos</a></li></ol></div><div id="areaNegocio">`
  + BLOQUE('uso', 'Uso del vehículo', '<select name="reg1E.uso"><option>Seleccione una opción</option><option>Particular</option></select>')
  + BLOQUE('gar', 'Garaje nocturno', `<input type="${SEL}" name="reg1E.garaje" value="S"> <span> Sí </span><input type="${SEL}" name="reg1E.garaje" value="N"> <span> No </span>`)
  + BLOQUE('com', 'Combustible', '<select name="reg1E.comb"><option>Seleccione una opción</option><option selected>Gasolina</option></select>')
  + `</div>`
const GARANTIAS = `<h3>Garantías y Resultados</h3><div id="areaErrores" style="display:block;"><ol><li class="lowError"><a value="Empty_Property">El paso anterior no tiene los datos completos</a></li></ol></div><div id="areaNegocio"><table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody></tbody></table></div><ul id="Menu2"><li onclick="return false;"><a class="btn">Recalcular</a></li></ul>`

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.44 · lector por bloques de «Datos de Valoración» (sin exigir B028): «Seleccione…» y grupo sin marcar son vacíos; lo relleno no sale', async () => {
  await conPagina(VALORACION, async (page) => {
    const e = await leerEstadoBloquesGenerali(page)
    assert.ok(e)
    assert.deepEqual(e.obligatoriosVacios, ['Uso del vehículo', 'Garaje nocturno'])
    assert.deepEqual(e.avisos, ['Paso con datos incompletos'])
  })
})

test('v0.2.44 · el atasco nombra los obligatorios vacíos de «Datos de Valoración» y qué bloques de decisión había antes de «Recalcular»', async () => {
  let recalculos = 0
  await conPagina(VALORACION, async (page) => {
    const ctx = {
      pulsar: async () => { throw new Error('no debe pulsar nada') },
      pulsarSubpestanaGenerali: async () => { await page.setContent(`<html><body>${GARANTIAS}</body></html>`) },
      pulsarSiguienteGenerali: async () => ({ dialogo: null }),
      pulsarRecalcularGenerali: async () => { recalculos++; return { dialogo: null } },
    } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /obligatorios vacíos en «Datos de Valoración»: Uso del vehículo · Garaje nocturno;/, e.message.slice(0, 900))
      assert.match(e.message, /avisos en «Datos de Valoración»: «Paso con datos incompletos»/)
      assert.match(e.message, /Bloques antes de Recalcular: forma de pago sin bloque a la vista, envío e-mail sin bloque a la vista, verificación del riesgo sin bloque a la vista\./)
      assert.ok(e.message.length <= 1_900, String(e.message.length))
      return true
    })
  })
  assert.equal(recalculos, 1)
})
