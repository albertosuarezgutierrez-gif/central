// Generali Turismos v0.2.60 (02/11/2026, volcados reales del trabajo af1fb857): «Historial Siniestral» NO es una subpestaña sino una SECCIÓN de «Datos de Valoración»
// (campos `reg1063A.histSiniestral.*`), ya visible. Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { avisoEsSupuesto, conAntecedentesFavorables, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, completarHistorialSiniestralGenerali } from '../src/adapters/generali/auto.ts'
import { planHistorialSiniestralGenerali, planOrigenHistorialGenerali, valorHistorialSiniestralGenerali, esCampoOrigenHistorialGenerali, type BloqueHistorialGenerali } from '../src/adapters/generali/reglas.ts'
import { SUBPESTANAS_GENERALI, subpestanaGeneraliPermitida } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

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

const P = 'reg1063A.histSiniestral.'
const BLOQUE = (etiqueta: string, controles: string, obligatorio = true) =>
  `<div class="trueInline simple"><div class="falseInline column1"><span>${etiqueta}</span>${obligatorio ? '<div class="trueInline required"><span> * </span></div>' : ''}</div><div class="falseInline column2">${controles}</div></div>`
const TEXTO = (name: string) => `<input type="text" name="${name}" value="">`
const SELECT = (name: string, ops: readonly string[]) => `<select name="${name}">${ops.map((o, i) => `<option${i === 0 ? ' selected' : ''}>${o}</option>`).join('')}</select>`
const NUMEROS = ['Seleccione una opción', '0', '1', '2', '3', '4', '5', '6']
const ORIGEN = ['Seleccione una opción', 'CONSULTA AL FICHERO SINCO', 'Simulación fichero SINCO']
const VALORACION = `<h3>Datos de Valoración</h3>` + BLOQUE('Forma de pago a contratar', TEXTO('fp'))
const ORIGEN_BLOQUE = BLOQUE('Origen del historial siniestral', SELECT(`${P}yhsori`, ORIGEN))
const ANIOS = BLOQUE('Años asegurado', TEXTO(`${P}anios`))
const SINIESTROS = BLOQUE('Siniestros últimos 5 años', SELECT(`${P}sin`, NUMEROS))
/** Sección ya visible en la misma pantalla que Datos de Valoración (sin subpestaña). */
const SECCION = (...bloques: string[]) => `<html><body>${VALORACION}<h3>Historial Siniestral</h3>${bloques.join('')}</body></html>`

function formulario(extra: Record<string, unknown> = {}): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null, ...extra,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(html)
    return await fn(page)
  } finally { await context.close() }
}
const ctx = { pausaAccion: async () => {} } as unknown as Pick<ContextoPortal, 'pausaAccion'>
const valor = (page: Page, name: string) => page.evaluate((n) => {
  const el = document.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLSelectElement
  return el instanceof HTMLSelectElement ? (el.options[el.selectedIndex]?.textContent ?? null) : el.value
}, name)
const ant = (extra: Record<string, unknown> = {}) => conAntecedentesFavorables(formulario(extra))

test('v0.2.60 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.68'))

test('v0.2.60 · «Historial Siniestral» ya no es subpestaña pulsable (lista blanca solo con Garantías)', () => {
  assert.deepEqual([...SUBPESTANAS_GENERALI], ['Garantías y Resultados'])
  assert.equal(subpestanaGeneraliPermitida('Historial Siniestral'), false)
  assert.equal(subpestanaGeneraliPermitida('Garantías y Resultados'), true)
})

test('v0.2.60 · valores por rótulo: años asegurado, siniestros; fechas, importes, origen y desconocidos NO se inventan', () => {
  const f = { aniosAseguradoAnterior: 7, siniestrosUltimos5Anios: 0 }
  assert.deepEqual(valorHistorialSiniestralGenerali('Años asegurado', f), { valor: '7', clave: 'aniosAseguradoAnterior' })
  assert.deepEqual(valorHistorialSiniestralGenerali('Nº de siniestros', f), { valor: '0', clave: 'siniestrosUltimos5Anios' })
  assert.equal(valorHistorialSiniestralGenerali('Años sin siniestros', { ...f, siniestrosUltimos5Anios: 2 }), null)
  for (const e of ['Fecha de antigüedad', 'Importe siniestros', 'Bonus', 'Observaciones', '', 'Origen del historial siniestral']) assert.equal(valorHistorialSiniestralGenerali(e, f), null, e)
})

