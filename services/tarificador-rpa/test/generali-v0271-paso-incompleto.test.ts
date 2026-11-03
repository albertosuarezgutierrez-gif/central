// Generali auto v0.2.71 (trabajo 1a88445a con 0.2.70): tras «Recalcular» el portal seguía en «datos incompletos» con «Garantías y Resultados» sin obligatorios
// vacíos; avisos «Paso con datos incompletos» / «El paso anterior no tiene los datos completos». Antes del único «Recalcular» se va al paso marcado (o al
// anterior) de la barra de pasos, se rellenan sus obligatorios vacíos en valor neutro (supuesto) y se vuelve; si no se puede, el atasco nombra paso + campo.
// Fixtures SINTÉTICAS con la estructura del volcado redactado (barra `#secundario`, `pedirPaso`, bloques `.simple` con `.required`), sin valores reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { completarPasoIncompletoGenerali, ErrorMapaIncompletoGenerali, leerBarraPasosGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { avisoPasoIncompletoGenerali, decidirNeutroPasoGenerali, destinoPasoIncompletoGenerali, errorPasoIncompletoGenerali } from '../src/adapters/generali/reglas.ts'
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

type Registro = { pulsados: string[]; siguiente: number }
const ctxCon = (r: Registro, conSiguiente = false) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void>; evaluate: (f: (el: Element) => string) => Promise<string> }) => {
    r.pulsados.push(await l.evaluate((el) => (el.getAttribute('name') || el.textContent || '').replace(/\s+/g, ' ').trim()))
    await l.click()
  },
  ...(conSiguiente ? { pulsarSiguienteGenerali: async () => { r.siguiente++; await (globalThis as { __pagina?: Page }).__pagina!.evaluate('pedirPaso(1)'); return { dialogo: null } } } : {}),
}) as unknown as ContextoPortal

const FICHA = { aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0 }
const req = '<div class="trueInline required"><span> * </span></div>'
const opcionesSiNo = (name: string, rotulo: string) => {
  const id = name.replace(/\./g, '_')
  const op = (t: string) => `<input type="radio" name="${name}" value="x"> <span> ${t} </span>`
  return `<div class="falseInline simple" id="${id}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2">${op('No')}${op('Sí')}</div></div>`
}
const desplegable = (name: string, rotulo: string, ops: string[]) =>
  `<div class="falseInline simple" id="${name.replace(/\./g, '_')}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2"><select name="${name}">${ops.map((o) => `<option>${o}</option>`).join('')}</select></div></div>`
const texto = (name: string, rotulo: string) =>
  `<div class="falseInline simple" id="${name.replace(/\./g, '_')}Identification"><div class="falseInline column1"><span> ${rotulo} </span>${req}</div><div class="falseInline column2"><input type="text" name="${name}" value=""></div></div>`

/** Barra de pasos real (`#secundario`, `pedirPaso`), aviso en `#areaErrores` y los dos pasos; «Garantías y Resultados» es el actual. */
const pantalla = (aviso: string, valoracion: string, marcaValoracion = '') => `
<script>
  function pedirPaso(n) {
    document.querySelectorAll('#secundario > li').forEach((li, i) => { li.className = i === n ? 'current' : (li.dataset.marca || '') });
    document.getElementById('paso0').style.display = n === 0 ? 'block' : 'none';
    document.getElementById('paso1').style.display = n === 1 ? 'block' : 'none';
  }
</script>
<div id="pestanyas"><ul id="secundario">
  <li onclick="pedirPaso(0);return false;" class="${marcaValoracion}" data-marca="${marcaValoracion}"><a><span>Datos de Valoración</span></a></li>
  <li onclick="pedirPaso(1);return false;" class="current"><a><span>Garantías y Resultados</span></a></li>
</ul></div>
<div id="areaErrores" style="display:block;"><ol>${aviso ? `<li class="lowError"><a value="Empty_Property">${aviso}</a></li>` : ''}</ol></div>
<div id="paso0" style="display:none;">${valoracion}</div>
<div id="paso1" style="display:block;"><h2>Garantías y Capitales opcionales</h2></div>`

test('v0.2.71 · versión (vigente 0.2.76)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.76'))

