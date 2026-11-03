// Generali auto v0.2.74 (trabajo b1c5363f con 0.2.73): «Recalcular» sigue en «No se puede calcular con datos incompletos» sin ningún campo vacío en «Datos de
// Valoración» ni en «Garantías y Resultados». Volcado fallo-b1c5363f: en «Bonus-Malus» el obligatorio «Historial siniestral obtenido *» es un BOTÓN
// (`input[type=button][name="reg1063E.bonusMalus.zhsdet"]`, «Historial Siniestral», `onclick="link('histsin');"`) que ningún lector contaba. Ahora se pulsa
// por su puerta del guard, se completa la pantalla del historial (regla del riesgo o neutro, supuesto) y se sale por la puerta de salida (lista blanca exacta).
// Además: el resumen del Historial lista TODOS sus obligatorios (antes cortaba a 220 caracteres) y la vuelta por la barra espera/relee antes de gastar «Siguiente».
// Fixtures SINTÉTICAS con la forma del volcado redactado (ids y names Genernet). Sin valores reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { completarHistorialObtenidoGenerali, completarPasoIncompletoGenerali, ErrorMapaIncompletoGenerali, leerObligatoriosPasoGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { obligatorioHistorialObtenidoGenerali, resumenObligatoriosHistorialGenerali, type ObligatorioPasoGenerali } from '../src/adapters/generali/reglas.ts'
import { onclickHistorialObtenidoGenerali, salidaHistorialObtenidoGeneraliPermitida, urlEmiAutosGenerali, SALIDAS_HISTORIAL_OBTENIDO_GENERALI } from '../src/guard.ts'
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

const FICHA = { aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0 }
const req = '<div class="trueInline required"><span> * </span></div>'
const bloque = (name: string, rotulo: string, control: string) =>
  `<div class="falseInline simple" id="${name.replace(/\./g, '_')}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2">${control}</div></div>`
const opcionesSiNo = (name: string) => ['No', 'Sí'].map((t) => `<input type="radio" name="${name}" value="x"> <span> ${t} </span>`).join('')

/** «Garantías y Resultados» con la forma del volcado: `#reg1063EIdentification`, «Envío e-mail» y «Bonus-Malus» › «Historial siniestral obtenido» (botón). */
const GARANTIAS = `<div id="reg1063EIdentification">
  <h2>Garantías y Capitales opcionales</h2>
  <div id="reg1063E_opcEnvioIdentification"><h2>Envío Documentación Precontractual</h2></div>
  <h2>Bonus-Malus</h2>
  ${bloque('reg1063E.bonusMalus.zhsdet', 'Historial siniestral obtenido', `<input type="button" name="reg1063E.bonusMalus.zhsdet" value="Historial Siniestral" onclick="link('histsin');" id="reg1063E_bonusMalus_zhsdet">`)}
</div>`

/** Pantalla del historial SINTÉTICA (la real aún no se ha visto): un grupo «No/Sí» obligatorio, un número de siniestros obligatorio y la salida «Volver». */
const HISTSIN = `<div id="reg1070AIdentification">
  <h2>Historial Siniestral</h2>
  ${bloque('reg1070A.hs.zpend', '¿Tiene siniestros pendientes?', opcionesSiNo('reg1070A.hs.zpend'))}
  ${bloque('reg1070A.hs.nsinie', 'Nº siniestros con culpa en los últimos 5 años', '<input type="text" name="reg1070A.hs.nsinie" value="">')}
</div>
<ul id="Menu2"><li onclick="link('volver');return false;"><a class="btn">Volver</a></li></ul>`

const pagina = (conSalida = true) => `
<script>
  const G = ${JSON.stringify(GARANTIAS)};
  const H = ${JSON.stringify(conSalida ? HISTSIN : HISTSIN.replace(/<ul id="Menu2">[\s\S]*<\/ul>/, ''))};
  function link(ev) { const c = document.getElementById('cont'); setTimeout(() => { c.innerHTML = ev === 'histsin' ? H : G; }, 150); }
</script>
<div id="cont">${GARANTIAS}</div>`

