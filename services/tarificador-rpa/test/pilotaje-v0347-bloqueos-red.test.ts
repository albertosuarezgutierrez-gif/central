// 0.3.47 MODO PILOTADO: una petición que el guard de red bloquea se ABORTA (nunca sale) y se REGISTRA en el inventario de la pantalla
// siguiente (`bloqueosRed`, sin query ni cuerpo) en vez de cerrar la sesión; la navegación de documento principal bloqueada también
// (la página se queda), con tope anti-bucle de 5 por paso. Fuera del pilotaje (tarificar/exploración) el mismo bloqueo sigue tumbando
// el trabajo. Portal SINTÉTICO por `page.route` (solo el documento); lo demás va al guard de contexto y, si pasara, a un proxy muerto.
// Valores ficticios (sin PII).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, vaciarBloqueosPilotaje, TOPE_NAVEGACIONES_BLOQUEADAS_PASO_PILOTAJE, type GuardEmision } from '../src/guard.ts'
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const PORTAL = 'https://mediadores.pelayo.com/portal/'
const LOGS = 'https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/architecture/javascript-logs'
const XHR = 'https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/presupuestos/99887766/emitir'
const QUERY = '?sesion=QUERYFICTICIA&x=1#frag'

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

// «Siguiente» lanza, en segundo plano, un fetch POST (javascript-logs) y un XHR POST a una ruta de emisión, ambos con query y cuerpo;
// o, con `window.__navs = N`, N navegaciones del documento principal a una ruta de emisión (separadas 50 ms).
const HTML = `<!doctype html><html><body><h1>Datos del vehículo</h1>
<script>
window.__navs = 0
function lanzar() {
  if (window.__navs > 0) { for (let i = 0; i < window.__navs; i++) setTimeout(() => { location.href = '/contratacion/emitir/paso' + i + '${QUERY}' }, i * 50); return }
  fetch('${LOGS}${QUERY}', { method: 'POST', body: 'nif=FICTICIO&iban=FICTICIO' }).catch(() => {})
  const x = new XMLHttpRequest(); x.open('POST', '${XHR}${QUERY}'); x.send('a=1')
}
</script>
<button type="button" id="sig" onclick="lanzar()">Siguiente</button>
</body></html>`

