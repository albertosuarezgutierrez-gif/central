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
import { abrirNuevaAlta, etiquetaProducto, type PestanaEntradaAllianz } from '../src/adapters/allianz/entrada.ts'
import { cuerpoTrasCierre, finDeEntrada, resultadoDeFin } from '../src/explorador.ts'

const SECRETO = 'clave-sintetica-de-prueba-9f3a'

/**
 * Home con «Nueva Alta» → diálogo con ACORDEONES PLEGADOS (Autos · Particulares · Empresas · Vida y Salud); en
 * «Particulares», una rejilla de tiles (icono + texto). Las palabras de cada tile van en nodos separados (como un tile con
 * el texto partido en dos líneas).
 */
const HOME = (productos: string[]) => `<!doctype html><html><head><meta charset="utf-8"><title>home</title></head><body>
  <span id="cab">${SECRETO}</span>
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
    function elegir(p) { window.elegido = p }
  </script></body></html>`

// Rejilla de Particulares (etiquetas de la captura real) + señuelos SINTÉTICOS que CONTIENEN «Allianz HOGAR» o «Hogar» sin
// serlo (van antes en la rejilla: un `.first()` sobre un «contiene» los pulsaría).
const SENUELOS = ['Allianz HOGAR Joven', 'Hogar', 'Multirriesgo Hogar']
const REJILLA = ['Allianz Negocio Plus', 'Decesos Prima periódica', 'Allianz Accidentes Plus', 'Comunidades', 'Embarcaciones', 'Allianz Mascotas']
const CON_HOGAR = [...SENUELOS, 'Allianz HOGAR', ...REJILLA]
const SIN_HOGAR = [...SENUELOS, ...REJILLA]

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HOME(ruta === '/sin-hogar' ? SIN_HOGAR : CON_HOGAR))
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
