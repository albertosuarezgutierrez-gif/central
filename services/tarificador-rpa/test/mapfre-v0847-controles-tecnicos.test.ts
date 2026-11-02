// Mapfre auto v0.8.47 · diálogo «Controles técnicos» (Código 232) tras «Continuar»: detección, extracción, exclusión de los mat-error del
// overlay, fecha de efecto y cierre guardado. Textos y fechas FICTICIOS; el reloj siempre inyectado (`hoy`).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ajustarFechaEfectoTras232, camposConErrorVisibles, mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import {
  avisoFechaEfectoSupuesta,
  esRechazoFechaEfectoAnteriorMecanizacion,
  esTextoControlesTecnicos,
  extraerRechazoControlesTecnicos,
  fechaEfectoTrasMecanizacion,
  hoyEs,
  mensajeRechazoControlesTecnicos,
} from '../src/controles-tecnicos-mapfre.ts'
import { cerrarControlesTecnicosMapfre, instalarGuardEmision, limpiarMensajePortalDiagnosticoHasta, rearmarContinuarMapfreTrasControlesTecnicos, type GuardEmision } from '../src/guard.ts'
import { ErrorTarificador } from '../src/errores.ts'

test('v0.8.47 · versión', () => assert.equal(mapfreAuto.version, '0.8.48'))

const TEXTO =
  'Resultado\nCódigo 232\nControles técnicos\nOperación rechazada al ser la fecha de efecto anterior a la fecha de mecanización de la póliza.\nMatrícula *\nCampo obligatorio\nNº Bastidor *\nCampo obligatorio\nTeléfono Móvil *\nEmail\nCerrar'
const limpiar = (t: string) => limpiarMensajePortalDiagnosticoHasta(t, 200)

test('detección: rótulo «Controles técnicos» + «Código NNN»; otros diálogos no', () => {
  assert.equal(esTextoControlesTecnicos(TEXTO), true)
  assert.equal(esTextoControlesTecnicos('CONTROLES TECNICOS codigo 7 algo'), true)
  assert.equal(esTextoControlesTecnicos('Resultado Código 232 otra cosa'), false)
  assert.equal(esTextoControlesTecnicos('Controles técnicos sin número'), false)
  assert.equal(esTextoControlesTecnicos('Aviso: no existe ningún registro'), false)
})

test('extracción: código y motivo, cortados antes del formulario propio del diálogo', () => {
  const r = extraerRechazoControlesTecnicos(TEXTO, limpiar)!
  assert.equal(r.codigo, '232')
  assert.equal(r.texto, 'Operación rechazada al ser la fecha de efecto anterior a la fecha de mecanización de la póliza.')
  assert.equal(mensajeRechazoControlesTecnicos(r), 'Mapfre rechaza (Código 232): Operación rechazada al ser la fecha de efecto anterior a la fecha de mecanización de la póliza.')
  assert.equal(esRechazoFechaEfectoAnteriorMecanizacion(r), true)
  assert.equal(extraerRechazoControlesTecnicos('nada que ver', limpiar), null)
  const otro = extraerRechazoControlesTecnicos('Resultado Código 118 Controles técnicos Vehículo no asegurable. Cerrar', limpiar)!
  assert.deepEqual(otro, { codigo: '118', texto: 'Vehículo no asegurable.' })
  assert.equal(esRechazoFechaEfectoAnteriorMecanizacion(otro), false)
})

test('extracción: el saneador quita correos y teléfonos del motivo', () => {
  const r = extraerRechazoControlesTecnicos('Código 5 Controles técnicos Avisar a persona@ejemplo.test o al 600 000 000 ya. Cerrar', limpiar)!
  assert.ok(!/@|600/.test(r.texto), r.texto)
})

test('fecha de efecto: max(efecto, mecanización, hoy); ilegible = null; sin cambio = cambia false', () => {
  assert.deepEqual(fechaEfectoTrasMecanizacion('01/11/2026', '15/11/2026', '05/11/2026'), { fecha: '15/11/2026', cambia: true })
  assert.deepEqual(fechaEfectoTrasMecanizacion('01/11/2026', '15/10/2026', '05/11/2026'), { fecha: '05/11/2026', cambia: true })
  assert.deepEqual(fechaEfectoTrasMecanizacion('20/11/2026', '15/10/2026', '05/11/2026'), { fecha: '20/11/2026', cambia: false })
  assert.deepEqual(fechaEfectoTrasMecanizacion('1/12/2026', '3/1/2027', '05/11/2026'), { fecha: '03/01/2027', cambia: true })
  assert.equal(fechaEfectoTrasMecanizacion(null, '15/11/2026', '05/11/2026'), null)
  assert.equal(fechaEfectoTrasMecanizacion('01/11/2026', null, '05/11/2026'), null)
  assert.equal(fechaEfectoTrasMecanizacion('31/02/2026', '15/11/2026', '05/11/2026'), null)
  assert.equal(fechaEfectoTrasMecanizacion('01/11/2026', 'pendiente', '05/11/2026'), null)
  assert.equal(hoyEs(new Date('2026-11-05T12:00:00Z')), '05/11/2026')
  assert.match(avisoFechaEfectoSupuesta('15/11/2026'), /15\/11\/2026/)
})

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

