// Generali Turismos v0.2.49 (28/10/2026, prueba real con 0.2.48, trabajo a12d2139): Genernet no calcula («El paso anterior no tiene los datos completos»)
// porque «Tipo de vehículo» quedó vacío. Ese campo es un TEXTO DE SOLO LECTURA (`reg1063A_vehiculo_caracVehiculo_wclasv`, `protegidoState`) que pone el portal
// con el vehículo elegido. El bot PARA antes de «Garantías y Resultados» con el inventario de «Características del vehículo». Fixtures SINTÉTICAS con la
// estructura del volcado real (bloques `.simple` de Genernet).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, leerCaracteristicasVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import { resumenCaracteristicasVehiculoGenerali, vaciosProtegidosGenerali, type BloqueVehiculoGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.49 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.50'))

const b = (rotulo: string, o: Partial<BloqueVehiculoGenerali> = {}): BloqueVehiculoGenerali => ({ rotulo, obligatorio: true, protegido: true, vacio: false, opcion: null, visible: true, ...o })

test('v0.2.49 · puro: solo obligatorios PROTEGIDOS, VACÍOS y visibles', () => {
  assert.deepEqual(vaciosProtegidosGenerali([
    b('Clase de vehículo'), b('Tipo de vehículo', { vacio: true }), b('Fecha de lanzamiento del modelo', { obligatorio: false, vacio: true }),
    b('Indique Código', { protegido: false, vacio: true, opcion: 'Seleccione un modelo' }), b('Oculto', { vacio: true, visible: false }),
  ]), ['Tipo de vehículo'])
  assert.deepEqual(vaciosProtegidosGenerali([]), [])
})

test('v0.2.49 · puro: el inventario no saca valores libres (solo «con valor»/«VACÍO» y opciones de catálogo)', () => {
  const r = resumenCaracteristicasVehiculoGenerali([b('Tipo de placa', { protegido: false, opcion: 'Vehículo usado' }), b('Potencia en caballos'), b('Tipo de vehículo', { vacio: true })])
  assert.equal(r, 'Tipo de placa*: «Vehículo usado» · Potencia en caballos*: con valor (solo lectura) · Tipo de vehículo*: VACÍO (solo lectura)')
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
const bloque = (id: string, rotulo: string, controles: string, obligatorio = true) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"><div class="falseInline column1"><span>${rotulo}</span>${obligatorio ? '<div class="trueInline required"><span> * </span></div>' : ''}</div><div class="falseInline column2">${controles}</div></div>`
const protegido = (id: string, valor: string) => `<input type="text" name="${P}${id}" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}">`
const CARAC = (tipo: string) => `<fieldset id="${P.slice(0, -1)}Identification"><legend><span>Características del vehículo</span></legend>`
  + bloque('yplaca', 'Tipo de placa', `<input type="radio" name="yp" checked><span> Vehículo usado </span><input type="radio" name="yp"><span> Vehículo nuevo </span>`)
  + bloque('wvegen', 'Indique Código', `<select id="${P}wvegen"><option>Seleccione un modelo</option><option>VEHICULOS NUEVOS TURISMOS</option><option selected>VEHICULOS USADOS TURISMOS</option></select>`)
  + bloque('lnkVehi', 'Seleccionar vehículo', `<input type="button" id="${P}lnkVehi" value="Vehículo">`)
  + bloque('potcv', 'Potencia en caballos', protegido('potcv', '110'))
  + bloque('fflanz', 'Fecha de lanzamiento del modelo', protegido('fflanz', ''), false)
  + bloque('wclavh', 'Clase de vehículo', protegido('wclavh', 'TURISMO'))
  + bloque('wclasv', 'Tipo de vehículo', protegido('wclasv', tipo))
  + `</fieldset><h3>Identificación del vehículo</h3>`

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
const SEL = 'ra' + 'dio'
const GARANTIAS = `<h3>Garantías y Resultados</h3><div id="areaNegocio"><table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody><tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr></tbody></table></div>`

test('v0.2.49 · lector real: «Tipo de vehículo» protegido y vacío; catálogos con su opción; sin valores libres', async () => {
  await conPagina(CARAC(''), async (page) => {
    const bl = await leerCaracteristicasVehiculoGenerali(page)
    assert.deepEqual(vaciosProtegidosGenerali(bl), ['Tipo de vehículo'])
    const r = resumenCaracteristicasVehiculoGenerali(bl)
    assert.match(r, /Tipo de placa\*: «Vehículo usado»/)
    assert.match(r, /Indique Código\*: «VEHICULOS USADOS TURISMOS»/)
    assert.match(r, /Seleccionar vehículo \(botón lnkVehi\)\*: con valor/)
    assert.match(r, /Clase de vehículo\*: con valor \(solo lectura\)/)
    assert.ok(!/110|TURISMO»/.test(r), 'sin valores de texto')
  })
})

test('v0.2.49 · caso a12d2139: «Tipo de vehículo» vacío → PARA antes de «Garantías y Resultados» con el inventario', async () => {
  await conPagina(CARAC(''), async (page) => {
    let pulsada = 0
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => { pulsada++ } } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali, String(e))
      const m = (e as Error).message
      assert.match(m, /obligatorios de SOLO LECTURA vacíos tras elegir el vehículo .*: Tipo de vehículo\. No se pasa a «Garantías y Resultados»/)
      assert.match(m, /Características del vehículo: .*Tipo de vehículo\*: VACÍO \(solo lectura\)/)
      return true
    })
    assert.equal(pulsada, 0, 'no se pulsa «Garantías y Resultados»')
  })
})

test('v0.2.49 · con «Tipo de vehículo» puesto por el portal se sigue hasta el precio', async () => {
  await conPagina(CARAC('TURISMO'), async (page) => {
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => { await page.setContent(`<html><body>${GARANTIAS}</body></html>`) } } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
})
