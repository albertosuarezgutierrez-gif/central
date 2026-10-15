// Localizador común (src/localizar.ts, 15/10/2026). DOM SINTÉTICO (sin red, sin datos personales): el caso real de Allianz
// Turismos (cabecera con el buscador «Buscar Aquí...» + formulario, dos «Matrícula») tiene que resolverse a UNO; el resto de
// reglas, un test cada una. Pistas aprendidas: se usan antes de la heurística y una mala se ignora y se informa.
//   npm test   (Chromium sin red)

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { validarPista } from '@central/module-tarificacion'
import { ambitoDePista, decidir, ErrorMapaIncompleto, esControlEditable, localizarControl, motivoDescarte, type DescripcionControl } from '../src/localizar.ts'
import type { ContextoFormador, EntradaConocimiento } from '../src/formador.ts'

let browser: Browser
let page: Page

async function lanzar(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

before(async () => {
  browser = await lanzar()
  page = await browser.newPage()
})
after(async () => {
  await browser?.close()
})

const html = (cuerpo: string) => page.setContent(`<!doctype html><html><body>${cuerpo}</body></html>`)
const idDe = async (l: { evaluate: (f: (e: Element) => string) => Promise<string> }) => l.evaluate((e) => e.id)

/** Cabecera de la intranet con el buscador global (ids dinámicos a propósito). */
const CABECERA = `<header><label for="mat-input-0">Matrícula</label><input id="mat-input-0" placeholder="Buscar Aquí..."></header>`

function formador(conocimiento: EntradaConocimiento[] = []): ContextoFormador & { eventos: [string, Record<string, unknown> | undefined][]; confirmados: unknown[] } {
  const eventos: [string, Record<string, unknown> | undefined][] = []
  const confirmados: unknown[] = []
  return {
    trabajoId: '00000000-0000-0000-0000-000000000000',
    compania: 'allianz',
    ramo: 'auto',
    apiUrl: 'http://asegura.invalid',
    secreto: 'x',
    activo: true,
    acompanado: false,
    conocimiento,
    resueltos: new Map(),
    redactar: (t) => t,
    log: (m, d) => eventos.push([m, d]),
    fetchImpl: (async (_u: string, init: RequestInit) => {
      confirmados.push(JSON.parse(String(init.body)))
      return new Response('{}', { status: 200 })
    }) as typeof fetch,
    eventos,
    confirmados,
  }
}

const pista = (clave: string, selector: string, origen = 'humano', marco: string | null = 'principal'): EntradaConocimiento => ({ clave, tipo: 'campo', selector, marco, origen, confirmaciones: 0, consolidado: true })
/** Sufijo de etiqueta que toda pista lleva (la etiqueta normalizada con la que se aprendió). */
const E = (e = 'matricula') => ` @etiqueta="${e}"`

// ─── El caso real ────────────────────────────────────────────────────────────

test('cabecera + formulario con dos «Matrícula»: se resuelve al del formulario', async () => {
  await html(`${CABECERA}<main><form><label for="mat-input-7">Matrícula *</label><input id="mat-input-7" name="matricula"></form></main>`)
  const r = await localizarControl(page, { paso: 'Datos del vehículo', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })
  assert.equal(r.origen, 'heuristica')
  assert.equal(await idDe(r.locator), 'mat-input-7')
  assert.equal(r.clave, '_l_datos_del_vehiculo__matricula')
})

test('sin contenedor principal: la cabecera y el buscador se descartan igual', async () => {
  await html(`${CABECERA}<div><label for="mat-input-7">Matrícula</label><input id="mat-input-7"></div>`)
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })
  assert.equal(await idDe(r.locator), 'mat-input-7')
})

// ─── Una regla, un test ──────────────────────────────────────────────────────

test('solo dentro del contenedor del adaptador; si no aparece, mapa incompleto (no cae a toda la página)', async () => {
  await html(`<div id="lateral"><label for="a">Matrícula</label><input id="a"></div><div id="formulario"><label for="b">Matrícula</label><input id="b"></div>`)
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', contenedor: '#formulario' })
  assert.equal(await idDe(r.locator), 'b')
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', contenedor: '#no-esta' }), (e) => e instanceof ErrorMapaIncompleto && /no aparece el contenedor/.test(e.message))
})