type Registro = { pulsados: string[]; obtener: number; salir: number }
const ctxCon = (r: Registro, page: () => Page, conPuertas = true) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => {
    r.pulsados.push(await l.evaluate((el) => (el.getAttribute('name') || el.textContent || '').replace(/\s+/g, ' ').trim()))
    await l.click()
  },
  ...(conPuertas ? {
    // Como las puertas del guard: la entrada pulsa EL botón zhsdet; la salida, el control «Volver» de la pantalla del historial.
    obtenerHistorialSiniestralGenerali: async () => { r.obtener++; await page().locator('input[name="reg1063E.bonusMalus.zhsdet"]').click(); return { dialogo: null } },
    salirHistorialSiniestralGenerali: async () => {
      r.salir++
      const v = page().getByText(/^\s*Volver\s*$/)
      if ((await v.count()) !== 1) throw new Error('la salida de la pantalla del historial (ningún control con rótulo de la lista blanca)')
      await v.click()
      return { dialogo: null, texto: 'Volver' }
    },
  } : {}),
}) as unknown as ContextoPortal

test('v0.2.74 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.74'))

test('puras: el obligatorio de BOTÓN «Historial siniestral obtenido» se localiza (por name exacto) y solo a la vista', () => {
  const o = (x: Partial<ObligatorioPasoGenerali>): ObligatorioPasoGenerali => ({ etiqueta: '', name: '', tipo: 'boton', opciones: [], vacio: false, visible: true, editable: false, ...x })
  assert.equal(obligatorioHistorialObtenidoGenerali([o({ etiqueta: 'Vehículo', name: 'reg1063A.vehiculo' }), o({ etiqueta: 'Historial siniestral obtenido', name: 'reg1063E.bonusMalus.zhsdet' })])?.name, 'reg1063E.bonusMalus.zhsdet')
  assert.equal(obligatorioHistorialObtenidoGenerali([o({ etiqueta: 'Historial siniestral obtenido', name: 'reg1063E.bonusMalus.zhsdet', visible: false })]), null, 'oculto: no')
  assert.equal(obligatorioHistorialObtenidoGenerali([o({ etiqueta: 'Historial siniestral obtenido', name: 'x', tipo: 'texto', vacio: true, editable: true })]), null, 'no es de botón: no')
})

test('puras: el resumen del Historial Siniestral lista los 18 obligatorios del volcado con su estado, sin cortar (antes: «Nº años asegurado durante …»)', () => {
  // Los 18 campos `reg1063A.histSiniestral.*` del volcado 9aa12762 (7 a la vista, 11 ocultos), solo rótulos.
  const vis: [string, string, boolean][] = [['zpolau', '¿Tiene póliza anterior?', false], ['ynifce', 'El tomador de la póliza coincide con', true], ['zascia', 'La póliza anterior está asegurada en nuestra compañía', false],
    ['yhsori', 'Origen del historial siniestral', false], ['yciace', 'Compañía de procedencia', false], ['hsclan', 'Nº años asegurado durante los últimos 5 años', false], ['hsclsi', 'Nº siniestros de RC con culpa propia en dichos años', false]]
  const ocultos = ['ypoace', 'clanss', 'ffcerd', 'ffcerh', 'sinobl', 'sinili', 'sindp', 'zcobon', 'porbon', 'ffefep', 'ffvtop']
  const obl: ObligatorioPasoGenerali[] = [
    ...vis.map(([c, e, vacio]) => ({ etiqueta: e, name: `reg1063A.histSiniestral.${c}`, tipo: 'texto' as const, opciones: [], vacio, visible: true, editable: c !== 'ynifce' })),
    ...ocultos.map((c) => ({ etiqueta: c, name: `reg1063A.histSiniestral.${c}`, tipo: 'texto' as const, opciones: [], vacio: true, visible: false, editable: true })),
    { etiqueta: 'Otro', name: 'reg1063A.general.zotro', tipo: 'texto', opciones: [], vacio: true, visible: true, editable: true },
  ]
  const r = resumenObligatoriosHistorialGenerali(obl)
  assert.ok(r.length <= 700, `cabe en el presupuesto (${r.length})`)
  assert.ok(!r.endsWith('…'), 'no se corta')
  assert.match(r, /^18 obligatorios \(7 a la vista\)/)
  assert.match(r, /Nº años asegurado durante l[^=]*=puesto/, 'el campo que antes se cortaba sale entero con su estado')
  assert.match(r, /El tomador de la póliza coi[^=]*=VACÍO,bloqueado/, 'el desplegable bloqueado y vacío se ve')
  for (const c of ocultos) assert.match(r, new RegExp(`\\b${c}=vacío`), `oculto ${c}`)
  assert.ok(!/zotro|Otro=/.test(r), 'solo la sección del historial')
})

