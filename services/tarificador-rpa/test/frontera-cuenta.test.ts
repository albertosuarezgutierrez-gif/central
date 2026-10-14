// FRONTERA DE EMISIÓN (Alberto, 14/10/2026, TODAS las compañías): sin número de cuenta no se emite. Un control de cuenta
// bancaria en pantalla = el portal ya está en la fase de emisión → el bot PARA sin pulsar nada más y nunca lo rellena.
// Portal SINTÉTICO en 127.0.0.1 (el resto de la red, a un proxy muerto). Sin datos personales: solo etiquetas de campo.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorFronteraEmision, exigirCampoNoBancario, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { bucleExploracion, finDeError, resultadoDeFin, type ContextoBucle } from '../src/explorador.ts'
import type { RespuestaPaso } from '../src/api.ts'

const PAGINAS: Record<string, string> = {
  '/con-iban': '<label for="c">Número de cuenta</label><input id="c" name="c"><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/con-iban-oculto': '<input type="hidden" name="iban"><label for="cp">Código postal</label><input id="cp" name="cp"><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/con-iban-y-enlace': '<input name="ibanTomador" placeholder="IBAN"><a id="e" href="/nada">Tarificación y Emisión Rápida</a>',
  // Regresión Allianz/Occident: <label> que ENVUELVE el select; su texto incluye las opciones («Domiciliación»).
  '/label-envuelve-select': '<label>Forma de pago <select name="fp"><option>Anual</option><option>Domiciliación</option></select></label><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/label-sin-cuenta': '<label>El inmueble no cuenta con alarma <input type="checkbox" name="alarma"></label><label for="of">Oficina de la entidad mediadora</label><input id="of" name="of"><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  // Controles NO nativos (Angular Material / ARIA / contenteditable): solo atributos, nunca su texto.
  '/combobox-iban': '<div role="combobox" aria-label="IBAN" tabindex="0">ES</div><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/textbox-cuenta': '<div role="textbox" aria-label="Número de cuenta" tabindex="0"></div><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/editable-ccc': '<div contenteditable="true" title="CCC" style="min-height:10px"></div><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/mat-select-dom': '<mat-select formcontrolname="domiciliacionBancaria" style="display:block;min-height:10px"></mat-select><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  '/combobox-cp': '<div role="combobox" aria-label="Código postal" tabindex="0">41001</div><button id="b" onclick="window.pulsado=1">Siguiente</button>',
  // Segunda barrera del bucle: un control de cuenta que NO es campo (botón ARIA) — detectarParada no lo mira; la IA lo pide.
  '/boton-domiciliacion': '<h2>Datos del recibo</h2><div id="dom" role="button" tabindex="0" onclick="window.pulsado=1">Domiciliación bancaria</div>',
  '/boton-cuenta': '<h2>Datos del recibo</h2><div id="dom" role="button" tabindex="0" onclick="window.pulsado=1">Número de cuenta</div>',
}

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><body>${PAGINAS[(req.url ?? '/').split('?')[0]] ?? 'ok'}</body></html>`)
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'] }
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
after(async () => {
  await browser?.close()
  await new Promise<void>((r) => servidor.close(() => r()))
})

async function abrir(ruta: string) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(`${base}${ruta}`)
  return { context, guard, page }
}

test('pulsar con un campo de cuenta bancaria visible: ErrorFronteraEmision y NO pulsa', async () => {
  const { context, guard, page } = await abrir('/con-iban')
  try {
    await assert.rejects(() => pulsar(page.locator('#b'), guard), ErrorFronteraEmision)
    assert.equal(await page.evaluate(() => (window as unknown as { pulsado?: number }).pulsado ?? 0), 0)
  } finally {
    await context.close()
  }
})

test('el motivo es legible e incluye la etiqueta del campo', async () => {
  const { context, guard, page } = await abrir('/con-iban')
  try {
    await assert.rejects(() => pulsar(page.locator('#b'), guard), /frontera de emisión: el portal pide cuenta bancaria \(«Número de cuenta»\)/)
  } finally {
    await context.close()
  }
})

test('un input OCULTO con nombre iban no es frontera (solo controles visibles): pulsa', async () => {
  const { context, guard, page } = await abrir('/con-iban-oculto')
  try {
    await pulsar(page.locator('#b'), guard)
    assert.equal(await page.evaluate(() => (window as unknown as { pulsado?: number }).pulsado ?? 0), 1)
  } finally {
    await context.close()
  }
})

test('exigirCampoNoBancario: «Número de cuenta» se rechaza', async () => {
  const { context, page } = await abrir('/con-iban')
  try {
    await assert.rejects(() => exigirCampoNoBancario(page.locator('#c')), ErrorFronteraEmision)
  } finally {
    await context.close()
  }
})

test('exigirCampoNoBancario: «Código postal» pasa', async () => {
  const { context, page } = await abrir('/con-iban-oculto')
  try {
    await exigirCampoNoBancario(page.locator('#cp'))
  } finally {
    await context.close()
  }
})

test('el enlace de entrada autorizado tampoco se pulsa con una cuenta bancaria en pantalla', async () => {
  const { context, guard, page } = await abrir('/con-iban-y-enlace')
  try {
    await assert.rejects(() => pulsarEnlaceEntradaAutorizado(page.locator('#e'), guard, 'mapfre'), ErrorFronteraEmision)
  } finally {
    await context.close()
  }
})

test('bucle IA: pantalla con cuenta bancaria → para cerca_de_emision/frontera_cuenta_bancaria sin preguntar a asegura', async () => {
  const { context, guard, page } = await abrir('/con-iban')
  try {
    let preguntas = 0
    const k: ContextoBucle = {
      trabajoId: '00000000-0000-4000-8000-000000000003', compania: 'mapfre', ramo: 'auto', entrada: 'mapfre:nueva_produccion:auto',
      conDatosReales: false, riesgo: {}, env: {}, guard,
      pulsar: (b) => pulsar(b, guard),
      pulsarAutorizado: async () => { throw new Error('no') },
      pulsarGuardado: async () => { throw new Error('no') },
      pausaAccion: async () => undefined,
      pedirPaso: async (): Promise<RespuestaPaso> => { preguntas++; throw new Error('no se debía preguntar') },
      log: () => undefined,
    }
    const fin = await bucleExploracion(page, k)
    assert.equal(fin.motivo, 'cerca_de_emision')
    assert.equal(fin.detalle, 'frontera_cuenta_bancaria')
    assert.equal(preguntas, 0)
  } finally {
    await context.close()
  }
})

async function pulsado(page: import('playwright').Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { pulsado?: number }).pulsado ?? 0)
}

test('regresión Allianz/Occident: <label> que envuelve un select con la opción «Domiciliación» NO es frontera: pulsa', async () => {
  const { context, guard, page } = await abrir('/label-envuelve-select')
  try {
    await pulsar(page.locator('#b'), guard)
    assert.equal(await pulsado(page), 1)
  } finally {
    await context.close()
  }
})

test('regresión: «no cuenta con alarma» y «Oficina de la entidad mediadora» NO son frontera: pulsa', async () => {
  const { context, guard, page } = await abrir('/label-sin-cuenta')
  try {
    await pulsar(page.locator('#b'), guard)
    assert.equal(await pulsado(page), 1)
  } finally {
    await context.close()
  }
})

for (const [ruta, que] of [
  ['/combobox-iban', '[role=combobox] aria-label IBAN'],
  ['/textbox-cuenta', '[role=textbox] «Número de cuenta»'],
  ['/editable-ccc', '[contenteditable] title CCC'],
  ['/mat-select-dom', 'mat-select formcontrolname domiciliacionBancaria'],
] as const) {
  test(`control NO nativo de cuenta (${que}): ErrorFronteraEmision y NO pulsa`, async () => {
    const { context, guard, page } = await abrir(ruta)
    try {
      await assert.rejects(() => pulsar(page.locator('#b'), guard), ErrorFronteraEmision)
      assert.equal(await pulsado(page), 0)
    } finally {
      await context.close()
    }
  })
}

test('control NO nativo sin cuenta ([role=combobox] «Código postal»): pulsa', async () => {
  const { context, guard, page } = await abrir('/combobox-cp')
  try {
    await pulsar(page.locator('#b'), guard)
    assert.equal(await pulsado(page), 1)
  } finally {
    await context.close()
  }
})

// Al fusionar con main (14/10/2026): «Domiciliación bancaria» como BOTÓN ya lo rechaza antes el validador del módulo
// (ACCIONES_PORTAL, categoría emisión) → `lote_no_valido`. La SEGUNDA barrera del bucle se prueba con un botón que el
// validador no clasifica pero que la frontera sí reconoce («Número de cuenta»).
async function avanzarSobre(ruta: string) {
  const { context, guard, page } = await abrir(ruta)
  try {
    let preguntas = 0
    let pulsaciones = 0
    const lineas: string[] = []
    const k: ContextoBucle = {
      trabajoId: '00000000-0000-4000-8000-000000000004', compania: 'mapfre', ramo: 'auto', entrada: 'mapfre:nueva_produccion:auto',
      conDatosReales: false, riesgo: {}, env: {}, guard,
      pulsar: async () => { pulsaciones++ },
      pulsarAutorizado: async () => { throw new Error('no') },
      pulsarGuardado: async () => { throw new Error('no') },
      pausaAccion: async () => undefined,
      pedirPaso: async (c): Promise<RespuestaPaso> => {
        preguntas++
        const ref = c.inventario.marcos.flatMap((m) => m.elementos).find((e) => e.id === 'dom')?.ref
        return { estado: 'ok', leaseHasta: null, respuesta: { version: 1, pantalla: { nombre: 'P', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null } }
      },
      log: (m, d) => { lineas.push(JSON.stringify({ m, ...(d ?? {}) })) },
    }
    const fin = await bucleExploracion(page, k)
    return { fin, preguntas, pulsaciones, lineas, pulsadoDom: await pulsado(page) }
  } finally {
    await context.close()
  }
}

test('bucle IA, SEGUNDA barrera: la IA pide avanzar sobre un control de cuenta que detectarParada no mira → para sin pulsar', async () => {
  const { fin, preguntas, pulsaciones, lineas, pulsadoDom } = await avanzarSobre('/boton-cuenta')
  assert.equal(fin.motivo, 'cerca_de_emision', JSON.stringify(fin))
  assert.equal(fin.detalle, 'frontera_cuenta_bancaria')
  assert.equal(preguntas, 1) // la primera barrera (detectarParada) no paró: preguntó a asegura
  assert.equal(pulsaciones, 0)
  assert.equal(pulsadoDom, 0)
  assert.ok(lineas.some((l) => l.includes('Número de cuenta')), lineas.join('\n'))
})

test('bucle IA: avanzar sobre el BOTÓN «Domiciliación bancaria» lo rechaza ya el validador (emisión) → para sin pulsar', async () => {
  const { fin, preguntas, pulsaciones, pulsadoDom } = await avanzarSobre('/boton-domiciliacion')
  assert.equal(fin.motivo, 'ambiguo', JSON.stringify(fin))
  assert.equal(fin.detalle, 'lote_no_valido')
  assert.equal(preguntas, 1)
  assert.equal(pulsaciones, 0)
  assert.equal(pulsadoDom, 0)
})

test('finDeError: la frontera es un fin CORRECTO (explorado), no un fallo del guard', () => {
  const f = finDeError(new ErrorFronteraEmision('IBAN'))
  assert.deepEqual(f, { motivo: 'cerca_de_emision', error: null, detalle: 'frontera_cuenta_bancaria' })
  assert.equal(resultadoDeFin('t', 'mapfre', { ...f, evidencia: undefined }, (x) => x)?.resultado, 'explorado')
})

test('un bloqueo de emisión normal sigue siendo error (no se confunde con la frontera)', () => {
  assert.equal(finDeError(new EmisionBloqueadaError('boton', 'Emitir')).motivo, 'guard_emision')
})