test('cabecera sin pinta de buscador: se descarta por ser cabecera (header y role=banner)', async () => {
  await html(`<header><label for="h">Matrícula</label><input id="h"></header><div role="banner"><label for="b">Matrícula</label><input id="b"></div>
    <div><label for="ok">Matrícula</label><input id="ok"></div>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })).locator), 'ok')
})

test('nav, menús y role=search se descartan aunque estén dentro del contenedor', async () => {
  await html(`<main><nav><label for="n">Matrícula</label><input id="n"></nav><div role="menu"><label for="m">Matrícula</label><input id="m"></div>
    <div role="search"><label for="s">Matrícula</label><input id="s"></div><label for="ok">Matrícula</label><input id="ok"></main>`)
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })
  assert.equal(await idDe(r.locator), 'ok')
})

test('un buscador por placeholder dentro del formulario se descarta salvo que el adaptador lo admita', async () => {
  await html(`<main><label for="b">Población</label><input id="b" placeholder="Buscar población"></main>`)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Población' }, { adaptador: 'prueba' }), ErrorMapaIncompleto)
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Población' }, { adaptador: 'prueba', admitirBuscador: true })
  assert.equal(await idDe(r.locator), 'b')
})

test('controles ocultos se descartan', async () => {
  await html(`<main><label for="o">Matrícula</label><input id="o" style="visibility:hidden"><label for="ok">Matrícula</label><input id="ok"></main>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })).locator), 'ok')
})

test('controles deshabilitados se descartan (disabled, aria-disabled, fieldset)', async () => {
  await html(`<main><label for="d">Matrícula</label><input id="d" disabled><label for="a">Matrícula</label><input id="a" aria-disabled="true">
    <fieldset disabled><label for="f">Matrícula</label><input id="f"></fieldset><label for="ok">Matrícula</label><input id="ok"></main>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })).locator), 'ok')
})

test('etiqueta que solo CONTIENE la buscada no cuenta («Matrícula del remolque»)', async () => {
  await html(`<main><label for="r">Matrícula del remolque</label><input id="r"><label for="ok">Matrícula:</label><input id="ok"></main>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })).locator), 'ok')
})

test('un campo bancario nunca se localiza', async () => {
  await html(`<main><label for="i">IBAN</label><input id="i"></main>`)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'IBAN' }, { adaptador: 'prueba' }), (e) => e instanceof ErrorMapaIncompleto && /bancario_o_pago/.test(e.message))
})

test('por rol + nombre exacto', async () => {
  await html(`${CABECERA}<main><input id="x" aria-label="Código postal"></main>`)
  const r = await localizarControl(page, { paso: 'p', rol: 'textbox', nombre: 'Código postal' }, { adaptador: 'prueba' })
  assert.equal(await idDe(r.locator), 'x')
})

test('0 candidatos: mapa incompleto con los editables del formulario como candidatos (sin la cabecera)', async () => {
  await html(`${CABECERA}<main><label for="cp">Código postal</label><input id="cp" name="codigoPostal"><input type="checkbox" name="garaje"></main>`)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', pideInventarioDom: true }), (e) => {
    assert.ok(e instanceof ErrorMapaIncompleto)
    assert.equal(e.tipo, 'portal')
    assert.equal(e.pideInventarioDom, true)
    assert.match(e.message, /^prueba: mapa incompleto: faltan el control «Matrícula»/)
    assert.deepEqual(e.candidatos.map((c) => c.name), ['codigoPostal'])
    return true
  })
})

test('≥2 candidatos: mapa incompleto con todos, cada uno con su pista estable (nunca el id dinámico)', async () => {
  await html(`<main><label for="mat-input-3">Matrícula</label><input id="mat-input-3" name="matricula">
    <label for="mat-input-4">Matrícula</label><input id="mat-input-4" formcontrolname="matriculaRemolque"></main>`)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' }), (e) => {
    assert.ok(e instanceof ErrorMapaIncompleto)
    assert.match(e.message, /2 candidatos válidos/)
    assert.deepEqual(e.candidatos.map((c) => c.pista), [`main >> input[name="matricula"]${E()}`, `main >> input[formcontrolname="matriculaRemolque"]${E()}`])
    return true
  })
})

