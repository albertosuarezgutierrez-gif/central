// Generali Turismos v0.2.30 (26/10/2026, prueba real con 0.2.29): tras «Confirmar» tomador y UN «Siguiente» llega a «Garantías y Capitales opcionales»
// (emiAutosGenB028.do) sin importe legible y el 2.º «Siguiente» lo bloqueó el gate. (1) diagnóstico saneado de tablas/importes, (2) lector: «cuota»/prima total
// anual/fila marcada SOLO en esa pantalla, (3) gate de «Siguiente» en esa pantalla solo sin precio y con el tomador confirmado. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { esPantallaGarantiasCapitalesGenerali, leerPrecioGenerali, resumenDiagnosticoImportesGenerali } from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO, ofertaGenerali, textoPagina, volcarDiagnosticoImportesGenerali } from '../src/adapters/generali/auto.ts'
import { instalarGuardEmision, pulsarConfirmarDatosPersonasGenerali, pulsarSiguienteValoracionGenerali, type GuardEmision } from '../src/guard.ts'

test('v0.2.30 · versión', () => assert.match(VERSION_GENERALI_AUTO, /^0\.2\.([3-9]\d)$/))

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => {
  await browser?.close()
})

const CAB = '<h3>Garantías y Capitales opcionales</h3><h4>Bonus-Malus</h4><h4>Envío Documentación Precontractual</h4>'
const TABLA_PRIMA = `<table><tr><th>Modalidad</th><th>Prima total anual</th></tr><tr><td>Todo riesgo</td><td>1.234,56 €</td></tr></table>`

// ───────── lector ─────────

test('v0.2.30 · pura: la pantalla se reconoce por su encabezado', () => {
  assert.ok(esPantallaGarantiasCapitalesGenerali('x\nGarantías y Capitales opcionales\ny'))
  assert.ok(!esPantallaGarantiasCapitalesGenerali('Garantías y Resultados'))
})

test('v0.2.30 · «Prima total anual 1.234,56 €» en la tabla de garantías → precio leído (DOM)', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${CAB}${TABLA_PRIMA}<input type="button" value="Comparar"></body></html>`)
    const l = leerPrecioGenerali(await textoPagina(page))
    assert.equal(l.tipo, 'unico')
    assert.equal(l.tipo === 'unico' && l.eur, 1234.56)
    assert.equal(ofertaGenerali(1234.56, null, ['aviso x']).avisos.includes('aviso x'), true)
  } finally {
    await page.close()
  }
})

test('v0.2.30 · «Cuota» solo vale en la pantalla de garantías', () => {
  const t = 'Cuota\n 987,65 €'
  assert.equal(leerPrecioGenerali(t).tipo, 'ninguno')
  const l = leerPrecioGenerali(`${CAB}\n${t}`)
  assert.ok(l.tipo === 'unico' && l.eur === 987.65)
})

test('v0.2.30 · varias modalidades: manda la prima total anual; si hay varias, la fila marcada y avisa de las demás', async () => {
  const l1 = leerPrecioGenerali(`Garantías y Capitales opcionales\nPrima neta 800,00 €\nPrima total anual 1.234,56 €\nPrima total fraccionada 700,00 €`)
  assert.ok(l1.tipo === 'unico' && l1.eur === 1234.56 && (l1.avisos ?? []).length === 1, JSON.stringify(l1))
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${CAB}<table><tr><th>Modalidad</th><th>Prima total anual</th></tr>
      <tr><td>Terceros</td><td>400,00 €</td></tr>
      <tr class="seleccionada"><td>Todo riesgo</td><td>1.234,56 €</td></tr>
      <tr><td>Ampliado</td><td>900,00 €</td></tr></table></body></html>`)
    const l = leerPrecioGenerali(await textoPagina(page))
    assert.ok(l.tipo === 'unico' && l.eur === 1234.56, JSON.stringify(l))
    assert.match((l.tipo === 'unico' && l.avisos?.[0]) || '', /400 € .*900 €|900 € .*400 €/)
  } finally {
    await page.close()
  }
  // Sin fila marcada: ambiguo, no se elige.
  const l2 = leerPrecioGenerali(`${CAB}\nPrima total anual Terceros\n400,00 €\nPrima total anual Todo riesgo\n1.234,56 €`)
  assert.equal(l2.tipo, 'varios')
  // Fuera de la pantalla de garantías no se aplica ninguna preferencia (comportamiento anterior).
  assert.equal(leerPrecioGenerali('Prima total anual A 400,00 €\nPrima total anual B 1.234,56 €').tipo, 'varios')
})

