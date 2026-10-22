// Mapfre NSEI · de la MATRÍCULA a la PRIMA (v0.8.0), según la grabación completa de Alberto del 15/10/2026 (Chrome Recorder,
// saneada). Fixtures SINTÉTICAS por pantalla: la ESTRUCTURA (componentes `app-matricula-dialog` con tabla CDK, `datos-licencia`,
// `app-historial-siniestralidad`, `app-club-mapfre` con su `div.left`, `app-coberturas`) es la de la grabación; TODOS los
// valores (matrícula, vehículos, compañías, fechas, importes) son inventados. Sin PII.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { comprobarBoton, EmisionBloqueadaError, type FormularioAuto } from '@central/module-tarificacion'
import {
  cerrarClubMapfre,
  confirmarVehiculoMapfre,
  ErrorFronteraEmision,
  ErrorMapaGuardMapfre,
  decidirBotonGenerarProyectoMapfre,
  descripcionGenerarProyecto,
  esBotonGenerarProyectoMapfre,
  etiquetaEfectivaControl,
  etiquetasControlesSaneadas,
  sufijoControlesVisibles,
  type ControlProyectoMapfre,
  exigirSinCuentaBancaria,
  generarProyectoMapfre,
  instalarGuardEmision,
  numeroProyectoMapfreNuevo,
  pulsar,
  pulsarContinuarMapfre,
  TEXTOS_CIERRE_CLUB_MAPFRE,
  type GuardEmision,
} from '../src/guard.ts'
import {
  consultarVehiculoPorMatricula,
  consultarVehiculoPorMatriculaConSupuesto,
  ErrorMapaIncompleto,
  esperarPrimasMapfre,
  exigirConductorEsTomador,
  historialAnterior,
  indiceFilaVehiculoMapfre,
  mapfreAuto,
  AVISO_PROYECTO_MAPFRE,
  ofertasConProyectoMapfre,
  patronEtiqueta,
  planObjetoYFiguras,
  precioDesdeObjetoAsegurado,
  SEL_HISTORIAL,
  SEL_LICENCIA,
  type FilaVehiculoDialogo,
} from '../src/adapters/mapfre/auto.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import { coincidenciaOpcion, elegirOpcionMatSelect } from '../src/mat-select.ts'
import { ErrorTarificador } from '../src/errores.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const MATRICULA = '0000BBB'

const form: FormularioAuto = {
  ramo: 'auto',
  matricula: MATRICULA,
  codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null },
  tomadorEsConductor: true,
  tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: null,
  tomador: null,
  eleccionVersion: null,
  seleccionVehiculo: null,
  documentoTomador: '00000000T',
  usoVehiculo: 'particular',
  ambitoCirculacion: 'espana',
  clasePermiso: 'b',
  companiaAnterior: 'ASEGURADORA FICTICIA GENERALES',
}

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

/** Contexto LIMPIO por caso (el guard cuenta los usos por trabajo = por contexto). */
async function preparar(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(html)
  return { context, page, guard }
}
/** Igual que `preparar`, pero servido desde un origen https (el guardado exige origen http(s) del marco del botón). */
async function prepararHttps(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://nsei.ejemplo.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://nsei.ejemplo.test/evt21_nsei_fe-web/')
  return { context, page, guard }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

/** Contexto del runner con las funciones guardadas REALES de guard.ts (como runner.ts). */
const ctxReal = (page: Page, guard: GuardEmision) => {
  const p = (b: import('playwright').Locator) => pulsar(b, guard)
  return {
    pulsar: p,
    pausa: async () => {},
    log: () => {},
    confirmarVehiculoMapfre: (pg: Page, m: string, i?: number, d?: string) => confirmarVehiculoMapfre(pg, guard, m, i, d),
    continuarMapfre: (pg: Page, paso: 'datosBasicos' | 'objetoAsegurado' | 'figuras') => pulsarContinuarMapfre(pg, guard, paso),
    cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard),
    elegirMatSelect: (s: import('playwright').Locator, v: string | readonly string[], o: { etiqueta: string }) => elegirOpcionMatSelect(s, v, { ...o, pulsar: p }),
  } as unknown as ContextoPortal
}

// ───────────────────────── fixtures por pantalla ─────────────────────────

const PASOS = ['Datos básicos', 'Objeto asegurado', 'Figuras', 'Coberturas', 'Proyectos', 'Contratación']

/** Diálogo «Selección de vehículo» SIN radio (tabla CDK: la fila se elige pulsando una celda, como en la grabación). */
const FILAS_DIALOGO = (filas: Array<[string, string, string?, string?]>) =>
  filas.map(([mat, den, cv, cc], i) => `<tr class="mat-row cdk-row" onclick="window.__fila=${i};document.getElementById('okv').disabled=false"><td class="cdk-column-select"></td><td class="cdk-column-matricula">${mat}</td><td class="cdk-column-bastidor">BASTIDOR-FICTICIO-${i}</td><td class="cdk-column-denominacion">${den}</td><td>${cv ?? 100 + i}</td><td>${cc ?? 1500 + i}</td><td>5</td><td>01/0${i + 1}/2020</td></tr>`).join('')
// DOM de la prueba real del 15/10/2026 (trabajo f46682c2): `cdk-overlay-pane custom-dialog`, título «Selección de vehículo»,
// botones «Cancelar», «No es el vehículo.» y «Aceptar».
const DIALOGO_VEHICULO = (filas: Array<[string, string, string?, string?]>) => `<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><div><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th><th>CV/KW</th><th>CC</th><th>Nº Puertas</th><th>Fecha Inicio</th></tr></thead><tbody>${FILAS_DIALOGO(filas)}</tbody></table></div>
<div><div class="right"><button onclick="window.__cancelar=1">Cancelar</button><button onclick="window.__noCatalogado=1">No es el vehículo.</button><button id="okv" disabled onclick="window.__aceptado=1;document.querySelector('.custom-dialog').remove()">Aceptar</button></div></div></app-matricula-dialog></mat-dialog-container></div>`

const CLUB = (izquierda = 'No, gracias') => `<mat-dialog-container><app-club-mapfre><section><p>Club MAPFRE</p><div class="botonera"><div class="left"><button onclick="cerrarClub()">${izquierda}</button></div><div class="right"><button onclick="window.__adherido=1">Adherirme al Club</button></div></div></section></app-club-mapfre></mat-dialog-container>`

const TARJETA = (producto: string, prima: string) => `<prima-producto><section><mat-select><span class="mat-select-value-text">${producto}</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select></section><section><div class="caja-primas"><p><strong>${prima}</strong></p></div></section></prima-producto>`

/** Una página NSEI con TODOS los componentes a la vez (como la SPA): el stepper manda. Mat-select con overlay CDK. */
/** v0.8.14 · qué hace el portal al pulsar «Generar Proyecto»: pinta el nº en «Proyectos» (input de solo lectura), nada, o un diálogo de pago. */
type ProyectoFixture = { tras?: 'numero' | 'mudo' | 'dialogoPago'; texto?: string; previo?: string; donde?: 'pie' | 'icono' | 'aria' | 'enlace' | 'tarde' | 'oculto' | 'ninguno' }
/** v0.8.15 · dónde y cómo pinta el portal el botón «Generar Proyecto» (por defecto: <button> dentro de `app-coberturas`). */
const BOTON_PROYECTO = (o: ProyectoFixture | undefined) => {
  const t = o?.texto ?? 'Generar Proyecto'
  const clic = 'onclick="generarProyecto()"'
  switch (o?.donde) {
    case 'icono': return `<button ${clic}><mat-icon>description</mat-icon> ${t}</button>`
    case 'aria': return `<button ${clic} aria-label="${t}"><mat-icon>description</mat-icon></button>`
    case 'enlace': return `<a role="button" ${clic}>${t}</a>`
    case 'oculto': return `<div style="display:none"><button ${clic}>${t}</button></div>`
    case 'pie': case 'tarde': case 'ninguno': return ''
    default: return `<button ${clic}>${t}</button>`
  }
}
const PIE_PROYECTO = (o: ProyectoFixture | undefined) =>
  o?.donde === 'pie' ? `<button onclick="generarProyecto()">${o.texto ?? 'Generar Proyecto'}</button>` : o?.donde === 'tarde' ? '<span id="pieTarde"></span><script>setTimeout(()=>{document.getElementById("pieTarde").innerHTML=\'<button onclick="generarProyecto()">Generar Proyecto</button>\'},1200)</script>' : ''
