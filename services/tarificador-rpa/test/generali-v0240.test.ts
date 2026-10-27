// Generali Turismos v0.2.40 (27/10/2026, prueba real con 0.2.39, trabajo 86fd856c): la tabla «Modalidades de Seguro» vacía aparece SOLO tras «Siguiente×1» y «Recalcular» nunca se
// evaluó (el bloque de 0.2.39 corría antes). Ahora se evalúa también después de «Siguiente», el resultado va AL PRINCIPIO del mensaje y la puerta sobrevuela «Acciones». Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'
import { instalarGuardEmision, pulsarRecalcularGenerali } from '../src/guard.ts'

test('v0.2.40 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(4\d|[5-9]\d)$/)
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

const SEL = 'ra' + 'dio'
const GRID_VACIO = `<table id="g"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody id="cuerpo"></tbody><tfoot><tr><td colspan="5">&lt;&lt; anterior siguiente &gt;&gt;</td></tr></tfoot></table>`
const FILA = `<tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr>`

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body><h3>Garantías y Resultados</h3><div id="ra">${html}</div></body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}

test('v0.2.40 · la tabla vacía aparece tras «Siguiente»: se pulsa «Recalcular» UNA vez y se lee el precio', async () => {
  let siguientes = 0
  let recalculos = 0
  await conPagina('', async (page) => {
    const ctx = {
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: async () => {
        siguientes++
        await page.evaluate((g) => { document.getElementById('ra')!.insertAdjacentHTML('beforeend', g) }, GRID_VACIO)
        return { dialogo: null }
      },
      pulsarRecalcularGenerali: async () => {
        recalculos++
        await page.evaluate((f) => { document.getElementById('cuerpo')!.insertAdjacentHTML('beforeend', f) }, FILA)
        return { dialogo: null }
      },
    } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
  assert.equal(siguientes, 1)
  assert.equal(recalculos, 1)
})

test('v0.2.40 · el resultado de «Recalcular» va AL PRINCIPIO del mensaje (pulsado, fallo con motivo)', async () => {
  for (const [puerta, esperado] of [
    [async () => ({ dialogo: null }), /^generali\/auto: mapa incompleto: faltan el PRECIO[^]{0,260}Recalcular: Recalcular×1\./],
    [async () => { throw new Error('la acción «Recalcular» (0 controles visibles con ese texto; hace falta exactamente uno)') }, /^generali\/auto: mapa incompleto: faltan el PRECIO[^]{0,260}Recalcular: Recalcular no pulsado: la acción «Recalcular» \(0 controles visibles/],
    [undefined, /^generali\/auto: mapa incompleto: faltan el PRECIO[^]{0,260}Recalcular: Recalcular no intentado: la tabla de modalidades está vacía/],
  ] as const) {
    const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => ({ dialogo: null }), ...(puerta ? { pulsarRecalcularGenerali: puerta } : {}) } as unknown as ContextoPortal
    await conPagina(GRID_VACIO, async (page) => {
      await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => {
        if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
        assert.match(e.message, esperado, e.message.slice(0, 500))
        assert.ok(e.message.length <= 1_900, String(e.message.length))
        return true
      })
    })
  }
})

test('v0.2.40 · sin tabla a la vista el mensaje dice por qué NO se intentó «Recalcular»', async () => {
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => ({ dialogo: null }), pulsarRecalcularGenerali: async () => { throw new Error('no debe pulsarse') } } as unknown as ContextoPortal
  await conPagina('', async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 200 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /Recalcular: Recalcular no intentado: la tabla de modalidades no estaba a la vista\./.test(e.message))
  })
})

// ── Puerta del guard: «Recalcular» dentro del menú «Acciones» que solo se despliega al sobrevolar ──
const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'
const MENU = `<style>#sub{display:none}#men:hover #sub{display:block}</style><ul id="men"><li><a class="NOLINK titulo">Acciones</a><ul id="sub"><li id="rec" onclick="parent.__rec=(parent.__rec||0)+1;return false"><a class="btn">Recalcular</a></li><li id="gua" onclick="parent.__gua=(parent.__gua||0)+1;return false"><a class="btn">Guardar Cálculo</a></li></ul></li></ul>`

test('v0.2.40 · puerta: «Recalcular» oculto en el menú «Acciones» se alcanza sobrevolando, pulsa solo «Recalcular» y nunca «Guardar Cálculo»', async () => {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', async (r) => {
      const cuerpo = r.request().url().startsWith(PORTAL) ? `<iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>` : `<h3>Garantías y Resultados</h3>${MENU}`
      await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.goto(PORTAL)
    for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(B028) && f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
    await page.frames().find((f) => f.name() === 'mainFrame')!.locator('body').waitFor()
    await pulsarRecalcularGenerali(page, guard)
    const cuenta = (k: string) => page.evaluate((c) => (window as unknown as Record<string, number>)[c] ?? 0, k)
    assert.equal(await cuenta('__rec'), 1)
    assert.equal(await cuenta('__gua'), 0)
  } finally {
    await context.close()
  }
})
