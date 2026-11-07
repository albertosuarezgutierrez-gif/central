// Mapfre auto v0.8.61 · BASICar sin precio: en los 15 runs reales con variantes (02-03/11/2026) NINGUNA devolvió precio. Con las variantes tras guardar el
// proyecto (0.8.51-55, 0.8.59-60) el fallo es SIEMPRE «selector ausente o no visible» (el estado de la pantalla, no la variante); antes del proyecto
// (0.8.56-58) era un diálogo/recálculo que no acababa. La 0.8.61 corta a la primera tarjeta sin selector y anota la ESTRUCTURA de las tarjetas.
// Fixtures FICTICIOS; sin PII.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorTarificador } from '../src/errores.ts'
import {
  avisoTarjetasSinSelectorMapfre,
  diagnosticarTarjetasMapfre,
  esSelectorAusenteMapfre,
  mapfreAuto,
  tarificarVariantesComercialesMapfre,
  type ProductoVistoMapfre,
} from '../src/adapters/mapfre/auto.ts'

test('v0.8.61 · versión', () => assert.equal(mapfreAuto.version, '0.8.62'))

test('esSelectorAusenteMapfre: SOLO el mensaje exacto del guard (otro fallo de portal no corta las variantes)', () => {
  assert.equal(esSelectorAusenteMapfre(new ErrorTarificador('portal', 'selector ausente o no visible')), true)
  assert.equal(esSelectorAusenteMapfre(new ErrorTarificador('portal', ' selector  ausente o no visible ')), true)
  for (const otro of ['selector deshabilitado', 'la tarjeta no está', 'selector ausente']) assert.equal(esSelectorAusenteMapfre(new ErrorTarificador('portal', otro)), false, otro)
  assert.equal(esSelectorAusenteMapfre('selector ausente o no visible'), false)
  assert.equal(esSelectorAusenteMapfre(null), false)
})

test('avisoTarjetasSinSelectorMapfre: recuentos y rótulos, ≤300 caracteres, vacío = aviso propio', () => {
  assert.match(avisoTarjetasSinSelectorMapfre([]), /ninguna tarjeta/)
  const t = { selects: 2, visibles: 0, deshabilitados: 1, botones: ['Calcular', 'Modificar presupuesto muy largo de verdad', 'a', 'b', 'c'], conImporte: true }
  const a = avisoTarjetasSinSelectorMapfre([t, { ...t, conImporte: false }])
  assert.match(a, /T1: mat-select 2 \(visibles 0, deshabilitados 1\), con importe, botones \[Calcular \| Modificar presupuesto mu \| a \| b\]/)
  assert.match(a, /T2: .*sin importe/)
  assert.ok(!/ \| c/.test(a), 'máx. 4 botones y rótulos de ≤24 caracteres')
  assert.ok(avisoTarjetasSinSelectorMapfre(Array.from({ length: 4 }, () => ({ ...t, botones: ['x'.repeat(24), 'y'.repeat(24), 'z'.repeat(24), 'w'.repeat(24)] }))).length <= 300)
})

const productos = (): ProductoVistoMapfre[] => ['TERCEROS', 'TERCEROS AMPLIADO'].map((n, i) => ({
  producto: n, prima: i === 0 ? 238.37 : 355.07, deshabilitado: false,
  comercial: { seleccionada: n, opciones: ['--Seleccione--', 'TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO', 'BASICar TERCEROS AMPLIADO', 'BASICar TODO RIESGO'] },
} as unknown as ProductoVistoMapfre))
const PRIMAS = [
  { producto: 'TERCEROS', periodicidad: 'anual' as const, primaTotalEur: 238.37, requiereVerificacionVehiculo: false },
  { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual' as const, primaTotalEur: 355.07, requiereVerificacionVehiculo: false },
]

test('la 1ª variante sin selector CORTA las demás (no se intentan), se anota cuántas quedan y la estructura; nada queda tocado', async () => {
  let intentos = 0
  const elegir = async () => { intentos++; throw new ErrorTarificador('portal', 'selector ausente o no visible') }
  const diag = [{ selects: 1, visibles: 0, deshabilitados: 0, botones: ['Contratar'], conImporte: true }]
  const r = await tarificarVariantesComercialesMapfre({} as Page, productos(), PRIMAS, elegir, Date.now, undefined, undefined, { recuperarBase: false, diagnosticarTarjetas: async () => diag })
  assert.equal(intentos, 1, 'antes de la 0.8.61 se intentaba una por una (2 en los runs reales) con el mismo fallo')
  assert.equal(r.restaurado, true, 'no se cambió ninguna tarjeta: nada que restaurar')
  assert.deepEqual(r.primas, [])
  assert.ok(r.notas.some((n) => /no muestran el selector comercial tras guardar el proyecto; 1 variante\(s\) más sin probar/.test(n)), r.notas.join(' | '))
  assert.ok(r.notas.some((n) => /diagnóstico de tarjetas sin selector: T1: mat-select 1 \(visibles 0/.test(n)))
  const host = productos()
  assert.ok(host.length === 2)
})

test('el diagnóstico que falla no rompe nada; sin puerta de diagnóstico solo queda la nota', async () => {
  const elegir = async () => { throw new ErrorTarificador('portal', 'selector ausente o no visible') }
  const r1 = await tarificarVariantesComercialesMapfre({} as Page, productos(), PRIMAS, elegir, Date.now, undefined, undefined, { diagnosticarTarjetas: async () => { throw new Error('x') } })
  assert.ok(r1.notas.some((n) => /no se pudo leer/.test(n)))
  assert.ok(r1.notas.some((n) => /no muestran el selector comercial; /.test(n)), 'sin recuperarBase:false no dice «tras guardar el proyecto»')
  const r2 = await tarificarVariantesComercialesMapfre({} as Page, productos(), PRIMAS, elegir)
  assert.equal(r2.notas.filter((n) => /diagnóstico/.test(n)).length, 0)
})

test('otro fallo de portal (p. ej. «la tarjeta no está») NO corta: se siguen probando las demás', async () => {
  let intentos = 0
  const elegir = async () => { intentos++; throw new ErrorTarificador('portal', 'la tarjeta no está') }
  await tarificarVariantesComercialesMapfre({} as Page, productos(), PRIMAS, elegir)
  assert.equal(intentos, 2)
})

let navegador: Browser
before(async () => {
  try { navegador = await chromium.launch({ headless: true }) } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    navegador = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => { await navegador?.close() })

test('diagnosticarTarjetasMapfre (solo lectura): cuenta mat-select, visibles, deshabilitados, botones e importe; sin texto de cliente', async () => {
  const page = await (await navegador.newContext()).newPage()
  await page.setContent(`<app-coberturas>
    <prima-producto><mat-select><span>TERCEROS</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div><button>Imprimir proyecto</button></prima-producto>
    <prima-producto><mat-select style="display:none" aria-disabled="true"></mat-select><mat-select aria-disabled="true"><span>x</span></mat-select><div class="caja-primas"><p><strong>--</strong></p></div></prima-producto>
  </app-coberturas>`)
  const d = await diagnosticarTarjetasMapfre(page)
  assert.deepEqual(d, [
    { selects: 1, visibles: 1, deshabilitados: 0, botones: ['Imprimir proyecto'], conImporte: true },
    { selects: 2, visibles: 1, deshabilitados: 2, botones: [], conImporte: false },
  ])
  assert.deepEqual(await diagnosticarTarjetasMapfre(await (await navegador.newContext()).newPage()), [])
})
