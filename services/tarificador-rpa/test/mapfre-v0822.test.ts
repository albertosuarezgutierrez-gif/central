// Mapfre auto v0.8.22 · formulario de «Generar Proyecto»: contacto del tomador (móvil, email, nombre), «Valido desde», «1ª Matriculación» y «Clase» se completan/validan
// con datos DEL RIESGO antes del clic; sin dato → aviso y no se pulsa. Fixture sintética (sin datos reales): Angular simulado con ng-invalid + validación en el evento input.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { confirmarVehiculoMapfre, describirCamposObligatoriosMapfre, generarProyectoMapfre, leerCamposObligatoriosMapfre, instalarGuardEmision, pulsarContinuarMapfre, type GuardEmision } from '../src/guard.ts'
import { clasificarCampoProyecto, completarFormularioProyectoMapfre, contactoProyectoMapfre, mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import type { FormularioAuto } from '@central/module-tarificacion'

const MATRICULA = '0000BBB'

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


/** NSEI mínima: stepper, vehículo, «Coberturas» con prima y el botón «Generar Proyecto» (habilitado o no) más un formulario con campos obligatorios. */

const PASOS = ['Datos básicos', 'Objeto asegurado', 'Figuras', 'Coberturas']
const DIALOGO = `<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><tbody><tr class="mat-row cdk-row" onclick="document.getElementById('okv').disabled=false"><td class="cdk-column-select"></td><td class="cdk-column-matricula">${MATRICULA}</td><td class="cdk-column-bastidor">BASTIDOR-FICTICIO-0</td><td class="cdk-column-denominacion">MARCA PRUEBA MODELO X</td><td>100</td><td>1500</td><td>5</td><td>01/01/2020</td></tr></tbody></table><div class="right"><button>Cancelar</button><button id="okv" disabled onclick="document.querySelector('.custom-dialog').remove()">Aceptar</button></div></app-matricula-dialog></mat-dialog-container></div>`

/** Formulario del proyecto con Angular simulado: cada campo se revalida SOLO en su evento `input`; el botón se habilita cuando nada queda ng-invalid. */
const PAGINA = (otroValido: boolean) => `<!doctype html><body>
<mat-horizontal-stepper>${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === 0}">${i + 1} ${p}</mat-step-header>`).join('')}</mat-horizontal-stepper>
<template id="tpl">${DIALOGO}</template>
<input name="matricula" onblur="setTimeout(()=>document.getElementById('ov').appendChild(document.getElementById('tpl').content.cloneNode(true)),50)">
<app-coberturas><prima-producto><p><strong>PRIMA TOTAL: 1.234,56 €</strong></p></prima-producto>
<form>
<mat-form-field><mat-label>Teléfono móvil</mat-label><input id="numMovil" type="tel" formcontrolname="numMovil" required class="ng-invalid" data-ok="^[67][0-9]{8}$" value=""><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><input id="mat-input-44" type="text" placeholder="Nombre" required class="ng-invalid" data-ok="^.+$" value=""><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><mat-label>Email</mat-label><input id="mat-input-47" type="text" required class="ng-invalid" data-ok="^[^@ ]+@[^@ ]+[.][a-z]+$" value=""><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><mat-label>1ª Matriculación</mat-label><input id="dateMatriculacion" matdatepicker required class="ng-invalid" data-ok="^[0-9]{2}/[0-9]{2}/[0-9]{4}$" value="01/01/2020"><mat-datepicker-toggle><button type="button" aria-label="Open calendar">cal</button></mat-datepicker-toggle></mat-form-field>
<mat-form-field><mat-label>Valido desde</mat-label><input id="mat-input-26" matdatepicker required class="ng-invalid" data-ok="^[0-9]{2}/[0-9]{2}/[0-9]{4}$" value="2000-01-01"><mat-datepicker-toggle><button type="button" aria-label="Open calendar">cal</button></mat-datepicker-toggle></mat-form-field>
<mat-form-field><mat-label>Clase</mat-label><mat-select id="mat-select-14" style="display:inline-block;min-width:80px;min-height:14px" required class="ng-invalid"><span>X</span></mat-select></mat-form-field>
<mat-form-field><input id="mat-input-36" type="text" name="otroDato" ${otroValido ? '' : 'class="ng-invalid"'} required data-ok="^.+$" value="${otroValido ? 'dato' : ''}"></mat-form-field>
</form>
<button mat-button id="gen" disabled onclick="window.__proyecto=1;document.getElementById('nm').innerHTML='<mat-form-field><mat-label>Nº Proyecto</mat-label><input readonly value=&quot;9876543210&quot;></mat-form-field>'"><span class="mat-button-wrapper">Generar Proyecto</span></button>
<div id="nm"></div></app-coberturas>
<button onclick="continuar()">Continuar</button>
<div class="cdk-overlay-container" id="ov"></div>
<script>
const refrescar=()=>{document.getElementById('gen').disabled=document.querySelectorAll('form .ng-invalid').length>0};
document.querySelectorAll('form input[data-ok]').forEach(i=>i.addEventListener('input',()=>{i.classList.toggle('ng-invalid',!new RegExp(i.dataset.ok).test(i.value));refrescar()}));
function continuar(){const h=[...document.querySelectorAll('mat-step-header')];const i=h.findIndex(x=>x.getAttribute('aria-selected')==='true');h[i].setAttribute('aria-selected','false');h[i+1].setAttribute('aria-selected','true')}
</script></body>`

async function hastaCoberturas(otroValido = true): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://nsei.ejemplo.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA(otroValido) }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://nsei.ejemplo.test/evt22_nsei_fe-web/')
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  await page.fill('input[name=matricula]', MATRICULA)
  await page.locator('input[name=matricula]').blur()
  await page.locator('app-matricula-dialog').waitFor()
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  await pulsarContinuarMapfre(page, guard, 'figuras')
  return { context, page, guard }
}

const riesgo = (extra: Record<string, unknown> = {}, ficha: Record<string, unknown> = { email: 'tomador@ejemplo.test', telefono: '600 00 00 00'.replace(/ /g, '') }) =>
  ({ ramo: 'auto', clasePermiso: 'b', fechaMatriculacion: '2018-03-15', conductor: { fechaCarne: '2005-06-20' }, tomador: { tipo: 'fisica', nombre: 'Nombre', apellido1: 'Apellido', apellido2: null, fechaNacimiento: '1980-01-01' }, fichaTomador: ficha, ...extra }) as unknown as FormularioAuto

type Elegidos = { valores: readonly string[] }[]
const ctxClase = (elegidos: Elegidos) => ({
  elegirMatSelect: async (select: import('playwright').Locator, valores: string | readonly string[]) => {
    elegidos.push({ valores: typeof valores === 'string' ? [valores] : valores })
    await select.evaluate((el) => { el.classList.remove('ng-invalid'); (document.getElementById('gen') as HTMLButtonElement).disabled = document.querySelectorAll('form .ng-invalid').length > 0 })
    return { texto: 'B', origen: 'coincidencia' as const }
  },
})
const valor = (page: Page, sel: string) => page.locator(sel).inputValue()
const pulsado = (page: Page) => page.evaluate(() => (window as unknown as Record<string, unknown>).__proyecto ?? null)

test('v0.8.22 · la versión del bot es 0.8.28', () => {
  assert.equal(mapfreAuto.version, '0.8.36')
})

test('v0.8.22 · clasificación por formcontrolname/etiqueta/placeholder, nunca por ids mat-input-N', () => {
  const d = (etiqueta: string, control = '', placeholder = '') => clasificarCampoProyecto({ etiqueta, control, placeholder, tipo: 'text', invalido: true, vacio: true })
  assert.equal(d('Teléfono móvil', 'numMovil'), 'telefono')
  assert.equal(d('Email'), 'email')
  assert.equal(d('', '', 'Nombre'), 'nombre')
  assert.equal(d('Primer apellido'), null)
  assert.equal(d('', 'mat-input-36'), null)
  assert.equal(d('Valido desde'), 'valido')
  assert.equal(d('1ª Matriculación', 'dateMatriculacion'), 'matriculacion')
})

test('v0.8.22 · contacto SOLO del riesgo: sin email/teléfono válidos → null (nada inventado)', () => {
  assert.deepEqual(contactoProyectoMapfre(riesgo()), { email: 'tomador@ejemplo.test', telefono: '600000000', nombre: 'Nombre' })
  assert.equal(contactoProyectoMapfre(riesgo({}, { telefono: '123' })).telefono, null)
  assert.equal(contactoProyectoMapfre(riesgo({}, {})).email, null)
  assert.equal(contactoProyectoMapfre(riesgo({ fichaTomador: undefined })).telefono, null)
})

test('v0.8.22 · con contacto en el riesgo: campos rellenos y validados, fechas dd/mm/aaaa, Clase elegida, «Generar Proyecto» se habilita y se pulsa', async () => {
  const { context, page, guard } = await hastaCoberturas()
  const elegidos: Elegidos = []
  const form = riesgo()
  const r = await generarProyectoMapfre(page, guard, 4_000, 3_000, (p) => completarFormularioProyectoMapfre(p, form, ctxClase(elegidos), true))
  assert.deepEqual(r, { estado: 'generado', numero: '9876543210' })
  assert.equal(await valor(page, '#numMovil'), '600000000')
  assert.equal(await valor(page, '#mat-input-47'), 'tomador@ejemplo.test')
  assert.equal(await valor(page, '#mat-input-44'), 'Nombre')
  assert.equal(await valor(page, '#mat-input-26'), '20/06/2005', 'Valido desde: texto roto → fecha del carné del riesgo en dd/mm/aaaa')
  assert.equal(await valor(page, '#dateMatriculacion'), '01/01/2020', 'texto válido pero ng-invalid → se re-confirma el del portal (no se pisa con otro)')
  assert.deepEqual(elegidos, [{ valores: ['B'] }])
  assert.equal(await pulsado(page), 1)
  await context.close()
})

test('v0.8.22 · sin email del tomador → aviso «falta email del tomador» y NO se pulsa ni se rellena nada a medias', async () => {
  const { context, page, guard } = await hastaCoberturas()
  const form = riesgo({}, { telefono: '600000000' })
  const r = await generarProyectoMapfre(page, guard, 1_500, 1_000, (p) => completarFormularioProyectoMapfre(p, form, ctxClase([]), true))
  assert.equal(r.estado, 'no_generado')
  if (r.estado === 'no_generado') assert.match(r.motivo, /falta email del tomador para guardar el proyecto en Mapfre/)
  assert.equal(await valor(page, '#numMovil'), '', 'no se escribe nada hasta tener todo')
  assert.equal(await pulsado(page), null)
  await context.close()
})

test('v0.8.22 · sin fecha del carné en el riesgo y «Valido desde» inválida → aviso, sin inventar ni pulsar', async () => {
  const { context, page, guard } = await hastaCoberturas()
  const form = riesgo({ conductor: { fechaCarne: null } })
  const r = await generarProyectoMapfre(page, guard, 1_500, 1_000, (p) => completarFormularioProyectoMapfre(p, form, ctxClase([]), true))
  assert.equal(r.estado, 'no_generado')
  if (r.estado === 'no_generado') assert.match(r.motivo, /«Valido desde».*el riesgo no trae el dato/)
  assert.equal(await pulsado(page), null)
  await context.close()
})

test('v0.8.22 · interruptor MAPFRE_PROYECTO_CONTACTO apagado → no toca el contacto; el botón sigue deshabilitado, no se pulsa y el diagnóstico nombra campos sin etiqueta con su control y el texto cercano', async () => {
  const { context, page, guard } = await hastaCoberturas(false)
  const form = riesgo()
  const r = await generarProyectoMapfre(page, guard, 1_500, 1_000, (p) => completarFormularioProyectoMapfre(p, form, ctxClase([]), false))
  assert.equal(r.estado, 'no_generado')
  if (r.estado === 'no_generado') {
    assert.match(r.motivo, /deshabilitado/)
    assert.match(r.motivo, /«sin etiqueta» \(text, id mat-input-36, control otroDato, vacío\)/)
    assert.match(r.motivo, /«Nombre» \(text, id mat-input-44, cerca: «Nombre», vacío/)
  }
  assert.equal(await valor(page, '#mat-input-47'), '')
  assert.equal(await pulsado(page), null)
  const t = describirCamposObligatoriosMapfre(await leerCamposObligatoriosMapfre(page))
  assert.match(t, /control otroDato/)
  await context.close()
})
