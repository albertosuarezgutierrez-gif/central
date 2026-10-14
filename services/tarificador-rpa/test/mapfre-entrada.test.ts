// Entrada de Mapfre Auto (14/10/2026): menús → enlace que abre PESTAÑA NUEVA → formulario NSEI. Portal SINTÉTICO en
// 127.0.0.1, sin datos personales. La pestaña nueva responde 401 + WWW-Authenticate (el diálogo HTTP del portal real):
// sin `httpCredentials` en el contexto Chromium lo cancela y se queda el cuerpo (el formulario).
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { ENTRADAS_EXPLORACION } from '@central/module-tarificacion'
import { cerrarFaseEntrada, instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado, ENLACES_ENTRADA_AUTORIZADOS } from '../src/guard.ts'
import { entrarYExplorar, resultadoDeFin, type ContextoBucle, type CtxEntrada, type PortalExploracion } from '../src/explorador.ts'
import type { RespuestaPaso } from '../src/api.ts'
import { abrirTarificacionRapidaAuto, etiquetaExacta } from '../src/adapters/mapfre/entrada.ts'
import { ErrorMapaIncompleto } from '../src/adapters/mapfre/auto.ts'

const HOME = `<!doctype html><html><body>
  <nav><a role="tab" onclick="mostrar('np')">Inicio</a><a role="tab" onclick="mostrar('menu')">Nueva producción</a></nav>
  <ul id="menu" hidden>
    <li><a role="menuitem" onclick="mostrar('pag')">Agropecuaria</a></li>
    <li><a role="menuitem" id="auto" onclick="mostrar('pag')">Automóviles</a></li>
    <li><a role="menuitem" onclick="mostrar('pag')">Empresas</a></li>
    <li><a role="menuitem" onclick="mostrar('pag')">Vida</a></li></ul>
  <div id="pag" hidden>
    <h1>Automóviles</h1>
    <div class="tarjeta" id="patinetes"><h3>Patinetes</h3>
      <a href="/otro-patinetes" target="_blank">Tarificación y Emisión Rápida</a></div>
    <div class="tarjeta" id="camiones"><h3>Camiones, Autobuses y vehículos Industriales</h3>
      <a href="/otro-camiones" target="_blank">Tarificación y Emisión</a></div>
    <div class="tarjeta" id="turismos"><h3 id="tm" onclick="window.tmPulsado=1">Turismos y Motos</h3>
      <a href="/otro-general" target="_blank">Tarificación y Emisión (General)</a>
      <a id="tr" href="/nsei" target="_blank">Tarificación y Emisión Rápida</a>
      <a href="/otro-acuerdos" target="_blank">Tarificación y Emisión (Otros Acuerdos)</a></div>
    <div class="tarjeta"><h3>Flotas</h3><a href="/otro-flotas" target="_blank">Tarificación y Emisión Rápida Pro</a></div>
  </div>
  <script>function mostrar(id){document.getElementById(id).hidden=false}</script></body></html>`
/** El texto exacto en un SPAN dentro de un <a> SIN href (sin rol «link») cuyo onclick emite: el guard tiene que ver el <a>. */
const HOME_SPAN_EMITIR = HOME.replace(
  '<a id="tr" href="/nsei" target="_blank">Tarificación y Emisión Rápida</a>',
  '<a id="tr" onclick="emitirPoliza()"><span>Tarificación y Emisión Rápida</span></a><script>function emitirPoliza(){window.emitido=1}</script>',
)
const NSEI = '<!doctype html><html><body><app-datos-basicos><label for="f1">Fecha Condiciones</label><input id="f1" name="f1"><label for="f2">Fecha de mecanización</label><input id="f2" name="f2"><button id="sig" type="button">Siguiente</button></app-datos-basicos></body></html>'
/** Etiquetas de menú SINTÉTICAS para probar la excepción del guard una a una (cada una en su enlace con id). */
const MENU = (textos: string[]) => `<!doctype html><html><body>${textos.map((t, i) => `<a id="e${i}" href="/nada">${t}</a>`).join('')}</body></html>`
const SIN_NSEI = '<!doctype html><html><body><p>Cargando…</p></body></html>'

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]
    if (ruta === '/menu') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return void res.end(MENU(JSON.parse(Buffer.from((req.url ?? '').split('?b=')[1] ?? '', 'base64url').toString('utf8') || '[]')))
    }
    if (ruta === '/nada') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return void res.end('<!doctype html><html><body>ok</body></html>')
    }
    if (ruta === '/nsei' || ruta === '/nsei-vacio') {
      // Desafío de auth básica con el formulario ya en el cuerpo (como el portal real tras cancelar el diálogo).
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'WWW-Authenticate': 'Basic realm="sintetico"' })
      return void res.end(ruta === '/nsei' ? NSEI : SIN_NSEI)
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (ruta === '/span-trampa') return void res.end(HOME_SPAN_EMITIR)
    res.end(HOME.replace('href="/nsei"', `href="${ruta === '/vacio' ? '/nsei-vacio' : '/nsei'}"`))
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
  const context = await browser.newContext() // sin httpCredentials, como el explorador
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(`${base}${ruta}`)
  const pulsados: string[] = []
  // `pulsar` de prueba SIN guard (registra qué se pulsa); `ctxGuard` es el real: guard genérico + excepción exacta de Mapfre.
  const sinGuard = async (b: Parameters<typeof pulsar>[0]) => { pulsados.push(((await b.textContent()) ?? '').trim()); await b.click() }
  const ctx = { pulsar: sinGuard, pulsarEnlaceEntrada: sinGuard, pausa: async () => undefined }
  const ctxGuard = {
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'mapfre'),
    pausa: async () => undefined,
  }
  return { context, page, guard, ctx, ctxGuard, pulsados }
}

