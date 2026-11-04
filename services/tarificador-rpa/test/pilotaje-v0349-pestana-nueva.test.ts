// 0.3.49 MODO PILOTADO (Pelayo real 04/11/2026, explorador 0.3.48): «Nueva contratación» abrió el wizard `apps.pelayo.com/contratacion-autos`
// en una PESTAÑA NUEVA del mismo contexto y el pilotaje siguió publicando la página original (modal cerrado, tarjetas AUTOS/HOGAR).
// Ahora: tras el comando, la página nueva de un dominio de la compañía de la entrada se ADOPTA (se inventaría y publica; el resultado lo
// dice en una línea, sin query) y el guard de CONTEXTO la cubre desde su primera petición; una de otro origen se CIERRA y va a `bloqueosRed`.
// Portal SINTÉTICO por `context.route` (solo los documentos exactos); lo demás va al guard y, si pasara, a un proxy muerto. Sin PII.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'
import { buclePilotaje, urlDePortalCompania, type ContextoPilotaje } from '../src/pilotaje.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const PORTAL = 'https://mediadores.pelayo.com/portalmediador-nuevo-presupuesto/'
const WIZARD = 'https://apps.pelayo.com/contratacion-autos'
const AJENA = 'https://ajeno.example/promo/landing'
const QUERY = '?sesion=QUERYFICTICIA&x=1'
const XHR_WIZARD = 'https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/presupuestos/99887766/emitir'

let browser: Browser
before(async () => {
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

const portalHtml = (destino: string) => `<!doctype html><html><body><h1>Nuevo presupuesto</h1>
<script>function abrir() { window.open('${destino}${QUERY}', '_blank') }</script>
<button type="button" id="sig" onclick="abrir()">Siguiente</button>
</body></html>`
// El wizard, nada más cargar, lanza un XHR POST a una ruta de emisión: el guard de CONTEXTO tiene que abortarlo también en esta pestaña.
const WIZARD_HTML = `<!doctype html><html><body><h1>Datos del vehículo</h1>
<label for="mat">Matrícula</label><input id="mat" type="text">
<script>const x = new XMLHttpRequest(); x.open('POST', '${XHR_WIZARD}${QUERY}'); x.send('a=1')</script>
</body></html>`
const AJENA_HTML = '<!doctype html><html><body><h1>Promoción</h1></body></html>'

type Abierto = { page: Page; guard: GuardEmision; fuera: string[] }
async function abrir(destino: string): Promise<Abierto> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  tolerarRutasApp(guard, rutasAppTolerablesDe('pelayo:presupuestos:auto'))
  // Registradas DESPUÉS del guard (corren antes): solo los tres documentos exactos; cualquier otra petición, al guard.
  await context.route(PORTAL, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: portalHtml(destino) }))
  await context.route((u) => u.href.startsWith(WIZARD + '?'), (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: WIZARD_HTML }))
  await context.route((u) => u.href.startsWith(AJENA + '?'), (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: AJENA_HTML }))
  const fuera: string[] = []
  context.on('requestfinished', (r) => { if (/api\.pelayo\.com/.test(r.url())) fuera.push(r.url()) })
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.goto(PORTAL)
  return { page, guard, fuera }
}

type Publicado = { n: number; inventario: InventarioDom; url?: string; resultadoAnterior?: ResultadoComandoPilotaje }
function contexto(guard: GuardEmision) {
  const publicados: Publicado[] = []
  let reloj = 0
  const refSig = (inv: InventarioDom) => {
    for (const m of inv.marcos) for (const e of m.elementos) if (e.id === 'sig' && e.ref) return e.ref
    throw new Error('sin ref de Siguiente')
  }
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000049', compania: 'pelayo', ramo: 'auto', entrada: 'pelayo:presupuestos:auto', env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pausaAccion: async () => undefined,
    publicar: async (c) => { publicados.push(c); return 'ok' },
    pedirComando: async (n) => ({ estado: 'ok', comando: n === 1 ? { accion: 'pulsar', ref: refSig(publicados[0].inventario), efecto: 'siguiente_pantalla' } : { accion: 'fin' } }),
    log: () => undefined,
    sinCaptura: true,
    ahora: () => reloj,
    dormir: async (ms) => { reloj += ms },
  }
  return { k, publicados }
}
const ids = (inv: InventarioDom) => inv.marcos.flatMap((m) => m.elementos.map((e) => e.id)).filter(Boolean)

