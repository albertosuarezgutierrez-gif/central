// Allianz HOGAR (14/10/2026): pantalla 1 «Vivienda» con la estructura de las exploraciones IA; lo que sigue es hueco.
// Portal SINTÉTICO (Angular de mentira, mismos `formcontrolname`/ids/etiquetas que el inventario real, sin valores reales)
// servido con `context.route`: ni red ni datos personales. El DNI 00000000T es sintético (letra de control válida).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { EmisionBloqueadaError, type FormularioHogar } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'
import { SELECTOR_ACCIONES, describirElemento, extraerCandidatos, prepararFormador, type ContextoFormador } from '../src/formador.ts'
import { pideInventarioDom } from '../src/errores.ts'
import { OPCIONES_RIESGO_HOGAR_ALLIANZ, etiquetaOpcionHogarCasa, instalarGuardEmision, marcarOpcionResueltaHogarAllianz, marcarOpcionRiesgoHogarAllianz, pulsar } from '../src/guard.ts'
import { prepararTrabajo } from '../src/ramo.ts'
import { adaptadores } from '../src/adapters/index.ts'
import {
  ALLIANZ_HOGAR_ACTIVO,
  ErrorMapaIncompleto,
  allianzHogar,
  avanzarDesdeVivienda,
  esAppHogar,
  ETIQUETAS_MADERA,
  ETIQUETAS_REGIMEN,
  ETIQUETAS_TIPO_VIVIENDA,
  ETIQUETAS_USO,
  fechaPortal,
  huecoTrasVivienda,
  marcoHogar,
  ofertasDesdePrecios,
  pasoActual,
  planPantallaVivienda,
  primaDeTexto,
  rellenarPantallaVivienda,
  tipoDocumentoCasa,
  valorQuedo,
  viaCoincide,
} from '../src/adapters/allianz/hogar.ts'

const HOY = new Date('2026-10-14T10:00:00Z')
const FORM: FormularioHogar = {
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-15' },
  inmueble: { codigoPostal: '41001', municipio: 'SEVILLA', nombreVia: 'PRUEBA', numero: '1', bloque: null, escalera: null, planta: '2', puerta: null, anioConstruccion: 1990, anioReforma: null, superficieM2: 90 },
  hogar: { uso: 'secundaria', regimen: 'inquilino', tipoVivienda: 'atico', conMadera: false, capitalContinenteEur: null, capitalContenidoEur: null },
}

// ───────────── puros ─────────────

test('flag ENCENDIDO (Alberto, 21/10/2026) y registrado', () => {
  assert.equal(ALLIANZ_HOGAR_ACTIVO, true)
  assert.equal(adaptadores.obtener('allianz', 'hogar')?.version, allianzHogar.version)
})

test('esAppHogar: origen exacto y ruta de la app vista', () => {
  assert.equal(esAppHogar('https://cloud.e-pacallianz.com/ngx-allianzhogar2053/'), true)
  assert.equal(esAppHogar('https://cloud.e-pacallianz.com/ngx-allianzhogar2054/paso'), true)
  assert.equal(esAppHogar('https://cloud.e-pacallianz.com/ngx-motor-azs/'), false)
  assert.equal(esAppHogar('https://cloud.e-pacallianz.com.evil.com/ngx-allianzhogar2053/'), false)
  assert.equal(esAppHogar('no es url'), false)
})

test('etiquetaOpcionHogarCasa: exacta (salvo mayúsculas/tildes/espacios) o duplicada del toggle; nunca «contiene»', () => {
  assert.equal(etiquetaOpcionHogarCasa('Propietario Propietario', 'Propietario'), true)
  assert.equal(etiquetaOpcionHogarCasa(' turistico  o VACACIONAL ', 'Turístico o vacacional'), true)
  assert.equal(etiquetaOpcionHogarCasa('Alquiler turístico', 'Alquiler'), false)
  assert.equal(etiquetaOpcionHogarCasa('Unifamiliar Adosada / Pareada', 'Unifamiliar Independiente'), false)
  assert.equal(etiquetaOpcionHogarCasa('', ''), false)
})

test('tipoDocumentoCasa: DNI con «NIF»/«DNI», NIE solo con «NIE»; otra cosa → no', () => {
  assert.equal(tipoDocumentoCasa('NIF', '00000000T'), true)
  assert.equal(tipoDocumentoCasa(' nif / dni ', '00000000T'), true)
  assert.equal(tipoDocumentoCasa('NIE', '00000000T'), false)
  assert.equal(tipoDocumentoCasa('NIE', 'X0000000T'), true)
  assert.equal(tipoDocumentoCasa('Pasaporte', '00000000T'), false)
  assert.equal(tipoDocumentoCasa('', '00000000T'), false)
})

test('pasoActual: el seleccionado si hay uno; si no, el último habilitado; texto desconocido → null', () => {
  const p = (texto: string, deshabilitado: boolean, seleccionado: boolean | null = null) => ({ texto, deshabilitado, seleccionado })
  assert.equal(pasoActual([p('Vivienda', false), p('Valoración de bienes', true), p('Precio', true)]), 'Vivienda')
  assert.equal(pasoActual([p('Vivienda', false), p('Valoración de bienes', false), p('Precio', true)]), 'Valoración de bienes')
  assert.equal(pasoActual([p('Vivienda', false, false), p('Valoración de bienes', false, false), p('Precio', false, true)]), 'Precio')
  assert.equal(pasoActual([p('Vivienda', false), p('Otra cosa', false)]), null)
  assert.equal(pasoActual([]), null)
})

test('todas las etiquetas del adaptador están en la lista cerrada de guard.ts (y nada más que esas)', () => {
  const del = [...Object.values(ETIQUETAS_MADERA), ...Object.values(ETIQUETAS_TIPO_VIVIENDA), ...Object.values(ETIQUETAS_REGIMEN), ...Object.values(ETIQUETAS_USO)]
  assert.deepEqual([...del].sort(), [...OPCIONES_RIESGO_HOGAR_ALLIANZ].sort())
})

test('plan de la pantalla 1: opciones SIEMPRE (también la de serie) y año/m² los ÚLTIMOS', () => {
  const ops = planPantallaVivienda(FORM)
  const opciones = ops.filter((o) => o.tipo === 'opcion').map((o) => (o.tipo === 'opcion' ? o.etiqueta : ''))
  assert.deepEqual(opciones, ['Sin madera', 'Ático', 'Inquilino', 'Secundaria'])
  const escritos = ops.filter((o) => o.tipo === 'escribir').map((o) => (o.tipo === 'escribir' ? o.control : ''))
  assert.deepEqual(escritos.slice(-2), ['yearOfConstruction', 'surfaceAreaLiving'])
  assert.ok(!escritos.includes('block') && !escritos.includes('yearOfRefurbishment'), 'lo que no consta no se escribe')
  const fecha = ops.find((o) => o.tipo === 'escribir' && o.control === 'dateOfBirth')
  assert.equal(fecha?.tipo === 'escribir' ? fecha.valor : null, '15/01/1980')
})