type Abierto = { page: Page; guard: GuardEmision; bloqueadas: string[]; fuera: string[] }
async function abrir(navs = 0): Promise<Abierto> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  // Solo el documento EXACTO del portal se sirve aquí; todo lo demás pasa por el guard de contexto.
  await page.route(PORTAL, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HTML }))
  const bloqueadas: string[] = []
  const fuera: string[] = []
  page.on('requestfailed', (r) => { if (r.failure()?.errorText.includes('BLOCKED_BY_CLIENT') || r.failure()?.errorText.includes('ERR_ABORTED')) bloqueadas.push(r.url()) })
  // Testigo de «salió»: cualquier petición a api.pelayo.com o a /contratacion que TERMINE (sin el guard iría al proxy muerto y fallaría
  // con otro error; aquí basta con que ninguna acabe en `requestfinished`).
  page.on('requestfinished', (r) => { if (/api\.pelayo\.com|\/contratacion\//.test(r.url())) fuera.push(r.url()) })
  await page.goto(PORTAL)
  await page.evaluate((n) => { (window as unknown as { __navs: number }).__navs = n }, navs)
  return { page, guard, bloqueadas, fuera }
}

type Publicado = { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }
function contexto(guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown) {
  const publicados: Publicado[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000047', compania: 'pelayo', ramo: 'auto', entrada: 'pelayo:presupuestos:auto', env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pausaAccion: async () => undefined,
    publicar: async (c) => { publicados.push(c); return 'ok' },
    pedirComando: async (n) => ({ estado: 'ok', comando: guion(publicados[publicados.length - 1].inventario, n) }),
    log: () => undefined,
    sinCaptura: true,
    ahora: () => reloj,
    dormir: async (ms) => { reloj += ms },
  }
  return { k, publicados }
}
const refSig = (inv: InventarioDom) => {
  for (const m of inv.marcos) for (const e of m.elementos) if (e.id === 'sig' && e.ref) return e.ref
  throw new Error('sin ref de Siguiente')
}
const guionPulsarYFin = (inv: InventarioDom, n: number) => (n === 1 ? { accion: 'pulsar', ref: refSig(inv), efecto: 'siguiente_pantalla' } : { accion: 'fin' })

test('(a) pilotaje: el fetch/XHR POST a una ruta de emisión se ABORTA, no mata la sesión y aparece en `bloqueosRed` SIN query', async () => {
  const { page, guard, bloqueadas, fuera } = await abrir()
  const { k, publicados } = contexto(guard, guionPulsarYFin)
  const fin = await buclePilotaje(page, k)
  assert.equal(fin.motivo, 'fin', `la sesión sigue hasta el «fin» del operador (fue ${fin.motivo}: ${fin.error?.mensaje ?? ''})`)
  assert.equal(guard.violacion(), null, 'un bloqueo de fondo no es violación en el pilotaje')
  assert.equal(publicados[0].inventario.bloqueosRed, undefined, 'antes del clic no hubo bloqueos')
  const reg = publicados[1].inventario.bloqueosRed ?? []
  assert.ok(reg.includes(`POST ${LOGS} [fetch url]`), `registro: ${JSON.stringify(reg)}`)
  assert.ok(reg.includes('POST https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/presupuestos/:id/emitir [xhr url]'), `registro: ${JSON.stringify(reg)}`)
  const todo = JSON.stringify(publicados.map((p) => p.inventario))
  for (const x of ['QUERYFICTICIA', 'sesion', 'frag', 'FICTICIO', '99887766']) assert.ok(!todo.includes(x), `«${x}» no puede salir en el inventario`)
  // Fail-closed: abortadas por el guard, ninguna terminó.
  assert.ok(bloqueadas.some((u) => u.startsWith(LOGS)) && bloqueadas.some((u) => u.startsWith(XHR)), `abortadas: ${bloqueadas.join(' ')}`)
  assert.deepEqual(fuera, [])
  await page.context().close()
})

test('(b) fuera del pilotaje (tarificar/exploración): el MISMO XHR sigue tumbando el trabajo y no se registra nada', async () => {
  const { page, guard, bloqueadas, fuera } = await abrir()
  // `pulsar` puede lanzar ya la violación (comprueba tras el clic); si no, la deja puesta para el siguiente `comprobar`.
  const e = await pulsar(page.locator('#sig'), guard).then(() => null, (x: unknown) => x)
  assert.ok(e === null || e instanceof EmisionBloqueadaError, String(e))
  await page.waitForEvent('requestfailed', { predicate: (r) => r.url().startsWith(XHR), timeout: 4_000 }).catch(() => null)
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined)
  assert.ok(guard.violacion() instanceof EmisionBloqueadaError, 'sin pilotaje el bloqueo de red sigue siendo violación')
  assert.throws(() => guard.comprobar(), EmisionBloqueadaError)
  assert.ok(!guard.violacion()!.message.includes('QUERYFICTICIA'), 'el mensaje va sin query (0.3.44)')
  assert.deepEqual(vaciarBloqueosPilotaje(guard), { lineas: [], omitidas: 0 }, 'sin activar, el registro no existe')
  assert.ok(bloqueadas.length >= 1)
  assert.deepEqual(fuera, [])
  await page.context().close()
})

test(`(c) pilotaje: ${TOPE_NAVEGACIONES_BLOQUEADAS_PASO_PILOTAJE} navegaciones bloqueadas en un paso se registran y la página se queda; la 6.ª cierra la sesión`, async () => {
  assert.equal(TOPE_NAVEGACIONES_BLOQUEADAS_PASO_PILOTAJE, 5)
  {
    const { page, guard, fuera } = await abrir(5)
    const { k, publicados } = contexto(guard, guionPulsarYFin)
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin', `con 5 la sesión sigue (fue ${fin.motivo}: ${fin.error?.mensaje ?? ''})`)
    assert.equal(page.url(), PORTAL, 'la navegación abortada deja la página donde estaba')
    const reg = publicados[1].inventario.bloqueosRed ?? []
    assert.deepEqual(reg, [0, 1, 2, 3, 4].map((i) => `GET https://mediadores.pelayo.com/contratacion/emitir/paso${i} [document navegacion]`))
    assert.deepEqual(fuera, [])
    await page.context().close()
  }
  {
    const { page, guard, fuera } = await abrir(6)
    const { k } = contexto(guard, guionPulsarYFin)
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'guard_emision', 'la 6.ª navegación bloqueada del mismo paso cierra (anti-bucle)')
    assert.match(fin.error?.mensaje ?? '', /más de 5 navegaciones bloqueadas/)
    assert.ok(!(fin.error?.mensaje ?? '').includes('QUERYFICTICIA'))
    assert.deepEqual(fuera, [])
    await page.context().close()
  }
})

test('solo `pilotaje.ts` activa el registro (tarificar, exploración, emisión y humo no lo tocan)', () => {
  const dir = join(import.meta.dirname, '..', 'src')
  const usan = readdirSync(dir).filter((f) => f.endsWith('.ts') && readFileSync(join(dir, f), 'utf8').includes('activarRegistroBloqueosPilotaje('))
  assert.deepEqual(usan.sort(), ['guard.ts', 'pilotaje.ts'])
})