test('guard (puras): salida de la pantalla del historial SOLO por rótulo exacto de la lista blanca; entrada SOLO con el onclick exacto', () => {
  assert.deepEqual([...SALIDAS_HISTORIAL_OBTENIDO_GENERALI], ['Aceptar', 'Volver'])
  for (const t of ['Aceptar', 'Volver', ' ACEPTAR ', 'volver']) assert.equal(salidaHistorialObtenidoGeneraliPermitida(t), true, t)
  for (const t of ['Aceptar y emitir', 'Emitir', 'Guardar', 'Aceptar póliza', 'Contratar', 'Volver a pagar', '', 'Siguiente', 'Recalcular']) assert.equal(salidaHistorialObtenidoGeneraliPermitida(t), false, t)
  assert.equal(onclickHistorialObtenidoGenerali("link('histsin');"), true)
  assert.equal(onclickHistorialObtenidoGenerali(" link( 'histsin' ) "), true)
  for (const x of ["link('emitir');", "link('histsin');emitir();", "link('histsin2');", null, '']) assert.equal(onclickHistorialObtenidoGenerali(x), false, String(x))
  assert.equal(urlEmiAutosGenerali('https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'), true)
  assert.equal(urlEmiAutosGenerali('https://www.generali.es/gnt3k/emi_genAutosFormWeb/x.do'), true)
  assert.equal(urlEmiAutosGenerali('https://evil.example/emi_genAutosFormWeb/x.do'), false)
  assert.equal(urlEmiAutosGenerali('https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'), false)
})

test('volcado b1c5363f: el lector DOM vivo ve «Historial siniestral obtenido» como obligatorio de botón (los demás lectores no lo contaban)', async () => {
  await conPagina(pagina(), async (p) => {
    const o = obligatorioHistorialObtenidoGenerali(await leerObligatoriosPasoGenerali(p.mainFrame()))
    assert.equal(o?.name, 'reg1063E.bonusMalus.zhsdet')
    assert.equal(o?.tipo, 'boton')
  })
})

test('pulsa «Historial Siniestral» por su puerta, completa la pantalla (regla del riesgo + neutro «No», supuesto), sale por «Volver» y vuelve a «Garantías y Resultados»', async () => {
  const r: Registro = { pulsados: [], obtener: 0, salir: 0 }
  let pg: Page | null = null
  await conPagina(pagina(), async (p) => {
    pg = p
    const res = await completarHistorialObtenidoGenerali(p, ctxCon(r, () => pg!), FICHA, ['siniestrosUltimos5Anios'], 3_000)
    assert.ok(res)
    assert.equal(r.obtener, 1)
    assert.equal(r.salir, 1)
    assert.match(res.nota, /Historial siniestral obtenido: «Historial Siniestral» pulsado; pantalla: encabezados: Historial Siniestral/)
    assert.match(res.nota, /2 obligatorio\(s\) rellenado\(s\); salida por «Volver»; de vuelta en «Garantías y Resultados»/)
    assert.ok(res.avisos.some((a) => /Nº siniestros con culpa[^:]*: 0 \(siniestralidad más favorable; supuesto\)/.test(a)), res.avisos.join(' | '))
    assert.ok(res.avisos.some((a) => /Supuesto: «Historial Siniestral» · ¿Tiene siniestros pendientes\? = No/.test(a)), res.avisos.join(' | '))
    assert.equal(await p.locator('input[name="reg1063E.bonusMalus.zhsdet"]').count(), 1, 'de vuelta en la pestaña')
  })
})