test('valorQuedo / fechaPortal / primaDeTexto / ofertasDesdePrecios', () => {
  assert.equal(valorQuedo('90', '90'), true)
  assert.equal(valorQuedo('15/01/1980', '15/01/1980'), true)
  assert.equal(valorQuedo('90', ''), false)
  assert.equal(valorQuedo('90', null), false)
  assert.equal(fechaPortal('1980-01-15'), '15/01/1980')
  assert.throws(() => fechaPortal('15/01/1980'))
  assert.equal(primaDeTexto('1.234,56 €'), 1234.56)
  assert.equal(primaDeTexto('0,00 €'), null)
  const o = ofertasDesdePrecios([{ modalidad: 'Básica', primaAnualEur: 210.005 }, { modalidad: 'X', primaAnualEur: 0 }], null)
  assert.equal(o.length, 1)
  assert.equal(o[0].compania, 'allianz')
  assert.equal(o[0].primaAnualEur, 210.01)
})

test('huecoTrasVivienda: siempre ErrorMapaIncompleto que pide inventario (Valoración de bienes y Precio sin explorar)', () => {
  for (const paso of ['Valoración de bienes', 'Precio'] as const) {
    assert.throws(() => huecoTrasVivienda(paso), (e) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /allianz\/hogar: mapa incompleto/.test((e as Error).message))
  }
})

test('prepararTrabajo con un adaptador de hogar: valida con validarFormularioHogar y llega tipado', async () => {
  const llamadas: FormularioHogar[] = []
  const a = { ...allianzHogar, async tarificar(_p: Page, f: FormularioHogar) { llamadas.push(f); return { ofertas: [] } } }
  const ok = prepararTrabajo(a, FORM, HOY)
  assert.equal(ok.ok, true)
  if (ok.ok) await ok.tarificar({} as Page, {} as ContextoPortal)
  assert.equal(llamadas.length, 1)
  const malo = prepararTrabajo(a, { ...FORM, hogar: { ...FORM.hogar, uso: undefined } }, HOY)
  assert.equal(malo.ok, false)
  assert.equal(prepararTrabajo(a, { ramo: 'moto' }, HOY).ok, false)
  assert.equal(llamadas.length, 1, 'un riesgo inválido no llega al adaptador')
})

// ───────────── navegador (portal sintético) ─────────────

const CARCASA = `<!doctype html><html><body><h1>ePac</h1><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-allianzhogar2053/"></iframe></body></html>`

type OpcionesApp = {
  tipoDoc?: string
  poblaciones?: string
  sinAutocompletar?: boolean
  anioSiempreInvalido?: boolean
  pasoInicial?: string
  /** El nombre de la vía NO rellena el tipo de vía (hace falta elegir en la lista). */
  sinVia?: boolean
  /** Lista desplegada de `mat-option` (como la del portal): al pulsar una, rellena la población o la vía elegida. */
  lista?: { para: 'poblacion' | 'via'; textos: string[] }
  /** La lista de poblaciones solo se muestra al enfocar `town` (como el desplegable real). */
  listaAlEnfocar?: boolean
  /** Forma real NDBX (21/10/2026): `town` NO abre nada con foco/flecha/clic; el panel (`nx-autocomplete-option` en un overlay, con `aria-controls` en `town`) aparece al ESCRIBIR y filtra por lo escrito. */
  overlayAlEscribir?: string[]
  /** Una casilla (checkbox) con su `label for` y un `label` que envuelve otra. */
  casilla?: boolean
  /**
   * Copias OCULTAS y `disabled` de los controles de dirección (pasos posteriores), como en el HTML del atasco del job 1bd6bfce
   * (21/10/2026: tres `town`/`postalCode` en el DOM). Por defecto SÍ: todo el banco corre con ellas. `false` = sin copias.
   */
  duplicadosOcultos?: boolean
  /** Un segundo `town` VISIBLE y habilitado (ambigüedad real: el robot no debe elegir cuál). */
  townVisibleDuplicado?: boolean
  /** 0.1.5: `#buildingInformation` (año, reforma, m²) con `hidden` hasta pulsar «Comprobar»; `'nunca'` = no se destapa; `'overlay'` = no se destapa y aparece un diálogo. */
  infoOculta?: boolean | 'nunca' | 'overlay'
  /**
   * 0.1.7 (HTML del atasco del 22/10/2026): tras «Comprobar» año/reforma/m² llegan RELLENOS por el Catastro y `disabled`, con la casilla
   * `nx-checkbox[formcontrolname=enableCadastreEditing]` «Modificar datos del catastro.» sin marcar que los habilita. `'no_habilita'` =
   * la casilla se marca pero los campos siguen deshabilitados. Datos inventados.
   */
  catastro?: true | 'no_habilita'
}

