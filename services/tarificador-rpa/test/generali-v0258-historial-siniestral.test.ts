// Generali Turismos v0.2.58 (01/11/2026, trabajo af1fb857: «El paso anterior no tiene los datos completos» con «Datos de Valoración» y «Garantías y Resultados» sin
// obligatorios vacíos). HIPÓTESIS: la pestaña «Historial Siniestral», que el bot nunca abría, exige antecedentes. Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { avisoEsSupuesto, conAntecedentesFavorables, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, completarHistorialSiniestralGenerali } from '../src/adapters/generali/auto.ts'
import { planHistorialSiniestralGenerali, valorHistorialSiniestralGenerali, type BloqueHistorialGenerali } from '../src/adapters/generali/reglas.ts'
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

const BLOQUE = (etiqueta: string, controles: string, obligatorio = true) =>
  `<div class="trueInline simple"><div class="falseInline column1"><span>${etiqueta}</span>${obligatorio ? '<div class="trueInline required"><span> * </span></div>' : ''}</div><div class="falseInline column2">${controles}</div></div>`
const TEXTO = (name: string) => `<input type="text" name="${name}" value="">`
const SELECT = (name: string, ops: readonly string[]) => `<select name="${name}">${ops.map((o, i) => `<option${i === 0 ? ' selected' : ''}>${o}</option>`).join('')}</select>`
const VALORACION = `<h3>Datos de Valoración</h3>` + BLOQUE('Forma de pago a contratar', TEXTO('fp'))
const NUMEROS = ['Seleccione una opción', '0', '1', '2', '3', '4', '5', '6']
const HISTORIAL = (extra = '') => `<h3>Historial Siniestral</h3>` + BLOQUE('Años asegurado', TEXTO('reg.anios')) + BLOQUE('Siniestros últimos 5 años', SELECT('reg.sin', NUMEROS)) + extra