test('versión del explorador 0.3.50', () => assert.equal(EXPLORADOR_VERSION, '0.3.50'))

test('urlDePortalCompania: https de un dominio de la compañía (o subdominio), sin puerto ni credenciales; lo demás no', () => {
  assert.equal(urlDePortalCompania('https://apps.pelayo.com/contratacion-autos?x=1', 'pelayo'), true)
  assert.equal(urlDePortalCompania('https://acceso12.pelayo.com/oauth2/rest/authorize', 'pelayo'), true)
  for (const u of ['http://apps.pelayo.com/', 'https://apps.pelayo.com:8443/', 'https://u:p@apps.pelayo.com/', 'https://pelayo.com.evil.es/', 'https://evilpelayo.com/', 'about:blank', 'chrome-error://chromewebdata/', 'nada']) {
    assert.equal(urlDePortalCompania(u, 'pelayo'), false, u)
  }
  assert.equal(urlDePortalCompania('https://apps.pelayo.com/', 'mapfre'), false, 'otra compañía')
  assert.equal(urlDePortalCompania('https://apps.pelayo.com/', ''), false, 'sin compañía = fail-closed')
})

test('pilotaje: la pestaña NUEVA del portal de la compañía se ADOPTA, se publica su pantalla y el resultado lo dice sin query', async () => {
  const { page, guard, fuera } = await abrir(WIZARD)
  const { k, publicados } = contexto(guard)
  const fin = await buclePilotaje(page, k)
  assert.equal(fin.motivo, 'fin', `la sesión sigue hasta el «fin» (fue ${fin.motivo}: ${fin.error?.mensaje ?? ''})`)
  assert.equal(publicados.length, 2)
  assert.ok(ids(publicados[0].inventario).includes('sig'), 'la 1.ª pantalla es la del portal')
  assert.ok(ids(publicados[1].inventario).includes('mat'), `la 2.ª pantalla es la del WIZARD de la pestaña nueva (ids: ${ids(publicados[1].inventario).join(',')})`)
  assert.ok(!ids(publicados[1].inventario).includes('sig'), 'no la original')
  assert.ok(publicados[1].url?.startsWith(WIZARD), `url publicada: ${publicados[1].url}`)
  const r = publicados[1].resultadoAnterior
  assert.equal(r?.estado, 'hecho')
  assert.equal(r?.detalle?.[0], `pestaña nueva adoptada: ${WIZARD}`)
  // El guard de contexto cubrió la pestaña nueva: su XHR a emisión se abortó y se registró (sin query); nada salió.
  const reg = publicados[1].inventario.bloqueosRed ?? []
  assert.ok(reg.includes('POST https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/presupuestos/:id/emitir [xhr url]'), `registro: ${JSON.stringify(reg)}`)
  assert.deepEqual(fuera, [])
  assert.equal(guard.violacion(), null)
  const todo = JSON.stringify(publicados.map((p) => [p.inventario, p.resultadoAnterior]))
  for (const x of ['QUERYFICTICIA', 'sesion', '99887766']) assert.ok(!todo.includes(x), `«${x}» no puede salir`)
  await page.context().close()
})

test('pilotaje: una pestaña nueva de OTRO origen no se adopta: se cierra y va a `bloqueosRed`; se sigue en la original', async () => {
  const { page, guard } = await abrir(AJENA)
  const { k, publicados } = contexto(guard)
  const fin = await buclePilotaje(page, k)
  assert.equal(fin.motivo, 'fin', `fue ${fin.motivo}: ${fin.error?.mensaje ?? ''}`)
  assert.equal(publicados.length, 2)
  assert.ok(ids(publicados[1].inventario).includes('sig'), 'la 2.ª pantalla sigue siendo la original')
  assert.equal(publicados[1].url, PORTAL)
  assert.deepEqual(publicados[1].inventario.bloqueosRed, ['GET https://ajeno.example/promo/landing [document pestana]'])
  assert.ok(!(publicados[1].resultadoAnterior?.detalle ?? []).some((d) => d.includes('adoptada')))
  assert.deepEqual(page.context().pages(), [page], 'la pestaña ajena quedó CERRADA')
  assert.ok(!JSON.stringify(publicados).includes('QUERYFICTICIA'))
  await page.context().close()
})
