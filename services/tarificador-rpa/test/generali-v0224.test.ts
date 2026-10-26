// Generali Turismos v0.2.24 (25/10/2026, prueba real con 0.2.23): tras pulsar «Selección personas…» el marco `emiAutosGenB028.do` sigue con 23 controles y NINGUNO es
// «Buscar/Consultar» (hay 3 enlaces sin texto: posibles iconos). Se reconocen botones-imagen/enlaces-icono con title/alt «Buscar» y el atasco vuelca lo pulsable
// (title/alt, imagen, función del onclick, cabeceras) y el antes/después de la pestaña. Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame } from 'playwright'
import { MEDIADOR_GENERALI, RE_BUSCAR_PERSONA_GENERALI, normalizarRotuloGenerali, resumenControlesAbiertoGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, elegirPersonaTomadorGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const NIF = '00000000T'
const FORM = { documentoTomador: NIF, datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' }, conductor: { fechaCarne: '2000-06-01' } }
const ESPERAS = { abrirMs: 3_000, resultadosMs: 2_500, vueltaMs: 2_000 }
const BASE = 'https://www.generali.es/emi_genAutosFormWeb/'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=' + MEDIADOR_GENERALI
const PNG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

test('v0.2.24 · versión (vigente 0.2.27)', () => assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(2[7-9]|[3-9]\d)$/))

test('v0.2.24 · puras: «lupa»/«buscar personas» casan; «aceptar», «confirmar» y «alta» NO; el resumen pone lo pulsable antes que los campos', () => {
  for (const t of ['Buscar', 'lupa', 'Buscar personas', 'Consultar']) assert.ok(RE_BUSCAR_PERSONA_GENERALI.test(normalizarRotuloGenerali(t)), t)
  for (const t of ['Aceptar', 'Confirmar', 'Alta de persona', 'Cancelar']) assert.ok(!RE_BUSCAR_PERSONA_GENERALI.test(normalizarRotuloGenerali(t)), t)
  const r = resumenControlesAbiertoGenerali(
    [
      { tag: 'input', tipo: 'text', id: 'campo_a', rotulo: '', ro: false },
      { tag: 'a', tipo: 'a', id: '', rotulo: '{t=Lupa img oc=abrir(}', ro: false },
      { tag: 'th', tipo: 'th', id: '', rotulo: 'Documento', ro: false },
    ],
    0,
  )
  assert.ok(r.indexOf('a/a') < r.indexOf('input/text#campo_a'), r)
  assert.ok(r.indexOf('th/th') < r.indexOf('input/text#campo_a'), r)
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
const ctxDe = (guard: GuardEmision) => ({ pausaAccion: async () => {}, pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard), log: () => {} }) as unknown as ContextoPortal
const vehiculo = (e: Estado) => `<input id="${P}roles_lnkPers" type="button" value="Personas" onclick="location.href='${BASE}Datos.do'">
  <input id="${P}interesado_nifcif" type="text" readonly value="${e.elegido ? NIF : ''}"><input id="${P}interesado_nombre" type="text" readonly value="${e.elegido ? 'ANA PEREZ GIL' : ''}">`
const fila = `<tr><td>${NIF}</td><td>ANA PEREZ GIL</td><td><input type='button' value='Seleccionar' onclick='location.href="${BASE}Volver.do"'></td></tr>`
const tabla = JSON.stringify(`<table><tr><th>Documento</th><th>Nombre</th><th></th></tr>${fila}</table>`).replace(/<\//g, '<\\/')

/** Pantalla real de la prueba (tipo de documento, NIF, nombre, «Cancelar», «Confirmar», pestañas) + `icono` junto al NIF. */
const datos = (icono: string) => `<a href="#">Selección personas que intervienen</a><a href="#">Datos personas</a>
  <select id="personas_intere_ynidcl"><option>Persona física con NIF/NIE/Pasaporte</option></select>
  <span>${icono}<input id="personas_intere_nifcif" type="text"></span><input id="personas_intere_nombre" type="text">
  <input id="cancelar" type="button" value="Cancelar"><input id="confirmar" type="button" value="Confirmar" onclick="location.href='${BASE}Confirmar.do'">
  <a href="#" title="Alta persona" onclick="location.href='${BASE}Alta.do'">Nueva persona</a><div id="res"></div>
  <script>function buscarPersonaX(){setTimeout(function(){document.getElementById('res').innerHTML=${tabla}},100)}</script>`

async function abrir(icono: string): Promise<{ marco: Frame; guard: GuardEmision; estado: Estado; cerrar: () => Promise<void> }> {
  const estado: Estado = { elegido: false, confirmar: 0, alta: 0 }
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    let cuerpo = 'otra'
    if (u.startsWith(PORTAL.split('?')[0]!)) cuerpo = `<iframe name="mainFrame" src="${BASE}Vehiculo.do" style="width:800px;height:500px"></iframe>`
    else if (u.startsWith(`${BASE}Vehiculo.do`)) cuerpo = vehiculo(estado)
    else if (u.startsWith(`${BASE}Datos.do`)) cuerpo = datos(icono)
    else if (u.startsWith(`${BASE}Volver.do`)) {
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
  assert.ok(marco)
  return { marco: marco!, guard, estado, cerrar: () => context.close() }
}

for (const [nombre, icono] of [
  ['enlace-icono con title «Buscar»', `<a href="#" title="Buscar" onclick="buscarPersonaX();return false"><img src="${PNG}" width="16" height="16"></a>`],
  ['enlace-icono con img alt «Buscar»', `<a href="#" onclick="buscarPersonaX();return false"><img alt="Buscar" src="${PNG}" width="16" height="16"></a>`],
  ['imagen clicable con alt «Buscar»', `<img alt="Buscar" src="${PNG}" width="16" height="16" onclick="buscarPersonaX()">`],
] as const) {
  test(`v0.2.24 · ${nombre}: se busca por NIF y se elige la única fila; nunca «Confirmar» ni alta`, async () => {
    const { marco, guard, estado, cerrar } = await abrir(icono)
    try {
      const r = await elegirPersonaTomadorGenerali(marco, FORM, ctxDe(guard), ESPERAS)
      assert.ok(r)
      assert.match(r!.diag, /rama=(?:marco|capa), buscador, filas=1, coinciden=1, verificado/)
      assert.equal(estado.confirmar + estado.alta, 0)
      assert.equal(await marco.locator(`[id="${P}interesado_nifcif"]`).inputValue(), NIF)
      for (const dato of [NIF, 'ANA', 'PEREZ']) assert.ok(!r!.diag.includes(dato), dato)
    } finally {
      await cerrar()
    }
  })
}

test('v0.2.24 · icono SIN pista de búsqueda: atasco que vuelca lo pulsable (title, imagen, función del onclick), cabeceras y antes/después; sin valores ni «Confirmar»', async () => {
  const { marco, guard, estado, cerrar } = await abrir(`<a href="#" title="Ver ficha" onclick="abrirFichaX();return false"><img src="${PNG}" width="16" height="16"></a>`)
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(marco, FORM, ctxDe(guard), { ...ESPERAS, abrirMs: 1_500 }),
      (e: unknown) => {
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        const m = (e as Error).message
        assert.match(m, /sin_buscador, pestaña_seleccion_pulsada/)
        assert.match(m, /pestaña: controles \d+→\d+/)
        assert.match(m, /a\/a «[^»]*t=Ver ficha img oc=abrirFichaX\(/)
        assert.match(m, /input\/button#confirmar «Confirmar»/)
        assert.ok(m.indexOf('a/a') < m.indexOf('input/text#personas_intere_nifcif'), 'lo pulsable va antes que los campos')
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
