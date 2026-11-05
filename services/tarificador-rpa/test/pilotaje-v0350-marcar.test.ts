// 0.3.50 MODO PILOTADO (Pelayo real 04/11/2026, `apps.pelayo.com/contratacion-autos/vehicle`): la casilla «Sin matricular» es un input
// checkbox de 13x13 con opacity 0 (estilo propio) y su <label>. `pulsar` sobre el input caducaba (`clic_no_accionable`) y sobre la label lo
// rechazaba el validador. Nueva acción `marcar {ref}`: validador del explorador + `marcarControl` (la misma implementación). DOM SINTÉTICO, sin PII.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { rutasAppTolerablesDe, type InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, tolerarRutasApp } from '../src/guard.ts'
import { buclePilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerComando } from '../src/pilotaje-reglas.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const URL_VEHICULO = 'https://apps.pelayo.com/contratacion-autos/vehicle'
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
})
after(async () => { await browser.close() })

// Casilla oculta a la vista (opacity 0, 13x13) tapada por el pseudo-control de su contenedor; la label la marca. Y una casilla de acción final.
const PAGINA = `<!doctype html><html><body><script>window.__clics=[]</script>
  <h1>Vehículo</h1>
  <div class="row">
    <div class="col-2" style="position:relative;width:200px;height:24px">
      <input type="checkbox" id="sinMat" formcontrolname="withOutLicense" style="opacity:0;width:13px;height:13px;margin:0;position:absolute;left:4px;top:4px"
        onchange="window.__clics.push('sinMat:' + this.checked)">
      <div class="col-2" style="position:absolute;left:0;top:0;width:24px;height:24px;background:#3364ee"></div>
      <label for="sinMat" style="position:absolute;left:30px;top:2px">Sin matricular</label>
    </div>
  </div>
  <p><input type="checkbox" id="acepto" onchange="window.__clics.push('acepto')"><label for="acepto">Acepto y contrato la póliza</label></p>
  <button type="button" id="sig" disabled>Continuar</button>
</body></html>`

async function abrir() {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  tolerarRutasApp(guard, rutasAppTolerablesDe(ENTRADA))
  await context.route('https://apps.pelayo.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA }))
  const page = await context.newPage()
  page.setDefaultTimeout(2_500)
  await page.goto(URL_VEHICULO)
  return { context, page, guard }
}

function refDe(inv: InventarioDom, pred: (e: InventarioDom['marcos'][number]['elementos'][number]) => boolean): string {
  for (const m of inv.marcos) for (const e of m.elementos) if (pred(e) && e.ref) return e.ref
  throw new Error('ref no encontrada')
}

function contexto(guard: Awaited<ReturnType<typeof abrir>>['guard'], guion: (inv: InventarioDom, n: number) => unknown) {
  const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000050', compania: 'pelayo', ramo: 'auto', entrada: ENTRADA, env: {}, guard,
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

const esSinMat = (e: { id?: string | null; tag: string }) => e.tag === 'input' && e.id === 'sinMat'
const esLabelSinMat = (e: { tag: string; texto?: string | null }) => e.tag === 'label' && e.texto === 'Sin matricular'

test('leerComando: `marcar` lleva SOLO ref', () => {
  assert.deepEqual(leerComando({ accion: 'marcar', ref: 'm0e3' }), { ok: true, c: { accion: 'marcar', ref: 'm0e3' } })
  assert.equal(leerComando({ accion: 'marcar' }).ok, false)
  assert.equal(leerComando({ accion: 'marcar', ref: 'm0e3', efecto: 'siguiente_pantalla' }).ok, false)
  assert.equal(leerComando({ accion: 'marcar', ref: '#sinMat' }).ok, false)
})

for (const [nombre, pred] of [['el input oculto', esSinMat], ['su label', esLabelSinMat]] as const) {
  test(`\`marcar\` sobre ${nombre} marca la casilla oculta (opacity 0) POR SU LABEL; repetido = «ya marcada» sin desmarcar`, async () => {
    const { context, page, guard } = await abrir()
    try {
      const { k, publicados } = contexto(guard, (inv, n) => (n <= 2 ? { accion: 'marcar', ref: refDe(inv, pred as never) } : { accion: 'fin' }))
      const f = await buclePilotaje(page, k)
      assert.equal(f.motivo, 'fin')
      assert.deepEqual(publicados[1].resultadoAnterior, { estado: 'hecho', motivo: 'marcado por su etiqueta' })
      assert.deepEqual(publicados[2].resultadoAnterior, { estado: 'hecho', motivo: 'ya marcada' })
      assert.equal(await page.isChecked('#sinMat'), true)
      assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), ['sinMat:true'])
    } finally {
      await context.close()
    }
  })
}

test('`marcar` una casilla de acción final («Acepto y contrato…») se RECHAZA por el validador y no se toca', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'marcar', ref: refDe(inv, (e) => e.tag === 'input' && e.id === 'acepto') } : n === 2 ? { accion: 'marcar', ref: refDe(inv, (e) => e.tag === 'label' && e.texto === 'Acepto y contrato la póliza') } : { accion: 'fin' }))
    await buclePilotaje(page, k)
    for (const i of [1, 2]) {
      assert.equal(publicados[i].resultadoAnterior?.estado, 'rechazado')
      assert.equal(publicados[i].resultadoAnterior?.motivo, 'validador')
      assert.match(publicados[i].resultadoAnterior?.detalle?.join(' ') ?? '', /acción final/)
    }
    assert.equal(await page.isChecked('#acepto'), false)
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})

test('`marcar` sobre un botón se rechaza (solo radios o casillas)', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (inv, n) => (n === 1 ? { accion: 'marcar', ref: refDe(inv, (e) => e.tag === 'button') } : { accion: 'fin' }))
    await buclePilotaje(page, k)
    assert.equal(publicados[1].resultadoAnterior?.motivo, 'validador')
    assert.equal(publicados[1].resultadoAnterior?.estado, 'rechazado')
  } finally {
    await context.close()
  }
})

test('versión del explorador 0.3.50', () => assert.equal(EXPLORADOR_VERSION, '0.3.50'))
