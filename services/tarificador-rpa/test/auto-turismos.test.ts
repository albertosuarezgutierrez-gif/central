// Allianz AUTOS Turismos v0.6.1 (15/10/2026): marco del motor `ngx-motor-azs`, controles por etiqueta/rol accesible acotados a la
// zona `appArea` (la cabecera con «Matrícula» del colaborador/buscador ya no cuenta) y paso 1 «Datos del vehículo» completo
// (garaje, tomador, conductor; IBAN/BIC nunca). Portal SINTÉTICO (Angular de mentira con la estructura del inventario saneado; ids
// dinámicos a propósito, matrícula, documento y fechas FICTICIOS) servido con `context.route`: ni red ni datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { EmisionBloqueadaError, senalCuentaBancaria, supuestosAuto, type FormularioAuto } from '@central/module-tarificacion'
import { pideInventarioDom } from '../src/errores.ts'
import {
  ErrorFronteraEmision,
  esAppTurismosAllianz,
  grupoOpcionesTurismosCasa,
  instalarGuardEmision,
  leerTarjetasVehiculoTurismosAllianz,
  marcarOpcionTurismosAllianz,
  marcarTarjetaVehiculoTurismosAllianz,
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
  decidirTarjetaVehiculoTurismos,
  ENCABEZADO_TARJETAS_VEHICULO,
  marcoFormularioTurismos,
  ofertasDesdePaquetesTurismos,
  rellenarDatosRiesgoTurismos,
  supuestosAplicadosTurismos,
  rellenarDatosVehiculoTurismos,
  rellenarDatosVehiculoTurismosConSupuesto,
  unirSupuestoVersion,
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

/** v0.6.3: carcasa con la CABECERA real de ePac en el marco principal (atasco del 17/10/2026: desplegable de mediador y buscador). */
const CABECERA_CARCASA = `<nx-header><label id="ng-c-lbl">Matrícula</label><nx-dropdown role="combobox" tabindex="0" aria-labelledby="ng-c-lbl"></nx-dropdown><input id="ng-c-nx-input-9" name="target" role="searchbox" type="text" aria-labelledby="ng-c-lbl" placeholder="Buscar Aquí..."></nx-header>`
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
  /** v0.6.3 (trabajo real del 17/10/2026): una SEGUNDA «Matrícula» dentro del marco `appArea` (oculta, deshabilitada o visible). */
  matriculaExtra?: 'oculta' | 'deshabilitada' | 'visible'
  /** v0.6.3: la cabecera de ePac (desplegable de mediador + buscador «Buscar Aquí...») en el MARCO PRINCIPAL, fuera del iframe. */
  cabeceraFuera?: boolean
  /** v0.6.4 (inventario real del trabajo ebe2bb1e, 17/10/2026): «Encuentra mi vehículo» pinta TARJETAS seleccionables en `appArea`
   * (control con id `…-nx-selectable-card-N`, sin `name`, oculto a la vista, y su `<label for>` hermano), bajo «Detalles del
   * vehículo»; ni modal ni `<select>` «Versión»; «SIGUIENTE» se habilita al elegir una. Etiquetas de catálogo FICTICIAS. */
  tarjetas?: string[]
  /** Índice de la tarjeta que el portal deja ya elegida. */
  tarjetaMarcada?: number
  /** Encabezado sobre las tarjetas (por defecto el real, «Detalles del vehículo»). */
  encabezadoTarjetas?: string
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
  ${o.matriculaExtra === 'oculta' ? '<label for="ng-x1-nx-input-300">Matrícula</label><input id="ng-x1-nx-input-300" type="text" style="display:none">' : ''}
  ${o.matriculaExtra === 'deshabilitada' ? '<label for="ng-x1-nx-input-301">Matrícula</label><input id="ng-x1-nx-input-301" type="text" disabled>' : ''}
  <div role="radiogroup" aria-labelledby="ng-x1-nx-label-5"><label id="ng-x1-nx-label-5">¿Conoces la matrícula del vehículo?</label>
  ${radio('ng-x1-nx-radio-9-input', 'ng-x1-nx-radio-group-4', 'Sí')}${radio('ng-x1-nx-radio-10-input', 'ng-x1-nx-radio-group-4', o.sisDuplicados ? 'Sí' : 'No')}</div>
  <div id="bloqueMatricula" hidden>
    <label for="ng-x1-nx-input-12">Matrícula</label><input id="ng-x1-nx-input-12" type="text" required>
    <button type="button" id="ng-x1-btn-77" disabled>Encuentra mi vehículo</button>
    ${o.matriculaExtra === 'visible' ? '<label for="ng-x1-nx-input-302">Matrícula</label><input id="ng-x1-nx-input-302" type="text">' : ''}
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
${o.cabeceraFuera ? '' : o.sinContenedor ? `<header>${cabecera}</header>` : `<nx-header-actions>${cabecera}</nx-header-actions>`}
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
    ${o.tarjetas ? `const t = document.createElement('div'); t.innerHTML = ${JSON.stringify(`<h3>${o.encabezadoTarjetas ?? 'Detalles del vehículo'}</h3>` + o.tarjetas.map((e, i) => `<span><input type="radio" id="ng-x1-nx-selectable-card-24${i}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);opacity:0"${o.tarjetaMarcada === i ? ' checked' : ''}><label for="ng-x1-nx-selectable-card-24${i}">${e}</label></span>`).join(''))}; $('#ng-x1-btn-77').after(t);
      t.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { $('#ng-x1-btn-99').disabled = false; }));
      return;` : ''}
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
    const carcasa = o.cabeceraFuera ? CARCASA.replace('<h1>ePac</h1>', `<h1>ePac</h1>${CABECERA_CARCASA}`) : CARCASA
    const body = u.hostname === 'cloud.e-pacallianz.com' ? app(o) : carcasa.replace('/ngx-motor-azs/', rutaMotor)
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
    marcarTarjetaVehiculoTurismos: async (m: Frame, indice: number, etiqueta: string) => {
      const r = await marcarTarjetaVehiculoTurismosAllianz(m, guard, indice, etiqueta)
      if (r.estado === 'marcada') pulsados.push(`tarjeta:${indice}`)
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
  assert.deepEqual(OPCIONES_TURISMOS_ALLIANZ.map((o) => o.clave), [
    'conoce_matricula:si', 'garaje:calle', 'garaje:colectivo', 'garaje:individual', 'tomador:individual', 'tomador:empresa',
    'compra:nuevo', 'compra:ya_lo_tenia', 'uso:ocasional', 'uso:diario', 'uso:laboral', 'segundo_conductor:no',
    'tomador_propietario:si', 'tomador_conduce:si',
  ])
  // v0.6.5: cada clave con SU paso (HTML real 590a330e): tomador, propietario, conductor y segundo conductor son de «Datos personales».
  const deP2 = OPCIONES_TURISMOS_ALLIANZ.filter((o) => o.paso === 'Datos personales').map((o) => o.clave)
  assert.deepEqual(deP2, ['tomador:individual', 'tomador:empresa', 'segundo_conductor:no', 'tomador_propietario:si', 'tomador_conduce:si'])
  assert.ok(OPCIONES_TURISMOS_ALLIANZ.every((o) => o.paso === 'Datos personales' || o.paso === 'Datos del vehículo'))
  // Propietario/conductor: solo «Sí» (el «No» abre los datos de otra persona). El segundo conductor, solo como interruptor APAGADO.
  assert.ok(!OPCIONES_TURISMOS_ALLIANZ.some((o) => /^tomador_(propietario|conduce):no$/.test(o.clave)))
  assert.equal(OPCIONES_TURISMOS_ALLIANZ.find((o) => o.clave === 'segundo_conductor:no')?.interruptor, true)
  // v0.6.2: compra/uso/segundo conductor entran (supuestos declarados), pero nunca la 2ª mano (ningún dato la pide), el segundo
  // conductor «Sí» (datos de otra persona) ni nada de pago.
  for (const o of OPCIONES_TURISMOS_ALLIANZ) {
    assert.ok(!/2ª mano|concesionario|particular/i.test(o.opcion), o.clave)
    assert.ok(!(o.pregunta === 'Segundo conductor' && o.opcion === 'Sí'), o.clave)
    assert.equal(senalCuentaBancaria([o.opcion, o.pregunta, ...o.grupo]), null, o.clave)
  }
})

