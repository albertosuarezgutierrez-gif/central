// Generali auto v0.2.73 (trabajo 44b44608 con 0.2.72): fue a «Datos de Valoración», no vio obligatorios vacíos, volvió por «Siguiente» y el único «Recalcular» siguió en
// «datos incompletos». Volcados 9aa12762/44b44608 (redactados): la barra `#secundario` solo tiene «Datos de Valoración» y «Garantías y Resultados» y NO marca pasos;
// el aviso «Paso con datos incompletos» es un enlace `setError(this)` (`value="Empty_Property"`) que lleva «al campo que lo genera»; la cabecera de los desplegables
// de Genernet lleva `value=""`. Ahora: obligatorios con el DOM vivo, se pulsa el aviso y se lee el campo enfocado; sin campo que rellenar → atasco con diagnóstico.
// Fixtures SINTÉTICAS con esa forma, sin valores reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { completarPasoIncompletoGenerali, ErrorMapaIncompletoGenerali, leerObligatoriosPasoGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { candidatosNeutroPasoGenerali, diagnosticoPasoIncompletoGenerali, errorPasoSinCampoGenerali } from '../src/adapters/generali/reglas.ts'
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

type Registro = { pulsados: string[] }
const ctxCon = (r: Registro) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => {
    r.pulsados.push(await l.evaluate((el) => (el.getAttribute('name') || el.textContent || '').replace(/\s+/g, ' ').trim()))
    await l.click()
  },
}) as unknown as ContextoPortal

const FICHA = { aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0 }
const req = '<div class="trueInline  required "><span> * </span></div>'
const bloque = (name: string, rotulo: string, ctrl: string, oculto = false) =>
  `<div class="falseInline  simple container500 " id="${name.replace(/\./g, '_')}Identification"${oculto ? ' style="display:none"' : ''}><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2">${ctrl}</div></div>`
/** Desplegable con la cabecera de Genernet (`value=""`, texto que NO empieza por «Seleccione»). */
const desplegableCabecera = (name: string, rotulo: string, reales: string[]) =>
  bloque(name, rotulo, `<select name="${name}"><option value="">-- Elija --</option>${reales.map((o, i) => `<option value="v${i}">${o}</option>`).join('')}</select>`)

/**
 * «Garantías y Resultados» actual; en «Datos de Valoración» el portal pinta `li.information` «Paso con datos incompletos» como enlace `setError(this)` que
 * enfoca el campo que lo genera (`data-campo` del fixture); en «Garantías y Resultados», «No se puede calcular con datos incompletos».
 */
const pantalla = (valoracion: string, campoSenalado: string) => `
<script>
  function setError(a) { const n = document.querySelector('[name="${campoSenalado}"]'); if (n) n.focus(); }
  function pedirPaso(a, b) {
    const n = Number(b);
    document.querySelectorAll('#secundario > li').forEach((li, i) => { li.className = i === n ? 'current' : '' });
    document.getElementById('paso0').style.display = n === 0 ? 'block' : 'none';
    document.getElementById('paso1').style.display = n === 1 ? 'block' : 'none';
    document.getElementById('erroresOl').innerHTML = n === 0
      ? '<li class="information"><a onclick="setError(this);return false;" value="Empty_Property"> Paso con datos incompletos </a></li>'
      : '<li class="lowError"><a onclick="setError(this);return false;" value="Empty_Property"> No se puede calcular con datos incompletos </a></li>';
  }
</script>
<div id="pestanyas"><ul id="secundario">
  <li onclick="pedirPaso('0','0');return false;"><a><span>Datos de Valoración</span></a></li>
  <li onclick="pedirPaso('0','1');return false;" class="current"><a><span>Garantías y Resultados</span></a></li>
</ul></div>
<div id="areaErrores" style="display:block;"><ol id="erroresOl"><li class="lowError"><a onclick="setError(this);return false;" value="Empty_Property"> No se puede calcular con datos incompletos </a></li></ol></div>
<div id="paso0" style="display:none;">${valoracion}</div>
<div id="paso1" style="display:block;"><h2>Garantías y Capitales opcionales</h2></div>`

const AVISOS_44B44608 = ['espera del precio cortada a 9 s: el portal avisa «Paso con datos incompletos»']

test('v0.2.73 · versión (vigente 0.2.76)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.76'))

test('trabajo 44b44608: desplegable obligatorio con cabecera `value=""` (no «Seleccione…») se ve vacío y va a su única opción real', async () => {
  const r: Registro = { pulsados: [] }
  const val = desplegableCabecera('reg1063A.general.yunico', 'Desplegable con cabecera', ['Única opción'])
  await conPagina(pantalla(val, 'reg1063A.general.yunico'), async (p) => {
    const res = await completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500, avisosExtra: AVISOS_44B44608 })
    assert.ok(res)
    assert.match(res.avisos.join(' | '), /Supuesto: «Datos de Valoración» · Desplegable con cabecera = Única opción/)
    assert.equal(await p.locator('select[name="reg1063A.general.yunico"]').evaluate((s) => (s as HTMLSelectElement).selectedIndex), 1)
    assert.match(res.nota, /vuelta por barra de pasos/)
  })
})

