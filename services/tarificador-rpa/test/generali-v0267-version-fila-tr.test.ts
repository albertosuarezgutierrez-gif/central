// Generali Turismos v0.2.67 (02/11/2026, trabajo f84801ce). Dos fallos tras ampliar con «Otras versiones ...»:
//  1) la puerta del `tr[data-label]` del panel de «Versión» comparaba el texto de TODA la fila («<versión>\t5P\t<fecha>») con el data-label y,
//     al no ser iguales, abortaba como emisión (falso positivo). Ahora la identidad de una FILA se mira en su primera celda; `comprobarBoton`
//     sigue viendo la fila ENTERA, sus atributos y ancestros.
//  2) se eligió a ciegas una versión de OTRA generación (lanzada en 2014 para un coche de 2005). La fecha de lanzamiento del panel excluye las
//     versiones posteriores al vehículo; si no queda ninguna compatible → requiere_humano con la lista.
// Fixtures SINTÉTICAS (solo catálogo: textos de versión, puertas y fechas de lanzamiento inventados con la forma real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, decidirVersionDesplegableGenerali, detallesPanelVersionGenerali } from '../src/adapters/generali/auto.ts'
import { detalleFilaPanelVersionGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import { abrirDesplegableModeloGenerali, abrirDesplegableVersionGenerali, elegirVersionListaGenerali, instalarGuardEmision, type GuardEmision } from '../src/guard.ts'

test('v0.2.67 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.69'))

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
after(async () => { await browser?.close() })

const SEL_VEHICULOS = 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo'

async function abrir(html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.request().url().startsWith(SEL_VEHICULOS) ? `<!doctype html><body>${html}</body>` : '<body>otra</body>' }))
  await page.goto(SEL_VEHICULOS)
  return { page, guard, cerrar: () => context.close() }
}

type Fila = { label: string; celdas: [string, string, string]; attrs?: string }
/** Panel de «Versión» como el real (`table.ui-selectonemenu-table`, filas `tr[data-label]` con Versión | Puertas | F. lanzamiento). */
const PANEL = (filas: Fila[]) => `<span>Modelo</span><div id="selmodelo"><div class="ui-selectonemenu-trigger">v</div></div>
  <span>Versión</span>
  <div id="buscaversion" role="combobox" tabindex="0"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="buscaversion_input"><option value="">Seleccione una</option>${filas.map((f, i) => `<option value="${i}">${f.label}</option>`).join('')}</select></div><label id="buscaversion_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger" onclick="document.getElementById('buscaversion_panel').style.display='block'"><span class="ui-icon">v</span></div></div>
  <div id="buscaversion_panel" style="display:none"><div class="ui-selectonemenu-items-wrapper"><table class="ui-selectonemenu-items ui-selectonemenu-table"><tbody>
  <tr class="ui-selectonemenu-item ui-selectonemenu-row" data-label="Seleccione una" id="buscaversion_0"><td colspan="3">Seleccione una</td></tr>
  ${filas.map((f, i) => `<tr class="ui-selectonemenu-item ui-selectonemenu-row" data-label="${f.label}" id="buscaversion_${i + 1}" ${f.attrs ?? ''} onclick="window.__pulsada=(window.__pulsada||[]).concat(${i})"><td>${f.celdas[0]}</td><td>${f.celdas[1]}</td><td>${f.celdas[2]}</td></tr>`).join('')}
  </tbody></table></div></div>`

/** Abre el desplegable de versión (el de modelo se registra antes, como en el flujo real) y pulsa `texto`. */
async function pulsarVersion(filas: Fila[], texto: string): Promise<{ error: unknown; pulsada: unknown }> {
  const a = await abrir(PANEL(filas))
  try {
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await abrirDesplegableVersionGenerali(a.page, a.guard, 'buscaversion')
    let error: unknown = null
    try {
      await elegirVersionListaGenerali(a.page, a.guard, 'buscaversion', texto)
    } catch (e) {
      error = e
    }
    return { error, pulsada: await a.page.evaluate(() => (window as unknown as { __pulsada?: number[] }).__pulsada ?? null) }
  } finally {
    await a.cerrar()
  }
}