test('versión del bot de Allianz Turismos', () => {
  assert.equal(allianzAuto.version, '0.6.38')
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

test('v0.6.3 (atasco real 17/10/2026): cabecera en el marco principal + DOS «Matrícula» en appArea, una oculta o deshabilitada → la única visible y editable', async () => {
  for (const extra of ['oculta', 'deshabilitada'] as const) {
    const { context, page, ctx, pulsados } = await abrir({ cabeceraFuera: true, matriculaExtra: extra })
    try {
      // El fixture reproduce el atasco: la cabecera vive en el marco PRINCIPAL y en el marco `appArea` hay dos «Matrícula».
      assert.ok((await page.mainFrame().getByLabel('Matrícula', { exact: true }).count()) >= 2, 'cabecera con «Matrícula» fuera del iframe')
      const marco = await marcoFormularioTurismos(page, 5_000)
      assert.equal(marco.name(), 'appArea')
      await rellenarDatosVehiculoTurismos(page, marco, FORM, ctx)
      assert.equal(await marco.locator('#ng-x1-nx-input-12').inputValue(), FORM.matricula, `${extra}: se escribe en la visible y editable`)
      assert.equal(await marco.locator(extra === 'oculta' ? '#ng-x1-nx-input-300' : '#ng-x1-nx-input-301').inputValue(), '', `${extra}: la descartada no se toca`)
      assert.equal(await page.mainFrame().locator('#ng-c-nx-input-9').inputValue(), '', 'el buscador de la cabecera no se toca')
      assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'])
    } finally {
      await context.close()
    }
  }
})

test('v0.6.3: DOS «Matrícula» visibles y editables en appArea → sigue siendo hueco con inventario (no se adivina) y no se escribe nada', async () => {
  const { context, page, ctx, pulsados } = await abrir({ cabeceraFuera: true, matriculaExtra: 'visible' })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await assert.rejects(
      rellenarDatosVehiculoTurismos(page, marco, FORM, ctx),
      (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && /«Matrícula» \(hay 2, se esperaba uno\)/.test((e as Error).message),
    )
    assert.equal(await marco.locator('#ng-x1-nx-input-12').inputValue(), '')
    assert.equal(await marco.locator('#ng-x1-nx-input-302').inputValue(), '')
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si'], 'no se pulsa «Encuentra mi vehículo»')
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

test('varias versiones SIN elección → ErrorEleccionVersion con todas y SIN fijar ninguna (v0.6.17, nunca la primera); con elección explícita → la elegida, sin supuesto', async () => {
  const versiones: Array<[string, string]> = [['A1', 'Version A 90 CV'], ['B2', 'Version B 120 CV']]
  const a = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    const antes = await marco.getByLabel('Versión').inputValue()
    await assert.rejects(rellenarDatosVehiculoTurismosConSupuesto(a.page, marco, FORM, a.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.map((o) => o.etiqueta).join('|') === 'Version A 90 CV|Version B 120 CV' && !JSON.stringify(e.opcionesVersion).includes(FORM.matricula))
    assert.equal(await marco.getByLabel('Versión').inputValue(), antes, 'el desplegable no se tocó')
    assert.equal(unirSupuestoVersion(null, 'Precio con supuestos: uso diario.'), 'Precio con supuestos: uso diario.')
  } finally {
    await a.context.close()
  }
  const b = await abrir({ versiones })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    const r = await rellenarDatosVehiculoTurismosConSupuesto(b.page, marco, { ...FORM, eleccionVersion: { codigo: 'B2', etiqueta: 'Version B 120 CV' } }, b.ctx)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'B2')
    assert.equal(r.supuestoVersion, null)
  } finally {
    await b.context.close()
  }
})

test('v0.6.18 · versiones EQUIVALENTES (Terracan: GL/GLS/Full, 163 CV, diésel) → se elige SOLA la primera y se DECLARA; diferencias MATERIALES (CV/combustible) → ErrorEleccionVersion', async () => {
  const equivalentes: Array<[string, string]> = [['T1', 'Tipo de combustible Diésel Versión 2.9 CRDI 163 GL 163 CV'], ['T2', 'Tipo de combustible Diésel Versión 2.9 CRDI 163 GLS 163 CV'], ['T3', 'Tipo de combustible Diésel Versión 2.9 CRDI 163 FULL 163 CV']]
  const a = await abrir({ versiones: equivalentes })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, marco, FORM, a.ctx)
    assert.equal(await marco.getByLabel('Versión').inputValue(), 'T1', 'la primera del portal (sin fechas)')
    assert.equal(r.supuestoVersion, 'Versión elegida automáticamente: Tipo de combustible Diésel Versión 2.9 CRDI 163 GL 163 CV (había 3 equivalentes; revisar en la emisión)')
    assert.match(unirSupuestoVersion(r.supuestoVersion, 'Precio con supuestos: uso diario.')!, /^Precio con supuestos: Versión elegida automáticamente: .*revisar en la emisión\), uso diario\.$/)
  } finally {
    await a.context.close()
  }
  const b = await abrir({ versiones: [['T1', 'Tipo de combustible Diésel Versión 2.9 CRDI 163 CV'], ['G1', 'Tipo de combustible Gasolina Versión 3.5 V6 163 CV']] })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    const antes = await marco.getByLabel('Versión').inputValue()
    await assert.rejects(rellenarDatosVehiculoTurismosConSupuesto(b.page, marco, FORM, b.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 2)
    assert.equal(await marco.getByLabel('Versión').inputValue(), antes, 'material: el desplegable no se tocó')
  } finally {
    await b.context.close()
  }
})