function app(o: OpcionesApp = {}): string {
  const radio = (id: string, grupo: string, etiqueta: string, marcado = false) =>
    `<span><input type="radio" id="${id}" name="${grupo}" class="cdk-visually-hidden" ${marcado ? 'checked' : ''}><label for="${id}">${etiqueta}</label></span>`
  const campo = (fcn: string, etiqueta: string, req = true, dis = false, tipo = 'text') =>
    `<nx-formfield><label for="${fcn}">${etiqueta}</label><input id="${fcn}" type="${tipo}" formcontrolname="${fcn}" ${req ? 'required' : ''} ${dis ? 'disabled' : ''} class="ng-invalid"></nx-formfield>`
  const pasos = ['Vivienda', 'Valoración de bienes', 'Precio', 'Datos', 'Revisión', 'Pago', 'Confirmación']
  return `<!doctype html><html><body>
<div id="pasos">${pasos.map((p, i) => `<nx-multi-step-item role="tab" aria-label="${p}" ${i === 0 ? '' : 'aria-disabled="true"'}>${p}</nx-multi-step-item>`).join('')}</div>
<h3>¿Quién es el tomador?</h3>
<nx-dropdown role="combobox" formcontrolname="idType">${o.tipoDoc ?? 'NIF'}</nx-dropdown>
${campo('idNumber', 'Número de documento')}${campo('dateOfBirth', 'Fecha de nacimiento')}
<h3>Datos de la vivienda</h3>
${campo('postalCode', 'Código postal')}${campo('province', 'Provincia', true, true)}${campo('town', 'Población')}
${campo('streetType', 'Tipo de vía', true, true)}${campo('streetName', 'Nombre de la vía')}${campo('streetNumber', 'Número', true, false, 'number')}
${campo('block', 'Bloque', false)}${campo('stair', 'Escalera', false)}${campo('floor', 'Piso', false)}${campo('flat', 'Puerta', false)}
<div id="check-address"><button type="button" id="comprobar" onclick="${o.infoOculta === 'nunca' ? '' : o.infoOculta === 'overlay' ? `document.body.insertAdjacentHTML('beforeend','<div class=cdk-overlay-pane>Revise la direccion</div>')` : `document.getElementById('buildingInformation').hidden=false`}">Comprobar</button></div>
<div id="buildingInformation" ${o.infoOculta ? 'hidden' : ''}>${o.catastro ? `<nx-checkbox formcontrolname="enableCadastreEditing" class="nx-checkbox"><input type="checkbox" class="nx-checkbox__input" id="cat-1" value="false" style="opacity:0;position:absolute;width:1px;height:1px"><label class="nx-checkbox__label has-label" for="cat-1"><span class="nx-checkbox__control"></span><div class="nx-checkbox__label-text"> Modificar datos del catastro. </div></label></nx-checkbox>` : ''}${campo('yearOfConstruction', 'Año de construcción', true, !!o.catastro, 'number')}${campo('yearOfRefurbishment', 'Año de la reforma', false, !!o.catastro, 'number')}${campo('surfaceAreaLiving', 'Superficie de la vivienda', true, !!o.catastro)}</div>
${radio('m1', 'madera', 'Sin madera', true)}${radio('m2', 'madera', 'Con madera')}
${radio('t1', 'tipo', 'Piso en alto', true)}${radio('t2', 'tipo', 'Unifamiliar Adosada / Pareada')}${radio('t3', 'tipo', 'Planta Baja o piso con ventanas a menos de 3 metros del suelo')}${radio('t4', 'tipo', 'Ático')}${radio('t5', 'tipo', 'Unifamiliar Independiente')}
${radio('r1', 'regimen', '<i></i>Propietario Propietario', true)}${radio('r2', 'regimen', '<i></i>Inquilino Inquilino')}
${radio('u1', 'uso', 'Habitual', true)}${radio('u2', 'uso', 'Alquiler')}${radio('u3', 'uso', 'En venta y/o deshabitada')}${radio('u4', 'uso', 'Secundaria')}${radio('u5', 'uso', 'Turístico o vacacional')}
<button type="button" id="NextPageFromRisk" disabled>SIGUIENTE</button>
${o.duplicadosOcultos === false ? '' : `<div id="pasoDatos" style="display:none">${['postalCode', 'province', 'town', 'streetType', 'streetName'].map((f) => [0, 1].map((k) => `<nx-formfield><input id="dup-${f}-${k}" type="text" formcontrolname="${f}" disabled class="ng-valid"></nx-formfield>`).join('')).join('')}<div id="check-address"><button type="button" disabled>Comprobar</button></div></div><div id="check-address"><button type="button" disabled>Comprobada</button></div>`}
${o.townVisibleDuplicado ? `<nx-formfield><label for="town-bis">Población</label><input id="town-bis" type="text" formcontrolname="town" class="ng-valid"></nx-formfield>` : ''}
${o.casilla ? `<span><input type="checkbox" id="c1"><label for="c1">Acepto condiciones</label></span><label id="envuelve"><input type="checkbox"> Recibir avisos</label>` : ''}
${o.lista ? o.lista.textos.map((t, i) => `<mat-option id="mat-option-${i + 7}" role="option" data-para="${o.lista!.para}" ${o.listaAlEnfocar ? 'style="display:none"' : ''}>${t}</mat-option>`).join('') : ''}
<script>
  document.querySelectorAll('mat-option').forEach((m) => m.addEventListener('click', () => {
    if (m.dataset.para === 'poblacion') { document.querySelector('[formcontrolname="province"]').value = 'SEVILLA'; document.querySelector('[formcontrolname="town"]').value = m.textContent; }
    else { document.querySelector('[formcontrolname="streetType"]').value = 'CALLE'; document.querySelector('[formcontrolname="streetName"]').value = m.textContent; }
    valida();
  }));
  const $ = (f) => document.querySelector('[formcontrolname="' + f + '"]');
  $('town').addEventListener('focus', () => document.querySelectorAll('mat-option[data-para=poblacion]').forEach((m) => { m.style.display = ''; }));
  const valida = () => {
    for (const el of document.querySelectorAll('input[formcontrolname]')) {
      let ok = !el.required || el.value.trim() !== '';
      if (el.getAttribute('formcontrolname') === 'yearOfConstruction' && ${o.anioSiempreInvalido ? 'true' : 'false'}) ok = false;
      el.className = ok ? 'ng-valid' : 'ng-invalid';
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    }
    document.getElementById('NextPageFromRisk').disabled = !!document.querySelector('input[required].ng-invalid');
  };
  document.addEventListener('input', valida);
  document.addEventListener('change', valida);
  $('postalCode').addEventListener('change', () => setTimeout(() => {
    if (${o.sinAutocompletar ? 'true' : 'false'}) return;
    $('province').value = 'SEVILLA'; $('town').value = ${JSON.stringify(o.poblaciones ?? 'SEVILLA')}; valida();
  }, 200));
  $('streetName').addEventListener('change', () => setTimeout(() => { if (${o.sinVia ? 'true' : 'false'}) return; $('streetType').value = 'CALLE'; valida(); }, 200));
  document.getElementById('NextPageFromRisk').addEventListener('click', () => {
    const items = document.querySelectorAll('nx-multi-step-item');
    items[1].removeAttribute('aria-disabled');
  });
  ${o.pasoInicial ? `document.querySelectorAll('nx-multi-step-item').forEach((el) => { if (el.textContent === ${JSON.stringify(o.pasoInicial)}) el.setAttribute('aria-selected', 'true'); else el.setAttribute('aria-selected', 'false'); });` : ''}
  ${o.overlayAlEscribir ? `
  const OVERLAY = ${JSON.stringify(o.overlayAlEscribir)};
  $('town').setAttribute('role', 'combobox');
  $('town').addEventListener('input', () => {
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => c.remove());
    const t = $('town').value.trim().toUpperCase();
    $('town').removeAttribute('aria-controls');
    if (t.length < 3) return;
    const c = document.createElement('div'); c.className = 'cdk-overlay-container';
    const p = document.createElement('div'); p.id = 'nx-autocomplete-panel-1'; p.setAttribute('role', 'listbox');
    for (const x of OVERLAY.filter((x) => x.includes(t))) {
      const op = document.createElement('nx-autocomplete-option'); op.setAttribute('role', 'option'); op.textContent = x;
      op.addEventListener('click', () => { $('province').value = 'JAEN'; $('town').value = x; c.remove(); $('town').removeAttribute('aria-controls'); valida(); });
      p.appendChild(op);
    }
    c.appendChild(p); document.body.appendChild(c); $('town').setAttribute('aria-controls', 'nx-autocomplete-panel-1');
  });` : ''}
  ${o.catastro ? `
  $('yearOfConstruction').value = '1950'; $('surfaceAreaLiving').value = '55';
  document.getElementById('cat-1').addEventListener('change', (ev) => {
    if (${o.catastro === 'no_habilita' ? 'true' : 'false'}) return;
    for (const f of ['yearOfConstruction', 'yearOfRefurbishment', 'surfaceAreaLiving']) $(f).disabled = !ev.target.checked;
  });` : ''}
  valida();
</script></body></html>`
}

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

