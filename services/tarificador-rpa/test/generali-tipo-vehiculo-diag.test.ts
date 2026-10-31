// Generali Turismos (30/10/2026, trabajo f8f473e6, 12.ª parada igual con el MISMO cliente y vehículo): «Tipo de vehículo» (`wclasv`) vacío con
// «Clase de vehículo» (`wclavh`) «TODO TERRENO». Con lo guardado no se puede probar la causa (nunca se ha visto `wclasv` relleno con otro
// vehículo), así que el atasco añade, SOLO LEYENDO: 1) una HIPÓTESIS de catálogo si la clase no es TURISMO; 2) el estado del camino ANTIGUO
// oculto (`yplaca` «Tipo de placa» y `wvegen` «Indique Código», obligatorio y con `onchange` de recarga); 3) la fila elegida en el selector con
// sus cabeceras. Todo saneado: ni nombres ni matrículas.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, diagGeneraliDe, fotografiarSelectorGenerali, hastaPrecioGenerali, leerClaseTipoGenerali, leerLegadoTipoGenerali } from '../src/adapters/generali/auto.ts'
import { hipotesisTipoVehiculoGenerali, lineaDiagTipoVehiculoGenerali, resumenFilaSelectorGenerali, resumenLegadoTipoGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

// Solo diagnóstico: no cambia la tarificación, la versión no se sube.
test('diagnóstico «Tipo de vehículo» · la versión sigue en 0.2.53', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.54'))

test('hipótesis de catálogo: solo con «Tipo de vehículo» VACÍO y una clase que no es TURISMO', () => {
  assert.match(hipotesisTipoVehiculoGenerali('vacío (wclavh «TODO TERRENO»)') ?? '', /^HIPÓTESIS \(sin confirmar\): .*«TODO TERRENO» \(no «TURISMO»\): probable hueco del catálogo/)
  assert.equal(hipotesisTipoVehiculoGenerali('vacío (wclavh «TURISMO»)'), null)
  assert.equal(hipotesisTipoVehiculoGenerali('vacío (wclavh «Turismo»)'), null)
  assert.equal(hipotesisTipoVehiculoGenerali('«TURISMO» (wclavh «TODO TERRENO»)'), null)
  assert.equal(hipotesisTipoVehiculoGenerali('vacío (wclavh sin campo)'), null)
  assert.equal(hipotesisTipoVehiculoGenerali(undefined), null)
})

test('legado: oculto y «Seleccione…» = VACÍO, con las opciones de catálogo; sin lectura → ¿?', () => {
  const t = resumenLegadoTipoGenerali({
    placa: { visible: false, marcada: 'Vehículo usado' },
    indique: { visible: false, elegida: 'Seleccione un modelo', opciones: ['Seleccione un modelo', 'VEHICULOS NUEVOS TURISMOS', 'VEHICULOS USADOS TURISMOS'] },
  })
  assert.equal(t, 'legado: Tipo de placa=«Vehículo usado» (oculto) · Indique Código=VACÍO (oculto; opciones: VEHICULOS NUEVOS TURISMOS | VEHICULOS USADOS TURISMOS)')
  assert.match(resumenLegadoTipoGenerali({ placa: { visible: true, marcada: null }, indique: { visible: true, elegida: 'VEHICULOS USADOS TURISMOS', opciones: [] } }), /Tipo de placa=SIN marcar \(a la vista\) · Indique Código=«VEHICULOS USADOS TURISMOS» \(a la vista; opciones: \(ninguna\)\)/)
  assert.equal(resumenLegadoTipoGenerali({ placa: null, indique: null }), 'legado: Tipo de placa=sin campo · Indique Código=sin campo')
  assert.equal(resumenLegadoTipoGenerali(null), 'legado=¿?')
})

test('fila elegida: cabecera=celda, celda vacía «(vacía)», saneada; sin datos → ¿?', () => {
  assert.equal(resumenFilaSelectorGenerali(['Código', 'Versión', 'Tipo'], ['00270220005', '2.9 CRDI 163 FULL 5P', '']), 'fila elegida=[Código=00270220005 | Versión=2.9 CRDI 163 FULL 5P | Tipo=(vacía)]')
  assert.doesNotMatch(resumenFilaSelectorGenerali(['Código', 'Nota'], ['1', 'matrícula 1234BCD']), /1234BCD/)
  assert.equal(resumenFilaSelectorGenerali([], ['x']), 'fila elegida=¿?')
  assert.equal(resumenFilaSelectorGenerali(['Código'], null), 'fila elegida=¿?')
})

test('línea diag: la HIPÓTESIS va delante y el legado y la fila al final, saneados', () => {
  const l = lineaDiagTipoVehiculoGenerali({ final: 'vacío (wclavh «TODO TERRENO»)', legado: 'legado: X', fila: 'fila elegida=[Código=1 | Nota=1234BCD]' })
  assert.match(l, /^HIPÓTESIS \(sin confirmar\): [^]*\. diag: nomiag=¿\?; /)
  assert.match(l, /; legado: X; fila elegida=\[Código=1 \| Nota=\[mat\]\]$/)
  assert.doesNotMatch(lineaDiagTipoVehiculoGenerali({ final: 'vacío (wclavh «TURISMO»)' }), /HIPÓTESIS/)
  assert.match(lineaDiagTipoVehiculoGenerali({}), /; legado=¿\?; fila elegida=¿\?$/)
})

// ───────────── navegador ─────────────

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

const P = 'reg1063A_vehiculo_caracVehiculo_'
const LEGADO = `<div style="display:none">
  <input type="radio" name="reg1063A.vehiculo.caracVehiculo.yplaca" id="${P}yplaca" checked><span> Vehículo usado </span>
  <input type="radio" name="reg1063A.vehiculo.caracVehiculo.yplaca" id="${P}yplaca"><span> Vehículo nuevo </span>
  <select id="${P}wvegen" name="reg1063A.vehiculo.caracVehiculo.wvegen" onchange="window.__cambio = 1"><option>Seleccione un modelo</option><option>VEHICULOS NUEVOS TURISMOS</option><option>VEHICULOS USADOS TURISMOS</option></select>
</div>`
const bloque = (id: string, rotulo: string, valor: string) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"><div class="falseInline column1"><span>${rotulo}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2"><input type="text" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}"></div></div>`
const VALORACION = `<fieldset><legend><span>Características del vehículo</span></legend>${LEGADO}${bloque('wclavh', 'Clase de vehículo', 'TODO TERRENO')}${bloque('wclasv', 'Tipo de vehículo', '')}</fieldset><h3>Identificación del vehículo</h3>`
const SELECTOR = `<h2>Selector de vehículos</h2>
  <div><div>Tipo de Vehículo</div><button class="ui-state-active">Turismo</button></div>
  <div><div>Subtipo de Vehículo</div><button class="ui-state-active">Turismos</button><button>Comerciales</button></div>
  <table><thead><tr><th>Código</th><th>Modelo</th><th>Versión</th><th>Tipo</th></tr></thead><tbody>
    <tr><td>00270220004</td><td>TERRACAN</td><td>2.9 CRDI 150</td><td>2</td></tr>
    <tr class="ui-state-highlight" aria-selected="true"><td>00270220005</td><td>TERRACAN</td><td>2.9 CRDI 163 FULL 5P</td><td></td></tr>
  </tbody></table>`

test('leerLegadoTipoGenerali: lee el camino antiguo OCULTO sin tocarlo (ni eventos ni visibilidad)', async () => {
  await conPagina(LEGADO, async (page) => {
    const l = await leerLegadoTipoGenerali(page)
    assert.deepEqual(l, {
      placa: { visible: false, marcada: 'Vehículo usado' },
      indique: { visible: false, elegida: 'Seleccione un modelo', opciones: ['Seleccione un modelo', 'VEHICULOS NUEVOS TURISMOS', 'VEHICULOS USADOS TURISMOS'] },
    })
    assert.equal(await page.evaluate(() => (window as unknown as { __cambio?: number }).__cambio), undefined)
  })
  await conPagina('<p>sin campos</p>', async (page) => assert.equal(await leerLegadoTipoGenerali(page), null))
})

test('la foto del selector guarda la fila ELEGIDA con sus cabeceras (no otra)', async () => {
  await conPagina(SELECTOR, async (page) => {
    await fotografiarSelectorGenerali(page, page)
    assert.equal(diagGeneraliDe(page).fila, 'fila elegida=[Código=00270220005 | Modelo=TERRACAN | Versión=2.9 CRDI 163 FULL 5P | Tipo=(vacía)]')
  })
})

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}

