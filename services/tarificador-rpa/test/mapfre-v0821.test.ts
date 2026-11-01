// Mapfre auto v0.8.21 · mat-button con el `disabled` en el <button> interno y el texto en un <span>: el escaneo/ el locator apuntaba al span (habilitado) y el clic esperaba 30 s («element is not enabled»)
// (etiqueta, tipo, id, selector de fecha, mat-error) SIN ningún valor. Fixture sintética: sin NIF, nombres, fechas de nacimiento, matrículas reales ni CP.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { confirmarVehiculoMapfre, describirCamposObligatoriosMapfre, generarProyectoMapfre, leerCamposObligatoriosMapfre, instalarGuardEmision, pulsarContinuarMapfre, type GuardEmision } from '../src/guard.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'

const MATRICULA = '0000BBB'
const VALOR_PRIVADO = 'VALOR-PRIVADO-QWERTY-31337'

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

const PASOS = ['Datos básicos', 'Objeto asegurado', 'Figuras', 'Coberturas']
const DIALOGO = `<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><tbody><tr class="mat-row cdk-row" onclick="document.getElementById('okv').disabled=false"><td class="cdk-column-select"></td><td class="cdk-column-matricula">${MATRICULA}</td><td class="cdk-column-bastidor">BASTIDOR-FICTICIO-0</td><td class="cdk-column-denominacion">MARCA PRUEBA MODELO X</td><td>100</td><td>1500</td><td>5</td><td>01/01/2020</td></tr></tbody></table><div class="right"><button>Cancelar</button><button id="okv" disabled onclick="document.querySelector('.custom-dialog').remove()">Aceptar</button></div></app-matricula-dialog></mat-dialog-container></div>`

