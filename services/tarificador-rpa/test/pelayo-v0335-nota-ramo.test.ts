// Pelayo · explorador 0.3.35: la nota de diagnóstico del ramo LLEGA al cuerpo del cierre (antes la tapaba la nota de texto libre del `Parar('tope')` de las
// entradas de solo lectura, y asegura la descartaba); la localización del ramo no distingue mayúsculas (tarjetas «AUTOS», «HOGAR»).
// Portal SINTÉTICO por `page.route`; sin datos reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { conNotaDeEntrada, type CtxEntrada, type FinBucle } from '../src/explorador.ts'
import { RE_NOTA_ENTRADA_PELAYO, abrirNuevoPresupuestoPelayo, notaDiagnosticoRamoPelayo, type DiagnosticoRamoPelayo } from '../src/adapters/pelayo/entrada.ts'
import type { CuerpoCierre } from '../src/api.ts'

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

const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a>
  <div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
const tarjetas = (rotulos: string[]) => `<!doctype html><html><body><h1>Nuevo presupuesto</h1><div>${rotulos.map((r) => `<a class="card">${r}</a>`).join('')}</div></body></html>`

async function abrir(rotulos: string[]) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? tarjetas(rotulos) : HOME
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const notas: string[] = []
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0], o?: { reintento?: boolean }) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo', o),
    diagnostico: (n: string) => { notas.push(n) },
  } satisfies CtxEntrada
  return { context, page, ctx, notas, guard }
}
const ESP = { menuMs: 4_000, paginaMs: 4_000, formularioMs: 2_500, reintentoMs: 1_000 }

test('camino completo: tarjetas en MAYÚSCULAS sin reacción → nota → fin del bucle de solo lectura → cuerpo del cierre', async () => {
  const { context, page, ctx, notas } = await abrir(['AUTOS', 'HOGAR', 'COMERCIO'])
  try {
    await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
    assert.equal(notas.length, 1, 'la entrada deja UNA nota')
    // Lo que devuelve el bucle de una entrada de solo lectura (0.3.35: sin nota propia) + la fusión del worker.
    const bucle: FinBucle = { motivo: 'tope', error: null, redNoGet: [], efectos: ['ninguno_visto'], pasos: 1, acciones: 0 }
    const fin = conNotaDeEntrada(bucle, notas[0])
    const cuerpo: CuerpoCierre = { trabajoId: '0c6b8826-32b9-4b20-bea4-4d27979da4a2', motivoFin: fin.motivo, ...(fin.nota ? { notaFin: fin.nota } : {}), redNoGet: fin.redNoGet, efectosEnPortal: fin.efectos }
    const enviado = JSON.parse(JSON.stringify(cuerpo)) as { notaFin?: string }
    assert.equal(enviado.notaFin, notas[0])
    assert.match(enviado.notaFin!, /^entrada pelayo: tarjetas=1 clic=1 /)
    assert.ok(RE_NOTA_ENTRADA_PELAYO.test(enviado.notaFin!))
  } finally { await context.close() }
})

test('conNotaDeEntrada: la frontera bancaria manda; el diagnóstico de la entrada vence a cualquier otra nota; sin nota de entrada no toca nada', () => {
  const base = { motivo: 'tope', error: null, redNoGet: [], efectos: ['ninguno_visto'], pasos: 1, acciones: 0 } satisfies FinBucle
  const n = 'entrada pelayo: tarjetas=1 clic=1 cambio=0 pestana=0 dialogo=0 modal=0 reintento=1'
  assert.equal(conNotaDeEntrada({ ...base, nota: 'frontera bancaria: campo «IBAN»' }, n).nota, 'frontera bancaria: campo «IBAN»')
  assert.equal(conNotaDeEntrada({ ...base, nota: 'solo lectura: primera pantalla volcada' }, n).nota, n)
  assert.equal(conNotaDeEntrada(base, n).nota, n)
  assert.equal(conNotaDeEntrada(base, undefined), base)
})

test('la nota que produce notaDiagnosticoRamoPelayo casa SIEMPRE con la forma cerrada (la misma regex que copia asegura: ver su test) (todas las combinaciones y extremos) y nada con texto añadido', async () => {
  const bools = [false, true]
  let n = 0
  for (const clic of bools) for (const cambio of bools) for (const pestana of bools) for (const reintento of bools) for (const t of [0, 1, 7, 99, 500]) for (const m of [0, 3, 99, -4, Number.NaN]) {
    const d: DiagnosticoRamoPelayo = { tarjetas: t, clic, cambio, pestana, dialogo: m, modal: m, reintento }
    const nota = notaDiagnosticoRamoPelayo(d)
    assert.ok(RE_NOTA_ENTRADA_PELAYO.test(nota), nota)
    n++
  }
  assert.ok(n > 100)
  const ok = notaDiagnosticoRamoPelayo({ tarjetas: 1, clic: true, cambio: false, pestana: false, dialogo: 0, modal: 0, reintento: true })
  for (const mala of [`${ok} ES1234`, ` ${ok}`, `${ok}\n`, ok.replace('entrada', 'Entrada'), 'solo lectura: primera pantalla volcada']) assert.equal(RE_NOTA_ENTRADA_PELAYO.test(mala), false)
})

test('tarjetas «AUTOS» y «HOGAR» en mayúsculas: se localiza y pulsa solo la del ramo', async () => {
  for (const [ramo, rotulos] of [['auto', ['AUTOS', 'HOGAR']], ['hogar', ['AUTOS', 'HOGAR']]] as const) {
    const { context, page, ctx, notas } = await abrir([...rotulos])
    try {
      await abrirNuevoPresupuestoPelayo(page, ctx, ramo, ESP)
      assert.deepEqual(notas.map((x) => x.split(' clic=')[0]), ['entrada pelayo: tarjetas=1'], `${ramo} ${rotulos.join('/')}`)
      assert.match(notas[0]!, /clic=1/, `${ramo} ${rotulos.join('/')}: el guard dejó pulsar`)
    } finally { await context.close() }
  }
})

