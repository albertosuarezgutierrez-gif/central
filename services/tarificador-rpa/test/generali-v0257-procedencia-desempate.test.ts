// Generali Turismos v0.2.57 (01/11/2026, trabajo af1fb857 parado con «Mapfre» en «Compañía de procedencia»: casaban AGROPECUARIA · AUTOMOVILES ·
// FAMILIAR · GUANARTEME · MUTUALIDAD). Varias de la misma marca → desempate determinista por ramo (tabla de preferencias); sin desempate, atasco.
// Fixtures SINTÉTICAS (nombres de catálogo; nada personal).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { avisoEsSupuesto, firmezaPrecioRpa, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, rellenarTipoYProcedenciaGenerali } from '../src/adapters/generali/auto.ts'
import { desempatarProcedenciaGenerali, opcionCompaniaProcedenciaGenerali } from '../src/adapters/generali/reglas.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const MAPFRE = [
  'Seleccione una opción',
  'MAPFRE AGROPECUARIA, MUTUALIDAD DE SEGUROS Y REASEGUROS',
  'MAPFRE AUTOMOVILES S. A. DE SEGUROS Y REASEGUROS',
  'MAPFRE FAMILIAR, COMPAÑÍA DE SEGUROS Y REASEGUROS',
  'MAPFRE GUANARTEME, CIA DE SEGUROS',
  'MAPFRE MUTUALIDAD DE SEGUROS Y REASEGUROS APF',
]
const sin = (...quitar: number[]) => MAPFRE.filter((_, i) => !quitar.includes(i))
const nombre = (ops: readonly string[], r: ReturnType<typeof opcionCompaniaProcedenciaGenerali>) => ('indice' in r ? ops[r.indice] : r.error)

test('v0.2.57 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.57'))

test('v0.2.57 · caso real: «Mapfre» en auto → la de AUTOMOVILES, vía aproximada', () => {
  const r = opcionCompaniaProcedenciaGenerali(MAPFRE, 'Mapfre', 'auto')
  assert.equal(nombre(MAPFRE, r), MAPFRE[2])
  assert.equal('via' in r ? r.via : null, 'aproximada')
})

test('v0.2.57 · sin AUTOMOVILES → FAMILIAR (nunca AGROPECUARIA/GUANARTEME)', () => {
  const ops = sin(2)
  assert.equal(nombre(ops, opcionCompaniaProcedenciaGenerali(ops, 'Mapfre', 'auto')), MAPFRE[3])
})

test('v0.2.57 · sin AUTOMOVILES ni FAMILIAR: queda MUTUALIDAD (única no evitable)', () => {
  const ops = sin(2, 3)
  assert.equal(nombre(ops, opcionCompaniaProcedenciaGenerali(ops, 'Mapfre', 'auto')), MAPFRE[5])
})

test('v0.2.57 · AGROPECUARIA/GUANARTEME solo si es la ÚNICA vía: entre las dos evitables no se elige', () => {
  const ops = sin(2, 3, 5)
  const r = opcionCompaniaProcedenciaGenerali(ops, 'Mapfre', 'auto')
  assert.ok('error' in r && r.error === 'varias', JSON.stringify(r))
  assert.equal(desempatarProcedenciaGenerali('MAPFRE', 'auto', ['MAPFRE AGROPECUARIA, MUTUALIDAD', 'MAPFRE GUANARTEME, CIA']), null)
  // Una sola candidata evitable (la única de su marca) sí se elige: lo hace la razón social, sin desempate.
  assert.equal(nombre(['Seleccione', 'MAPFRE GUANARTEME, CIA DE SEGUROS'], opcionCompaniaProcedenciaGenerali(['Seleccione', 'MAPFRE GUANARTEME, CIA DE SEGUROS'], 'Mapfre', 'auto')), 'MAPFRE GUANARTEME, CIA DE SEGUROS')
})

