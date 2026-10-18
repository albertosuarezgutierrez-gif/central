// Allianz AUTOS Turismos v0.6.13 (18/10/2026, autorizado por Alberto): «Guardar presupuesto» (no vinculante) por el guard.
// Estructura del formulario `nx-mt-save-proposal` tomada del HTML real (trabajo d675077b); valores INVENTADOS, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import {
  BOTONES_GUARDAR_PRESUPUESTO_TURISMOS,
  confirmacionGuardadoNueva,
  esBotonGuardarPresupuestoTurismos,
  guardarPresupuestoTurismosAllianz,
  identificadorPresupuestoTurismos,
  instalarGuardEmision,
  leerDatosUsadosTurismosAllianz,
  referenciaPresupuestoDeTexto,
} from '../src/guard.ts'
import { allianzAuto, AVISO_PRESUPUESTO_GUARDADO, ofertasConPresupuestoTurismos, seleccionVehiculoConfirmada } from '../src/adapters/allianz/auto.ts'

test('lista blanca: solo «Guardar presupuesto» / «Guardar proyecto» EXACTOS; cualquier texto de emisión o pago, rojo', () => {
  for (const t of BOTONES_GUARDAR_PRESUPUESTO_TURISMOS) assert.equal(esBotonGuardarPresupuestoTurismos([` ${t} `]), true, t)
  for (const t of ['Emitir', 'Contratar', 'Grabar póliza', 'Pagar', 'Confirmar', 'Confirmar Datos', 'Siguiente', 'Guardar presupuesto y emitir', 'Guardar', 'Guardar y contratar']) {
    assert.equal(esBotonGuardarPresupuestoTurismos([t]), false, t)
  }
  assert.equal(esBotonGuardarPresupuestoTurismos(['Guardar presupuesto', null, null, null, 'btnEmitir']), false, 'un id de emisión tumba el texto bueno')
})

test('identificador sin datos personales (≤30) y referencia leída del texto del portal', () => {
  const id = identificadorPresupuestoTurismos('d675077b-9d2d-4d1a-892b-6bafdf329eee', new Date('2026-10-18T10:00:00Z'))
  assert.equal(id, 'GA-20261018-D675077B')
  assert.ok(id.length <= 30)
  assert.equal(referenciaPresupuestoDeTexto('Presupuesto nº 123456789 guardado correctamente'), '123456789')
  assert.equal(referenciaPresupuestoDeTexto('Número de proyecto: AB-0001234'), 'AB-0001234')
  assert.equal(referenciaPresupuestoDeTexto('Precio total 1.234,56 €'), null)
})

test('ofertas: guardado → referenciaPortal + aviso; no guardado → solo aviso (el precio no se toca)', () => {
  const o = { compania: 'allianz', producto: 'Turismos · X', primaAnualEur: 100, avisos: ['a'], referenciaPortal: null } as unknown as OfertaNormalizada
  const [g] = ofertasConPresupuestoTurismos([o], { estado: 'guardado', identificador: 'GA-1', referencia: '999999' })
  assert.equal(g!.referenciaPortal, '999999')
  assert.ok(g!.avisos.some((a) => a.startsWith(AVISO_PRESUPUESTO_GUARDADO)))
  const [s] = ofertasConPresupuestoTurismos([o], { estado: 'guardado', identificador: 'GA-1', referencia: null })
  assert.equal(s!.referenciaPortal, 'GA-1')
  const [n] = ofertasConPresupuestoTurismos([o], { estado: 'no_guardado', motivo: 'no aparece el botón «Guardar presupuesto»' })
  assert.equal(n!.referenciaPortal, null)
  assert.equal(n!.primaAnualEur, 100)
  assert.match(n!.avisos.at(-1)!, /NO guardado/)
  assert.equal(allianzAuto.version, '0.6.14')
})

// ── Navegador: carcasa ePAC + app de Turismos con el formulario de guardado ──
type Opc = {
  nombre?: string
  boton?: string
  /** «Envío a cliente» llega MARCADA. */
  envioMarcado?: boolean
  /** El clic en «Envío a cliente» no la cambia (el portal la bloquea). */
  envioPegado?: boolean
  /** Al marcar «Todos los paquetes», «Angular» vuelve a marcar «Envío a cliente». */
  remarcaEnvio?: boolean
  /** Texto de confirmación que YA está en pantalla antes del clic. */
  textoPrevio?: string
  /** El clic no pinta confirmación nueva. */
  clicMudo?: boolean
}
const caja = (id: string, texto: string, marcada: boolean) =>
  `<nx-checkbox><input type="checkbox" id="${id}" ${marcada ? 'checked' : ''}><label for="${id}"><span></span><div>${texto}</div></label></nx-checkbox>`
