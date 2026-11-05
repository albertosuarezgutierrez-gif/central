// Modo `vehiculo` (explorador 0.3.48, 04/11/2026): consulta de marca/modelo/versión por MATRÍCULA en Allianz Turismos que solo LEE y
// para. Lógica pura + DOM SINTÉTICO de la pantalla «Datos del vehículo» (estructura de test/auto-turismos.test.ts; matrícula, marcas y
// modelos FICTICIOS). Cepo principal: este modo NUNCA pulsa avances de cotización (ni tarjeta, ni «SIGUIENTE»).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame } from 'playwright'
import { instalarGuardEmision, marcarOpcionTurismosAllianz } from '../src/guard.ts'
import { consultarMatriculaTurismos, marcoFormularioTurismos } from '../src/adapters/allianz/auto.ts'
import { MODOS_SOPORTADOS } from '../src/api.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import {
  MAX_PULSACIONES_VEHICULO,
  VEHICULO_VERSION,
  camposTarjetaVehiculo,
  cuerpoVehiculo,
  decidirVehiculo,
  enmascararMatricula,
  formasMatricula,
  matriculaDelRiesgo,
  pulsacionVetadaVehiculo,
  pulsarConVetoVehiculo,
} from '../src/vehiculo.ts'

const MATRICULA = '0000BBB'
const ID = '00000000-0000-4000-8000-000000000001'

