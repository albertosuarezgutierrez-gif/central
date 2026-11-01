// Generali Turismos v0.2.52 (28/10/2026, prueba real con 0.2.51, trabajo 4107d42d; decisión de Alberto: «que lo pruebe el bot»): «Tipo de vehículo»
// (`wclasv`, solo lectura) sigue vacío. Fase de PRUEBAS acotada: un intento por hipótesis, releyendo `wclasv` antes de cada una y parando en cuanto
// tiene valor; el registro va al atasco o a los avisos. Fixtures SINTÉTICAS con la estructura Genernet del volcado (ids y names reales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, probarTipoVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import { antiguedadVehiculoGenerali, opcionIndiqueCodigoGenerali, opcionPlacaOrdinariaGenerali, resumenPruebasTipoVehiculoGenerali } from '../src/adapters/generali/reglas.ts'
import { ID_OTRO_VEHICULO_GENERALI, instalarGuardEmision, otroVehiculoGeneraliPermitido, pulsar } from '../src/guard.ts'
import { EmisionBloqueadaError, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.52 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.56'))

test('v0.2.52 · puro: antigüedad (sin fecha no se supone), opciones exactas y registro', () => {
  const hoy = new Date('2026-10-28T12:00:00Z')
  assert.equal(antiguedadVehiculoGenerali('2026-03-01', hoy), 'nuevo')
  assert.equal(antiguedadVehiculoGenerali('2015-01-01', hoy), 'usado')
  assert.equal(antiguedadVehiculoGenerali(null, hoy), null)
  const ops = ['Seleccione un modelo', 'VEHICULOS NUEVOS TURISMOS', 'VEHICULOS USADOS TURISMOS']
  assert.equal(opcionIndiqueCodigoGenerali(ops, 'usado'), 2)
  assert.equal(opcionIndiqueCodigoGenerali(ops, 'nuevo'), 1)
  assert.equal(opcionPlacaOrdinariaGenerali(['Vehículo usado', 'Vehículo nuevo']), -1, 'no se marca otra')
  assert.equal(opcionPlacaOrdinariaGenerali(['Especial', 'Ordinaria']), 1)
  assert.equal(resumenPruebasTipoVehiculoGenerali([{ hipotesis: 'A', hecho: 'oculto', relleno: false, valor: null }, { hipotesis: 'B', hecho: 'hecho', relleno: true, valor: 'TURISMO' }]),
    '1) A: oculto → Tipo de vehículo no · 2) B: hecho → Tipo de vehículo SÍ («TURISMO»)')
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
const RELLENA = `document.getElementById('${P}wclasv').value='TURISMO'`
const bloque = (id: string, rotulo: string, controles: string, oculto = false) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"${oculto ? ' style="display:none"' : ''}><div class="falseInline column1"><span>${rotulo}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const protegido = (id: string, valor: string) => `<input type="text" name="reg1063A.vehiculo.caracVehiculo.${id}" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}">`
type Variante = { wvegenRellena?: boolean; wvegenOculto?: boolean; placaRellena?: boolean; campoRellena?: boolean; lnkVehiRellena?: boolean; lnkVehiOculto?: boolean; placaOnchange?: string; campoOnchangeExtra?: string }
/** Pantalla «Datos de Valoración»: qué control (si alguno) hace que el portal rellene «Tipo de vehículo». */
const PANTALLA = (v: Variante) => `<fieldset><legend><span>Características del vehículo</span></legend>`
  + bloque('yplaca', 'Tipo de placa', `<input type="radio" name="reg1063A.vehiculo.caracVehiculo.yplaca" id="${P}yplaca" checked><span> Vehículo usado </span><input type="radio" name="reg1063A.vehiculo.caracVehiculo.yplaca" id="${P}yplaca" ${v.placaRellena ? `onclick="${RELLENA}"` : ''}${v.placaOnchange ? ` onchange="${v.placaOnchange}"` : ''}><span> ${v.placaRellena ? 'Ordinaria' : 'Vehículo nuevo'} </span>`)
  + bloque('wvegen', 'Indique Código', `<select name="reg1063A.vehiculo.caracVehiculo.wvegen" id="${P}wvegen" ${v.wvegenRellena ? `onchange="${RELLENA}"` : ''}><option>Seleccione un modelo</option><option>VEHICULOS NUEVOS TURISMOS</option><option>VEHICULOS USADOS TURISMOS</option></select>`, v.wvegenOculto)
  + bloque('lnkVehi', 'Seleccionar vehículo', `<input type="button" name="reg1063A.vehiculo.caracVehiculo.lnkVehi" id="${P}lnkVehi" value="Vehículo" ${v.lnkVehiRellena ? `onclick="${RELLENA}"` : ''}>`, v.lnkVehiOculto)
  + bloque('wclavh', 'Clase de vehículo', protegido('wclavh', 'TURISMO'))
  + bloque('wclasv', 'Tipo de vehículo', protegido('wclasv', ''))
  + `</fieldset><h3>Identificación del vehículo</h3>`
  + `<select name="reg1063A.vehiculo.identVehiculo.yusovh" id="reg1063A_vehiculo_identVehiculo_yusovh" onchange="TratarDependiente(this,'','updatedYusovh','/refreshEmiAutosGenA.do',false,false);${v.campoOnchangeExtra ?? ''}"><option>PARTICULAR</option></select>`
  + `<script>window.TratarDependiente = function () { ${v.campoRellena ? RELLENA : ''} }</script>`

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', fechaMatriculacion: '2015-01-01',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
const ESPERAS = { trasAccionMs: 600, selectorMs: 300 }

/** Página con el guard de emisión de verdad; los clics por `pulsar` (el genérico, el mismo que `ctx.pulsar`). */
async function conPantalla(v: Variante, fn: (page: Page, ctx: ContextoPortal) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${PANTALLA(v)}</body></html>` }))
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.goto('https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do')
    const ctx = { pausaAccion: async () => {}, pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard), log: () => {} } as unknown as ContextoPortal
    await fn(page, ctx)
  } finally {
    await context.close()
  }
}
const valor = (page: Page) => page.locator(`[id="${P}wclasv"]`).inputValue()

