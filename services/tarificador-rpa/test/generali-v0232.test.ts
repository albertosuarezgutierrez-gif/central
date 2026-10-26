// Generali Turismos v0.2.32 (26/10/2026, prueba real con 0.2.31): «Garantías y Capitales opcionales» (emiAutosGenB028) trae la sección «Envío Documentación
// Precontractual» y el 2.º «Siguiente» lo bloqueó el escaneo de textos de emisión. (1) el motivo cita lo que casó (truncado, sin cifras largas), (2) esa sección
// (solo prosa) no cuenta como emisión; cualquier otro texto de emisión fuera de ella sigue bloqueando, (3) tras el avance se lee el precio de la pantalla nueva.
// Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, hastaPrecioGenerali } from '../src/adapters/generali/auto.ts'
import { casaEmisionGenerali, instalarGuardEmision, pulsarConfirmarDatosPersonasGenerali, pulsarSiguienteValoracionGenerali, sinSeccionPrecontractualGenerali, textoEmisionGenerali, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.32 · versión', () => assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[2-9]|[4-9]\d)$/))

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

const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'
const CAB = '<h3>Garantías y Capitales opcionales</h3><h4>Bonus-Malus</h4>'
const PRECONTRACTUAL = '<h4>Envío Documentación Precontractual</h4><p>El mediador deberá firmar y entregar al cliente la documentación precontractual antes de contratar el seguro.</p>'
const DATOS_PERSONAS = `<ul><li class="pestana"><a href="#">Selección personas que intervienen</a></li><li class="pestanaActiva"><a href="#">Datos personas</a></li></ul>
  <input id="personas_intere_nifcif" type="text" value="00000000T" readonly>
  <input id="cancelar" type="button" value="Volver"><input id="confirmar" type="button" value="Confirmar" onclick="location.href='${B028}?g=1'">`
const garantias = (extra: string) => `${CAB}${extra}<input id="comparar" type="button" value="Comparar" onclick="parent.__cmp=(parent.__cmp||0)+1">
  <input id="historial" type="button" value="Historial Siniestral"><input id="siguiente" type="button" value="Siguiente ›" onclick="parent.__sig=(parent.__sig||0)+1">`

async function abrir(extra: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    const cuerpo = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>` : u.includes('g=1') ? garantias(extra) : DATOS_PERSONAS
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  const marco = () => page.frames().find((f) => f.name() === 'mainFrame')!
  for (let i = 0; i < 40 && !page.frames().some((f) => f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
  await marco().locator('#confirmar').waitFor()
  await pulsarConfirmarDatosPersonasGenerali(page, guard, 50)
  for (let i = 0; i < 40 && (await marco().locator('#siguiente').count()) === 0; i++) await new Promise((x) => setTimeout(x, 100))
  return { page, guard, cerrar: () => context.close() }
}
const clics = (page: Page, k: '__sig' | '__cmp') => page.evaluate((n) => (window as unknown as Record<string, number | undefined>)[n] ?? 0, k)

test('v0.2.32 · pura: el motivo cita lo que casó, truncado y sin cifras largas', () => {
  assert.equal(casaEmisionGenerali('Pantalla sin nada'), null)
  const c = casaEmisionGenerali('Nombre Pepe 12345678Z. Pulse para EMITIR póliza ya')
  assert.match(c ?? '', /«emitir»/)
  assert.doesNotMatch(c ?? '', /12345678Z/)
  assert.ok((casaEmisionGenerali('x'.repeat(500) + ' firmar ' + 'y'.repeat(500)) ?? '').length < 160)
  assert.equal(textoEmisionGenerali('Debe firmar aquí'), true)
})

test('v0.2.32 · pura: la sección precontractual (prosa) se quita; un botón corto de emisión dentro o fuera se queda', () => {
  const prosa = 'Envío Documentación Precontractual\nEl mediador deberá firmar y entregar la documentación precontractual antes de contratar.\nSiguiente ›'
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(prosa)), false)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali('Envío Documentación Precontractual\nEmitir póliza')), true)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(prosa + '\nEmitir póliza')), true)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali('Envío Documentación Precontractual\nTexto largo para firmar algo\nSiguiente ›\nPagar el recibo ahora mismo')), true)
})

test('v0.2.32 · pura: una PREGUNTA de emisión o una línea con «póliza» tras la sección bloquea; un diálogo cierra la sección', () => {
  const cab = 'Envío Documentación Precontractual\nEl mediador deberá firmar y entregar al cliente la documentación precontractual antes de contratar el seguro.\n'
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(cab)), false)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(cab + '¿Desea emitir la póliza y enviar la documentación al tomador?')), true)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(cab + 'Debe firmar la póliza y enviar la documentación al cliente por correo')), true)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(cab + '¿Desea contratar y enviar la documentación al cliente ahora?')), true)
  assert.equal(textoEmisionGenerali(sinSeccionPrecontractualGenerali(cab + '[[DIALOGO]]\nDebe firmar y enviar la documentación al cliente por correo electrónico')), true)
})

test('v0.2.32 · con la sección «Envío Documentación Precontractual» y nada más → «Siguiente» se pulsa; «Comparar» no', async () => {
  const { page, guard, cerrar } = await abrir(PRECONTRACTUAL)
  try {
    await pulsarSiguienteValoracionGenerali(page, guard, 50)
    assert.equal(await clics(page, '__sig'), 1)
    assert.equal(await clics(page, '__cmp'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.32 · «Emitir póliza» visible fuera de la sección → bloqueado y el motivo cita el texto', async () => {
  const { page, guard, cerrar } = await abrir(`${PRECONTRACTUAL}<h4>Acciones</h4><p>Emitir póliza</p>`)
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), (e: unknown) => e instanceof EmisionBloqueadaError && /casó «emitir» en «….*emitir poliza/.test((e as Error).message))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.32 · sin la sección, un «firmar» suelto sigue bloqueando', async () => {
  const { page, guard, cerrar } = await abrir('<p>Debe firmar el documento</p>')
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), (e: unknown) => e instanceof EmisionBloqueadaError && /casó «firmar»/.test((e as Error).message))
    assert.equal(await clics(page, '__sig'), 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.32 · tras el avance, hastaPrecioGenerali lee la pantalla de resultados («Recibo Anual 456,78 €»), aunque tenga un botón de emitir (no se pulsa)', async () => {
  const coche = (): FormularioAuto => {
    const v = validarFormularioAuto({
      ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
      conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
      tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
    })
    if (!v.ok) throw new Error(JSON.stringify(v))
    return v.formulario as FormularioAuto
  }
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${garantias(PRECONTRACTUAL)}</body></html>`)
    let siguientes = 0
    const ctx = {
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: async () => {
        siguientes++
        await page.setContent('<html><body><h3>Resultados</h3><p>Recibo Anual 456,78 €</p><input type="button" value="Emitir póliza" onclick="window.__emitido=1"></body></html>')
        return {}
      },
    } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
    assert.equal(siguientes, 1)
    assert.equal(await page.evaluate(() => (window as unknown as { __emitido?: number }).__emitido ?? 0), 0)
  } finally {
    await context.close()
  }
})