async function abrir(o: OpcionesApp = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    const body = u.hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const pulsados: string[] = []
  const ctx = {
    pulsar: async (b: Parameters<typeof pulsar>[0]) => { pulsados.push(((await b.textContent()) ?? '').replace(/\s+/g, ' ').trim()); await pulsar(b, guard) },
    pausaAccion: async () => undefined,
    marcarOpcionHogar: async (m: Frame, etiqueta: string) => {
      const r = await marcarOpcionRiesgoHogarAllianz(m, guard, etiqueta)
      if (r.estado === 'marcada') pulsados.push(`opcion:${etiqueta}`)
      return r
    },
  }
  const marco: Frame = await marcoHogar(page, 5_000)
  const valor = (fcn: string) => marco.locator(`[formcontrolname="${fcn}"]:visible`).first().inputValue()
  const marcado = (id: string) => marco.locator(`#${id}`).isChecked()
  return { context, page, ctx, pulsados, marco, valor, marcado, guard }
}

test('pantalla 1 completa: escribe por formcontrolname, fija las opciones del formulario (no los de serie) y avanza con SIGUIENTE', async () => {
  const { context, page, ctx, pulsados, marco, valor, marcado } = await abrir()
  try {
    await rellenarPantallaVivienda(page, marco, FORM, ctx)
    assert.equal(await valor('idNumber'), '00000000T')
    assert.equal(await valor('dateOfBirth'), '15/01/1980')
    assert.equal(await valor('yearOfConstruction'), '1990')
    assert.equal(await valor('surfaceAreaLiving'), '90')
    assert.equal(await valor('block'), '', 'lo que no consta no se escribe')
    assert.equal(await marcado('t4'), true, 'Ático (no el «Piso en alto» de serie)')
    assert.equal(await marcado('r2'), true, 'Inquilino')
    assert.equal(await marcado('u4'), true, 'Secundaria')
    assert.equal(await marcado('m1'), true, 'Sin madera (ya marcado: no se pulsa)')
    assert.ok(!pulsados.includes('Comprobar'), '«Comprobar» no está visto: no se pulsa')
    const paso = await avanzarDesdeVivienda(page, marco, ctx, 3_000)
    assert.equal(paso, 'Valoración de bienes')
    assert.deepEqual(pulsados, ['opcion:Ático', 'opcion:Inquilino', 'opcion:Secundaria', 'SIGUIENTE'])
    assert.throws(() => huecoTrasVivienda(paso), ErrorMapaIncompleto)
  } finally {
    await context.close()
  }
})

test('0.1.5: la información de la vivienda está oculta → pulsa «Comprobar» (por ctx.pulsar) y luego escribe año y m²', async () => {
  const { context, page, ctx, pulsados, marco, valor } = await abrir({ infoOculta: true })
  try {
    await rellenarPantallaVivienda(page, marco, FORM, ctx)
    assert.equal(await valor('yearOfConstruction'), '1990')
    assert.equal(await valor('surfaceAreaLiving'), '90')
    assert.equal(pulsados.filter((p) => p === 'Comprobar').length, 1)
    assert.ok(pulsados.indexOf('Comprobar') > pulsados.indexOf('opcion:Secundaria') - 4, 'Comprobar va antes de año/m², tras la dirección')
  } finally {
    await context.close()
  }
})

test('0.1.5: tras «Comprobar» la información sigue oculta → hueco claro (con el diálogo, sin cerrarlo)', async () => {
  for (const infoOculta of ['nunca', 'overlay'] as const) {
    const { context, page, ctx, pulsados, marco } = await abrir({ infoOculta })
    try {
      page.setDefaultTimeout(20_000)
      await assert.rejects(
        () => rellenarPantallaVivienda(page, marco, FORM, ctx),
        (e) => e instanceof ErrorMapaIncompleto && /tras pulsar Comprobar la información de la vivienda no se destapó/.test((e as Error).message) && (infoOculta === 'overlay') === /Revise la direccion/.test((e as Error).message) && !(e as Error).message.includes('00000000T'),
      )
      assert.deepEqual(pulsados.filter((p) => p === 'Comprobar'), ['Comprobar'])
    } finally {
      await context.close()
    }
  }
})

test('0.1.7: tras «Comprobar» el Catastro deja año/m² rellenos y deshabilitados → marca «Modificar datos del catastro.» (ctx.pulsar) y escribe los del formulario', async () => {
  const { context, page, ctx, pulsados, marco, valor, marcado } = await abrir({ infoOculta: true, catastro: true })
  try {
    await rellenarPantallaVivienda(page, marco, FORM, ctx)
    assert.equal(await marcado('cat-1'), true)
    assert.equal(await valor('yearOfConstruction'), '1990', 'el año del formulario, no el del Catastro')
    assert.equal(await valor('surfaceAreaLiving'), '90', 'los m² del formulario, no los del Catastro')
    const iC = pulsados.indexOf('Comprobar')
    const iM = pulsados.indexOf('Modificar datos del catastro.')
    assert.ok(iC >= 0 && iM > iC, 'primero «Comprobar», luego la casilla del Catastro')
    assert.equal(pulsados.filter((p) => p === 'Modificar datos del catastro.').length, 1)
  } finally {
    await context.close()
  }
})

test('0.1.7: la casilla del Catastro no habilita el año → hueco claro (no se escribe ni se adivina)', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ infoOculta: true, catastro: 'no_habilita' })
  try {
    page.setDefaultTimeout(20_000)
    await assert.rejects(
      () => rellenarPantallaVivienda(page, marco, FORM, ctx),
      (e) => e instanceof ErrorMapaIncompleto && /sigue deshabilitado tras marcar «Modificar datos del catastro\.»/.test((e as Error).message),
    )
    assert.equal(await valor('yearOfConstruction'), '1950', 'no se tocó el año del Catastro')
  } finally {
    await context.close()
  }
})