test('v0.2.57 · dos AUTOMOVILES → empate real, atasco como antes (no se adivina)', () => {
  const ops = [...MAPFRE, 'MAPFRE AUTOMOVILES II']
  const r = opcionCompaniaProcedenciaGenerali(ops, 'Mapfre', 'auto')
  assert.ok('error' in r && r.error === 'varias', JSON.stringify(r))
})

test('v0.2.57 · sin ramo, ramo sin entrada o marca sin entrada → el comportamiento actual (atascado)', () => {
  assert.ok('error' in opcionCompaniaProcedenciaGenerali(MAPFRE, 'Mapfre'))
  assert.ok('error' in opcionCompaniaProcedenciaGenerali(MAPFRE, 'Mapfre', 'hogar'))
  assert.equal(desempatarProcedenciaGenerali('ZURICH', 'auto', ['ZURICH A', 'ZURICH B']), null)
})

test('v0.2.57 · genérico: el mecanismo vale para cualquier marca/ramo de la tabla; Mutua prefiere AUTOMOVILISTA; Generali/Allianz sin entrada siguen atascados', () => {
  assert.equal(desempatarProcedenciaGenerali('MUTUA', 'auto', ['MUTUA UNIVERSAL', 'MUTUA MADRILEÑA AUTOMOVILISTA']), 1)
  const tabla = { ALLIANZ: { auto: { preferir: [], evitar: ['VIDA'] } } }
  assert.equal(desempatarProcedenciaGenerali('ALLIANZ', 'auto', ['ALLIANZ VIDA, S.A.', 'ALLIANZ, COMPAÑIA DE SEGUROS'], tabla), 1)
  assert.equal(desempatarProcedenciaGenerali('GENERALI', 'auto', ['GENERALI ESPAÑA', 'GENERALI VIDA']), null, 'sin entrada en la tabla real: atasco (v0.2.48)')
})

test('v0.2.57 · el aviso cuenta como supuesto: la firmeza queda estimado', () => {
  const aviso = 'Compañía de procedencia: MAPFRE AUTOMOVILES S. A. DE SEGUROS Y REASEGUROS (compañía anterior de la ficha «Mapfre»: elegida por aproximación entre varias de la misma marca; supuesto)'
  assert.ok(avisoEsSupuesto(aviso))
  const riesgo = { polizaAnteriorUltimos5: '12345' }
  assert.equal(firmezaPrecioRpa({ compania: 'generali', ramo: 'auto', riesgo, oferta: { polizaAnteriorTecleada: true, avisos: [] } }), 'firme')
  assert.equal(firmezaPrecioRpa({ compania: 'generali', ramo: 'auto', riesgo, oferta: { polizaAnteriorTecleada: true, avisos: [aviso] } }), 'estimado')
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
  } finally { await context.close() }
}
const ctx = { pausaAccion: async () => {} } as unknown as ContextoPortal
const puesta = (page: Page, name: string) => page.evaluate((n) => { const s = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement; return s.options[s.selectedIndex]?.textContent ?? null }, name)

test('v0.2.57 · de punta a punta: se pone la de AUTOMOVILES y el aviso la declara como supuesto', async () => {
  await conPagina(VALORACION(MAPFRE), async (page) => {
    const avisos = await rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mapfre', aniosAseguradoAnterior: 4 }), ctx)
    assert.equal(await puesta(page, 'reg1E.ciapro'), MAPFRE[2])
    const a = avisos.find((x) => x.startsWith('Compañía de procedencia'))!
    assert.match(a, /elegida por aproximación/)
    assert.ok(avisoEsSupuesto(a))
  })
})

test('v0.2.57 · de punta a punta: empate real → atasco como antes y el desplegable queda sin tocar', async () => {
  await conPagina(VALORACION([...MAPFRE, 'MAPFRE AUTOMOVILES II']), async (page) => {
    await assert.rejects(rellenarTipoYProcedenciaGenerali(page, formulario({ companiaAnterior: 'Mapfre', aniosAseguradoAnterior: 4 }), ctx), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /casan varias por razón social/.test(e.message))
    assert.equal(await puesta(page, 'reg1E.ciapro'), 'Seleccione una opción')
  })
})
