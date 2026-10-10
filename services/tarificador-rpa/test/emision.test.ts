// Cepos de la EMISIÓN autorizada en el navegador (10/10/2026). DOM mínimo de la pestaña Tarificar de ePAC Comunidades
// (`Idioma Proyecto PDF` = pestaña activa Tarificar; pie `div#aceptar`). Sin red: todo por `page.route`. Sin datos reales.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError, botonEmisionDe, crearPermisoEmision, type PermisoEmision } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, pulsarEmisionAutorizada, type GuardEmision } from '../src/guard.ts'
import { botonDelCanjeValido, motivoParaNoEmitir } from '../src/emision.ts'
import { numeroPolizaDeTexto } from '../src/adapters/allianz/comunidades.ts'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const BOTON = botonEmisionDe('allianz', 'comunidades')!
const URL_EMITE = 'https://portal.test/drrg21/emitirPoliza.do'

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => browser?.close())

/** Pestaña Tarificar con el pie «Aceptar» (que hace un POST de emisión) y otros controles. `extra` = HTML adicional. */
async function pantallaPrevia(extra = ''): Promise<{ page: Page; guard: GuardEmision; pulsados: () => Promise<string[]> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`
    <p>Idioma Proyecto PDF</p>
    <div id="aceptar" onclick="window.p=(window.p||[]).concat('aceptar'); fetch('${URL_EMITE}', {method:'POST', body:'action=contract'}).catch(()=>{})">Aceptar</div>
    <div id="calcular" onclick="window.p=(window.p||[]).concat('calcular')">Calcular</div>
    <span id="contract" onclick="window.p=(window.p||[]).concat('contract')">Emitir</span>
    ${extra}`)
  // La máquina de fases llega a Tarificar por el camino legítimo.
  guard.fases.autorizarOpcion('datos_basicos')
  guard.fases.autorizarAceptar('datos_basicos')
  guard.fases.confirmarTarificar('tarificar')
  return { page, guard, pulsados: () => page.evaluate(() => (window as unknown as { p?: string[] }).p ?? []) }
}

/** Espera a que la petición de emisión termine (bloqueada por el guard o fallida por red: el dominio no existe). */
const peticionEmision = (page: Page) => page.waitForEvent('requestfailed', { predicate: (r) => r.url() === URL_EMITE, timeout: 5_000 }).catch(() => null)

const permiso = (trabajoId = T1, hashDatos = H1): PermisoEmision => crearPermisoEmision({ trabajoId, hashDatos, boton: BOTON })

test('sin permiso → bloqueado y NO se pulsa', async () => {
  const { page, guard, pulsados } = await pantallaPrevia()
  await assert.rejects(pulsarEmisionAutorizada(page, guard, null as unknown as PermisoEmision, { trabajoId: T1, hashDatos: H1 }), EmisionBloqueadaError)
  assert.deepEqual(await pulsados(), [])
  await page.context().close()
})

test('el guard de siempre sigue cerrado: pulsar() normal del «Aceptar» de Tarificar y de «Emitir» → bloqueado', async () => {
  const { page, guard, pulsados } = await pantallaPrevia()
  await assert.rejects(pulsar(page.locator('#aceptar'), guard), EmisionBloqueadaError)
  await assert.rejects(pulsar(page.locator('#contract'), guard), EmisionBloqueadaError)
  assert.deepEqual(await pulsados(), [])
  await page.context().close()
})

test('sin el clic autorizado, una petición de emisión (POST action=contract) se ABORTA', async () => {
  const { page, guard } = await pantallaPrevia()
  const fin = peticionEmision(page)
  await page.evaluate((u) => { fetch(u, { method: 'POST', body: 'action=contract' }).catch(() => {}) }, URL_EMITE)
  await fin
  assert.ok(guard.violacion() instanceof EmisionBloqueadaError, 'el guard de red tiene que abortarla')
  await page.context().close()
})