async function preparar(html: string): Promise<{ page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { page, guard }
}

const DIALOGO = `<div class="cdk-overlay-container"><mat-dialog-container><div class="controles-tecnicos-dialog">
<div>Resultado</div><div>Código 232</div><div>Controles técnicos</div><div>Operación rechazada al ser la fecha de efecto anterior a la fecha de mecanización de la póliza.</div>
<mat-form-field><mat-label>Matrícula *</mat-label><input name="m"><mat-error>Campo obligatorio</mat-error></mat-form-field>
<mat-form-field><mat-label>Nº Bastidor *</mat-label><input name="b"><mat-error>Campo obligatorio</mat-error></mat-form-field>
<button id="c" onclick="document.querySelector('.controles-tecnicos-dialog').remove()">Cerrar</button></div></mat-dialog-container></div>`
const PASO = (extra = '') => `<app-datos-basicos><mat-form-field><mat-label>Compañía *</mat-label><input name="c"><mat-error>Campo obligatorio</mat-error></mat-form-field>${extra}</app-datos-basicos>`

test('camposConErrorVisibles: ignora los mat-error del diálogo/overlay, conserva los del paso', async () => {
  const { page } = await preparar(PASO() + DIALOGO)
  assert.deepEqual(await camposConErrorVisibles(page), ['Compañía'])
  const { page: p2 } = await preparar(DIALOGO)
  assert.deepEqual(await camposConErrorVisibles(p2), [])
})

test('cerrarControlesTecnicosMapfre: pulsa «Cerrar», devuelve el texto y cierra', async () => {
  const { page, guard } = await preparar(DIALOGO)
  const texto = await cerrarControlesTecnicosMapfre(page, guard)
  assert.equal(extraerRechazoControlesTecnicos(texto)!.codigo, '232')
  assert.equal(await page.locator('.controles-tecnicos-dialog').count(), 0)
})

test('cerrarControlesTecnicosMapfre: botón con otro texto o diálogo ajeno → no pulsa', async () => {
  const mal = DIALOGO.replace('>Cerrar</button>', '>Cerrar y contratar</button>')
  const { page, guard } = await preparar(mal)
  await assert.rejects(() => cerrarControlesTecnicosMapfre(page, guard), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  assert.equal(await page.locator('.controles-tecnicos-dialog').count(), 1)
  const { page: p2, guard: g2 } = await preparar(DIALOGO.replace('Controles técnicos', 'Otra cosa'))
  await assert.rejects(() => cerrarControlesTecnicosMapfre(p2, g2), (e) => e instanceof ErrorTarificador)
})

test('reintento de «Continuar»: solo Datos básicos, tras cerrar controles técnicos y una vez', async () => {
  const { guard } = await preparar('')
  assert.throws(() => rearmarContinuarMapfreTrasControlesTecnicos(guard, 'datosBasicos'), EmisionBloqueadaError)
  assert.throws(() => rearmarContinuarMapfreTrasControlesTecnicos(guard, 'figuras'), EmisionBloqueadaError)
})

const FECHAS = (efecto: string, mecaniz: string | null) =>
  PASO(
    `<mat-form-field><mat-label>Fecha de efecto *</mat-label><input name="fe" value="${efecto}"></mat-form-field>` +
      (mecaniz === null ? '' : `<mat-form-field><mat-label>Fecha de mecanización</mat-label><input name="fm" value="${mecaniz}" readonly></mat-form-field>`),
  )

test('ajustarFechaEfectoTras232: escribe max(efecto, mecanización, hoy); sin mecanización legible no inventa', async () => {
  const { page } = await preparar(FECHAS('01/11/2026', '15/11/2026'))
  assert.equal(await ajustarFechaEfectoTras232(page, '05/11/2026'), '15/11/2026')
  assert.equal(await page.locator('input[name="fe"]').inputValue(), '15/11/2026')
  const { page: p2 } = await preparar(FECHAS('01/11/2026', null))
  assert.equal(await ajustarFechaEfectoTras232(p2, '05/11/2026'), null)
  assert.equal(await p2.locator('input[name="fe"]').inputValue(), '01/11/2026')
  const { page: p3 } = await preparar(FECHAS('20/11/2026', '15/11/2026'))
  assert.equal(await ajustarFechaEfectoTras232(p3, '05/11/2026'), null)
})
