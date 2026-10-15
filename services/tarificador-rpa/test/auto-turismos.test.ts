// Allianz AUTOS Turismos v0.6.0 (15/10/2026): marco del motor `ngx-motor-azs`, controles por etiqueta/rol accesible y paso 1
// «Datos del vehículo». Portal SINTÉTICO (Angular de mentira con la estructura del inventario saneado; ids dinámicos a propósito,
// matrícula ficticia) servido con `context.route`: ni red ni datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'
import { pideInventarioDom } from '../src/errores.ts'
import { esAppTurismosAllianz, instalarGuardEmision, marcarOpcionTurismosAllianz, OPCIONES_TURISMOS_ALLIANZ, pulsar } from '../src/guard.ts'
import {
  allianzAuto,
  avanzarDesdeDatosVehiculo,
  botonTurismos,
  campoTurismos,
  ErrorEleccionVersion,
  ErrorMapaIncompleto,
  marcoFormularioTurismos,
  rellenarDatosVehiculoTurismos,
  type CtxTurismos,
} from '../src/adapters/allianz/auto.ts'

const FORM: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '00000',
  conductor: { fechaNacimiento: '1990-02-03', fechaCarne: '2010-04-05', sexo: 'mujer' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  tomador: null,
  eleccionVersion: null,
}

const CARCASA = `<!doctype html><html><body><h1>ePac</h1><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-motor-azs/"></iframe></body></html>`

type Opc = {
  versiones?: Array<[string, string]>
  /** Nunca habilita «Encuentra mi vehículo»/«SIGUIENTE» con estos ids dinámicos: el portal responde con un aviso. */
  aviso?: boolean
  /** «SIGUIENTE» no se habilita nunca. */
  siguienteMuerto?: boolean
  /** «SIGUIENTE» deshabilitado solo con aria-disabled (sin atributo disabled). */
  siguienteAria?: boolean
  /** Dos radios con la etiqueta «Sí» (ambiguo). */
  sisDuplicados?: boolean
}

function app(o: Opc = {}): string {
  const radio = (id: string, grupo: string, etiqueta: string) => `<span><input type="radio" id="${id}" name="${grupo}" class="cdk-visually-hidden"><label for="${id}">${etiqueta}</label></span>`
  const pasos = ['Datos del vehículo', 'Datos personales', 'Antecedentes', 'Selección de paquete', 'Datos', 'Revisión', 'Pago', 'Confirmación']
  const versiones = o.versiones ?? [['V1', 'Version unica 90 CV']]
  return `<!doctype html><html><body>
<div>${pasos.map((p, i) => `<nx-multi-step-item role="tab" aria-selected="${i === 0}" ${i === 0 ? '' : 'aria-disabled="true"'}>${p}</nx-multi-step-item>`).join('')}</div>
<section id="paso1">
  <div role="radiogroup" aria-labelledby="ng-x1-nx-label-5"><label id="ng-x1-nx-label-5">¿Conoces la matrícula del vehículo?</label>
  ${radio('ng-x1-nx-radio-9-input', 'ng-x1-nx-radio-group-4', 'Sí')}${radio('ng-x1-nx-radio-10-input', 'ng-x1-nx-radio-group-4', o.sisDuplicados ? 'Sí' : 'No')}</div>
  <div id="bloqueMatricula" hidden>
    <label for="ng-x1-nx-input-12">Matrícula</label><input id="ng-x1-nx-input-12" type="text" required>
    <button type="button" id="ng-x1-btn-77" disabled>Encuentra mi vehículo</button>
    <div id="resultado" hidden>
      <label for="ng-x1-select-3">Versión</label>
      <select id="ng-x1-select-3"><option value=""></option>${versiones.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    </div>
  </div>
  <div role="radiogroup" aria-label="Uso">${radio('ng-x1-nx-radio-toggle-button-19', 'g7', 'Ocasional (fines de semana, vacaciones, etc)')}${radio('ng-x1-sii', 'g8', 'Sí')}</div>
  <button type="button" id="ng-x1-btn-99" disabled>SIGUIENTE</button>
</section>
<section id="paso2" hidden><h2>Datos personales</h2><label for="ng-x1-nx-input-201">Nº Documento</label><input id="ng-x1-nx-input-201" type="text"></section>
<script>
  const $ = (s) => document.querySelector(s);
  document.querySelectorAll('input[type=radio][name="ng-x1-nx-radio-group-4"]').forEach((r) => r.addEventListener('change', () => { $('#bloqueMatricula').hidden = false; }));
  $('#ng-x1-nx-input-12').addEventListener('input', () => { $('#ng-x1-btn-77').disabled = $('#ng-x1-nx-input-12').value.length < 4; });
  $('#ng-x1-btn-77').addEventListener('click', () => setTimeout(() => {
    ${o.aviso ? "const a = document.createElement('div'); a.setAttribute('role', 'alert'); a.textContent = 'No encontrado'; document.body.appendChild(a); return;" : ''}
    $('#resultado').hidden = false;
    ${o.siguienteMuerto ? '' : o.siguienteAria ? "$('#ng-x1-btn-99').disabled = false; $('#ng-x1-btn-99').setAttribute('aria-disabled', 'true');" : "$('#ng-x1-btn-99').disabled = false;"}
  }, 150));
  $('#ng-x1-btn-99').addEventListener('click', () => { $('#paso1').hidden = true; $('#paso2').hidden = false;
    const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[1].setAttribute('aria-selected', 'true'); t[1].removeAttribute('aria-disabled'); });
</script></body></html>`
}

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

