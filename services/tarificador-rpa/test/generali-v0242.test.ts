// Generali Turismos v0.2.42 (27/10/2026, prueba real con 0.2.41, trabajo 4b40fc5b): tras «Recalcular» la tabla «Modalidades de Seguro» sigue vacía porque Genernet avisa en
// `#areaErrores` «No se puede calcular con datos incompletos» (antes: «El paso anterior no tiene los datos completos»). El atasco ahora trae esos avisos, los obligatorios vacíos
// (solo etiquetas), si algún marco seguía cargando y los botones del marco. Fixtures SINTÉTICAS (estructura de Genernet, sin datos reales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, volcarEstadoCalculoGenerali } from '../src/adapters/generali/auto.ts'
import { decisionesPendientesGenerali, formaPagoPedidaGenerali, obligatoriosVaciosGenerali, opcionExactaGenerali, portalDatosIncompletosGenerali, resumenEstadoCalculoGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.42 · versión', () => {
  assert.equal(VERSION_GENERALI_AUTO, '0.2.44')
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

const SEL = 'ra' + 'dio'
const ERRORES = (clase: string, texto: string) => `<div id="areaErrores" style="display:block;"><div id="erroresScroll"><ol><li class="${clase}"><a onclick="return false;" value="Empty_Property"> ${texto} </a></li></ol></div></div>`
/** Bloque Genernet: columna 1 con la etiqueta y `.required` «*», columna 2 con los controles. */
const BLOQUE = (id: string, etiqueta: string, controles: string) =>
  `<div class="trueInline simple" id="${id}Identification"><div class="falseInline column1"><span>${etiqueta}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const FORMA_PAGO = BLOQUE('fp', 'Forma de pago a contratar', `<input type="${SEL}" name="yfp" value="01"><input type="${SEL}" name="yfp" value="02">`)
const RECARGO = BLOQUE('rc', 'Recargo o descuento comercial', '<input type="text" name="xrdcom" value="0,00">')
const TALLERES = BLOQUE('tl', '¿Talleres concertados?', `<input type="${SEL}" name="zletdv" value="N" checked><input type="${SEL}" name="zletdv" value="S">`)
const ABOGADO = BLOQUE('ab', 'Suma asegurada abogado', '<select name="ysuabo"><option>Seleccione una suma asegurada</option><option>1.000 Euros</option></select>')
const GRID_VACIO = `<table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody></tbody></table>`
const BOTONERA = `<ul id="Menu2"><li><a class="NOLINK titulo">Acciones</a></li><li onclick="return false;"><a class="btn">Recalcular</a></li></ul>`
const PANTALLA = (errores: string) => `<h3>Garantías y Resultados</h3>${errores}<div id="areaNegocio">${GRID_VACIO}${FORMA_PAGO}${RECARGO}${TALLERES}${ABOGADO}</div>${BOTONERA}`

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

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}

test('v0.2.42 · puro: avisos de datos incompletos y obligatorios vacíos (solo etiquetas)', () => {
  assert.equal(portalDatosIncompletosGenerali(['No se puede calcular con datos incompletos']), true)
  assert.equal(portalDatosIncompletosGenerali(['El paso anterior no tiene los datos completos']), true)
  assert.equal(portalDatosIncompletosGenerali(['Revise la modalidad']), false)
  assert.deepEqual(
    obligatoriosVaciosGenerali([
      { etiqueta: 'Fecha de efecto *', obligatorio: true, valor: 'vacío' },
      { etiqueta: 'Uso *', obligatorio: true, valor: 'Particular' },
      { etiqueta: 'Observaciones', obligatorio: false, valor: 'vacío' },
      { etiqueta: 'Contacto 612345678 *', obligatorio: true, valor: 'vacío' },
    ]),
    ['Fecha de efecto', 'Contacto [tel]'],
  )
  const r = resumenEstadoCalculoGenerali({ avisos: ['No se puede calcular con datos incompletos'], obligatoriosVacios: ['Forma de pago a contratar'], botones: ['Recalcular'], cargando: false }, ['Fecha de efecto'])
  assert.match(r, /^Estado del cálculo: Avisos del portal \(areaErrores\): «No se puede calcular con datos incompletos»; el portal da los datos por INCOMPLETOS/)
  assert.match(r, /obligatorios vacíos en «Datos de Valoración»: Fecha de efecto;/)
  assert.match(r, /obligatorios vacíos en «Garantías y Resultados»: Forma de pago a contratar;/)
  assert.match(r, /cargando: no; botones\/enlaces del marco: Recalcular$/)
  assert.match(resumenEstadoCalculoGenerali(null, []), /Avisos del portal \(areaErrores\): \(ninguno visible\);[^]*cargando: ¿\?/)
})

test('v0.2.42 · lector: avisos de #areaErrores, obligatorios vacíos (opción sin marcar, «Seleccione…») y botones; los rellenos no salen', async () => {
  await conPagina(PANTALLA(ERRORES('lowError', 'No se puede calcular con datos incompletos')), async (page) => {
    const e = await volcarEstadoCalculoGenerali(page)
    assert.ok(e)
    assert.deepEqual(e.avisos, ['No se puede calcular con datos incompletos'])
    assert.deepEqual(e.obligatoriosVacios, ['Forma de pago a contratar', 'Suma asegurada abogado'])
    assert.ok(e.botones.includes('Recalcular'), e.botones.join('|'))
    assert.equal(e.cargando, false)
  })
})

test('v0.2.42 · atasco: tras «Recalcular» el mensaje trae el aviso del portal y los obligatorios vacíos, al principio y sin pasarse de 1.900', async () => {
  let recalculos = 0
  await conPagina(PANTALLA(ERRORES('information', 'El paso anterior no tiene los datos completos')), async (page) => {
    const ctx = {
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: async () => ({ dialogo: null }),
      pulsarRecalcularGenerali: async () => {
        recalculos++
        await page.evaluate((h) => { document.getElementById('areaErrores')!.outerHTML = h }, ERRORES('lowError', 'No se puede calcular con datos incompletos'))
        return { dialogo: null }
      },
    } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /Recalcular: Recalcular×1\. Estado del cálculo: Avisos del portal \(areaErrores\): «No se puede calcular con datos incompletos»; el portal da los datos por INCOMPLETOS/, e.message.slice(0, 600))
      assert.match(e.message, /obligatorios vacíos en «Garantías y Resultados»: Forma de pago a contratar · Suma asegurada abogado;/)
      assert.match(e.message, /cargando: no; botones\/enlaces del marco: [^;]*Recalcular/)
      assert.ok(e.message.length <= 1_900, String(e.message.length))
      return true
    })
  })
  assert.equal(recalculos, 1)
})

// ── Decisión de Alberto: «Forma de pago a contratar» = Anual por defecto (opción exacta); «Envío e-mail» y «Verificación del riesgo» no se tocan ──
/** Bloque con la estructura REAL de Genernet (ids/names del HTML redactado; opciones con el rótulo en el `<span>` que sigue). */
const FP_REAL = (rotulos: readonly string[]) =>
  `<div class="falseInline simple" id="reg1063E_gridmodseg_yfpIdentification"><div class="falseInline column1"><span> Forma de pago a contratar </span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2"><div class="falseInline">${rotulos.map((r, i) => `<input type="${SEL}" name="reg1063E.gridmodseg.yfp" value="0${i + 1}"> <span> ${r} </span>`).join(' ')}</div></div></div>`
const ENVIO = BLOQUE('env', 'Envío e-mail', `<input type="${SEL}" name="reg1063E.opcEnvio.opcenv" value="2"><input type="${SEL}" name="reg1063E.opcEnvio.opcenv" value="3">`)
const VERIF = BLOQUE('ver', 'El mediador declara que ha realizado la verificación del riesgo', `<input type="${SEL}" name="reg1063E.verifRiesgo.zvriep" value="N"><input type="${SEL}" name="reg1063E.verifRiesgo.zvriep" value="S">`)
const FILA = `<tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr>`
const PANTALLA_FP = (fp: string, extra = '') => `<h3>Garantías y Resultados</h3><div id="areaNegocio">${GRID_VACIO}${fp}${extra}</div>${BOTONERA}`

/** ctx de prueba: `pulsar` hace clic; «Recalcular» solo «calcula» (pinta una fila con importe) si la forma de pago está marcada. */
function ctxFp(page: Page, cuenta: { rec: number; pulsados: number }): ContextoPortal {
  return {
    pulsar: async (l: import('playwright').Locator) => { cuenta.pulsados++; await l.click() },
    pulsarSubpestanaGenerali: async () => {},
    pulsarSiguienteGenerali: async () => ({ dialogo: null }),
    pulsarRecalcularGenerali: async () => {
      cuenta.rec++
      await page.evaluate((f) => {
        if ((document.querySelector('input[name="reg1063E.gridmodseg.yfp"]:checked') as HTMLInputElement | null)) document.querySelector('#reg1063E_gridmodseg tbody')!.insertAdjacentHTML('beforeend', f)
      }, FILA)
      return { dialogo: null }
    },
  } as unknown as ContextoPortal
}

test('v0.2.42 · puro: forma de pago Anual por defecto, la del riesgo si es exacta; opción exacta; decisiones de Alberto por name', () => {
  assert.deepEqual(formaPagoPedidaGenerali({}), { etiqueta: 'Anual', porDefecto: true })
  assert.deepEqual(formaPagoPedidaGenerali({ fraccionamiento: 'semestral' }), { etiqueta: 'Semestral', porDefecto: false })
  assert.deepEqual(formaPagoPedidaGenerali({ formaPago: 'TRIMESTRAL' }), { etiqueta: 'Trimestral', porDefecto: false })
  assert.ok('error' in formaPagoPedidaGenerali({ formaPago: 'mensual' }))
  assert.equal(opcionExactaGenerali([' Anual ', 'Semestral'], 'Anual'), 0)
  assert.equal(opcionExactaGenerali(['Anual (fraccionado)', 'Semestral'], 'Anual'), -1)
  assert.equal(opcionExactaGenerali(['anual'], 'Anual'), -1)
  assert.deepEqual(decisionesPendientesGenerali(['reg1063E.opcEnvio.opcenv', 'reg1063E.verifRiesgo.zvriep']), ['Envío e-mail', 'Verificación del riesgo'])
  assert.deepEqual(decisionesPendientesGenerali(['reg1063E.gridmodseg.yfp']), [])
})

test('v0.2.42 · marca «Anual» exacta antes de «Recalcular», lee el precio y la oferta avisa «Forma de pago: anual (por defecto)»', async () => {
  const cuenta = { rec: 0, pulsados: 0 }
  await conPagina(PANTALLA_FP(FP_REAL(['Anual', 'Semestral', 'Trimestral'])), async (page) => {
    const r = await hastaPrecioGenerali(page, formulario(), [], ctxFp(page, cuenta), { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    assert.ok(r.ofertas[0]!.avisos.includes('Forma de pago: anual (por defecto)'), r.ofertas[0]!.avisos.join(' | '))
    assert.equal(await page.locator('input[name="reg1063E.gridmodseg.yfp"]').nth(0).isChecked(), true)
    assert.equal(await page.locator('input[name="reg1063E.gridmodseg.yfp"]:checked').count(), 1)
  })
  assert.equal(cuenta.rec, 1)
  assert.equal(cuenta.pulsados, 1)
})

test('v0.2.42 · sin opción EXACTA «Anual» atasca nombrando las opciones vistas y no pulsa nada', async () => {
  const cuenta = { rec: 0, pulsados: 0 }
  await conPagina(PANTALLA_FP(FP_REAL(['Anual (fraccionado)', 'Semestral'])), async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctxFp(page, cuenta), { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /la opción «Anual» de «Forma de pago a contratar» \(no existe exactamente; opciones vistas: «Anual \(fraccionado\)» · «Semestral»\)/)
      return true
    })
  })
  assert.equal(cuenta.rec, 0)
  assert.equal(cuenta.pulsados, 0)
})

