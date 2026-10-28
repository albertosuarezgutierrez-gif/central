// Cepos de la ENTRADA CERRADA del explorador (13/10/2026): `allianz:particulares:hogar` entra por el MISMO helper que el
// adaptador real de Comunidades (`abrirNuevaAlta`: «Nueva Alta» → «Particulares» → producto por texto EXACTO), y si la
// entrada muere antes del primer paso el error sale con la evidencia del flujo real (URL, captura y HTML redactado).
// Portal SINTÉTICO en 127.0.0.1 (el resto de la red, a un proxy muerto). Sin datos personales ni nombres de mediador.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { ENTRADAS_EXPLORACION } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { abrirNuevaAlta, esperarMarcoApp, etiquetaProducto, NOMBRE_MARCO_APP, type PestanaEntradaAllianz } from '../src/adapters/allianz/entrada.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { cuerpoTrasCierre, finDeEntrada, resultadoDeFin } from '../src/explorador.ts'

// Compuesto en runtime: un literal con pinta de clave dispara gitleaks (ver .gitleaks.toml).
const SECRETO = ['clave', 'sintetica', 'de', 'prueba'].join('-')

/**
 * Home con «Nueva Alta» → diálogo con ACORDEONES PLEGADOS (Autos · Particulares · Empresas · Vida y Salud); en
 * «Particulares», una rejilla de tiles (icono + texto). Las palabras de cada tile van en nodos separados (como un tile con
 * el texto partido en dos líneas).
 */
const HOME = (productos: string[], cargaApp: string | null = null) => `<!doctype html><html><head><meta charset="utf-8"><title>home</title><script>window.CARGA_APP = ${JSON.stringify(cargaApp)}</script></head><body>
  <span id="cab">${SECRETO}</span>
  <input id="buscador" type="text" aria-label="Buscar póliza">
  <button id="link_new_policy" onclick="document.getElementById('m').hidden=false">Nueva Alta</button>
  <div id="m" role="dialog" hidden>
    <h2>Nueva Alta</h2>
    <div class="acordeon"><div class="cab" onclick="plegar('autos')">Autos</div>
      <div id="autos" hidden><div class="box"><a onclick="elegir('Moto')"><i class="icono"></i>Moto</a></div></div></div>
    <div class="acordeon"><div class="cab" onclick="plegar('part')">Particulares</div>
      <div id="part" hidden>${productos.map((p) => `<div class="box"><a onclick="elegir('${p}')"><i class="icono"></i> ${p.split(' ').map((w) => `<span>${w}</span>`).join('<br>')} </a></div>`).join('')}</div></div>
    <div class="acordeon"><div class="cab" onclick="plegar('emp')">Empresas</div><div id="emp" hidden></div></div>
    <div class="acordeon"><div class="cab" onclick="plegar('vys')">Vida y Salud</div><div id="vys" hidden></div></div>
  </div>
  <script>
    window.elegido = null
    function plegar(id) { const s = document.getElementById(id); s.hidden = !s.hidden }
    function elegir(p) {
      window.elegido = p
      // /con-app*: como ePAC, el modal se cierra y la app del producto entra RETRASADA en el iframe appArea.
      if (!window.CARGA_APP) return
      setTimeout(() => {
        document.getElementById('m').hidden = true
        const f = document.createElement('iframe'); f.id = 'appArea'; f.name = 'appArea'; f.src = window.CARGA_APP
        document.body.appendChild(f)
      }, 3000) // holgado: el inventario «antes» (1 marco) tiene que caer siempre dentro de este retraso, también en CI lento
    }
  </script></body></html>`

// Rejilla de Particulares (etiquetas de la captura real) + señuelos SINTÉTICOS que CONTIENEN «Allianz HOGAR» o «Hogar» sin
// serlo (van antes en la rejilla: un `.first()` sobre un «contiene» los pulsaría).
const SENUELOS = ['Allianz HOGAR Joven', 'Hogar', 'Multirriesgo Hogar']
const REJILLA = ['Allianz Negocio Plus', 'Decesos Prima periódica', 'Allianz Accidentes Plus', 'Comunidades', 'Embarcaciones', 'Allianz Mascotas']
const CON_HOGAR = [...SENUELOS, 'Allianz HOGAR', ...REJILLA]
const SIN_HOGAR = [...SENUELOS, ...REJILLA]

