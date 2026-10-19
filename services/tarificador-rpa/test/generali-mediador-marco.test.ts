// Generali v0.2.2 (prueba real b41be722, 19/10/2026): «Seleccionar mediador» vive en un MARCO de Genernet
// (`/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do`) dentro de `CorredorInicio.po`, con 5 campos SIN etiqueta,
// y el portal hace el bucle CorredorInicio → seleccionAmbito → seleccionAmbitoRefresh. El desplegable se identifica por la
// OPCIÓN del mediador (en todos los marcos) y el botón de ese marco solo lo pulsa la puerta del guard (lista blanca exacta).
// Portal SINTÉTICO servido por la prueba (sin red).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import {
  MEDIADOR_GENERALI,
  decidirMediadorGenerali,
  inventarioMediadorGenerali,
  opcionSinDatosGenerali,
  type ControlMediador,
} from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, elegirMediadorGenerali } from '../src/adapters/generali/auto.ts'
import { botonMediadorGeneraliPermitido, ErrorMapaGuardGenerali, instalarGuardEmision, pulsarMediadorGenerali, rutaMediadorGenerali, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'
import { PRUEBAS_HUMO } from '../src/humo.ts'

// ───────────────────────── puras ─────────────────────────

const ctl = (opciones: [string, string][], sel: number | null = null, nativo = true): ControlMediador => ({
  tipo: nativo ? 'select' : 'listbox',
  name: 'x',
  id: '',
  nativo,
  indiceSelect: nativo ? 0 : -1,
  opciones: opciones.map(([valor, texto]) => ({ valor, texto })),
  seleccionada: sel === null ? null : { valor: opciones[sel]![0], texto: opciones[sel]![1] },
})

test('decidir: el único control (en cualquier marco) con la opción del mediador; puesto si ya está elegida', () => {
  const territorial = ctl([['08', '08 - SUROESTE/CANARIAS']], 0)
  const med = ctl([['', 'Seleccionar...'], ['11111', '11111 - OTRO'], [MEDIADOR_GENERALI, `${MEDIADOR_GENERALI} - CORREDURIA`]], 0)
  const r = decidirMediadorGenerali([{ ruta: 'a', controles: [] }, { ruta: 'b', controles: [territorial, med] }])
  assert.deepEqual(r, { tipo: 'unica', marco: 1, control: 1, indice: 2, nativo: true, puesto: false })
  const puesto = decidirMediadorGenerali([{ ruta: 'b', controles: [{ ...med, seleccionada: med.opciones[2]! }] }])
  assert.equal(puesto.tipo === 'unica' && puesto.puesto, true)
  assert.deepEqual(decidirMediadorGenerali([{ ruta: 'b', controles: [territorial] }]), { tipo: 'ninguna' })
  assert.deepEqual(decidirMediadorGenerali([{ ruta: 'a', controles: [med] }, { ruta: 'b', controles: [med] }]), { tipo: 'varias', n: 2 }, 'dos marcos con la opción → no se elige')
  assert.deepEqual(decidirMediadorGenerali([{ ruta: 'a', controles: [ctl([[MEDIADOR_GENERALI, 'A'], ['z', `${MEDIADOR_GENERALI} - B`]])] }]), { tipo: 'varias', n: 2 })
  const aria = decidirMediadorGenerali([{ ruta: 'a', controles: [ctl([['', `${MEDIADOR_GENERALI} - X`]], null, false)] }])
  assert.equal(aria.tipo === 'unica' && aria.nativo, false, 'un listbox ARIA se reconoce pero no es nativo')
})

test('inventario: tipo, name/id, nº de opciones y textos SIN datos personales (solo códigos y marcadores)', () => {
  assert.equal(opcionSinDatosGenerali('65792 - JUAN PÉREZ GARCÍA'), '65792 - …')
  assert.equal(opcionSinDatosGenerali('Seleccionar...'), 'Seleccionar...')
  assert.equal(opcionSinDatosGenerali('475'), '475')
  assert.equal(opcionSinDatosGenerali('María López'), '[texto]')
  const inv = inventarioMediadorGenerali([
    { ruta: 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po', controles: [] },
    { ruta: 'https://www.generali.es/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do', controles: [{ ...ctl([['', 'Seleccionar...'], ['1', '11111 - JUAN PÉREZ'], ['2', 'María López']]), name: 'mediador', id: 'cmbMed' }] },
  ])
  assert.match(inv, /seleccionAmbito\.do: select name=mediador id=cmbMed \(3 opciones: Seleccionar\.\.\. \| 11111 - … \| \[texto\]\)/)
  assert.ok(!/JUAN|PÉREZ|María|López/.test(inv), 'ningún nombre en el inventario')
  assert.ok(!/CorredorInicio/.test(inv), 'un marco sin campos no se lista')
})

test('guard puro: lista blanca EXACTA del botón y rutas exactas de www.generali.es', () => {
  for (const t of ['ACEPTAR', 'Aceptar', ' aceptar ', 'Continuar', 'CONTINUAR']) assert.equal(botonMediadorGeneraliPermitido(t), true, t)
  for (const t of ['Aceptar y emitir', 'EMITIR', 'Contratar', 'Grabar', 'Firmar', 'Pagar', 'Aceptar póliza', 'Seguir', '', null]) assert.equal(botonMediadorGeneraliPermitido(t), false, String(t))
  assert.equal(rutaMediadorGenerali('https://www.generali.es/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do?x=1'), true)
  assert.equal(rutaMediadorGenerali('https://www.generali.es/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbitoRefresh.do'), true)
  assert.equal(rutaMediadorGenerali('https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'), true)
  assert.equal(rutaMediadorGenerali('https://www.generali.es/age3k/red_agendaComercialFormWeb/mediador/emitir.do'), false)
  assert.equal(rutaMediadorGenerali('https://evil.example/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do'), false)
})

// ───────────────────────── con navegador ─────────────────────────

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

const ORIGEN = 'https://www.generali.es'
const INICIO = `${ORIGEN}/arq_genernetPortalFormWeb/CorredorInicio.po`
const RUTA_AMBITO = '/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbito.do'
const RUTA_REFRESH = '/age3k/red_agendaComercialFormWeb/mediador/seleccionAmbitoRefresh.do'

/** Los 5 campos SIN etiqueta del marco (como en la prueba real). `boton`: el HTML del botón. */
const CAMPOS = (opcionesMediador: string, boton: string) => `<h3>SELECCIONAR MEDIADOR</h3>
  <select name="territorial"><option>08 - SUROESTE/CANARIAS</option></select>
  <select name="sucursal"><option>475 - OPERACIONES SUROESTE CANARIAS</option></select>
  <select name="centro"><option>380 - OV OPERACIONES SUROESTE/CANA</option></select>
  <select name="comercial"><option>50B - SG DIGITAL C.</option></select>
  <select name="mediador" onchange="location.href='${RUTA_REFRESH}?m='+this.value"><option value="">Seleccionar...</option>${opcionesMediador}</select>
  ${boton}`

type Portal = { page: Page; guard: GuardEmision; cerrar: () => Promise<void>; peticiones: string[] }

/**
 * Portal sintético: `CorredorInicio.po` con un iframe a `seleccionAmbito.do`, que a los 300 ms se recarga como
 * `seleccionAmbitoRefresh.do` (el bucle de la prueba real). Al elegir el mediador el marco se recarga con `?m=<código>` y
 * vuelve con él puesto. El botón lleva a `CorredorPortal.po?mediatorCode=<código>`.
 */
async function abrirPortal(opcionesMediador: string, boton: string): Promise<Portal> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  const peticiones: string[] = []
  await page.route(`${ORIGEN}/**`, (r) => {
    const u = new URL(r.request().url())
    peticiones.push(u.pathname)
    const html = (b: string) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${b}</body></html>` })
    if (u.pathname === '/arq_genernetPortalFormWeb/CorredorInicio.po') return html(`<h1>PORTAL DEL CORREDOR</h1><iframe id="genernet" src="${RUTA_AMBITO}" style="width:900px;height:500px"></iframe>`)
    if (u.pathname === RUTA_AMBITO) return html(`<p>Genernet</p><script>setTimeout(() => location.replace('${RUTA_REFRESH}'), 300)</script>`)
    if (u.pathname === RUTA_REFRESH) {
      const m = u.searchParams.get('m') ?? ''
      const sel = m ? `<script>document.querySelector('select[name=mediador]').value=${JSON.stringify(m)}</script>` : ''
      return html(CAMPOS(opcionesMediador, boton) + sel)
    }
    if (u.pathname === '/arq_genernetPortalFormWeb/CorredorPortal.po') return html('<h1>Portal del Corredor</h1><nav><span>NEGOCIO</span></nav>')
    return html('otra')
  })
  await page.goto(INICIO)
  return { page, guard, peticiones, cerrar: () => context.close() }
}

const OPS_OK = `<option value="11111">11111 - JUAN PÉREZ</option><option value="${MEDIADOR_GENERALI}">${MEDIADOR_GENERALI} - CORREDURIA PRUEBA</option>`
const BOTON_OK = `<input type="button" value="Aceptar" onclick="window.__pulsado=(window.__pulsado||0)+1; top.location.href='/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}'">`

const ctxCon = (page: Page, guard: GuardEmision, llamadas: string[]) =>
  ({
    pausaAccion: async () => {},
    confirmarMediadorGenerali: async (s: Parameters<NonNullable<ContextoPortal['confirmarMediadorGenerali']>>[0]) => {
      llamadas.push('puerta')
      await pulsarMediadorGenerali(page, guard, s)
    },
  }) as unknown as ContextoPortal

const marcoAmbito = (page: Page): Frame | undefined => page.frames().find((f) => f.url().includes('seleccionAmbito'))

test('marco sin etiquetas: tolera el bucle, elige 65792 por la OPCIÓN, el guard pulsa «Aceptar» del marco y llega al portal', async () => {
  const p = await abrirPortal(OPS_OK, BOTON_OK)
  try {
    const llamadas: string[] = []
    await elegirMediadorGenerali(p.page, ctxCon(p.page, p.guard, llamadas), { esperaMs: 8_000, pausaMs: 200 })
    assert.deepEqual(llamadas, ['puerta'], 'el botón solo por la puerta del guard, una vez')
    assert.match(p.page.url(), new RegExp(`CorredorPortal\\.po\\?mediatorCode=${MEDIADOR_GENERALI}$`))
    assert.ok(p.peticiones.includes(RUTA_REFRESH), 'pasó por el bucle seleccionAmbito → Refresh')
    assert.equal(p.guard.violacion(), null)
  } finally {
    await p.cerrar()
  }
})

test('marco sin la opción del mediador → PARA con inventario de los 5 campos (sin nombres) y sin pulsar nada', async () => {
  const p = await abrirPortal('<option value="11111">11111 - JUAN PÉREZ</option>', BOTON_OK)
  try {
    const llamadas: string[] = []
    await assert.rejects(elegirMediadorGenerali(p.page, ctxCon(p.page, p.guard, llamadas), { esperaMs: 1_500, pausaMs: 150 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /faltan el desplegable «Mediador»/)
      assert.match(e.message, /no aparece/)
      assert.match(e.message, /seleccionAmbitoRefresh\.do: select name=territorial/)
      for (const n of ['territorial', 'sucursal', 'centro', 'comercial', 'mediador']) assert.match(e.message, new RegExp(`select name=${n} `))
      assert.match(e.message, /select name=mediador id=- \(2 opciones: Seleccionar\.\.\. \| 11111 - …\)/)
      assert.ok(!/JUAN|PÉREZ/.test(e.message), 'sin nombres de mediadores')
      return true
    })
    assert.deepEqual(llamadas, [])
    assert.equal(await marcoAmbito(p.page)!.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0)
  } finally {
    await p.cerrar()
  }
})

test('dos desplegables con la opción del mediador → PARA (varias) con inventario, sin elegir ni pulsar', async () => {
  const doble = `<option value="${MEDIADOR_GENERALI}">${MEDIADOR_GENERALI} - A</option></select><select name="otro"><option value="${MEDIADOR_GENERALI}">${MEDIADOR_GENERALI} - B</option>`
  const p = await abrirPortal(doble, BOTON_OK)
  try {
    const llamadas: string[] = []
    await assert.rejects(elegirMediadorGenerali(p.page, ctxCon(p.page, p.guard, llamadas), { esperaMs: 4_000, pausaMs: 200 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /2 opciones\/desplegables casan/.test(e.message) && /select name=otro/.test(e.message))
    assert.deepEqual(llamadas, [])
    assert.equal(await marcoAmbito(p.page)!.locator('select[name=mediador]').inputValue(), '', 'no se eligió nada')
  } finally {
    await p.cerrar()
  }
})

test('guard: un botón del marco que no está en la lista blanca (o lleva «emitir» en el onclick) NO se pulsa', async () => {
  for (const boton of [
    `<button onclick="window.__pulsado=1">Emitir</button>`,
    `<input type="button" value="Aceptar" onclick="emitirPoliza(); window.__pulsado=1">`,
    `<input type="button" value="Aceptar" onclick="window.__pulsado=1"><button onclick="window.__pulsado=1">Continuar</button>`,
  ]) {
    const p = await abrirPortal(OPS_OK, boton)
    try {
      await assert.rejects(elegirMediadorGenerali(p.page, ctxCon(p.page, p.guard, []), { esperaMs: 6_000, pausaMs: 200 }), (e: unknown) => e instanceof EmisionBloqueadaError || e instanceof ErrorMapaGuardGenerali, boton)
      assert.equal(await marcoAmbito(p.page)!.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0, boton)
    } finally {
      await p.cerrar()
    }
  }
})

test('guard: un desplegable con el mediador en un marco de OTRA ruta no se confirma', async () => {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.route(`${ORIGEN}/**`, (r) => {
    const u = new URL(r.request().url())
    // Sin `onchange` (el marco no navega a una ruta permitida al elegir): la página se queda en `/otra/cosa.do`.
    const body = u.pathname.endsWith('CorredorInicio.po') ? '<iframe src="/otra/cosa.do"></iframe>' : CAMPOS(OPS_OK, BOTON_OK).replace(/onchange="[^"]*"/, '')
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><body>${body}</body>` })
  })
  try {
    await page.goto(INICIO)
    await page.waitForTimeout(300)
    const f = page.frames().find((x) => x.url().includes('/otra/cosa.do'))!
    const sel = f.locator('select[name=mediador]')
    await sel.selectOption(MEDIADOR_GENERALI)
    await assert.rejects(pulsarMediadorGenerali(page, guard, sel), (e: unknown) => e instanceof ErrorMapaGuardGenerali && /ruta fuera de la lista/.test(e.message))
    assert.equal(await f.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0)
  } finally {
    await context.close()
  }
})

test('humo nocturno de Generali: usa el MISMO paso (marcos) y la puerta del guard; llega al menú «NEGOCIO»', async () => {
  const p = await abrirPortal(OPS_OK, BOTON_OK)
  try {
    await PRUEBAS_HUMO['generali/auto']!.menu(p.page, p.guard)
    assert.match(p.page.url(), /CorredorPortal\.po\?mediatorCode=/)
    assert.equal(p.guard.violacion(), null)
  } finally {
    await p.cerrar()
  }
})