test('dos candidatos sin atributo estable que los distinga: ninguno lleva pista (no se podría aprender cuál)', async () => {
  await html(`<main><label for="mat-input-1">Matrícula</label><input id="mat-input-1"><label for="mat-input-2">Matrícula</label><input id="mat-input-2"></main>`)
  const f = formador()
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f }), (e) => {
    assert.ok(e instanceof ErrorMapaIncompleto)
    assert.deepEqual(e.candidatos.map((c) => c.pista), [null, null])
    // Sin atasco propio → pide inventario: la red común (atascoDeRespaldoHueco) deja el atasco de respaldo, nunca muere mudo.
    assert.equal(e.pideInventarioDom, true)
    return true
  })
  assert.equal(f.atasco ?? null, null)
  assert.ok(f.eventos.some(([m]) => m === 'localizar_atasco_sin_pistas'))
})

// ─── Pistas aprendidas ───────────────────────────────────────────────────────

const AMBIGUO = `${CABECERA}<main><label for="mat-input-3">Matrícula</label><input id="mat-input-3" name="matricula">
  <label for="mat-input-4">Matrícula</label><input id="mat-input-4" name="matriculaRemolque"></main>`

test('con el formador: el ambiguo deja ATASCO con un candidato por control y su pista como selector', async () => {
  await html(AMBIGUO)
  const f = formador()
  await assert.rejects(localizarControl(page, { paso: 'Datos del vehículo', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f }), ErrorMapaIncompleto)
  assert.ok(f.atasco)
  assert.equal(f.atasco!.clave, '_l_datos_del_vehiculo__matricula')
  assert.equal(f.atasco!.tipo, 'campo')
  assert.deepEqual(f.atasco!.candidatos.map((c) => c.selector), [`main >> input[name="matricula"]${E()}`, `main >> input[name="matriculaRemolque"]${E()}`])
  for (const c of f.atasco!.candidatos) assert.ok(validarPista(c.selector).ok)
})

