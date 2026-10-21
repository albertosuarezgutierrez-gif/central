// Compañía anterior COMPUESTA «A / B» (Turismos v0.6.19 / Moto v0.7.21): casa por partes, cae a la opción genérica DECLARÁNDOLO y,
// sin genérica, `datos` con la lista completa. Solo nombres de aseguradoras; ningún dato personal.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { casarCompaniaActual, indiceOpcionGenerica, indicesCompaniaActualCompuesta, supuestoCompaniaGenerica } from '../src/compania-actual.ts'
import { casarCompaniaActualTurismos } from '../src/guard.ts'
import { elegirCompaniaOrigen, mensajeCompaniaNoCasa, supuestosAplicadosTurismos } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { supuestosAuto, type FormularioAuto } from '@central/module-tarificacion'

const LISTA = ['AXA, SEGUROS GENERALES S.A.', 'CASER', 'LÍNEA DIRECTA/SEGUROS NUEZ', 'MAPFRE ESPAÑA COMPAÑÍA DE SEGUROS', 'REALE AUTOS', 'ZURICH INSURANCE PLC SUC. ESPAÑA']
const COMPUESTA = 'DIVINA PASTORA / CLEVEREA'

test('compuesta: el nombre entero manda; si no casa, la primera PARTE que casa con una sola opción', () => {
  assert.deepEqual(indicesCompaniaActualCompuesta(LISTA, 'Desconocida / Reale Autos'), [4])
  assert.deepEqual(indicesCompaniaActualCompuesta(LISTA, 'Mapfre / Reale'), [3], 'gana la primera parte que casa')
  assert.equal(casarCompaniaActual(LISTA, 'Zurich / Otra').estado, 'unica')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Revendedor X / Línea Directa'), [2], 'la puerta de Turismos usa el mismo casado')
  assert.deepEqual(indicesCompaniaActualCompuesta(LISTA, COMPUESTA), [])
  assert.deepEqual(indicesCompaniaActualCompuesta(LISTA, 'Reale'), [4], 'sin « / »: como siempre')
})

test('compuesta: nunca se adivina entre ambiguas (parte ambigua → ambigua; entero ambiguo manda sobre las partes)', () => {
  const l = ['MUTUA MADRILEÑA AUTOMOVILISTA', 'MUTUA MADRILEÑA DE TAXIS (MMT)', 'REALE AUTOS']
  assert.equal(casarCompaniaActual(l, 'Nada / Mutua Madrileña').estado, 'ambigua')
  assert.equal(casarCompaniaActual(l, 'Nada / Mutua Madrileña / Reale').estado, 'unica', 'una parte única posterior gana a una ambigua anterior')
  assert.equal(casarCompaniaActual(l, 'Mutua Madrileña / Reale').estado, 'unica', 'la 1ª parte es ambigua (no se elige) pero la 2ª es única')
  assert.equal(casarCompaniaActual(l, 'Mutua Madrileña / Nada').estado, 'ambigua')
})

test('genérica: una sola opción «OTRAS / OTRA COMPAÑÍA / RESTO / VARIAS»; ninguna o varias → -1', () => {
  assert.equal(indiceOpcionGenerica([...LISTA, 'OTRAS COMPAÑÍAS']), 6)
  assert.equal(indiceOpcionGenerica([...LISTA, 'Otra Compañía']), 6)
  assert.equal(indiceOpcionGenerica([...LISTA, 'RESTO']), 6)
  assert.equal(indiceOpcionGenerica(LISTA), -1)
  assert.equal(indiceOpcionGenerica([...LISTA, 'OTRAS', 'OTRA COMPAÑÍA']), -1, 'dos genéricas: no se adivina')
  assert.equal(indiceOpcionGenerica([...LISTA, 'OTROSÍ SEGUROS']), -1, '«otros…» no es genérica')
})

test('supuesto de genérica: se declara en el aviso de Turismos con la compañía y la opción marcada', () => {
  const s = supuestoCompaniaGenerica(COMPUESTA, 'OTRAS COMPAÑÍAS')
  assert.equal(s, 'Compañía anterior «DIVINA PASTORA / CLEVEREA» no está en la lista de Allianz: se marca «OTRAS COMPAÑÍAS»')
  const sup = supuestosAuto({ ramo: 'auto' } as unknown as FormularioAuto, new Date('2026-10-21T10:00:00Z'))
  assert.match(supuestosAplicadosTurismos(sup, [s]) ?? '', /Compañía anterior «DIVINA PASTORA \/ CLEVEREA» no está en la lista de Allianz: se marca «OTRAS COMPAÑÍAS»/)
})

test('mensaje sin genérica: lista TODAS las opciones (96) sin cortar a mitad, con las afines a cada parte primero', () => {
  const muchas = Array.from({ length: 96 }, (_, i) => `ASEGURADORA NUMERO ${String(i).padStart(2, '0')} DE PRUEBA`)
  muchas[90] = 'DIVINA PASTORA SEGUROS GENERALES'
  const m = mensajeCompaniaNoCasa(COMPUESTA, muchas)
  assert.match(m, /opciones leídas \(96\)/)
  assert.ok(m.indexOf('DIVINA PASTORA SEGUROS GENERALES') < m.indexOf('NUMERO 00'), 'las afines, primero')
  assert.ok(m.length <= 1_900, `cabe en el tope del runner (${m.length})`)
  assert.doesNotMatch(m, /\|\s*$/)
  const corta = mensajeCompaniaNoCasa(COMPUESTA, LISTA)
  assert.doesNotMatch(corta, /más\)/)
  for (const o of LISTA) assert.ok(corta.includes(o))
})

let browser: Browser
let page: Page
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
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
})
after(async () => {
  await browser?.close()
})

const SELECT = (extra: string) => `<body><select id="ciaOrigen"><option value="">---Selección Compañías---</option><option value="C1">CASER</option><option value="E1">MAPFRE ESPAÑA COMPAÑÍA DE SEGUROS</option>${extra}</select></body>`

test('Moto · elegirCompaniaOrigen: compuesta casa por parte; sin casar elige la genérica y la declara; sin genérica → datos', async () => {
  await page.setContent(SELECT(''))
  assert.equal(await elegirCompaniaOrigen(page.mainFrame(), 'Revendedor / Mapfre', page, {}), null)
  assert.equal(await page.locator('#ciaOrigen').inputValue(), 'E1')
  await page.setContent(SELECT('<option value="X9">OTRAS COMPAÑÍAS</option>'))
  const sup = await elegirCompaniaOrigen(page.mainFrame(), COMPUESTA, page, {})
  assert.equal(await page.locator('#ciaOrigen').inputValue(), 'X9')
  assert.equal(sup, supuestoCompaniaGenerica(COMPUESTA, 'OTRAS COMPAÑÍAS'))
  await page.setContent(SELECT(''))
  await assert.rejects(elegirCompaniaOrigen(page.mainFrame(), COMPUESTA, page, {}), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /no está en la lista de Allianz/.test(e.message))
  assert.equal(await page.locator('#ciaOrigen').inputValue(), '')
})