test('versión: el modo vehículo va con el explorador 0.3.48 y la imagen lo declara', () => {
  assert.equal(EXPLORADOR_VERSION, '0.3.50')
  assert.equal(VEHICULO_VERSION, '0.3.50')
  assert.ok((MODOS_SOPORTADOS as readonly string[]).includes('vehiculo'))
  const runner = readFileSync(join(import.meta.dirname, '..', 'src', 'runner.ts'), 'utf8')
  assert.match(runner, /if \(trabajo\.modo === 'vehiculo'\) return ejecutarVehiculo\(/)
})

test('matriculaDelRiesgo / enmascararMatricula / formasMatricula', () => {
  assert.equal(matriculaDelRiesgo({ matricula: '0000-bbb' }), '0000BBB')
  assert.equal(matriculaDelRiesgo({ matricula: '0000AAA' }), null)
  assert.equal(matriculaDelRiesgo({}), null)
  assert.equal(matriculaDelRiesgo(null), null)
  assert.equal(enmascararMatricula(MATRICULA), '****BBB')
  assert.deepEqual(formasMatricula(MATRICULA), ['0000BBB', '0000 BBB', '0000-BBB'])
})

test('veto del modo: todo avance de cotización se rechaza; los pasos de entrada no', () => {
  for (const t of ['SIGUIENTE', ' Siguiente ', 'Continuar', 'Calcular precio', 'Tarificar', 'Guardar presupuesto', 'Emitir', 'Contratar', 'Seleccionar', 'Confirmación', 'Anterior']) {
    assert.equal(pulsacionVetadaVehiculo(t), true, t)
  }
  for (const t of ['INICIAR SESIÓN', 'Nueva Alta', 'Autos', 'Turismos', 'Encuentra mi vehículo']) assert.equal(pulsacionVetadaVehiculo(t), false, t)
})

test('camposTarjetaVehiculo: etiqueta de catálogo en el orden en que venga', () => {
  assert.deepEqual(camposTarjetaVehiculo('Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.0 CRDI 90 CV'), { marca: 'MARCAFICT', modelo: 'Alfa', combustible: 'Diésel', version: '2.0 CRDI 90 CV' })
  assert.deepEqual(camposTarjetaVehiculo('Marca del vehículo MARCAFICT Modelo Alfa Versión 90 CV'), { marca: 'MARCAFICT', modelo: 'Alfa', combustible: null, version: '90 CV' })
  assert.deepEqual(camposTarjetaVehiculo('algo sin forma'), { marca: null, modelo: null, combustible: null, version: null })
})

test('decidirVehiculo: una tarjeta → todo; varias del mismo modelo → sin versión; modelos distintos o aviso → sin_resultado (no se inventa)', () => {
  const una = decidirVehiculo({ tipo: 'tarjetas', etiquetas: ['Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.0 CRDI 90 CV'], fechaMatriculacion: '2019-03-05' })
  assert.deepEqual(una, { estado: 'ok', vehiculo: { marca: 'MARCAFICT', modelo: 'Alfa', version: '2.0 CRDI 90 CV', combustible: 'Diésel', fechaMatriculacion: '2019-03-05' } })
  const varias = decidirVehiculo({ tipo: 'tarjetas', etiquetas: ['Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 90 CV', 'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 120 CV'], fechaMatriculacion: null })
  assert.deepEqual(varias, { estado: 'ok', vehiculo: { marca: 'MARCAFICT', modelo: 'Alfa', version: null, combustible: 'Diésel', fechaMatriculacion: null } })
  assert.equal(decidirVehiculo({ tipo: 'tarjetas', etiquetas: ['Marca del vehículo A Modelo X', 'Marca del vehículo A Modelo Y'], fechaMatriculacion: null }).estado, 'sin_resultado')
  assert.deepEqual(decidirVehiculo({ tipo: 'aviso' }), { estado: 'sin_resultado', motivo: 'aviso_portal' })
  const vacia = { marca: null, modelo: null, versionSeleccionada: null, versiones: [], combustible: null, potencia: null, unidadPotencia: null, fechaMatriculacion: null, codigoCatalogo: null }
  assert.equal(decidirVehiculo({ tipo: 'versiones', opciones: [{ etiqueta: 'V 90 CV', codigo: 'V1' }], legado: vacia, fechaMatriculacion: null }).estado, 'sin_resultado')
  const conLegado = decidirVehiculo({ tipo: 'versiones', opciones: [{ etiqueta: '', codigo: null }, { etiqueta: 'V 90 CV', codigo: 'V1' }], legado: { ...vacia, marca: 'MARCA', modelo: 'MOD' }, fechaMatriculacion: null })
  assert.deepEqual(conLegado, { estado: 'ok', vehiculo: { marca: 'MARCA', modelo: 'MOD', version: 'V 90 CV', combustible: null, fechaMatriculacion: null } })
})

test('cuerpoVehiculo: nunca lleva la matrícula (un texto que la contenga → sin_resultado)', () => {
  const ok = cuerpoVehiculo(ID, { estado: 'ok', vehiculo: { marca: 'M', modelo: 'X', version: null, combustible: null, fechaMatriculacion: '2019-03-05' } }, MATRICULA)
  assert.equal(ok.estado, 'ok')
  assert.ok(!JSON.stringify(ok).includes('BBB'))
  const sucio = cuerpoVehiculo(ID, { estado: 'ok', vehiculo: { marca: 'M', modelo: 'X 0000-BBB', version: null, combustible: null, fechaMatriculacion: null } }, MATRICULA)
  assert.equal(sucio.estado, 'sin_resultado')
  assert.ok(!JSON.stringify(sucio).includes('BBB'))
})

// ── DOM sintético de «Datos del vehículo» de Turismos ──

const CARCASA = `<!doctype html><html><body><h1>ePac</h1><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-motor-azs/"></iframe></body></html>`

function app(o: { tarjetas?: string[]; aviso?: boolean }): string {
  const radio = (id: string, grupo: string, etiqueta: string) => `<span><input type="radio" id="${id}" name="${grupo}" class="cdk-visually-hidden"><label for="${id}">${etiqueta}</label></span>`
  const pasos = ['Datos del vehículo', 'Datos personales', 'Antecedentes', 'Selección de paquete', 'Datos', 'Revisión', 'Pago', 'Confirmación']
  const tarjetas = (o.tarjetas ?? [])
    .map((e, i) => `<span><input type="radio" id="ng-x1-nx-selectable-card-24${i}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);opacity:0"><label for="ng-x1-nx-selectable-card-24${i}">${e}</label></span>`)
    .join('')
  return `<!doctype html><html><body>
<div>${pasos.map((p, i) => `<nx-multi-step-item role="tab" aria-selected="${i === 0}" ${i === 0 ? '' : 'aria-disabled="true"'}>${p}</nx-multi-step-item>`).join('')}</div>
<main id="appArea"><section id="paso1">
  <div role="radiogroup" aria-labelledby="ng-x1-nx-label-5"><label id="ng-x1-nx-label-5">¿Conoces la matrícula del vehículo?</label>
  ${radio('ng-x1-nx-radio-9-input', 'ng-x1-nx-radio-group-4', 'Sí')}${radio('ng-x1-nx-radio-10-input', 'ng-x1-nx-radio-group-4', 'No')}</div>
  <div id="bloqueMatricula" hidden>
    <label for="ng-x1-nx-input-12">Matrícula</label><input id="ng-x1-nx-input-12" type="text" required>
    <button type="button" id="ng-x1-btn-77" disabled>Encuentra mi vehículo</button>
  </div>
  <button type="button" id="ng-x1-btn-99" disabled>SIGUIENTE</button>
</section></main>
<script>
  const $ = (s) => document.querySelector(s);
  window.__clics = [];
  document.querySelectorAll('[aria-labelledby="ng-x1-nx-label-5"] input[type=radio]').forEach((r) => r.addEventListener('change', () => { $('#bloqueMatricula').hidden = false; }));
  $('#ng-x1-nx-input-12').addEventListener('input', () => { $('#ng-x1-btn-77').disabled = $('#ng-x1-nx-input-12').value.length < 4; });
  $('#ng-x1-btn-99').addEventListener('click', () => window.__clics.push('SIGUIENTE'));
  $('#ng-x1-btn-77').addEventListener('click', () => setTimeout(() => {
    ${o.aviso ? "const a = document.createElement('div'); a.setAttribute('role', 'alert'); a.textContent = 'No encontrado'; $('#paso1').appendChild(a); return;" : ''}
    const t = document.createElement('div'); t.innerHTML = ${JSON.stringify(`<h3>Detalles del vehículo</h3>${tarjetas}`)}; $('#ng-x1-btn-77').after(t);
    t.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { window.__clics.push('tarjeta'); $('#ng-x1-btn-99').disabled = false; }));
  }, 150));
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

async function abrir(o: { tarjetas?: string[]; aviso?: boolean }) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: u.hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const conteo = { n: 0 }
  const ctx = {
    pulsar: pulsarConVetoVehiculo(guard, async () => undefined, conteo),
    pausaAccion: async () => undefined,
    marcarOpcionTurismos: (m: Frame, clave: string) => marcarOpcionTurismosAllianz(m, guard, clave),
  }
  return { context, page, ctx, conteo, guard }
}

const clicsDe = (m: Frame) => m.evaluate(() => (window as unknown as { __clics: string[] }).__clics)

test('DOM: Sí + matrícula + «Encuentra mi vehículo» → lee las tarjetas SIN elegir ninguna ni pulsar «SIGUIENTE»', async () => {
  const etiquetas = ['Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.0 CRDI 90 CV']
  const { context, page, ctx, conteo, guard } = await abrir({ tarjetas: etiquetas })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    const c = await consultarMatriculaTurismos(page, marco, MATRICULA, ctx)
    assert.deepEqual(c, { tipo: 'tarjetas', etiquetas, fechaMatriculacion: null })
    assert.equal(conteo.n, 1, 'un solo clic: «Encuentra mi vehículo»')
    assert.deepEqual(await clicsDe(marco), [], 'ni tarjeta ni SIGUIENTE')
    assert.equal(await marco.locator('#ng-x1-nx-selectable-card-240').isChecked(), false)
    guard.comprobar()
    assert.equal(decidirVehiculo(c).estado, 'ok')
  } finally {
    await context.close()
  }
})

test('DOM: con «SIGUIENTE» HABILITADO, el `pulsar` del modo lo veta y no llega al portal', async () => {
  const { context, page, ctx, conteo } = await abrir({ tarjetas: ['Marca del vehículo M Modelo X'] })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await marco.evaluate(() => { (document.querySelector('#ng-x1-btn-99') as HTMLButtonElement).disabled = false })
    await assert.rejects(ctx.pulsar(marco.locator('#ng-x1-btn-99')), /pulsación vetada/)
    assert.equal(conteo.n, 0)
    assert.deepEqual(await clicsDe(marco), [])
  } finally {
    await context.close()
  }
})

test('DOM: aviso del portal → `aviso` (sin_resultado), sin pulsar nada más', async () => {
  const { context, page, ctx, conteo } = await abrir({ aviso: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    const c = await consultarMatriculaTurismos(page, marco, MATRICULA, ctx)
    assert.deepEqual(c, { tipo: 'aviso' })
    assert.equal(conteo.n, 1)
    assert.deepEqual(await clicsDe(marco), [])
  } finally {
    await context.close()
  }
})

test('tope de pulsaciones del modo', async () => {
  const conteo = { n: MAX_PULSACIONES_VEHICULO }
  const p = pulsarConVetoVehiculo({} as never, async () => undefined, conteo)
  const falso = { evaluate: async () => 'Nueva Alta' } as never
  await assert.rejects(p(falso), /tope de/)
})