// ───────── diagnóstico ─────────

test('v0.2.30 · diagnóstico de tablas e importes: etiquetas de dinero sí; nombres, NIF, matrícula y fechas nunca', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body>${CAB}
      <table><tr><th>Concepto</th><th>Importe</th></tr>
        <tr><td>Prima neta</td><td>1.000,00 €</td></tr><tr><td>Recibo</td><td>1.234,56 €</td></tr>
        <tr><td>JUAN PEREZ GOMEZ 00000000T</td><td>600,00 €</td></tr></table>
      <table><tr><th>Tomador</th><th>Matrícula 1234BCD</th><th>Nacimiento 01/02/1980</th></tr><tr><td>ANA LOPEZ</td><td>1234BCD</td><td>01/02/1980</td></tr></table>
      <div><span>Total a pagar</span> <b>1.300,00 €</b></div></body></html>`)
    const r = resumenDiagnosticoImportesGenerali(await volcarDiagnosticoImportesGenerali(page))
    assert.match(r, /Prima neta 1\.000,00 €/, r)
    assert.match(r, /Recibo 1\.234,56 €/, r)
    assert.match(r, /Total a pagar 1\.300,00 €/, r)
    assert.match(r, /\[Concepto\|Importe\]/, r)
    for (const x of [/JUAN|PEREZ|GOMEZ/, /00000000T/, /1234BCD/, /01\/02\/1980/, /ANA|LOPEZ/]) assert.doesNotMatch(r, x, r)
    assert.ok(r.length <= 450)
  } finally {
    await page.close()
  }
})

test('v0.2.30 · diagnóstico: máx. 10 importes y tope de caracteres', () => {
  const imps = Array.from({ length: 25 }, (_, i) => ({ etiqueta: `Prima total ${i % 2 ? 'anual' : 'neta'}`, importe: `${100 + i},00 €` }))
  const r = resumenDiagnosticoImportesGenerali([{ cabeceras: [['Garantía', 'Prima']], importes: imps }], 2000)
  assert.equal(r.split(' ; ').length, 10, r)
  assert.ok(resumenDiagnosticoImportesGenerali([{ cabeceras: [], importes: imps }], 120).length <= 120)
  assert.match(resumenDiagnosticoImportesGenerali([], 450), /Tablas: ninguna · Importes: ninguno/)
})

// ───────── gate «Siguiente» ─────────

const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const OTRA = 'https://www.generali.es/emi_genAutosFormWeb/otraPantalla.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'
const DATOS_PERSONAS = `<ul><li class="pestana"><a href="#">Selección personas que intervienen</a></li><li class="pestanaActiva"><a href="#">Datos personas</a></li></ul>
  <input id="personas_intere_nifcif" type="text" value="00000000T" readonly>
  <input id="cancelar" type="button" value="Volver"><input id="confirmar" type="button" value="Confirmar" onclick="location.href='${B028}?g=1'">`
const garantias = (extra: string, boton = 'Siguiente ›') => `${CAB}${extra}<input id="comparar" type="button" value="Comparar" onclick="parent.__cmp=(parent.__cmp||0)+1">
  <input id="historial" type="button" value="Historial Siniestral"><input id="siguiente" type="button" value="${boton}" onclick="parent.__sig=(parent.__sig||0)+1">`

async function abrir(extra: string, opciones: { confirmar?: boolean; url?: string } = {}): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const url = opciones.url ?? B028
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    const cuerpo = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${url}" style="width:900px;height:600px"></iframe>` : u.includes('g=1') || opciones.confirmar === false ? garantias(extra) : DATOS_PERSONAS
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  const marco = () => page.frames().find((f) => f.name() === 'mainFrame')!
  for (let i = 0; i < 40 && !page.frames().some((f) => f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
  if (opciones.confirmar !== false && url === B028) {
    await marco().locator('#confirmar').waitFor()
    await pulsarConfirmarDatosPersonasGenerali(page, guard, 50)
  }
  await marco().locator('#siguiente, #cancelar').first().waitFor()
  for (let i = 0; i < 40 && opciones.confirmar !== false && url === B028 && (await marco().locator('#siguiente').count()) === 0; i++) await new Promise((x) => setTimeout(x, 100))
  return { page, guard, cerrar: () => context.close() }
}
const clics = (page: Page, k: '__sig' | '__cmp') => page.evaluate((n) => (window as unknown as Record<string, number | undefined>)[n] ?? 0, k)
const bloquea = (re: RegExp) => (e: unknown) => e instanceof EmisionBloqueadaError && re.test((e as Error).message)

test('v0.2.30 · «Garantías y Capitales opcionales» sin importe y con el tomador confirmado: «Siguiente» se pulsa UNA vez y «Comparar» no', async () => {
  const { page, guard, cerrar } = await abrir('<table><tr><th>Garantía</th><th>Capital</th></tr><tr><td>Lunas</td><td>incluida</td></tr></table>')
  try {
    await pulsarSiguienteValoracionGenerali(page, guard, 50)
    assert.equal(await clics(page, '__sig'), 1)
    assert.equal(await clics(page, '__cmp'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.30 · con «Emitir» visible en la pantalla de garantías → bloqueado', async () => {
  const { page, guard, cerrar } = await abrir('<p>Pulse para emitir la póliza</p>')
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/emisión|contratación|pago|firma/))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.30 · con precio ya legible en la pantalla de garantías → no hace falta avanzar (bloqueado)', async () => {
  const { page, guard, cerrar } = await abrir(TABLA_PRIMA)
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/precio ya legible/))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.30 · sin el tomador confirmado en este trabajo → bloqueado', async () => {
  const { page, guard, cerrar } = await abrir('', { confirmar: false })
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/sin el tomador confirmado/))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.30 · máx. 3 «Siguiente» por trabajo también en garantías', async () => {
  const { page, guard, cerrar } = await abrir('')
  try {
    for (let i = 0; i < 3; i++) await pulsarSiguienteValoracionGenerali(page, guard, 50)
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/ya se pulsó 3 veces/))
    assert.equal(await clics(page, '__sig'), 3)
  } finally {
    await cerrar()
  }
})

for (const v of ['Emitir ›', 'Paso con datos incompletos', 'Contratar']) {
  test(`v0.2.30 · en garantías el botón «${v}» sigue bloqueado`, async () => {
    const context = await browser.newContext()
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', async (r) => {
      const u = r.request().url()
      const cuerpo = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>` : u.includes('g=1') ? garantias('', v) : DATOS_PERSONAS
      await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    try {
      await page.goto(PORTAL)
      const marco = () => page.frames().find((f) => f.name() === 'mainFrame')!
      await marco().locator('#confirmar').waitFor()
      await pulsarConfirmarDatosPersonasGenerali(page, guard, 50)
      await marco().locator('#siguiente').waitFor()
      await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), EmisionBloqueadaError)
      assert.equal(await clics(page, '__sig'), 0)
    } finally {
      await context.close()
    }
  })
}

test('v0.2.30 · fuera de emiAutosGenB028 sigue bloqueado', async () => {
  const { page, guard, cerrar } = await abrir('', { confirmar: false, url: OTRA })
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), bloquea(/fuera de emiAutosGenB028/))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})