test('v0.6.18 · tarjetas EQUIVALENTES (Terracan, 5 versiones GL/GLS/Full, 163 CV, 2902 cc, diésel) → elige sola la primera y declara; con la elección de la bandeja, la exacta y sin supuesto', () => {
  const T = ['GL', 'GLS', 'FULL', 'GLS AUTOMATICO', 'FULL AUTOMATICO'].map((a) => ({ etiqueta: `Marca del vehículo HYUNDAI Modelo Terracan Tipo de combustible Diésel Versión 2.9 CRDI 163 ${a} 163 CV 2902 cc`, marcada: false }))
  const r = decidirTarjetaVehiculoTurismos(T, FORM)
  assert.equal(r.indice, 0)
  assert.equal(r.supuesto, `Versión elegida automáticamente: ${T[0]!.etiqueta} (había 5 equivalentes; revisar en la emisión)`)
  assert.deepEqual(decidirTarjetaVehiculoTurismos(T, { ...FORM, eleccionVersion: { codigo: null, etiqueta: T[3]!.etiqueta } }), { indice: 3, supuesto: null })
  assert.throws(() => decidirTarjetaVehiculoTurismos(T, { ...FORM, eleccionVersion: { codigo: null, etiqueta: 'OTRA COSA' } }), (e: unknown) => e instanceof ErrorEleccionVersion, 'una elección que no casa se vuelve a preguntar, no se elige otra')
  // La fecha de matriculación elige entre equivalentes con fechas (aquí las tarjetas no las traen → la primera).
  assert.equal(decidirTarjetaVehiculoTurismos(T, { ...FORM, fechaMatriculacion: '2005-03-01' }).indice, 0)
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

test('v0.6.1 puerta de opciones: grupo de más/de menos → hueco (no_unica), sin pulsar; el segundo conductor «Sí» no está en la lista', async () => {
  const { context, page, guard } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    // Quitamos «En un garaje individual»: el grupo ya no es el del inventario → no_unica (hueco), sin pulsar.
    await marco.evaluate(() => document.querySelector('#ng-x1-garaje-2')!.parentElement!.remove())
    assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'garaje:calle'), { estado: 'no_unica', coincidencias: 0 })
    assert.equal(await marco.locator('#ng-x1-garaje-0').isChecked(), false)
    // Segundo conductor «Sí» y cualquier 2ª mano: fuera de la lista cerrada → bloqueo, nada pulsado.
    for (const clave of ['segundo_conductor:si', 'compra:segunda_mano_concesionario', 'compra:segunda_mano_particular']) await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, clave), EmisionBloqueadaError, clave)
    assert.equal(await marco.locator('#ng-x1-segundo-0').isChecked(), false)
    // v0.6.5: el segundo conductor y el tomador son de «Datos personales»: con «Datos del vehículo» seleccionado → bloqueo, nada pulsado.
    for (const clave of ['segundo_conductor:no', 'tomador:individual', 'tomador_conduce:si']) await assert.rejects(marcarOpcionTurismosAllianz(marco, guard, clave), EmisionBloqueadaError, clave)
    assert.equal(await marco.locator('#ng-x1-segundo-1').isChecked(), false)
    assert.equal(await marco.locator('#ng-x1-tomador-0').isChecked(), false)
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
    assert.equal(await marco.locator('#ng-x1-uso-1').isChecked(), true, 'uso a diario sin `name`')
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo', 'opcion:compra:ya_lo_tenia', 'opcion:uso:diario', 'opcion:garaje:calle'])
  } finally {
    await context.close()
  }
})

