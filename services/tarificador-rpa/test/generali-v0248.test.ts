// Generali Turismos v0.2.48 (28/10/2026, prueba real con 0.2.47): «Compañía de procedencia: la compañía «Allianz» de la ficha no existe
// exactamente» con «ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO» y «ALIANZA ESPAÑOLA, S.A. DE SEGUROS, LA» en la lista. Resolución pura:
// exacta → alias → razón social por palabra COMPLETA (única). Fixtures SINTÉTICAS con los rótulos vistos en el portal.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, rellenarTipoYProcedenciaGenerali } from '../src/adapters/generali/auto.ts'
import { ALIAS_COMPANIAS_GENERALI, opcionCompaniaProcedenciaGenerali, palabrasCompaniaGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.48 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.53'))

const REAL = ['Seleccione una opción', 'ALIANZA ESPAÑOLA, S.A. DE SEGUROS, LA', 'ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO', 'AXA SEGUROS GENERALES, S.A.', 'MAPFRE ESPAÑA, CIA DE SEGUROS Y REASEGUROS, S.A.', 'MUTUA MADRILEÑA AUTOMOVILISTA', 'SEGUROS CATALANA OCCIDENTE, S.A.', 'LINEA DIRECTA ASEGURADORA, S.A.']
const elegida = (ops: readonly string[], c: string) => { const r = opcionCompaniaProcedenciaGenerali(ops, c); return 'error' in r ? r : { opcion: ops[r.indice], via: r.via } }

test('v0.2.48 · puro: palabras significativas (sin tildes, puntuación, forma jurídica ni «seguros»)', () => {
  assert.deepEqual(palabrasCompaniaGenerali('ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO'), ['ALLIANZ'])
  assert.deepEqual(palabrasCompaniaGenerali('ALIANZA ESPAÑOLA, S.A. DE SEGUROS, LA'), ['ALIANZA', 'ESPANOLA'])
  assert.deepEqual(palabrasCompaniaGenerali('Línea Directa'), ['LINEA', 'DIRECTA'])
})

test('v0.2.48 · puro: «Allianz» → «ALLIANZ, COMPAÑIA…» (alias exacto), NUNCA «ALIANZA ESPAÑOLA»', () => {
  assert.deepEqual(elegida(REAL, 'Allianz'), { opcion: 'ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO', via: 'alias' })
  assert.deepEqual(elegida(REAL, 'ALLIANZ SEGUROS'), { opcion: 'ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO', via: 'alias' })
  // Sin la opción del alias, por razón social; «ALIANZA» no casa «ALLIANZ» (palabra completa).
  assert.deepEqual(elegida(['ALIANZA ESPAÑOLA, S.A. DE SEGUROS, LA', 'ALLIANZ SEGUROS Y REASEGUROS S.A.'], 'Allianz'), { opcion: 'ALLIANZ SEGUROS Y REASEGUROS S.A.', via: 'razon_social' })
  assert.deepEqual(elegida(['ALIANZA ESPAÑOLA, S.A. DE SEGUROS, LA', 'ALLIANZAS GLOBALES'], 'Allianz'), { error: 'ninguna', candidatas: [] })
})

test('v0.2.48 · puro: compañías habituales por razón social cuando el alias exacto no está', () => {
  assert.deepEqual(elegida(REAL, 'Mapfre'), { opcion: 'MAPFRE ESPAÑA, CIA DE SEGUROS Y REASEGUROS, S.A.', via: 'razon_social' })
  assert.deepEqual(elegida(REAL, 'AXA'), { opcion: 'AXA SEGUROS GENERALES, S.A.', via: 'razon_social' })
  assert.deepEqual(elegida(REAL, 'Mutua Madrileña'), { opcion: 'MUTUA MADRILEÑA AUTOMOVILISTA', via: 'razon_social' })
  assert.deepEqual(elegida(REAL, 'Catalana Occidente'), { opcion: 'SEGUROS CATALANA OCCIDENTE, S.A.', via: 'razon_social' })
  assert.deepEqual(elegida(REAL, 'Línea Directa'), { opcion: 'LINEA DIRECTA ASEGURADORA, S.A.', via: 'razon_social' })
  assert.deepEqual(elegida(['MAPFRE', 'MAPFRE ESPAÑA'], 'Mapfre'), { opcion: 'MAPFRE', via: 'exacta' }, 'la exacta manda')
  assert.equal(ALIAS_COMPANIAS_GENERALI.length, 10)
})

test('v0.2.48 · puro: ambigüedad (dos razones sociales empiezan igual) → para con las candidatas', () => {
  assert.deepEqual(elegida(['GENERALI ESPAÑA, S.A.', 'GENERALI VIDA, S.A.', 'ZURICH'], 'Generali'), { error: 'varias', candidatas: ['GENERALI ESPAÑA, S.A.', 'GENERALI VIDA, S.A.'] })
  assert.deepEqual(elegida(REAL, 'Pelayo'), { error: 'ninguna', candidatas: [] })
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

const BLOQUE = (id: string, etiqueta: string, controles: string) =>
  `<div class="trueInline simple" id="${id}Identification"><div class="falseInline column1"><span>${etiqueta}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const SELECT = (name: string, opciones: readonly string[]) => `<select name="${name}">${opciones.map((o, i) => `<option${i === 0 ? ' selected' : ''}>${o}</option>`).join('')}</select>`
const VALORACION = (comp: readonly string[]) => `<h3>Identificación del vehículo</h3><div id="areaNegocio">`
  + BLOQUE('tv', 'Tipo de vehículo', SELECT('reg1E.tipveh', ['Seleccione una opción', 'Turismo'])) + BLOQUE('cp', 'Compañía de procedencia', SELECT('reg1E.ciapro', comp)) + `</div>`
function formulario(extra: Record<string, unknown>): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null, ...extra,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
const ctx = { pausaAccion: async () => {} } as unknown as ContextoPortal
async function conPagina(html: string, fn: (page: import('playwright').Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    await fn(page)
  } finally {
    await context.close()
  }
}
const puesta = (page: import('playwright').Page) => page.evaluate(() => { const s = document.querySelector('select[name="reg1E.ciapro"]') as HTMLSelectElement; return s.options[s.selectedIndex]?.textContent ?? null })

test('v0.2.48 · caso real: ficha «Allianz» → se pone «ALLIANZ, COMPAÑIA…» y el aviso dice la vía', async () => {
  await conPagina(VALORACION(REAL), async (page) => {
    const avisos = await rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Allianz', aniosAseguradoAnterior: 3 }), ctx)
    assert.equal(await puesta(page), 'ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO')
    assert.ok(avisos.includes('Compañía de procedencia: ALLIANZ, COMPAÑIA DE SEGUROS Y REASEGURO (compañía anterior de la ficha «Allianz», por alias)'), avisos.join(' | '))
  })
})

test('v0.2.48 · ambigüedad en el portal: para con las candidatas y no toca el desplegable', async () => {
  await conPagina(VALORACION(['Seleccione una opción', 'GENERALI ESPAÑA, S.A.', 'GENERALI VIDA, S.A.']), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Generali', aniosAseguradoAnterior: 3 }), ctx), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match((e as Error).message, /casan varias por razón social: «GENERALI ESPAÑA, S\.A\.» · «GENERALI VIDA, S\.A\.»; opciones vistas:/)
      return true
    })
    assert.equal(await puesta(page), 'Seleccione una opción')
  })
})

test('v0.2.48 (revisión) · nombre genérico de UNA palabra sin alias → nunca se elige; para con las candidatas', () => {
  const ops = ['MUTUA MADRILEÑA AUTOMOVILISTA', 'MUTUA DE PROPIETARIOS', 'MUTUAL MEDICA', 'PELAYO MUTUA DE SEGUROS']
  assert.deepEqual(elegida(['MUTUA DE PROPIETARIOS', 'PELAYO MUTUA'], 'Mutua'), { error: 'generico', candidatas: ['MUTUA DE PROPIETARIOS'] }, 'una sola candidata tampoco basta')
  assert.deepEqual(elegida(ops, 'Mutua'), { error: 'varias', candidatas: ['MUTUA MADRILEÑA AUTOMOVILISTA', 'MUTUA DE PROPIETARIOS'] })
  assert.deepEqual(elegida(ops, 'Seguros'), { error: 'ninguna', candidatas: [] }, '«Seguros» no es nombre')
  assert.deepEqual(elegida(ops, 'Compañía'), { error: 'ninguna', candidatas: [] })
  // Con DOS palabras significativas, sí por razón social; una marca del mapa de alias de una palabra, también.
  assert.deepEqual(elegida(ops, 'Mutua Propietarios'), { opcion: 'MUTUA DE PROPIETARIOS', via: 'razon_social' })
  assert.deepEqual(elegida(['ZURICH INSURANCE PLC', 'ALIANZA ESPAÑOLA'], 'Zurich'), { opcion: 'ZURICH INSURANCE PLC', via: 'razon_social' })
})

test('v0.2.48 (revisión) · en el portal: «Mutua» genérica → para nombrando las candidatas y no toca el desplegable', async () => {
  await conPagina(VALORACION(['Seleccione una opción', 'MUTUA DE PROPIETARIOS', 'PELAYO MUTUA']), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mutua', aniosAseguradoAnterior: 3 }), ctx), /nombre genérico de una sola palabra y sin alias: no se elige por razón social; candidatas: «MUTUA DE PROPIETARIOS»/)
    assert.equal(await puesta(page), 'Seleccione una opción')
  })
})