test('la pista aprendida se usa ANTES de la heurística y se confirma al usarla', async () => {
  await html(AMBIGUO)
  const f = formador([pista('_l_datos_del_vehiculo__matricula', `main >> input[name="matriculaRemolque"]${E()}`)])
  const r = await localizarControl(page, { paso: 'Datos del vehículo', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(r.origen, 'pista')
  assert.equal(await idDe(r.locator), 'mat-input-4')
  await r.confirmar()
  assert.equal((f.confirmados[0] as { origen: string }).origen, 'humano')
})

test('pista que no encuentra nada o encuentra más de uno: se ignora, se informa y se sigue con la heurística', async () => {
  await html(`<main><label for="a">Matrícula</label><input id="a" name="matricula"><input name="dup" aria-label="x"><input name="dup" aria-label="x"></main>`)
  const f = formador([pista('_l_p__matricula', `main >> input[name="noexiste"]${E()}`), pista('_l_p__matricula', `main >> input[name="dup"]${E('x')}`)])
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(r.origen, 'heuristica')
  assert.equal(await idDe(r.locator), 'a')
  const ignoradas = f.eventos.filter(([m]) => m === 'localizar_pista_ignorada').map(([, d]) => d?.motivo)
  assert.deepEqual(ignoradas, ['no encuentra ningún control válido', 'encuentra 2 controles válidos'])
  assert.equal([...f.usosAprendido!.values()].filter((u) => u.rechazado).length, 2)
})

test('pista a un campo bancario: se ignora al usarla (por forma y por la etiqueta viva del control)', async () => {
  await html(`<main><label for="c">IBAN</label><input id="c" name="campoUno"><label for="m">Matrícula</label><input id="m"></main>`)
  const f = formador([pista('_l_p__matricula', `main >> input[name="iban"]${E()}`), pista('_l_p__matricula', `main >> input[name="campoUno"]${E('iban')}`), pista('_l_p__matricula', `main >> input[name="campoUno"]${E()}`)])
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(await idDe(r.locator), 'm')
  assert.equal(f.eventos.filter(([m]) => m === 'localizar_pista_ignorada').length, 3)
})

test('pista con forma no admitida (XPath, id dinámico): se ignora', async () => {
  await html(`<main><label for="mat-input-9">Matrícula</label><input id="mat-input-9"></main>`)
  const f = formador([pista('_l_p__matricula', `xpath=/html/body/main/input[1]${E()}`), pista('_l_p__matricula', `input[id="mat-input-9"]${E()}`)])
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(r.origen, 'heuristica')
  assert.equal(f.eventos.filter(([m]) => m === 'localizar_pista_ignorada').length, 2)
})

// ─── Reglas puras ────────────────────────────────────────────────────────────

const D: DescripcionControl = { tag: 'input', type: null, id: null, name: null, formcontrolname: null, testid: null, rol: 'textbox', etiqueta: 'Matrícula', placeholder: null, ariaLabel: null, title: null, seccion: null, oculto: false, deshabilitado: false, zonaExcluida: null }

test('decidir: 1 → único, 0 → ninguno, 2 → varios', () => {
  assert.deepEqual(decidir([D]).decision, { tipo: 'unico', indice: 0 })
  assert.deepEqual(decidir([{ ...D, oculto: true }]).decision, { tipo: 'ninguno' })
  assert.deepEqual(decidir([D, D]).decision, { tipo: 'varios', indices: [0, 1] })
})

test('motivoDescarte: orden fijo de motivos', () => {
  assert.equal(motivoDescarte({ ...D, zonaExcluida: 'header' }), 'cabecera_o_menu')
  assert.equal(motivoDescarte({ ...D, placeholder: 'Buscar Aquí...' }), 'buscador')
  assert.equal(motivoDescarte({ ...D, name: 'numCCC' }), 'bancario_o_pago')
  assert.equal(motivoDescarte({ ...D, etiqueta: 'Número de tarjeta' }), 'bancario_o_pago')
  assert.equal(motivoDescarte(D, { etiqueta: 'Matrícula *' }), null)
})

test('motivoDescarte: descripción de emisión y sección bancaria descartan el control', () => {
  assert.equal(motivoDescarte({ ...D, ariaLabel: 'Contratar ahora' }), 'emision')
  assert.equal(motivoDescarte({ ...D, title: 'Emitir poliza' }), 'emision')
  assert.equal(motivoDescarte({ ...D, seccion: 'Datos bancarios' }), 'bancario_o_pago')
  assert.equal(motivoDescarte({ ...D, seccion: 'Datos del vehículo' }), null)
})

// ─── Revisión de seguridad (15/10/2026) ──────────────────────────────────────

test('con atasco propio, pideInventarioDom sigue siendo el del adaptador; sin formador, se pide (respaldo)', async () => {
  await html(AMBIGUO)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: formador() }), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom === false)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' }), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom === true)
})