async function abrir(o: Opc = {}, rutaMotor = '/ngx-motor-azs/') {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    const body = u.hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA.replace('/ngx-motor-azs/', rutaMotor)
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const pulsados: string[] = []
  const ctx: CtxTurismos = {
    pulsar: async (b) => { pulsados.push(((await b.textContent()) ?? '').replace(/\s+/g, ' ').trim()); await pulsar(b, guard) },
    pausaAccion: async () => undefined,
    marcarOpcionTurismos: async (m: Frame, etiqueta: string) => {
      const r = await marcarOpcionTurismosAllianz(m, guard, etiqueta)
      if (r.estado === 'marcada') pulsados.push(`opcion:${etiqueta}`)
      return r
    },
  }
  return { context, page, ctx, pulsados, guard }
}

test('esAppTurismosAllianz: origen exacto y ruta del motor', () => {
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/ngx-motor-azs/'), true)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/ngx-motor-azs/paso'), true)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/rws-router-sso-domain-bridge/bridge'), false)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com.evil.com/ngx-motor-azs/'), false)
  assert.deepEqual([...OPCIONES_TURISMOS_ALLIANZ], ['Sí'])
})

test('versión del bot de Allianz Turismos', () => {
  assert.equal(allianzAuto.version, '0.6.0')
})

test('localización por etiqueta/rol: marco del motor y controles sin tocar ids dinámicos', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    assert.ok(esAppTurismosAllianz(marco.url()))
    await marcarOpcionTurismosAllianz(marco, guard, 'Sí') // el bloque de la matrícula aparece al marcar «Sí»
    assert.equal(await campoTurismos(marco, 'Matrícula').count(), 1)
    assert.equal(await botonTurismos(marco, 'Encuentra mi vehículo').count(), 1)
    assert.equal(await botonTurismos(marco, 'SIGUIENTE').count(), 1)
    assert.equal(await botonTurismos(marco, 'Encuentra').count(), 0, 'nombre EXACTO, no «contiene»')
  } finally {
    await context.close()
  }
})

test('marco que no es el motor → ErrorMapaIncompleto con inventario, sin escribir nada', async () => {
  const { context, page } = await abrir({}, '/ngx-otra-app/')
  try {
    await assert.rejects(marcoFormularioTurismos(page, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  } finally {
    await context.close()
  }
})

test('paso 1: Sí + matrícula + «Encuentra mi vehículo» por ctx.pulsar; una versión se fija; y «SIGUIENTE» → hueco con inventario', async () => {
  const { context, page, ctx, pulsados } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    assert.equal(await campoTurismos(marco, 'Matrícula').inputValue(), FORM.matricula)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'V1')
    assert.equal(await marco.locator('input[type=radio]').nth(2).isChecked(), false, 'compra/uso/garaje no se tocan')
    assert.deepEqual(pulsados, ['opcion:Sí', 'Encuentra mi vehículo'])
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 3_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /Datos personales/.test((e as Error).message))
    assert.deepEqual(pulsados, ['opcion:Sí', 'Encuentra mi vehículo', 'SIGUIENTE'], 'solo navegación/consulta')
  } finally {
    await context.close()
  }
})