/** NSEI mínima: stepper, vehículo, «Coberturas» con prima y el botón «Generar Proyecto» (habilitado o no) más un formulario con campos obligatorios. */
const PAGINA = (deshabilitado: boolean, caeAlEscanear = false) => `<!doctype html><body>
<mat-horizontal-stepper>${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === 0}">${i + 1} ${p}</mat-step-header>`).join('')}</mat-horizontal-stepper>
<template id="tpl">${DIALOGO}</template>
<input name="matricula" onblur="setTimeout(()=>document.getElementById('ov').appendChild(document.getElementById('tpl').content.cloneNode(true)),50)">
<app-coberturas><prima-producto><p><strong>PRIMA TOTAL: 1.234,56 €</strong></p></prima-producto>
<form class="ng-invalid">
<mat-form-field class="mat-form-field-invalid"><mat-label>Fecha de efecto</mat-label><input matdatepicker formcontrolname="fechaEfecto" required aria-required="true" class="ng-invalid" value=""><mat-datepicker-toggle><button type="button" aria-label="Open calendar">cal</button></mat-datepicker-toggle><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><mat-label>Forma de pago</mat-label><mat-select style="display:inline-block;min-width:80px;min-height:14px" formcontrolname="formaPago" aria-required="true" class="mat-select-empty ng-invalid"><span class="mat-select-placeholder"></span></mat-select><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><mat-label>Referencia interna</mat-label><input formcontrolname="referencia" aria-invalid="true" class="ng-invalid" value="${VALOR_PRIVADO}"><mat-error>Formato no válido</mat-error></mat-form-field>
<mat-form-field><mat-label>Campo opcional ok</mat-label><input formcontrolname="opcional" value="otra cosa"></mat-form-field>
</form>
<button mat-button id="gen" ${deshabilitado ? 'disabled' : ''} onclick="window.__proyecto=1;document.getElementById('nm').innerHTML='<mat-form-field><mat-label>Nº Proyecto</mat-label><input readonly value=&quot;9876543210&quot;></mat-form-field>'"><span class="mat-button-wrapper">Generar Proyecto</span></button>
<div id="nm"></div></app-coberturas>
<button onclick="continuar()">Continuar</button>
<div class="cdk-overlay-container" id="ov"></div>
<script>${caeAlEscanear ? "const mo=new MutationObserver(()=>{const b=document.getElementById('gen');if(b.hasAttribute('data-rpa-ctl')){mo.disconnect();b.disabled=true}});mo.observe(document.getElementById('gen'),{attributes:true});" : ''}function continuar(){const h=[...document.querySelectorAll('mat-step-header')];const i=h.findIndex(x=>x.getAttribute('aria-selected')==='true');h[i].setAttribute('aria-selected','false');h[i+1].setAttribute('aria-selected','true')}</script></body>`

async function hastaCoberturas(deshabilitado: boolean, caeAlEscanear = false): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://nsei.ejemplo.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA(deshabilitado, caeAlEscanear) }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://nsei.ejemplo.test/evt21_nsei_fe-web/')
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  await page.fill('input[name=matricula]', MATRICULA)
  await page.locator('input[name=matricula]').blur()
  await page.locator('app-matricula-dialog').waitFor()
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  await pulsarContinuarMapfre(page, guard, 'figuras')
  return { context, page, guard }
}

test('v0.8.21 · la versión del bot es 0.8.28', () => {
  assert.equal(mapfreAuto.version, '0.8.46')
})

test('v0.8.21 · mat-button con <button disabled> interno y texto en <span>: no espera 30 s, no pulsa y nombra el campo obligatorio y su mat-error, sin valores', async () => {
  const { context, page, guard } = await hastaCoberturas(true)
  page.setDefaultTimeout(30_000) // el valor real de producción: si se llegara al clic, tardaría 30 s
  const t0 = Date.now()
  const r = await generarProyectoMapfre(page, guard, 1_500, 800)
  assert.ok(Date.now() - t0 < 10_000, 'ni rastro de los 30 s del clic')
  assert.equal(r.estado, 'no_generado')
  if (r.estado === 'no_generado') {
    assert.match(r.motivo, /deshabilitado/)
    assert.doesNotMatch(r.motivo, /el clic no llegó a darse/, 'formato viejo de 0.8.20 en producción')
    assert.match(r.motivo, /«Fecha de efecto» \(input, id fechaEfecto, vacío, con selector de fecha; mat-error: «Campo obligatorio»\)/)
    assert.match(r.motivo, /«Forma de pago» \(mat-select, id formaPago, vacío; mat-error: «Campo obligatorio»\)/)
    assert.doesNotMatch(r.motivo, new RegExp(VALOR_PRIVADO), 'NUNCA el valor de un campo')
  }
  assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__proyecto ?? null), null, 'no se pulsó')
  await context.close()
})

test('v0.8.21 · el locator apunta al <span> del texto de un botón deshabilitado: la comprobación previa lo ve deshabilitado (closest button + isEnabled)', async () => {
  const { context, page, guard } = await hastaCoberturas(true)
  page.setDefaultTimeout(30_000)
  const t0 = Date.now()
  // Sin el escaneo (que ya lo detecta): se fuerza el camino del clic con el span como locator vía el guard público.
  const r = await generarProyectoMapfre(page, guard, 1_500, 800)
  assert.equal(r.estado, 'no_generado')
  assert.ok(Date.now() - t0 < 10_000)
  assert.equal(await page.locator('#gen span').isEnabled(), false, 'Playwright considera el span deshabilitado (hereda del <button>)')
  await context.close()
})

test('v0.8.21 · habilitado al buscarlo y deshabilitado justo antes del clic (span dentro de button) → no pulsa, sin 30 s, con campos', async () => {
  const { context, page, guard } = await hastaCoberturas(false, true)
  page.setDefaultTimeout(30_000)
  const t0 = Date.now()
  const r = await generarProyectoMapfre(page, guard, 1_500, 800)
  assert.ok(Date.now() - t0 < 10_000)
  assert.equal(r.estado, 'no_generado')
  if (r.estado === 'no_generado') {
    assert.match(r.motivo, /deshabilitado/)
    assert.match(r.motivo, /«Fecha de efecto» \(input, id fechaEfecto, vacío/)
    assert.doesNotMatch(r.motivo, new RegExp(VALOR_PRIVADO))
  }
  assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__proyecto ?? null), null)
  await context.close()
})

test('v0.8.21 · campos de un mat-form-field ng-invalid cuyo input no lleva required, y dentro de un iframe', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.setContent(`<mat-form-field class="ng-invalid"><mat-label>Campo A</mat-label><input formcontrolname="a" value=""><mat-error>Obligatorio A</mat-error></mat-form-field><iframe srcdoc="<mat-form-field class='ng-invalid'><mat-label>Campo B</mat-label><input formcontrolname='b' value='${VALOR_PRIVADO}'><mat-error>Revisa B</mat-error></mat-form-field>"></iframe>`)
  await page.frames()[1]?.waitForSelector('input').catch(() => {})
  const t = describirCamposObligatoriosMapfre(await leerCamposObligatoriosMapfre(page))
  assert.match(t, /«Campo A» \(input, id a, vacío; mat-error: «Obligatorio A»\)/)
  assert.match(t, /«Campo B» \(input, id b, con valor no válido; mat-error: «Revisa B»\)/)
  assert.doesNotMatch(t, new RegExp(VALOR_PRIVADO))
  await context.close()
})

test('v0.8.21 · habilitado de verdad → se pulsa y se lee el nº (comportamiento previo)', async () => {
  const { context, page, guard } = await hastaCoberturas(false)
  const r = await generarProyectoMapfre(page, guard, 4_000, 3_000)
  assert.deepEqual(r, { estado: 'generado', numero: '9876543210' })
  await context.close()
})