test('trabajo 44b44608: sin campo rellenable, se pulsa el aviso del portal y el atasco nombra PASO y el CAMPO señalado; no vuelve (no se gasta «Recalcular»)', async () => {
  const r: Registro = { pulsados: [] }
  const val = bloque('reg1063A.histSiniestral.ffcerd', 'Fecha certificado', '<input type="text" name="reg1063A.histSiniestral.ffcerd" value="x">')
    + desplegableCabecera('reg1063A.vehiculo.yvarias', 'Uso del vehículo', ['Particular', 'Alquiler'])
  await conPagina(pantalla(val, 'reg1063A.vehiculo.yvarias'), async (p) => {
    await assert.rejects(completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500, avisosExtra: AVISOS_44B44608 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /el paso «Datos de Valoración» marcado con datos incompletos/)
      assert.match(e.message, /Uso del vehículo \(desplegable con 2 opciones; no se elige a ciegas\)/)
      return true
    })
    assert.ok(!r.pulsados.includes('Garantías y Resultados'), 'no vuelve a «Garantías y Resultados»')
  })
})

test('trabajo 44b44608: el aviso enfoca un campo ya puesto y no hay nada vacío → atasco con diagnóstico (pasos, aviso, campo señalado, ocultos, botones) ≤300', async () => {
  const r: Registro = { pulsados: [] }
  const val = bloque('reg1063A.general.ffta42', 'Fecha efecto', '<input type="text" name="reg1063A.general.ffta42" value="x">')
    + bloque('reg1063A.personas.conductor2.nombre', 'Nombre 2º conductor', '<input type="text" name="reg1063A.personas.conductor2.nombre" value="">', true)
    + bloque('reg1063A.personas.roles.lnkPers', 'Personas', '<input type="button" name="reg1063A.personas.roles.lnkPers" value="Personas">')
  await conPagina(pantalla(val, 'reg1063A.general.ffta42'), async (p) => {
    await assert.rejects(completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500, avisosExtra: AVISOS_44B44608 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /el paso «Datos de Valoración» sigue con «Paso con datos incompletos» y no se localiza el campo/)
      const diag = e.message.split('Diagnóstico: ')[1] ?? ''
      assert.ok(diag.length > 0 && diag.length <= 300, `diagnóstico ≤300 (${diag.length})`)
      assert.match(diag, /pasos: Datos de Valoración\(actual\) · Garantías y Resultados/)
      assert.match(diag, /avisos: «Paso con datos incompletos»/)
      assert.match(diag, /campo señalado: Fecha efecto\[texto\*\]=puesto/)
      assert.match(diag, /ocultos vacíos: Nombre 2º conductor/)
      assert.match(diag, /botones obligatorios: Personas/)
      return true
    })
    assert.deepEqual(r.pulsados, ['Datos de Valoración', 'Paso con datos incompletos'], 'se pulsa el paso y el aviso del portal; no se vuelve')
  })
})

test('puras: candidatos (vacío+visible+editable, sin botón ni ya tratados) y diagnóstico saneado y acotado', () => {
  const o = (x: Partial<Parameters<typeof candidatosNeutroPasoGenerali>[0][number]>) => ({ etiqueta: 'E', name: 'n', tipo: 'select' as const, opciones: [], vacio: true, visible: true, editable: true, ...x })
  const c = candidatosNeutroPasoGenerali([o({ name: 'a' }), o({ name: 'b', visible: false }), o({ name: 'c', tipo: 'boton' }), o({ name: 'd', vacio: false }), o({ name: 'e', editable: false }), o({ name: 'f' })], ['f'])
  assert.deepEqual(c.map((x) => x.name), ['a'])
  const d = diagnosticoPasoIncompletoGenerali({ pasos: [{ texto: 'X'.repeat(200), actual: true, marcado: false }], avisos: ['aviso 12345678Z'], senalado: undefined, obligatorios: [] }, 120)
  assert.ok(d.length <= 120)
  assert.doesNotMatch(d, /12345678Z/)
  assert.match(errorPasoSinCampoGenerali('Datos de Valoración', 'diag'), /paso «Datos de Valoración».*Diagnóstico: diag$/)
})

test('lector DOM vivo: obligatorios visibles, ocultos y de botón, con desplegable de cabecera vacía', async () => {
  const val = desplegableCabecera('reg1063A.a.ysel', 'Sel', ['A'])
    + bloque('reg1063A.a.oculto', 'Oculto', '<input type="text" name="reg1063A.a.oculto" value="">', true)
    + bloque('reg1063A.a.lnk', 'Vehículo', '<input type="button" name="reg1063A.a.lnk" value="Vehículo">')
  await conPagina(`<div>${val}</div>`, async (p) => {
    const xs = await leerObligatoriosPasoGenerali(p.mainFrame())
    assert.deepEqual(xs.map((x) => [x.etiqueta, x.tipo, x.vacio, x.visible]), [['Sel', 'select', true, true], ['Oculto', 'texto', true, false], ['Vehículo', 'boton', false, true]])
  })
})
