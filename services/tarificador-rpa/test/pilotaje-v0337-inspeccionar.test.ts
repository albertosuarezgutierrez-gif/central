// MODO PILOTADO 0.3.37: comando `inspeccionar {ref}` (diagnóstico de accionabilidad SIN pulsar) y diagnóstico persistente cuando un `pulsar` caduca por
// accionabilidad. Portal SINTÉTICO (Pelayo, tarjeta de ramo tapada por un velo). Sin PII: solo la forma cerrada de `diagnostico-clic.ts`.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import type { InventarioDom } from '@central/module-tarificacion'
import { AJUSTES_CLIC_TARJETA, instalarGuardEmision, pulsar } from '../src/guard.ts'
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerComando } from '../src/pilotaje-reglas.ts'
import { RE_CUERPO_DIAGNOSTICO_CLIC } from '../src/diagnostico-clic.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
const ENTRADA = 'pelayo:presupuestos:auto'
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
  AJUSTES_CLIC_TARJETA.pasoMs = 1_500
  AJUSTES_CLIC_TARJETA.hoverMs = 500
})
after(async () => { await browser.close() })

const PAGINA = `<!doctype html><html><body><script>window.__clics=[]</script>
  <h1>Nuevo presupuesto</h1>
  <a class="card" id="a" onclick="window.__clics.push('card')">AUTOS</a>
  <button type="button" id="sig" onclick="window.__clics.push('sig')">Siguiente</button>
  <div class="velo-modal" style="position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.3)"></div>
</body></html>`

async function abrir() {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA }))
  const page = await context.newPage()
  page.setDefaultTimeout(2_500)
  await page.goto(`${ORIGEN}/portalmediador-nuevo-presupuesto/`)
  return { context, page, guard }
}

function refDe(inv: InventarioDom, texto: string): string {
  for (const m of inv.marcos) for (const e of m.elementos) if (e.texto === texto && e.ref) return e.ref
  throw new Error(`ref no encontrada: ${texto}`)
}

function contexto(guard: Awaited<ReturnType<typeof abrir>>['guard'], guion: (inv: InventarioDom, n: number) => unknown) {
  const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'pelayo', ramo: 'auto', entrada: ENTRADA, env: {}, guard,
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

test('leerComando: `inspeccionar` lleva SOLO ref', () => {
  assert.deepEqual(leerComando({ accion: 'inspeccionar', ref: 'm0e3' }), { ok: true, c: { accion: 'inspeccionar', ref: 'm0e3' } })
  assert.equal(leerComando({ accion: 'inspeccionar' }).ok, false)
  assert.equal(leerComando({ accion: 'inspeccionar', ref: 'm0e3', forzar: true }).ok, false)
  assert.equal(leerComando({ accion: 'inspeccionar', ref: '#a' }).ok, false)
})

test('`inspeccionar` devuelve el diagnóstico (qué tapa la tarjeta) SIN pulsar nada; luego `pulsar` caduca y deja el mismo diagnóstico, sin clic', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'inspeccionar', ref: refDe(inv, 'AUTOS') } : n === 2 ? { accion: 'pulsar', ref: refDe(inv, 'AUTOS') } : { accion: 'fin' }))
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin')
    const insp = publicados[1].resultadoAnterior!
    assert.equal(insp.estado, 'hecho', JSON.stringify(insp))
    assert.equal(insp.motivo, 'inspeccionado')
    assert.equal(insp.detalle?.length, 1)
    const cuerpo = insp.detalle![0].replace(/^diag: /, '')
    assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(cuerpo), cuerpo)
    assert.match(cuerpo, / vis=1 .* hit=otro\/div\/velo-modal cookie=0 ifr=0 shd=0 anim=0$/)
    const pul = publicados[2].resultadoAnterior!
    assert.equal(pul.estado, 'rechazado', JSON.stringify(pul))
    assert.equal(pul.motivo, 'clic_no_accionable')
    assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(pul.detalle![0].replace(/^diag: /, '')), pul.detalle![0])
    assert.match(pul.detalle![0], /hit=otro\/div\/velo-modal/)
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [], 'ni inspeccionar ni el clic caducado pulsaron nada')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('un botón normal tapado: el `pulsar` caduca y el resultado lleva el diagnóstico (y el mensaje de Playwright acotado)', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'pulsar', ref: refDe(inv, 'Siguiente') } : { accion: 'fin' }))
    await buclePilotaje(page, k)
    const r = publicados[1].resultadoAnterior!
    assert.equal(r.estado, 'rechazado', JSON.stringify(r))
    assert.equal(r.motivo, 'clic_no_accionable')
    assert.ok(RE_CUERPO_DIAGNOSTICO_CLIC.test(r.detalle![0].replace(/^diag: /, '')), r.detalle![0])
    assert.match(r.detalle![0], /hit=otro\/div\/velo-modal/)
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})