test('«Primer Recibo» y «Forma de pago» se localizan (no son datos bancarios)', async () => {
  await html(`<main><label for="r">Primer Recibo</label><input id="r" name="primerRecibo"><label for="f">Forma de pago</label><select id="f" name="formaPago"><option>Anual</option></select></main>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Primer Recibo' }, { adaptador: 'prueba' })).locator), 'r')
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Forma de pago' }, { adaptador: 'prueba' })).locator), 'f')
})

test('heurística: un control NO editable con la etiqueta buscada se descarta (input de botón)', async () => {
  await html(`<main><label for="b">Matrícula</label><input id="b" type="button" value="Ir"><label for="ok">Matrícula</label><input id="ok"></main>`)
  assert.equal(await idDe((await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' })).locator), 'ok')
})

test('pista a un control NO editable: se ignora', async () => {
  await html(`<main><label for="b">Matrícula</label><input id="b" type="submit" name="matricula" value="Ir"><label for="ok">Matrícula</label><input id="ok"></main>`)
  const f = formador([pista('_l_p__matricula', `main >> input[name="matricula"]${E()}`)])
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(r.origen, 'heuristica')
  assert.equal(await idDe(r.locator), 'ok')
})

test('pista aprendida en OTRO marco (o sin marco): no se usa y cuenta como fallo', async () => {
  await html(AMBIGUO)
  const f = formador([pista('_l_p__matricula', `main >> input[name="matriculaRemolque"]${E()}`, 'humano', 'iframe:otro'), pista('_l_p__matricula', `main >> input[name="matriculaRemolque"]${E()}`, 'humano', null)])
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f }), ErrorMapaIncompleto)
  assert.deepEqual(f.eventos.filter(([m]) => m === 'localizar_pista_ignorada').map(([, d]) => d?.motivo), ['aprendida en otro marco', 'aprendida en otro marco'])
  assert.equal([...f.usosAprendido!.values()].filter((u) => u.rechazado).length, 2)
})

test('pista cuya etiqueta viva no es EXACTAMENTE la aprendida (ni subcadena, ni ilegible): no se usa', async () => {
  await html(`<main><label for="r">Matrícula del remolque</label><input id="r" name="matricula"><input id="s" name="sinEtiqueta"><label for="ok">Matrícula</label><input id="ok"></main>`)
  const f = formador([pista('_l_p__matricula', `main >> input[name="matricula"]${E()}`), pista('_l_p__matricula', `main >> input[name="sinEtiqueta"]${E()}`)])
  const r = await localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba', formador: f })
  assert.equal(r.origen, 'heuristica')
  assert.equal(await idDe(r.locator), 'ok')
  assert.equal(f.eventos.filter(([m]) => m === 'localizar_pista_ignorada').length, 2)
})

test('la etiqueta por aria-labelledby nunca lleva el VALOR del control (ni el propio control ni sus descendientes)', async () => {
  await html(`<main><span id="lbl">Tomador</span><div id="cb" role="combobox" tabindex="0" aria-labelledby="lbl cb"><span>Valor Ficticio</span></div></main>`)
  await assert.rejects(localizarControl(page, { paso: 'p', etiqueta: 'Matrícula' }, { adaptador: 'prueba' }), (e) => {
    assert.ok(e instanceof ErrorMapaIncompleto)
    assert.deepEqual(e.candidatos.map((c) => c.etiqueta), ['Tomador'])
    assert.ok(!/ficticio/i.test(JSON.stringify(e.candidatos)))
    return true
  })
})

test('motivoDescarte: etiqueta ilegible NO se salta el descarte; etiqueta de pista exacta', () => {
  assert.equal(motivoDescarte({ ...D, etiqueta: null }, { etiqueta: 'Matrícula' }), 'etiqueta_distinta')
  assert.equal(motivoDescarte({ ...D, etiqueta: 'Matrícula *' }, { etiquetaPista: 'matricula' }), null)
  assert.equal(motivoDescarte({ ...D, etiqueta: 'Matrícula del remolque' }, { etiquetaPista: 'matricula' }), 'etiqueta_distinta')
  assert.equal(motivoDescarte({ ...D, etiqueta: null }, { etiquetaPista: 'matricula' }), 'etiqueta_distinta')
  assert.equal(motivoDescarte({ ...D, name: 'cardNumber' }), 'bancario_o_pago')
  assert.equal(motivoDescarte({ ...D, etiqueta: 'Primer Recibo' }), null)
})

test('esControlEditable: input editable, select, textarea, contenteditable o rol de campo', () => {
  assert.equal(esControlEditable({ tag: 'input', type: null, rol: null }), true)
  for (const type of ['hidden', 'submit', 'button', 'checkbox', 'image']) assert.equal(esControlEditable({ tag: 'input', type, rol: null }), false, type)
  assert.equal(esControlEditable({ tag: 'select', type: null, rol: null }), true)
  assert.equal(esControlEditable({ tag: 'div', type: null, rol: null }), false)
  assert.equal(esControlEditable({ tag: 'div', type: null, rol: null, editableContenido: true }), true)
  assert.equal(esControlEditable({ tag: 'div', type: null, rol: 'combobox' }), true)
  assert.equal(esControlEditable({ tag: 'a', type: null, rol: 'link' }), false)
})

test('ambitoDePista: el contenedor sin :not() y solo si es CSS cerrado', () => {
  assert.equal(ambitoDePista('main'), 'main')
  assert.equal(ambitoDePista('[role=main]'), '[role=main]')
  assert.equal(ambitoDePista('#appArea:not(iframe):not(frame)'), '#appArea')
  assert.equal(ambitoDePista('div:has(form)'), null)
  assert.equal(ambitoDePista(null), null)
})
