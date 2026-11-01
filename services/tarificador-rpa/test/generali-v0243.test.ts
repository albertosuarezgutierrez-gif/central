// Generali Turismos v0.2.43 (27/10/2026, prueba real con 0.2.42, trabajo b36374f2: «tope del intento de 240 s superado»). Con «No se puede calcular con datos
// incompletos» a la vista el portal no calcula mientras el bot espera; cada lectura esperaba entera (25 s + 30 s) y el atasco no llegaba a tiempo. Ahora la
// espera se corta con ese aviso estable. Fixtures SINTÉTICAS (estructura de Genernet, sin datos reales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, cortarEsperaPorBloqueoGenerali, hastaPrecioGenerali, vigiaBloqueoCalculoGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.43 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.59'))

test('v0.2.43 · puro: solo se corta con el aviso estable y pasada la gracia', () => {
  assert.equal(cortarEsperaPorBloqueoGenerali(9_000, 3_500), true)
  assert.equal(cortarEsperaPorBloqueoGenerali(9_000, null), false, 'sin aviso no se corta nunca')
  assert.equal(cortarEsperaPorBloqueoGenerali(5_000, 5_000), false, 'antes de la gracia (aviso viejo de antes del clic)')
  assert.equal(cortarEsperaPorBloqueoGenerali(9_000, 1_000), false, 'aviso recién aparecido')
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
const ERRORES = (texto: string) => `<div id="areaErrores" style="display:block;"><div id="erroresScroll"><ol><li class="lowError"><a onclick="return false;" value="Empty_Property"> ${texto} </a></li></ol></div></div>`
const BLOQUE = (id: string, etiqueta: string, controles: string) =>
  `<div class="trueInline simple" id="${id}Identification"><div class="falseInline column1"><span>${etiqueta}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const ENVIO = BLOQUE('env', 'Envío e-mail', `<input type="${SEL}" name="reg1063E.opcEnvio.opcenv" value="2"><input type="${SEL}" name="reg1063E.opcEnvio.opcenv" value="3">`)
const VERIF = BLOQUE('ver', 'El mediador declara que ha realizado la verificación del riesgo', `<input type="${SEL}" name="reg1063E.verifRiesgo.zvriep" value="N"><input type="${SEL}" name="reg1063E.verifRiesgo.zvriep" value="S">`)
const GRID_VACIO = `<table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody></tbody></table>`
const BOTONERA = `<ul id="Menu2"><li><a class="NOLINK titulo">Acciones</a></li><li onclick="return false;"><a class="btn">Recalcular</a></li></ul>`
const PANTALLA = (errores: string) => `<h3>Garantías y Resultados</h3>${errores}<div id="areaNegocio">${GRID_VACIO}${ENVIO}${VERIF}</div>${BOTONERA}`

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

test('v0.2.43 · vigía: corta con «datos incompletos» estable; sin aviso no corta', async () => {
  await conPagina(PANTALLA(ERRORES('No se puede calcular con datos incompletos')), async (page) => {
    const v = vigiaBloqueoCalculoGenerali(page, 200, 150)
    const t0 = Date.now()
    while (!(await v.cortar()) && Date.now() - t0 < 3_000) await page.waitForTimeout(50)
    assert.ok(v.motivo, 'cortó')
    assert.match(v.motivo!, /^espera del precio cortada a \d+ s: el portal avisa «No se puede calcular con datos incompletos»$/)
  })
  await conPagina(PANTALLA(''), async (page) => {
    const v = vigiaBloqueoCalculoGenerali(page, 100, 50)
    await page.waitForTimeout(300)
    assert.equal(await v.cortar(), false)
    assert.equal(v.motivo, null)
  })
})

test('v0.2.43 · con «datos incompletos» las lecturas largas se cortan: el atasco (con la decisión pendiente) llega en segundos, no en minutos', async () => {
  let recalculos = 0
  await conPagina(PANTALLA(ERRORES('El paso anterior no tiene los datos completos')), async (page) => {
    const ctx = {
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: async () => ({ dialogo: null }),
      pulsarRecalcularGenerali: async () => {
        recalculos++
        await page.evaluate((h) => { document.getElementById('areaErrores')!.outerHTML = h }, ERRORES('No se puede calcular con datos incompletos'))
        return { dialogo: null }
      },
    } as unknown as ContextoPortal
    const t0 = Date.now()
    // Esperas «reales» de 20 s por lectura: sin el corte serían ≥ 40 s (dos lecturas × texto + tabla).
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 20_000, graciaBloqueoMs: 400, estableBloqueoMs: 300 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /^generali\/auto: mapa incompleto: faltan \(falta decisión de Alberto: Envío e-mail, Verificación del riesgo\) el PRECIO/, e.message.slice(0, 300))
      assert.match(e.message, /Esperas: espera del precio cortada a \d+ s: el portal avisa «[^»]*datos (in)?completos»/)
      assert.ok(e.message.length <= 1_900, String(e.message.length))
      return true
    })
    assert.ok(Date.now() - t0 < 15_000, `tardó ${Date.now() - t0} ms`)
    // Nada nuevo se pulsa: «Envío e-mail» y «Verificación del riesgo» siguen sin marcar.
    assert.equal(await page.locator('input[name="reg1063E.opcEnvio.opcenv"]:checked').count(), 0)
    assert.equal(await page.locator('input[name="reg1063E.verifRiesgo.zvriep"]:checked').count(), 0)
  })
  assert.equal(recalculos, 1)
})

// ── Decisión de Alberto (28/10/2026): «Envío e-mail» = «Mediador» (nunca «Tomador») y «Verificación del riesgo» = «No», opción EXACTA, antes de «Recalcular» ──
/** Bloques con la estructura REAL de Genernet (ids/names del volcado redactado de b36374f2; rótulo de cada opción en el `<span>` que sigue). */
const OPCIONES_REAL = (id: string, nombre: string, rotulo: string, opciones: readonly [string, string][]) =>
  `<div class="falseInline simple" id="${id}Identification"><div class="falseInline column1"><span> ${rotulo} </span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2"><div class="falseInline">${opciones.map(([v, r]) => `<input type="${SEL}" name="${nombre}" value="${v}"> <span> ${r} </span>`).join(' ')}</div></div></div>`
const FP_REAL = OPCIONES_REAL('reg1063E_gridmodseg_yfp', 'reg1063E.gridmodseg.yfp', 'Forma de pago a contratar', [['01', 'Anual'], ['02', 'Semestral'], ['03', 'Trimestral']])
const ENVIO_REAL = (ops: readonly [string, string][] = [['2', 'Tomador'], ['1', 'Mediador'], ['3', 'Sin envío']]) => OPCIONES_REAL('reg1063E_opcEnvio_opcenv', 'reg1063E.opcEnvio.opcenv', 'Envío e-mail', ops)
const VERIF_REAL = OPCIONES_REAL('reg1063E_verifRiesgo_zvriep', 'reg1063E.verifRiesgo.zvriep', 'El mediador declara que ha realizado la verificación del riesgo a asegurar, y que el mismo se encuentra en perfecto estado', [['N', 'No'], ['S', 'Sí']])
const FILA = `<tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr>`
const PANTALLA_DEC = (envio = ENVIO_REAL()) => `<h3>Garantías y Resultados</h3><div id="areaNegocio">${GRID_VACIO}${FP_REAL}${envio}${VERIF_REAL}</div>${BOTONERA}`
const marcada = (page: Page, nombre: string) => page.evaluate((n) => { const el = document.querySelector(`input[name="${n}"]:checked`); return el ? (el.nextElementSibling?.textContent ?? '').trim() : null }, nombre)

/** «Recalcular» solo «calcula» (fila con importe) si están marcadas forma de pago, envío y verificación; si no, «datos incompletos». */
function ctxDecision(page: Page, cuenta: { rec: number; pulsados: number }, pulsar?: (l: import('playwright').Locator) => Promise<void>): ContextoPortal {
  return {
    pulsar: async (l: import('playwright').Locator) => { cuenta.pulsados++; await (pulsar ? pulsar(l) : l.click()) },
    pulsarSubpestanaGenerali: async () => {},
    pulsarSiguienteGenerali: async () => ({ dialogo: null }),
    pulsarRecalcularGenerali: async () => {
      cuenta.rec++
      await page.evaluate(([f, e]) => {
        const ok = ['reg1063E.gridmodseg.yfp', 'reg1063E.opcEnvio.opcenv', 'reg1063E.verifRiesgo.zvriep'].every((n) => document.querySelector(`input[name="${n}"]:checked`))
        if (ok) document.querySelector('#reg1063E_gridmodseg tbody')!.insertAdjacentHTML('beforeend', f!)
        else document.body.insertAdjacentHTML('afterbegin', e!)
      }, [FILA, ERRORES('No se puede calcular con datos incompletos')])
      return { dialogo: null }
    },
  } as unknown as ContextoPortal
}

test('v0.2.43 · decisión de Alberto: marca «Mediador» y «No» (exactas) con «Anual» antes de «Recalcular», por la vía del guard; «Tomador» jamás', async () => {
  const { instalarGuardEmision, pulsar } = await import('../src/guard.ts')
  const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${PANTALLA_DEC()}</body>` }))
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.goto(B028)
    const cuenta = { rec: 0, pulsados: 0 }
    const r = await hastaPrecioGenerali(page, formulario(), [], ctxDecision(page, cuenta, (l) => pulsar(l, guard)), { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    const avisos = r.ofertas[0]!.avisos
    for (const a of ['Forma de pago: anual (por defecto)', 'Envío e-mail: mediador (decisión de Alberto)', 'Verificación del riesgo: no']) assert.ok(avisos.includes(a), `${a} · ${avisos.join(' | ')}`)
    assert.equal(await marcada(page, 'reg1063E.opcEnvio.opcenv'), 'Mediador')
    assert.equal(await marcada(page, 'reg1063E.verifRiesgo.zvriep'), 'No')
    assert.equal(await marcada(page, 'reg1063E.gridmodseg.yfp'), 'Anual')
    assert.equal(cuenta.rec, 1)
    assert.equal(cuenta.pulsados, 3)
  } finally {
    await context.close()
  }
})

test('v0.2.43 · sin «Mediador» EXACTA: error que la nombra, no se marca «Tomador» ni ninguna otra y no se recalcula', async () => {
  const cuenta = { rec: 0, pulsados: 0 }
  await conPagina(PANTALLA_DEC(ENVIO_REAL([['2', 'Tomador'], ['1', 'Mediador (copia)'], ['3', 'Sin envío']])), async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctxDecision(page, cuenta), { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /la opción «Mediador» de «Envío e-mail» \(no existe exactamente; opciones vistas: «Tomador» · «Mediador \(copia\)» · «Sin envío»\)/)
      return true
    })
    assert.equal(await marcada(page, 'reg1063E.opcEnvio.opcenv'), null, 'ninguna opción de envío marcada (ni «Tomador»)')
  })
  assert.equal(cuenta.rec, 0)
})

test('v0.2.43 · con envío y verificación ya marcados, el atasco por otra causa NO lleva «falta decisión de Alberto»', async () => {
  const cuenta = { rec: 0, pulsados: 0 }
  // Sin la fila de la tabla: el portal sigue sin calcular aunque los tres bloques estén marcados (otra causa).
  await conPagina(PANTALLA_DEC(), async (page) => {
    const ctx = ctxDecision(page, cuenta)
    ;(ctx as unknown as { pulsarRecalcularGenerali: () => Promise<{ dialogo: null }> }).pulsarRecalcularGenerali = async () => { cuenta.rec++; return { dialogo: null } }
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.doesNotMatch(e.message, /falta decisión de Alberto/, e.message.slice(0, 200))
      assert.match(e.message, /^generali\/auto: mapa incompleto: faltan el PRECIO/)
      return true
    })
    assert.equal(await marcada(page, 'reg1063E.opcEnvio.opcenv'), 'Mediador')
    assert.equal(await marcada(page, 'reg1063E.verifRiesgo.zvriep'), 'No')
  })
  assert.equal(cuenta.rec, 1)
})