test('v0.2.60 · origen: consulta SINCO con póliza anterior como dato; simulación sin ella o con años supuestos; por texto (mayúsculas/tildes), nunca por índice', () => {
  assert.deepEqual(planOrigenHistorialGenerali(ORIGEN, { aniosAseguradoAnterior: 4 }, []), { tipo: 'elegir', indice: 1, supuesto: false })
  assert.deepEqual(planOrigenHistorialGenerali(ORIGEN, { aniosAseguradoAnterior: 0 }, []), { tipo: 'elegir', indice: 2, supuesto: true })
  assert.deepEqual(planOrigenHistorialGenerali(ORIGEN, { aniosAseguradoAnterior: 10 }, ['aniosAseguradoAnterior']), { tipo: 'elegir', indice: 2, supuesto: true })
  // el orden de las opciones no importa
  assert.deepEqual(planOrigenHistorialGenerali([...ORIGEN].reverse(), { aniosAseguradoAnterior: 4 }, []), { tipo: 'elegir', indice: 1, supuesto: false })
  // sin opción única → sin regla (no se adivina)
  assert.deepEqual(planOrigenHistorialGenerali(['Seleccione', 'Otro'], { aniosAseguradoAnterior: 4 }, []), { tipo: 'sinRegla' })
  assert.deepEqual(planOrigenHistorialGenerali(['Consulta SINCO', 'consulta  sinco'], { aniosAseguradoAnterior: 4 }, []), { tipo: 'sinRegla' })
  assert.equal(esCampoOrigenHistorialGenerali({ name: `${P}yhsori`, etiqueta: 'x' }), true)
  assert.equal(esCampoOrigenHistorialGenerali({ name: 'a', etiqueta: 'Origen del historial siniestral *' }), true)
  assert.equal(esCampoOrigenHistorialGenerali({ name: `${P}sin`, etiqueta: 'Siniestros' }), false)
})

test('v0.2.60 · plan: rellena lo vacío con regla; nombra el obligatorio vacío sin regla; yhsori no cuenta como nº de siniestros', () => {
  const b = (etiqueta: string, p: Partial<BloqueHistorialGenerali> = {}): BloqueHistorialGenerali => ({ etiqueta, tipo: 'texto', name: etiqueta, opciones: [], vacio: true, obligatorio: true, ...p })
  const plan = planHistorialSiniestralGenerali([
    b('Años asegurado'), b('Siniestros', { vacio: false }), b('Fecha de antigüedad'), b('Notas', { obligatorio: false }),
    b('Origen del historial siniestral', { tipo: 'select', name: `${P}yhsori`, opciones: ORIGEN }),
  ], { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 }, ['siniestrosUltimos5Anios'])
  assert.deepEqual(plan.acciones.map((a) => [a.bloque.etiqueta, a.valor]), [['Años asegurado', '3']])
  assert.deepEqual(plan.sinRegla, ['Fecha de antigüedad'])
})

test('v0.2.60 · sección ya visible sin subpestaña, con póliza anterior: elige «Consulta…SINCO» por texto y rellena el resto con el dato de la ficha', async () => {
  await conPagina(SECCION(ORIGEN_BLOQUE, ANIOS, SINIESTROS), async (page) => {
    const f = ant({ aniosAseguradoAnterior: 6, siniestrosUltimos5Anios: 1 })
    const r = await completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0)
    assert.equal(await valor(page, `${P}yhsori`), 'CONSULTA AL FICHERO SINCO')
    assert.equal(await valor(page, `${P}anios`), '6')
    assert.equal(await valor(page, `${P}sin`), '1')
    assert.equal(r.avisos.length, 3)
    assert.ok(r.avisos.every((a) => /dato de la ficha|póliza anterior de la ficha/.test(a) && !avisoEsSupuesto(a)), r.avisos.join(' | '))
    assert.equal(await valor(page, 'fp'), '', 'lo de Datos de Valoración (fuera de histSiniestral) no se toca')
  })
})