test('v0.2.52 · H1 «Indique Código»: «VEHICULOS USADOS TURISMOS» (matriculado en 2015) rellena el tipo → se para ahí (1 intento)', async () => {
  await conPantalla({ wvegenRellena: true }, async (page, ctx) => {
    const r = await probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS)
    assert.equal(r.valor, 'TURISMO')
    assert.deepEqual(r.intentos.map((i) => [i.hipotesis, i.relleno]), [['Indique Código (wvegen)', true]])
    assert.match(r.intentos[0]!.hecho, /elegida «VEHICULOS USADOS TURISMOS» \(vehículo usado\)/)
  })
})

test('v0.2.52 · H2 «Tipo de placa»: marca la ordinaria (rótulo exacto) y se para', async () => {
  await conPantalla({ wvegenOculto: true, placaRellena: true }, async (page, ctx) => {
    const r = await probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS)
    assert.equal(r.valor, 'TURISMO')
    assert.deepEqual(r.intentos.map((i) => i.hecho), ['oculto; no se fuerza', 'marcada «Ordinaria»'])
  })
})

test('v0.2.52 · H3 change+blur en un campo con refreshEmiAutosGenA.do rellena el tipo; sin placa ordinaria no se marca otra', async () => {
  await conPantalla({ wvegenOculto: true, campoRellena: true }, async (page, ctx) => {
    const r = await probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS)
    assert.equal(r.valor, 'TURISMO')
    assert.equal(r.intentos.length, 3)
    assert.match(r.intentos[1]!.hecho, /sin opción ordinaria\/nacional .*no se marca otra/)
    assert.equal(await page.locator(`[id="${P}yplaca"]`).first().isChecked(), true, 'la placa marcada no se cambió')
    assert.match(r.intentos[2]!.hecho, /disparado en yusovh/)
  })
})

test('v0.2.52 · seguridad: un campo con refresco cuyo onchange también contiene «emitir» → EmisionBloqueadaError (no se dispara)', async () => {
  await conPantalla({ wvegenOculto: true, campoRellena: true, campoOnchangeExtra: "emitirPoliza();" }, async (page, ctx) => {
    await assert.rejects(probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS), EmisionBloqueadaError)
    assert.equal(await valor(page), '', 'no se disparó nada')
  })
})

test('v0.2.52 · seguridad: un radio de «Tipo de placa» con onchange peligroso → bloqueado antes del clic', async () => {
  await conPantalla({ wvegenOculto: true, placaRellena: true, placaOnchange: "emitirPoliza()" }, async (page, ctx) => {
    await assert.rejects(probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS), EmisionBloqueadaError)
    assert.equal(await valor(page), '', 'el clic no se dio')
  })
})

test('v0.2.52 · H4 el otro botón «Vehículo» (lnkVehi) por el guard genérico; sin selector, se registra y se lee el tipo', async () => {
  await conPantalla({ wvegenOculto: true, lnkVehiRellena: true }, async (page, ctx) => {
    const r = await probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS)
    assert.equal(r.valor, 'TURISMO')
    assert.equal(r.intentos.length, 4)
    assert.match(r.intentos[3]!.hecho, /pulsado; no apareció el «Selector de vehículos»/)
  })
})