function formulario(extra: Record<string, unknown> = {}): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null, ...extra,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
async function conPagina<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${VALORACION}</body></html>`)
    return await fn(page)
  } finally { await context.close() }
}
/** Contexto con la puerta: «Historial Siniestral» pinta `html` en el marco y lo devuelve; cuenta las pulsaciones. */
const contexto = (page: Page, html: string | null, pulsadas: string[] = []) => ({
  pausaAccion: async () => {},
  pulsarSubpestanaGenerali: async (t: string) => {
    pulsadas.push(t)
    if (html === null) throw new Error('la subpestaña «Historial Siniestral» (0 controles visibles con ese texto; hace falta exactamente uno)')
    await page.setContent(`<html><body>${VALORACION}${html}</body></html>`)
    return page.mainFrame()
  },
}) as unknown as Pick<ContextoPortal, 'pausaAccion' | 'pulsarSubpestanaGenerali'>
const valor = (page: Page, name: string) => page.evaluate((n) => {
  const el = document.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLSelectElement
  return el instanceof HTMLSelectElement ? (el.options[el.selectedIndex]?.textContent ?? null) : el.value
}, name)
const ant = (extra: Record<string, unknown> = {}) => conAntecedentesFavorables(formulario(extra))

test('v0.2.58 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.58'))

test('v0.2.58 · la pestaña «Historial Siniestral» está en la lista blanca (exacta) y nada peligroso se cuela', () => {
  assert.ok(SUBPESTANAS_GENERALI.includes('Historial Siniestral'))
  assert.equal(subpestanaGeneraliPermitida('Historial Siniestral'), true)
  assert.equal(subpestanaGeneraliPermitida('Historial Siniestral y emitir'), false)
  assert.equal(subpestanaGeneraliPermitida('Comparar'), false)
})

test('v0.2.58 · valores por rótulo: años asegurado, siniestros; fechas, importes y desconocidos NO se inventan', () => {
  const f = { aniosAseguradoAnterior: 7, siniestrosUltimos5Anios: 0 }
  assert.deepEqual(valorHistorialSiniestralGenerali('Años asegurado', f), { valor: '7', clave: 'aniosAseguradoAnterior' })
  assert.deepEqual(valorHistorialSiniestralGenerali('Antigüedad (años) en la compañía', f), { valor: '7', clave: 'aniosAseguradoAnterior' })
  assert.deepEqual(valorHistorialSiniestralGenerali('Nº de siniestros', f), { valor: '0', clave: 'siniestrosUltimos5Anios' })
  assert.deepEqual(valorHistorialSiniestralGenerali('Años sin siniestros', f), { valor: '7', clave: 'aniosAseguradoAnterior' })
  assert.equal(valorHistorialSiniestralGenerali('Años sin siniestros', { ...f, siniestrosUltimos5Anios: 2 }), null)
  for (const e of ['Fecha de antigüedad', 'Fecha alta años asegurado', 'Importe siniestros', 'Bonus', 'Observaciones', '']) assert.equal(valorHistorialSiniestralGenerali(e, f), null, e)
})

test('v0.2.58 · plan: rellena lo vacío con regla; nombra el obligatorio vacío sin regla; el no obligatorio sin regla se ignora', () => {
  const b = (etiqueta: string, p: Partial<BloqueHistorialGenerali> = {}): BloqueHistorialGenerali => ({ etiqueta, tipo: 'texto', name: etiqueta, opciones: [], vacio: true, obligatorio: true, ...p })
  const plan = planHistorialSiniestralGenerali([b('Años asegurado'), b('Siniestros', { vacio: false }), b('Fecha de antigüedad'), b('Notas', { obligatorio: false }), b('Siniestros 5', { tipo: 'select', opciones: ['Seleccione', 'x'] })], { aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 }, ['siniestrosUltimos5Anios'])
  assert.deepEqual(plan.acciones.map((a) => [a.bloque.etiqueta, a.valor]), [['Años asegurado', '3']])
  assert.deepEqual(plan.sinRegla, ['Fecha de antigüedad', 'Siniestros 5'])
})

test('v0.2.58 · punta a punta con datos de la ficha: se abre la pestaña, se rellenan años y siniestros y los avisos dicen «dato de la ficha»', async () => {
  await conPagina(async (page) => {
    const pulsadas: string[] = []
    const f = ant({ aniosAseguradoAnterior: 6, siniestrosUltimos5Anios: 1 })
    const r = await completarHistorialSiniestralGenerali(page, contexto(page, HISTORIAL(), pulsadas), f.formulario, f.claves, 0)
    assert.deepEqual(pulsadas, ['Historial Siniestral'])
    assert.equal(await valor(page, 'reg.anios'), '6')
    assert.equal(await valor(page, 'reg.sin'), '1')
    assert.equal(r.avisos.length, 2)
    assert.ok(r.avisos.every((a) => /dato de la ficha/.test(a) && !avisoEsSupuesto(a)))
  })
})

test('v0.2.58 · sin dato: siniestralidad más favorable y el aviso es «supuesto» (firmeza estimado)', async () => {
  await conPagina(async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, contexto(page, HISTORIAL()), f.formulario, f.claves, 0)
    assert.equal(await valor(page, 'reg.sin'), '0')
    assert.ok(r.avisos.length === 2 && r.avisos.every((a) => /siniestralidad más favorable; supuesto/.test(a) && avisoEsSupuesto(a)))
  })
})

test('v0.2.58 · obligatorio vacío sin regla (fecha): para y NOMBRA el campo; lo rellenable sí se rellenó', async () => {
  await conPagina(async (page) => {
    const f = ant()
    await assert.rejects(
      completarHistorialSiniestralGenerali(page, contexto(page, HISTORIAL(BLOQUE('Fecha de antigüedad', TEXTO('reg.fecha')))), f.formulario, f.claves, 0),
      (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /«Historial Siniestral» con obligatorios vacíos .*\): Fecha de antigüedad\./.test(e.message) && !/reg\.fecha/.test(e.message),
    )
    assert.equal(await valor(page, 'reg.fecha'), '')
    assert.notEqual(await valor(page, 'reg.anios'), '')
  })
})

test('v0.2.58 · desplegable sin la opción exacta del valor: para nombrándolo y no toca nada', async () => {
  await conPagina(async (page) => {
    const f = ant({ aniosAseguradoAnterior: 4, siniestrosUltimos5Anios: 9 })
    await assert.rejects(
      completarHistorialSiniestralGenerali(page, contexto(page, HISTORIAL()), f.formulario, f.claves, 0),
      (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /Siniestros últimos 5 años/.test(e.message),
    )
    assert.equal(await valor(page, 'reg.sin'), 'Seleccione una opción')
  })
})

test('v0.2.58 · lo que ya estaba a la vista antes de abrir la pestaña (zona común) no cuenta como Historial: no se toca ni para', async () => {
  await conPagina(async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, contexto(page, HISTORIAL()), f.formulario, f.claves, 0)
    assert.equal(await valor(page, 'fp'), '')
    assert.ok(!r.avisos.some((a) => /Forma de pago/.test(a)))
  })
})

test('v0.2.58 · la pestaña no existe: se anota y se sigue como antes (sin error)', async () => {
  await conPagina(async (page) => {
    const f = ant()
    const r = await completarHistorialSiniestralGenerali(page, contexto(page, null), f.formulario, f.claves, 0)
    assert.deepEqual(r.avisos, [])
    assert.match(r.nota, /Historial Siniestral no abierto/)
  })
})

test('v0.2.58 · con la pestaña ya rellena no se teclea nada y no hay avisos', async () => {
  await conPagina(async (page) => {
    const f = ant()
    const rellena = `<h3>Historial Siniestral</h3>` + BLOQUE('Años asegurado', '<input type="text" name="reg.anios" value="5">') + BLOQUE('Siniestros', SELECT('reg.sin', ['Seleccione', '0']).replace('<option selected>Seleccione', '<option>Seleccione').replace('<option>0', '<option selected>0'))
    const r = await completarHistorialSiniestralGenerali(page, contexto(page, rellena), f.formulario, f.claves, 0)
    assert.deepEqual(r.avisos, [])
    assert.equal(await valor(page, 'reg.anios'), '5')
  })
})