test('menús → pestaña nueva → formulario NSEI detectado (y el 401 de auth no lo tapa)', async () => {
  const { context, page, ctx, pulsados, guard } = await abrir('/')
  try {
    const nueva = await abrirTarificacionRapidaAuto(page, ctx)
    assert.notEqual(nueva, page)
    assert.equal(context.pages().length, 2)
    assert.match(nueva.url(), /\/nsei$/)
    assert.equal(await nueva.locator('app-datos-basicos').count(), 1)
    assert.ok(await nueva.getByText('Fecha Condiciones').isVisible())
    // Solo los textos exactos, en orden; ni los señuelos que los contienen.
    assert.deepEqual(pulsados, ['Nueva producción', 'Automóviles', 'Tarificación y Emisión Rápida'])
    // El enlace pulsado es el de la tarjeta «Turismos y Motos» (no el homónimo de Patinetes, que va antes en el DOM).
    assert.ok(!pulsados.includes('Turismos y Motos'))
    assert.equal(await page.evaluate(() => (window as unknown as { tmPulsado?: number }).tmPulsado ?? 0), 0, 'el título de la tarjeta no se pulsa')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('formulario ausente en la pestaña nueva → ErrorMapaIncompleto', async () => {
  const { context, page, ctx } = await abrir('/vacio')
  try {
    // timeout del formulario corto no es configurable: 30 s reales; se acota el test.
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { formularioMs: 1_500 }), (e) => e instanceof ErrorMapaIncompleto && /NSEI/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('sin el menú «Nueva producción» → ErrorMapaIncompleto (no se adivina)', async () => {
  const { context, page, ctx } = await abrir('/')
  try {
    await page.evaluate(() => { document.querySelectorAll('[role=tab]').forEach((e) => { if (e.textContent === 'Nueva producción') e.remove() }) })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), (e) => e instanceof ErrorMapaIncompleto && /Nueva producción/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('sin la opción «Automóviles» en el desplegable → ErrorMapaIncompleto y no se pulsa nada más', async () => {
  const { context, page, ctx, pulsados } = await abrir('/')
  try {
    await page.evaluate(() => { document.getElementById('auto')?.remove() })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), (e) => e instanceof ErrorMapaIncompleto && /Automóviles/.test((e as Error).message))
    assert.deepEqual(pulsados, ['Nueva producción'])
  } finally {
    await context.close()
  }
})

test('sin la tarjeta «Turismos y Motos» → ErrorMapaIncompleto (no se pulsa el enlace homónimo de otra tarjeta)', async () => {
  const { context, page, ctx, pulsados } = await abrir('/')
  try {
    await page.evaluate(() => { document.getElementById('tm')?.remove() })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), (e) => e instanceof ErrorMapaIncompleto && /Turismos y Motos/.test((e as Error).message))
    assert.deepEqual(pulsados, ['Nueva producción', 'Automóviles'])
  } finally {
    await context.close()
  }
})

test('sin el enlace «Tarificación y Emisión Rápida» en la tarjeta → ErrorMapaIncompleto (Patinetes tiene uno igual y NO se usa)', async () => {
  const { context, page, ctx, pulsados } = await abrir('/')
  try {
    await page.evaluate(() => { document.getElementById('tr')?.remove() })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), (e) => e instanceof ErrorMapaIncompleto && /Tarificación y Emisión Rápida/.test((e as Error).message))
    assert.deepEqual(pulsados, ['Nueva producción', 'Automóviles'])
  } finally {
    await context.close()
  }
})

test('sin el título de la página «Automóviles» → ErrorMapaIncompleto', async () => {
  const { context, page, ctx } = await abrir('/')
  try {
    await page.evaluate(() => { document.querySelector('h1')?.remove() })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), (e) => e instanceof ErrorMapaIncompleto && /título/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('etiquetaExacta: entera, sin mayúsculas; nunca «contiene»', () => {
  assert.match(' turismos  y motos ', etiquetaExacta('Turismos y Motos'))
  assert.doesNotMatch('Turismos y Motos Clásicos', etiquetaExacta('Turismos y Motos'))
})

test('entrada cerrada de Mapfre: pestaña/producto fijos y sin avances autorizados', () => {
  const e = ENTRADAS_EXPLORACION['mapfre:nueva_produccion:auto']
  assert.equal(e.compania, 'mapfre')
  assert.equal(e.pestana, 'Nueva producción')
  assert.equal(e.productoMenu, 'Turismos y Motos')
  assert.deepEqual([...e.avancesAutorizados], [])
})

test('el contexto del explorador NO lleva httpCredentials (el diálogo HTTP se cancela → 401)', () => {
  for (const f of ['../src/explorador.ts', '../src/adapters/mapfre/entrada.ts', '../src/adapters/mapfre/login.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /httpCredentials|setHTTPCredentials/, f)
  }
})

test('el guard REAL deja entrar por «Tarificación y Emisión Rápida» en la entrada de Mapfre (pestaña nueva, sin violación)', async () => {
  const { context, page, ctxGuard, guard } = await abrir('/')
  try {
    const nueva = await abrirTarificacionRapidaAuto(page, ctxGuard)
    assert.match(nueva.url(), /\/nsei$/)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('el mismo enlace por el `pulsar` genérico (el del bucle IA y del resto de portales) sigue BLOQUEADO', async () => {
  const { context, page, ctxGuard } = await abrir('/')
  try {
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, { ...ctxGuard, pulsarEnlaceEntrada: ctxGuard.pulsar }), /guard_emision/)
  } finally {
    await context.close()
  }
})

test('el texto del enlace en un span dentro de un <a> que emite: el guard mira el <a> (onclick) y NO pulsa', async () => {
  const { context, page, ctxGuard } = await abrir('/span-trampa')
  try {
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctxGuard, { menuMs: 2_000 }), /guard_emision/)
    assert.equal(await page.evaluate(() => (window as unknown as { emitido?: number }).emitido ?? 0), 0)
  } finally {
    await context.close()
  }
})

// ─── Excepción EXACTA del guard (lista cerrada de etiquetas de menú de Mapfre) ─────────────────────────────

/** Pulsa por la excepción el enlace con ese texto; devuelve el error (o null si pasó). */
async function probarEnlace(texto: string, opciones: { compania?: string; tras?: (g: Awaited<ReturnType<typeof instalarGuardEmision>>) => void; generico?: boolean } = {}) {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    // El texto va en base64url: «Emisión» en la URL lo abortaría el guard de red (como debe).
    await page.goto(`${base}/menu?b=${Buffer.from(JSON.stringify([texto])).toString('base64url')}`)
    opciones.tras?.(guard)
    const l = page.locator('#e0')
    try {
      if (opciones.generico) await pulsar(l, guard)
      else await pulsarEnlaceEntradaAutorizado(l, guard, opciones.compania ?? 'mapfre')
      return null
    } catch (e) {
      return e as Error
    }
  } finally {
    await context.close()
  }
}

for (const t of ENLACES_ENTRADA_AUTORIZADOS.mapfre) {
  test(`(a) «${t}» exacto pasa en la entrada de Mapfre`, async () => {
    assert.equal(await probarEnlace(t), null)
  })
}
test('(a) normalización: mayúsculas (CSS) y espacios de más pasan', async () => {
  assert.equal(await probarEnlace('  TARIFICACIÓN   y emisión rápida '), null)
})
test('(a) «Tarificación y emisión» (minúscula) pasa', async () => {
  assert.equal(await probarEnlace('Tarificación y emisión'), null)
})
for (const t of ['Emisión Rápida', 'Emitir', 'Tarificación y Emisión Rápida Pro', 'Ir a Tarificación y Emisión Rápida', 'Tarificación y Emisión (General) y emitir', 'Contratar']) {
  test(`(b) «${t}» NO pasa por la excepción`, async () => {
    assert.match(String(await probarEnlace(t)), /guard_emision/)
  })
}
test('(b) el motivo de bloqueo lleva el TEXTO EXACTO del elemento y llega así al resultado de plataforma', async () => {
  const e = await probarEnlace('Tarificación y Emisión Rápida Pro')
  const cuerpo = resultadoDeFin('t', 'mapfre', { motivo: 'guard_emision', error: { tipo: 'emision', mensaje: e!.message }, evidencia: undefined }, (x) => x)!
  assert.ok(cuerpo.resultado === 'error' && cuerpo.error.mensaje.includes('«Tarificación y Emisión Rápida Pro»'), JSON.stringify(cuerpo))
})
test('(c) el texto exacto desde el bucle IA (pulsar genérico) NO pasa', async () => {
  assert.match(String(await probarEnlace('Tarificación y Emisión Rápida', { generico: true })), /guard_emision/)
})
test('(c) el texto exacto con la fase de entrada ya cerrada (bucle empezado) NO pasa', async () => {
  assert.match(String(await probarEnlace('Tarificación y Emisión Rápida', { tras: cerrarFaseEntrada })), /fuera de la fase de entrada/)
})
test('(c) el texto exacto desde otro portal (allianz) NO pasa', async () => {
  assert.match(String(await probarEnlace('Tarificación y Emisión Rápida', { compania: 'allianz' })), /no autorizado para allianz/)
})

// ─── Pestaña nueva: el bucle sigue en la página que devuelve `entrar` ─────────────────────────────

function ctxBucle(guard: Awaited<ReturnType<typeof instalarGuardEmision>>, vistos: string[], guion: (n: number, pagina: import('playwright').Page, inv: { marcos: { elementos: { id?: string; ref?: string }[] }[] }) => Promise<unknown>) {
  return (pagina: import('playwright').Page): ContextoBucle => ({
    trabajoId: '00000000-0000-4000-8000-000000000002', // ramo 'hogar': el de auto aún NO tiene catálogo de exploración (todo lote sería no válido); aquí solo importa la página.
    compania: 'mapfre', ramo: 'hogar', entrada: 'mapfre:nueva_produccion:auto',
    conDatosReales: false, riesgo: {}, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pulsarAutorizado: async () => { throw new Error('sin avances autorizados en Mapfre') },
    pulsarGuardado: async () => { throw new Error('sin guardado en esta prueba') },
    pausaAccion: async () => undefined,
    pedirPaso: async (c): Promise<RespuestaPaso> => {
      vistos.push(c.inventario.marcos.flatMap((m) => m.elementos.map((e) => e.etiqueta ?? e.texto ?? '')).join('|'))
      return { estado: 'ok', respuesta: await guion(vistos.length, pagina, c.inventario), leaseHasta: null }
    },
    log: () => undefined,
  })
}
const portalFalso: PortalExploracion = { credencial: 'X', entrar: (page, ctx) => abrirTarificacionRapidaAuto(page, ctx) }
const resp = (acciones: unknown[]) => ({ version: 1, pantalla: { nombre: 'P', tipo: 'formulario' }, acciones, mapeo: [], motivo: null })

test('pestaña nueva: el bucle inventaría la página DEVUELTA por `entrar` (NSEI) y la original no cuenta como ventana nueva', async () => {
  const { context, page, ctxGuard, guard } = await abrir('/')
  try {
    const vistos: string[] = []
    const fin = await entrarYExplorar(page, portalFalso, ctxGuard as unknown as CtxEntrada, ENTRADAS_EXPLORACION['mapfre:nueva_produccion:auto'], {
      guard, redactar: (t) => t, env: {},
      contextoBucle: ctxBucle(guard, vistos, async () => resp([{ accion: 'parar', motivo: 'dato_no_disponible' }])),
    })
    assert.equal(fin.motivo, 'dato_no_disponible', JSON.stringify(fin))
    assert.equal(vistos.length, 1)
    assert.match(vistos[0], /Fecha Condiciones/)
  } finally {
    await context.close()
  }
})

test('pestaña nueva: una ventana abierta DURANTE el bucle sigue parando con sin_salida', async () => {
  const { context, page, ctxGuard, guard } = await abrir('/')
  try {
    const vistos: string[] = []
    const fin = await entrarYExplorar(page, portalFalso, ctxGuard as unknown as CtxEntrada, ENTRADAS_EXPLORACION['mapfre:nueva_produccion:auto'], {
      guard, redactar: (t) => t, env: {},
      contextoBucle: ctxBucle(guard, vistos, async (n, pagina, inv) => {
        if (n > 1) return resp([{ accion: 'parar', motivo: 'dato_no_disponible' }])
        await pagina.context().newPage() // ventana nueva DURANTE el bucle
        const sig = inv.marcos.flatMap((m) => m.elementos).find((e) => e.id === 'sig')!
        return resp([{ accion: 'avanzar', ref: sig.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
      }),
    })
    assert.equal(fin.motivo, 'sin_salida', JSON.stringify(fin))
    assert.equal(vistos.length, 1)
  } finally {
    await context.close()
  }
})
