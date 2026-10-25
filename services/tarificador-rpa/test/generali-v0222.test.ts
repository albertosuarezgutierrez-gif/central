// Generali Turismos v0.2.22 (22/10/2026, prueba real con 0.2.21): «Es obligatorio informar el tomador» con TODOS los `interesado_*` readonly y vacíos y un
// botón «Personas» (`roles_lnkPers`). Se pulsa UNA vez, se busca el NIF en lo que abre y se elige la fila SOLO si es única y coincide; nunca se crea una persona.
// Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import {
  MEDIADOR_GENERALI,
  documentoNormalizadoGenerali,
  filaCoincideDocumentoGenerali,
  resumenControlesAbiertoGenerali,
} from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, elegirPersonaTomadorGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const NIF = '00000000T'
const FORM = { documentoTomador: NIF, datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' }, conductor: { fechaCarne: '2000-06-01' } }
const ESPERAS = { abrirMs: 3_000, resultadosMs: 2_500, vueltaMs: 1_500 }

test('v0.2.22 · versión (vigente 0.2.23)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.23'))

test('v0.2.22 · puras: documento exacto por celda y resumen saneado sin valores', () => {
  assert.equal(documentoNormalizadoGenerali(' 0000.0000-t '), '00000000T')
  assert.equal(filaCoincideDocumentoGenerali(['x', '00000000t'], NIF), true)
  assert.equal(filaCoincideDocumentoGenerali(['A00000000T1'], NIF), false, 'subcadena no vale')
  assert.equal(filaCoincideDocumentoGenerali(['x'], ''), false)
  const r = resumenControlesAbiertoGenerali(
    [
      { tag: 'input', tipo: 'text', id: 'nif', rotulo: 'NIF 00000000T', ro: false },
      { tag: 'input', tipo: 'button', id: '', rotulo: 'Buscar', ro: false },
    ],
    3,
  )
  assert.ok(!r.includes(NIF), r)
  assert.match(r, /input\/button «Buscar»/)
  assert.match(r, /filas:3/)
  assert.ok(resumenControlesAbiertoGenerali(Array.from({ length: 80 }, () => ({ tag: 'input', tipo: 'text', id: 'campo_largo_x', rotulo: 'Rótulo largo', ro: false })), 0).length <= 651)
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

const BASE = 'https://www.generali.es/arq_genernetPortalFormWeb/'
const PORTAL = `${BASE}CorredorPortal.po?mediatorCode=${MEDIADOR_GENERALI}`

/** Interesado readonly y vacío + roles + botón «Personas» (abre `abre`). */
const principal = (abre: string) => `<div>
  <select id="${P}roles_ycond1"><option>TOMADOR</option></select>
  <input id="${P}roles_lnkPers" type="button" value="Personas" onclick="window.__pulsado=(window.__pulsado||0)+1;${abre}">
  <input id="${P}interesado_nifcif" type="text" readonly><input id="${P}interesado_nombre" type="text" readonly>
  <input id="${P}interesado_papell" type="text" disabled><input id="${P}interesado_ffnain" type="text" readonly>
</div>`

const ELEGIR = (nif: string, nombre: string) => `window.opener.document.getElementById("${P}interesado_nifcif").value="${nif}";window.opener.document.getElementById("${P}interesado_nombre").value="${nombre}";window.close()`
const fila = (nif: string, nombre: string) => `<tr><td>${nif}</td><td>${nombre}</td><td><input type='button' value='Seleccionar' onclick='${ELEGIR(nif, nombre)}'></td></tr>`
/** Ventana de búsqueda: campo de documento, «Buscar» (pinta `filas`) y un «Alta de persona» que NUNCA debe pulsarse. */
const buscador = (filas: string[]) => `<label for="doc">NIF/CIF</label><input id="doc" type="text">
  <input type="button" value="Buscar" onclick="buscar()">
  <input type="button" value="Alta de persona" onclick="window.__alta=1">
  <div id="res"></div>
  <script>function buscar(){setTimeout(function(){document.getElementById('res').innerHTML=${JSON.stringify(`<table><tr><th>Documento</th><th>Nombre</th><th></th></tr>${filas.join('')}</table>`).replace(/<\//g, '<\\/')}},100)}</script>`
const pantallaAlta = `<h3>Alta de persona</h3><label for="n">Nombre</label><input id="n" type="text"><label for="a">Apellido</label><input id="a" type="text"><input type="button" value="Alta" onclick="window.__alta=1">`

async function abrir(html: string, popup: string): Promise<{ page: Page; context: BrowserContext; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', (r) => {
    const u = r.request().url()
    const cuerpo = u.startsWith(`${BASE}Personas.po`) ? popup : u.startsWith(`${BASE}CorredorPortal.po`) ? html : 'otra'
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  return { page, context, guard, cerrar: () => context.close() }
}
const ctxDe = (guard: GuardEmision) => ({ pausaAccion: async () => {}, pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard), log: () => {} }) as unknown as ContextoPortal
const valor = (page: Page, campo: string) => page.locator(`[id="${P}interesado_${campo}"]`).inputValue()
const ABRE_VENTANA = `window.open('${BASE}Personas.po','personas','width=600,height=400')`

async function alta(context: BrowserContext): Promise<number> {
  let n = 0
  for (const p of context.pages()) n += ((await p.evaluate(() => (window as unknown as { __alta?: number }).__alta ?? 0).catch(() => 0)) as number) > 0 ? 1 : 0
  return n
}

test('v0.2.22 · ventana nueva con UNA fila que coincide: se busca, se elige y el interesado queda relleno', async () => {
  const { page, context, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([fila(NIF, 'ANA PEREZ GIL')]))
  try {
    const r = await elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS)
    assert.ok(r, 'debía aplicar')
    assert.deepEqual(r!.hechos, ['tomador.persona_elegida'])
    assert.equal(await valor(page, 'nifcif'), NIF)
    assert.equal(await valor(page, 'nombre'), 'ANA PEREZ GIL')
    assert.equal(await page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado), 1, '«Personas» se pulsa UNA vez')
    assert.match(r!.diag, /rama=ventana, buscador, filas=1, coinciden=1, verificado/)
    for (const dato of [NIF, 'ANA', 'PEREZ', 'GIL', '1980']) assert.ok(!r!.diag.includes(dato), `el diagnóstico lleva «${dato}»: ${r!.diag}`)
    assert.equal(await alta(context), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · 0 filas: atasco claro, no se elige ni se da de alta y el diagnóstico no lleva datos', async () => {
  const { page, context, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([]))
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS),
      (e: unknown) => {
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        const m = (e as Error).message
        assert.match(m, /0 fila\(s\)/)
        assert.match(m, /rama=ventana, buscador/)
        assert.match(m, /Personas-pulsar/)
        assert.match(m, /input\/button «Buscar»/)
        for (const dato of [NIF, 'ANA', 'PEREZ']) assert.ok(!m.includes(dato), `el mensaje lleva «${dato}»: ${m}`)
        assert.ok(m.length < 1_500, `${m.length}`)
        return true
      },
    )
    assert.equal(await valor(page, 'nifcif'), '')
    assert.equal(await alta(context), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · varias filas (aunque una coincida): atasco, no se elige a ciegas', async () => {
  const { page, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([fila(NIF, 'ANA PEREZ GIL'), fila('11111111H', 'OTRA PERSONA')]))
  try {
    await assert.rejects(() => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS), /2 fila\(s\) y 1 con el documento exacto/)
    assert.equal(await valor(page, 'nifcif'), '')
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · una fila cuyo documento NO coincide: atasco', async () => {
  const { page, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([fila('11111111H', 'OTRA PERSONA')]))
  try {
    await assert.rejects(() => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS), /1 fila\(s\) y 0 con el documento exacto/)
    assert.equal(await valor(page, 'nifcif'), '')
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · pantalla de ALTA de persona: atasco sin crear nada', async () => {
  const { page, context, guard, cerrar } = await abrir(principal(ABRE_VENTANA), pantallaAlta)
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS),
      (e: unknown) => {
        const m = (e as Error).message
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        assert.match(m, /ALTA de persona/)
        assert.match(m, /rama=ventana, alta/)
        assert.match(m, /input\/text#?[^;]*«Nombre»/)
        assert.ok(!m.includes(NIF))
        return true
      },
    )
    assert.equal(await alta(context), 0, 'no se pulsó «Alta»')
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · capa en la misma página (sin ventana nueva): se halla, se busca y se elige', async () => {
  const capa = `var c=document.getElementById('capa');c.style.display='block'`
  const html =
    principal(capa) +
    `<div id="capa" style="display:none"><label for="doc">NIF/CIF</label><input id="doc" type="text"><input type="button" value="Consultar" onclick="document.getElementById('res').innerHTML='<table><tr><td>${NIF}</td><td>ANA PEREZ GIL</td><td><input type=button value=Seleccionar onclick=&quot;document.getElementById(\\'${P}interesado_nifcif\\').value=\\'${NIF}\\';document.getElementById(\\'${P}interesado_nombre\\').value=\\'ANA PEREZ GIL\\'&quot;></td></tr></table>'"><div id="res"></div></div>`
  const { page, guard, cerrar } = await abrir(html, '')
  try {
    const r = await elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS)
    assert.ok(r)
    assert.match(r!.diag, /rama=capa, buscador, filas=1, coinciden=1/)
    assert.equal(await valor(page, 'nombre'), 'ANA PEREZ GIL')
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · «Personas» no abre nada reconocible: atasco con la rama y sin pulsar más', async () => {
  const { page, guard, cerrar } = await abrir(principal(''), '')
  try {
    await assert.rejects(() => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), { ...ESPERAS, abrirMs: 1_200 }), /no se encontró un buscador[\s\S]*rama=nada_nuevo/)
    assert.equal(await page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado), 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · la búsqueda eligió pero el interesado sigue vacío: atasco', async () => {
  const filaMuda = `<tr><td>${NIF}</td><td>ANA</td><td><input type='button' value='Seleccionar' onclick='window.close()'></td></tr>`
  const { page, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([filaMuda]))
  try {
    await assert.rejects(() => elegirPersonaTomadorGenerali(page.mainFrame(), FORM, ctxDe(guard), ESPERAS), /siguen vacíos/)
  } finally {
    await cerrar()
  }
})

