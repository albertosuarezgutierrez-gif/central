// Allianz AUTOS Turismos v0.6.1 (15/10/2026): marco del motor `ngx-motor-azs`, controles por etiqueta/rol accesible acotados a la
// zona `appArea` (la cabecera con «Matrícula» del colaborador/buscador ya no cuenta) y paso 1 «Datos del vehículo» completo
// (garaje, tomador, conductor; IBAN/BIC nunca). Portal SINTÉTICO (Angular de mentira con la estructura del inventario saneado; ids
// dinámicos a propósito, matrícula, documento y fechas FICTICIOS) servido con `context.route`: ni red ni datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { EmisionBloqueadaError, senalCuentaBancaria, type FormularioAuto } from '@central/module-tarificacion'
import { pideInventarioDom } from '../src/errores.ts'
import {
  ErrorFronteraEmision,
  esAppTurismosAllianz,
  grupoOpcionesTurismosCasa,
  instalarGuardEmision,
  marcarOpcionTurismosAllianz,
  OPCIONES_TURISMOS_ALLIANZ,
  pulsar,
} from '../src/guard.ts'
import {
  allianzAuto,
  avanzarDesdeDatosVehiculo,
  botonTurismos,
  campoTurismos,
  comprobarCampo,
  ErrorEleccionVersion,
  ErrorMapaIncompleto,
  ETIQUETAS_TURISMOS,
  HUECOS_FIJOS_TURISMOS,
  marcoFormularioTurismos,
  planDatosTurismos,
  rellenarDatosRiesgoTurismos,
  rellenarDatosVehiculoTurismos,
  tipoTomadorTurismos,
  type CtxTurismos,
} from '../src/adapters/allianz/auto.ts'

const FORM: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '00000',
  conductor: { fechaNacimiento: '1990-02-03', fechaCarne: '2010-04-05', sexo: 'mujer' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  tomador: null,
  eleccionVersion: null,
}
/** Riesgo COMPLETO para el resto del paso (v0.6.1): todo ficticio (DNI 00000000T, CP 00000, población inventada). */
const FORM_COMPLETO: FormularioAuto = {
  ...FORM,
  garajeNoche: false,
  documentoTomador: '00000000T',
  tomador: { tipo: 'fisica', nombre: 'A', apellido1: 'B', apellido2: null, razonSocial: null, documentoIdentidad: '00000000T', fechaNacimiento: null, codigoPostal: '00000', poblacion: 'Villaficticia', direccion: null, telefono: null, email: null },
}

const CARCASA = `<!doctype html><html><body><h1>ePac</h1><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-motor-azs/"></iframe></body></html>`

type Opc = {
  versiones?: Array<[string, string]>
  /** Nunca habilita «Encuentra mi vehículo»/«SIGUIENTE» con estos ids dinámicos: el portal responde con un aviso. */
  aviso?: boolean
  /** «SIGUIENTE» no se habilita nunca. */
  siguienteMuerto?: boolean
  /** «SIGUIENTE» deshabilitado solo con aria-disabled (sin atributo disabled). */
  siguienteAria?: boolean
  /** Dos radios con la etiqueta «Sí» (ambiguo). */
  sisDuplicados?: boolean
  /** Sin contenedor `#appArea`: la cabecera vive en un `<header>` del MISMO documento (fallback a `body` + fuera de cabecera). */
  sinContenedor?: boolean
  /** «Localidad» es un desplegable (`<select>`), no un campo de texto. */
  localidadSelect?: boolean
  /** IBAN y BIC VISIBLES desde el principio (frontera bancaria). */
  ibanVisible?: boolean
  /** Radios SIN atributo `name` (hermanos por su contenedor de grupo). */
  sinName?: boolean
  /** «Encuentra mi vehículo» abre un MODAL con la lista de coches (captura real de la 0.6.0), en un overlay fuera de `appArea`. */
  modal?: boolean
}

