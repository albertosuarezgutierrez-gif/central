// Generali auto v0.2.69: «Verificación del riesgo» es CONDICIONAL (no para si falta con la pestaña cargada) y se ofrecen TODAS las modalidades.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { asegurarGarantiasYResultadosGenerali, elegirVerificacionRiesgoGenerali, ErrorMapaIncompletoGenerali, ofertasDeLecturaGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { leerModalidadesGenerali } from '../src/adapters/generali/reglas.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

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
after(async () => { await browser?.close() })

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    return await fn(page)
  } finally { await context.close() }
}
const ctxCon = (cuenta: { n: number }) => ({ pulsarSubpestanaGenerali: async () => { cuenta.n++ }, pulsar: async (l: { click: () => Promise<void> }) => { await l.click() } }) as unknown as ContextoPortal

// Pestaña cargada SIN bloque de verificación (estructura del volcado: tabla de modalidades vacía, envío, abogado).
const PESTANA_SIN_VERIF = '<div id="reg1063E_gridmodsegIdentification"><table><tr><th>Modalidades de Seguro</th><th>Recibo Anual</th></tr></table></div><div id="reg1063E_opcEnvioIdentification">Envío</div>'
// Bloque de verificación con hijos flotantes: el contenedor mide 0 de alto (caso real: Playwright no lo da por visible).
const VERIF_FLOTANTE = '<div id="reg1063E_verifRiesgoIdentification"><div id="reg1063E_verifRiesgo_zvriepIdentification"><div style="float:left">El mediador declara que ha realizado la verificación del riesgo a asegurar, y que el mismo se encuentra en perfecto estado</div><div style="float:left"><input type="radio" name="reg1063E.verifRiesgo.zvriep"><span>No</span><input type="radio" name="reg1063E.verifRiesgo.zvriep"><span>Sí</span></div></div></div>'

test('v0.2.69 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.70'))

test('pestaña cargada sin bloque de verificación: sigue sin él (false), sin error ni clic', async () => {
  const c = { n: 0 }
  const r = await conPagina(PESTANA_SIN_VERIF, (p) => asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2))
  assert.equal(r, false)
  assert.equal(c.n, 0)
})

test('pestaña cargada con el bloque (hijos flotantes, contenedor de alto 0): se da por presente (true)', async () => {
  const c = { n: 0 }
  const r = await conPagina(PESTANA_SIN_VERIF + VERIF_FLOTANTE, (p) => asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2))
  assert.equal(r, true)
})

test('la pestaña no cargó (ningún bloque suyo): error que nombra la pestaña, tras una sola pulsación', async () => {
  const c = { n: 0 }
  await conPagina('<p>Datos de Valoración</p>', async (p) => {
    await assert.rejects(asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2), (e) => e instanceof ErrorMapaIncompletoGenerali && /pestaña «Garantías y Resultados» \(no cargó/.test(String(e.message)))
  })
  assert.equal(c.n, 1)
})

test('«Verificación del riesgo» = «No» se marca aunque el contenedor mida 0 de alto', async () => {
  const aviso = await conPagina(PESTANA_SIN_VERIF + VERIF_FLOTANTE, async (p) => {
    const r = await elegirVerificacionRiesgoGenerali(p, ctxCon({ n: 0 }))
    assert.equal(await p.locator('input[name="reg1063E.verifRiesgo.zvriep"]').first().isChecked(), true)
    return r
  })
  assert.equal(aviso, 'Verificación del riesgo: no')
})

test('sin bloque de verificación: elegirVerificacionRiesgoGenerali devuelve null (no es error)', async () => {
  assert.equal(await conPagina(PESTANA_SIN_VERIF, (p) => elegirVerificacionRiesgoGenerali(p, ctxCon({ n: 0 }))), null)
})

// ── Todas las modalidades como ofertas separadas ──
const f = (modalidad: string, ra: string, marcada = false) => ({ modalidad, marcada, recibo: [ra], prima: [] as string[] })

test('tabla con 3 modalidades: una oferta por modalidad, con su prima y su nombre, sin los avisos «Otras modalidades»', () => {
  const l = leerModalidadesGenerali([f('Terceros Básico', '300,10'), f('Terceros Ampliado', '420,55'), f('Todo Riesgo con franquicia', '710,00')])
  assert.equal(l.tipo, 'unico')
  if (l.tipo !== 'unico') return
  assert.equal(l.modalidades?.length, 3)
  const of = ofertasDeLecturaGenerali(l, null, l.avisos ?? [])
  assert.deepEqual(of.map((o) => o.primaAnualEur), [300.1, 420.55, 710])
  assert.deepEqual(of.map((o) => o.producto), ['Auto · Turismos (Ramo UV) · Terceros Básico', 'Auto · Turismos (Ramo UV) · Terceros Ampliado', 'Auto · Turismos (Ramo UV) · Todo Riesgo con franquicia'])
  for (const o of of) assert.ok(!o.avisos.some((a) => /Otras modalidades|Modalidad no marcada/.test(a)), o.avisos.join(' | '))
  assert.ok(of[1]!.avisos.some((a) => a.includes('Terceros Ampliado')))
})

test('con una marcada y otras sin marcar también salen todas; con una sola modalidad, una sola oferta como antes', () => {
  const l = leerModalidadesGenerali([f('A', '400,00', true), f('B', '500,00')])
  assert.equal(l.tipo === 'unico' && l.eur, 400)
  if (l.tipo === 'unico') assert.equal(ofertasDeLecturaGenerali(l, null).length, 2)
  const u = leerModalidadesGenerali([f('A', '400,00', true), f('B', '')])
  assert.equal(u.tipo, 'unico')
  if (u.tipo === 'unico') {
    assert.equal(u.modalidades, undefined)
    const of = ofertasDeLecturaGenerali(u, null)
    assert.equal(of.length, 1)
    assert.equal(of[0]!.producto, 'Auto · Turismos (Ramo UV)')
  }
})

test('guardián: auto.ts no contiene «aceptar» fuera de lo ya existente', () => {
  const t = readFileSync(new URL('../src/adapters/generali/auto.ts', import.meta.url), 'utf8')
  const lineas = t.split('\n').filter((l) => /aceptar/i.test(l))
  assert.equal(lineas.length, 1, lineas.join('\n'))
})