test('sin salida de la lista blanca en la pantalla del historial: atasco con el inventario de esa pantalla (sin valores) y sin «Recalcular»', async () => {
  const r: Registro = { pulsados: [], obtener: 0, salir: 0 }
  let pg: Page | null = null
  await conPagina(pagina(false), async (p) => {
    pg = p
    await assert.rejects(completarHistorialObtenidoGenerali(p, ctxCon(r, () => pg!), FICHA, [], 2_000), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /la salida de la pantalla «Historial Siniestral» \(la salida de la pantalla del historial \(ningún control/)
      assert.match(e.message, /Pantalla: encabezados: Historial Siniestral; botones: [^;]*; obligatorios: ¿Tiene siniestros pendientes\?\[opciones\]=puesto/)
      return true
    })
  })
})

test('sin el bloque «Historial siniestral obtenido» no se toca nada (null); sin la puerta en el contexto, nota y no se pulsa', async () => {
  const r: Registro = { pulsados: [], obtener: 0, salir: 0 }
  let pg: Page | null = null
  await conPagina('<div id="reg1063EIdentification"><h2>Garantías y Capitales opcionales</h2></div>', async (p) => {
    pg = p
    assert.equal(await completarHistorialObtenidoGenerali(p, ctxCon(r, () => pg!), FICHA, [], 500), null)
  })
  await conPagina(pagina(), async (p) => {
    pg = p
    const res = await completarHistorialObtenidoGenerali(p, ctxCon(r, () => pg!, false), FICHA, [], 500)
    assert.match(res!.nota, /no trae su puerta guardada \(no se pulsa\)/)
    assert.equal(r.obtener + r.pulsados.length, 0)
  })
})

test('vuelta por la barra TARDÍA (el portal tardó ~10 s): se relee la barra antes de gastar «Siguiente» y la vuelta cuenta como barra', async () => {
  let siguiente = 0
  const pulsados: string[] = []
  const html = `
<script>
  function pedirPaso(n, demora) {
    setTimeout(() => {
      document.querySelectorAll('#secundario > li').forEach((li, i) => { li.className = i === n ? 'current' : '' });
      document.getElementById('paso0').style.display = n === 0 ? 'block' : 'none';
      document.getElementById('paso1').style.display = n === 1 ? 'block' : 'none';
    }, demora);
  }
</script>
<ul id="secundario">
  <li onclick="pedirPaso(0, 0);return false;"><a><span>Datos de Valoración</span></a></li>
  <li onclick="pedirPaso(1, 1500);return false;" class="current"><a><span>Garantías y Resultados</span></a></li>
</ul>
<div id="areaErrores" style="display:block;"><ol><li class="lowError"><a value="Empty_Property">El paso anterior no tiene los datos completos</a></li></ol></div>
<div id="paso0" style="display:none;">${bloque('reg1063A.general.zprueba', '¿Pregunta obligatoria?', opcionesSiNo('reg1063A.general.zprueba'))}</div>
<div id="paso1" style="display:block;"><h2>Garantías y Capitales opcionales</h2></div>`
  await conPagina(html, async (p) => {
    const ctx = {
      pausaAccion: async () => undefined,
      pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => {
        pulsados.push(await l.evaluate((el) => (el.getAttribute('name') || el.textContent || '').replace(/\s+/g, ' ').trim()))
        await l.click()
      },
      pulsarSiguienteGenerali: async () => { siguiente++; return { dialogo: null } },
    } as unknown as ContextoPortal
    const res = await completarPasoIncompletoGenerali(p, ctx, FICHA, [], { esperaMs: 1_000 })
    assert.match(res!.nota, /vuelta por barra de pasos \(tardía\)/)
    assert.equal(siguiente, 0, '«Siguiente» no se gasta si la barra ya devolvió (tarde)')
  })
})
