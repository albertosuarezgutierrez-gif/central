// Mapfre NSEI · «Continuar» GUARDADO del stepper (Alberto, 14/10/2026): 1 → 2 → 3 en orden, una vez por paso; el del paso 3
// («Figuras») calcula las primas y está PERMITIDO. Nada desde Coberturas/Proyectos ni hacia Contratación; emitir, contratar,
// formalizar y grabar siguen bloqueados. Fixture SINTÉTICA: un stepper de Angular Material (`mat-step-header` role=tab con
// `aria-selected`) y el pie que describió Alberto («Salir», «Volver», «Controles técnicos», «Continuar»). Valores inventados.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import {
  confirmarVehiculoMapfre,
  ErrorFronteraEmision,
  ErrorMapaGuardMapfre,
  instalarGuardEmision,
  PASOS_CONTINUAR_MAPFRE,
  pulsarContinuarMapfre,
  type GuardEmision,
  type PasoContinuarMapfre,
} from '../src/guard.ts'
import { pideInventarioDom } from '../src/errores.ts'

const MATRICULA = '0000BBB'
const PASOS = ['Datos básicos', 'Objeto asegurado', 'Figuras', 'Coberturas', 'Proyectos', 'Contratación']

/** Stepper con el paso `activo` (0-5); «Continuar» salta `salto` pasos. `boton` sustituye al «Continuar» del pie. */
const STEPPER = (activo: number, o: { salto?: number; boton?: string; extra?: string } = {}) => `<mat-horizontal-stepper>
${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === activo}">${i + 1} ${p}</mat-step-header>`).join('\n')}
</mat-horizontal-stepper>
${o.extra ?? ''}
<div class="pie"><button onclick="window.__salir=1">Salir</button><button onclick="window.__volver=1">Volver</button><button onclick="window.__cctt=1">Controles técnicos</button>
${o.boton ?? `<button id="cont" onclick="window.__clics=(window.__clics||0)+1;const h=[...document.querySelectorAll('mat-step-header')];const i=h.findIndex((x)=>x.getAttribute('aria-selected')==='true');h[i].setAttribute('aria-selected','false');h[i+${o.salto ?? 1}].setAttribute('aria-selected','true')">Continuar</button>`}</div>`

const DIALOGO = `<app-matricula-dialog><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th></tr></thead><tbody>
<tr><td><input type="radio" name="veh" onchange="document.getElementById('ok').disabled=false"></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO</td><td>MARCA PRUEBA</td></tr>
</tbody></table><button id="ok" disabled onclick="document.querySelector('app-matricula-dialog').remove()">Aceptar</button></app-matricula-dialog>`

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
async function preparar(html: string): Promise<{ page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { page, guard }
}
/** Cambia de pantalla en el MISMO trabajo (el `window` sobrevive a `setContent`: se ponen a cero los contadores). */
async function poner(page: Page, html: string): Promise<void> {
  await page.setContent(`<body>${html}</body>`)
  await page.evaluate(() => { (window as unknown as { __clics?: number }).__clics = 0 })
}
const clics = (page: Page) => page.evaluate(() => (window as unknown as { __clics?: number }).__clics ?? 0)
const activo = (page: Page) => page.locator('mat-step-header[aria-selected="true"]').textContent()

test('lista CERRADA: solo desde Datos básicos, Objeto asegurado y Figuras (Figuras → Coberturas = precio)', () => {
  assert.deepEqual(Object.keys(PASOS_CONTINUAR_MAPFRE), ['datosBasicos', 'objetoAsegurado', 'figuras'])
  assert.deepEqual(Object.values(PASOS_CONTINUAR_MAPFRE).map((r) => r.destino), ['Objeto asegurado', 'Figuras', 'Coberturas'])
  assert.ok(Object.isFrozen(PASOS_CONTINUAR_MAPFRE) && Object.isFrozen(PASOS_CONTINUAR_MAPFRE.figuras))
})

test('flujo completo en orden: paso 1 → vehículo confirmado → paso 2 → paso 3 (calcula las primas) → Coberturas', async () => {
  const { page, guard } = await preparar(STEPPER(0))
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  assert.match((await activo(page)) ?? '', /Objeto asegurado/)
  await poner(page, DIALOGO)
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await poner(page, STEPPER(1))
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  assert.match((await activo(page)) ?? '', /Figuras/)
  await poner(page, STEPPER(2))
  await pulsarContinuarMapfre(page, guard, 'figuras')
  assert.match((await activo(page)) ?? '', /Coberturas/)
  assert.equal(await clics(page), 1)
  // Una vez por paso y trabajo.
  await poner(page, STEPPER(2))
  await assert.rejects(() => pulsarContinuarMapfre(page, guard, 'figuras'), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  assert.equal(await clics(page), 0)
})

test('fuera de orden: Figuras sin el paso 2, o el paso 2 sin vehículo confirmado → bloqueado SIN pulsar', async () => {
  const a = await preparar(STEPPER(2))
  await assert.rejects(() => pulsarContinuarMapfre(a.page, a.guard, 'figuras'), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase' && /fuera de orden/.test(e.message))
  assert.equal(await clics(a.page), 0)
  const b = await preparar(STEPPER(0))
  await pulsarContinuarMapfre(b.page, b.guard, 'datosBasicos')
  await poner(b.page, STEPPER(1))
  await assert.rejects(() => pulsarContinuarMapfre(b.page, b.guard, 'objetoAsegurado'), (e) => e instanceof EmisionBloqueadaError && /fuera de orden/.test(e.message))
  assert.equal(await clics(b.page), 0)
})

test('desde Coberturas, Proyectos o hacia Contratación NO hay «Continuar» autorizado', async () => {
  const { page, guard } = await preparar(STEPPER(3))
  for (const p of ['coberturas', 'proyectos', 'contratacion', '__proto__', 'toString']) {
    await assert.rejects(() => pulsarContinuarMapfre(page, guard, p as PasoContinuarMapfre), (e) => e instanceof EmisionBloqueadaError && e.donde === 'boton', p)
  }
  assert.equal(await clics(page), 0)
})

test('el paso activo no es el de origen → bloqueado sin pulsar; Contratación activa → bloqueo de emisión', async () => {
  const a = await preparar(STEPPER(1))
  await assert.rejects(() => pulsarContinuarMapfre(a.page, a.guard, 'datosBasicos'), (e) => e instanceof EmisionBloqueadaError && /no es «Datos básicos»/.test(e.message))
  assert.equal(await clics(a.page), 0)
  const b = await preparar(STEPPER(5))
  await assert.rejects(() => pulsarContinuarMapfre(b.page, b.guard, 'datosBasicos'), (e) => e instanceof EmisionBloqueadaError && /Contratación/.test(e.message))
  assert.equal(await clics(b.page), 0)
})

test('si tras «Continuar» el portal salta a Contratación → bloqueo de emisión', async () => {
  const { page, guard } = await preparar(STEPPER(0, { salto: 5 }))
  await assert.rejects(() => pulsarContinuarMapfre(page, guard, 'datosBasicos'), (e) => e instanceof EmisionBloqueadaError && /Contratación/.test(e.message))
})

test('emitir/contratar/formalizar/grabar siguen bloqueados: solo pasa un botón de texto EXACTO «Continuar» y sin manejador de emisión', async () => {
  const a = await preparar(STEPPER(0, { boton: '<button onclick="window.__emitido=1;emitirPoliza()">Continuar</button>' }))
  await assert.rejects(() => pulsarContinuarMapfre(a.page, a.guard, 'datosBasicos'), EmisionBloqueadaError)
  assert.equal(await a.page.evaluate(() => (window as unknown as { __emitido?: number }).__emitido ?? null), null, 'no se pulsó')
  for (const t of ['Contratar', 'Emitir', 'Formalizar', 'Grabar póliza', 'Continuar y contratar']) {
    const b = await preparar(STEPPER(0, { boton: `<button onclick="window.__pulsado=1">${t}</button>` }))
    await assert.rejects(() => pulsarContinuarMapfre(b.page, b.guard, 'datosBasicos'), (e) => e instanceof ErrorMapaGuardMapfre || e instanceof EmisionBloqueadaError, t)
    assert.equal(await b.page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? null), null, `«${t}» no se pulsa`)
  }
})

test('sin stepper reconocible o con dos «Continuar» → hueco con inventario, sin pulsar', async () => {
  const a = await preparar('<div class="pie"><button onclick="window.__clics=1">Continuar</button></div>')
  await assert.rejects(() => pulsarContinuarMapfre(a.page, a.guard, 'datosBasicos'), (e) => e instanceof ErrorMapaGuardMapfre && pideInventarioDom(e))
  assert.equal(await clics(a.page), 0)
  const b = await preparar(STEPPER(0, { extra: '<button onclick="window.__clics=9">Continuar</button>' }))
  await assert.rejects(() => pulsarContinuarMapfre(b.page, b.guard, 'datosBasicos'), (e) => e instanceof ErrorMapaGuardMapfre && pideInventarioDom(e))
  assert.equal(await clics(b.page), 0)
})

test('con un diálogo abierto o un campo de cuenta bancaria visible → no se pulsa', async () => {
  const a = await preparar(STEPPER(0, { extra: '<div role="dialog">Aviso</div>' }))
  await assert.rejects(() => pulsarContinuarMapfre(a.page, a.guard, 'datosBasicos'), /diálogo abierto/)
  assert.equal(await clics(a.page), 0)
  const b = await preparar(STEPPER(0, { extra: '<label for="iban">IBAN</label><input id="iban" name="iban">' }))
  await assert.rejects(() => pulsarContinuarMapfre(b.page, b.guard, 'datosBasicos'), ErrorFronteraEmision)
  assert.equal(await clics(b.page), 0)
})