function app(o: Opc = {}): string {
  const radio = (id: string, grupo: string, etiqueta: string) => `<span><input type="radio" id="${id}" ${o.sinName ? '' : `name="${grupo}"`} class="cdk-visually-hidden"><label for="${id}">${etiqueta}</label></span>`
  const toggle = (g: string, etqs: string[]) => `<nx-radio-toggle>${etqs.map((e, i) => radio(`ng-x1-${g}-${i}`, `nx-radio-toggle-${g}`, e)).join('')}</nx-radio-toggle>`
  const texto = (id: string, etq: string) => `<label for="${id}">${etq}</label><input id="${id}" type="text">`
  const pasos = ['Datos del vehículo', 'Datos personales', 'Antecedentes', 'Selección de paquete', 'Datos', 'Revisión', 'Pago', 'Confirmación']
  const versiones = o.versiones ?? [['V1', 'Version unica 90 CV']]
  // Cabecera de ePac: desplegable de colaborador y buscador «Buscar Aquí...», AMBOS con nombre accesible «Matrícula» (prueba real 15/10/2026).
  const cabecera = `<label id="ng-h-lbl">Matrícula</label><div role="combobox" tabindex="0" aria-labelledby="ng-h-lbl">Matrícula</div><input id="ng-h-busca" role="searchbox" aria-labelledby="ng-h-lbl" placeholder="Buscar Aquí..."><button type="button">SIGUIENTE</button>`
  const formulario = `
<section id="paso1">
  <div role="radiogroup" aria-labelledby="ng-x1-nx-label-5"><label id="ng-x1-nx-label-5">¿Conoces la matrícula del vehículo?</label>
  ${radio('ng-x1-nx-radio-9-input', 'ng-x1-nx-radio-group-4', 'Sí')}${radio('ng-x1-nx-radio-10-input', 'ng-x1-nx-radio-group-4', o.sisDuplicados ? 'Sí' : 'No')}</div>
  <div id="bloqueMatricula" hidden>
    <label for="ng-x1-nx-input-12">Matrícula</label><input id="ng-x1-nx-input-12" type="text" required>
    <button type="button" id="ng-x1-btn-77" disabled>Encuentra mi vehículo</button>
    <div id="resultado" hidden>
      <label for="ng-x1-select-3">Versión</label>
      <select id="ng-x1-select-3"><option value=""></option>${versiones.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    </div>
  </div>
  <div role="radiogroup" aria-label="Uso">${radio('ng-x1-nx-radio-toggle-button-19', 'g7', 'Ocasional (fines de semana, vacaciones, etc)')}${radio('ng-x1-sii', 'g8', 'Sí')}</div>
  ${toggle('compra', ['Sí, lo he comprado nuevo', 'No, ya lo tenía y quiero cambiar de seguro', 'Sí, lo he comprado de 2ª mano a un particular', 'Sí, lo he comprado de 2ª mano a un concesionario'])}
  ${toggle('uso', ['Ocasional (fines de semana, vacaciones, etc)', 'A diario y fines de semana', 'Actividad laboral'])}
  ${toggle('garaje', ['En la calle', 'En un garaje colectivo', 'En un garaje individual'])}
  ${toggle('tomador', ['Individual Individual', 'Empresa Empresa'])}
  ${texto('ng-x1-doc', 'Número de documento')}${texto('ng-x1-cp', 'Código postal')}
  ${o.localidadSelect ? '<label for="ng-x1-loc">Localidad</label><select id="ng-x1-loc"><option value=""></option><option value="L1">Villaficticia</option><option value="L2">Otra</option></select>' : texto('ng-x1-loc', 'Localidad')}
  ${texto('ng-x1-fnac', 'Fecha de nacimiento del conductor')}${texto('ng-x1-fcar', 'Fecha de expedición de carnet')}
  <label id="ng-x1-lsc">Segundo conductor</label>${toggle('segundo', ['Sí Sí', 'No No'])}
  ${texto('ng-x1-efecto', '¿Cuándo quieres que comience tu seguro?')}${texto('ng-x1-ant', 'Nivel antecedentes')}${texto('ng-x1-col', 'Colaborador')}
  ${texto('ng-x1-prov', 'Provincia')}${texto('ng-x1-pob', 'Población')}${texto('ng-x1-via', 'Nombre de la vía')}${texto('ng-x1-num', 'Número')}
  <div id="pago" ${o.ibanVisible ? '' : 'hidden'}>${texto('ng-x1-iban', 'IBAN')}${texto('ng-x1-bic', 'BIC/SWIFT')}</div>
  <button type="button" id="ng-x1-btn-99" disabled>SIGUIENTE</button>
</section>
<section id="paso2" hidden><h2>Datos personales</h2><label for="ng-x1-nx-input-201">Nº Documento</label><input id="ng-x1-nx-input-201" type="text"></section>`
  return `<!doctype html><html><body>
${o.sinContenedor ? `<header>${cabecera}</header>` : `<nx-header-actions>${cabecera}</nx-header-actions>`}
<div>${pasos.map((p, i) => `<nx-multi-step-item role="tab" aria-selected="${i === 0}" ${i === 0 ? '' : 'aria-disabled="true"'}>${p}</nx-multi-step-item>`).join('')}</div>
${o.sinContenedor ? formulario : `<main id="appArea">${formulario}</main>`}
<script>
  const $ = (s) => document.querySelector(s);
  window.__tocados = [];
  ['#ng-x1-iban', '#ng-x1-bic'].forEach((s) => ['focus', 'input', 'change', 'click'].forEach((ev) => $(s).addEventListener(ev, () => window.__tocados.push(s + ':' + ev))));
  document.querySelectorAll('[aria-labelledby="ng-x1-nx-label-5"] input[type=radio]').forEach((r) => r.addEventListener('change', () => { $('#bloqueMatricula').hidden = false; }));
  $('#ng-x1-nx-input-12').addEventListener('input', () => { $('#ng-x1-btn-77').disabled = $('#ng-x1-nx-input-12').value.length < 4; });
  $('#ng-x1-btn-77').addEventListener('click', () => setTimeout(() => {
    ${o.modal ? "const d = document.createElement('div'); d.className = 'cdk-overlay-pane'; d.innerHTML = '<div role=\"dialog\" aria-modal=\"true\"><h3>Selecciona tu vehículo</h3><button type=\"button\">MODELO A 90 CV</button><button type=\"button\">MODELO B 120 CV</button></div>'; document.body.appendChild(d); return;" : ''}
    ${o.aviso ? "const a = document.createElement('div'); a.setAttribute('role', 'alert'); a.textContent = 'No encontrado'; $('#paso1').appendChild(a); return;" : ''}
    $('#resultado').hidden = false;
    ${o.siguienteMuerto ? '' : o.siguienteAria ? "$('#ng-x1-btn-99').disabled = false; $('#ng-x1-btn-99').setAttribute('aria-disabled', 'true');" : "$('#ng-x1-btn-99').disabled = false;"}
  }, 150));
  $('#ng-x1-btn-99').addEventListener('click', () => { $('#paso1').hidden = true; $('#paso2').hidden = false;
    const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[1].setAttribute('aria-selected', 'true'); t[1].removeAttribute('aria-disabled'); });
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

async function abrir(o: Opc = {}, rutaMotor = '/ngx-motor-azs/') {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    const body = u.hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA.replace('/ngx-motor-azs/', rutaMotor)
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const pulsados: string[] = []
  const ctx: CtxTurismos = {
    pulsar: async (b) => { pulsados.push(((await b.textContent()) ?? '').replace(/\s+/g, ' ').trim()); await pulsar(b, guard) },
    pausaAccion: async () => undefined,
    marcarOpcionTurismos: async (m: Frame, etiqueta: string) => {
      const r = await marcarOpcionTurismosAllianz(m, guard, etiqueta)
      if (r.estado === 'marcada') pulsados.push(`opcion:${etiqueta}`)
      return r
    },
  }
  return { context, page, ctx, pulsados, guard }
}

test('esAppTurismosAllianz: origen exacto y ruta del motor', () => {
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/ngx-motor-azs/'), true)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/ngx-motor-azs/paso'), true)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com/rws-router-sso-domain-bridge/bridge'), false)
  assert.equal(esAppTurismosAllianz('https://cloud.e-pacallianz.com.evil.com/ngx-motor-azs/'), false)
  assert.deepEqual(OPCIONES_TURISMOS_ALLIANZ.map((o) => o.clave), ['conoce_matricula:si', 'garaje:calle', 'tomador:individual', 'tomador:empresa'])
  // La lista cerrada nunca toca compra ni uso (sin dato inequívoco) ni nada de pago.
  for (const o of OPCIONES_TURISMOS_ALLIANZ) {
    assert.ok(!/comprado|ya lo ten|ocasional|a diario|actividad laboral/i.test([o.opcion, ...o.grupo].join(' ')), o.clave)
    assert.equal(senalCuentaBancaria([o.opcion, o.pregunta, ...o.grupo]), null, o.clave)
  }
})

test('versión del bot de Allianz Turismos', () => {
  assert.equal(allianzAuto.version, '0.6.1')
})

test('localización por etiqueta/rol: marco del motor y controles sin tocar ids dinámicos', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    assert.ok(esAppTurismosAllianz(marco.url()))
    await marcarOpcionTurismosAllianz(marco, guard, 'conoce_matricula:si') // el bloque de la matrícula aparece al marcar «Sí»
    // v0.6.0 en producción: la cabecera (colaborador + «Buscar Aquí...») también se llama «Matrícula». Acotado a `appArea`, uno.
    assert.ok((await marco.getByLabel('Matrícula', { exact: true }).count()) >= 3, 'el fixture reproduce la cabecera de la prueba real')
    assert.equal(await campoTurismos(marco, 'Matrícula').count(), 1)
    assert.equal(await botonTurismos(marco, 'Encuentra mi vehículo').count(), 1)
    assert.equal(await botonTurismos(marco, 'SIGUIENTE').count(), 1)
    assert.equal(await botonTurismos(marco, 'Encuentra').count(), 0, 'nombre EXACTO, no «contiene»')
  } finally {
    await context.close()
  }
})

test('marco que no es el motor → ErrorMapaIncompleto con inventario, sin escribir nada', async () => {
  const { context, page } = await abrir({}, '/ngx-otra-app/')
  try {
    await assert.rejects(marcoFormularioTurismos(page, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  } finally {
    await context.close()
  }
})

test('paso 1: Sí + matrícula + «Encuentra mi vehículo» por ctx.pulsar; una versión se fija; y «SIGUIENTE» → hueco con inventario', async () => {
  const { context, page, ctx, pulsados } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    assert.equal(await campoTurismos(marco, 'Matrícula').inputValue(), FORM.matricula)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'V1')
    assert.equal(await marco.locator('input[type=radio]').nth(2).isChecked(), false, 'compra/uso/garaje no se tocan')
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'])
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 3_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /Datos personales/.test((e as Error).message))
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo', 'SIGUIENTE'], 'solo navegación/consulta')
  } finally {
    await context.close()
  }
})

test('varias versiones sin elección → ErrorEleccionVersion (requiere_humano) con las opciones; con elección explícita se fija', async () => {
  const versiones: Array<[string, string]> = [['A1', 'Version A 90 CV'], ['B2', 'Version B 120 CV']]
  const a = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(a.page, marco, FORM, a.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 2)
  } finally {
    await a.context.close()
  }
  const b = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await rellenarDatosVehiculoTurismos(b.page, marco, { ...FORM, eleccionVersion: { codigo: 'B2', etiqueta: 'Version B 120 CV' } }, b.ctx)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'B2')
  } finally {
    await b.context.close()
  }
})

test('huecos: aviso del portal, «SIGUIENTE» muerto y «Sí» ambiguo → ErrorMapaIncompleto con inventario; nunca se pulsa SIGUIENTE deshabilitado', async () => {
  const a = await abrir({ aviso: true })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(a.page, marco, FORM, a.ctx), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  } finally {
    await a.context.close()
  }
  const b = await abrir({ siguienteMuerto: true })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await rellenarDatosVehiculoTurismos(b.page, marco, FORM, b.ctx) // hay versión única: sigue
    await assert.rejects(avanzarDesdeDatosVehiculo(b.page, marco, b.ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.ok(!b.pulsados.includes('SIGUIENTE'))
  } finally {
    await b.context.close()
  }
  const c = await abrir({ sisDuplicados: true })
  try {
    const marco = await marcoFormularioTurismos(c.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(c.page, marco, FORM, c.ctx), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.deepEqual(c.pulsados, [])
  } finally {
    await c.context.close()
  }
})

test('puerta guardada de opciones: lista cerrada y solo en la app del motor', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'No'), EmisionBloqueadaError)
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'Ocasional (fines de semana, vacaciones, etc)'), EmisionBloqueadaError)
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'conoce_matricula:si'), { estado: 'marcada' })
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'conoce_matricula:si'), { estado: 'ya_marcada' })
  } finally {
    await context.close()
  }
  const otra = await abrir({}, '/ngx-allianzhogar2053/')
  try {
    const f = otra.page.frame({ name: 'appArea' })!
    await assert.rejects(marcarOpcionTurismosAllianz(f, otra.guard, 'conoce_matricula:si'), EmisionBloqueadaError)
  } finally {
    await otra.context.close()
  }
})

test('H1: «Sí» de OTRO grupo → hueco (no_unica); con OTRA pestaña seleccionada → EmisionBloqueadaError; nunca se pulsa', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    // «Sí» existe también en el grupo «Uso»: solo vale el del grupo de la matrícula (y se marca ese).
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'conoce_matricula:si'), { estado: 'marcada' })
    assert.equal(await marco.locator('#ng-x1-sii').isChecked(), false)
    // Quitamos el grupo de la matrícula: queda solo el «Sí» ajeno → hueco (no_unica), nunca ese.
    await marco.evaluate(() => document.querySelector('[aria-labelledby="ng-x1-nx-label-5"]')!.remove())
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'conoce_matricula:si'), { estado: 'no_unica', coincidencias: 0 })
    assert.equal(await marco.locator('#ng-x1-sii').isChecked(), false)
  } finally {
    await context.close()
  }
  const b = await abrir()
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await marco.evaluate(() => { const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[1].setAttribute('aria-selected', 'true') })
    await assert.rejects(marcarOpcionTurismosAllianz(marco, b.guard, 'conoce_matricula:si'), EmisionBloqueadaError)
    assert.equal(await marco.locator('#ng-x1-nx-radio-9-input').isChecked(), false)
  } finally {
    await b.context.close()
  }
})

test('H2: «SIGUIENTE» con otra pestaña seleccionada → ErrorMapaIncompleto con inventario y NO se pulsa', async () => {
  const { context, page, ctx, pulsados } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    await marco.evaluate(() => { const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[2].setAttribute('aria-selected', 'true') })
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
    assert.ok(!pulsados.includes('SIGUIENTE'))
  } finally {
    await context.close()
  }
})

test('H5: «SIGUIENTE» con aria-disabled="true" cuenta como deshabilitado (no se pulsa)', async () => {
  const { context, page, ctx, pulsados } = await abrir({ siguienteAria: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
    await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && /qué falta/.test((e as Error).message))
    assert.ok(!pulsados.includes('SIGUIENTE'))
  } finally {
    await context.close()
  }
})

// ───────────── v0.6.1: zona `appArea`, resto del paso y frontera bancaria ─────────────

test('v0.6.1 puros: tipo de tomador inequívoco, grupo completo y plan sin valores de cajón ni campos de pago', () => {
  assert.equal(tipoTomadorTurismos({ documentoTomador: '00000000T' }), 'fisica')
  assert.equal(tipoTomadorTurismos({ documentoTomador: null, datosTomador: { tipo: 'juridica', razonSocial: 'X' } }), 'juridica')
  assert.equal(tipoTomadorTurismos({ documentoTomador: '00000000T', datosTomador: { tipo: 'juridica', razonSocial: 'X' } }), null, 'si se contradicen, no consta')
  assert.equal(tipoTomadorTurismos({}), null)
  assert.ok(grupoOpcionesTurismosCasa(['Individual Individual', 'Empresa Empresa'], ['Individual', 'Empresa']))
  assert.ok(!grupoOpcionesTurismosCasa(['Individual'], ['Individual', 'Empresa']), 'de menos')
  assert.ok(!grupoOpcionesTurismosCasa(['Sí', 'No', 'Quizá'], ['Sí', 'No']), 'de más')
  assert.ok(!grupoOpcionesTurismosCasa(['Sí', 'Sí'], ['Sí', 'No']), 'repetida')

  const completo = planDatosTurismos(FORM_COMPLETO)
  assert.deepEqual(completo.operaciones.map((o) => (o.tipo === 'opcion' ? o.clave : o.tipo === 'texto' ? o.etiqueta : 'Localidad')), [
    'garaje:calle', 'tomador:individual', 'Número de documento', 'Código postal', 'Localidad', 'Fecha de nacimiento del conductor', 'Fecha de expedición de carnet',
  ])
  assert.ok(completo.huecos.some((h) => /segundo conductor/.test(h)), 'segundo conductor: no consta ≠ «No»')
  assert.deepEqual(completo.huecos, [...HUECOS_FIJOS_TURISMOS], 'con riesgo completo solo quedan los huecos fijos')
  // Garaje: con garaje (colectivo o individual no consta) o sin dato → hueco, nunca «el parecido».
  assert.ok(planDatosTurismos({ ...FORM_COMPLETO, garajeNoche: true }).huecos.some((h) => /garaje.*colectivo o individual/.test(h)))
  assert.ok(planDatosTurismos({ ...FORM_COMPLETO, garajeNoche: null }).huecos.some((h) => /garaje \(no consta\)/.test(h)))
  // Sin CP del tomador → hueco de CP y localidad (nunca el de circulación).
  const sinCp = planDatosTurismos({ ...FORM_COMPLETO, tomador: { ...FORM_COMPLETO.tomador!, codigoPostal: null } })
  assert.ok(!sinCp.operaciones.some((o) => (o.tipo === 'texto' && o.etiqueta === 'Código postal') || o.tipo === 'localidad'))
  assert.ok(sinCp.huecos.some((h) => /CP del tomador/.test(h)))
  // Sin documento ni población: huecos.
  const pobre = planDatosTurismos(FORM)
  for (const re of [/Número de documento/, /Localidad/, /tipo de tomador/]) assert.ok(pobre.huecos.some((h) => re.test(h)), String(re))
  // Frontera: el plan nunca nombra un campo bancario, y ningún hueco lleva un valor del riesgo.
  for (const o of completo.operaciones) if (o.tipo === 'texto') assert.equal(senalCuentaBancaria([o.etiqueta]), null, o.etiqueta)
  const texto = [...completo.huecos, ...pobre.huecos].join(' ')
  for (const v of ['00000000T', '00000', 'Villaficticia', '1990', '0000BBB']) assert.ok(!texto.includes(v), `sin «${v}» en los huecos`)
})

for (const sinContenedor of [false, true]) {
  test(`v0.6.1 paso completo (${sinContenedor ? 'sin #appArea: body y fuera de <header>' : 'contenedor #appArea'}): rellena lo inequívoco, deja huecos y SIGUIENTE → hueco con inventario`, async () => {
    const { context, page, ctx, pulsados } = await abrir({ sinContenedor })
    try {
      const marco = await marcoFormularioTurismos(page, 5_000)
      assert.deepEqual(await rellenarDatosVehiculoTurismos(page, marco, FORM_COMPLETO, ctx), [])
      const huecos = await rellenarDatosRiesgoTurismos(page, marco, FORM_COMPLETO, ctx)
      const valor = (id: string) => marco.locator(`#${id}`).inputValue()
      const marcado = (id: string) => marco.locator(`#${id}`).isChecked()
      assert.equal(await campoTurismos(marco, 'Matrícula').inputValue(), FORM_COMPLETO.matricula)
      assert.equal(await marco.locator('#ng-h-busca').inputValue(), '', 'el buscador de la cabecera no se toca')
      assert.equal(await marcado('ng-x1-garaje-0'), true, 'En la calle')
      assert.equal(await marcado('ng-x1-tomador-0'), true, 'Individual')
      assert.equal(await marcado('ng-x1-segundo-1'), false, 'segundo conductor: no se marca «No»')
      assert.equal(await marcado('ng-x1-segundo-0'), false)
      for (const g of ['compra', 'uso']) for (let i = 0; i < 3; i++) assert.equal(await marcado(`ng-x1-${g}-${i}`), false, `${g} no se toca`)
      assert.equal(await valor('ng-x1-doc'), '00000000T')
      assert.equal(await valor('ng-x1-cp'), '00000')
      assert.equal(await valor('ng-x1-loc'), 'Villaficticia')
      assert.equal(await valor('ng-x1-fnac'), '03/02/1990')
      assert.equal(await valor('ng-x1-fcar'), '05/04/2010')
      for (const id of ['ng-x1-efecto', 'ng-x1-ant', 'ng-x1-col', 'ng-x1-prov', 'ng-x1-pob', 'ng-x1-via', 'ng-x1-num', 'ng-x1-iban', 'ng-x1-bic']) assert.equal(await valor(id), '', `${id} vacío`)
      assert.deepEqual(await marco.evaluate(() => (window as unknown as { __tocados: string[] }).__tocados), [], 'IBAN/BIC ni se enfocan')
      assert.deepEqual(huecos, [...HUECOS_FIJOS_TURISMOS])
      assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo', 'opcion:garaje:calle', 'opcion:tomador:individual'])
      // Con huecos, «SIGUIENTE» NO se pulsa (aunque esté habilitado): hueco con inventario y la lista.
      assert.equal(await botonTurismos(marco, 'SIGUIENTE').isEnabled(), true)
      await assert.rejects(avanzarDesdeDatosVehiculo(page, marco, ctx, 3_000, huecos), (e: unknown) => {
        const m = (e as Error).message
        return e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /no se pulsa con huecos/.test(m) && /fecha de efecto/.test(m) && !/00000000T|Villaficticia|0000BBB|1990/.test(m)
      })
      assert.ok(!pulsados.includes('SIGUIENTE'), 'SIGUIENTE no se pulsa con huecos')
      assert.equal(await marco.locator('#paso1').isVisible(), true)
    } finally {
      await context.close()
    }
  })
}

