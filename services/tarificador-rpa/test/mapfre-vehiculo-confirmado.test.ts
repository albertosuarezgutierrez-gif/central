// Mapfre NSEI · VEHÍCULO CONFIRMADO por matrícula (14/10/2026): la función guardada del diálogo «Selección de vehículo»
// (guard.ts), el paso del adaptador que la usa y la elección de versión de Allianz por ese vehículo. Fixture SINTÉTICA:
// la estructura del diálogo es la de la grabación del 13/10/2026 (`app-matricula-dialog`, tabla con Matrícula, Nº Bastidor,
// Denominación, CV/KW, CC, Nº Puertas, Fecha Inicio); TODOS los valores son inventados (matrículas, bastidores, vehículos).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, type VehiculoConfirmado } from '@central/module-tarificacion'
import { confirmarVehiculoMapfre, instalarGuardEmision, type GuardEmision } from '../src/guard.ts'
import { consultarVehiculoPorMatricula, ErrorMapaIncompleto } from '../src/adapters/mapfre/auto.ts'
import { eleccionVersionEfectiva } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'

const MATRICULA = '0000BBB'
const OTRA = '1111CCC'

type Fila = { matricula: string; denominacion: string; cv?: string; cc?: string; puertas?: string; fecha?: string }

/** Diálogo con un radio por fila; «Aceptar» deshabilitado hasta elegir; al aceptar, se cierra y deja la marca. */
const DIALOGO = (filas: Fila[], extraAceptar = '') => `<app-matricula-dialog><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th><th>CV/KW</th><th>CC</th><th>Nº Puertas</th><th>Fecha Inicio</th></tr></thead><tbody>
${filas.map((f, i) => `<tr><td><input type="radio" name="veh" value="${f.matricula}-BASTIDOR${i}" onchange="document.getElementById('ok').disabled=false"></td><td>${f.matricula}</td><td>BASTIDOR-FICTICIO-${i}</td><td> ${f.denominacion} </td><td>${f.cv ?? '110'}</td><td>${f.cc ?? '1598'}</td><td>${f.puertas ?? '5'}</td><td>${f.fecha ?? '01/03/2019'}</td></tr>`).join('\n')}
</tbody></table>
<div class="acciones"><button onclick="window.__cancelar=1">Cancelar</button><button onclick="window.__noEs=1">No es el vehículo.</button>
<button id="ok" disabled ${extraAceptar} onclick="window.__aceptado=1;document.querySelector('app-matricula-dialog').remove()">Aceptar</button></div></app-matricula-dialog>
<button onclick="window.__noCatalogado=1">Vehículo NO catalogado</button>`

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

/** Contexto LIMPIO por caso (el guard cuenta los usos por trabajo = por contexto). */
async function preparar(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { context, page, guard }
}

const marcas = (page: Page) => page.evaluate(() => {
  const w = window as unknown as Record<string, unknown>
  return { aceptado: w.__aceptado ?? null, noEs: w.__noEs ?? null, cancelar: w.__cancelar ?? null, noCatalogado: w.__noCatalogado ?? null }
})
const marcada = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('input[type=radio]')).some((r) => (r as HTMLInputElement).checked))
const sinMatricula = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  return !/0000|BBB|1111|CCC|BASTIDOR/i.test(m)
}

test('una fila con la matrícula del riesgo → marca la fila y pulsa «Aceptar» (nunca «No es el vehículo» ni «NO catalogado»)', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: '0000 bbb', denominacion: 'MARCA PRUEBA MODELO X' }]))
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  assert.deepEqual(await marcas(page), { aceptado: 1, noEs: null, cancelar: null, noCatalogado: null })
  assert.equal(await page.locator('app-matricula-dialog').count(), 0)
  await context.close()
})

test('una fila con OTRA matrícula → para (`datos`), no marca ni pulsa, y el error no lleva matrículas', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: OTRA, denominacion: 'MARCA PRUEBA MODELO X' }]))
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && sinMatricula(e))
  assert.equal(await marcada(page), false)
  assert.deepEqual(await marcas(page), { aceptado: null, noEs: null, cancelar: null, noCatalogado: null })
  await context.close()
})

/** Qué radio quedó marcado (índice de fila) o -1. */
const radioMarcado = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('input[type=radio]')).findIndex((r) => (r as HTMLInputElement).checked))

