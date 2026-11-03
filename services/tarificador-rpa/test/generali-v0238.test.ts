// Generali Turismos v0.2.38 (27/10/2026, prueba real con 0.2.37: «Confirmar» pulsado, el selector SIGUE ABIERTO tras 25 s sin mensajes visibles).
// Orden defectuoso reproducido (fixture SINTÉTICA): al elegir la versión el portal repinta el grupo «potencia» y lo deja SIN marcar; el bot pulsaba «Confirmar» igualmente.
// Ahora relee el estado antes de «Confirmar» y PARA (sin pulsar) nombrando la etiqueta vacía; el atasco posterior lista el estado del selector (sin valores).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import { resumenEstadoSelectorGenerali, vaciosAntesDeConfirmarGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, fijarEsperaPostConfirmarGenerali, leerEstadoSelector, seleccionarVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import { abrirDesplegableMarcaGenerali, abrirDesplegableModeloGenerali, abrirDesplegableVersionGenerali, elegirCombustibleGenerali, elegirFilaVersionGenerali, elegirMarcaListaGenerali, elegirModeloListaGenerali, elegirPotenciaGenerali, elegirVersionListaGenerali, instalarGuardEmision, marcarPlacasEspecialesGenerali, pulsarConfirmarVehiculoGenerali, type GuardEmision } from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.38 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[8-9]|[4-9]\d)$/)
})

const HOY = new Date()
fijarEsperaPostConfirmarGenerali(1_500)
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

const SEL_VEHICULOS = 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo'
const contador = (page: Page, k: string) => page.evaluate((n) => (window as unknown as Record<string, unknown>)[n] ?? null, k)
const coche = (extra: Record<string, unknown> = {}): FormularioAuto => {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
    seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI STYLE' },
    fechaMatriculacion: '2019-05-02',
    ...extra,
  }, HOY)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  return v.formulario
}

/** Página en `url` con `html`, servida por la propia prueba (sin red), con el guard de emisión instalado. */
async function abrir(url: string, html: string): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.route('https://www.generali.es/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.request().url().startsWith(url.split('?')[0]!) ? `<!doctype html><body>${html}</body>` : '<body>otra</body>' }))
  await page.goto(url)
  return { page, guard, cerrar: () => context.close() }
}

/** Estructura del inventario real (ids `buscamarca*`, `placaesp:0/1`, `#cancelar`/`#confirmar`); marcas y valores de prueba. */
const PRIMEFACES_HTML = (marcas: string[], boton = 'Confirmar', modelos?: string[], nuevos = '') => `<button type="button">Vehículo</button><h2>Selector de vehículos</h2>
  <span>Placas especiales</span>
  <table><tr><td><input type="radio" id="placaesp:0" name="placaesp" value="S" style="position:absolute;left:-999px"><label for="placaesp:0">Sí</label></td>
  <td><input type="radio" id="placaesp:1" name="placaesp" value="N" style="position:absolute;left:-999px"><label for="placaesp:1">No</label></td></tr></table>
  <span>Principales marcas</span>
  <span>Todas las marcas</span>
  <div id="buscamarca" role="combobox" tabindex="0" onclick="document.getElementById('buscamarca_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="buscamarca_input" name="buscamarca_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione una</option>${marcas.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div><label id="buscamarca_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="buscamarca_panel" style="display:none"><ul id="buscamarca_items">${marcas.map((m) => `<li data-label="${m}" class="ui-selectonemenu-item" onclick="var s=document.getElementById('buscamarca_input');s.selectedIndex=Array.from(s.options).findIndex(o=>o.textContent==='${m}');document.getElementById('buscamarca_label').textContent='${m}';s.dispatchEvent(new Event('change'));window.__cambios=(window.__cambios||0)+1;document.getElementById('buscamarca_panel').style.display='none';var bm=document.getElementById('bloque_modelo');if(bm)bm.style.display='block'">${m}</li>`).join('')}</ul></div>
  ${modelos ? MODELO_PF(modelos, nuevos) : ''}
  <button type="submit" id="cancelar" onclick="window.__cancelar=1">Cancelar</button>
  <button type="submit" id="confirmar" onclick="window.__confirmado=(window.__confirmado||0)+1;return false">${boton}</button>`