/** Formulario SINTÉTICO del producto dentro de `appArea` (etiquetas genéricas, sin valores). */
const APP_HOGAR = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>Datos del riesgo</h2>
  <label for="sup">Superficie construida</label><input id="sup" name="sup" type="text">
  <label for="tipo">Tipo de vivienda</label><select id="tipo" name="tipo"><option value="1">Piso</option><option value="2">Unifamiliar</option></select>
  </body></html>`

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (ruta === '/app') return void res.end(APP_HOGAR)
    if (ruta === '/app-vacia') return void res.end('<!doctype html><html><body><p>Cargando…</p><input type="hidden" name="t"></body></html>')
    const cargaApp = ruta === '/con-app' ? '/app' : ruta === '/con-app-vacia' ? '/app-vacia' : ruta === '/con-app-blank' ? 'about:blank' : null
    res.end(HOME(ruta === '/sin-hogar' ? SIN_HOGAR : CON_HOGAR, cargaApp))
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

async function abrir(ruta = '/'): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(`${base}${ruta}`)
  return { context, page, guard }
}

const ctxDe = (guard: GuardEmision) => ({ pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard), pausa: async () => undefined })

test('la entrada de Hogar es la de Comunidades con otro producto: Particulares + «Allianz HOGAR»', () => {
  const hogar = ENTRADAS_EXPLORACION['allianz:particulares:hogar']
  const comunidades = ENTRADAS_EXPLORACION['allianz:particulares:comunidades']
  assert.equal(hogar.pestana, 'Particulares')
  assert.equal(hogar.productoMenu, 'Allianz HOGAR')
  assert.equal(comunidades.pestana, hogar.pestana)
  assert.equal(comunidades.productoMenu, 'Comunidades')
})

test('la entrada de Movilidad Personal (patinete) es Autos + «Movilidad Personal», sin avances, ramo patinete', () => {
  const e = ENTRADAS_EXPLORACION['allianz:autos:movilidad_personal']
  assert.equal(e.compania, 'allianz')
  assert.equal(e.ramo, 'patinete')
  assert.equal(e.pestana, 'Autos')
  assert.equal(e.productoMenu, 'Movilidad Personal')
  assert.equal(e.avancesAutorizados.length, 0)
  assert.match('Movilidad Personal', etiquetaProducto(e.productoMenu))
  assert.doesNotMatch('Movilidad Personal Plus', etiquetaProducto(e.productoMenu))
})

for (const [entrada, tile] of [['allianz:particulares:hogar', 'Allianz HOGAR'], ['allianz:particulares:comunidades', 'Comunidades']] as const) {
  test(`abrirNuevaAlta (helper del adaptador real): Nueva Alta → despliega Particulares → tile «${tile}» por etiqueta exacta`, async () => {
    const { context, page, guard } = await abrir()
    try {
      const e = ENTRADAS_EXPLORACION[entrada]
      await abrirNuevaAlta(page, ctxDe(guard), { pestana: e.pestana as PestanaEntradaAllianz, producto: e.productoMenu })
      // El EXACTO, no un señuelo que lo contiene (que va antes en la rejilla).
      assert.equal(await page.evaluate(() => (window as unknown as { elegido: string | null }).elegido), tile)
      assert.equal(guard.violacion(), null)
    } finally {
      await context.close()
    }
  })
}

test('etiquetaProducto: entera, sin mayúsculas, tolerante al espacio entre palabras; nunca «contiene»', () => {
  const r = etiquetaProducto('Allianz HOGAR')
  for (const ok of ['Allianz HOGAR', '  allianz hogar ', 'Allianz\nHOGAR', 'AllianzHOGAR']) assert.match(ok, r, ok)
  for (const no of ['Allianz HOGAR Joven', 'Hogar', 'Multirriesgo Allianz HOGAR', 'Allianz Negocio Plus']) assert.doesNotMatch(no, r, no)
  assert.match(' COMUNIDADES ', etiquetaProducto('Comunidades'))
  assert.doesNotMatch('Comunidades 2020', etiquetaProducto('Comunidades'))
})

test('sin «Allianz HOGAR» en la rejilla (solo nombres que lo contienen): no pulsa ningún parecido y la entrada falla con evidencia redactada', async () => {
  const { context, page, guard } = await abrir('/sin-hogar')
  try {
    let error: unknown = null
    await abrirNuevaAlta(page, ctxDe(guard), { pestana: 'Particulares', producto: 'Allianz HOGAR' }).catch((e: unknown) => { error = e })
    assert.ok(error, 'tenía que fallar')
    assert.equal(await page.evaluate(() => (window as unknown as { elegido: string | null }).elegido), null)

    const env = { CRED_ALLIANZ_EPAC_PASS: SECRETO }
    const fin = await finDeEntrada(error, page, (t) => t.split(SECRETO).join('[redactado]'), env)
    assert.equal(fin.motivo, 'error_portal')
    assert.equal(fin.error?.tipo, 'portal')
    assert.equal(fin.pasos, 0)
    assert.equal(fin.evidencia?.url, `${base}/sin-hogar`)
    assert.ok((fin.evidencia?.capturaBase64 ?? '').length > 100, 'sin captura')
    const html = fin.evidencia?.html ?? ''
    assert.match(html, /Multirriesgo/, 'el HTML tiene que enseñar la rejilla real')
    assert.ok(!html.includes(SECRETO), 'el HTML sale sin secretos')

    const cuerpo = resultadoDeFin('00000000-0000-4000-8000-000000000001', 'allianz', fin, (t) => t)
    assert.ok(cuerpo && cuerpo.resultado === 'error')
    assert.equal(cuerpo.error.url, `${base}/sin-hogar`)
    assert.equal(cuerpo.capturaBase64, fin.evidencia?.capturaBase64)
    assert.equal(cuerpo.html, html)
    // La cabecera cerrada o no, el error de la entrada conserva su evidencia.
    const tras = cuerpoTrasCierre('00000000-0000-4000-8000-000000000001', 'allianz', fin, 200, (t) => t)
    assert.ok(tras && tras.resultado === 'error' && tras.error.url === `${base}/sin-hogar` && tras.html === html)
  } finally {
    await context.close()
  }
})

// ─── Espera del iframe `appArea` tras el tile (13/10/2026) ───────────────────
// Exploración real de «Allianz HOGAR»: el paso 1 se inventarió con el modal aún abierto y UN marco (la carcasa), sin
// `appArea`. La entrada del explorador espera ahora al marco de la app con un control visible (`esperarMarcoApp`).

test('tras el tile, esperarMarcoApp espera al iframe appArea con controles: el inventario ve 2 marcos, con el formulario', async () => {
  const { context, page, guard } = await abrir('/con-app')
  try {
    await abrirNuevaAlta(page, ctxDe(guard), { pestana: 'Particulares', producto: 'Allianz HOGAR' })
    // Lo que pasaba: inventario justo tras el tile → solo la carcasa.
    const antes = await capturarInventarioExploracion(page)
    assert.equal(antes?.inventario.marcos.length, 1)
    await antes?.liberar()

    const marco = await esperarMarcoApp(page, 5_000)
    assert.equal(marco.name(), NOMBRE_MARCO_APP)
    assert.equal(new URL(marco.url()).pathname, '/app')
    const tras = await capturarInventarioExploracion(page)
    try {
      assert.equal(tras?.inventario.marcos.length, 2)
      const app = tras!.inventario.marcos.find((m) => m.nombre === NOMBRE_MARCO_APP)
      assert.ok(app, 'falta el marco appArea en el inventario')
      assert.ok(app.elementos.some((e) => e.tag === 'select'), 'el formulario del producto tiene que estar en el inventario')
      assert.ok((app.titulos ?? []).some((t) => /datos del riesgo/i.test(t)), 'falta el título del formulario')
    } finally {
      await tras?.liberar()
    }
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

for (const [ruta, que] of [['/', 'sin iframe appArea'], ['/con-app-blank', 'appArea en about:blank'], ['/con-app-vacia', 'appArea sin ningún control visible']] as const) {
  test(`esperarMarcoApp falla como error de PORTAL (con evidencia) si no carga: ${que}`, async () => {
    const { context, page, guard } = await abrir(ruta)
    try {
      await abrirNuevaAlta(page, ctxDe(guard), { pestana: 'Particulares', producto: 'Allianz HOGAR' })
      let error: unknown = null
      await esperarMarcoApp(page, 2_000).catch((e: unknown) => { error = e })
      assert.ok(error instanceof ErrorTarificador, 'tenía que fallar con ErrorTarificador')
      assert.equal(error.tipo, 'portal')
      const fin = await finDeEntrada(error, page, (t) => t, {})
      assert.equal(fin.motivo, 'error_portal')
      assert.equal(fin.pasos, 0)
    } finally {
      await context.close()
    }
  })
}