test('varias filas → elige la PRIMERA (Alberto, 14/10/2026) y la confirma si su matrícula es la del riesgo', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: MATRICULA, denominacion: 'VERSION A' }, { matricula: MATRICULA, denominacion: 'VERSION B' }]))
  // Sin cerrar el diálogo, para ver qué fila quedó marcada: el «Aceptar» del fixture lo quita; se mira antes con un espía.
  await page.evaluate(() => {
    const ok = document.getElementById('ok')!
    ok.addEventListener('click', () => { (window as unknown as Record<string, unknown>).__fila = Array.from(document.querySelectorAll('input[type=radio]')).findIndex((r) => (r as HTMLInputElement).checked) }, { capture: true })
  })
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__fila), 0)
  assert.deepEqual(await marcas(page), { aceptado: 1, noEs: null, cancelar: null, noCatalogado: null })
  await context.close()
})

test('varias filas y la PRIMERA tiene otra matrícula → `datos`, sin marcar ninguna (aunque la segunda case)', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: OTRA, denominacion: 'VERSION A' }, { matricula: MATRICULA, denominacion: 'VERSION B' }]))
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && sinMatricula(e))
  assert.equal(await radioMarcado(page), -1)
  assert.equal((await marcas(page)).aceptado, null)
  await context.close()
})

test('cero filas → `datos`; sin diálogo → `portal`; nada se pulsa', async () => {
  const a = await preparar(DIALOGO([]))
  await assert.rejects(() => confirmarVehiculoMapfre(a.page, a.guard, MATRICULA), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && sinMatricula(e))
  await a.context.close()
  const b = await preparar('<app-datos-vehiculo></app-datos-vehiculo>')
  await assert.rejects(() => confirmarVehiculoMapfre(b.page, b.guard, MATRICULA), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  await b.context.close()
})

test('una sola vez por trabajo: la segunda llamada se bloquea por fase', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: MATRICULA, denominacion: 'MARCA PRUEBA MODELO X' }]))
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await page.setContent(`<body>${DIALOGO([{ matricula: MATRICULA, denominacion: 'MARCA PRUEBA MODELO X' }])}</body>`)
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA), EmisionBloqueadaError)
  assert.equal(await marcada(page), false)
  await context.close()
})

test('un «Aceptar» con manejador de emisión se bloquea ANTES de pulsarlo', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: MATRICULA, denominacion: 'MARCA PRUEBA MODELO X' }], 'formaction="/emitirPoliza"'))
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA), EmisionBloqueadaError)
  assert.equal((await marcas(page)).aceptado, null)
  await context.close()
})

test('columnas reordenadas (la 2.ª no es «Matrícula») → para sin comparar', async () => {
  const html = DIALOGO([{ matricula: MATRICULA, denominacion: 'MARCA PRUEBA MODELO X' }]).replace('<th>Matrícula</th><th>Nº Bastidor</th>', '<th>Nº Bastidor</th><th>Matrícula</th>')
  const { context, page, guard } = await preparar(html)
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  assert.equal(await marcada(page), false)
  await context.close()
})

test('matrícula del riesgo sin formato → `datos` sin abrir nada', async () => {
  const { context, page, guard } = await preparar(DIALOGO([{ matricula: MATRICULA, denominacion: 'X' }]))
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, 'NO-VALE'), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  assert.equal(await marcada(page), false)
  await context.close()
})

// ── adaptador: matrícula → diálogo → vehículo confirmado (sin matrícula) ──

/** Campo de matrícula del paso 2 que, al teclear, pinta el diálogo con las filas dadas. */
const PASO2 = (filas: Fila[]) => `<app-datos-vehiculo><input name="matricula" formcontrolname="matricula"></app-datos-vehiculo>
<template id="t">${DIALOGO(filas)}</template>
<script>document.querySelector('input[name=matricula]').addEventListener('input', () => {
  if (!document.querySelector('app-matricula-dialog')) document.body.append(document.getElementById('t').content.cloneNode(true))
})</script>`