test('v0.2.60 · sin póliza anterior: «Simulación fichero SINCO» + aviso de supuesto (precio estimado) y siniestralidad más favorable', async () => {
  await conPagina(SECCION(ORIGEN_BLOQUE, ANIOS, SINIESTROS), async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0)
    assert.equal(await valor(page, `${P}yhsori`), 'Simulación fichero SINCO')
    assert.equal(await valor(page, `${P}sin`), '0')
    assert.ok(r.avisos.length === 3 && r.avisos.every((a) => avisoEsSupuesto(a)), r.avisos.join(' | '))
  })
})

test('v0.2.60 · el origen refresca la sección: tras elegirlo aparecen campos nuevos y se rellenan solo los vacíos con regla', async () => {
  await conPagina(SECCION(ORIGEN_BLOQUE, '<div id="extra"></div>'), async (page) => {
    await page.evaluate(([html]) => {
      const sel = document.querySelector('select') as HTMLSelectElement
      sel.addEventListener('change', () => { setTimeout(() => { (document.getElementById('extra') as HTMLElement).innerHTML = html! }, 200) })
    }, [ANIOS])
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 1_500)
    assert.equal(await valor(page, `${P}anios`), String(f.formulario.aniosAseguradoAnterior))
    assert.ok(r.avisos.length >= 2)
  })
})

test('v0.2.60 · obligatorios sin regla (certificados/fechas): no se inventan y el hueco los NOMBRA; lo rellenable sí se rellenó', async () => {
  const fechas = BLOQUE('Fecha certificado desde', TEXTO(`${P}ffcerd`)) + BLOQUE('Fecha certificado hasta', TEXTO(`${P}ffcerh`))
  await conPagina(SECCION(ORIGEN_BLOQUE, ANIOS, fechas), async (page) => {
    const f = ant()
    await assert.rejects(
      completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0),
      (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /«Historial Siniestral» con obligatorios vacíos .*\): Fecha certificado desde · Fecha certificado hasta\./.test(e.message) && !/ffcerd/.test(e.message),
    )
    assert.equal(await valor(page, `${P}ffcerd`), '')
    assert.equal(await valor(page, `${P}ffcerh`), '')
    assert.notEqual(await valor(page, `${P}anios`), '')
  })
})

test('v0.2.60 · origen sin opción SINCO identificable: para nombrándolo y no toca el desplegable', async () => {
  const raro = BLOQUE('Origen del historial siniestral', SELECT(`${P}yhsori`, ['Seleccione una opción', 'Otro origen']))
  await conPagina(SECCION(raro, ANIOS), async (page) => {
    const f = ant()
    await assert.rejects(
      completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0),
      (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /Origen del historial siniestral/.test(e.message),
    )
    assert.equal(await valor(page, `${P}yhsori`), 'Seleccione una opción')
  })
})

test('v0.2.60 · desplegable de siniestros sin la opción exacta: para nombrándolo', async () => {
  await conPagina(SECCION(ORIGEN_BLOQUE, ANIOS, SINIESTROS), async (page) => {
    const f = ant({ aniosAseguradoAnterior: 4, siniestrosUltimos5Anios: 9 })
    await assert.rejects(
      completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0),
      (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /Siniestros últimos 5 años/.test(e.message),
    )
    assert.equal(await valor(page, `${P}sin`), 'Seleccione una opción')
  })
})

test('v0.2.60 · sin la sección a la vista: se anota y se sigue (sin error)', async () => {
  await conPagina(`<html><body>${VALORACION}</body></html>`, async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0)
    assert.deepEqual(r.avisos, [])
    assert.match(r.nota, /Historial Siniestral no encontrado/)
  })
})

test('v0.2.60 · sección ya rellena: no se teclea nada y no hay avisos', async () => {
  const rellena = ORIGEN_BLOQUE.replace('<option selected>Seleccione una opción</option>', '<option>Seleccione una opción</option>').replace('<option>Simulación', '<option selected>Simulación')
    + BLOQUE('Años asegurado', `<input type="text" name="${P}anios" value="5">`)
  await conPagina(SECCION(rellena), async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, ctx, f.formulario, f.claves, 0)
    assert.deepEqual(r.avisos, [])
    assert.equal(await valor(page, `${P}anios`), '5')
  })
})
