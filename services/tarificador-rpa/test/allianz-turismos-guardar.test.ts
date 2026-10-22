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
  motivoFormularioGuardarTurismos,
  confirmacionGuardadoNueva,
  esBotonGuardarPresupuestoTurismos,
  esExpansorGuardarTurismosPermitido,
  etiquetasControlesSaneadas,
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
  assert.equal(allianzAuto.version, '0.6.22')
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
  /**
   * v0.6.20 · cómo está el bloque «Guardar el presupuesto»: `tarde` (oculto y aparece a los 1,5 s), `oculto` (display:none siempre),
   * `sin` (no hay `nx-mt-save-proposal`; con `botonFuera`, un «Guardar presupuesto» suelto fuera), `altoCero` (`<form>` de alto 0
   * con el contenido visible: Playwright no lo da por «visible»).
   */
  bloque?: 'tarde' | 'oculto' | 'sin' | 'altoCero'
  botonFuera?: boolean
  /**
   * v0.6.21 · el bloque cuelga de un panel PLEGADO (`nx-expansion-panel` con su cabecera `aria-expanded="false"` + `aria-controls`),
   * junto a otro panel ajeno «Vista Ampliada» que NO se debe tocar. `ok`: cabecera «Opciones de guardado»; `emitir`: cabecera
   * «Guardar y emitir»; `pestana`: lo gobierna una pestaña no seleccionada.
   */
  plegado?: 'ok' | 'emitir' | 'pestana'
  /** v0.6.22 · barra con «Guardar presupuesto» visible que revela el bloque oculto: `linea` (lo muestra) o `dialogo` (lo mueve a un overlay); `inerte` no revela nada. Siempre con paso «Pago». */
  abridor?: 'linea' | 'dialogo' | 'inerte'
}
const ABRE_PLEGADO = (o: Opc) => {
  if (!o.plegado) return ''
  const cab = o.plegado === 'emitir' ? 'Guardar y emitir' : 'Opciones de guardado'
  const ajeno = '<nx-expansion-panel><button type="button" id="vista" aria-expanded="false" aria-controls="cuerpoVista" onclick="window.__vista=1">Vista Ampliada</button><div id="cuerpoVista" style="display:none">x</div></nx-expansion-panel>'
  if (o.plegado === 'pestana') return `${ajeno}<div role="tablist"><button type="button" role="tab" id="cab" aria-selected="false" aria-controls="cuerpo" onclick="window.__desplegado=(window.__desplegado||0)+1;document.getElementById('cuerpo').style.display='';this.setAttribute('aria-selected','true')">Guardar</button></div><div id="cuerpo" role="tabpanel" style="display:none">`
  return `${ajeno}<nx-expansion-panel><button type="button" id="cab" aria-expanded="false" aria-controls="cuerpo" onclick="window.__desplegado=(window.__desplegado||0)+1;document.getElementById('cuerpo').style.display='';this.setAttribute('aria-expanded','true')">${cab}</button><div id="cuerpo" style="display:none">`
}
const CIERRA_PLEGADO = (o: Opc) => (!o.plegado ? '' : o.plegado === 'pestana' ? '</div>' : '</div></nx-expansion-panel>')
const hostBloque = (o: Opc) => (o.bloque === 'sin' ? 'div' : 'nx-mt-save-proposal')
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
${o.abridor ? `<nav><a role="tab" onclick="window.__pago=1">Pago</a><button type="button" id="barra" onclick="window.__abierto=(window.__abierto||0)+1;const b=document.getElementById('bloque');${o.abridor === 'inerte' ? '' : o.abridor === 'dialogo' ? "const d=document.createElement('div');d.setAttribute('role','dialog');d.style.cssText='position:fixed;top:0;left:0;max-height:100vh;overflow:auto;background:#fff';document.body.appendChild(d);d.appendChild(b);b.style.display=''" : "b.style.display=''"}"><nx-icon></nx-icon>Guardar presupuesto</button></nav>` : ''}
${o.botonFuera ? '<button type="button" id="fuera" onclick="window.__fuera=1">Guardar presupuesto</button>' : ''}
${ABRE_PLEGADO(o)}<${hostBloque(o)} id="bloque" style="${o.bloque === 'tarde' || o.bloque === 'oculto' || !!o.abridor ? 'display:none' : ''}"><form novalidate style="${o.bloque === 'altoCero' ? 'height:0;overflow:visible' : ''}">
  <h3>Guardar el presupuesto</h3>
  <label for="ident">Identificador presupuesto</label><input id="ident" maxlength="30" required>
  <label for="nombre">Nombre</label><input id="nombre" required value="${o.nombre ?? 'NOMBRE'}">
  ${caja('c1', 'Envío a cliente', o.envioMarcado ?? false)}${caja('c2', 'Envío a agente', false)}${caja('c3', 'Mostrar presupuesto en eCliente', true)}
  ${caja('c4', ' Terceros con lunas ', false)}${caja('c5', ' Todos los paquetes ', false)}
  <button type="button" id="guardar" disabled><span><span><span>${o.boton ?? 'Guardar presupuesto'}</span></span></span></button>
  <p id="res">${o.textoPrevio ?? ''}</p>
