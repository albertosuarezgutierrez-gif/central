// Mapfre auto v0.8.12 · DIAGNÓSTICO de solo lectura del formato del «Nº de Póliza» anterior. Fixtures SINTÉTICAS, sin PII.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { readFileSync } from 'node:fs'
import { diagnosticoPolizaAnterior, historialAnterior, historialAnteriorConPoliza, mapfreAuto, ofertasDesdePrimasMapfre } from '../src/adapters/mapfre/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'

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

const form = { ramo: 'auto', aniosAseguradoAnterior: 3 } as unknown as FormularioAuto

const pagina = async (html: string): Promise<Page> => {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<!doctype html><body><app-historial-siniestralidad><mat-form-field>${html}</mat-form-field></app-historial-siniestralidad>`)
  return page
}

test('versión del bot Mapfre auto: 0.8.29', () => {
  assert.equal(mapfreAuto.version, '0.8.40')
})

test('diagnóstico: lee maxlength/placeholder/obligatorio/hint/error; no toca el valor', async () => {
  const page = await pagina('<mat-label>Nº de Póliza<span class="mat-placeholder-required">*</span></mat-label><input formcontrolname="numPoliza" maxlength="20" minlength="5" placeholder="Ej. 12345" type="text" inputmode="numeric" required><mat-hint>Indique los 5 últimos dígitos</mat-hint><mat-error>Campo obligatorio</mat-error>')
  const d = await diagnosticoPolizaAnterior(page)
  assert.ok(d && d.startsWith('Diagnóstico Nº póliza anterior Mapfre:'))
  for (const trozo of ['maxlength=20', 'minlength=5', 'placeholder=Ej. 12345', 'inputmode=numeric', 'obligatorio=true', 'ayuda=Indique los 5 últimos dígitos', 'error=Campo obligatorio']) assert.ok(d.includes(trozo), trozo)
  assert.equal(await page.locator('input').inputValue(), '', 'solo lectura')
  await page.context().close()
})

test('diagnóstico: sin atributos no rompe; sin campo → null; el valor nunca aparece', async () => {
  const page = await pagina('<input formcontrolname="numPoliza" value="VALOR-SECRETO-123">')
  const d = await diagnosticoPolizaAnterior(page)
  assert.ok(d?.includes('maxlength=n/d') && d.includes('obligatorio=false'))
  assert.ok(!d?.includes('VALOR-SECRETO-123'))
  await page.context().close()
  const vacia = await pagina('<span>sin campo</span>')
  assert.equal(await diagnosticoPolizaAnterior(vacia), null)
  await vacia.context().close()
})

test('diagnóstico: fallo de lectura → aviso «no se pudo leer el formato», sin lanzar', async () => {
  const raiz = { locator: () => ({ first: () => ({ count: async () => 1, evaluate: async () => { throw new Error('boom') } }) }) } as never
  assert.match((await diagnosticoPolizaAnterior(raiz)) ?? '', /no se pudo leer el formato/)
})

test('historialAnterior: devuelve el diagnóstico; obligatorio y vacío → `datos` CON el diagnóstico en el mensaje', async () => {
  const ok = await pagina('<input formcontrolname="numPoliza" maxlength="20">')
  assert.match((await historialAnterior(ok, form, undefined)) ?? '', /maxlength=20/)
  await ok.context().close()
  const obl = await pagina('<input formcontrolname="numPoliza" maxlength="20" required>')
  await assert.rejects(() => historialAnterior(obl, form, undefined), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /póliza de la compañía anterior/.test(e.message) && /maxlength=20/.test(e.message))
  await obl.context().close()
})

test('el diagnóstico viaja como aviso de la oferta, sin ser un supuesto', () => {
  const [o] = ofertasDesdePrimasMapfre([{ producto: 'X', periodicidad: 'anual', primaTotalEur: 100, requiereVerificacionVehiculo: false }], null, null, 'Diagnóstico Nº póliza anterior Mapfre: maxlength=20')
  assert.ok(o!.avisos.some((a) => a.includes('maxlength=20')))
  assert.ok(!ofertasDesdePrimasMapfre([{ producto: 'X', periodicidad: 'anual', primaTotalEur: 100, requiereVerificacionVehiculo: false }], null)[0]!.avisos.some((a) => a.includes('Diagnóstico')))
})

// ───────────── escritura de las 5 últimas cifras (Alberto: Mapfre acepta las últimas 5) ─────────────
const CINCO = '00123'
const formCon = { ...form, polizaAnteriorUltimos5: CINCO } as unknown as FormularioAuto
const valorDe = (page: Page) => page.locator('input[formcontrolname="numPoliza"]').inputValue()

test('póliza anterior: vacío + 5 cifras en el riesgo → se escribe, se relee y el valor NUNCA va a logs', async () => {
  const page = await pagina('<input formcontrolname="numPoliza" maxlength="20" required>')
  const logs: string[] = []
  const formador = { log: (m: string, d?: unknown) => logs.push(m + JSON.stringify(d ?? {})) } as never
  const diag = await historialAnterior(page, formCon, formador)
  assert.equal(await valorDe(page), CINCO)
  assert.ok(!logs.join('|').includes(CINCO) && !(diag ?? '').includes(CINCO))
  await page.context().close()
})

test('póliza anterior: ausente y NO obligatorio → intacto; ausente y obligatorio → `datos`; ya relleno → no se pisa', async () => {
  const a = await pagina('<input formcontrolname="numPoliza">')
  await historialAnterior(a, form, undefined)
  assert.equal(await valorDe(a), '')
  await a.context().close()
  const b = await pagina('<input formcontrolname="numPoliza" required>')
  await assert.rejects(() => historialAnterior(b, form, undefined), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await b.context().close()
  const c = await pagina('<input formcontrolname="numPoliza" value="99999">')
  await historialAnterior(c, formCon, undefined)
  assert.equal(await valorDe(c), '99999')
  await c.context().close()
  const d = await pagina('<input formcontrolname="numPoliza">')
  await historialAnterior(d, { ...form, polizaAnteriorUltimos5: '12' } as unknown as FormularioAuto, undefined)
  assert.equal(await valorDe(d), '', 'valor que no son 5 cifras: no se escribe')
  await d.context().close()
})

test('póliza anterior: el portal no deja fijar el valor → `datos` claro', async () => {
  const page = await pagina('<input formcontrolname="numPoliza" oninput="this.value=\'\'">')
  await assert.rejects(() => historialAnterior(page, formCon, undefined), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /nº de póliza/.test(e.message) && !e.message.includes(CINCO))
  await page.context().close()
})

// ───────────── v0.8.36 (30/10/2026, «SINCO al tarificar»): señal de nº de póliza TECLEADO ─────────────
test('v0.8.36 SINCO: `polizaTecleada` solo si el bot escribió y releyó; ya relleno, sin dato o 0 años → false; el valor nunca sale', async () => {
  const escrito = await pagina('<input formcontrolname="numPoliza" maxlength="20">')
  const r = await historialAnteriorConPoliza(escrito, formCon, undefined)
  assert.equal(r.polizaTecleada, true)
  assert.equal(await valorDe(escrito), CINCO)
  assert.ok(!JSON.stringify(r).includes(CINCO))
  await escrito.context().close()
  const relleno = await pagina('<input formcontrolname="numPoliza" value="99999">')
  assert.equal((await historialAnteriorConPoliza(relleno, formCon, undefined)).polizaTecleada, false, 'lo puso el portal: no se sabe qué número usó')
  await relleno.context().close()
  const sinDato = await pagina('<input formcontrolname="numPoliza">')
  assert.equal((await historialAnteriorConPoliza(sinDato, form, undefined)).polizaTecleada, false)
  await sinDato.context().close()
  const cero = await pagina('<input formcontrolname="numPoliza">')
  assert.deepEqual(await historialAnteriorConPoliza(cero, { ...formCon, aniosAseguradoAnterior: 0 } as unknown as FormularioAuto, undefined), { diagnostico: null, polizaTecleada: false })
  assert.equal(await valorDe(cero), '')
  await cero.context().close()
})

test('v0.8.36 SINCO: el flujo de tarificar marca las ofertas con la señal del historial (y el historial omitido no la da)', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.match(src, /const historial = sinHist\.omitido \? \{ diagnostico: null, polizaTecleada: false \} : await historialAnteriorConPoliza\(nsei, f, ctx\.formador\)/)
  assert.match(src, /ofertas: conPolizaAnteriorTecleada\(ofertasConPdfProyecto\([\s\S]*?\), historial\.polizaTecleada\)/)
})