/** Bloque «Modelo» (otro SelectOneMenu de PrimeFaces, id de prueba `selmodelo`): oculto hasta elegir la marca; `nuevos` = campos que salen al elegir el modelo. */
const MODELO_PF = (modelos: string[], nuevos: string) => `<div id="bloque_modelo" style="display:none"><span>Modelo</span>
  <div id="selmodelo" role="combobox" tabindex="0" onclick="document.getElementById('selmodelo_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="selmodelo_input" name="selmodelo_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione uno</option>${modelos.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div><label id="selmodelo_label" class="ui-selectonemenu-label">Seleccione uno</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="selmodelo_panel" style="display:none"><ul id="selmodelo_items">${modelos.map((m) => `<li data-label="${m}" class="ui-selectonemenu-item" onclick="var s=document.getElementById('selmodelo_input');s.selectedIndex=Array.from(s.options).findIndex(o=>o.textContent==='${m}');document.getElementById('selmodelo_label').textContent='${m}';s.dispatchEvent(new Event('change'));window.__modelo=(window.__modelo||[]).concat('${m}');document.getElementById('selmodelo_panel').style.display='none';var nv=document.getElementById('nuevos');if(nv)nv.style.display='block'">${m}</li>`).join('')}</ul></div>
  </div><div id="nuevos" style="display:none">${nuevos}</div>`

const ctxPF = (page: Page, guard: GuardEmision) => ({
  pausaAccion: async () => {},
  pulsar: async (b: Parameters<ContextoPortal['pulsar']>[0]) => { const { pulsar } = await import('../src/guard.ts'); await pulsar(b, guard) },
  marcarPlacasEspecialesGenerali: () => marcarPlacasEspecialesGenerali(page, guard, 'No'),
  confirmarVehiculoGenerali: () => pulsarConfirmarVehiculoGenerali(page, guard),
  elegirPotenciaGenerali: (g: string, t: string) => elegirPotenciaGenerali(page, guard, g, t),
  elegirFilaVersionGenerali: (c: string | null, v: string) => elegirFilaVersionGenerali(page, guard, c, v),
  abrirDesplegableMarcaGenerali: (base: string) => abrirDesplegableMarcaGenerali(page, guard, base),
  elegirMarcaListaGenerali: (base: string, texto: string) => elegirMarcaListaGenerali(page, guard, base, texto),
  abrirDesplegableModeloGenerali: (base: string) => abrirDesplegableModeloGenerali(page, guard, base),
  elegirModeloListaGenerali: (base: string, texto: string) => elegirModeloListaGenerali(page, guard, base, texto),
  log: () => {},
}) as unknown as ContextoPortal

