// Mapfre auto v0.8.25 (26/10/2026, pasada real con 0.8.24): el respaldo por etiqueta «Compañia» no halló un mat-select único/visible/habilitado y el error no decía QUÉ
// control hay tras cada etiqueta de siniestralidad. Ahora el hueco lista, por etiqueta, tipo de control, formcontrolname y si está deshabilitado (sin valores ni
// opciones). No se elige procedencia ni compañía a ciegas. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { describirBloqueHistorial, describirControlesSiniestralidad, ErrorMapaIncompleto, mapfreAuto, planObjetoYFiguras, rellenarMatSelects, SEL_HISTORIAL, type PlanNsei } from '../src/adapters/mapfre/auto.ts'

const form = {
  ramo: 'auto', matricula: '0000BBB', codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null }, tomadorEsConductor: true, tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: null, tomador: null, eleccionVersion: null, seleccionVehiculo: null,
  documentoTomador: '00000000T', usoVehiculo: 'particular', ambitoCirculacion: 'espana', clasePermiso: 'b', companiaAnterior: 'ASEGURADORA FICTICIA GENERALES',
} as FormularioAuto

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

async function pagina(html: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return page
}

// «Compañia» = input con autocompletar deshabilitado; «Procedencia» = mat-select habilitado; el resto inputs deshabilitados; un valor ficticio que NO debe salir.
const FIGURAS = `<body><app-figuras>
<mat-form-field><mat-label>Compañia</mat-label><input formcontrolname="compania" role="combobox" aria-autocomplete="list" disabled value="VALOR-FICTICIO-91"></mat-form-field>
<mat-form-field><mat-label>Procedencia Siniestralidad *</mat-label><mat-select formcontrolname="procedencia" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select></mat-form-field>
<mat-form-field><mat-label>Expuestos/Años</mat-label><input formcontrolname="expuestos" disabled></mat-form-field>
<mat-form-field><mat-label>Siniestros</mat-label><input formcontrolname="siniestros" disabled></mat-form-field>
<mat-form-field><mat-label>Modificación Manual Niveles Bonus Malus</mat-label><mat-checkbox formcontrolname="bonus"></mat-checkbox></mat-form-field>
</app-figuras></body>`

test('v0.8.25 · la versión del bot es 0.8.28 (o posterior)', () => assert.equal(mapfreAuto.version, '0.8.30'))

test('describirControlesSiniestralidad: tipo, formcontrolname y deshabilitado por cada una de las cinco etiquetas, sin valores', async () => {
  const t = await describirControlesSiniestralidad(await pagina(FIGURAS))
  assert.match(t, /«compania» mat-autocomplete\[compania\] deshabilitado/, t)
  assert.match(t, /«procedencia siniestralidad» mat-select\[procedencia\] habilitado/, t)
  assert.match(t, /«expuestos\/anos» input\[expuestos\] deshabilitado/, t)
  assert.match(t, /«siniestros» input\[siniestros\] deshabilitado/, t)
  assert.match(t, /«modificacion manual niveles bonus malus» checkbox\[bonus\] habilitado/, t)
  assert.match(t, /opciones de los desplegables: no leídas/, t)
  assert.ok(!t.includes('VALOR-FICTICIO-91'))
})

test('describirControlesSiniestralidad: etiquetas ajenas no cuentan; sin ninguna → lo dice', async () => {
  assert.equal(await describirControlesSiniestralidad(await pagina('<body><mat-form-field><mat-label>Compañía de la póliza actual</mat-label><input></mat-form-field></body>')), 'ninguna de las etiquetas conocidas')
})

test('el hueco de «compañía anterior» sin app-historial-siniestralidad trae los controles por etiqueta y NO elige nada', async () => {
  const page = await pagina(FIGURAS)
  const plan: PlanNsei = { escribibles: planObjetoYFiguras(form).escribibles.filter((o) => o.sel === SEL_HISTORIAL.companiaAnterior), pendientes: [] }
  assert.equal(plan.escribibles.length, 1)
  let llamado = false
  await assert.rejects(
    rellenarMatSelects(page, plan, { elegirMatSelect: async () => { llamado = true; return { texto: 'x', origen: 'coincidencia' as const } } }, undefined, 300),
    (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompleto)) return false
      assert.match(e.message, /no existe app-historial-siniestralidad;/, e.message)
      assert.match(e.message, /controles por etiqueta: «compania» mat-autocomplete\[compania\] deshabilitado; «procedencia siniestralidad» mat-select\[procedencia\] habilitado/, e.message)
      assert.ok(!e.message.includes('VALOR-FICTICIO-91'))
      return true
    },
  )
  assert.equal(llamado, false)
})

test('con el bloque app-historial-siniestralidad el resumen es el de siempre (sin el añadido por etiqueta)', async () => {
  const t = await describirBloqueHistorial(await pagina('<body><app-historial-siniestralidad><mat-form-field><mat-label>Expuestos/Años</mat-label><input formcontrolname="expuestos"></mat-form-field></app-historial-siniestralidad></body>'))
  assert.match(t, /app-historial-siniestralidad trae 1 controles/)
  assert.doesNotMatch(t, /controles por etiqueta/)
})
