// «Continuar/Siguiente» COMÚN a todos los bots (pieza 4, 14/10/2026; src/continuar.ts). Fixtures SINTÉTICAS (valores inventados).
// Lo que se vigila: localiza solo el texto ENTERO; pasa SIEMPRE por el guard (un «Continuar» falso de contratar/grabar/emitir
// no se pulsa); espera el cambio de pantalla y, si no llega, error tipado (no cuelgue); sin botón → aprendido/IA validados.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { comprobarBoton, EmisionBloqueadaError } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { localizarContinuar, pulsarContinuarSeguro, esTextoContinuar } from '../src/continuar.ts'
import { prepararFormador, type ContextoFormador } from '../src/formador.ts'

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

async function preparar(html: string): Promise<{ page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { page, guard }
}
const clics = (page: Page) => page.evaluate(() => (window as unknown as { __clics?: number }).__clics ?? 0)

/** Pantalla 1 con su «Continuar»; el clic pinta la pantalla 2. */
const PANTALLA = (boton: string) => `<h1 id="t">Datos del vehículo</h1><div id="cuerpo">paso uno</div>${boton}
<script>window.__clics=0;function sigue(){window.__clics++;document.getElementById('t').textContent='Coberturas';document.getElementById('cuerpo').textContent='paso dos'}</script>`
const CONTINUAR = `<button id="cont" onclick="sigue()">Continuar</button>`

test('localizarContinuar: EXACTAMENTE uno con el texto ENTERO; «Continuar a pago», «Grabar y continuar» o dos botones → hueco', async () => {
  const a = await preparar(PANTALLA(`<button onclick="sigue()">  Continuar </button>`))
  assert.equal(await (await localizarContinuar(a.page)).textContent(), '  Continuar ')
  const sig = await preparar(PANTALLA(`<button onclick="sigue()">Siguiente</button>`))
  await localizarContinuar(sig.page)
  const input = await preparar(PANTALLA(`<input type="button" value="Continuar" onclick="sigue()">`))
  await localizarContinuar(input.page)
  for (const html of [`<button>Continuar a pago</button>`, `<button>Grabar y continuar</button>`, `<button>Continuar</button><button>Siguiente</button>`, ``]) {
    const { page } = await preparar(PANTALLA(html))
    await assert.rejects(() => localizarContinuar(page), (e) => e instanceof ErrorTarificador && e.tipo === 'portal', html)
  }
  assert.ok(esTextoContinuar('Siguiente') && !esTextoContinuar('Continuar a pago') && !esTextoContinuar('Contratar'))
})

test('pulsarContinuarSeguro: pulsa por el guard y espera a que cambie la pantalla', async () => {
  const { page, guard } = await preparar(PANTALLA(CONTINUAR))
  const r = await pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard) })
  assert.equal(r.origen, 'fijo')
  assert.equal(await page.locator('#t').textContent(), 'Coberturas')
  assert.equal(await clics(page), 1)
})

test('sin cambio de pantalla: error tipado `portal` en el plazo (no cuelgue) y sin segundo clic', async () => {
  const { page, guard } = await preparar(`<button onclick="window.__clics=(window.__clics||0)+1">Continuar</button>`)
  const t0 = Date.now()
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), esperaMs: 800, desde: 'Datos' }), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && /no cambió/.test(e.message))
  assert.ok(Date.now() - t0 < 5_000)
  assert.equal(await clics(page), 1)
})

test('GUARD: un «Continuar» falso (id/onclick/ng-click/ancestro de contratar, emitir, grabar) NO se pulsa', async () => {
  const falsos: Record<string, string> = {
    id: `<button id="btnContratar" onclick="sigue()">Continuar</button>`,
    onclick: `<button onclick="sigue();contratarPoliza()">Continuar</button>`,
    ngClick: `<button ng-click="emitir()" onclick="sigue()">Continuar</button>`,
    ancestro: `<div ng-click="grabarPoliza()"><button onclick="sigue()">Continuar</button></div>`,
    ariaLabel: `<button aria-label="Contratar" onclick="sigue()">Continuar</button>`,
    value: `<input type="button" value="Continuar" name="emitir" onclick="sigue()">`,
  }
  for (const [caso, boton] of Object.entries(falsos)) {
    const { page, guard } = await preparar(PANTALLA(boton))
    await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), esperaMs: 500 }), (e) => e instanceof EmisionBloqueadaError, caso)
    assert.equal(await clics(page), 0, `${caso}: no hubo clic`)
  }
})

test('«Grabar póliza»/«Contratar»/«Emitir»: el guard los bloquea y el helper NO los toma por «Continuar»', async () => {
  for (const t of ['Grabar póliza', 'GRABAR POLIZA', 'Contratar', 'Emitir póliza', 'Formalizar', 'Pagar']) {
    assert.throws(() => comprobarBoton([t]), (e) => e instanceof EmisionBloqueadaError, t)
    const { page } = await preparar(PANTALLA(`<button onclick="sigue()">${t}</button>`))
    await assert.rejects(() => localizarContinuar(page), (e) => e instanceof ErrorTarificador, t)
    assert.equal(await clics(page), 0)
  }
})

