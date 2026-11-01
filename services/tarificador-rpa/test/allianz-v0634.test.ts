// Allianz Turismos 0.6.34 (27/10/2026): el guardado puede confirmarse TARDE (aparece «Descargar propuesta», sin frase ni nº) y, si no se confirma,
// el aviso lleva un diagnóstico saneado (≤300, sin PII). Fixtures SINTÉTICOS. Solo espera/diagnóstico: no cambia qué se pulsa.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame } from 'playwright'
import type { OfertaNormalizada } from '@central/module-tarificacion'
import {
  MS_CONFIRMA_GUARDADO_TURISMOS,
  descargaPropuestaNueva,
  diagnosticoSinConfirmarTurismos,
  guardarPresupuestoTurismosAllianz,
  instalarGuardEmision,
} from '../src/guard.ts'
import { allianzAuto, ofertasConPresupuestoTurismos } from '../src/adapters/allianz/auto.ts'

const PII = ['12345678Z', 'a.b@example.invalid', '1234BCD', '600123456', '99887766']
const sinPii = (t: string) => { for (const p of PII) assert.ok(!t.includes(p), `PII en el texto: ${p}`); assert.ok(!/\d{5,}/.test(t), 'secuencia de 5+ cifras') }

test('0.6.34 · versión y espera ampliada (>15 s)', () => {
  assert.equal(allianzAuto.version, '0.6.39')
  assert.ok(MS_CONFIRMA_GUARDADO_TURISMOS >= 25_000)
})

test('0.6.34 · «Descargar propuesta» NUEVO confirma; el que ya estaba, no', () => {
  assert.equal(descargaPropuestaNueva('Precio 100', 'Precio 100 DESCARGAR PROPUESTA'), true)
  assert.equal(descargaPropuestaNueva('Descargar propuesta', 'Descargar propuesta'), false)
  assert.equal(descargaPropuestaNueva('', 'Descargar  Propuesta'), true)
})

test('0.6.34 · diagnóstico: ≤300, saneado, estado del formulario y campos vacíos', () => {
  const d = diagnosticoSinConfirmarTurismos({
    mensajes: ['Error del proceso NIF 12345678Z correo a.b@example.invalid matrícula 1234BCD tel 600123456 ref 99887766'],
    formularioVisible: true, botonHabilitado: true, pendientes: ['Código de agente'],
  })
  sinPii(d)
  assert.ok(d.length <= 300)
  assert.match(d, /formulario aún a la vista/)
  assert.match(d, /botón habilitado/)
  assert.match(d, /«Código de agente»/)
  const largo = diagnosticoSinConfirmarTurismos({ mensajes: ['x'.repeat(500), 'y'.repeat(500)], formularioVisible: false, botonHabilitado: null, pendientes: Array(12).fill('Campo') })
  assert.ok(largo.length <= 300)
  assert.match(diagnosticoSinConfirmarTurismos({ mensajes: [], formularioVisible: false, botonHabilitado: false, pendientes: [] }), /ya no se ve; botón deshabilitado; sin mensajes/)
})

test('0.6.34 · el aviso de «sin confirmar» lleva el diagnóstico', () => {
  const o = { compania: 'allianz', producto: 'Turismos · X', primaAnualEur: 100, avisos: [], referenciaPortal: null } as unknown as OfertaNormalizada
  const [a] = ofertasConPresupuestoTurismos([o], { estado: 'sin_confirmar', identificador: 'GA-1', diagnostico: 'formulario aún a la vista; botón habilitado' })
  assert.match(a!.avisos.at(-1)!, /no lo confirmó.*Diagnóstico: formulario aún a la vista/)
  const [b] = ofertasConPresupuestoTurismos([o], { estado: 'sin_confirmar', identificador: 'GA-1' })
  assert.doesNotMatch(b!.avisos.at(-1)!, /Diagnóstico/)
})

// ── Navegador ──
const caja = (id: string, texto: string, m: boolean) => `<nx-checkbox><input type="checkbox" id="${id}" ${m ? 'checked' : ''}><label for="${id}"><span></span><div>${texto}</div></label></nx-checkbox>`
const app = (modo: 'tarde' | 'nada') => `<!doctype html><html><body><div id="appArea">
<nx-multi-step-item role="tab" aria-selected="true">Selección de paquete</nx-multi-step-item><p>Precio 100,00 €</p>
<nx-mt-save-proposal id="bloque"><form novalidate><h3>Guardar el presupuesto</h3>
<label for="ident">Identificador presupuesto</label><input id="ident" maxlength="30" required>
<label for="ag">Código de agente</label><input id="ag">
${caja('c1', 'Envío a cliente', false)}${caja('c2', 'Envío a agente', false)}${caja('c3', 'Mostrar presupuesto en eCliente', true)}${caja('c4', ' Terceros con lunas ', false)}${caja('c5', ' Todos los paquetes ', false)}
<button type="button" id="guardar"><span>Guardar presupuesto</span></button></form></nx-mt-save-proposal><div id="zona"></div>
<script>
  document.getElementById('guardar').addEventListener('click', () => { window.__pulsado = (window.__pulsado || 0) + 1
    if (${modo === 'tarde'}) setTimeout(() => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Descargar propuesta'; document.getElementById('zona').appendChild(b) }, 3000)
    else document.getElementById('zona').innerHTML = '<div role="alert">Error del proceso: NIF 12345678Z, a.b@example.invalid, 1234BCD, 600123456, ref 99887766</div>'
  })
</script></div></body></html>`
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

async function abrir(modo: 'tarde' | 'nada') {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: new URL(r.request().url()).hostname === 'cloud.e-pacallianz.com' ? app(modo) : CARCASA }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const marco = page.frames().find((f) => f.url().startsWith('https://cloud.e-pacallianz.com')) as Frame
  await marco.waitForSelector('#guardar', { state: 'attached' })
  return { context, guard, marco }
}

test('0.6.34 · confirmación TARDÍA (aparece «Descargar propuesta» a los 3 s, sin frase ni nº) → guardado; se pulsó UNA vez', async () => {
  const { context, guard, marco } = await abrir('tarde')
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261027-ABCDEF12', 8_000)
    assert.deepEqual(r, { estado: 'guardado', identificador: 'GA-20261027-ABCDEF12', referencia: null })
    assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado), 1)
  } finally {
    await context.close()
  }
})

test('0.6.34 · sin confirmar → diagnóstico con el aviso del portal SANEADO, formulario/botón y campos vacíos; sin doble pulsación', async () => {
  const { context, guard, marco } = await abrir('nada')
  try {
    const r = await guardarPresupuestoTurismosAllianz(marco, guard, 'GA-20261027-ABCDEF12', 1_200)
    assert.equal(r.estado, 'sin_confirmar')
    const d = r.estado === 'sin_confirmar' ? (r.diagnostico ?? '') : ''
    assert.match(d, /Error del proceso/)
    assert.match(d, /formulario aún a la vista/)
    assert.match(d, /botón habilitado/)
    assert.match(d, /«Código de agente»/)
    sinPii(d)
    assert.ok(d.length <= 300)
    assert.equal(await marco.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado), 1)
  } finally {
    await context.close()
  }
})