const NSEI = (o: { filas?: Array<[string, string, string?, string?]>; polizaObligatoria?: boolean; club?: string | null; primas?: string; interruptor?: boolean | null; cpAsincrono?: boolean; errorEn?: 'matriculacion' | null; sinUsoAmbito?: boolean; proyecto?: ProyectoFixture } = {}) => `<!doctype html><body>
<style>mat-select{display:inline-block;min-width:80px;min-height:14px;border:1px solid #999}</style>
<mat-horizontal-stepper>${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === 0}">${i + 1} ${p}</mat-step-header>`).join('')}</mat-horizontal-stepper>
<template id="tplVeh">${DIALOGO_VEHICULO(o.filas ?? [[MATRICULA, 'MARCA PRUEBA MODELO X 1.6']])}</template>
<app-datos-vehiculo><input name="matricula" onblur="setTimeout(()=>document.getElementById('ov').appendChild(document.getElementById('tplVeh').content.cloneNode(true)),50)">
<mat-form-field id="ffMatric"><label class="mat-form-field-label"><mat-label>1ª Matriculación</mat-label><span class="mat-placeholder-required">*</span></label><input name="dateMatriculacion" formcontrolname="dateMatriculacion" value="01/01/2020"></mat-form-field>
<mat-form-field id="ffCp"><label class="mat-form-field-label"><mat-label>CP. De Circulación</mat-label><span class="mat-placeholder-required">*</span></label><input name="cpCirculacion" formcontrolname="codPostal" onblur="validarCp(this)"></mat-form-field>
<mat-select formcontrolname="uso" ${o.sinUsoAmbito ? 'style="display:none"' : ''} onclick="abrir(this,['Particular','Alquiler sin conductor'])"><span class="v"></span></mat-select>
<mat-select formcontrolname="ambitoCirculacion" ${o.sinUsoAmbito ? 'style="display:none"' : ''} onclick="abrir(this,['España','Unión Europea'])"><span class="v"></span></mat-select></app-datos-vehiculo>
<app-figuras><div role="tabpanel" aria-label="Tomador">
<datos-licencia><form><div><mat-form-field><mat-label>Tipo de permiso</mat-label><mat-select name="codigoTipoLicencia" onclick="abrir(this,['A','A2','B','C'])"><span class="v"></span></mat-select></mat-form-field>
<mat-form-field><mat-label>Valido desde</mat-label><input id="fechaCarne"></mat-form-field></div></form></datos-licencia>
<app-historial-siniestralidad><div>${o.interruptor === undefined || o.interruptor === null ? '' : `<input type="checkbox" id="companiaAnteriorSlide-input" ${o.interruptor ? 'checked' : ''}>`}
<mat-select formcontrolname="companiaAnterior" onclick="abrir(this,['ASEGURADORA FICTICIA GENERALES, S.A. DE SEGUROS Y REASEGUROS','OTRA ASEGURADORA FICTICIA, S.A.'])"><span class="v"></span></mat-select>
<mat-form-field><mat-label>Nº de Póliza${o.polizaObligatoria ? '<span class="mat-placeholder-required">*</span>' : ''}</mat-label><input formcontrolname="numPoliza"></mat-form-field>
<input formcontrolname="siniestros"></div></app-historial-siniestralidad></div></app-figuras>
<app-coberturas><app-primas id="primas"></app-primas><app-descuentos><tabla-descuentos-resumen><table><tbody><tr><td>RECARGO TÉCNICO</td></tr></tbody></table></tabla-descuentos-resumen></app-descuentos>
<div class="btn-panel"><button id="irGenerar" onclick="window.__generar=1">Ir a generar</button>${BOTON_PROYECTO(o.proyecto)}</div><p>${o.proyecto?.previo ?? ''}</p></app-coberturas>
<app-proyecto></app-proyecto>
<div class="btn-panel"><div class="right">${PIE_PROYECTO(o.proyecto)}<button id="cont" onclick="continuar()">Continuar</button></div></div>
<div class="cdk-overlay-container" id="ov"></div>
<script>
function abrir(sel, opciones){const ov=document.getElementById('ov');const panel=document.createElement('div');panel.className='cdk-overlay-pane';for(const t of opciones){const m=document.createElement('mat-option');m.setAttribute('role','option');m.textContent=t;m.style.display='block';m.onclick=()=>{sel.querySelector('.v').textContent=t;panel.remove()};panel.appendChild(m)}ov.appendChild(panel)}
// CP de circulación con validación ASÍNCRONA al salir del campo (como NSEI: el control queda «ng-pending» un rato).
function validarCp(el){if(!${!!o.cpAsincrono})return;el.classList.add('ng-pending');setTimeout(()=>{el.classList.remove('ng-pending');window.__cpValido=el.value},600)}
function marcarError(ff){if(!ff.querySelector('mat-error'))ff.insertAdjacentHTML('beforeend','<mat-error>Campo obligatorio</mat-error>')}
function continuar(){window.__continuar=(window.__continuar||0)+1;const h=[...document.querySelectorAll('mat-step-header')];const i=h.findIndex(x=>x.getAttribute('aria-selected')==='true');
 if(i===1){let ok=true;if(${!!o.cpAsincrono}&&!window.__cpValido){marcarError(document.getElementById('ffCp'));ok=false}if(${JSON.stringify(o.errorEn ?? null)}==='matriculacion'){marcarError(document.getElementById('ffMatric'));ok=false}if(!ok)return}
 h[i].setAttribute('aria-selected','false');h[i+1].setAttribute('aria-selected','true');
 if(PASO_COBERTURAS(i+1)){${o.club === null ? 'calcular()' : `setTimeout(()=>document.getElementById('ov').insertAdjacentHTML('beforeend', ${JSON.stringify(CLUB(o.club ?? undefined))}),80)`}}}
function PASO_COBERTURAS(i){return i===3}
function generarProyecto(){window.__proyecto=(window.__proyecto||0)+1;const tras=${JSON.stringify(o.proyecto?.tras ?? 'numero')};const ov=document.getElementById('ov');ov.insertAdjacentHTML('beforeend','<mat-dialog-container id="gen">Generando proyecto</mat-dialog-container>');
 setTimeout(()=>{document.getElementById('gen').remove();if(tras==='mudo')return;if(tras==='dialogoPago'){ov.insertAdjacentHTML('beforeend','<mat-dialog-container><p>Para continuar debe realizar el pago</p><button onclick="window.__pagado=1">Aceptar</button></mat-dialog-container>');return}
 const h=[...document.querySelectorAll('mat-step-header')];h[3].setAttribute('aria-selected','false');h[4].setAttribute('aria-selected','true');
 document.querySelector('app-proyecto').innerHTML='<mat-form-field><mat-label>Nº Proyecto</mat-label><input readonly value="9876543210"></mat-form-field><mat-select><span>Castellano</span></mat-select>'},300)}