// ───────────── 1) guard: identidad de la fila por su primera celda; el patrón de emisión NO se relaja ─────────────

test('v0.2.67 · guard: la fila «52 | 5P | 2014-10-01» del panel de versiones se pulsa (antes: «guard_emision: boton bloqueada»)', async () => {
  const r = await pulsarVersion([{ label: '52', celdas: ['52', '5P', '2014-10-01'] }, { label: '1.1 PURE', celdas: ['1.1 PURE', '5P', '2004-04-01'] }], '52')
  assert.equal(r.error, null, String(r.error))
  assert.deepEqual(r.pulsada, [0])
})

test('v0.2.67 · guard: una fila cuyo TEXTO dice Emitir/Contratar/Confirmar póliza/Pagar sigue bloqueada (aunque la 1ª celda sea el data-label)', async () => {
  for (const malo of ['Emitir', 'Contratar', 'Confirmar póliza', 'Pagar', 'Emisión']) {
    const r = await pulsarVersion([{ label: '52', celdas: ['52', '5P', malo] }], '52')
    assert.ok(r.error instanceof EmisionBloqueadaError, `${malo}: ${String(r.error)}`)
    assert.equal(r.pulsada, null, malo)
  }
})

test('v0.2.67 · guard: una fila cuyo ATRIBUTO (id, onclick, title) nombra emitir/contratar/pagar sigue bloqueada', async () => {
  for (const attrs of ['title="Emitir póliza"', 'aria-label="Contratar"', 'data-x="1" onmousedown="emitirPoliza()" title="Pagar"']) {
    const r = await pulsarVersion([{ label: '52', celdas: ['52', '5P', '2014-10-01'], attrs }], '52')
    assert.ok(r.error instanceof EmisionBloqueadaError, `${attrs}: ${String(r.error)}`)
    assert.equal(r.pulsada, null, attrs)
  }
})

test('v0.2.67 · guard: la 1ª celda tiene que ser EXACTAMENTE el data-label (otra versión en la celda → no se pulsa)', async () => {
  const r = await pulsarVersion([{ label: '52', celdas: ['66 PRIME', '5P', '2014-10-01'] }], '52')
  assert.ok(r.error instanceof EmisionBloqueadaError, String(r.error))
  assert.equal(r.pulsada, null)
})

test('v0.2.67 · guard: un `li` sigue comparando su texto ENTERO (sin cambio)', async () => {
  const a = await abrir(`<div id="selmodelo"><div class="ui-selectonemenu-trigger">v</div></div><div id="buscaversion"><select id="buscaversion_input"><option>52</option></select><div class="ui-selectonemenu-trigger" onclick="document.getElementById('buscaversion_panel').style.display='block'">v</div></div>
    <div id="buscaversion_panel" style="display:none"><ul><li data-label="52" onclick="window.__pulsada=1">52 Contratar</li></ul></div>`)
  try {
    await abrirDesplegableModeloGenerali(a.page, a.guard, 'selmodelo')
    await abrirDesplegableVersionGenerali(a.page, a.guard, 'buscaversion')
    await assert.rejects(elegirVersionListaGenerali(a.page, a.guard, 'buscaversion', '52'), EmisionBloqueadaError)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __pulsada?: number }).__pulsada ?? null), null)
  } finally {
    await a.cerrar()
  }
})

// ───────────── 2) elección de versión: la fecha de lanzamiento excluye otra generación ─────────────