test('puras: aviso de paso incompleto, destino (marcado > anterior al actual), valor neutro y error con paso + campo', () => {
  assert.equal(avisoPasoIncompletoGenerali(['Paso con datos incompletos']), true)
  assert.equal(avisoPasoIncompletoGenerali(['El paso anterior no tiene los datos completos']), true)
  assert.equal(avisoPasoIncompletoGenerali(['No se puede calcular con datos incompletos']), false)
  const pasos = [{ texto: 'Datos de Valoración', actual: false, marcado: false }, { texto: 'Garantías y Resultados', actual: true, marcado: false }]
  assert.equal(destinoPasoIncompletoGenerali(pasos, ['El paso anterior no tiene los datos completos']), 'Datos de Valoración')
  assert.equal(destinoPasoIncompletoGenerali(pasos, []), null, 'sin aviso no se navega')
  assert.equal(destinoPasoIncompletoGenerali([{ ...pasos[0]!, actual: true }, { ...pasos[1]!, actual: false }], ['Paso con datos incompletos']), null, 'sin paso anterior no se navega')
  assert.equal(destinoPasoIncompletoGenerali([{ texto: 'A', actual: false, marcado: false }, { texto: 'B', actual: false, marcado: true }, { texto: 'C', actual: true, marcado: false }], []), 'B', 'el marcado manda')
  assert.deepEqual(decidirNeutroPasoGenerali('opciones', ['Sí', 'No']), { accion: 'marcar', indice: 1, valor: 'No' })
  assert.equal(decidirNeutroPasoGenerali('opciones', ['Sí', 'Quizá']).accion, 'sinRegla')
  assert.deepEqual(decidirNeutroPasoGenerali('select', ['Seleccione...', 'Única']), { accion: 'elegir', indice: 1, valor: 'Única' })
  assert.equal(decidirNeutroPasoGenerali('select', ['Seleccione...', 'A', 'B']).accion, 'sinRegla')
  assert.equal(decidirNeutroPasoGenerali('texto', []).accion, 'sinRegla')
  const e = errorPasoIncompletoGenerali('Datos de Valoración', ['Fecha de algo (texto libre; no se inventa)'])
  assert.match(e, /paso «Datos de Valoración»/)
  assert.match(e, /Fecha de algo \(texto libre/)
})

test('lee la barra de pasos: textos, actual y marca del portal', async () => {
  await conPagina(pantalla('', '', 'pasoIncompleto'), async (p) => {
    const b = await leerBarraPasosGenerali(p)
    assert.deepEqual(b?.pasos, [{ texto: 'Datos de Valoración', actual: false, marcado: true }, { texto: 'Garantías y Resultados', actual: true, marcado: false }])
  })
})

test('aviso «El paso anterior…»: va a «Datos de Valoración», marca «No» y la única opción real, avisa «Supuesto» y vuelve por la barra', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  const val = opcionesSiNo('reg1063A.general.zprueba', '¿Pregunta obligatoria?') + desplegable('reg1063A.general.ysel', 'Desplegable obligatorio', ['Seleccione...', 'Única opción'])
  await conPagina(pantalla('El paso anterior no tiene los datos completos', val), async (p) => {
    const res = await completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500 })
    assert.ok(res)
    assert.equal(res.avisos.length, 2)
    for (const a of res.avisos) assert.match(a, /^Supuesto: «Datos de Valoración» · /)
    assert.match(res.nota, /Paso incompleto «Datos de Valoración»: 2 obligatorio\(s\) en valor neutro; vuelta por barra de pasos/)
    assert.equal(await p.locator('input[name="reg1063A.general.zprueba"]').nth(0).isChecked(), true, '«No» marcado')
    assert.equal(await p.locator('select[name="reg1063A.general.ysel"]').evaluate((s) => (s as HTMLSelectElement).selectedIndex), 1)
    assert.deepEqual(r.pulsados, ['Datos de Valoración', 'reg1063A.general.zprueba', 'Garantías y Resultados'])
    assert.equal((await leerBarraPasosGenerali(p))?.pasos.find((x) => x.actual)?.texto, 'Garantías y Resultados', 'de vuelta en el paso de origen')
  })
})

// v0.2.72: la barra va PRIMERO; «Siguiente» (puerta guardada) solo si la barra no devuelve al paso de origen.
test('con la puerta de «Siguiente» en el contexto y la barra sin efecto hacia «Garantías y Resultados», la vuelta es por «Siguiente»', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  await conPagina(pantalla('Paso con datos incompletos', opcionesSiNo('reg1063A.general.zprueba', '¿Pregunta obligatoria?')), async (p) => {
    ;(globalThis as { __pagina?: Page }).__pagina = p
    await p.evaluate(() => { (document.querySelectorAll('#secundario > li')[1] as HTMLElement).onclick = () => false })
    const res = await completarPasoIncompletoGenerali(p, ctxCon(r, true), FICHA, [], { esperaMs: 1_500 })
    assert.equal(r.siguiente, 1)
    assert.match(res!.nota, /vuelta por Siguiente/)
    assert.deepEqual(r.pulsados, ['Datos de Valoración', 'reg1063A.general.zprueba', 'Garantías y Resultados'], 'la barra se probó antes')
  })
})

test('obligatorio sin valor neutro seguro (texto libre, desplegable con varias opciones): atasco que nombra paso + campo y NO vuelve', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  const val = texto('reg1063A.general.ffecha', 'Fecha obligatoria') + desplegable('reg1063A.general.yvarias', 'Desplegable con varias', ['Seleccione...', 'A', 'B'])
  await conPagina(pantalla('El paso anterior no tiene los datos completos', val), async (p) => {
    await assert.rejects(completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match(e.message, /el paso «Datos de Valoración» marcado con datos incompletos/)
      assert.match(e.message, /Fecha obligatoria \(texto libre; no se inventa\)/)
      assert.match(e.message, /Desplegable con varias \(desplegable con 2 opciones; no se elige a ciegas\)/)
      return true
    })
    assert.deepEqual(r.pulsados, ['Datos de Valoración'])
  })
})

test('sin aviso de paso incompleto ni paso marcado: null y no pulsa nada', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  await conPagina(pantalla('No se puede calcular con datos incompletos', opcionesSiNo('reg1063A.general.zprueba', '¿Pregunta obligatoria?')), async (p) => {
    assert.equal(await completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 500 }), null)
    assert.deepEqual(r.pulsados, [])
  })
})

test('el aviso visto en las esperas (avisosExtra) también lleva al paso anterior', async () => {
  const r: Registro = { pulsados: [], siguiente: 0 }
  await conPagina(pantalla('', ''), async (p) => {
    const res = await completarPasoIncompletoGenerali(p, ctxCon(r), FICHA, [], { esperaMs: 1_500, avisosExtra: ['espera del precio cortada a 9 s: el portal avisa «Paso con datos incompletos»'] })
    assert.match(res!.nota, /sin obligatorios vacíos detectados/)
    assert.deepEqual(r.pulsados, ['Datos de Valoración', 'Garantías y Resultados'])
  })
})