test('el «Tipo de documento» no es el del documento → hueco ANTES de escribir nada', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ tipoDoc: 'Pasaporte' })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), (e) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /Tipo de documento/.test((e as Error).message) && !(e as Error).message.includes('00000000T'))
    assert.equal(await valor('idNumber'), '')
  } finally {
    await context.close()
  }
})

test('el CP no autocompleta la población → hueco (no se adivina)', async () => {
  const { context, page, ctx, marco } = await abrir({ sinAutocompletar: true })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), (e) => e instanceof ErrorMapaIncompleto && /población/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('el portal autocompleta OTRA población que la del riesgo → hueco (sin nombrarlas)', async () => {
  const { context, page, ctx, marco } = await abrir({ poblaciones: 'DOS HERMANAS' })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), (e) => e instanceof ErrorMapaIncompleto && /otra distinta/.test((e as Error).message) && !/DOS HERMANAS|SEVILLA/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('un obligatorio sigue inválido → hueco y SIGUIENTE no se pulsa', async () => {
  const { context, page, ctx, pulsados, marco } = await abrir({ anioSiempreInvalido: true })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), (e) => e instanceof ErrorMapaIncompleto && /Año de construcción/.test((e as Error).message))
    await assert.rejects(() => avanzarDesdeVivienda(page, marco, ctx, 1_000), (e) => e instanceof ErrorMapaIncompleto && /deshabilitado/.test((e as Error).message))
    assert.ok(!pulsados.includes('SIGUIENTE'))
  } finally {
    await context.close()
  }
})

test('el asistente en un paso de EMISIÓN («Pago») → EmisionBloqueadaError sin tocar nada', async () => {
  const { context, page, ctx, pulsados, marco, valor } = await abrir({ pasoInicial: 'Pago' })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), EmisionBloqueadaError)
    assert.deepEqual(pulsados, [])
    assert.equal(await valor('idNumber'), '')
  } finally {
    await context.close()
  }
})

test('cepo: una etiqueta de opción que solo CONTIENE la esperada no se marca (hueco)', async () => {
  const { context, page, ctx, marco } = await abrir()
  try {
    await marco.evaluate(() => { document.querySelector('label[for="u4"]')!.textContent = 'Secundaria de temporada' })
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, FORM, ctx), (e) => e instanceof ErrorMapaIncompleto && /«Secundaria» \(uso\)/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('guard: la puerta de opciones de Hogar rechaza etiquetas fuera de la lista cerrada y marcos fuera de la app', async () => {
  const { context, page, marco, guard, marcado } = await abrir()
  try {
    // «En venta y/o deshabitada» existe en el portal pero NO está en la lista cerrada: nunca se marca.
    await assert.rejects(() => marcarOpcionRiesgoHogarAllianz(marco, guard, 'En venta y/o deshabitada'), EmisionBloqueadaError)
    assert.equal(await marcado('u3'), false)
    await assert.rejects(() => marcarOpcionRiesgoHogarAllianz(page.mainFrame(), guard, 'Secundaria'), EmisionBloqueadaError)
    assert.equal(await marcado('u4'), false)
    assert.deepEqual(await marcarOpcionRiesgoHogarAllianz(marco, guard, 'Secundaria'), { estado: 'marcada' })
    assert.deepEqual(await marcarOpcionRiesgoHogarAllianz(marco, guard, 'Secundaria'), { estado: 'ya_marcada' })
  } finally {
    await context.close()
  }
})

test('guard: una etiqueta con «emitir» en el control no se pulsa aunque esté en la lista', async () => {
  const { context, marco, guard, marcado } = await abrir()
  try {
    await marco.evaluate(() => { document.getElementById('u4')!.setAttribute('onclick', 'emitirPoliza()') })
    await assert.rejects(() => marcarOpcionRiesgoHogarAllianz(marco, guard, 'Secundaria'), EmisionBloqueadaError)
    assert.equal(await marcado('u4'), false)
  } finally {
    await context.close()
  }
})

test('guard: marcarOpcionResueltaHogarAllianz marca solo un <label for> de un radio de la app (no un campo, no otro marco, no «emitir»)', async () => {
  const { context, page, marco, guard, marcado } = await abrir()
  try {
    // «En venta y/o deshabitada» NO está en la lista cerrada, pero una etiqueta resuelta por la capa común (IA/atasco) sí se marca.
    assert.deepEqual(await marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('label[for="u3"]')), { estado: 'marcada' })
    assert.equal(await marcado('u3'), true)
    assert.deepEqual(await marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('label[for="u3"]')), { estado: 'ya_marcada' })
    // No es un <label for>: hueco, sin pulsar.
    assert.equal((await marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('#comprobar'))).estado, 'no_unica')
    assert.equal((await marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('label')) ).estado, 'no_unica', 'varias etiquetas = ambigua')
    // Marco ajeno a la app de Hogar.
    await assert.rejects(() => marcarOpcionResueltaHogarAllianz(page.mainFrame(), guard, marco.locator('label[for="u4"]')), EmisionBloqueadaError)
    // Control con «emitir»: comprobarBoton lo frena antes del clic.
    await marco.evaluate(() => { document.getElementById('u4')!.setAttribute('onclick', 'emitirPoliza()') })
    await assert.rejects(() => marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('label[for="u4"]')), EmisionBloqueadaError)
    assert.equal(await marcado('u4'), false)
  } finally {
    await context.close()
  }
})

test('guard 0.1.4: label no clicable (display:none) → plan B marca el radio ya resuelto; un radio que de verdad no se marca sigue dando no_quedo con boundingBox', async () => {
  const { context, marco, guard, marcado } = await abrir()
  try {
    await marco.evaluate(() => { (document.querySelector('label[for="u4"]') as HTMLElement).style.display = 'none' })
    assert.deepEqual(await marcarOpcionRiesgoHogarAllianz(marco, guard, 'Secundaria'), { estado: 'marcada' })
    assert.equal(await marcado('u4'), true)
    await marco.evaluate(() => { (document.querySelector('label[for="u2"]') as HTMLElement).style.display = 'none' })
    assert.deepEqual(await marcarOpcionResueltaHogarAllianz(marco, guard, marco.locator('label[for="u2"]')), { estado: 'marcada' })
    assert.equal(await marcado('u2'), true)
    // Radio que el portal no deja marcar (cancela el clic) y label sin caja: error de siempre + boundingBox.
    await marco.evaluate(() => {
      document.getElementById('u5')!.addEventListener('click', (e) => e.preventDefault())
      ;(document.querySelector('label[for="u5"]') as HTMLElement).style.display = 'none'
    })
    const r = await marcarOpcionRiesgoHogarAllianz(marco, guard, 'Turístico o vacacional')
    assert.equal(r.estado, 'no_quedo')
    assert.match((r as { caja?: string }).caja ?? '', /boundingBox label/)
    assert.equal(await marcado('u5'), false)
  } finally {
    await context.close()
  }
})