test('v0.2.42 · «Envío e-mail» y «Verificación del riesgo» vacíos: no se tocan y el error empieza por «falta decisión de Alberto»', async () => {
  const cuenta = { rec: 0, pulsados: 0 }
  await conPagina(PANTALLA_FP(FP_REAL(['Semestral']), ENVIO + VERIF), async (page) => {
    // Sin «Anual» exacta no se llega a «Recalcular»: aquí el riesgo pide Semestral, que sí existe.
    const form = { ...formulario(), fraccionamiento: 'semestral' } as unknown as FormularioAuto
    const ctx = ctxFp(page, cuenta)
    ;(ctx as unknown as { pulsarRecalcularGenerali: () => Promise<{ dialogo: null }> }).pulsarRecalcularGenerali = async () => { cuenta.rec++; return { dialogo: null } }
    await assert.rejects(hastaPrecioGenerali(page, form, [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /^generali\/auto: mapa incompleto: faltan \(falta decisión de Alberto: Envío e-mail, Verificación del riesgo\) el PRECIO/, e.message.slice(0, 300))
      assert.ok(e.message.length <= 1_900, String(e.message.length))
      return true
    })
    assert.equal(await page.locator('input[name="reg1063E.opcEnvio.opcenv"]:checked').count(), 0)
    assert.equal(await page.locator('input[name="reg1063E.verifRiesgo.zvriep"]:checked').count(), 0)
  })
  assert.equal(cuenta.pulsados, 1)
})

test('v0.2.42 · la opción «Anual» pasa por la vía común del guard (`pulsar`) en el marco B028 y queda marcada', async () => {
  const { instalarGuardEmision, pulsar } = await import('../src/guard.ts')
  const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${PANTALLA_FP(FP_REAL(['Anual', 'Semestral', 'Trimestral']))}</body>` }))
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.goto(B028)
    const cuenta = { rec: 0, pulsados: 0 }
    const ctx = { ...ctxFp(page, cuenta), pulsar: async (l: import('playwright').Locator) => { cuenta.pulsados++; await pulsar(l, guard) } } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    assert.equal(await page.locator('input[name="reg1063E.gridmodseg.yfp"]').nth(0).isChecked(), true)
    assert.equal(cuenta.pulsados, 1)
  } finally {
    await context.close()
  }
})