type Form = Pick<FormularioAuto, 'eleccionVersion' | 'seleccionVehiculo' | 'vehiculoConfirmado' | 'fechaMatriculacion' | 'vehiculoReferencia'>
const REF = { origen: 'humano', marca: 'SMART', modelo: 'Forfour', version: 'Pure 1.1', carroceria: null, puertas: 5, cc: 1124, cv: 75, combustible: 'gasolina', anio: 2005 } as unknown as FormularioAuto['vehiculoReferencia']
const form = (extra: Partial<Form> = {}): Form => ({ vehiculoReferencia: REF, ...extra }) as Form
/** Lista ampliada sintética con la forma real: versiones de la generación nueva (2014) y, opcionalmente, de la de 2004. */
const NUEVA: Fila[] = [
  { label: '52', celdas: ['52', '5P', '2014-10-01'] },
  { label: '52 PASSION', celdas: ['52 PASSION', '5P', '2014-10-01'] },
  { label: '66 PRIME', celdas: ['66 PRIME', '5P', '2015-01-01'] },
  { label: 'ELECTRIC DRIVE EQ', celdas: ['ELECTRIC DRIVE EQ', '5P', '2017-03-01'] },
]
const VIEJA: Fila[] = [
  { label: '1.1 PURE', celdas: ['1.1 PURE', '5P', '2004-04-01'] },
  { label: '1.3 PASSION', celdas: ['1.3 PASSION', '5P', '2004-04-01'] },
  { label: '1.5 CDI PULSE', celdas: ['1.5 CDI PULSE', '5P', '2004-09-01'] },
]
const opciones = (fs: Fila[]) => ['Seleccione una', ...fs.map((f) => f.label)]
const detalles = (fs: Fila[]) => [null, ...fs.map((f) => detalleFilaPanelVersionGenerali(f.celdas))]

test('v0.2.67 · detalle de una fila del panel: puertas y año de lanzamiento (ISO o dd/mm/aaaa); sin dato → null', () => {
  assert.deepEqual(detalleFilaPanelVersionGenerali(['52', '5P', '2014-10-01']), { puertas: 5, anioLanzamiento: 2014 })
  assert.deepEqual(detalleFilaPanelVersionGenerali(['1.1 PURE', '3P', '01/04/2004']), { puertas: 3, anioLanzamiento: 2004 })
  assert.deepEqual(detalleFilaPanelVersionGenerali(['Otras versiones ...', '', '']), { puertas: null, anioLanzamiento: null })
  assert.deepEqual(detalleFilaPanelVersionGenerali(['X', '5P', '[DATO]']), { puertas: 5, anioLanzamiento: null })
})