// ───────────── opciones del riesgo: etiqueta exacta NO casa → capa común (fijo → aprendido → IA → atasco) ─────────────
async function formadorDe(elegir: (e: { texto: string | null }[]) => number | null, llamadas: string[], conocimiento: unknown[] = []): Promise<ContextoFormador> {
  return prepararFormador({
    trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'hogar', apiUrl: 'https://asegura.test', secreto: 'x'.repeat(20),
    redactar: (t) => t, log: () => undefined,
    fetchImpl: (async (url: string, init?: { body?: string }) => {
      const ruta = String(url).split('/formador/')[1]!.split('?')[0]!
      llamadas.push(ruta)
      if (ruta === 'conocimiento') return new Response(JSON.stringify({ formadorActivo: true, conocimiento, acompanamiento: { activo: false } }))
      if (ruta === 'sugerir') return new Response(JSON.stringify({ indice: elegir((JSON.parse(init!.body!) as { estructura: { texto: string | null }[] }).estructura) }))
      return new Response('{}')
    }) as unknown as typeof fetch,
  })
}

test('opción del riesgo con etiqueta distinta a la vista → se pregunta a la IA, pero una etiqueta de otro texto NO se marca (atasco)', async () => {
  const { context, page, marco, guard, ctx, marcado } = await abrir()
  try {
    await marco.evaluate(() => { document.querySelector('label[for="u4"]')!.textContent = 'Vivienda secundaria' })
    const llamadas: string[] = []
    const formador = await formadorDe((e) => e.findIndex((c) => c.texto === 'Vivienda secundaria'), llamadas)
    const ctx2 = { ...ctx, formador, marcarOpcionHogarResuelta: (m: Frame, l: Parameters<typeof marcarOpcionResueltaHogarAllianz>[2]) => marcarOpcionResueltaHogarAllianz(m, guard, l) }
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, { ...FORM, hogar: { ...FORM.hogar, uso: 'secundaria' } }, ctx2), ErrorMapaIncompleto)
    assert.equal(await marcado('u4'), false)
    assert.ok(llamadas.includes('sugerir'), 'preguntó a la IA')
  } finally {
    await context.close()
  }
})

test('opción del riesgo: la IA no resuelve → ATASCO con las etiquetas visibles (ErrorMapaIncompleto, nada marcado)', async () => {
  const { context, page, marco, ctx, marcado } = await abrir()
  try {
    await marco.evaluate(() => { document.querySelector('label[for="u4"]')!.textContent = 'Vivienda secundaria' })
    const formador = await formadorDe(() => null, [])
    await assert.rejects(
      () => rellenarPantallaVivienda(page, marco, { ...FORM, hogar: { ...FORM.hogar, uso: 'secundaria' } }, { ...ctx, formador }),
      (e) => e instanceof ErrorMapaIncompleto && /Secundaria/.test((e as Error).message),
    )
    assert.equal(await marcado('u4'), false)
    assert.equal(formador.atasco?.clave, 'elegir_opcion_secundaria')
    assert.ok((formador.atasco?.candidatos.length ?? 0) > 1)
  } finally {
    await context.close()
  }
})

// ───────────── revisión PR #4669: no envenenar tarificador_conocimiento (autocompletados), confirmar solo lo verificado ─────────────
const confirmaciones = (llamadas: string[]) => llamadas.filter((r) => r === 'confirmar').length

test('viaCoincide: nombre solo o «tipo nombre» por plano(); otra vía o vacío → no', () => {
  assert.equal(viaCoincide('CALLE', 'PRUEBA', 'PRUEBA'), true)
  assert.equal(viaCoincide('CALLE', 'Socorro', 'Calle Socorro'), true)
  assert.equal(viaCoincide(null, 'SOCORRO', 'Socorro'), true)
  assert.equal(viaCoincide('CALLE', 'OTRA', 'PRUEBA'), false)
  assert.equal(viaCoincide('CALLE', '', 'PRUEBA'), false)
  assert.equal(viaCoincide('CALLE', null, 'PRUEBA'), false)
})

test('población de la lista: el riesgo (SEVILLA) se elige SOLO por municipio, sin IA ni aprender; la IA que apuntara a otra ya no se consulta', async () => {
  for (const [textos, ok] of [[['DOS HERMANAS', 'SEVILLA'], true], [['DOS HERMANAS', 'UTRERA'], false]] as const) {
    const elegida = textos[0]
    const { context, page, ctx, marco } = await abrir({ sinAutocompletar: true, listaAlEnfocar: true, lista: { para: 'poblacion', textos: [...textos] } })
    try {
      const llamadas: string[] = []
      const formador = await formadorDe((e) => e.findIndex((c) => c.texto === elegida), llamadas)
      const r = rellenarPantallaVivienda(page, marco, FORM, { ...ctx, formador })
      if (ok) await r
      else await assert.rejects(() => r, (e) => e instanceof ErrorMapaIncompleto && /ninguna opción coincide/.test((e as Error).message))
      assert.equal(confirmaciones(llamadas), 0, `confirmaciones eligiendo ${elegida}`)
    } finally {
      await context.close()
    }
  }
})

test('población: riesgo SIN municipio → no se usa lo aprendido, no se pregunta a la IA, no se aprende: atasco', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ sinAutocompletar: true, lista: { para: 'poblacion', textos: ['DOS HERMANAS', 'SEVILLA'] } })
  try {
    const llamadas: string[] = []
    const aprendido = [{ clave: 'elegir_opcion_poblacion', tipo: 'accion', selector: '#mat-option-7', marco: null, origen: 'ia', confirmaciones: 5, consolidado: true }]
    const formador = await formadorDe((e) => e.findIndex((c) => c.texto === 'DOS HERMANAS'), llamadas, aprendido)
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, { ...FORM, inmueble: { ...FORM.inmueble, municipio: null } }, { ...ctx, formador }), ErrorMapaIncompleto)
    assert.ok(!llamadas.includes('sugerir'), 'no pregunta a la IA')
    assert.equal(confirmaciones(llamadas), 0)
    assert.equal(await valor('town'), '', 'la opción aprendida no se pulsó')
    assert.equal(formador.atasco?.clave, 'elegir_opcion_poblacion')
  } finally {
    await context.close()
  }
})