const app = (o: Opc) => `<!doctype html><html><body><div id="appArea">
<nx-multi-step-item role="tab" aria-selected="true">Selección de paquete</nx-multi-step-item>
<p>Precio 100,00 €</p>
<nx-mt-person-information><nx-x-common-header text="¿Quién es el tomador?"></nx-x-common-header>
  <label for="cp">Código postal</label><input id="cp" disabled value="00001">
  <label for="loc">Localidad</label><input id="loc" disabled value="LOCALIDAD PRUEBA">
</nx-mt-person-information>
<nx-selectable-card><input type="radio" id="a-nx-selectable-card-1"><nx-data-display label="Marca del vehículo"><nx-data-display-label>Marca del vehículo</nx-data-display-label><div>OTRA</div></nx-data-display><nx-data-display label="Modelo"><nx-data-display-label>Modelo</nx-data-display-label><div>X</div></nx-data-display><nx-data-display label="Versión"><nx-data-display-label>Versión</nx-data-display-label><div>Y</div></nx-data-display></nx-selectable-card>
<nx-selectable-card><input type="radio" id="a-nx-selectable-card-2" checked><nx-data-display label="Marca del vehículo"><nx-data-display-label>Marca del vehículo</nx-data-display-label><div> MARCA </div></nx-data-display><nx-data-display label="Modelo"><nx-data-display-label>Modelo</nx-data-display-label><div>MODELO</div></nx-data-display><nx-data-display label="Versión"><nx-data-display-label>Versión</nx-data-display-label><div>  </div></nx-data-display></nx-selectable-card>
<nx-mt-save-proposal><form novalidate>
  <h3>Guardar el presupuesto</h3>
  <label for="ident">Identificador presupuesto</label><input id="ident" maxlength="30" required>
  <label for="nombre">Nombre</label><input id="nombre" required value="${o.nombre ?? 'NOMBRE'}">
  ${caja('c1', 'Envío a cliente', o.envioMarcado ?? false)}${caja('c2', 'Envío a agente', false)}${caja('c3', 'Mostrar presupuesto en eCliente', true)}
  ${caja('c4', ' Terceros con lunas ', false)}${caja('c5', ' Todos los paquetes ', false)}
  <button type="button" id="guardar" disabled><span><span><span>${o.boton ?? 'Guardar presupuesto'}</span></span></span></button>
  <p id="res">${o.textoPrevio ?? ''}</p>
</form></nx-mt-save-proposal></div>
<script>
  const b = document.getElementById('guardar'), i = document.getElementById('ident'), n = document.getElementById('nombre')
  const ver = () => { b.disabled = !(i.value && n.value) }
  i.addEventListener('input', ver); ver()
  b.addEventListener('click', () => { window.__pulsado = true; if (!${!!o.clicMudo}) document.getElementById('res').textContent = 'Presupuesto nº 123456789 guardado correctamente' })
  if (${!!o.envioPegado}) document.querySelector('label[for=c1]').addEventListener('click', (e) => e.preventDefault())
  if (${!!o.remarcaEnvio}) document.getElementById('c5').addEventListener('change', () => { document.getElementById('c1').checked = true })
</script></body></html>`
const CARCASA = `<!doctype html><html><body><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-motor-azs/"></iframe></body></html>`

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

async function abrir(o: Opc = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: new URL(r.request().url()).hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const marco = page.frames().find((f) => f.url().startsWith('https://cloud.e-pacallianz.com')) as Frame
  await marco.waitForSelector('#guardar')
  return { context, guard, marco }
}

test('guarda: identificador puesto, eCliente y envíos DESMARCADOS, todos los paquetes, y lee el nº del portal', async () => {
  const { context, guard, marco } = await abrir()
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 2_000)
    assert.deepEqual(r, { estado: 'guardado', identificador: 'GA-20261018-ABCDEF12', referencia: '123456789' })
    assert.equal(await marco.locator('#ident').inputValue(), 'GA-20261018-ABCDEF12')
    assert.equal(await marco.locator('#c3').isChecked(), false, 'nada se publica en eCliente')
    assert.equal(await marco.locator('#c1').isChecked(), false, 'nada se envía al cliente')
    assert.equal(await marco.locator('#c2').isChecked(), false)
    assert.equal(await marco.locator('#c5').isChecked(), true)
  } finally {
    await context.close()
  }
})

