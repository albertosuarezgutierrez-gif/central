// Generali Turismos v0.2.31 (26/10/2026, prueba real con 0.2.30): «Garantías y Capitales opcionales» trae una tabla «Modalidades de Seguro» con
// «Recibo Anual» y «Prima Anualidad» y el lector no veía ninguna cifra (¿inputs readonly? ¿sin «€»?). Ahora: (1) lector de esa tabla (texto de celda o value de
// inputs/selects; 1.234,56 / 1234,56 / 1234.56), precio = Recibo Anual de la modalidad marcada, o la más barata + aviso; (2) diagnóstico por fila. Solo LEE.
// Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { importeFlexibleEur, leerModalidadesGenerali, resumenModalidadesGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, volcarModalidadesGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.31 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[1-9]|[4-9]\d)$/)
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

const CAB = '<h3>Garantías y Capitales opcionales</h3>'
const THEAD = '<tr><th></th><th></th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th></th><th></th><th>Prima Anualidad</th><th></th></tr>'
const fila = (nombre: string, ra: string, pa: string, marcada = false, inputs = true) =>
  `<tr><td></td><td><input type="${'ra' + 'dio'}" name="mod"${marcada ? ' checked' : ''}></td><td>${nombre}</td>` +
  (inputs ? `<td><input type="text" readonly value="${ra}"></td><td></td><td></td><td><input type="text" disabled value="${pa}"></td>` : `<td>${ra}</td><td></td><td></td><td>${pa}</td>`) +
  '<td></td></tr>'
const tabla = (...filas: string[]) => `<table>${THEAD}${filas.join('')}</table><input type="button" id="btnComparar" value="Comparar"><input type="button" id="btnSig" value="Siguiente">`

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${CAB}${html}</body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.31 · pura: formatos 1.234,56 / 1234,56 / 1234.56 y lo que no es importe', () => {
  assert.equal(importeFlexibleEur('1.234,56'), 1234.56)
  assert.equal(importeFlexibleEur('1234,56 €'), 1234.56)
  assert.equal(importeFlexibleEur('1234.56'), 1234.56)
  assert.equal(importeFlexibleEur('456,78'), 456.78)
  assert.equal(importeFlexibleEur('456 €'), 456)
  assert.equal(importeFlexibleEur('456'), null)
  assert.equal(importeFlexibleEur('Todo riesgo'), null)
  assert.equal(importeFlexibleEur(''), null)
})

test('v0.2.31 · inputs readonly «456,78» y fila marcada → precio 456,78 (Recibo Anual, no Prima Anualidad)', async () => {
  const html = tabla(fila('Terceros Básico', '300,10', '350,00'), fila('Todo Riesgo Franquicia', '456,78', '999,99', true), fila('Todo Riesgo', '700,00', '800,00'))
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.ok(v?.encontrada)
  assert.equal(v!.filas.length, 3)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') {
    assert.equal(l.eur, 456.78)
    assert.match(l.linea, /Todo Riesgo Franquicia/)
    assert.equal(l.avisos, undefined)
  }
})

test('v0.2.31 · texto de celda sin «€» (1234.56) también vale; sin marcada y dos filas → la más barata + aviso «Otras modalidades»', async () => {
  const html = tabla(fila('Terceros Ampliado', '1234.56', '1300,00', false, false), fila('Todo Riesgo', '2.345,60', '2400,00', false, false))
  const v = await conPagina(html, volcarModalidadesGenerali)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') {
    assert.equal(l.eur, 1234.56)
    assert.ok(l.avisos?.some((a) => /^Otras modalidades: Todo Riesgo 2\.345,60 €$/.test(a)), JSON.stringify(l.avisos))
  }
})

test('v0.2.31 · todo vacío → sin precio y diagnóstico por fila (nombre, marcada, crudo con tope de 20 y «(texto)»), con botones y sin datos personales', async () => {
  const html = tabla(fila('Terceros Básico', '', ''), fila('Todo Riesgo', 'Consultar', '12345678901234567890123,45', true), fila('Pepe 12345678Z', '', ''))
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.equal(leerModalidadesGenerali(v!.filas).tipo, 'ninguno')
  const r = resumenModalidadesGenerali(v)
  assert.match(r, /«Terceros Básico» RA=∅ PA=∅/, r)
  assert.match(r, /«Todo Riesgo»\[marcada\] RA=\(texto\) PA=12345678901234567890 ;/, r)
  assert.doesNotMatch(r, /12345678Z/, r)
  assert.match(r, /Botones: .*#btnComparar v=Comparar/, r)
  assert.match(r, /#btnSig v=Siguiente/, r)
  assert.equal(resumenModalidadesGenerali(null), 'Modalidades: tabla no localizada')
  assert.ok(resumenModalidadesGenerali(v, 200).length <= 200)
})

test('v0.2.31 · dos marcadas con importes distintos → varios (no se elige a ciegas); importes fuera de horquilla o ignorados no cuentan', () => {
  const f = (modalidad: string, ra: string, marcada: boolean) => ({ modalidad, marcada, recibo: [ra], prima: [] })
  assert.equal(leerModalidadesGenerali([f('A', '400,00', true), f('B', '500,00', true)]).tipo, 'varios')
  assert.equal(leerModalidadesGenerali([f('A', '0,00', true), f('B', '5,00', false)]).tipo, 'ninguno')
  assert.equal(leerModalidadesGenerali([f('A', '400,00', true)], [400]).tipo, 'ninguno')
})

test('v0.2.31 · hastaPrecioGenerali: con la tabla lee el precio SIN pulsar Siguiente ni Comparar; sin cifras para con diagnóstico < 2000', async () => {
  const coche = (): FormularioAuto => {
    const v = validarFormularioAuto({
      ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
      conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
      tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
    })
    if (!v.ok) throw new Error(JSON.stringify(v))
    return v.formulario as FormularioAuto
  }
  let siguientes = 0
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => { siguientes++; return {} } } as unknown as ContextoPortal
  await conPagina(tabla(fila('Todo Riesgo', '456,78', '500,00', true)), async (page) => {
    const r = await hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 300 })
    assert.equal(r.ofertas[0]!.primaAnualEur, 456.78)
  })
  assert.equal(siguientes, 0)
  await conPagina(tabla(fila('Todo Riesgo', '', ''), fila('Terceros', '', '')), async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 300 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /Modalidades \(2f\): «Todo Riesgo» RA=∅ PA=∅ ; «Terceros» RA=∅ PA=∅/, e.message)
      assert.match(e.message, /#btnComparar v=Comparar/, e.message)
      assert.ok(e.message.length < 2_000, String(e.message.length))
      return true
    })
  })
})