test('vía elegida de la lista: la del riesgo → se confirma; otra distinta → hueco y NO se confirma', async () => {
  for (const [elegida, ok] of [['PRUEBA', true], ['OTRA', false]] as const) {
    const { context, page, ctx, marco } = await abrir({ sinVia: true, lista: { para: 'via', textos: ['OTRA', 'PRUEBA'] } })
    try {
      const llamadas: string[] = []
      const formador = await formadorDe((e) => e.findIndex((c) => c.texto === elegida), llamadas)
      const r = rellenarPantallaVivienda(page, marco, FORM, { ...ctx, formador })
      if (ok) await r
      else await assert.rejects(() => r, (e) => e instanceof ErrorMapaIncompleto && /vía distinta/.test((e as Error).message))
      assert.equal(confirmaciones(llamadas), ok ? 1 : 0, `confirmaciones eligiendo ${elegida}`)
    } finally {
      await context.close()
    }
  }
})

test('elegir_opcion de un radio: se marca y confirma SOLO si el texto de la etiqueta es el de la opción del riesgo; otro texto → atasco, sin marcar ni aprender', async () => {
  // Distinto texto («Vivienda secundaria»): ni se marca ni se aprende; atasco.
  const a = await abrir()
  try {
    await a.marco.evaluate(() => { document.querySelector('label[for="u4"]')!.textContent = 'Vivienda secundaria' })
    const llamadas: string[] = []
    const formador = await formadorDe((e) => e.findIndex((c) => c.texto === 'Vivienda secundaria'), llamadas)
    const ctx2 = { ...a.ctx, formador, marcarOpcionHogarResuelta: (m: Frame, l: Parameters<typeof marcarOpcionResueltaHogarAllianz>[2]) => marcarOpcionResueltaHogarAllianz(m, a.guard, l) }
    await assert.rejects(() => rellenarPantallaVivienda(a.page, a.marco, FORM, ctx2), ErrorMapaIncompleto)
    assert.equal(await a.marcado('u4'), false, 'texto distinto: NO se marca')
    assert.equal(confirmaciones(llamadas), 0, 'texto distinto: no se aprende')
    assert.equal(formador.atasco?.clave, 'elegir_opcion_secundaria', 'atasco con inventario')
  } finally {
    await a.context.close()
  }
  // Mismo texto (hay DOS «Secundaria»: la puerta exacta no es única y la IA elige una): sí se aprende.
  const b = await abrir()
  try {
    await b.marco.evaluate(() => { document.querySelector('label[for="u4"]')!.parentElement!.insertAdjacentHTML('afterend', '<span><input type="radio" id="u6" name="uso" class="cdk-visually-hidden"><label for="u6">Secundaria</label></span>') })
    const llamadas: string[] = []
    const formador = await formadorDe((e) => e.findIndex((c) => c.texto === 'Secundaria'), llamadas)
    const ctx2 = { ...b.ctx, formador, marcarOpcionHogarResuelta: (m: Frame, l: Parameters<typeof marcarOpcionResueltaHogarAllianz>[2]) => marcarOpcionResueltaHogarAllianz(m, b.guard, l) }
    await rellenarPantallaVivienda(b.page, b.marco, FORM, ctx2)
    assert.equal(await b.marcado('u4'), true)
    assert.equal(confirmaciones(llamadas), 1, 'mismo texto: se aprende')
  } finally {
    await b.context.close()
  }
})

test('candidatos: la etiqueta de una CASILLA (for → checkbox o envolviéndola) no es opción; label/mat-option solo se ven con elegir_opcion', async () => {
  const { context, page, marco } = await abrir({ casilla: true, lista: { para: 'poblacion', textos: ['SEVILLA'] } })
  try {
    const conOpciones = await extraerCandidatos(page, 'accion', (t) => t, true)
    const flag = (texto: string) => conOpciones.find((c) => c.texto?.includes(texto))
    assert.equal(flag('Acepto condiciones')?.paraCheckbox, true, 'label for → checkbox')
    assert.equal(flag('Secundaria')?.paraCheckbox, undefined, 'label de un radio: sí es opción')
    assert.ok(conOpciones.some((c) => c.tag === 'mat-option'))
    const d1 = await describirElemento(marco.locator('label[for="c1"]'), 1)
    const d2 = await describirElemento(marco.locator('label[for="u4"]'), 1)
    assert.equal(d1?.paraCheckbox, true)
    assert.equal(d2?.paraCheckbox, false)
    assert.equal((await describirElemento(marco.locator('#envuelve'), 1))?.paraCheckbox, true, 'label que envuelve un checkbox')
    // Sin `elegir_opcion` (Mapfre: continuar, navegación…) la lista de candidatos es la de siempre: ni label ni mat-option.
    const sin = await extraerCandidatos(page, 'accion', (t) => t)
    assert.ok(!sin.some((c) => c.tag === 'label' || c.tag === 'mat-option'), sin.map((c) => c.tag).join(','))
    assert.ok(sin.some((c) => c.tag === 'button'))
  } finally {
    await context.close()
  }
})

test('SELECTOR_ACCIONES compartido: idéntico al de origin/main (sin label[for], mat-option ni [role=option])', () => {
  assert.equal(SELECTOR_ACCIONES, 'a, button, input[type=button], input[type=submit], input[type=image], [onclick], [ng-click], [data-ng-click], [role=button], [role=tab], [role=menuitem], nx-button, mat-icon:not(a mat-icon):not(button mat-icon):not([role=button] mat-icon)')
})

// ───────────── 21/10/2026: elección de la población del CP por el municipio del riesgo (CP 23693, varias poblaciones) ─────────────
test('elegirPoblacionHogar: exacta (sin tildes/mayúsculas/prefijo CP), por palabras enteras, y nunca al azar', async () => {
  const { elegirPoblacionHogar } = await import('../src/adapters/allianz/poblacion-localidad.ts')
  const LISTA = ['23693 - VENTAS DEL CARRIZAL', 'Jaén', 'Las Infantas']
  assert.deepEqual(elegirPoblacionHogar(LISTA, 'Ventas del Carrizal'), { tipo: 'elegida', indice: 0, por: 'municipio' })
  assert.deepEqual(elegirPoblacionHogar(['Ventas del Carrizal (Jaén)', 'Jaén Centro'], ' VENTAS  DEL CARRIZAL '), { tipo: 'elegida', indice: 0, por: 'municipio' })
  assert.deepEqual(elegirPoblacionHogar(LISTA, 'Jaen'), { tipo: 'elegida', indice: 1, por: 'municipio' })
  assert.deepEqual(elegirPoblacionHogar(LISTA, 'Linares'), { tipo: 'sin_coincidencia' })
  assert.deepEqual(elegirPoblacionHogar(['Jaén', 'Jaén'], 'Jaén'), { tipo: 'sin_coincidencia' })
  assert.deepEqual(elegirPoblacionHogar(['Jaén Norte', 'Jaén Sur'], 'Jaén'), { tipo: 'sin_coincidencia' })
  assert.deepEqual(elegirPoblacionHogar(LISTA, null), { tipo: 'sin_municipio' })
  assert.deepEqual(elegirPoblacionHogar([], 'Jaén'), { tipo: 'sin_opciones' })
})