test('v0.6.1 «Localidad» desplegable: no se elige (sin puerta) → hueco, y el desplegable queda intacto', async () => {
  const { context, page, ctx } = await abrir({ localidadSelect: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM_COMPLETO, ctx)
    const huecos = await rellenarDatosRiesgoTurismos(page, marco, FORM_COMPLETO, ctx)
    assert.ok(huecos.some((h) => /«Localidad» \(no es un campo de texto/.test(h)))
    assert.equal(await marco.locator('#ng-x1-loc').inputValue(), '')
  } finally {
    await context.close()
  }
})

test('v0.6.1 FRONTERA BANCARIA: IBAN/BIC nunca se escriben; con IBAN visible se para antes de tocar nada', async () => {
  // a) El campo de IBAN/BIC (aunque esté oculto en otro paso) no pasa `comprobarCampo`.
  const a = await abrir()
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    for (const etq of ['IBAN', 'BIC/SWIFT']) await assert.rejects(comprobarCampo(marco.locator(`label:text-is("${etq}") + input`)), ErrorFronteraEmision, etq)
    assert.ok(!Object.values(ETIQUETAS_TURISMOS).some((e) => senalCuentaBancaria([e]) !== null), 'ninguna etiqueta del mapa es bancaria')
  } finally {
    await a.context.close()
  }
  // b) IBAN visible en pantalla: la primera puerta (marcar «Sí») ya para; ni matrícula ni IBAN/BIC tocados, nada pulsado.
  const b = await abrir({ ibanVisible: true })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(b.page, marco, FORM_COMPLETO, b.ctx), ErrorFronteraEmision)
    await assert.rejects(rellenarDatosRiesgoTurismos(b.page, marco, FORM_COMPLETO, b.ctx), ErrorFronteraEmision)
    assert.deepEqual(b.pulsados, [])
    for (const id of ['ng-x1-nx-input-12', 'ng-x1-doc', 'ng-x1-iban', 'ng-x1-bic']) assert.equal(await marco.locator(`#${id}`).inputValue(), '', id)
    assert.deepEqual(await marco.evaluate(() => (window as unknown as { __tocados: string[] }).__tocados), [])
  } finally {
    await b.context.close()
  }
})