test('v0.2.52 · ninguna funciona: hastaPrecioGenerali PARA con el registro de las 4 pruebas (un intento cada una)', async () => {
  await conPantalla({ wvegenOculto: true, lnkVehiOculto: true }, async (page, ctx) => {
    let pulsada = 0
    const c = { ...ctx, pulsarSubpestanaGenerali: async () => { pulsada++ } } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300, pruebasTipo: ESPERAS }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali, String(e))
      const m = (e as Error).message
      assert.match(m, /Pruebas \(v0\.2\.52\): 1\) Indique Código \(wvegen\): oculto; no se fuerza → Tipo de vehículo no · 2\) Tipo de placa \(yplaca\): sin opción ordinaria\/nacional .* → Tipo de vehículo no · 3\) change\+blur en campos con refreshEmiAutosGenA\.do: disparado en yusovh → Tipo de vehículo no · 4\) otro botón «Vehículo» \(lnkVehi\): oculto; no se fuerza → Tipo de vehículo no\./)
      return true
    })
    assert.equal(pulsada, 0)
    assert.equal(await valor(page), '')
  })
})

test('v0.2.52 · si una prueba funciona, hastaPrecioGenerali sigue hasta «Garantías» y lo declara en los avisos', async () => {
  await conPantalla({ wvegenRellena: true }, async (page, ctx) => {
    const GARANTIAS = `<h3>Garantías y Resultados</h3><div id="areaNegocio"><table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody><tr><td></td><td><input type="${'ra' + 'dio'}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr></tbody></table></div>`
    const c = { ...ctx, pulsarSubpestanaGenerali: async () => { await page.setContent(`<html><body>${GARANTIAS}</body></html>`) } } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300, pruebasTipo: ESPERAS })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    assert.ok(r.ofertas[0]!.avisos.some((a) => /^Tipo de vehículo: lo puso el portal tras probar «Indique Código \(wvegen\)»/.test(a)), r.ofertas[0]!.avisos.join(' | '))
  })
})

test('v0.2.52 · guard: puerta EXACTA del otro «Vehículo»: solo id lnkVehi + texto «Vehículo» + origen Generali; «Emitir»/«Grabar»/«Confirmar» con ids parecidos NO', () => {
  const url = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
  assert.equal(ID_OTRO_VEHICULO_GENERALI, `${P}lnkVehi`)
  assert.equal(otroVehiculoGeneraliPermitido({ id: `${P}lnkVehi`, texto: 'Vehículo', url }), true)
  assert.equal(otroVehiculoGeneraliPermitido({ id: `${P}lnkVehi`, texto: ' VEHICULO ', url }), true)
  for (const [id, texto] of [[`${P}lnkVehi`, 'Emitir'], [`${P}lnkVehi`, 'Grabar'], [`${P}lnkVehi`, 'Confirmar'], [`${P}lnkVehi`, 'Calcular'], [`${P}lnkVehiEmitir`, 'Vehículo'], [`${P}lnkVeh2`, 'Vehículo'], [`${P}lnkVehiGrabar`, 'Grabar'], ['emitir', 'Vehículo']]) {
    assert.equal(otroVehiculoGeneraliPermitido({ id, texto, url }), false, `${id} «${texto}»`)
  }
  assert.equal(otroVehiculoGeneraliPermitido({ id: `${P}lnkVehi`, texto: 'Vehículo', url: 'https://www.generali.es.evil.com/x' }), false, 'otro origen')
  assert.equal(otroVehiculoGeneraliPermitido({ id: `${P}lnkVehi`, texto: 'Vehículo', url: null }), false)
})

test('v0.2.52 · guard: un botón con el id EXACTO pero texto «Grabar» no se pulsa en la fase de pruebas (se registra)', async () => {
  await conPantalla({ wvegenOculto: true }, async (page, ctx) => {
    await page.evaluate((id) => { const b = document.getElementById(id) as HTMLInputElement; b.value = 'Grabar'; b.setAttribute('onclick', "document.getElementById('reg1063A_vehiculo_caracVehiculo_wclasv').value='X'") }, `${P}lnkVehi`)
    const r = await probarTipoVehiculoGenerali(page, page, formulario(), ctx, new Date('2026-10-28T12:00:00Z'), ESPERAS)
    assert.equal(r.valor, null)
    assert.equal(r.intentos[3]!.hecho, 'no pasa la puerta exacta del guard (id/texto/origen); no se pulsa')
  })
})