test('elegirPoblacionHogar: núcleo de la vía (prefijo del Catastro), opción única y prefijo ambiguo', async () => {
  const { elegirPoblacionHogar, nucleoDeVia } = await import('../src/adapters/allianz/poblacion-localidad.ts')
  assert.equal(nucleoDeVia('PARRA LA (VENTAS CARRIZA)'), 'VENTAS CARRIZA')
  assert.equal(nucleoDeVia('PARRA LA'), null)
  const LISTA = ['CASTILLO DE LOCUBIN', 'VENTAS DEL CARRIZAL']
  assert.deepEqual(elegirPoblacionHogar(LISTA, 'Castillo de Locubín', 'PARRA LA (VENTAS CARRIZA)'), { tipo: 'elegida', indice: 1, por: 'nucleo' })
  assert.deepEqual(elegirPoblacionHogar(LISTA, 'Castillo de Locubín', 'PARRA LA'), { tipo: 'elegida', indice: 0, por: 'municipio' })
  assert.deepEqual(elegirPoblacionHogar(['23693 - OTRA'], 'Nada', null), { tipo: 'elegida', indice: 0, por: 'unica' })
  assert.deepEqual(elegirPoblacionHogar(['VENTAS DEL CARRIZAL', 'VENTAS DEL CARRIZO'], 'Linares', 'X (VENTAS CARRI)'), { tipo: 'sin_coincidencia' })
})

test('flujo cableado: municipio (CASTILLO DE LOCUBIN) ≠ población del CP (VENTAS DEL CARRIZAL) → se elige por el núcleo de la vía y NO salta «otra distinta»', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ sinAutocompletar: true, listaAlEnfocar: true, lista: { para: 'poblacion', textos: ['CASTILLO DE LOCUBIN', 'VENTAS DEL CARRIZAL'] } })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    // la vía no coincide con el nombre del mock (solo se contrasta si el portal no rellena el tipo de vía; aquí sí lo rellena)
    await rellenarPantallaVivienda(page, marco, f, ctx)
    assert.equal(await valor('town'), 'VENTAS DEL CARRIZAL')
  } finally {
    await context.close()
  }
})

test('el portal AUTOCOMPLETA el núcleo de la vía (VENTAS DEL CARRIZAL) y el municipio del riesgo es otro → se acepta (0.1.3)', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ poblaciones: 'VENTAS DEL CARRIZAL' })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await rellenarPantallaVivienda(page, marco, f, ctx)
    assert.equal(await valor('town'), 'VENTAS DEL CARRIZAL')
  } finally {
    await context.close()
  }
})

test('el portal autocompleta un núcleo AJENO al de la vía y al municipio → sigue siendo «otra distinta»', async () => {
  const { context, page, ctx, marco } = await abrir({ poblaciones: 'DOS HERMANAS' })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, f, ctx), (e) => e instanceof ErrorMapaIncompleto && /otra distinta/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('el portal autocompleta otra población y la vía NO trae núcleo → estricto con el municipio (no se acepta por «única»)', async () => {
  const { context, page, ctx, marco } = await abrir({ poblaciones: 'VENTAS DEL CARRIZAL' })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA' } }
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, f, ctx), (e) => e instanceof ErrorMapaIncompleto && /otra distinta/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('forma real NDBX: la lista solo aparece al ESCRIBIR en town (overlay + aria-controls) → se escribe el núcleo y se elige VENTAS DEL CARRIZAL', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ sinAutocompletar: true, overlayAlEscribir: ['CASTILLO DE LOCUBIN', 'VENTAS DEL CARRIZAL', 'VENTAS DEL CARRIZAL BAJO'] })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, f, ctx), (e) => e instanceof ErrorMapaIncompleto && /ninguna opción coincide/.test((e as Error).message), 'dos opciones que casan con el núcleo → no se elige (fail-closed)')
  } finally {
    await context.close()
  }
  const b = await abrir({ sinAutocompletar: true, overlayAlEscribir: ['CASTILLO DE LOCUBIN', 'VENTAS DEL CARRIZAL'] })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await rellenarPantallaVivienda(b.page, b.marco, f, b.ctx)
    assert.equal(await b.valor('town'), 'VENTAS DEL CARRIZAL')
  } finally {
    await b.context.close()
  }
})

test('nada abre la lista de town → hueco con diagnóstico (sin datos personales) y town vacío', async () => {
  const { context, page, ctx, marco, valor } = await abrir({ sinAutocompletar: true })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await assert.rejects(() => rellenarPantallaVivienda(page, marco, f, ctx), (e) => e instanceof ErrorMapaIncompleto && /sin opciones tras \d+ intentos/.test((e as Error).message))
    assert.equal(await valor('town'), '')
  } finally {
    await context.close()
  }
})

test('job 1bd6bfce: copias ocultas y disabled de town/postalCode en el DOM → se lee y se elige el town VISIBLE (no «el campo no es único»)', async () => {
  // El CP autocompleta el town visible: con las copias, antes `esperarValor` nunca lo veía (count 3 ≠ 1).
  const a = await abrir({ duplicadosOcultos: true })
  try {
    assert.equal(await a.marco.locator('input[formcontrolname="town"]').count(), 3, 'el mock reproduce las tres copias del HTML real')
    await rellenarPantallaVivienda(a.page, a.marco, FORM, a.ctx)
    assert.equal(await a.valor('town'), 'SEVILLA')
  } finally {
    await a.context.close()
  }
  // Y la lista que solo aparece al escribir: se escribe y elige en el town visible.
  const b = await abrir({ duplicadosOcultos: true, sinAutocompletar: true, overlayAlEscribir: ['CASTILLO DE LOCUBIN', 'VENTAS DEL CARRIZAL'] })
  try {
    const f = { ...FORM, inmueble: { ...FORM.inmueble, municipio: 'Castillo de Locubín', nombreVia: 'PARRA LA (VENTAS CARRIZA)' } }
    await rellenarPantallaVivienda(b.page, b.marco, f, b.ctx)
    assert.equal(await b.valor('town'), 'VENTAS DEL CARRIZAL')
  } finally {
    await b.context.close()
  }
})

test('diagnóstico: dos town VISIBLES y habilitados → «campo town … 2 coincidencias» (no «sin municipio ni vía»)', async () => {
  const a = await abrir({ sinAutocompletar: true, townVisibleDuplicado: true })
  try {
    await assert.rejects(() => rellenarPantallaVivienda(a.page, a.marco, FORM, a.ctx), (e) => e instanceof ErrorMapaIncompleto && /campo town visible y habilitado: 2 coincidencias/.test((e as Error).message) && !/sin municipio ni vía/.test((e as Error).message))
  } finally {
    await a.context.close()
  }
})
