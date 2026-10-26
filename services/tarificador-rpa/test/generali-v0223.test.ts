// Generali Turismos v0.2.23 (25/10/2026, prueba real con 0.2.22): «Personas» no abre ventana, el marco NAVEGA en el sitio a «Interesado / Tomador» (con pestañas
// «Selección personas que intervienen» / «Datos personas», sin «Buscar») y el inventario solo contaba marcos nuevos («sin controles visibles»).
// Fixtures SINTÉTICAS (ningún dato real). Servidor simulado por `context.route`: contadores de «Confirmar» y «Alta» (deben quedar a 0).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright'
import { MEDIADOR_GENERALI, RE_PESTANA_SELECCION_PERSONAS_GENERALI, indiceMarcosGenerali, normalizarRotuloGenerali, urlSinDatosGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, elegirPersonaTomadorGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const NIF = '00000000T'
const FORM = { documentoTomador: NIF, datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' }, conductor: { fechaCarne: '2000-06-01' } }
const ESPERAS = { abrirMs: 4_000, resultadosMs: 2_500, vueltaMs: 2_000 }
const BASE = 'https://www.generali.es/emi_genAutosFormWeb/'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=' + MEDIADOR_GENERALI

test('v0.2.23 · versión (vigente 0.2.26)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.26'))

test('v0.2.23 · puras: URL sin datos, pestaña y índice de marcos', () => {
  assert.equal(urlSinDatosGenerali('https://www.generali.es/mot_motorWeb/mvc/selVehiculo;jsessionid=ABC123:1x?nif=00000000T#x'), 'www.generali.es/mot_motorWeb/mvc/selVehiculo')
  assert.equal(urlSinDatosGenerali('about:blank'), 'about:blank')
  assert.ok(!urlSinDatosGenerali(`https://www.generali.es/a.do?documento=${NIF}`).includes(NIF))
  assert.ok(RE_PESTANA_SELECCION_PERSONAS_GENERALI.test(normalizarRotuloGenerali('Selección personas que intervienen')))
  assert.ok(!RE_PESTANA_SELECCION_PERSONAS_GENERALI.test(normalizarRotuloGenerali('Datos personas')))
  const i = indiceMarcosGenerali([
    { rama: 'marco', url: `https://www.generali.es/x.do?n=${NIF}`, nombre: 'mainFrame', controles: 13 },
    { rama: 'capa', url: 'https://player.vimeo.com/video/1', nombre: 'video0', controles: 9 },
  ])
  assert.match(i, /marco x\.do#mainFrame \(13\)/)
  assert.ok(!i.includes(NIF) && !/vimeo/.test(i))
})

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

type Estado = { elegido: boolean; confirmar: number; alta: number }
type Opciones = { conPestana?: boolean; filas?: string[]; retrasoDatosMs?: number; buscadorEnIframe?: boolean }

/** Formulario del vehículo: interesado readonly y vacío (o relleno tras elegir) + «Personas», que NAVEGA el propio marco. */
const vehiculo = (e: Estado) => `<input id="${P}roles_lnkPers" type="button" value="Personas" onclick="window.__pulsado=(window.__pulsado||0)+1;location.href='${BASE}Datos.do'">
  <input id="${P}interesado_nifcif" type="text" readonly value="${e.elegido ? NIF : ''}"><input id="${P}interesado_nombre" type="text" readonly value="${e.elegido ? 'ANA PEREZ GIL' : ''}">`

const fila = (nif: string) => `<tr><td>${nif}</td><td>ANA PEREZ GIL</td><td><input type='button' value='Seleccionar' onclick='location.href="${BASE}Volver.do"'></td></tr>`
/** Pantalla «Interesado / Tomador» de la prueba real: tipo de documento, NIF, nombre, «Cancelar»/«Confirmar» y pestañas; SIN «Buscar». */
const datos = (o: Opciones) => `<a href="#" onclick="document.getElementById('sel').style.display='block';return false">${o.conPestana === false ? 'Otra cosa' : 'Selección personas que intervienen'}</a><a href="#">Datos personas</a>
  <select id="personas_intere_ynidcl"><option>Persona física con NIF/NIE/Pasaporte</option></select>
  <input id="personas_intere_nifcif" type="text"><input id="personas_intere_nombre" type="text">
  <input id="cancelar" type="button" value="Cancelar"><input id="confirmar" type="button" value="Confirmar" onclick="location.href='${BASE}Confirmar.do'">
  <div id="sel" style="display:none"><label for="doc">NIF/CIF</label><input id="doc" type="text">
    <input type="button" value="Buscar" onclick="buscar()">
    <input type="button" value="Alta de persona" onclick="location.href='${BASE}Alta.do'"><div id="res"></div></div>
  <script>function buscar(){setTimeout(function(){document.getElementById('res').innerHTML=${JSON.stringify(`<table><tr><th>Documento</th><th>Nombre</th><th></th></tr>${(o.filas ?? [fila(NIF)]).join('')}</table>`).replace(/<\//g, '<\\/')}},100)}</script>`

async function abrir(o: Opciones = {}): Promise<{ page: Page; marco: Frame; context: BrowserContext; guard: GuardEmision; estado: Estado; cerrar: () => Promise<void> }> {
  const estado: Estado = { elegido: false, confirmar: 0, alta: 0 }
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    let cuerpo = 'otra'
    if (u.startsWith(PORTAL.split('?')[0]!)) cuerpo = `<iframe name="areaTrabajo" src="${BASE}Area.do" style="width:900px;height:600px"></iframe>`
    else if (u.startsWith(`${BASE}Area.do`)) cuerpo = `<iframe name="mainFrame" src="${BASE}Vehiculo.do" style="width:800px;height:500px"></iframe>`
    else if (u.startsWith(`${BASE}Vehiculo.do`)) cuerpo = vehiculo(estado)
    else if (u.startsWith(`${BASE}Datos.do`)) {
      if (o.retrasoDatosMs) await new Promise((x) => setTimeout(x, o.retrasoDatosMs))
      cuerpo = datos(o)
    } else if (u.startsWith(`${BASE}Volver.do`)) {
      estado.elegido = true
      cuerpo = vehiculo(estado)
    } else if (u.startsWith(`${BASE}Confirmar.do`)) estado.confirmar++
    else if (u.startsWith(`${BASE}Alta.do`)) estado.alta++
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  let marco: Frame | undefined
  for (let i = 0; i < 40 && !marco; i++) {
    marco = page.frames().find((f) => f.name() === 'mainFrame')
    if (marco && (await marco.locator(`[id="${P}roles_lnkPers"]`).count()) === 0) marco = undefined
    if (!marco) await new Promise((x) => setTimeout(x, 100))
  }
  assert.ok(marco, 'el marco de pruebas no cargó')
  return { page, marco: marco!, context, guard, estado, cerrar: () => context.close() }
}
const ctxDe = (guard: GuardEmision) => ({ pausaAccion: async () => {}, pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard), log: () => {} }) as unknown as ContextoPortal

test('v0.2.23 · el marco navega en el sitio y la pestaña «Selección personas» lleva al buscador: se busca, se elige y nunca se confirma ni se da de alta', async () => {
  const { marco, guard, estado, cerrar } = await abrir()
  try {
    const r = await elegirPersonaTomadorGenerali(marco, FORM, ctxDe(guard), ESPERAS)
    assert.ok(r, 'debía aplicar')
    assert.deepEqual(r!.hechos, ['tomador.persona_elegida'])
    assert.match(r!.diag, /rama=marco, buscador, filas=1, coinciden=1, verificado/)
    assert.equal(estado.confirmar, 0, 'nunca «Confirmar»')
    assert.equal(estado.alta, 0, 'nunca «Alta»')
    assert.equal(await marco.locator(`[id="${P}interesado_nifcif"]`).inputValue(), NIF)
    for (const dato of [NIF, 'ANA', 'PEREZ', 'GIL', '1980']) assert.ok(!r!.diag.includes(dato), `el diagnóstico lleva «${dato}»`)
  } finally {
    await cerrar()
  }
})

test('v0.2.23 · el marco carga TARDE (2 s): se espera a que tenga controles', async () => {
  const { marco, guard, estado, cerrar } = await abrir({ retrasoDatosMs: 2_000 })
  try {
    const r = await elegirPersonaTomadorGenerali(marco, FORM, ctxDe(guard), { ...ESPERAS, abrirMs: 6_000 })
    assert.ok(r)
    assert.equal(estado.confirmar + estado.alta, 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.23 · sin buscador ni pestaña: atasco que lista los marcos (URL sin datos, nombre) y sus controles; no se confirma ni se crea', async () => {
  const { marco, guard, estado, cerrar } = await abrir({ conPestana: false })
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(marco, FORM, ctxDe(guard), { ...ESPERAS, abrirMs: 1_500 }),
      (e: unknown) => {
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        const m = (e as Error).message
        assert.match(m, /no se encontró un buscador/)
        assert.match(m, /rama=marco, sin_buscador/)
        assert.match(m, /marcos: .*emi_genAutosFormWeb\/Datos\.do#mainFrame \(\d+\)/)
        assert.match(m, /input\/text#personas_intere_nifcif/)
        assert.match(m, /input\/button#confirmar «Confirmar»/)
        assert.doesNotMatch(m, /sin controles visibles/)
        assert.ok(!m.includes(NIF) && !m.includes('?'), m)
        assert.ok(m.length < 1_900, `${m.length}`)
        return true
      },
    )
    assert.equal(estado.confirmar + estado.alta, 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.23 · el buscador en un iframe ANIDADO de una ventana nueva se halla', async () => {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const buscador = `<label for="doc">NIF/CIF</label><input id="doc" type="text"><input type="button" value="Buscar" onclick="document.getElementById('res').innerHTML='<table><tr><td>${NIF}</td><td>ANA</td><td><input type=button value=Seleccionar onclick=&quot;parent.opener.document.getElementById(\\'${P}interesado_nifcif\\').value=\\'${NIF}\\';parent.opener.document.getElementById(\\'${P}interesado_nombre\\').value=\\'ANA PEREZ GIL\\'&quot;></td></tr></table>'"><div id="res"></div>`
  await context.route('https://www.generali.es/**', (r) => {
    const u = r.request().url()
    const cuerpo = u.includes('Hijo.do')
      ? buscador
      : u.includes('Ventana.do')
        ? `<iframe name="a" src="${BASE}Hijo.do"></iframe>`
        : `<input id="${P}roles_lnkPers" type="button" value="Personas" onclick="window.open('${BASE}Ventana.do','p')"><input id="${P}interesado_nifcif" type="text" readonly><input id="${P}interesado_nombre" type="text" readonly>`
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  try {
    const r = await elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS)
    assert.ok(r)
    assert.match(r!.diag, /rama=ventana, buscador, filas=1, coinciden=1/)
  } finally {
    await context.close()
  }
})
