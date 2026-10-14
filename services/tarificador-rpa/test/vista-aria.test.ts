// Vista aria del explorador (14/10/2026, Fase 4): interruptor, tope, caída a `dom`, métrica y enganche en el bucle.
// Datos INVENTADOS. Chromium real sin red. `npm test`.

import assert from 'node:assert/strict'
import { describe, test, before, after } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { respuestaParar } from '@central/module-tarificacion'
import { MAX_BYTES_VISTA_ARIA, MODO_VISTA_POR_DEFECTO, modoVistaExplorador, vistaDelPaso } from '../src/aprendizaje/vista-aria.ts'
import { bucleExploracion, type ContextoBucle } from '../src/explorador.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { instalarGuardEmision, pulsar } from '../src/guard.ts'
import type { RespuestaPaso } from '../src/api.ts'

describe('modoVistaExplorador (interruptor)', () => {
  test('el defecto es dom (nada cambia)', () => {
    assert.equal(MODO_VISTA_POR_DEFECTO, 'dom')
    assert.equal(modoVistaExplorador({}), 'dom')
    assert.equal(modoVistaExplorador({ TARIFICADOR_EXPLORADOR_VISTA: '' }), 'dom')
  })
  test('aria / ambas se leen sin importar mayúsculas; lo desconocido cae a dom', () => {
    assert.equal(modoVistaExplorador({ TARIFICADOR_EXPLORADOR_VISTA: 'ambas' }), 'ambas')
    assert.equal(modoVistaExplorador({ TARIFICADOR_EXPLORADOR_VISTA: ' ARIA ' }), 'aria')
    assert.equal(modoVistaExplorador({ TARIFICADOR_EXPLORADOR_VISTA: 'todo' }), 'dom')
  })
})

describe('vistaDelPaso (sin navegador)', () => {
  const pagina = {} as Page
  test('modo dom: no captura nada', async () => {
    let llamadas = 0
    const v = await vistaDelPaso(pagina, 'dom', 1234, async () => { llamadas++; return 'x' })
    assert.equal(llamadas, 0)
    assert.equal(v.vistaAria, undefined)
    assert.deepEqual(v.metrica, { modo: 'dom', efectivo: 'dom', domChars: 1234, ariaChars: 0 })
  })
  test('modo ambas: devuelve la vista y su tamaño; pide el tope de la vista', async () => {
    let tope = 0
    const v = await vistaDelPaso(pagina, 'ambas', 1000, async (_p, o) => { tope = o.maxBytes; return '- button "Seguir" [ref=e1]' })
    assert.equal(tope, MAX_BYTES_VISTA_ARIA)
    assert.equal(v.vistaAria, '- button "Seguir" [ref=e1]')
    assert.deepEqual(v.metrica, { modo: 'ambas', efectivo: 'ambas', domChars: 1000, ariaChars: 26 })
  })
  test('el snapshot falla (null o excepción): efectivo dom, sin vista, sin lanzar', async () => {
    for (const cap of [async () => null, async (): Promise<string | null> => { throw new Error('boom') }]) {
      const v = await vistaDelPaso(pagina, 'aria', 500, cap)
      assert.equal(v.vistaAria, undefined)
      assert.deepEqual(v.metrica, { modo: 'aria', efectivo: 'dom', domChars: 500, ariaChars: 0 })
    }
  })
})

async function lanzar(): Promise<Browser> {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try { return await chromium.launch(opciones) } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ ...opciones, executablePath: exe })
  }
}

const MARCO = `<!doctype html><meta charset="utf-8"><label for="m">Matrícula</label><input id="m" value="1234 BCD"><button type="button" id="b">Dentro</button>`
const PAGINA = `<!doctype html><meta charset="utf-8"><title>p</title><h1>Datos del riesgo</h1>
<label for="n">Nombre del tomador</label><input id="n" value="Pepa Pérez Gómez"><label for="d">NIF</label><input id="d" value="12345678Z">
<button type="button" id="s">Siguiente</button><iframe name="app" srcdoc="${MARCO.replace(/"/g, '&quot;')}"></iframe>`