test('v0.2.67 · el panel real se lee por filas (Versión | Puertas | F. lanzamiento)', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<body>${PANEL([...NUEVA, ...VIEJA])}</body>`)
    const d = await detallesPanelVersionGenerali(page, 'buscaversion')
    assert.deepEqual(d.get('52'), { puertas: 5, anioLanzamiento: 2014 })
    assert.deepEqual(d.get('1.1 PURE'), { puertas: 5, anioLanzamiento: 2004 })
  } finally {
    await page.close()
  }
})

/** Sin el filtro por fecha, esto elegía la generación nueva: con combustible conocido y sin CV, «la primera de las compatibles». */
const GASOLINA_SIN_CV = { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SMART FORFOUR', cv: null, cc: null, puertas: 5, fechaInicio: null, combustible: 'gasolina' } as unknown as Form['vehiculoConfirmado'] }
/** Generación nueva con palabras que la referencia comparte («PURE»): sin el filtro, la similitud la elegiría. */
const NUEVA_PURE: Fila[] = [
  { label: '1.0 PURE', celdas: ['1.0 PURE', '5P', '2014-10-01'] },
  { label: '0.9 PASSION', celdas: ['0.9 PASSION', '5P', '2014-10-01'] },
]

test('v0.2.68 · f84801ce: lista ampliada SOLO de la generación 2014+ para un coche de 2005 → se elige la más parecida y se avisa de la generación posterior (antes requiere_humano)', () => {
  for (const [que, f] of [['referencia', form()], ['gasolina sin CV', form(GASOLINA_SIN_CV)]] as const) {
    const d = decidirVersionDesplegableGenerali(opciones(NUEVA), f, [], { ampliada: true, detalles: detalles(NUEVA) })
    assert.ok(NUEVA.some((x) => x.label === opciones(NUEVA)[d.indice]), que)
    assert.match(d.supuesto ?? '', /Versión de generación posterior a la del vehículo \(lanzada 20\d\d\)/, que)
    assert.match(d.supuesto ?? '', /se confirma al aceptar el cliente/, que)
    assert.match(d.supuesto ?? '', /supuesto/, que)
  }
  const p = decidirVersionDesplegableGenerali(opciones(NUEVA_PURE), form(), [], { ampliada: true, detalles: detalles(NUEVA_PURE) })
  assert.match(p.supuesto ?? '', /generación posterior/, 'ya no para: elige y avisa')
  // sin referencia ni elección no se elige a ciegas
  assert.throws(() => decidirVersionDesplegableGenerali(opciones(NUEVA), { ...form(), vehiculoReferencia: undefined }, [], { ampliada: true, detalles: detalles(NUEVA) }), ErrorEleccionVersion)
})

test('v0.2.67 · con la generación correcta en la lista ampliada: elige una de 2004, nunca una de 2014', () => {
  const fs = [...NUEVA, ...NUEVA_PURE, ...VIEJA]
  const d = decidirVersionDesplegableGenerali(opciones(fs), form(), [], { ampliada: true, detalles: detalles(fs) })
  assert.equal(opciones(fs)[d.indice], '1.1 PURE')
  assert.ok(d.supuesto && /supuesto/.test(d.supuesto), String(d.supuesto))
  const g = decidirVersionDesplegableGenerali(opciones(fs), form(GASOLINA_SIN_CV), [], { ampliada: true, detalles: detalles(fs) })
  assert.ok(VIEJA.some((v) => v.label === opciones(fs)[g.indice]), `gasolina sin CV eligió «${opciones(fs)[g.indice]}»`)
})

test('v0.2.67 · la fecha de matriculación también acota (versión lanzada después de matricular = imposible)', () => {
  const sinAnio = { ...(REF as object), anio: null } as unknown as FormularioAuto['vehiculoReferencia']
  // 0.2.68: si todas son posteriores se elige la más parecida con aviso de generación posterior (ya no requiere_humano)
  assert.match(decidirVersionDesplegableGenerali(opciones(NUEVA_PURE), form({ vehiculoReferencia: sinAnio, fechaMatriculacion: '2005-06-01' }), [], { ampliada: true, detalles: detalles(NUEVA_PURE) }).supuesto ?? '', /generación posterior/)
  // y un año de tolerancia sobre la referencia (año-modelo): lanzada en 2006 para una referencia de 2005 sigue en juego
  const r2006: Fila[] = [{ label: '1.1 PURE', celdas: ['1.1 PURE', '5P', '2006-01-01'] }, { label: '1.0 PURE', celdas: ['1.0 PURE', '5P', '2014-10-01'] }]
  assert.equal(opciones(r2006)[decidirVersionDesplegableGenerali(opciones(r2006), form(), [], { ampliada: true, detalles: detalles(r2006) }).indice], '1.1 PURE')
})

test('v0.2.67 · 1ª ronda: si todo lo visible es de una generación posterior, se amplía con «Otras versiones ...» (no se elige)', () => {
  const fs = [...NUEVA_PURE, { label: 'Otras versiones ...', celdas: ['Otras versiones ...', '', ''] as [string, string, string] }]
  const d = decidirVersionDesplegableGenerali(opciones(fs), form(), [], { detalles: detalles(fs) })
  assert.equal(d.otras, true)
})

test('v0.2.67 · sin año conocido (ni referencia ni matriculación) o sin detalles del panel: la decisión no cambia', () => {
  const sinAnio = { ...(REF as object), anio: null } as unknown as FormularioAuto['vehiculoReferencia']
  const fs = [...NUEVA, ...VIEJA]
  const a = decidirVersionDesplegableGenerali(opciones(fs), form({ vehiculoReferencia: sinAnio }), [], { ampliada: true, detalles: detalles(fs) })
  const b = decidirVersionDesplegableGenerali(opciones(fs), form({ vehiculoReferencia: sinAnio }), [], { ampliada: true })
  assert.equal(a.indice, b.indice)
})

test('v0.2.67 · la elección de una persona manda aunque la fecha no case (es su decisión)', () => {
  const d = decidirVersionDesplegableGenerali(opciones(NUEVA), form({ eleccionVersion: { codigo: null, etiqueta: '52 PASSION' } }), [], { ampliada: true, detalles: detalles(NUEVA) })
  assert.equal(opciones(NUEVA)[d.indice], '52 PASSION')
})