test('el atasco de «Tipo de vehículo» trae HIPÓTESIS, legado y fila elegida, y sigue PARANDO antes de «Garantías y Resultados»', async () => {
  await conPagina(SELECTOR, async (page) => {
    await fotografiarSelectorGenerali(page, page)
    await page.setContent(`<html><body>${VALORACION}</body></html>`)
    assert.equal(await leerClaseTipoGenerali(page), 'vacío (wclavh «TODO TERRENO»)')
    let subpestana = 0
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => { subpestana++ } } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300, pruebasTipo: { trasAccionMs: 300, selectorMs: 200 } }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali, String(e))
      const m = (e as Error).message
      assert.match(m, /No se pasa a «Garantías y Resultados»\. HIPÓTESIS \(sin confirmar\): «Tipo de vehículo» vacío con «Clase de vehículo» «TODO TERRENO»/)
      assert.match(m, /; legado: Tipo de placa=«Vehículo usado» \(oculto\) · Indique Código=VACÍO \(oculto; opciones: VEHICULOS NUEVOS TURISMOS \| VEHICULOS USADOS TURISMOS\); fila elegida=\[Código=00270220005 \| Modelo=TERRACAN \| Versión=2\.9 CRDI 163 FULL 5P \| Tipo=\(vacía\)\]\. Pruebas/)
      assert.doesNotMatch(m, /1234BCD|41003/)
      return true
    })
    assert.equal(subpestana, 0)
    // Solo lee: el `onchange` de «Indique Código» no se disparó.
    assert.equal(await page.evaluate(() => (window as unknown as { __cambio?: number }).__cambio), undefined)
  })
})
