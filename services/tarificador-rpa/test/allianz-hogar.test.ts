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
import { pideInventarioDom } from '../src/errores.ts'
import { OPCIONES_RIESGO_HOGAR_ALLIANZ, etiquetaOpcionHogarCasa, instalarGuardEmision, marcarOpcionRiesgoHogarAllianz, pulsar } from '../src/guard.ts'
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
} from '../src/adapters/allianz/hogar.ts'

const HOY = new Date('2026-10-14T10:00:00Z')
const FORM: FormularioHogar = {
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-15' },
  inmueble: { codigoPostal: '41001', municipio: 'SEVILLA', nombreVia: 'PRUEBA', numero: '1', bloque: null, escalera: null, planta: '2', puerta: null, anioConstruccion: 1990, anioReforma: null, superficieM2: 90 },
  hogar: { uso: 'secundaria', regimen: 'inquilino', tipoVivienda: 'atico', conMadera: false, capitalContinenteEur: null, capitalContenidoEur: null },
}

// ───────────── puros ─────────────

test('flag APAGADO y sin registrar', () => {
  assert.equal(ALLIANZ_HOGAR_ACTIVO, false)
  assert.equal(adaptadores.obtener('allianz', 'hogar'), null)
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

type OpcionesApp = { tipoDoc?: string; poblaciones?: string; sinAutocompletar?: boolean; anioSiempreInvalido?: boolean; pasoInicial?: string }

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
<button type="button" id="comprobar" onclick="window.comprobado=1">Comprobar</button>
${campo('yearOfConstruction', 'Año de construcción', true, false, 'number')}${campo('yearOfRefurbishment', 'Año de la reforma', false, false, 'number')}${campo('surfaceAreaLiving', 'Superficie de la vivienda')}
${radio('m1', 'madera', 'Sin madera', true)}${radio('m2', 'madera', 'Con madera')}
${radio('t1', 'tipo', 'Piso en alto', true)}${radio('t2', 'tipo', 'Unifamiliar Adosada / Pareada')}${radio('t3', 'tipo', 'Planta Baja o piso con ventanas a menos de 3 metros del suelo')}${radio('t4', 'tipo', 'Ático')}${radio('t5', 'tipo', 'Unifamiliar Independiente')}
${radio('r1', 'regimen', '<i></i>Propietario Propietario', true)}${radio('r2', 'regimen', '<i></i>Inquilino Inquilino')}
${radio('u1', 'uso', 'Habitual', true)}${radio('u2', 'uso', 'Alquiler')}${radio('u3', 'uso', 'En venta y/o deshabitada')}${radio('u4', 'uso', 'Secundaria')}${radio('u5', 'uso', 'Turístico o vacacional')}
<button type="button" id="NextPageFromRisk" disabled>SIGUIENTE</button>
<script>
  const $ = (f) => document.querySelector('[formcontrolname="' + f + '"]');
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
  $('streetName').addEventListener('change', () => setTimeout(() => { $('streetType').value = 'CALLE'; valida(); }, 200));
  document.getElementById('NextPageFromRisk').addEventListener('click', () => {
    const items = document.querySelectorAll('nx-multi-step-item');
    items[1].removeAttribute('aria-disabled');
  });
  ${o.pasoInicial ? `document.querySelectorAll('nx-multi-step-item').forEach((el) => { if (el.textContent === ${JSON.stringify(o.pasoInicial)}) el.setAttribute('aria-selected', 'true'); else el.setAttribute('aria-selected', 'false'); });` : ''}
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
  const valor = (fcn: string) => marco.locator(`[formcontrolname="${fcn}"]`).inputValue()
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