test('permiso correcto: pulsa ESE botón una vez y la petición que provoca pasa; después todo vuelve a estar cerrado', async () => {
  const { page, guard, pulsados } = await pantallaPrevia()
  const p = permiso()
  const fin = peticionEmision(page)
  await pulsarEmisionAutorizada(page, guard, p, { trabajoId: T1, hashDatos: H1 })
  await fin
  assert.deepEqual(await pulsados(), ['aceptar'])
  assert.equal(guard.violacion(), null, 'la petición del clic autorizado tiene que salir (ventana de red)')
  guard.ventana.cerrar()
  // Con la ventana cerrada, la misma petición vuelve a abortarse.
  const otra = peticionEmision(page)
  await page.evaluate((u) => { fetch(u, { method: 'POST', body: 'action=contract' }).catch(() => {}) }, URL_EMITE)
  await otra
  assert.ok(guard.violacion() instanceof EmisionBloqueadaError)
  // Segunda vez, mismo permiso → bloqueado (fase y permiso). Y cualquier otro botón de emisión, igual.
  await assert.rejects(pulsarEmisionAutorizada(page, guard, p, { trabajoId: T1, hashDatos: H1 }), EmisionBloqueadaError)
  await assert.rejects(pulsar(page.locator('#contract'), guard), EmisionBloqueadaError)
  assert.deepEqual(await pulsados(), ['aceptar'])
  await page.context().close()
})

test('si el clic autorizado FALLA, la ventana de red se cierra en el acto (nada de emisión pasa después)', async () => {
  // Una capa encima del botón: el permiso se gasta y la ventana se abre, pero el clic no llega a salir (timeout).
  const { page, guard, pulsados } = await pantallaPrevia('<div style="position:fixed;inset:0;z-index:9;background:#fff">tapa</div>')
  page.setDefaultTimeout(800)
  await assert.rejects(pulsarEmisionAutorizada(page, guard, permiso(), { trabajoId: T1, hashDatos: H1 }))
  assert.deepEqual(await pulsados(), [])
  assert.equal(guard.ventana.abierta(), false, 'la ventana de red no puede quedar abierta tras un clic fallido')
  const fin = peticionEmision(page)
  await page.evaluate((u) => { fetch(u, { method: 'POST', body: 'action=contract' }).catch(() => {}) }, URL_EMITE)
  await fin
  assert.ok(guard.violacion() instanceof EmisionBloqueadaError, 'con la ventana cerrada, una petición de emisión se aborta')
  await page.context().close()
})

test('runner: en el catch se cierran ventana de red y navegador ANTES de enviar el resultado (que reintenta)', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/emision.ts'), 'utf8')
  const intento = src.slice(src.indexOf('await ctx.pulsarEmision(permiso'), src.indexOf("log('emision_pulsada')"))
  assert.ok(intento.indexOf('g.ventana.cerrar()') > -1 && intento.indexOf('g.ventana.cerrar()') < intento.indexOf('throw e'), 'catch del clic: cerrar la ventana antes de relanzar')
  const fallo = src.slice(src.indexOf('  } catch (e) {\n    // Primero se corta todo'), src.indexOf('  } finally {'))
  assert.ok(fallo.length > 0, 'falta el catch general')
  const cierra = fallo.indexOf('await cerrarTodo()')
  assert.ok(cierra > -1 && cierra < fallo.indexOf('enviar('), 'catch general: cerrarTodo() antes de enviar')
  const ct = src.slice(src.indexOf('const cerrarTodo = async () => {'), src.indexOf('const cerrarTodo = async () => {') + 300)
  assert.match(ct, /guard\?\.ventana\.cerrar\(\)/)
  assert.match(ct, /close\(\)/)
})

test('token/permiso usado dos veces (otra página, mismo permiso) → bloqueado', async () => {
  const p = permiso()
  const a = await pantallaPrevia()
  await pulsarEmisionAutorizada(a.page, a.guard, p, { trabajoId: T1, hashDatos: H1 })
  await a.page.context().close()
  const b = await pantallaPrevia()
  await assert.rejects(pulsarEmisionAutorizada(b.page, b.guard, p, { trabajoId: T1, hashDatos: H1 }), /ya usado/)
  assert.deepEqual(await b.pulsados(), [])
  await b.page.context().close()
})

test('permiso de otro trabajo o con otro hash (precio) → bloqueado y NO se pulsa', async () => {
  for (const [t, h] of [[T2, H1], [T1, H2]]) {
    const { page, guard, pulsados } = await pantallaPrevia()
    await assert.rejects(pulsarEmisionAutorizada(page, guard, permiso(), { trabajoId: t, hashDatos: h }), EmisionBloqueadaError)
    assert.deepEqual(await pulsados(), [])
    await page.context().close()
  }
})

