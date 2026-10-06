// C.P. → población por la lupa (06/10/2026). HTML mínimo inventado con JS de página: la lupa rellena `#poblacion`
// (un solo resultado) o abre una lista de localidades (varios). `ctx.pulsar` aquí es un click directo de prueba.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { elegirLocalidad, resolverCodigoPostal } from '../src/adapters/allianz/comunidades.ts'
import type { ContextoPortal } from '../src/adaptador.ts'
import type { RiesgoComunidad } from '@central/module-tarificacion'

const UNA = `<body><input id="codigoPostal"><img style="display:inline-block;width:20px;height:20px" id="codigoPostalAjaxLocFinderImg" onclick="document.getElementById('poblacion').value='SEVILLA'"><input id="poblacion" readonly></body>`
const VARIAS = `<body><input id="codigoPostal"><img style="display:inline-block;width:20px;height:20px" id="codigoPostalAjaxLocFinderImg" onclick="var u=document.createElement('ul');u.innerHTML='<li>Alcalá de Guadaíra</li><li>Sevilla</li><li>Dos Hermanas</li>';u.onclick=function(e){document.getElementById('poblacion').value=e.target.textContent};document.body.appendChild(u)"><input id="poblacion" readonly></body>`
const NINGUNA = `<body><input id="codigoPostal"><img style="display:inline-block;width:20px;height:20px" id="codigoPostalAjaxLocFinderImg"><input id="poblacion" readonly></body>`

let browser: Browser
let page: Page
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
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
})
after(async () => browser?.close())

const ctx = { pulsar: async (l: { click(): Promise<void> }) => l.click(), log: () => undefined, pausa: async () => undefined } as unknown as ContextoPortal
const riesgo = (municipio: string | null) => ({ direccion: { codigoPostal: '41003', municipio } }) as unknown as RiesgoComunidad
const poblacion = () => page.locator('#poblacion').inputValue()

test('elegirLocalidad: sin acentos/mayúsculas, único; sin municipio o ambiguo → datos con opciones', () => {
  assert.equal(elegirLocalidad(['Alcalá de Guadaíra', 'SEVILLA'], 'sevilla'), 1)
  assert.equal(elegirLocalidad(['Alcalá de Guadaira'], 'ALCALÁ DE GUADAÍRA'), 0)
  assert.throws(() => elegirLocalidad(['Sevilla', 'Dos Hermanas'], null), /Opciones: Sevilla \| Dos Hermanas/)
  assert.throws(() => elegirLocalidad(['Sevilla', 'Dos Hermanas'], 'Utrera'), /no coincide/)
  assert.throws(() => elegirLocalidad(['Sevilla Este', 'Sevilla Norte'], 'Sevilla'), /no coincide/)
})

test('la lupa rellena #poblacion', async () => {
  await page.setContent(UNA)
  await resolverCodigoPostal(page.mainFrame(), page, riesgo(null), ctx, '41003')
  assert.equal(await page.locator('#codigoPostal').inputValue(), '41003')
  assert.equal(await poblacion(), 'SEVILLA')
})

test('lista de localidades: elige la del municipio', async () => {
  await page.setContent(VARIAS)
  await resolverCodigoPostal(page.mainFrame(), page, riesgo('Sevilla'), ctx, '41003')
  assert.equal(await poblacion(), 'Sevilla')
})

test('lista de localidades sin municipio → datos', async () => {
  await page.setContent(VARIAS)
  await assert.rejects(resolverCodigoPostal(page.mainFrame(), page, riesgo(null), ctx, '41003'), /datos|municipio/)
})

test('#poblacion sigue vacío → portal', { timeout: 30_000 }, async () => {
  await page.setContent(NINGUNA)
  await assert.rejects(resolverCodigoPostal(page.mainFrame(), page, riesgo('Sevilla'), ctx, '41003'), /Población no resuelta/)
})
