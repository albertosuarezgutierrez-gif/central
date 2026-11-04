// Pilotaje · explorador 0.3.41 (Pelayo «Datos del Tomador», 04/11/2026): la entrada lleva `tomadorMediador` y el trabajo de pilotaje
// tiene `riesgo = '{}'` (CHECK de BD). El tomador se arma EN MEMORIA desde `MEDIADOR` (mismo mapeo que asegura) solo para
// `resolverDato`: el NIF/nombre/móvil se ESCRIBEN en el portal y no salen ni en el resultado, ni en el log, ni en el inventario.
// Los datos se IMPORTAN de `MEDIADOR` (ningún literal en este fichero). Portal SINTÉTICO por `context.route`, sin red real.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { riesgoTomadorDeMediador, type InventarioDom } from '@central/module-tarificacion'
import { MEDIADOR } from '../../../packages/module-seguros/src/mediador.ts'
import { instalarGuardEmision, pulsar } from '../src/guard.ts'
import { buclePilotaje, riesgoResolverPilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'

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

const TOMADOR = `<!doctype html><html><body>
  <h1>Datos del Tomador</h1>
  <label for="doc">Nº documento</label><input id="doc" name="numDocumento" type="text">
  <label for="nom">Nombre</label><input id="nom" name="nombre" type="text">
  <label for="ap1">Apellido 1</label><input id="ap1" name="apellido1" type="text">
  <label for="ap2">Apellido 2</label><input id="ap2" name="apellido2" type="text">
  <label for="tel">Teléfono</label><input id="tel" name="telefono" type="text">
  <label for="em">Email</label><input id="em" name="email" type="text">
</body></html>`

function refDe(inv: InventarioDom, id: string): string {
  for (const m of inv.marcos) for (const e of m.elementos) if (e.id === id && e.ref) return e.ref
  throw new Error(`ref no encontrada: ${id}`)
}

test('riesgoResolverPilotaje: con la marca = el mapeo de asegura sobre MEDIADOR; sin ella = {} (nada personal)', () => {
  for (const entrada of ['pelayo:presupuestos:auto', 'pelayo:presupuestos:hogar']) {
    const r = riesgoResolverPilotaje(entrada)
    assert.deepEqual(r, riesgoTomadorDeMediador(MEDIADOR.identidad), entrada)
    assert.equal((r as { tomador: Record<string, string> }).tomador.nif, MEDIADOR.identidad.nif, entrada)
  }
  for (const entrada of ['mapfre:patrimoniales:hogar', 'fidelidade:particulares:vivienda', 'no:existe:x', '__proto__']) assert.deepEqual(riesgoResolverPilotaje(entrada), {}, entrada)
})

for (const [entrada, ramo] of [['pelayo:presupuestos:auto', 'auto'], ['pelayo:presupuestos:hogar', 'hogar']] as const) {
  test(`${entrada}: «Datos del Tomador» se rellena con el MEDIADOR (en memoria) y ningún valor sale en resultado, log ni inventario`, async () => {
    const context = await browser.newContext()
    const guard = await instalarGuardEmision(context)
    await context.route(`${ORIGEN}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: TOMADOR }))
    const page = await context.newPage()
    page.setDefaultTimeout(4_000)
    await page.goto(`${ORIGEN}/portalmediador-presupuestos/`)
    try {
      const pasos: [string, string][] = [['doc', 'tomador.nif'], ['nom', 'tomador.nombre'], ['ap1', 'tomador.apellido1'], ['ap2', 'tomador.apellido2'], ['tel', 'contacto.telefono'], ['em', 'contacto.email']]
      const publicados: { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje }[] = []
      const logs: unknown[] = []
      let reloj = 0
      const k: ContextoPilotaje = {
        trabajoId: '00000000-0000-4000-8000-000000000041', compania: 'pelayo', ramo, entrada, env: {}, guard,
        pulsar: (b) => pulsar(b, guard),
        pausaAccion: async () => undefined,
        publicar: async (c) => { publicados.push(c); return 'ok' },
        pedirComando: async (n) => {
          const p = pasos[n - 1]
          return { estado: 'ok', comando: p ? { accion: 'rellenar', ref: refDe(publicados[publicados.length - 1].inventario, p[0]), dato: p[1] } : { accion: 'fin' } }
        },
        log: (...a: unknown[]) => { logs.push(a) },
        sinCaptura: true,
        ahora: () => reloj,
        dormir: async (ms) => { reloj += ms },
      }
      const fin = await buclePilotaje(page, k)
      assert.equal(fin.motivo, 'fin')
      const res = publicados.slice(1).map((p) => p.resultadoAnterior)
      for (let i = 0; i < pasos.length; i++) assert.deepEqual(res[i], { estado: 'hecho', motivo: 'rellenado' }, `${pasos[i][1]}: ${JSON.stringify(res[i])}`)
      const t = riesgoTomadorDeMediador(MEDIADOR.identidad).tomador
      assert.equal(await page.locator('#doc').inputValue(), MEDIADOR.identidad.nif)
      assert.equal(await page.locator('#nom').inputValue(), t.nombre)
      assert.equal(await page.locator('#ap1').inputValue(), t.apellido1)
      assert.equal(await page.locator('#ap2').inputValue(), t.apellido2)
      assert.equal(await page.locator('#tel').inputValue(), t.telefono)
      assert.equal(await page.locator('#em').inputValue(), MEDIADOR.identidad.email)
      // 🔑 Nada de lo escrito sale del proceso: ni en los resultados/inventarios publicados ni en el log.
      const salida = JSON.stringify({ publicados, logs, fin })
      for (const v of [MEDIADOR.identidad.nif, MEDIADOR.identidad.nombre, t.apellido1!, t.apellido2!, t.telefono!, MEDIADOR.identidad.email]) assert.ok(!salida.includes(v), 'un dato del mediador salió del proceso')
    } finally {
      await context.close()
    }
  })
}
