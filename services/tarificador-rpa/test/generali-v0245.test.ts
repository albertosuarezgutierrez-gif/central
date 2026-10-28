// Generali Turismos v0.2.45 (28/10/2026, prueba real con 0.2.44, trabajo dbbd7ab5): «obligatorios vacíos en «Datos de Valoración»: Tipo de vehículo ·
// Compañía de procedencia». Se ponen casando EN VIVO contra las opciones del portal, solo por igualdad EXACTA; nunca otra clase ni otra compañía.
// Fixtures SINTÉTICAS (estructura de bloque de Genernet; las opciones reales aún no se han capturado).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, rellenarTipoYProcedenciaGenerali } from '../src/adapters/generali/auto.ts'
import { companiaProcedenciaPedidaGenerali, indiceOpcionNormalizadaGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.45 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.52'))

test('v0.2.45 · puro: igualdad EXACTA (solo tildes/mayúsculas/espacios) y una sola coincidencia; la compañía sale de la ficha', () => {
  assert.equal(indiceOpcionNormalizadaGenerali(['Seleccione', 'Furgoneta', ' TURISMO ', 'Motocicleta'], ['Turismo']), 2)
  assert.equal(indiceOpcionNormalizadaGenerali(['Turismo 4x4', 'Turismos', 'Todoterreno'], ['Turismo']), -1, 'nunca otra clase')
  assert.equal(indiceOpcionNormalizadaGenerali(['Turismo', 'turismo'], ['Turismo']), -1, 'dos iguales: no se elige a ciegas')
  assert.equal(indiceOpcionNormalizadaGenerali(['MAPFRE ESPAÑA', 'Mapfre', 'ALLIANZ'], ['MAPFRE']), 1)
  assert.equal(indiceOpcionNormalizadaGenerali(['Línea Directa Aseguradora'], ['Linea Directa']), -1)
  assert.deepEqual(companiaProcedenciaPedidaGenerali(' Mapfre ', 3), { compania: 'Mapfre' })
  assert.deepEqual(companiaProcedenciaPedidaGenerali(null, 0), { sinSeguro: true })
  assert.ok('error' in companiaProcedenciaPedidaGenerali(null, null), 'sin dato no se supone nada')
  assert.ok('error' in companiaProcedenciaPedidaGenerali(null, 5))
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
const SELECT = (name: string, opciones: readonly string[], puesta = 0) => `<select name="${name}">${opciones.map((o, i) => `<option${i === puesta ? ' selected' : ''}>${o}</option>`).join('')}</select>`
const TIPOS = ['Seleccione una opción', 'Furgoneta', 'Turismo', 'Motocicleta']
const COMPANIAS = ['Seleccione una opción', 'ALLIANZ', 'MAPFRE ESPAÑA', 'MAPFRE', 'Sin seguro anterior']
const VALORACION = (tipos = TIPOS, comp = COMPANIAS, puestaTipo = 0) => `<h3>Identificación del vehículo</h3><div id="areaNegocio">`
  + BLOQUE('tv', 'Tipo de vehículo', SELECT('reg1E.tipveh', tipos, puestaTipo)) + BLOQUE('cp', 'Compañía de procedencia', SELECT('reg1E.ciapro', comp)) + `</div>`

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
    await page.setContent(`<html><body>${html}</body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}
const ctx = { pausaAccion: async () => {} } as unknown as ContextoPortal
const puesta = (page: Page, name: string) => page.evaluate((n) => { const s = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement; return s.options[s.selectedIndex]?.textContent ?? null }, name)

test('v0.2.45 · «Turismo» exacto y la compañía anterior de la ficha (exacta, no «MAPFRE ESPAÑA»); avisos dicen qué y de dónde', async () => {
  await conPagina(VALORACION(), async (page) => {
    const avisos = await rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mapfre', aniosAseguradoAnterior: 4 }), ctx)
    assert.equal(await puesta(page, 'reg1E.tipveh'), 'Turismo')
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'MAPFRE')
    assert.deepEqual(avisos, ['Tipo de vehículo: Turismo (ramo auto)', 'Compañía de procedencia: MAPFRE (compañía anterior de la ficha)'])
  })
})

test('v0.2.45 · sin compañía en la ficha y 0 años asegurado (DATO): «Sin seguro anterior» exacto', async () => {
  await conPagina(VALORACION(), async (page) => {
    const avisos = await rellenarTipoYProcedenciaGenerali(page, formulario({ aniosAseguradoAnterior: 0 }), ctx)
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'Sin seguro anterior')
    assert.ok(avisos.includes('Compañía de procedencia: Sin seguro anterior (la ficha dice que no tenía seguro anterior)'), avisos.join(' | '))
  })
})

test('v0.2.45 · sin compañía en la ficha ni años: error de DATOS que nombra el campo, y la compañía no se toca', async () => {
  await conPagina(VALORACION(), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario(), ctx), (e: unknown) => {
      assert.ok(e instanceof ErrorTarificador && e.tipo === 'datos', String(e))
      assert.match((e as Error).message, /la ficha no trae la compañía anterior del vehículo .*«Compañía de procedencia»/)
      return true
    })
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'Seleccione una opción')
  })
})

test('v0.2.45 · sin «Turismo» EXACTO: para nombrando el campo y las opciones vistas; no elige otra clase ni toca la compañía', async () => {
  await conPagina(VALORACION(['Seleccione una opción', 'Turismo 4x4', 'Turismos', 'Furgoneta']), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mapfre' }), ctx), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /la opción «Turismo» de «Tipo de vehículo» \(no existe exactamente; opciones vistas: «Turismo 4x4» · «Turismos» · «Furgoneta»\)/)
      return true
    })
    assert.equal(await puesta(page, 'reg1E.tipveh'), 'Seleccione una opción')
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'Seleccione una opción')
  })
})

test('v0.2.45 · compañía de la ficha sin opción EXACTA: para con las opciones vistas (no elige una parecida)', async () => {
  await conPagina(VALORACION(), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mapfre Mutualidad' }), ctx), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /la compañía «Mapfre Mutualidad» de la ficha en «Compañía de procedencia» \(ninguna casa ni exacta, ni por alias, ni por razón social; opciones vistas: «ALLIANZ» · «MAPFRE ESPAÑA» · «MAPFRE» · «Sin seguro anterior»\)/)
      return true
    })
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'Seleccione una opción')
  })
})

test('v0.2.45 · lo que el portal ya trae puesto no se toca', async () => {
  await conPagina(VALORACION(TIPOS, COMPANIAS, 1), async (page) => {
    const avisos = await rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Allianz' }), ctx)
    assert.equal(await puesta(page, 'reg1E.tipveh'), 'Furgoneta', 'ya puesto por el portal: no se cambia')
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'ALLIANZ')
    assert.deepEqual(avisos, ['Compañía de procedencia: ALLIANZ (compañía anterior de la ficha)'])
  })
})

test('v0.2.45 · de punta a punta: con el precio, la oferta lleva los avisos de «Tipo de vehículo» y «Compañía de procedencia»', async () => {
  const SEL = 'ra' + 'dio'
  const GARANTIAS = `<h3>Garantías y Resultados</h3><div id="areaNegocio"><table id="reg1063E_gridmodseg"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody><tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr></tbody></table></div>`
  await conPagina(VALORACION(), async (page) => {
    const c = { ...ctx, pulsarSubpestanaGenerali: async () => { await page.setContent(`<html><body>${GARANTIAS}</body></html>`) } } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario({ companiaAnterior: 'Mapfre', aniosAseguradoAnterior: 4 }), [], c, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    for (const a of ['Tipo de vehículo: Turismo (ramo auto)', 'Compañía de procedencia: MAPFRE (compañía anterior de la ficha)']) assert.ok(r.ofertas[0]!.avisos.includes(a), r.ofertas[0]!.avisos.join(' | '))
  })
})