test('varias versiones sin elección → ErrorEleccionVersion (requiere_humano) con las opciones; con elección explícita se fija', async () => {
  const versiones: Array<[string, string]> = [['A1', 'Version A 90 CV'], ['B2', 'Version B 120 CV']]
  const a = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(a.page, marco, FORM, a.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 2)
  } finally {
    await a.context.close()
  }
  const b = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await rellenarDatosVehiculoTurismos(b.page, marco, { ...FORM, eleccionVersion: { codigo: 'B2', etiqueta: 'Version B 120 CV' } }, b.ctx)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'B2')
  } finally {
    await b.context.close()
  }
})

test('huecos: aviso del portal, «SIGUIENTE» muerto y «Sí» ambiguo → ErrorMapaIncompleto con inventario; nunca se pulsa SIGUIENTE deshabilitado', async () => {
  const a = await abrir({ aviso: true })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(a.page, marco, FORM, a.ctx), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  } finally {
    await a.context.close()
  }
  const b = await abrir({ siguienteMuerto: true })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await rellenarDatosVehiculoTurismos(b.page, marco, FORM, b.ctx) // hay versión única: sigue
    await assert.rejects(avanzarDesdeDatosVehiculo(b.page, marco, b.ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.ok(!b.pulsados.includes('SIGUIENTE'))
  } finally {
    await b.context.close()
  }
  const c = await abrir({ sisDuplicados: true })
  try {
    const marco = await marcoFormularioTurismos(c.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(c.page, marco, FORM, c.ctx), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.deepEqual(c.pulsados, [])
  } finally {
    await c.context.close()
  }
})

test('puerta guardada de opciones: lista cerrada y solo en la app del motor', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'No'), EmisionBloqueadaError)
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'Ocasional (fines de semana, vacaciones, etc)'), EmisionBloqueadaError)
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'Sí'), { estado: 'marcada' })
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'Sí'), { estado: 'ya_marcada' })
  } finally {
    await context.close()
  }
  const otra = await abrir({}, '/ngx-allianzhogar2053/')
  try {
    const f = otra.page.frame({ name: 'appArea' })!
    await assert.rejects(marcarOpcionTurismosAllianz(f, otra.guard, 'Sí'), EmisionBloqueadaError)
  } finally {
    await otra.context.close()
  }
})

test('H1: «Sí» de OTRO grupo o con OTRA pestaña seleccionada → EmisionBloqueadaError, sin pulsar', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    // «Sí» existe también en el grupo «Uso»: solo vale el del grupo de la matrícula (y se marca ese).
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'Sí'), { estado: 'marcada' })
    assert.equal(await marco.locator('#ng-x1-sii').isChecked(), false)
    // Quitamos el grupo de la matrícula: queda solo el «Sí» ajeno → bloqueo.
    await marco.evaluate(() => document.querySelector('[aria-labelledby="ng-x1-nx-label-5"]')!.remove())
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'Sí'), EmisionBloqueadaError)
    assert.equal(await marco.locator('#ng-x1-sii').isChecked(), false)
  } finally {
    await context.close()
  }
  const b = await abrir()
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await marco.evaluate(() => { const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[1].setAttribute('aria-selected', 'true') })
    await assert.rejects(marcarOpcionTurismosAllianz(marco, b.guard, 'Sí'), EmisionBloqueadaError)
    assert.equal(await marco.locator('#ng-x1-nx-radio-9-input').isChecked(), false)
  } finally {
    await b.context.close()
  }
})

test('H2: «SIGUIENTE» con otra pestaña seleccionada → ErrorMapaIncompleto con inventario y NO se pulsa', async () => {
  const { context, page, ctx, pulsados } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    await marco.evaluate(() => { const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[2].setAttribute('aria-selected', 'true') })
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.ok(!pulsados.includes('SIGUIENTE'))
  } finally {
    await context.close()
  }
})

test('H5: «SIGUIENTE» con aria-disabled="true" cuenta como deshabilitado (no se pulsa)', async () => {
  const { context, page, ctx, pulsados } = await abrir({ siguienteAria: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && /qué falta/.test((e as Error).message))
    assert.ok(!pulsados.includes('SIGUIENTE'))
  } finally {
    await context.close()
  }
})