test('botón distinto o ambiguo → bloqueado y NO se pulsa', async () => {
  // a) dos controles «Aceptar» con ese id; b) el botón del permiso lleva un manejador prohibido (pago fraccionado).
  for (const extra of ['<div id="aceptar">Aceptar</div>']) {
    const { page, guard, pulsados } = await pantallaPrevia(extra)
    await assert.rejects(pulsarEmisionAutorizada(page, guard, permiso(), { trabajoId: T1, hashDatos: H1 }), EmisionBloqueadaError)
    assert.deepEqual(await pulsados(), [])
    await page.context().close()
  }
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<p>Idioma Proyecto PDF</p><div id="aceptar" onclick="pagoFraccionado(); window.p=['aceptar']">Aceptar</div>`)
  guard.fases.autorizarOpcion('datos_basicos')
  guard.fases.autorizarAceptar('datos_basicos')
  guard.fases.confirmarTarificar('tarificar')
  await assert.rejects(pulsarEmisionAutorizada(page, guard, permiso(), { trabajoId: T1, hashDatos: H1 }), EmisionBloqueadaError)
  assert.deepEqual(await page.evaluate(() => (window as unknown as { p?: string[] }).p ?? []), [])
  await context.close()
})

test('fuera de Tarificar (pestaña no verificada) → bloqueado aunque el permiso sea bueno', async () => {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<p>COSTE ANUAL DEL SEG.</p><div id="aceptar" onclick="window.p=['aceptar']">Aceptar</div>`)
  await assert.rejects(pulsarEmisionAutorizada(page, guard, permiso(), { trabajoId: T1, hashDatos: H1 }), EmisionBloqueadaError)
  assert.deepEqual(await page.evaluate(() => (window as unknown as { p?: string[] }).p ?? []), [])
  await context.close()
})

test('runner: no empieza sin interruptor de la máquina, sin fase, sin adaptador con emisión o fuera de la lista blanca', () => {
  const ad = { emision: { hastaPantallaPrevia: async () => ({ primaCents: 1 }), leerNumeroPoliza: async () => null } }
  const t = { compania: 'allianz', ramo: 'comunidades', emision: { fase: 'preparar' as const } }
  const on = { TARIFICADOR_EMISION_ACTIVA: '1' }
  assert.equal(motivoParaNoEmitir(t, ad, on), null)
  assert.match(motivoParaNoEmitir(t, ad, {}) ?? '', /apagada/)
  assert.match(motivoParaNoEmitir({ ...t, emision: undefined }, ad, on) ?? '', /sin fase/)
  assert.match(motivoParaNoEmitir(t, {}, on) ?? '', /no emite/)
  assert.match(motivoParaNoEmitir({ ...t, compania: 'occident' }, ad, on) ?? '', /no habilitada/)
  assert.match(motivoParaNoEmitir(t, { ...ad, sesion: 'manual' }, on) ?? '', /sesión manual/)
})

test('runner: el botón que devuelve el canje tiene que ser el de la lista blanca local', () => {
  assert.equal(botonDelCanjeValido('allianz', 'comunidades', BOTON), true)
  assert.equal(botonDelCanjeValido('allianz', 'comunidades', { id: 'contract', texto: 'Emitir' }), false)
  assert.equal(botonDelCanjeValido('occident', 'comunidades', BOTON), false)
})

test('nº de póliza: solo uno inequívoco junto a «póliza»', () => {
  assert.equal(numeroPolizaDeTexto('Se ha emitido la póliza nº 041234567 correctamente'), '041234567')
  assert.equal(numeroPolizaDeTexto('Póliza: 12-345678-90'), '12-345678-90')
  assert.equal(numeroPolizaDeTexto('Datos de emisión pendientes'), null)
  assert.equal(numeroPolizaDeTexto('Póliza a reemplazar 111111111 · nueva póliza 222222222'), null)
  assert.equal(numeroPolizaDeTexto(null), null)
})

test('el token nunca va a un log: ninguna llamada a log() de emision.ts lo nombra, y todo motivo pasa por sinTokens', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/emision.ts'), 'utf8')
  const logs = src.split('\n').filter((l) => /\blog\(/.test(l) && !/^\s*(\/\/|\*)/.test(l))
  assert.ok(logs.length > 0)
  for (const l of logs) assert.ok(!/token/i.test(l), `log con token: ${l.trim()}`)
  assert.match(src, /const limpio = \(t: string\) => sinTokens\(d\.redactar\(t\), token \? \[token\] : \[\]\)/)
  assert.match(src, /const motivo = limpio\(/)
})