test('obligatorio vacío (nombre) → NO se pulsa y se dice cuál; texto de botón fuera de lista → NO se pulsa', async () => {
  for (const [o, re] of [[{ nombre: '' }, /«Nombre»/], [{ boton: 'Guardar presupuesto y emitir' }, /no aparece el botón/]] as const) {
    const { context, guard, marco } = await abrir(o)
    try {
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 500)
      assert.equal(r.estado, 'no_guardado')
      if (r.estado === 'no_guardado') assert.match(r.motivo, re)
      assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: boolean }).__pulsado ?? false), false)
    } finally {
      await context.close()
    }
  }
})

test('datos que Allianz usó: CP y localidad del bloque del tomador y la tarjeta MARCADA; lo vacío, null', async () => {
  const { context, marco } = await abrir()
  try {
    assert.deepEqual(await leerDatosUsadosTurismosAllianz(marco), { codigoPostal: '00001', localidad: 'LOCALIDAD PRUEBA', vehiculo: { marca: 'MARCA', modelo: 'MODELO', version: null } })
  } finally {
    await context.close()
  }
})

test('casilla que NO queda desmarcada («Envío a cliente» bloqueada) → no se pulsa', async () => {
  const { context, guard, marco } = await abrir({ envioMarcado: true, envioPegado: true })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 500)
    assert.equal(r.estado, 'no_guardado')
    if (r.estado === 'no_guardado') assert.match(r.motivo, /Envío a cliente/)
    assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: boolean }).__pulsado ?? false), false)
  } finally {
    await context.close()
  }
})

test('«Envío a cliente» ya marcada y Angular la RE-MARCA tras desmarcarla → relectura antes del clic, no se pulsa', async () => {
  const { context, guard, marco } = await abrir({ envioMarcado: true, remarcaEnvio: true })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 500)
    assert.equal(r.estado, 'no_guardado')
    if (r.estado === 'no_guardado') assert.match(r.motivo, /Envío a cliente.*volvió a quedar marcada/)
    assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: boolean }).__pulsado ?? false), false)
  } finally {
    await context.close()
  }
})

test('confirmación: solo cuenta lo NUEVO tras el clic (una referencia previa no es la del guardado)', async () => {
  assert.deepEqual(confirmacionGuardadoNueva('', 'Presupuesto nº 123456789 guardado correctamente'), { confirmado: true, referencia: '123456789' })
  assert.deepEqual(confirmacionGuardadoNueva('Presupuesto nº 111111111 guardado', 'Presupuesto nº 111111111 guardado'), { confirmado: false, referencia: null })
  assert.deepEqual(confirmacionGuardadoNueva('Presupuesto nº 111111111 guardado', 'Presupuesto nº 111111111 guardado. Presupuesto nº 222222222 guardado'), { confirmado: true, referencia: '222222222' })
  assert.deepEqual(confirmacionGuardadoNueva('Nº presupuesto: 111111111', 'Nº presupuesto: 111111111. Se ha guardado'), { confirmado: true, referencia: null })
  // En el navegador: la pantalla YA enseña un «Presupuesto nº … guardado» y el clic no pinta nada nuevo → sin_confirmar, sin referencia.
  const { context, guard, marco } = await abrir({ textoPrevio: 'Presupuesto nº 999999999 guardado correctamente', clicMudo: true })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 800)
    assert.deepEqual(r, { estado: 'sin_confirmar', identificador: 'GA-20261018-ABCDEF12' })
    assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: boolean }).__pulsado ?? false), true)
  } finally {
    await context.close()
  }
})

test('seleccionVehiculo del resultado (para Generali): marca/modelo/versión confirmados; sin marca o modelo, o con forma de dato personal → null', () => {
  assert.deepEqual(seleccionVehiculoConfirmada({ marca: ' SEAT ', modelo: 'LEON', version: '1.5 TSI  FR' }), { marca: 'SEAT', modelo: 'LEON', descripcion: '1.5 TSI FR' })
  assert.deepEqual(seleccionVehiculoConfirmada({ marca: 'MARCA', modelo: 'MODELO', version: null }), { marca: 'MARCA', modelo: 'MODELO' })
  assert.equal(seleccionVehiculoConfirmada({ marca: null, modelo: 'MODELO', version: 'V' }), null)
  assert.equal(seleccionVehiculoConfirmada({ marca: 'MARCA', modelo: '  ', version: 'V' }), null)
  assert.equal(seleccionVehiculoConfirmada(null), null)
  assert.equal(seleccionVehiculoConfirmada({ marca: 'MARCA', modelo: 'MODELO', version: '1234BCD' }), null, 'una matrícula no viaja')
})