describe('Chromium real', () => {
  let browser: Browser
  before(async () => { browser = await lanzar() })
  after(async () => browser?.close())

  async function nueva() {
    const context = await browser.newContext()
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(5_000)
    await page.setContent(PAGINA)
    return { context, page, guard }
  }

  test('la vista aria sale redactada (sin valores ni datos personales) y recorre el iframe', async () => {
    const { context, page } = await nueva()
    try {
      const v = await vistaDelPaso(page, 'ambas', 0)
      assert.ok(v.vistaAria)
      assert.match(v.vistaAria, /Matrícula/)
      assert.doesNotMatch(v.vistaAria, /Pepa|12345678Z|1234 BCD/)
      assert.equal(v.metrica.efectivo, 'ambas')
    } finally { await context.close() }
  })

  test('tope de tamaño: la vista no supera MAX_BYTES_VISTA_ARIA', async () => {
    const { context, page } = await nueva()
    try {
      await page.setContent(`<h1>x</h1>${Array.from({ length: 4000 }, (_, i) => `<button>Botón número ${i}</button>`).join('')}`)
      const v = await vistaDelPaso(page, 'ambas', 0)
      assert.ok(v.vistaAria)
      assert.ok(Buffer.byteLength(v.vistaAria) <= MAX_BYTES_VISTA_ARIA)
      assert.match(v.vistaAria, /recortado/)
    } finally { await context.close() }
  })

  test('Playwright 1.63 resuelve aria-ref (también dentro del iframe) para escribir y pulsar', async () => {
    const { context, page } = await nueva()
    try {
      const crudo = await page.ariaSnapshot({ mode: 'ai' })
      const ref = (rol: string) => new RegExp(`${rol}.*\\[ref=([a-z0-9]+)\\]`).exec(crudo)?.[1]
      const rm = ref('textbox "Matrícula"')!
      assert.match(rm, /^f\d+e\d+$/)
      await page.locator(`aria-ref=${rm}`).fill('9999 ZZZ')
      assert.equal(await page.frames()[1].locator('#m').inputValue(), '9999 ZZZ')
    } finally { await context.close() }
  })

  test('medida: tamaño del inventario DOM frente a la vista aria en la página de prueba (informativo)', async () => {
    const { context, page } = await nueva()
    try {
      const cap = await capturarInventarioExploracion(page)
      assert.ok(cap)
      const dom = JSON.stringify(cap.inventario).length
      await cap.liberar()
      const v = await vistaDelPaso(page, 'ambas', dom)
      console.log(`MEDIDA vista: dom=${dom} aria=${v.metrica.ariaChars} chars`)
      assert.ok(v.metrica.ariaChars > 0)
    } finally { await context.close() }
  })

  function contexto(page: Page, guard: Awaited<ReturnType<typeof nueva>>['guard'], env: Record<string, string>) {
    const enviados: Record<string, unknown>[] = []
    const lineas: { m: string; d?: Record<string, unknown> }[] = []
    const k: ContextoBucle = {
      trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'allianz', ramo: 'hogar', entrada: 'allianz:particulares:hogar',
      conDatosReales: false, riesgo: {}, env, guard,
      pulsar: (b) => pulsar(b, guard),
      pulsarAutorizado: async () => undefined, pulsarGuardado: async () => undefined, pulsarGuardadoDialogo: async () => undefined,
      pausaAccion: async () => undefined,
      pedirPaso: async (c): Promise<RespuestaPaso> => { enviados.push(c as unknown as Record<string, unknown>); return { estado: 'ok', respuesta: respuestaParar('ambiguo', 'prueba'), leaseHasta: null } },
      log: (m, d) => { lineas.push({ m, d }) },
    }
    return { k, enviados, lineas }
  }

  test('bucle con el defecto: la petición NO lleva vistaAria y es la de siempre; en dom no se loguea métrica', async () => {
    const { context, page, guard } = await nueva()
    try {
      const { k, enviados, lineas } = contexto(page, guard, {})
      await bucleExploracion(page, k)
      assert.equal(enviados.length, 1)
      assert.deepEqual(Object.keys(enviados[0]).sort(), ['avancesFallidos', 'inventario', 'trabajoId'])
      assert.equal(lineas.find((l) => l.m === 'exploracion_vista'), undefined) // dom: ni medir ni loguear
    } finally { await context.close() }
  })

  test('bucle en ambas: la petición lleva vistaAria redactada además del inventario, y la métrica los dos tamaños', async () => {
    const { context, page, guard } = await nueva()
    try {
      const { k, enviados, lineas } = contexto(page, guard, { TARIFICADOR_EXPLORADOR_VISTA: 'ambas' })
      await bucleExploracion(page, k)
      assert.ok(enviados[0].inventario)
      assert.equal(typeof enviados[0].vistaAria, 'string')
      assert.doesNotMatch(String(enviados[0].vistaAria), /Pepa|12345678Z/)
      const m = lineas.find((l) => l.m === 'exploracion_vista')!.d!
      assert.equal(m.modo, 'ambas')
      assert.equal(m.efectivo, 'ambas')
      assert.ok((m.ariaChars as number) > 0 && (m.domChars as number) > 0)
    } finally { await context.close() }
  })

  test('bucle: si el snapshot falla, cae a dom y la exploración sigue', async () => {
    const { context, page, guard } = await nueva()
    try {
      page.ariaSnapshot = async () => { throw new Error('sin snapshot') }
      const { k, enviados, lineas } = contexto(page, guard, { TARIFICADOR_EXPLORADOR_VISTA: 'aria' })
      await bucleExploracion(page, k)
      assert.equal(enviados.length, 1)
      assert.equal(enviados[0].vistaAria, undefined)
      const m = lineas.find((l) => l.m === 'exploracion_vista')!.d!
      assert.equal(m.efectivo, 'dom')
    } finally { await context.close() }
  })
})

test('modo `dom`: no se serializa el inventario para medir ni se loguea exploracion_vista (solo con otro modo)', async () => {
  const { readFileSync } = await import('node:fs')
  const f = readFileSync(new URL('../src/explorador.ts', import.meta.url), 'utf8')
  assert.match(f, /modoVista === 'dom' \? \{ metrica: null, vistaAria: undefined \} : await vistaDelPaso\(page, modoVista, JSON\.stringify\(inv\)\.length\)/)
  assert.match(f, /if \(vista\.metrica\) k\.log\('exploracion_vista'/)
  assert.equal((f.match(/k\.log\('exploracion_vista'/g) ?? []).length, 1) // solo el condicionado
})
