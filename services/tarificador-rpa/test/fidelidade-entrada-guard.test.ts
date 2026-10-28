// Fidelidade (28/10/2026) · puertas EXACTAS de la ENTRADA del explorador: «Oficina Virtual» › «Proyecto» › «Nuevo proyecto» › «Simulación».
// Solo con el texto exacto, en https://mediadores.fidelidade.es, en orden, una vez y en la fase de entrada. Portal SINTÉTICO servido
// por `page.route` sobre el origen real (sin red, sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { cerrarFaseEntrada, ENLACES_ENTRADA_AUTORIZADOS, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'

const ORIGEN = 'https://mediadores.fidelidade.es'
let browser: Browser
before(async () => {
  // Sin red real: todo lo que no sea el portal sintético (servido por `page.route`) va a un proxy muerto.
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
after(async () => { await browser.close() })

const html = (textos: string[]) => `<!doctype html><html><body>${textos.map((t, i) => `<a id="e${i}" href="#x">${t}</a>`).join('')}</body></html>`

type G = Awaited<ReturnType<typeof instalarGuardEmision>>
/** Abre una página con esos enlaces en `origen` y ejecuta `fn`; devuelve el error (o null). */
async function probar(textos: string[], fn: (p: import('playwright').Page, g: G) => Promise<void>, origen = ORIGEN) {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${origen}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html(textos) }))
    await page.goto(`${origen}/OPI_ES_Mediadores/`)
    try {
      await fn(page, guard)
      return null
    } catch (e) {
      return e as Error
    }
  } finally {
    await context.close()
  }
}

const RUTA = ['Oficina Virtual', 'Proyecto', 'Nuevo proyecto', 'Simulación']

test('la lista de Fidelidade es EXACTAMENTE la ruta acordada (nada más)', () => {
  assert.deepEqual([...ENLACES_ENTRADA_AUTORIZADOS.fidelidade], RUTA)
})

test('(a) la ruta completa pasa, en orden, en el origen de Fidelidade', async () => {
  const e = await probar(RUTA, async (p, g) => {
    for (let i = 0; i < RUTA.length; i++) await pulsarEnlaceEntradaAutorizado(p.locator(`#e${i}`), g, 'fidelidade')
  })
  assert.equal(e, null, String(e))
})

test('(a) mayúsculas (CSS) y espacios de más pasan', async () => {
  const e = await probar(['  OFICINA   VIRTUAL '], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'))
  assert.equal(e, null, String(e))
})

for (const t of ['EMPRESAS', 'Ver póliza', 'Ver siniestro', 'INFORMACIÓN DE GESTIÓN', 'PRODUCTOS', 'NORMAS', 'CONDICIONADOS', 'Simulación y emisión', 'Nuevo proyecto empresas', 'Emitir']) {
  test(`(b) «${t}» NO pasa por la excepción de Fidelidade`, async () => {
    const e = await probar([t], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'))
    assert.match(String(e), /guard_emision/)
  })
}

test('(c) fuera del origen de Fidelidade NO pasa (otro host, y http)', async () => {
  for (const origen of ['https://otro.example.com', 'https://mediadores.fidelidade.es.evil.example', 'http://mediadores.fidelidade.es']) {
    const e = await probar(['Oficina Virtual'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'), origen)
    assert.match(String(e), /fuera de https:\/\/mediadores\.fidelidade\.es/, origen)
  }
})

test('(c) fuera de orden NO pasa: «Simulación» sin «Nuevo proyecto» y «Proyecto» sin «Oficina Virtual»', async () => {
  const sim = await probar(['Simulación'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'))
  assert.match(String(sim), /va después de «nuevo proyecto»/)
  const proy = await probar(['Proyecto'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'))
  assert.match(String(proy), /va después de «oficina virtual»/)
})

test('(c) cada etiqueta una sola vez por trabajo', async () => {
  const e = await probar(['Oficina Virtual', 'Oficina Virtual'], async (p, g) => {
    await pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade')
    await pulsarEnlaceEntradaAutorizado(p.locator('#e1'), g, 'fidelidade')
  })
  assert.match(String(e), /ya se usó/)
})

test('(c) el mismo texto por el `pulsar` genérico y con la fase de entrada cerrada: la excepción no existe fuera de la entrada', async () => {
  const cerrada = await probar(['Oficina Virtual'], async (p, g) => { cerrarFaseEntrada(g); await pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade') })
  assert.match(String(cerrada), /fuera de la fase de entrada/)
})

test('(c) la lista de Fidelidade no vale para otra compañía, ni la de Mapfre para Fidelidade', async () => {
  const otra = await probar(['Oficina Virtual'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'allianz'))
  assert.match(String(otra), /no autorizado para allianz/)
  const mapfre = await probar(['Tarificación y Emisión Rápida'], (p, g) => pulsarEnlaceEntradaAutorizado(p.locator('#e0'), g, 'fidelidade'))
  assert.match(String(mapfre), /guard_emision/)
})

test('(c) «Emisión»/«Contratar» camuflados en el href o el id del enlace exacto siguen bloqueando', async () => {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<a id="emitirPoliza" href="#x">Oficina Virtual</a>' }))
    await page.goto(`${ORIGEN}/OPI_ES_Mediadores/`)
    await assert.rejects(() => pulsarEnlaceEntradaAutorizado(page.locator('#emitirPoliza'), guard, 'fidelidade'), /guard_emision/)
  } finally {
    await context.close()
  }
})

test('el `pulsar` genérico NO se ensancha: «Aceptar» sigue bloqueado en el origen de Fidelidade', async () => {
  const e = await probar(['Aceptar'], (p, g) => pulsar(p.locator('#e0'), g))
  assert.match(String(e), /guard_emision/)
})

test('(c2) la MISMA etiqueta exacta dentro de un iframe de OTRO origen se rechaza aunque la página de arriba sea la de Fidelidade', async () => {
  const OTRO = 'https://otro.example.com'
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><iframe id="f" src="${OTRO}/f"></iframe></body></html>` }))
    await page.route(`${OTRO}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html(['Oficina Virtual']) }))
    await page.goto(`${ORIGEN}/OPI_ES_Mediadores/`)
    const marco = page.frameLocator('#f')
    await marco.locator('#e0').waitFor()
    await assert.rejects(pulsarEnlaceEntradaAutorizado(marco.locator('#e0'), guard, 'fidelidade'), /fuera de https:\/\/mediadores\.fidelidade\.es/)
  } finally {
    await context.close()
  }
})