test('consultarVehiculoPorMatricula: coche → VehiculoConfirmado sin matrícula ni bastidor, confirmado por el guard', async () => {
  const { context, page, guard } = await preparar(PASO2([{ matricula: MATRICULA, denominacion: 'MARCA PRUEBA MODELO X 1.6', cv: '110', cc: '1598', puertas: '5', fecha: '01/03/2019' }]))
  const v = await consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: (p, m) => confirmarVehiculoMapfre(p, guard, m) })
  assert.deepEqual(v, { origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X 1.6', cv: 110, cc: 1598, puertas: 5, fechaInicio: '2019-03-01' } satisfies VehiculoConfirmado)
  assert.ok(!/0000|BBB|BASTIDOR/.test(JSON.stringify(v)))
  assert.equal((await marcas(page)).aceptado, 1)
  await context.close()
})

test('consultarVehiculoPorMatricula: moto (0 puertas) también', async () => {
  const { context, page, guard } = await preparar(PASO2([{ matricula: MATRICULA, denominacion: 'MARCA MOTO PRUEBA 800', cv: '95', cc: '798', puertas: '0', fecha: '15/06/2020' }]))
  const v = await consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: (p, m) => confirmarVehiculoMapfre(p, guard, m) })
  assert.deepEqual(v, { origen: 'mapfre', denominacion: 'MARCA MOTO PRUEBA 800', cv: 95, cc: 798, puertas: 0, fechaInicio: '2020-06-15' })
  await context.close()
})

test('consultarVehiculoPorMatricula: varias filas → el vehículo de la PRIMERA, confirmado por el guard; sin diálogo → hueco con inventario', async () => {
  const a = await preparar(PASO2([{ matricula: MATRICULA, denominacion: 'MARCA MOTO PRIMERA', cv: '95', cc: '798', puertas: '0', fecha: '15/06/2020' }, { matricula: MATRICULA, denominacion: 'MARCA MOTO SEGUNDA' }]))
  const v = await consultarVehiculoPorMatricula(a.page, MATRICULA, { confirmarVehiculoMapfre: (p, m) => confirmarVehiculoMapfre(p, a.guard, m) })
  assert.equal(v.denominacion, 'MARCA MOTO PRIMERA')
  assert.equal((await marcas(a.page)).aceptado, 1)
  await a.context.close()
  const b = await preparar('<app-datos-vehiculo><input name="matricula"></app-datos-vehiculo>')
  await assert.rejects(
    () => consultarVehiculoPorMatricula(b.page, MATRICULA, { confirmarVehiculoMapfre: async () => {} }, 300),
    (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom === true && sinMatricula(e),
  )
  await b.context.close()
})

test('consultarVehiculoPorMatricula: la matrícula del portal no es la del riesgo → el guard para y no se devuelve vehículo', async () => {
  const { context, page, guard } = await preparar(PASO2([{ matricula: OTRA, denominacion: 'MARCA PRUEBA MODELO X' }]))
  await assert.rejects(
    () => consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: (p, m) => confirmarVehiculoMapfre(p, guard, m) }),
    (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && sinMatricula(e),
  )
  assert.equal((await marcas(page)).aceptado, null)
  await context.close()
})

// ── Allianz: versión por el vehículo confirmado ──

test('Allianz · la elección explícita manda; si no, la del vehículo confirmado solo si casa UNA; si no, null (flujo de siempre)', () => {
  const vc: VehiculoConfirmado = { origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X', cv: 110, cc: null, puertas: null, fechaInicio: null }
  const versiones = [{ etiqueta: '', codigo: null }, { etiqueta: 'MODELO X 90 CV', codigo: 'V1' }, { etiqueta: 'MODELO X 110 CV', codigo: 'V2' }]
  assert.deepEqual(eleccionVersionEfectiva({ versiones }, { eleccionVersion: null, vehiculoConfirmado: vc }), { codigo: 'V2', etiqueta: 'MODELO X 110 CV' })
  assert.deepEqual(eleccionVersionEfectiva({ versiones }, { eleccionVersion: { codigo: 'V1' }, vehiculoConfirmado: vc }), { codigo: 'V1' })
  assert.equal(eleccionVersionEfectiva({ versiones: [...versiones, { etiqueta: 'MODELO X 110 CV AUT', codigo: 'V3' }] }, { vehiculoConfirmado: vc }), null)
  assert.equal(eleccionVersionEfectiva({ versiones: [...versiones, { etiqueta: 'MODELO X ACABADO', codigo: 'V4' }] }, { vehiculoConfirmado: vc }), null)
  assert.equal(eleccionVersionEfectiva({ versiones }, {}), null)
})
