// Generali Turismos v0.2.39 (27/10/2026, prueba real con 0.2.38): «Garantías y Resultados» llega, pero la tabla «Modalidades de Seguro» trae SOLO la cabecera y el <tbody> VACÍO:
// el portal no ha calculado (la botonera inferior tiene «Acciones › Recalcular»). Ahora el adaptador pulsa «Recalcular» UNA vez por la puerta guardada del contexto y relee el precio.
// Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, modalidadesSinCalcularGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.39 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(39|[4-9]\d)$/)
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
// Forma real: <thead> con la cabecera, <tbody> VACÍO y <tfoot> con el paginador. «Recalcular» es una acción de la botonera.
const GRID_VACIO = `<table id="g"><thead><tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead><tbody id="cuerpo"></tbody><tfoot><tr><td colspan="5">&lt;&lt; anterior siguiente &gt;&gt;</td></tr></tfoot></table><ul><li onclick="return false">Recalcular</li></ul>`
const FILA = `<tr><td></td><td><input type="${SEL}" name="m" checked></td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr>`

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body><h3>Garantías y Resultados</h3>${html}</body></html>`)
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

test('v0.2.39 · puro: cabecera sin ninguna fila con importe = sin calcular; con fila, o sin tabla, no', () => {
  assert.equal(modalidadesSinCalcularGenerali({ encontrada: true, filas: [] }), true)
  assert.equal(modalidadesSinCalcularGenerali({ encontrada: true, filas: [{ recibo: [''], prima: [] }] }), true)
  assert.equal(modalidadesSinCalcularGenerali({ encontrada: true, filas: [{ recibo: ['456,78'], prima: [] }] }), false)
  assert.equal(modalidadesSinCalcularGenerali({ encontrada: false, filas: [] }), false)
  assert.equal(modalidadesSinCalcularGenerali(null), false)
})

test('v0.2.39 · tabla vacía: pulsa «Recalcular» UNA vez por la puerta, las filas aparecen y se lee el precio', async () => {
  let recalculos = 0
  await conPagina(GRID_VACIO, async (page) => {
    const ctx = {
      pulsarSubpestanaGenerali: async () => {},
      pulsarSiguienteGenerali: async () => { throw new Error('«Siguiente» no debe pulsarse') },
      pulsarRecalcularGenerali: async () => {
        recalculos++
        await page.evaluate((f) => { document.getElementById('cuerpo')!.insertAdjacentHTML('beforeend', f) }, FILA)
        return { dialogo: null }
      },
    } as unknown as ContextoPortal
    const r = await hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 400 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
  assert.equal(recalculos, 1)
})

test('v0.2.39 · sin puerta de «Recalcular» el atasco lo dice en «Avance» y no se pulsa nada más', async () => {
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => { throw new Error('«Siguiente» no debe pulsarse') } } as unknown as ContextoPortal
  await conPagina(GRID_VACIO, async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 300 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /Recalcular no intentado: la tabla de modalidades está vacía/, e.message)
      return true
    })
  })
})

test('v0.2.39 · «Recalcular» pulsado pero la tabla sigue vacía: se pulsa una sola vez y el error lo cuenta', async () => {
  let n = 0
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => ({}), pulsarRecalcularGenerali: async () => { n++; return { dialogo: null } } } as unknown as ContextoPortal
  await conPagina(GRID_VACIO, async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 300 }), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /Recalcular×1/.test(e.message))
  })
  assert.equal(n, 1)
})

test('v0.2.39 · con la tabla ya calculada NO se pulsa «Recalcular»', async () => {
  let n = 0
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarRecalcularGenerali: async () => { n++ } } as unknown as ContextoPortal
  const html = GRID_VACIO.replace('<tbody id="cuerpo"></tbody>', `<tbody id="cuerpo">${FILA}</tbody>`)
  await conPagina(html, async (page) => {
    const r = await hastaPrecioGenerali(page, formulario(), [], ctx, { esperaPrecioMs: 400 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
  assert.equal(n, 0)
})