</form></${hostBloque(o)}>${CIERRA_PLEGADO(o)}</div>
<script>
  if (${o.bloque === 'tarde'}) setTimeout(() => { document.getElementById('bloque').style.display = '' }, 1500)
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
  await marco.waitForSelector('#guardar', { state: 'attached' })
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
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261018-ABCDEF12', 500, 300)
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

// ── v0.6.20 (22/10/2026): runs reales del 19 y 22/10 → «el formulario «Guardar el presupuesto» no está a la vista» y referencia NULL ──

test('v0.6.20: formulario que se pinta TARDE o con `<form>` de alto 0 → se espera/desplaza y SE GUARDA con su nº', async () => {
  for (const bloque of ['tarde', 'altoCero'] as const) {
    const { context, guard, marco } = await abrir({ bloque })
    try {
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 2_000, 5_000)
      assert.deepEqual(r, { estado: 'guardado', identificador: 'GA-20261022-ABCDEF12', referencia: '123456789' }, bloque)
    } finally {
      await context.close()
    }
  }
})

test('v0.6.20: bloque OCULTO, ausente o con «Guardar presupuesto» suelto FUERA → NO se pulsa nada y el motivo dice cuál', async () => {
  const casos: [Opc, RegExp][] = [
    [{ bloque: 'oculto' }, /está en la pantalla pero OCULTO/],
    [{ bloque: 'sin' }, /no aparece en la pantalla de precios/],
    [{ bloque: 'sin', botonFuera: true }, /hay 2 botón\(es\) «Guardar presupuesto» FUERA del formulario/],
  ]
  for (const [o, re] of casos) {
    const { context, guard, marco } = await abrir(o)
    try {
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 500, 600)
      assert.equal(r.estado, 'no_guardado')
      if (r.estado === 'no_guardado') assert.match(r.motivo, re)
      const w = await marco.evaluate(() => { const x = window as unknown as { __pulsado?: boolean; __fuera?: number }; return { p: x.__pulsado ?? false, f: x.__fuera ?? 0 } })
      assert.deepEqual(w, { p: false, f: 0 }, 'no se pulsa nada')
    } finally {
      await context.close()
    }
  }
})

test('v0.6.20: motivo del formulario (PURA) y propagación: referencia y aviso legible llegan a CADA oferta', () => {
  const base = { hosts: 1, formularios: 1, conBotonVisible: 0, botonesGuardarFuera: 0, otrosBotones: [] as string[] }
  assert.equal(motivoFormularioGuardarTurismos({ ...base, conBotonVisible: 1 }), null)
  assert.match(motivoFormularioGuardarTurismos({ ...base, conBotonVisible: 2 })!, /ambiguo/)
  assert.match(motivoFormularioGuardarTurismos({ ...base, hosts: 0, formularios: 0 })!, /no aparece/)
  assert.match(motivoFormularioGuardarTurismos({ ...base, otrosBotones: ['Guardar y emitir'] })!, /botones a la vista: «Guardar y emitir»/)
  const o = (p: string) => ({ compania: 'allianz', producto: p, primaAnualEur: 100, avisos: [], referenciaPortal: null }) as unknown as OfertaNormalizada
  const g = ofertasConPresupuestoTurismos([o('A'), o('B'), o('C')], { estado: 'guardado', identificador: 'GA-1', referencia: 'GA-20261022-0001' })
  assert.deepEqual(g.map((x) => x.referenciaPortal), ['GA-20261022-0001', 'GA-20261022-0001', 'GA-20261022-0001'])
  const n = ofertasConPresupuestoTurismos([o('A'), o('B')], { estado: 'no_guardado', motivo: motivoFormularioGuardarTurismos({ ...base, hosts: 0, formularios: 0 })! })
  assert.ok(n.every((x) => x.referenciaPortal === null && /^Presupuesto NO guardado en Allianz: el bloque «Guardar el presupuesto» no aparece/.test(x.avisos.at(-1)!)))
})

// ── v0.6.21 (22/10/2026): run real de las 3 modalidades → formulario en pantalla pero OCULTO: se despliega SOLO el panel que lo gobierna ──

test('v0.6.21: bloque en un panel PLEGADO (acordeón o pestaña) → se despliega SOLO ese panel (no «Vista Ampliada») y SE GUARDA', async () => {
  for (const plegado of ['ok', 'pestana'] as const) {
    const { context, guard, marco } = await abrir({ plegado })
    try {
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 2_000, 8_000)
      assert.deepEqual(r, { estado: 'guardado', identificador: 'GA-20261022-ABCDEF12', referencia: '123456789' }, plegado)
      const w = await marco.evaluate(() => { const x = window as unknown as { __desplegado?: number; __vista?: number }; return { d: x.__desplegado ?? 0, v: x.__vista ?? 0 } })
      assert.deepEqual(w, { d: 1, v: 0 }, `${plegado}: un despliegue y «Vista Ampliada» intacta`)
    } finally {
      await context.close()
    }
  }
})