test('revisión 15/10/2026: una opción supuesta que NO queda marcada en el portal no se declara', async () => {
  const { context, page, ctx } = await abrir()
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await rellenarDatosVehiculoTurismos(page, marco, FORM_COMPLETO, ctx)
    // Grupo del uso roto (una opción menos): «uso diario» acaba en hueco y no puede salir entre los supuestos.
    await marco.evaluate(() => document.querySelector('#ng-x1-uso-2')!.parentElement!.remove())
    const HOY = new Date('2026-10-15T10:00:00Z')
    const { huecos, supuestos } = await rellenarDatosRiesgoTurismos(page, marco, FORM_COMPLETO, ctx, HOY)
    assert.ok(huecos.some((h) => /cómo se marca el uso/.test(h)))
    // v0.6.5: este tramo solo es «Datos del vehículo» (efecto y segundo conductor son de otros pasos).
    assert.equal(supuestos, 'Precio con supuestos: ya lo tenía (cambio de seguro).')
  } finally {
    await context.close()
  }
})

// ── v0.6.4: tarjetas de vehículo tras «Encuentra mi vehículo» (estructura del inventario real del trabajo ebe2bb1e) ──
const TARJETAS = [
  'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.0 CRDI 90 CV',
  'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.0 CRDI 120 CV',
  'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.9 CRDI 150 CV',
  'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Gasolina Versión 3.5 V6 195 CV',
  'Marca del vehículo MARCAFICT Modelo Alfa Tipo de combustible Diésel Versión 2.9 CRDI 163 CV',
]
const marcadas = (marco: Frame) => marco.locator('input[id*="-nx-selectable-card-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked))

test('v0.6.17 (atasco real ebe2bb1e): 5 tarjetas sin elección → ErrorEleccionVersion con el texto exacto de las 5, sin pulsar NINGUNA tarjeta ni «SIGUIENTE»', async () => {
  const { context, page, ctx, pulsados } = await abrir({ tarjetas: TARJETAS })
  try {
    const marco = await marcoFormularioTurismos(page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismosConSupuesto(page, marco, FORM, ctx), (e: unknown) =>
      e instanceof ErrorEleccionVersion && e.tipo === 'eleccion' && e.opcionesVersion.length === 5 && e.opcionesVersion.every((o, i) => o.etiqueta === TARJETAS[i]) && !JSON.stringify(e.opcionesVersion).includes(FORM.matricula))
    assert.equal(await marco.getByRole('heading', { name: ENCABEZADO_TARJETAS_VEHICULO }).count(), 1, 'el fixture reproduce el encabezado real')
    assert.equal(await modalTurismosCount(marco), 0, 'ni modal')
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
    assert.deepEqual(pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'])
  } finally {
    await context.close()
  }
})

test('v0.6.4: tarjetas con elección de la bandeja (por etiqueta) o por similitud con el vehículo confirmado → esa, sin supuesto; una sola → esa', async () => {
  const casos: Array<[Partial<FormularioAuto>, string[], boolean[]]> = [
    [{ eleccionVersion: { codigo: null, etiqueta: TARJETAS[2]! } }, TARJETAS, [false, false, true, false, false]],
    [{ vehiculoConfirmado: { origen: 'mapfre', denominacion: 'ALFA 2.0 CRDI', cv: 118, cc: null, puertas: null, fechaInicio: null } }, TARJETAS, [false, true, false, false, false]],
    [{}, [TARJETAS[3]!], [true]],
  ]
  for (const [extra, tarjetas, esperado] of casos) {
    const { context, page, ctx } = await abrir({ tarjetas })
    try {
      const marco = await marcoFormularioTurismos(page, 5_000)
      const r = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, { ...FORM, ...extra }, ctx)
      assert.deepEqual(await marcadas(marco), esperado, JSON.stringify(extra))
      assert.equal(r.supuestoVersion, null)
    } finally {
      await context.close()
    }
  }
})

test('v0.6.4: elección de la bandeja que no casa → ErrorEleccionVersion sin pulsar tarjeta; tarjeta ya elegida por el portal → no se pulsa', async () => {
  const a = await abrir({ tarjetas: TARJETAS })
  try {
    const marco = await marcoFormularioTurismos(a.page, 5_000)
    await assert.rejects(rellenarDatosVehiculoTurismosConSupuesto(a.page, marco, { ...FORM, eleccionVersion: { codigo: null, etiqueta: 'OTRA' } }, a.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 5)
    assert.deepEqual(a.pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'])
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
  } finally {
    await a.context.close()
  }
  const b = await abrir({ tarjetas: TARJETAS, tarjetaMarcada: 0 })
  try {
    const marco = await marcoFormularioTurismos(b.page, 5_000)
    // Una tarjeta que el PORTAL trae marcada de partida no es una elección de la persona: se pregunta igual (v0.6.17).
    await assert.rejects(rellenarDatosVehiculoTurismosConSupuesto(b.page, marco, FORM, b.ctx), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 5)
    assert.deepEqual(b.pulsados, ['opcion:conoce_matricula:si', 'Encuentra mi vehículo'], 'ni un clic')
    assert.equal((await leerTarjetasVehiculoTurismosAllianz(marco)).length, 5)
  } finally {
    await b.context.close()
  }
})

test('v0.6.4: decidirTarjetaVehiculoTurismos (pura): sin tarjetas → hueco; varias sin elección → ErrorEleccionVersion (nunca la primera)', () => {
  const t = TARJETAS.map((etiqueta) => ({ etiqueta, marcada: false }))
  assert.throws(() => decidirTarjetaVehiculoTurismos([], FORM), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  assert.throws(() => decidirTarjetaVehiculoTurismos(t, FORM), (e: unknown) => e instanceof ErrorEleccionVersion && e.opciones.length === 5 && e.opciones[2]!.etiqueta === TARJETAS[2])
  assert.deepEqual(decidirTarjetaVehiculoTurismos(t.slice(0, 1), FORM), { indice: 0, supuesto: null })
  assert.deepEqual(decidirTarjetaVehiculoTurismos(t, { ...FORM, eleccionVersion: { codigo: null, etiqueta: TARJETAS[4]! } }), { indice: 4, supuesto: null })
})

const modalTurismosCount = (marco: Frame) => marco.locator('[role=dialog], [aria-modal=true]').count()

// ── v0.6.4: la PUERTA de guard.ts para las tarjetas (único camino que lee y marca su radio) ──
async function conTarjetas(o: Opc) {
  const a = await abrir(o)
  const marco = await marcoFormularioTurismos(a.page, 5_000)
  await marcarOpcionTurismosAllianz(marco, a.guard, 'conoce_matricula:si')
  await campoTurismos(marco, 'Matrícula').fill(FORM.matricula)
  await pulsar(botonTurismos(marco, 'Encuentra mi vehículo'), a.guard)
  await marco.locator('label[for="ng-x1-nx-selectable-card-240"]').waitFor()
  return { ...a, marco }
}

test('guard: marcarTarjetaVehiculoTurismosAllianz marca la nº i con SU etiqueta, una vez; ya elegida → no pulsa; etiqueta o índice que no casan → no_unica', async () => {
  const { context, marco, guard } = await conTarjetas({ tarjetas: TARJETAS })
  try {
    assert.deepEqual((await leerTarjetasVehiculoTurismosAllianz(marco)).map((t) => t.etiqueta), TARJETAS)
    assert.deepEqual(await marcarTarjetaVehiculoTurismosAllianz(marco, guard, 1, TARJETAS[0]!), { estado: 'no_unica', coincidencias: 1 }, 'índice y etiqueta no casan')
    assert.deepEqual(await marcarTarjetaVehiculoTurismosAllianz(marco, guard, 9, TARJETAS[0]!), { estado: 'no_unica', coincidencias: 1 })
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
    assert.deepEqual(await marcarTarjetaVehiculoTurismosAllianz(marco, guard, 2, TARJETAS[2]!), { estado: 'marcada' })
    assert.deepEqual(await marcarTarjetaVehiculoTurismosAllianz(marco, guard, 2, TARJETAS[2]!), { estado: 'ya_marcada' })
    assert.deepEqual(await marcadas(marco), [false, false, true, false, false])
  } finally {
    await context.close()
  }
})

test('guard: tarjetas que NO están bajo «Detalles del vehículo» no existen para la puerta (no_unica, nada leído ni marcado)', async () => {
  const { context, marco, guard } = await conTarjetas({ tarjetas: TARJETAS, encabezadoTarjetas: 'Otra cosa' })
  try {
    assert.deepEqual(await leerTarjetasVehiculoTurismosAllianz(marco), [])
    assert.deepEqual(await marcarTarjetaVehiculoTurismosAllianz(marco, guard, 0, TARJETAS[0]!), { estado: 'no_unica', coincidencias: 0 })
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
  } finally {
    await context.close()
  }
})

test('guard: etiqueta pedida de contratación/pago o bancaria → RECHAZO (bloqueo) antes de mirar la pantalla, sin pulsar', async () => {
  const { context, marco, guard } = await conTarjetas({ tarjetas: TARJETAS })
  try {
    // Ninguna tarjeta tiene estas etiquetas: sin el veto de la puerta saldría `no_unica`, no un bloqueo.
    await assert.rejects(marcarTarjetaVehiculoTurismosAllianz(marco, guard, 0, 'Contratar'), (e: unknown) => e instanceof EmisionBloqueadaError && !(e instanceof ErrorFronteraEmision))
    await assert.rejects(marcarTarjetaVehiculoTurismosAllianz(marco, guard, 0, 'IBAN'), ErrorFronteraEmision)
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
  } finally {
    await context.close()
  }
})

test('guard: pestaña seleccionada distinta de «Datos del vehículo» → RECHAZO (fase) sin pulsar la tarjeta', async () => {
  const { context, marco, guard } = await conTarjetas({ tarjetas: TARJETAS })
  try {
    await marco.evaluate(() => { const t = document.querySelectorAll('nx-multi-step-item'); t[0].setAttribute('aria-selected', 'false'); t[1].setAttribute('aria-selected', 'true') })
    await assert.rejects(marcarTarjetaVehiculoTurismosAllianz(marco, guard, 0, TARJETAS[0]!), (e: unknown) => e instanceof EmisionBloqueadaError && !(e instanceof ErrorFronteraEmision))
    assert.deepEqual(await marcadas(marco), [false, false, false, false, false])
  } finally {
    await context.close()
  }
})

test('guard: una TARJETA del portal con texto de contratación, o un campo bancario visible en la pantalla → bloqueo sin pulsar', async () => {
  const a = await conTarjetas({ tarjetas: ['Contratar ahora este vehículo', TARJETAS[0]!] })
  try {
    await assert.rejects(marcarTarjetaVehiculoTurismosAllianz(a.marco, a.guard, 0, 'Contratar ahora este vehículo'), EmisionBloqueadaError)
    assert.deepEqual(await marcadas(a.marco), [false, false])
  } finally {
    await a.context.close()
  }
  const b = await conTarjetas({ tarjetas: TARJETAS })
  try {
    await b.marco.evaluate(() => { document.querySelector<HTMLElement>('#pago')!.hidden = false })
    await assert.rejects(marcarTarjetaVehiculoTurismosAllianz(b.marco, b.guard, 0, TARJETAS[0]!), ErrorFronteraEmision)
    assert.deepEqual(await marcadas(b.marco), [false, false, false, false, false])
  } finally {
    await b.context.close()
  }
})

// ───────────── v0.6.12: ofertas de «Selección de paquete» (PURO; importes INVENTADOS) ─────────────
const LECTURA_PAQUETES = {
  paquetes: [
    { nombre: 'Paquete A', primerRecibo: '100,00 €', anualidad: '1.234,56 €', mejorOpcion: false, conAviso: false },
    { nombre: 'Paquete B', primerRecibo: '', anualidad: '2.000,00 €', mejorOpcion: true, conAviso: false },
    { nombre: 'Paquete C', primerRecibo: '300,00 €', anualidad: 'consultar', mejorOpcion: false, conAviso: false },
  ],
  filas: [{ descripcion: 'Robo', celdas: [{ icono: 'minus', texto: '' }, { icono: 'check', texto: '' }, { icono: 'check', texto: '' }], opciones: [], comunes: [] }],
}

test('v0.6.12 ofertasDesdePaquetesTurismos (puro): N ofertas con supuestos en avisos; importe ilegible → fuera con aviso; recibo ilegible → solo sin recibo', () => {
  const o = ofertasDesdePaquetesTurismos(LECTURA_PAQUETES, 'Precio con supuestos: uso diario.')
  assert.deepEqual(o.map((x) => [x.producto, x.primaAnualEur, x.importeReciboEur, x.primaNetaEur, x.fraccionamiento]), [['Auto · Paquete A', 1234.56, 100, null, null], ['Auto · Paquete B', 2000, null, null, null]])
  for (const x of o) {
    assert.ok(x.avisos.includes('Precio con supuestos: uso diario.'))
    assert.ok(x.avisos.includes('Paquete «Paquete C» descartado: «la anualidad» no se pudo leer como importe.'))
  }
  assert.ok(o[1]!.avisos.includes('«Primer recibo» ilegible: importe del recibo no consta.') && !o[0]!.avisos.some((v) => v.includes('ilegible')))
  assert.deepEqual(o[0]!.coberturas.map((c) => [c.literal, c.estado]), [['Robo', 'excluida']])
  assert.deepEqual(o[1]!.coberturas.map((c) => [c.literal, c.estado]), [['Robo', 'incluida']])
  // Ninguna anualidad legible → ninguna oferta (nunca se inventa); sin filas → coberturas no leídas.
  assert.deepEqual(ofertasDesdePaquetesTurismos({ paquetes: [LECTURA_PAQUETES.paquetes[2]!], filas: [] }), [])
  assert.ok(ofertasDesdePaquetesTurismos({ paquetes: [LECTURA_PAQUETES.paquetes[0]!], filas: [] })[0]!.avisos.includes('coberturas no leídas'))
})