test('v0.2.22 · interesado editable o ya relleno: no aplica y NO se pulsa «Personas»', async () => {
  const editable = principal(ABRE_VENTANA).replace(`id="${P}interesado_nifcif" type="text" readonly`, `id="${P}interesado_nifcif" type="text"`)
  const a = await abrir(editable, buscador([]))
  try {
    assert.equal(await elegirPersonaTomadorGenerali(a.page.mainFrame(), FORM, ctxDe(a.guard), ESPERAS), null)
    assert.equal(await a.page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0)
  } finally {
    await a.cerrar()
  }
  const relleno = principal(ABRE_VENTANA).replace(`id="${P}interesado_nifcif" type="text" readonly`, `id="${P}interesado_nifcif" type="text" readonly value="${NIF}"`)
  const b = await abrir(relleno, buscador([]))
  try {
    assert.equal(await elegirPersonaTomadorGenerali(b.page.mainFrame(), FORM, ctxDe(b.guard), ESPERAS), null)
    assert.equal(await b.page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0)
  } finally {
    await b.cerrar()
  }
})

test('v0.2.22 · sin NIF del tomador: atasco sin pulsar «Personas»', async () => {
  const { page, guard, cerrar } = await abrir(principal(ABRE_VENTANA), buscador([]))
  try {
    await assert.rejects(() => elegirPersonaTomadorGenerali(page.mainFrame(), { datosTomador: FORM.datosTomador }, ctxDe(guard), ESPERAS), /no trae el NIF/)
    assert.equal(await page.evaluate(() => (window as unknown as { __pulsado?: number }).__pulsado ?? 0), 0)
  } finally {
    await cerrar()
  }
})