function cerrarClub(){document.querySelector('mat-dialog-container').remove();calcular()}
function calcular(){document.getElementById('ov').insertAdjacentHTML('beforeend','<mat-dialog-container id="calc">Calculando las primas</mat-dialog-container>');setTimeout(()=>{document.getElementById('calc').remove();document.getElementById('primas').innerHTML=${JSON.stringify(o.primas ?? TARJETA('PRODUCTO UNO', 'PRIMA TOTAL: 1.234,56 €') + TARJETA('PRODUCTO DOS', 'PRIMA TOTAL: 987,65 €'))}},300)}
</script></body>`

// ───────────────────────── 1 · fila del diálogo de vehículo (regla fija, pura) ─────────────────────────

const fila = (denominacion: string, cc = '1500', fechaInicio = '01/01/2020'): FilaVehiculoDialogo => ({ denominacion, cvKw: '100', cc, puertas: '5', fechaInicio })

test('indiceFilaVehiculoMapfre: una fila → ella; varias → SOLO la única que casa con el riesgo; si no, null (nunca «la primera»)', () => {
  assert.equal(indiceFilaVehiculoMapfre([fila('CUALQUIERA')], null), 0)
  const dos = [fila('MARCA PRUEBA MODELO X 1.6'), fila('MARCA PRUEBA MODELO Y 2.0')]
  assert.equal(indiceFilaVehiculoMapfre(dos, null), null, 'sin datos del riesgo no se elige')
  assert.equal(indiceFilaVehiculoMapfre(dos, { seleccionVehiculo: { marca: 'Marca Prueba', modelo: 'Modelo Y' } }), 1)
  assert.equal(indiceFilaVehiculoMapfre(dos, { seleccionVehiculo: { marca: 'Marca Prueba', modelo: 'Modelo' } }), null, 'modelo que no es palabra entera de una sola fila → nada')
  assert.equal(indiceFilaVehiculoMapfre(dos, { eleccionVersion: { etiqueta: 'marca prueba modelo x 1.6' } }), 0, 'la versión elegida por una persona manda')
  assert.equal(indiceFilaVehiculoMapfre(dos, { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO Y 2.0', cv: 100, cc: 1500, puertas: 5, fechaInicio: '2020-01-01' } }), 1)
  // Dos filas con la MISMA denominación: desempata la cilindrada si consta; si no, null.
  const gemelas = [fila('MARCA PRUEBA MODELO Z', '1400'), fila('MARCA PRUEBA MODELO Z', '1600')]
  assert.equal(indiceFilaVehiculoMapfre(gemelas, { seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO Z' } }), null)
  assert.equal(indiceFilaVehiculoMapfre(gemelas, { seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO Z', cilindradaCc: 1600 } }), 1)
  assert.equal(indiceFilaVehiculoMapfre([], { seleccionVehiculo: { marca: 'A', modelo: 'B' } }), null)
})

test('diálogo de vehículo SIN radio (tabla CDK): el guard pulsa una celda de CATÁLOGO de la fila elegida, compara SU matrícula y acepta', async () => {
  const { context, page, guard } = await preparar(`<body>${DIALOGO_VEHICULO([['1111CCC', 'MARCA PRUEBA MODELO X'], [MATRICULA, 'MARCA PRUEBA MODELO Y']])}</body>`)
  await confirmarVehiculoMapfre(page, guard, MATRICULA, 1)
  assert.equal(await marca(page, '__fila'), 1)
  assert.equal(await marca(page, '__aceptado'), 1)
  assert.equal(await marca(page, '__noCatalogado'), null)
  await context.close()
  // La fila elegida con OTRA matrícula → `datos`, sin pulsar nada (aunque otra fila case).
  const b = await preparar(`<body>${DIALOGO_VEHICULO([[MATRICULA, 'MARCA PRUEBA MODELO X'], ['1111CCC', 'MARCA PRUEBA MODELO Y']])}</body>`)
  await assert.rejects(() => confirmarVehiculoMapfre(b.page, b.guard, MATRICULA, 1), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && !/0000|1111|BBB|CCC|BASTIDOR/.test(e.message))
  assert.equal(await marca(b.page, '__fila'), null)
  await assert.rejects(() => confirmarVehiculoMapfre(b.page, b.guard, MATRICULA, 5), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  await b.context.close()
})

test('confirmarVehiculoMapfre con denominación: la tabla re-ordenada entre lectura y clic → NO marca ni acepta; con la misma denominación sí', async () => {
  const { context, page, guard } = await preparar(`<body>${DIALOGO_VEHICULO([[MATRICULA, 'MARCA PRUEBA MODELO Y'], [MATRICULA, 'MARCA PRUEBA MODELO X']])}</body>`)
  // El adaptador leyó la fila 1 como «MODELO Y»; ahora la fila 1 es «MODELO X».
  await assert.rejects(() => confirmarVehiculoMapfre(page, guard, MATRICULA, 1, 'Marca Prueba Modelo Y'), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  assert.equal(await marca(page, '__fila'), null)
  assert.equal(await marca(page, '__aceptado'), null)
  await context.close()
  const b = await preparar(`<body>${DIALOGO_VEHICULO([[MATRICULA, 'MARCA PRUEBA MODELO Y'], [MATRICULA, 'MARCA PRUEBA MODELO X']])}</body>`)
  await confirmarVehiculoMapfre(b.page, b.guard, MATRICULA, 1, ' marca prueba  modelo x ')
  assert.equal(await marca(b.page, '__aceptado'), 1)
  await b.context.close()
})

test('consultarVehiculoPorMatricula (v0.8.9): varias filas MATERIALMENTE distintas (cc 1500 vs 2500) y sin dato que desempate → NO elige: ErrorEleccionVersion con TODAS las filas (denominación · CV · cc · fecha) y sin pulsar «Aceptar»', async () => {
  const { context, page, guard } = await preparar(NSEI({ filas: [[MATRICULA, 'MARCA PRUEBA MODELO X 1.6', '100', '1500'], [MATRICULA, 'MARCA PRUEBA MODELO Y 2.0', '150', '2500']] }))
  const ctx = ctxReal(page, guard)
  await assert.rejects(
    () => consultarVehiculoPorMatricula(page, MATRICULA, ctx, 3_000, undefined, form),
    (e) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length === 2 && e.opcionesVersion[0]!.etiqueta.startsWith('MARCA PRUEBA MODELO X 1.6') && e.opcionesVersion[1]!.etiqueta.startsWith('MARCA PRUEBA MODELO Y 2.0') && !JSON.stringify(e.opcionesVersion).includes(MATRICULA),
  )
  assert.equal(await marca(page, '__aceptado'), null, 'no se confirmó ninguna fila')
  await context.close()
})

test('consultarVehiculoPorMatricula (v0.8.9, caso Terracan): 5 filas equivalentes (GL/GLS/Full, 163 CV, 2902 cc) → elige SOLA la primera, la confirma por el guard y DECLARA el supuesto', async () => {
  const filas = ['GL', 'GLS', 'FULL', 'GLS AUT', 'FULL AUT'].map((a): [string, string, string, string] => [MATRICULA, `HYUNDAI TERRACAN 2.9 CRDI 163 ${a}`, '163', '2902'])
  const { context, page, guard } = await preparar(NSEI({ filas }))
  const r = await consultarVehiculoPorMatriculaConSupuesto(page, MATRICULA, ctxReal(page, guard), 3_000, undefined, form)
  assert.equal(r.vehiculo.denominacion, 'HYUNDAI TERRACAN 2.9 CRDI 163 GL')
  assert.equal(await marca(page, '__fila'), 0, 'la primera del portal (sin fecha de matriculación)')
  assert.equal(await marca(page, '__aceptado'), 1)
  assert.match(r.supuestoVersion!, /^Versión elegida automáticamente: HYUNDAI TERRACAN 2\.9 CRDI 163 GL · 163 CV · 2902 cc · .* \(había 5 equivalentes; revisar en la emisión\)$/)
  assert.ok(!r.supuestoVersion!.includes(MATRICULA))
  await context.close()
  // Con la 1ª matriculación del riesgo elige la de fecha de inicio más cercana (≤): las filas traen 01/01/2020 … 01/05/2020.
  const b = await preparar(NSEI({ filas }))
  const r2 = await consultarVehiculoPorMatriculaConSupuesto(b.page, MATRICULA, ctxReal(b.page, b.guard), 3_000, undefined, { ...form, fechaMatriculacion: '2020-03-15' })
  assert.equal(r2.vehiculo.denominacion, 'HYUNDAI TERRACAN 2.9 CRDI 163 FULL')
  assert.equal(await marca(b.page, '__fila'), 2)
  await b.context.close()
})

test('consultarVehiculoPorMatricula (v0.8.6): UNA sola fila → esa, como dato, SIN supuesto', async () => {
  const { context, page, guard } = await preparar(NSEI({ filas: [[MATRICULA, 'MARCA PRUEBA MODELO X 1.6']] }))
  const v = await consultarVehiculoPorMatricula(page, MATRICULA, ctxReal(page, guard), 3_000, undefined, form)
  assert.equal(v.denominacion, 'MARCA PRUEBA MODELO X 1.6')
  await context.close()
})

test('consultarVehiculoPorMatricula (v0.8.6): varias filas y UNA casa con la versión elegida → esa, como dato, SIN supuesto', async () => {
  const { context, page, guard } = await preparar(NSEI({ filas: [[MATRICULA, 'MARCA PRUEBA MODELO X 1.6'], [MATRICULA, 'MARCA PRUEBA MODELO Y 2.0']] }))
  const v = await consultarVehiculoPorMatricula(page, MATRICULA, ctxReal(page, guard), 3_000, undefined, { ...form, eleccionVersion: { etiqueta: 'MARCA PRUEBA MODELO Y 2.0' } })
  assert.equal(v.denominacion, 'MARCA PRUEBA MODELO Y 2.0')
  assert.equal(await marca(page, '__aceptado'), 1)
  await context.close()
})

// ───────────────────────── 2 · plan de Figuras: datos del riesgo, sin inventar ─────────────────────────

test('planObjetoYFiguras (v0.8.0): licencia en `datos-licencia` y compañía anterior; sin compañía o sin conductor = tomador → `datos`/hueco, antes de tocar el portal', () => {
  const plan = planObjetoYFiguras(form)
  assert.deepEqual(plan.pendientes, [], 'con los defectos del formulario de auto no queda nada pendiente (ni el interruptor)')
  assert.deepEqual(plan.escribibles.filter((o) => o.paso === 'figuras').map((o) => [o.etiqueta, o.tipo]), [
    ['fecha del carné (Valido desde)', 'texto'],
    ['siniestros RC 5 años', 'texto'],
    ['clase del permiso', 'mat-select'],
    ['compañía anterior', 'mat-select'],
  ])
  assert.equal(plan.escribibles.find((o) => o.sel === SEL_LICENCIA.clasePermiso)!.opciones![0], 'B')
  assert.throws(() => planObjetoYFiguras({ ...form, companiaAnterior: null }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /compañía anterior/.test(e.message))
  assert.doesNotThrow(() => planObjetoYFiguras({ ...form, aniosAseguradoAnterior: 0, companiaAnterior: null }), 'sin años en otra compañía no se pide')
  assert.ok(!planObjetoYFiguras({ ...form, aniosAseguradoAnterior: 0 }).escribibles.some((o) => o.sel === SEL_HISTORIAL.companiaAnterior))
  // Conductor = tomador: lo dice el riesgo, o (no consta) la misma fecha de nacimiento que el tomador de la ficha.
  assert.throws(() => exigirConductorEsTomador({ ...form, tomadorEsConductor: false }), ErrorMapaIncompleto)
  assert.throws(() => exigirConductorEsTomador({ ...form, tomadorEsConductor: null }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && !/1980/.test(e.message))
  assert.doesNotThrow(() => exigirConductorEsTomador({ ...form, tomadorEsConductor: null, datosTomador: { tipo: 'fisica', nombre: 'N', apellido1: 'A', apellido2: null, fechaNacimiento: '1980-02-03' } }))
  assert.throws(() => exigirConductorEsTomador({ ...form, tomadorEsConductor: null, datosTomador: { tipo: 'fisica', nombre: 'N', apellido1: 'A', apellido2: null, fechaNacimiento: '1990-01-01' } }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  assert.throws(() => exigirConductorEsTomador({ ...form, datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA FICTICIA' } }), ErrorMapaIncompleto)
  assert.match('Válido desde', patronEtiqueta('Valido desde'))
  assert.match('VALIDO  DESDE *', patronEtiqueta('Valido desde'))
})

test('tarificar: un riesgo sin compañía anterior (con años asegurado) para con `datos` ANTES de abrir el portal', async () => {
  let navego = false
  const pagina = { goto: async () => { navego = true; return null } } as unknown as Page
  const ctx = { pulsar: async () => {}, pausa: async () => {}, log: () => {}, pulsarEnlaceEntrada: async () => {}, confirmarVehiculoMapfre: async () => {}, continuarMapfre: async () => {}, cerrarClubMapfre: async () => 'cerrado' } as unknown as ContextoPortal
  await assert.rejects(() => mapfreAuto.tarificar(pagina, { ...form, companiaAnterior: null }, ctx), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /compañía anterior/.test(e.message))
  await assert.rejects(() => mapfreAuto.tarificar(pagina, form, { ...ctx, cerrarClubMapfre: undefined } as ContextoPortal), ErrorMapaIncompleto)
  assert.equal(navego, false)
})

test('historial: «Nº de Póliza» anterior OBLIGATORIO y vacío → `datos` (el riesgo no lo trae); opcional → no se toca; interruptor contrario al riesgo → hueco', async () => {
  const a = await preparar(NSEI({ polizaObligatoria: true }))
  await assert.rejects(() => historialAnterior(a.page, form, undefined), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /póliza de la compañía anterior/.test(e.message))
  await a.context.close()
  const b = await preparar(NSEI())
  await historialAnterior(b.page, form, undefined)
  assert.equal(await b.page.locator(SEL_HISTORIAL.numPoliza).inputValue(), '', 'el nº de póliza no se inventa')
  await b.context.close()
  const c = await preparar(NSEI({ interruptor: false }))
  await assert.rejects(() => historialAnterior(c.page, form, undefined), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom)
  await historialAnterior(c.page, { ...form, aniosAseguradoAnterior: 0, companiaAnterior: null }, undefined)
  await c.context.close()
})

// ───────────────────────── 3 · Club MAPFRE (guard) ─────────────────────────

/** Lleva el trabajo hasta «Continuar» desde Figuras (orden real del guard) en la página NSEI. */
async function hastaCoberturas(page: Page, guard: GuardEmision): Promise<void> {
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  await page.fill('input[name=matricula]', MATRICULA)
  await page.locator('input[name=matricula]').blur()
  await page.locator('app-matricula-dialog').waitFor()
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  await pulsarContinuarMapfre(page, guard, 'figuras')
}

test('Club MAPFRE: se cierra SOLO por el botón IZQUIERDO de texto validado; nunca el de adherirse; una vez y tras calcular', async () => {
  assert.ok(Object.isFrozen(TEXTOS_CIERRE_CLUB_MAPFRE))
  for (const t of TEXTOS_CIERRE_CLUB_MAPFRE) assert.doesNotThrow(() => comprobarBoton([t]), t)
  assert.ok(!TEXTOS_CIERRE_CLUB_MAPFRE.some((t) => /^(SI|ADHERIR|UNIR)|ACEPT|CONTRAT|SALIR/.test(t)), 'ningún texto de adhesión/aceptación/salida')
  assert.ok(TEXTOS_CIERRE_CLUB_MAPFRE.filter((t) => /ADHERIR/.test(t)).every((t) => /\bNO\b|\bSIN\b/.test(t)), 'si nombra la adhesión, es para NO adherirse')
  // Fuera de orden (sin «Continuar» desde Figuras) → bloqueado sin pulsar.
  const a = await preparar(`<body>${CLUB()}</body><script>function cerrarClub(){window.__cerrado=1}</script>`)
  await assert.rejects(() => cerrarClubMapfre(a.page, a.guard), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  assert.equal(await marca(a.page, '__cerrado'), null)
  await a.context.close()
  // En orden: botón izquierdo «No, gracias» → cerrado; el derecho no se toca; la segunda vez, bloqueado.
  const b = await preparar(NSEI())
  await hastaCoberturas(b.page, b.guard)
  await b.page.locator('app-club-mapfre').waitFor()
  assert.equal(await cerrarClubMapfre(b.page, b.guard), 'cerrado')
  assert.equal(await marca(b.page, '__adherido'), null)
  assert.equal(await b.page.locator('app-club-mapfre').count(), 0)
  await assert.rejects(() => cerrarClubMapfre(b.page, b.guard), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  await b.context.close()
  // Texto izquierdo NO validado → hueco con inventario (texto redactado), sin pulsar nada.
  const c = await preparar(NSEI({ club: 'Ver ventajas del club' }))
  await hastaCoberturas(c.page, c.guard)
  await c.page.locator('app-club-mapfre').waitFor()
  await assert.rejects(() => cerrarClubMapfre(c.page, c.guard), (e) => e instanceof ErrorMapaGuardMapfre && /sin validar/.test(e.message))
  assert.equal(await c.page.locator('app-club-mapfre').count(), 1)
  assert.equal(await marca(c.page, '__adherido'), null)
  await c.context.close()
})

// ───────────────────────── 4 · Coberturas: prima y PARADA ─────────────────────────

test('«Ir a generar» y «Generar Proyecto» están BLOQUEADOS en el guard común (también por `pulsar`): el bot no pasa de Coberturas', async () => {
  for (const t of ['Ir a generar', 'Generar Proyecto', 'GENERAR PROYECTO']) assert.throws(() => comprobarBoton([t]), EmisionBloqueadaError, t)
  const { context, page, guard } = await preparar(NSEI())
  await assert.rejects(() => pulsar(page.locator('#irGenerar'), guard), EmisionBloqueadaError)
  await assert.rejects(() => pulsar(page.getByRole('button', { name: 'Generar Proyecto' }), guard), EmisionBloqueadaError)
  assert.equal(await marca(page, '__generar'), null)
  assert.equal(await marca(page, '__proyecto'), null)
  await context.close()
})

test('E2E fixture: matrícula → fila por regla → CP/uso/ámbito → licencia (B, Valido desde) → compañía anterior → Club MAPFRE → PRIMA leída y PARA', async () => {
  const { context, page, guard } = await preparar(NSEI({ filas: [[MATRICULA, 'MARCA PRUEBA MODELO X 1.6'], [MATRICULA, 'MARCA PRUEBA MODELO Y 2.0']] }))
  const ctx = ctxReal(page, guard)
  await ctx.continuarMapfre!(page, 'datosBasicos')
  const f = { ...form, seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO Y' } }
  const veh = await consultarVehiculoPorMatricula(page, MATRICULA, ctx, 3_000, undefined, f)
  assert.equal(veh.denominacion, 'MARCA PRUEBA MODELO Y 2.0')
  assert.equal(await marca(page, '__fila'), 1, 'la fila que casa con marca y modelo del riesgo')
  const r = await precioDesdeObjetoAsegurado(page, f, veh, ctx, 8_000)
  assert.deepEqual(r.ofertas.map((o) => [o.producto, o.primaAnualEur]), [['Auto · PRODUCTO UNO', 1234.56], ['Auto · PRODUCTO DOS', 987.65]])
  assert.equal(await page.locator('input[name=cpCirculacion]').inputValue(), '00001')
  assert.equal(await page.locator('mat-select[formcontrolname=uso] .v').textContent(), 'Particular')
  assert.equal(await page.locator('mat-select[formcontrolname=ambitoCirculacion] .v').textContent(), 'España')
  assert.equal(await page.locator('datos-licencia mat-select .v').textContent(), 'B')
  assert.equal(await page.locator('#fechaCarne').inputValue(), '07/06/2005', '«Valido desde» por la etiqueta del portal, dd/mm/aaaa')
  assert.match((await page.locator('mat-select[formcontrolname=companiaAnterior] .v').textContent()) ?? '', /^ASEGURADORA FICTICIA GENERALES, S\.A\./)
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '0')
  assert.equal(await marca(page, '__continuar'), 3, 'tres «Continuar» (1→2→3→Coberturas) y ninguno más')
  assert.equal(await marca(page, '__adherido'), null, 'no se adhiere al Club')
  assert.equal(await marca(page, '__generar'), null, 'no pulsa «Ir a generar»')
  assert.equal(await marca(page, '__proyecto'), null, 'no pulsa «Generar Proyecto»')
  assert.match((await page.locator('mat-step-header[aria-selected="true"]').textContent()) ?? '', /Coberturas/)
  await context.close()
})

test('v0.8.3 (trabajo real 39c8016e): CP de circulación con validación ASÍNCRONA al salir del campo → el bot sale del campo y ESPERA a que se asiente antes de «Continuar»; llega a Figuras y a precio', async () => {
  const { context, page, guard } = await preparar(NSEI({ cpAsincrono: true }))
  const ctx = ctxReal(page, guard)
  await ctx.continuarMapfre!(page, 'datosBasicos')
  const veh = await consultarVehiculoPorMatricula(page, MATRICULA, ctx, 3_000, undefined, form)
  const r = await precioDesdeObjetoAsegurado(page, form, veh, ctx, 8_000)
  assert.equal(r.ofertas.length, 2)
  assert.equal(await marca(page, '__cpValido'), '00001', 'Mapfre validó el CP (blur + espera) antes de «Continuar»')
  assert.equal(await page.locator('#ffCp mat-error').count(), 0, 'sin error en el CP')
  assert.equal(await marca(page, '__continuar'), 3)
  await context.close()
})

test('v0.8.3: si tras «Continuar» desde «Objeto asegurado» no se llega a Figuras y hay `mat-error` visibles, el hueco NOMBRA los campos (etiquetas, sin valores)', async () => {
  const { context, page, guard } = await preparar(NSEI({ errorEn: 'matriculacion', sinUsoAmbito: true }))
  const ctx = ctxReal(page, guard)
  await ctx.continuarMapfre!(page, 'datosBasicos')
  const veh = await consultarVehiculoPorMatricula(page, MATRICULA, ctx, 3_000, undefined, form)
  await assert.rejects(
    () => precioDesdeObjetoAsegurado(page, form, veh, ctx, 8_000),
    (e: Error) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /Figuras/.test(e.message) && /«1ª Matriculación»/.test(e.message) && !/CP\. De Circulaci/.test(e.message) && !e.message.includes('00001') && !e.message.includes(MATRICULA),
  )
  await context.close()
})

test('Coberturas sin prima legible tras la espera → ATASCO/hueco con el texto visible REDACTADO (nunca 0 ni lista vacía)', async () => {
  const { context, page, guard } = await preparar(NSEI({ club: null, primas: '<p>Error al calcular la tarifa. Llame al 600123123 o escriba a persona@ejemplo.com</p>' + TARJETA('PRODUCTO UNO', 'PRIMA TOTAL: {{primaTotal}}') }))
  await hastaCoberturas(page, guard)
  const t0 = Date.now()
  await assert.rejects(
    () => esperarPrimasMapfre(page, { cerrarClubMapfre: (p: Page) => cerrarClubMapfre(p, guard), formador: undefined }, 1_500),
    (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /prima anual/.test(e.message) && /Error al calcular la tarifa/.test(e.message) && !/600123123|persona@ejemplo/.test(e.message),
  )
  assert.ok(Date.now() - t0 >= 1_400, 'espera de verdad antes de rendirse')
  await context.close()
})

// ───────────────────────── 5 · frontera de cuenta bancaria con el stepper entero en el DOM (prueba real f46682c2) ─────────────────────────
// Los 6 pasos de NSEI viven a la vez en el DOM: el IBAN de «Contratación» existe aunque el paso activo sea el 1. Fixture al estilo
// Angular Material (`role=tabpanel` + `aria-expanded`, el inactivo con `visibility: hidden`). Ningún valor real.
const PANEL = (activo: boolean, contenido: string, estilo = activo ? '' : 'height:0;overflow:hidden;visibility:hidden') =>
  `<div role="tabpanel" aria-expanded="${activo}" style="${estilo}">${contenido}</div>`
const STEPPER_IBAN = (o: { ibanEnActivo?: boolean; estiloInactivo?: string; fondoAriaHidden?: boolean } = {}) => `<body>
<div ${o.fondoAriaHidden ? 'aria-hidden="true"' : ''}>
<mat-horizontal-stepper>${PASOS.map((p, i) => `<mat-step-header role="tab" aria-selected="${i === 0}">${i + 1} ${p}</mat-step-header>`).join('')}</mat-horizontal-stepper>
${PANEL(true, `<app-datos-basicos><input name="codigoDocumento">${o.ibanEnActivo ? '<label for="ib">IBAN</label><input id="ib" name="iban">' : ''}</app-datos-basicos>`)}
${PANEL(false, '<label for="ib6">IBAN</label><input id="ib6" name="iban" formcontrolname="iban">', o.estiloInactivo)}
<div class="btn-panel"><div class="right"><button id="cont" onclick="window.__continuar=1;const h=[...document.querySelectorAll('mat-step-header')];h[0].setAttribute('aria-selected','false');h[1].setAttribute('aria-selected','true')">Continuar</button></div></div>
</div></body>`

test('frontera IBAN: el IBAN del paso «Contratación» NO activo (visibility:hidden) no bloquea; «Continuar» del paso 1 pasa', async () => {
  // (a1) inactivo con visibility:hidden (como Material).
  const { context, page, guard } = await preparar(STEPPER_IBAN())
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  assert.equal(await marca(page, '__continuar'), 1)
  await context.close()
  // (a2) panel marcado inactivo (`aria-expanded=false`) pero con el IBAN `visibility:visible` y con caja: SÍ bloquea (fail-closed).
  const a2 = await preparar(STEPPER_IBAN({ estiloInactivo: 'height:0;overflow:hidden;visibility:visible' }))
  await assert.rejects(() => exigirSinCuentaBancaria(a2.page), ErrorFronteraEmision)
  await assert.rejects(() => pulsarContinuarMapfre(a2.page, a2.guard, 'datosBasicos'), ErrorFronteraEmision)
  assert.equal(await marca(a2.page, '__continuar'), null)
  await a2.context.close()
  // (a3) solo `visibility:hidden`, fuera de cualquier tabpanel (panel de expansión cerrado, etc.).
  const c = await preparar('<body><div style="visibility:hidden"><label for="x">IBAN</label><input id="x" name="iban"></div></body>')
  await exigirSinCuentaBancaria(c.page)
  await c.context.close()
})

test('frontera IBAN: un IBAN VISIBLE en el paso activo SIGUE parando (también con el fondo `aria-hidden` de un diálogo), sin pulsar', async () => {
  for (const fondoAriaHidden of [false, true]) {
    const { context, page, guard } = await preparar(STEPPER_IBAN({ ibanEnActivo: true, fondoAriaHidden }))
    await assert.rejects(() => exigirSinCuentaBancaria(page), ErrorFronteraEmision)
    await assert.rejects(() => pulsarContinuarMapfre(page, guard, 'datosBasicos'), ErrorFronteraEmision)
    assert.equal(await marca(page, '__continuar'), null)
    await context.close()
  }
})

test('mat-select (capa común): la coma de las compañías («…, S.A.») no rompe la coincidencia por palabras; dos que casan siguen siendo ambiguas', () => {
  assert.deepEqual(coincidenciaOpcion(['OTRA ASEGURADORA FICTICIA, S.A.', 'ASEGURADORA FICTICIA GENERALES, S.A. DE SEGUROS'], ['ASEGURADORA FICTICIA GENERALES']), { indice: 1 })
  assert.deepEqual(coincidenciaOpcion(['ASEGURADORA FICTICIA, S.A.', 'ASEGURADORA FICTICIA VIDA, S.A.'], ['ASEGURADORA FICTICIA']), { indice: null, motivo: 'ambigua' })
})

test('Coberturas: el Club MAPFRE sin la función guardada → hueco, sin pulsar; prima que llega TARDE se espera', async () => {
  const a = await preparar(NSEI())
  await hastaCoberturas(a.page, a.guard)
  await a.page.locator('app-club-mapfre').waitFor()
  await assert.rejects(() => esperarPrimasMapfre(a.page, { formador: undefined }, 1_000), (e) => e instanceof ErrorMapaIncompleto && /Club MAPFRE/.test(e.message))
  assert.equal(await a.page.locator('app-club-mapfre').count(), 1)
  await a.context.close()
  const b = await preparar(NSEI({ club: null }))
  await hastaCoberturas(b.page, b.guard)
  const primas = await esperarPrimasMapfre(b.page, { formador: undefined }, 5_000)
  assert.deepEqual(primas.map((p) => p.primaTotalEur), [1234.56, 987.65])
  await b.context.close()
})

// ───────────────────────── 5 · «Generar Proyecto» (v0.8.14, 22/10/2026, autorizado por Alberto) ─────────────────────────

test('nº de proyecto: solo el NUEVO tras el clic, con etiqueta, y nunca con forma de NIF/teléfono/IBAN', () => {
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyectos\nNº Proyecto: 9876543210\nIdioma'), '9876543210')
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto nº 2026/000123 generado'), '2026/000123')
  assert.equal(numeroProyectoMapfreNuevo('', 'Se ha generado el proyecto 1234567890'), '1234567890')
  assert.equal(numeroProyectoMapfreNuevo('Nº Proyecto: 1111111', 'Nº Proyecto: 1111111'), null, 'el que ya estaba no vale')
  assert.equal(numeroProyectoMapfreNuevo('Nº Proyecto: 1111111', 'Nº Proyecto: 1111111. Nº Proyecto: 2222222'), '2222222')
  assert.equal(numeroProyectoMapfreNuevo('', 'Nº proyecto: 00000000T'), null, 'forma de NIF')
  assert.equal(numeroProyectoMapfreNuevo('', 'Nº proyecto: 612345678'), null, 'forma de móvil')
  assert.equal(numeroProyectoMapfreNuevo('', 'PRIMA TOTAL: 1.234,56 €'), null)
})

test('botón: solo «Generar Proyecto» EXACTO; «Ir a generar» o mezclado con emitir/contratar/firmar/pagar, NO', () => {
  for (const t of ['Generar Proyecto', ' GENERAR  PROYECTO ', 'Generar proyecto']) assert.equal(esBotonGenerarProyectoMapfre([t]), true, t)
  for (const t of ['Ir a generar', 'Ir a generar proyecto', 'Generar Proyecto y contratar', 'Generar proyecto y emitir', 'Generar proyecto y firmar', 'Generar proyecto y pagar', 'Contratar', 'Grabar póliza']) assert.equal(esBotonGenerarProyectoMapfre([t]), false, t)
  assert.equal(esBotonGenerarProyectoMapfre(['Generar Proyecto', null, null, null, 'btnContratar']), false, 'un id de contratar tumba el texto bueno')
})

test('ofertas: generado → referenciaPortal en TODAS + aviso; sin nº / no generado → solo aviso legible (precio intacto)', () => {
  const o = (p: string, prima: number) => ({ compania: 'mapfre', producto: p, primaAnualEur: prima, avisos: ['a'], referenciaPortal: null }) as unknown as import('@central/module-tarificacion').OfertaNormalizada
  const g = ofertasConProyectoMapfre([o('Auto · UNO', 100), o('Auto · DOS', 200)], { estado: 'generado', numero: '9876543210' })
  assert.deepEqual(g.map((x) => x.referenciaPortal), ['9876543210', '9876543210'])
  assert.ok(g.every((x) => x.avisos.at(-1) === `${AVISO_PROYECTO_MAPFRE}: nº 9876543210.`))
  const s = ofertasConProyectoMapfre([o('Auto · UNO', 100)], { estado: 'sin_numero', motivo: 'no se leyó el nº de proyecto en 45 s' })
  assert.equal(s[0]!.referenciaPortal, null)
  assert.match(s[0]!.avisos.at(-1)!, /^Se pulsó «Generar Proyecto» en Mapfre/)
  const n = ofertasConProyectoMapfre([o('Auto · UNO', 100)], { estado: 'no_generado', motivo: 'no aparece el botón «Generar Proyecto» en «Coberturas»' })
  assert.equal(n[0]!.referenciaPortal, null)
  assert.equal(n[0]!.primaAnualEur, 100)
  assert.match(n[0]!.avisos.at(-1)!, /^Proyecto NO guardado en Mapfre: no aparece el botón/)
})

test('E2E fixture: prima leída → «Generar Proyecto» UNA vez → nº de proyecto en referenciaPortal; «Ir a generar» intacto', async () => {
  const { context, page, guard } = await prepararHttps(NSEI({ club: null }))
  const ctx = { ...ctxReal(page, guard), generarProyectoMapfre: (pg: Page) => generarProyectoMapfre(pg, guard, 4_000) }
  await ctx.continuarMapfre!(page, 'datosBasicos')
  const veh = await consultarVehiculoPorMatricula(page, MATRICULA, ctx, 3_000, undefined, form)
  const r = await precioDesdeObjetoAsegurado(page, form, veh, ctx, 8_000)
  assert.deepEqual(r.ofertas.map((o) => [o.primaAnualEur, o.referenciaPortal]), [[1234.56, '9876543210'], [987.65, '9876543210']])
  assert.equal(await marca(page, '__proyecto'), 1, 'un solo clic')
  assert.equal(await marca(page, '__generar'), null, 'no pulsa «Ir a generar»')
  assert.equal((await generarProyectoMapfre(page, guard, 500)).estado, 'no_generado', 'una vez por trabajo')
  await context.close()
})

test('«Generar Proyecto» SIN nº legible o con diálogo de PAGO → precio intacto + aviso; el diálogo no se toca', async () => {
  for (const [tras, re] of [['mudo', /no se leyó el nº de proyecto/], ['dialogoPago', /diálogo que menciona «pag/]] as const) {
    const { context, page, guard } = await prepararHttps(NSEI({ club: null, proyecto: { tras } }))
    await hastaCoberturas(page, guard)
    await esperarPrimasMapfre(page, { cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard), formador: undefined }, 5_000)
    const r = await generarProyectoMapfre(page, guard, 1_500)
    assert.equal(r.estado, 'sin_numero', tras)
    if (r.estado === 'sin_numero') assert.match(r.motivo, re)
    assert.equal(await marca(page, '__pagado'), null, 'no acepta el diálogo de pago')
    await context.close()
  }
})

test('v0.8.15 · el botón vive en el PIE del paso (fuera de `app-coberturas`), con icono, solo-icono, enlace o se pinta TARDE → se pulsa UNA vez y se lee el nº', async () => {
  for (const donde of ['pie', 'icono', 'aria', 'enlace', 'tarde'] as const) {
    const { context, page, guard } = await prepararHttps(NSEI({ club: null, proyecto: { donde } }))
    await hastaCoberturas(page, guard)
    await esperarPrimasMapfre(page, { cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard), formador: undefined }, 5_000)
    const r = await generarProyectoMapfre(page, guard, 4_000, 3_000)
    assert.deepEqual(r, { estado: 'generado', numero: '9876543210' }, donde)
    assert.equal(await marca(page, '__proyecto'), 1, `${donde}: un solo clic`)
    assert.equal(await marca(page, '__generar'), null, `${donde}: no pulsa «Ir a generar»`)
    await context.close()
  }
})

test('v0.8.15 · botón ausente u OCULTO → no se pulsa; el motivo lista los botones/enlaces a la vista (sin «Generar Proyecto» ni datos personales)', async () => {
  for (const [donde, re] of [['ninguno', /^no aparece el botón «Generar Proyecto» en «Coberturas»; controles a la vista: .*«Ir a generar».*«Continuar»/], ['oculto', /\(hay 1 con ese texto pero OCULTO: puede estar plegado\); controles a la vista: /]] as const) {
    const { context, page, guard } = await prepararHttps(NSEI({ club: null, proyecto: { donde } }))
    await hastaCoberturas(page, guard)
    await esperarPrimasMapfre(page, { cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard), formador: undefined }, 5_000)
    const r = await generarProyectoMapfre(page, guard, 500, 1_200)
    assert.equal(r.estado, 'no_generado', donde)
    if (r.estado === 'no_generado') assert.match(r.motivo, re, donde)
    assert.equal(await marca(page, '__proyecto'), null, `${donde}: no se pulsa nada`)
    await context.close()
  }
})

test('v0.8.15 · lista de controles: etiquetas saneadas (≤10, ≤40, sin cifras largas/@/teléfonos/nombres), únicas y las interesantes primero (PURA)', () => {
  const crudas = ['Continuar', 'continuar', 'Volver', 'JUAN PEREZ LOPEZ', 'Maria Garcia', 'correo@dominio.es', 'Ref 1234567', '612 345 678', 'x'.repeat(41), '', null, undefined, 'Guardar Proyecto', 'Ir a generar', 'Descargar PDF', ...Array.from({ length: 15 }, (_, i) => `Opción extra ${String.fromCharCode(65 + i)}`)]
  const out = etiquetasControlesSaneadas(crudas)
  assert.equal(out.length, 10)
  assert.deepEqual(out.slice(0, 3), ['Guardar Proyecto', 'Ir a generar', 'Descargar PDF'].filter((t) => /guard|generar|descarg/i.test(t)))
  assert.ok(out.includes('Continuar') && out.includes('Volver'))
  assert.equal(out.filter((t) => /^continuar$/i.test(t)).length, 1, 'sin duplicados')
  for (const t of out) assert.ok(t.length <= 40 && !/\d{5,}|@/.test(t) && !/JUAN|Maria Garcia/.test(t), t)
  assert.equal(sufijoControlesVisibles([]), '')
  assert.equal(sufijoControlesVisibles(['A', 'B']), '; controles a la vista: «A», «B»')
})

test('v0.8.15 · decisión del botón (PURA): texto exacto, varios → el de Coberturas, deshabilitado/oculto → espera, «Ir a generar» nunca', () => {
  const c = (etiqueta: string, o: Partial<ControlProyectoMapfre> = {}): ControlProyectoMapfre => ({ etiqueta, visible: true, habilitado: true, enCoberturas: false, ...o })
  assert.deepEqual(decidirBotonGenerarProyectoMapfre([c('Continuar'), c('GENERAR  proyecto')]), { indice: 1 })
  assert.deepEqual(decidirBotonGenerarProyectoMapfre([c('Generar Proyecto'), c('Generar Proyecto', { enCoberturas: true })]), { indice: 1 })
  assert.match((decidirBotonGenerarProyectoMapfre([c('Generar Proyecto'), c('Generar Proyecto')]) as { motivo: string }).motivo, /ambiguo/)
  for (const falsos of ['Ir a generar', 'Ir a generar proyecto', 'Generar Proyecto y contratar', 'Guardar proyecto', '']) {
    const d = decidirBotonGenerarProyectoMapfre([c(falsos)])
    assert.ok('motivo' in d && /^no aparece el botón/.test(d.motivo), falsos)
  }
  const oc = decidirBotonGenerarProyectoMapfre([c('Generar Proyecto', { visible: false })])
  assert.ok('motivo' in oc && /OCULTO/.test(oc.motivo) && !oc.definitivo)
  const des = decidirBotonGenerarProyectoMapfre([c('Generar Proyecto', { habilitado: false })])
  assert.ok('motivo' in des && /deshabilitado/.test(des.motivo) && !des.definitivo)
  assert.equal(etiquetaEfectivaControl({ texto: ' ', aria: 'Generar proyecto', title: 'otro' }), 'Generar proyecto')
  assert.equal(etiquetaEfectivaControl({ texto: 'Texto', aria: 'aria' }), 'Texto')
  // la etiqueta sin iconos entra en la guardia, y un id de contratar sigue tumbándola
  assert.equal(esBotonGenerarProyectoMapfre(descripcionGenerarProyecto(['description Generar Proyecto', null, null, null], 'Generar Proyecto')), true)
  assert.equal(esBotonGenerarProyectoMapfre(descripcionGenerarProyecto(['', 'Generar Proyecto', null, null], '')), true)
  assert.equal(esBotonGenerarProyectoMapfre(descripcionGenerarProyecto(['Generar Proyecto', null, null, null, 'btnContratar'], 'Generar Proyecto')), false)
  assert.equal(esBotonGenerarProyectoMapfre(descripcionGenerarProyecto(['x', null, null, null], 'Ir a generar')), false)
})

test('botón «Generar Proyecto y contratar» o ausente → NO se pulsa; motivo legible', async () => {
  for (const [texto, re] of [['Generar Proyecto y contratar', /no aparece el botón «Generar Proyecto»/]] as const) {
    const { context, page, guard } = await prepararHttps(NSEI({ club: null, proyecto: { texto } }))
    await hastaCoberturas(page, guard)
    await esperarPrimasMapfre(page, { cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard), formador: undefined }, 5_000)
    const r = await generarProyectoMapfre(page, guard, 500)
    assert.equal(r.estado, 'no_generado')
    if (r.estado === 'no_generado') assert.match(r.motivo, re)
    assert.equal(await marca(page, '__proyecto'), null)
    await context.close()
  }
})

test('nº de proyecto: una FECHA nunca es nº de proyecto (revisión 22/10/2026)', () => {
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto 22/10/2026 generado'), null)
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto: 1-2-26'), null)
  assert.equal(numeroProyectoMapfreNuevo('', 'Nº proyecto: 22.10.2026'), null)
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto 22/10/2026 · Nº Proyecto: 9876543210'), '9876543210')
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto nº 2026/000123 generado'), '2026/000123', 'una referencia con barra que NO es fecha sigue valiendo')
})

test('«Generar Proyecto»: la vía Mapfre usa SOLO la opción estrecha (no `permitirGuardarPresupuesto`, que la sigue bloqueando)', () => {
  assert.throws(() => comprobarBoton(['Generar Proyecto'], { permitirGuardarPresupuesto: true }), EmisionBloqueadaError)
  assert.doesNotThrow(() => comprobarBoton(['Generar Proyecto'], { permitirGenerarProyectoMapfre: true }))
  assert.equal(esBotonGenerarProyectoMapfre(['Generar Proyecto']), true)
})

test('«Generar Proyecto»: un error BENIGNO del portal antes del clic (desconexión al contar botones) → `no_generado` y precio intacto, sin pulsar', async () => {
  const { context, page, guard } = await prepararHttps(NSEI({ club: null }))
  await hastaCoberturas(page, guard)
  await esperarPrimasMapfre(page, { cerrarClubMapfre: (pg: Page) => cerrarClubMapfre(pg, guard), formador: undefined }, 5_000)
  // v0.8.15: el escáner de botones lee con `page.evaluate`; solo ESA lectura «se desconecta»: el resto de la página responde.
  const original = page.evaluate.bind(page)
  ;(page as unknown as { evaluate: unknown }).evaluate = () => Promise.reject(new Error('Target page, context or browser has been closed'))
  const r = await generarProyectoMapfre(page, guard, 500)
  ;(page as unknown as { evaluate: unknown }).evaluate = original
  assert.equal(r.estado, 'no_generado')
  assert.equal(await marca(page, '__proyecto'), null)
  // La ofertas conservan su prima (el aviso es legible, no un error del trabajo).
  const o = { compania: 'mapfre', producto: 'Auto · UNO', primaAnualEur: 1234.56, avisos: [], referenciaPortal: null } as unknown as import('@central/module-tarificacion').OfertaNormalizada
  assert.equal(ofertasConProyectoMapfre([o], r)[0]!.primaAnualEur, 1234.56)
  await context.close()
})

test('«Generar Proyecto»: una violación REAL del guard SÍ se relanza (fail-closed)', async () => {
  const { context, page, guard } = await prepararHttps(NSEI({ club: null }))
  await hastaCoberturas(page, guard)
  await page.evaluate(() => fetch('https://otro.ejemplo.test/emitirPoliza', { method: 'POST', body: 'x=1' }).catch(() => null))
  await assert.rejects(() => generarProyectoMapfre(page, guard, 500), EmisionBloqueadaError)
  assert.equal(await marca(page, '__proyecto'), null)
  await context.close()
})