const VERSIONES = ['2.5 TCI', '2.9 CRDI 163 FULL', '2.9 CRDI 163 GL', '3.5 V6 195']
/** Como la ficha real: combustible → potencia → «Versión». `repinta` = al elegir la versión el portal repinta el grupo «potencia» (lo deja SIN marcar). */
const FICHA = (repinta: boolean) => {
  const grupo = (name: string, ops: string[]) => `<table><tr>${ops.map((o, i) => `<td><input type="radio" id="${name}:${i}" name="${name}" style="position:absolute;left:-999px" onchange="window.__${name}=(window.__${name}||[]).concat('${o}')"><label for="${name}:${i}">${o}</label></td>`).join('')}</tr></table>`
  return `<span>combustible</span>${grupo('combustible', ['Diésel', 'Gasolina', 'No lo sé'])}
  <span>potencia</span>${grupo('potencia', ['100.0 CV', '163.0 CV', '195.0 CV', 'No lo sé'])}
  <span>Versión</span>
  <div id="selversion" role="combobox" tabindex="0" onclick="document.getElementById('selversion_panel').style.display='block'"><div class="ui-helper-hidden-accessible" style="position:absolute;width:0;height:0;overflow:hidden"><select id="selversion_input" name="selversion_input" style="width:0;height:0;border:0;padding:0"><option value="null">Seleccione una</option>${VERSIONES.map((v, i) => `<option value="V${i}">${v}</option>`).join('')}</select></div><label id="selversion_label" class="ui-selectonemenu-label">Seleccione una</label><div class="ui-selectonemenu-trigger"><span class="ui-icon ui-icon-triangle-1-s"></span></div></div>
  <div id="selversion_panel" style="display:none"><ul id="selversion_items">${VERSIONES.map((v) => `<li data-label="${v}" class="ui-selectonemenu-item">${v}</li>`).join('')}</ul></div>
  <script>
    Array.from(document.querySelectorAll('#selversion_items li')).forEach(function(li,i){li.onclick=function(){var s=document.getElementById('selversion_input');s.selectedIndex=i+1;document.getElementById('selversion_label').textContent=li.dataset.label;window.__version=(window.__version||[]).concat(i);document.getElementById('selversion_panel').style.display='none';
      ${repinta ? "setTimeout(function(){document.querySelectorAll('input[name=potencia]').forEach(function(r){r.checked=false})},200)" : ''}}});
  </script>`
}
const ctx = (page: Page, guard: GuardEmision) => ({
  ...(ctxPF(page, guard) as unknown as Record<string, unknown>),
  elegirCombustibleGenerali: (g: string, t: string) => elegirCombustibleGenerali(page, guard, g, t),
  abrirDesplegableVersionGenerali: (base: string) => abrirDesplegableVersionGenerali(page, guard, base),
  elegirVersionListaGenerali: (base: string, texto: string) => elegirVersionListaGenerali(page, guard, base, texto),
}) as unknown as ContextoPortal
const form = () => coche({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', descripcion: '2.9 CRDI 163 FULL' } })

test('v0.2.38 · orden defectuoso: la versión repinta «potencia» y la deja vacía: NO se pulsa «Confirmar» y el hueco nombra la etiqueta vacía', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA(true)))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form(), ctx(page, guard), []), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /antes de «Confirmar»/.test(e.message) && /potencia \[grupo\]/.test(e.message) && /NO se pulsa «Confirmar»/.test(e.message))
    assert.equal(await contador(page, '__confirmado'), null, 'sin «Confirmar»')
    assert.deepEqual(await contador(page, '__version'), [1])
  } finally {
    await cerrar()
  }
})

test('v0.2.38 · camino sano (nada se repinta): se pulsa «Confirmar» una vez, como en 0.2.36', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA(false)))
  try {
    await assert.rejects(seleccionarVehiculoGenerali(page, page, form(), ctx(page, guard), []), (e: unknown) => e instanceof ErrorMapaIncompletoGenerali && /sigue a «Confirmar»/.test(e.message))
    assert.equal(await contador(page, '__confirmado'), 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.38 · atasco posterior a «Confirmar»: lista el estado del selector (etiquetas, versión elegida) sin valores', async () => {
  const { page, guard, cerrar } = await abrir(SEL_VEHICULOS, PRIMEFACES_HTML(['SEAT'], 'Confirmar', ['IBIZA'], FICHA(false) + '<span>Matrícula</span><input type="text" id="mat" required>'))
  try {
    // El campo «Matrícula» sale en la ficha como NUEVO (parada previa); aquí solo se comprueba el lector de estado y su resumen.
    await page.evaluate(() => { (document.getElementById('bloque_modelo') as HTMLElement).style.display = 'block'; (document.getElementById('nuevos') as HTMLElement).style.display = 'block' })
    const e = await leerEstadoSelector(page)
    const r = resumenEstadoSelectorGenerali(e)
    assert.match(r, /«combustible» \[grupo\] vacío/)
    assert.match(r, /«Matrícula» \[texto\] vacío·obligatorio/)
    assert.match(r, /versión: SIN elegir/)
    assert.match(r, /tabla de versiones: 0 filas \(0 marcadas\)/)
    assert.doesNotMatch(r, /2\.9 CRDI/)
  } finally {
    await cerrar()
  }
})

test('v0.2.38 · puro: solo cuentan los vacíos de lo que el bot explicó (+ tabla sin fila marcada)', () => {
  const est = { controles: [{ clave: 'grupo|potencia', etiqueta: 'potencia', tipo: 'grupo', vacio: true, requerido: false }, { clave: 'otro', etiqueta: 'Otro', tipo: 'texto', vacio: true, requerido: false }], filas: 2, filasSeleccionadas: 0 }
  assert.deepEqual(vaciosAntesDeConfirmarGenerali(est, new Set(['grupo|potencia'])), ['potencia [grupo]', 'fila de la tabla de versiones [sin seleccionar]'])
  assert.deepEqual(vaciosAntesDeConfirmarGenerali({ ...est, filas: 0, filasSeleccionadas: 0 }, new Set()), [])
})