test('v0.6.21: el control plegado es «Guardar y emitir» → NO se pulsa; motivo legible con los controles a la vista', async () => {
  const { context, guard, marco } = await abrir({ plegado: 'emitir' })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 500, 3_000)
    assert.equal(r.estado, 'no_guardado')
    if (r.estado === 'no_guardado') assert.match(r.motivo, /OCULTO.*; controles a la vista: .*«Vista Ampliada»/)
    const w = await marco.evaluate(() => { const x = window as unknown as { __desplegado?: number; __vista?: number; __pulsado?: boolean }; return { d: x.__desplegado ?? 0, v: x.__vista ?? 0, p: x.__pulsado ?? false } })
    assert.deepEqual(w, { d: 0, v: 0, p: false }, 'no se pulsa nada')
  } finally {
    await context.close()
  }
})

test('v0.6.21: bloque oculto sin panel que lo gobierne → no se pulsa nada y el motivo lista las etiquetas a la vista (PURA + navegador)', async () => {
  const base = { hosts: 1, formularios: 1, conBotonVisible: 0, botonesGuardarFuera: 0, otrosBotones: [] as string[] }
  assert.equal(motivoFormularioGuardarTurismos({ ...base, controlesVisibles: ['Volver', 'Imprimir'], desplegados: 1 }), 'el formulario «Guardar el presupuesto» está en la pantalla pero OCULTO (su botón no se ve; puede estar plegado); se desplegó 1 panel(es) plegado(s) sin que apareciera; controles a la vista: «Volver», «Imprimir»')
  assert.equal(motivoFormularioGuardarTurismos({ ...base, conBotonVisible: 1, controlesVisibles: ['Volver'] }), null)
  const { context, guard, marco } = await abrir({ bloque: 'oculto' })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 500, 900)
    assert.equal(r.estado, 'no_guardado')
    if (r.estado === 'no_guardado') assert.match(r.motivo, /OCULTO \(su botón no se ve; puede estar plegado\)(; hay 1 botón.*)?; controles a la vista: /)
  } finally {
    await context.close()
  }
})

test('v0.6.21: etiquetas saneadas (PURA) y control plegable permitido solo si no es guardar/emitir', () => {
  const out = etiquetasControlesSaneadas(['Volver', 'ANA LOPEZ PEREZ', 'a@b.es', 'Ref 12345678', 'Imprimir', 'Imprimir', ' '])
  assert.deepEqual(out, ['Imprimir', 'Volver'])
  assert.equal(esExpansorGuardarTurismosPermitido(['Opciones de guardado', null, null, null, 'cab']), true)
  assert.equal(esExpansorGuardarTurismosPermitido(['', 'Mostrar más', null, null]), true)
  for (const t of ['Guardar presupuesto', 'Guardar proyecto', 'Guardar y emitir', 'Contratar', 'Pagar', 'Enviar', 'Emitir póliza']) assert.equal(esExpansorGuardarTurismosPermitido([t, null, null, null]), false, t)
  assert.equal(esExpansorGuardarTurismosPermitido(['Opciones', null, null, null, 'btnEmitir']), false, 'un id de emitir lo tumba')
  assert.equal(esExpansorGuardarTurismosPermitido(['x'.repeat(41), null, null, null]), false)
})

test('v0.6.22: formulario oculto + «Guardar presupuesto» visible en la barra → se pulsa UNA vez, abre el formulario (en línea o diálogo) y SE GUARDA; «Pago» nunca', async () => {
  for (const abridor of ['linea', 'dialogo'] as const) {
    const { context, guard, marco } = await abrir({ abridor })
    try {
      const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 2_000, 9_000)
      assert.deepEqual(r, { estado: 'guardado', identificador: 'GA-20261022-ABCDEF12', referencia: '123456789' }, abridor)
      const w = await marco.evaluate(() => { const x = window as unknown as { __abierto?: number; __pago?: number }; return { a: x.__abierto ?? 0, p: x.__pago ?? 0 } })
      assert.deepEqual(w, { a: 1, p: 0 }, `${abridor}: una apertura y «Pago» intacto`)
    } finally {
      await context.close()
    }
  }
})

test('v0.6.22: el «Guardar presupuesto» de la barra no abre nada → una sola pulsación y motivo benigno', async () => {
  const { context, guard, marco } = await abrir({ abridor: 'inerte' })
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261022-ABCDEF12', 500, 6_000)
    assert.equal(r.estado, 'no_guardado')
    if (r.estado === 'no_guardado') assert.match(r.motivo, /OCULTO.*se pulsó el «Guardar presupuesto» de la pantalla para abrirlo y siguió sin verse/)
    const w = await marco.evaluate(() => { const x = window as unknown as { __abierto?: number; __pago?: number; __pulsado?: boolean }; return { a: x.__abierto ?? 0, p: x.__pago ?? 0, g: x.__pulsado ?? false } })
    assert.deepEqual(w, { a: 1, p: 0, g: false })
  } finally {
    await context.close()
  }
})