test('v0.6.1 puerta de opciones: grupo de más/de menos → hueco (no_unica), sin pulsar; el segundo conductor no está en la lista', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    // Quitamos «En un garaje individual»: el grupo ya no es el del inventario → no_unica (hueco), sin pulsar.
    await marco.evaluate(() => document.querySelector('#ng-x1-garaje-2')!.parentElement!.remove())
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'garaje:calle'), { estado: 'no_unica', coincidencias: 0 })
    assert.equal(await marco.locator('#ng-x1-garaje-0').isChecked(), false)
    // Segundo conductor: fuera de la lista cerrada (no consta en el riesgo) → bloqueo, nada pulsado.
    await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, 'segundo_conductor:no'), EmisionBloqueadaError)
    assert.equal(await marco.locator('#ng-x1-nx-radio-10-input').isChecked(), false)
    assert.equal(await marco.locator('#ng-x1-segundo-1').isChecked(), false)
  } finally {
    await context.close()
  }
})

test('v0.6.1 modal de vehículos tras «Encuentra mi vehículo» (fuera de appArea): hueco CON inventario y nada pulsado dentro', async () => {
  const { context, page, ctx, pulsados } = await abrir({ modal: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismos(page, marco, FORM_COMPLETO, ctx), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /modal con la lista de vehículos/.test((e as Error).message))
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'], 'ni un clic en el modal')
  } finally {
    await context.close()
  }
})

test('v0.6.1 radios SIN `name`: los hermanos salen del contenedor de grupo; «¿Conoces la matrícula? = Sí» y el garaje siguen funcionando', async () => {
  const { context, page, ctx, pulsados } = await abrir({ sinName: true })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    assert.equal(await marco.locator('input[type=radio][name]').count(), 0, 'el fixture no tiene `name`')
    await rellenarDatosVehiculoTurismos(page, marco, FORM_COMPLETO, ctx)
    assert.equal(await marco.locator('#ng-x1-nx-radio-9-input').isChecked(), true)
    await rellenarDatosRiesgoTurismos(page, marco, FORM_COMPLETO, ctx)
    assert.equal(await marco.locator('#ng-x1-garaje-0').isChecked(), true)
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo', 'opcion:garaje:calle', 'opcion:tomador:individual'])
  } finally {
    await context.close()
  }
})