test('un «Continuar» dentro de un diálogo no se pulsa', async () => {
  const { page, guard } = await preparar(PANTALLA(`<div role="dialog"><button onclick="sigue()">Continuar</button></div>`))
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), esperaMs: 500 }), (e) => e instanceof ErrorTarificador && /diálogo/.test(e.message))
  assert.equal(await clics(page), 0)
})

// ───────────── sin botón exacto: aprendido / IA, validados ─────────────

/** Formador activo con una IA falsa: `elegir(textos)` devuelve el índice de la lista que recibe (o null). */
async function formadorConIA(elegir: (textos: (string | null)[]) => number | null, llamadas: { sugerir: number; confirmar: number }): Promise<ContextoFormador> {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/sugerir')) {
      llamadas.sugerir++
      const cuerpo = JSON.parse(String(init?.body)) as { estructura: { texto: string | null }[] }
      return new Response(JSON.stringify({ indice: elegir(cuerpo.estructura.map((c) => c.texto)) }))
    }
    if (String(url).endsWith('/confirmar')) {
      llamadas.confirmar++
      return new Response('{}')
    }
    return new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))
  }) as unknown as typeof fetch
  return prepararFormador({ trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'auto', apiUrl: 'https://x', secreto: 'x'.repeat(20), redactar: (t) => t, log: () => undefined, fetchImpl })
}
/** «Continuar» que el selector fijo NO ve (un div con onclick, sin role). */
const DIV_CONTINUAR = `<div id="d" onclick="sigue()">Continuar</div><a href="#ayuda">Ayuda</a>`

test('sin botón fijo: la IA señala el «Continuar» y, validado y pulsado por el guard, se confirma lo aprendido', async () => {
  const llamadas = { sugerir: 0, confirmar: 0 }
  const formador = await formadorConIA((ts) => ts.indexOf('Continuar'), llamadas)
  const { page, guard } = await preparar(PANTALLA(DIV_CONTINUAR))
  const r = await pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), formador })
  assert.equal(r.origen, 'ia')
  assert.equal(llamadas.sugerir, 1)
  assert.equal(llamadas.confirmar, 1)
  assert.equal(await page.locator('#t').textContent(), 'Coberturas')
})

test('la IA señala un botón de contratar: se RECHAZA, no se pulsa y el error es el original (+ sin confirmar)', async () => {
  const llamadas = { sugerir: 0, confirmar: 0 }
  const formador = await formadorConIA((ts) => ts.indexOf('Contratar'), llamadas)
  const { page, guard } = await preparar(PANTALLA(`<div onclick="sigue()">Contratar</div>`))
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), formador }), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && /EXACTAMENTE un botón/.test(e.message))
  assert.equal(await clics(page), 0)
  assert.equal(llamadas.confirmar, 0)
})

test('la IA señala un «Continuar» con onclick de emitir: validarAccion lo rechaza antes de tocarlo', async () => {
  const llamadas = { sugerir: 0, confirmar: 0 }
  const formador = await formadorConIA((ts) => ts.indexOf('Continuar'), llamadas)
  const { page, guard } = await preparar(PANTALLA(`<div onclick="sigue();emitirPoliza()">Continuar</div>`))
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), formador }), (e) => e instanceof ErrorTarificador)
  assert.equal(await clics(page), 0)
})

test('sin formador (o sin respuesta): el error original, sin colgarse', async () => {
  const { page, guard } = await preparar(PANTALLA(DIV_CONTINUAR))
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard) }), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  const llamadas = { sugerir: 0, confirmar: 0 }
  const mudo = await formadorConIA(() => null, llamadas)
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), formador: mudo }), (e) => e instanceof ErrorTarificador)
  assert.equal(llamadas.sugerir, 1)
  assert.equal(await clics(page), 0)
})

test('texto visible: un botón con aria-label «Siguiente» pero texto «Revisar» NO se pulsa (ni aprendido ni IA)', async () => {
  const { page, guard } = await preparar(PANTALLA(`<button id="falso" aria-label="Siguiente" onclick="sigue()">Revisar</button>`))
  const llamadas = { n: 0 }
  const fetchImpl = (async (url: string) => {
    if (String(url).endsWith('/sugerir')) {
      llamadas.n++
      return new Response(JSON.stringify({ indice: 0 }))
    }
    return new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))
  }) as unknown as typeof fetch
  const formador = await prepararFormador({ trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'mapfre', ramo: 'auto', apiUrl: 'https://x', secreto: 'x'.repeat(20), redactar: (t) => t, log: () => undefined, fetchImpl })
  await assert.rejects(() => pulsarContinuarSeguro(page, { pulsar: (b) => pulsar(b, guard), formador, esperaMs: 1_500 }), (e) => e instanceof ErrorTarificador && /texto visible/.test(e.message))
  assert.equal(await clics(page), 0, 'no se pulsó')
})
