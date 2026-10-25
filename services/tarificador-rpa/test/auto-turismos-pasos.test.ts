// Allianz AUTOS Turismos v0.6.5 (17/10/2026): recorrido «Datos del vehículo» → «Datos personales» → «Antecedentes» con la
// ESTRUCTURA del HTML real del trabajo 590a330e (un `tabpanel` por paso, todos en el DOM y ocultos salvo el activo; tomador con
// `nx-circle-toggle-group` bajo `nx-x-common-header[text]`; TRES «Código postal»/«Localidad»; carné MM / AAAA; «Segundo conductor»
// como interruptor `role=switch`; «Compañía actual del vehículo» desplegable sin etiqueta de texto; fecha de efecto con min/max;
// «Nivel antecedentes» deshabilitado y «Colaborador» opcional en el panel de agente de «Selección de paquete»; botones « Siguiente »).
// Portal SINTÉTICO servido con `context.route` (ni red ni datos personales: documento, CP, población y fechas FICTICIOS).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Frame } from 'playwright'
import { EmisionBloqueadaError, senalCuentaBancaria, type FormularioAuto } from '@central/module-tarificacion'
import { ErrorTarificador, clasificar, pideInventarioDom } from '../src/errores.ts'
import { casarCompaniaActualTurismos, companiaActualTurismosAllianz, instalarGuardEmision, marcarAntecedenteTurismosAllianz, marcarOpcionTurismosAllianz, marcarTarjetaVehiculoTurismosAllianz, polizaActualTurismosAllianz, pulsar } from '../src/guard.ts'
import {
  ErrorMapaIncompleto,
  decidirCampoBloqueadoTurismos,
  normalizarValorCampoTurismos,
  SUPUESTO_COMPANIA_NO_CASA,
  SUPUESTO_COMPANIA_NO_CONSTA,
  SUPUESTO_PARTES_CULPABLES,
  SUPUESTO_TIEMPO_COMPANIA,
  SUPUESTO_TIEMPO_TITULAR,
  fichaTomadorTurismos,
  marcoFormularioTurismos,
  pasoActivoTurismos,
  planDatosTurismos,
  recorrerPasosTurismos,
  rellenarDatosVehiculoTurismosConSupuesto,
  HUECO_POLIZA_ACTUAL,
  SUPUESTO_POLIZA_FIJADA,
  obligatoriosPendientesTurismos,
  polizaActualUltimos5De,
  SUPUESTO_LOCALIDAD_PORTAL,
  SUPUESTO_CP_FIJADO_DISTINTO,
  SUPUESTO_LOCALIDAD_FIJADA_DISTINTA,
  SUPUESTO_TOMADOR_CONDUCE,
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
  garajeNoche: false,
  documentoTomador: '00000000T',
  tomador: { tipo: 'fisica', nombre: 'A', apellido1: 'B', apellido2: null, razonSocial: null, documentoIdentidad: '00000000T', fechaNacimiento: null, codigoPostal: '00000', poblacion: 'Villaficticia', direccion: null, telefono: null, email: null },
  // v0.6.17: con varias tarjetas el robot NO elige la primera; la persona (bandeja) eligió la primera.
  eleccionVersion: { codigo: null, etiqueta: 'Marca del vehículo MARCAFICT Modelo Alfa Versión 90 CV' },
}
const PERSONALES = ['00000000T', '00000', 'Villaficticia', '1990', '2010', '0000BBB']

const iso = (d: Date) => d.toISOString().slice(0, 10)
const masDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const dma = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

type Opc = {
  /** Lo que el portal propone en «Localidad» al teclear el CP del tomador (`null` = nada). */
  localidadPortal?: string | null
  /** El interruptor «Segundo conductor» viene ENCENDIDO (y habilitado). */
  segundoEncendido?: boolean
  /** Ninguna opción de propietario/conductor marcada de partida. */
  sinDefectos?: boolean
  /** Sin la cabecera `nx-x-common-header` en el formulario del conductor. */
  sinCabeceraConductor?: boolean
  /** Opciones del panel de «Compañía actual del vehículo» (overlay CDK fuera de `appArea`, solo al abrirlo). */
  companias?: string[]
  /** v0.6.8: cabecera de «Compañía actual» como en el HTML real 324ff9db: sin atributo `text` y dentro de un `div` (no hija directa del formulario). */
  cabeceraCompaniaReal?: boolean
  /** El desplegable de compañía ya enseña un valor. */
  companiaPrefijada?: string
  /** v0.6.6: «Código postal» del TOMADOR deshabilitado de partida con este valor ('' = vacío), como lo deja el portal real. */
  cpBloqueado?: string
  /** v0.6.6: «Localidad» del TOMADOR deshabilitada de partida con este valor. */
  locBloqueada?: string
  /** v0.6.10: «Antecedentes» SIN los tres grupos (tiempo en la compañía, partes culpables, tiempo como titular). */
  sinAntecedentes?: boolean
  /** v0.6.10: el grupo «tiempo en la compañía» con textos que no casan (la máxima solo se reconoce por ser la última). */
  antecedentesRaros?: boolean
  /** v0.6.10: el portal trae YA marcada la opción de este índice en el grupo (ant1 tiempo compañía, ant2 partes, ant3 titular). */
  antPrefijada?: Partial<Record<'ant1' | 'ant2' | 'ant3', number>>
  /** v0.6.11: input «Cinco últimos dígitos de la póliza actual» (`required`, maxlength 5) en «Antecedentes»: vacío, ya con valor, o deshabilitado y vacío. */
  poliza?: { valor?: string; bloqueada?: boolean }
  /** v0.6.11: un obligatorio AJENO al bot en «Antecedentes» que deja «Siguiente» deshabilitado (el atasco genérico). */
  obligatorioAjeno?: boolean
  /** v0.6.12: pantalla de precios de «Selección de paquete» (`app-price` → `nx-comparison-table`) con la ESTRUCTURA real e importes INVENTADOS. `vacia` = tabla sin cabeceras (como en el inventario). */
  paquetes?: 'completa' | 'ilegible' | 'sin_coberturas' | 'vacia'
}
/** v0.6.12: tabla comparativa con la estructura real de «Selección de paquete» (clases de Allianz; nombres, importes y límites inventados). */
function tablaPaquetes(modo: NonNullable<Opc['paquetes']>): string {
  if (modo === 'vacia') return '<app-price><nx-comparison-table></nx-comparison-table></app-price>'
  const cab = (nombre: string, primer: string, anual: string, extra = '', mejor = false) =>
    `<div class="nx-comparison-table__cell nx-comparison-table__header-cell"><div class="nx-comparison-table__cell-content"><div class="product-title-wrap${mejor ? ' best-option' : ''}"><div class="has-popover"><p class="nx-margin-0">${nombre}</p>${extra}</div><div><div><p class="price-first">${primer}&nbsp;€</p><p>primer recibo</p></div><div><p class="price-regular">${anual}&nbsp;€</p><p>la anualidad</p></div></div><button type="button" class="nx-comparison-table__select-button">Seleccionar</button></div></div></div>`
  const desc = (t: string) => `<div class="nx-comparison-table__description-cell"><div class="nx-comparison-table__cell-content"><div class="has-popover"><div>${t}</div></div></div></div>`
  const icono = (n: string) => `<div class="nx-comparison-table__cell"><nx-mt-coverage-option><form><nx-icon name="${n}"></nx-icon></form></nx-mt-coverage-option></div>`
  const desplegable = (t: string) => `<div class="nx-comparison-table__cell"><nx-mt-coverage-option><form><nx-dropdown><div class="nx-dropdown__container"><div class="nx-dropdown__rendered"><span>${t}</span></div></div></nx-dropdown></form></nx-mt-coverage-option></div>`
  const fila = (d: string, celdas: string) => `<nx-comparison-table-flex-row class="is-content-row"><div class="nx-comparison-table__row">${desc(d)}${celdas}</div></nx-comparison-table-flex-row>`
  const opcion = (t: string, marcada: boolean, extra = '') =>
    `<nx-radio><input type="radio" class="nx-radio__input"><label><div class="nx-radio__circle">${marcada ? '<div class="nx-radio__dot"></div>' : ''}</div><span class="nx-radio__label--text"><span>${t}&nbsp;</span>${extra ? `<span class="option-additional-text">${extra}</span>` : ''}</span></label></nx-radio>`
  const eleccion = (d: string, opciones: string) => `<nx-comparison-table-flex-row class="is-content-row has-intersection"><div class="nx-comparison-table__row">${desc(d)}<div class="nx-comparison-table__intersection-cell"><nx-radio-group>${opciones}</nx-radio-group></div></div></nx-comparison-table-flex-row>`
  const comunes = `<nx-comparison-table-flex-row class="is-content-row has-intersection"><div class="nx-comparison-table__row">${desc('Todos los paquetes incluyen')}<div class="nx-comparison-table__intersection-cell"><div class="common-coverages"><ul><li><span>RC Obligatoria</span><nx-icon name="info-circle-o"></nx-icon></li><li><span>Cristales</span></li></ul></div></div></div></nx-comparison-table-flex-row>`
  const anualB = modo === 'ilegible' ? 'pendiente' : '800,00'
  const cuerpo =
    modo === 'sin_coberturas'
      ? ''
      : fila('Daños propios', icono('minus') + icono('minus') + desplegable('Baja')) +
        fila('Fenómenos de la naturaleza', icono('minus') + desplegable('Sí') + icono('check')) +
        eleccion('Accidentes del conductor', opcion('30.000', false) + opcion('100.000', true, '[9.95 € Anual (sin impuestos)]')) +
        eleccion('Vehículo de sustitución', opcion('No Incluido', true) + opcion('Incluido', false, '[42.5 € Anual (sin impuestos)]')) +
        comunes +
        fila('Robo', icono('minus') + icono('check') + icono('check'))
  return `<app-price><nx-comparison-table><div><nx-comparison-table-flex-row class="is-header-row is-sticky-row"><div class="nx-comparison-table__row"><div class="nx-comparison-table__placeholder-cell"></div>${cab('Paquete Uno', '700,00', '710,00', '', true)}${cab('Paquete Dos', '780,00', anualB)}${cab('Paquete Tres', '1.100,50', '1.234,56', '<div><nx-icon name="exclamation-circle-warning"></nx-icon></div>')}</div></nx-comparison-table-flex-row>${cuerpo}</div></nx-comparison-table></app-price>`
}

const COMPANIAS = ['ASEGURADORA ALFA, S.A.', 'Beta Seguros y Reaseguros', 'Gamma Mutua', 'Otras compañías']

const TARJETAS = ['Marca del vehículo MARCAFICT Modelo Alfa Versión 90 CV', 'Marca del vehículo MARCAFICT Modelo Alfa Versión 120 CV']
const OCULTO = 'style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);opacity:0"'

function app(o: Opc = {}): string {
  const pasos = ['Datos del vehículo', 'Datos personales', 'Antecedentes', 'Selección de paquete', 'Datos', 'Revisión', 'Pago', 'Confirmación']
  const op = (id: string, name: string, etq: string, marcada = false) =>
    `<span><input type="radio" id="${id}" name="${name}" ${OCULTO}${marcada ? ' checked' : ''}><label for="${id}">${etq}</label></span>`
  const circulo = (id: string, etqs: string[], marcada: number | null) =>
    `<div><div><nx-circle-toggle-group role="radiogroup" aria-labelledby="ng-z-${id}-lbl" name="ng-z-${id}">${etqs.map((e, i) => `<nx-circle-toggle>${op(`ng-z-${id}-${i}`, `ng-z-${id}`, e, marcada === i)}</nx-circle-toggle>`).join('')}</nx-circle-toggle-group></div></div>`
  const cab = (t: string) => `<nx-x-common-header text="${t}"><div><div><h3>${t}</h3></div></div></nx-x-common-header>`
  const texto = (id: string, etq: string, extra = '') => `<label for="${id}">${etq}</label><input id="${id}" type="text" ${extra}>`
  const bloq = (v: string | undefined) => (v === undefined ? '' : ` disabled value="${v}" class="nx-input${v ? ' is-filled' : ''} is-disabled"`)
  const ubicacion = (n: number) =>
    `<nx-mt-person-location>${texto(`ng-z-cp${n}`, 'Código postal', n === 1 ? bloq(o.cpBloqueado) : '')}<label for="ng-z-loc${n}">Localidad</label><input id="ng-z-loc${n}" role="combobox" type="text" maxlength="50"${n === 1 ? bloq(o.locBloqueada) : ''}></nx-mt-person-location>`
  const nav = (primero: boolean) => `<nav><app-navigation-buttons>${primero ? '' : '<button type="button" class="ant"> Anterior </button>'}<button type="button" class="sig"> Siguiente </button></app-navigation-buttons></nav>`
  const def = o.sinDefectos ? null : 0
  const p1 = `
  <div role="radiogroup" aria-labelledby="ng-z-l5"><label id="ng-z-l5">¿Conoces la matrícula del vehículo?</label>${op('ng-z-cm-0', 'ng-z-cm', 'Sí')}${op('ng-z-cm-1', 'ng-z-cm', 'No')}</div>
  <div id="bloqueMatricula" hidden>${texto('ng-z-mat', 'Matrícula', 'required')}<button type="button" id="ng-z-enc" disabled>Encuentra mi vehículo</button></div>
  <nx-radio-toggle>${['Sí, lo he comprado nuevo', 'No, ya lo tenía y quiero cambiar de seguro', 'Sí, lo he comprado de 2ª mano a un particular', 'Sí, lo he comprado de 2ª mano a un concesionario'].map((e, i) => op(`ng-z-compra-${i}`, 'ng-z-compra', e)).join('')}</nx-radio-toggle>
  <nx-radio-toggle>${['Ocasional (fines de semana, vacaciones, etc)', 'A diario y fines de semana', 'Actividad laboral'].map((e, i) => op(`ng-z-uso-${i}`, 'ng-z-uso', e)).join('')}</nx-radio-toggle>
  <nx-radio-toggle>${['En la calle', 'En un garaje colectivo', 'En un garaje individual'].map((e, i) => op(`ng-z-garaje-${i}`, 'ng-z-garaje', e)).join('')}</nx-radio-toggle>`
  const p2 = `<app-holder>
  <nx-mt-person-information><form>${cab('¿Quién es el tomador?')}${circulo('tom', ['Individual Individual', 'Empresa Empresa'], 0)}
    <nx-mt-natural-person-information><label id="ng-z-ltd" for="ng-z-tdoc">Tipo de documento</label><nx-dropdown role="combobox" id="ng-z-tdoc" tabindex="0" aria-labelledby="ng-z-ltd">NIF</nx-dropdown>
    ${texto('ng-z-doc', 'Número de documento', 'required')}${ubicacion(1)}</nx-mt-natural-person-information></form></nx-mt-person-information>
  <nx-mt-owner-information><form>${cab('¿Es el tomador de la póliza el propietario?')}${circulo('prop', ['Sí Sí', 'No No'], def)}</form></nx-mt-owner-information>
  <nx-mt-person-information><form><nx-mt-natural-person-information>${ubicacion(2)}</nx-mt-natural-person-information></form></nx-mt-person-information>
  <nx-mt-driver-information><form>${o.sinCabeceraConductor ? '' : cab('El tomador ¿también conduce el vehículo?')}${circulo('cond', ['Sí Sí', 'No No'], def)}</form></nx-mt-driver-information>
  <nx-mt-natural-person-information>${ubicacion(3)}${texto('ng-z-fnac', 'Fecha de nacimiento del conductor', `max="${iso(masDias(-18 * 366))}T00:00:00Z"`)}${texto('ng-z-fcar', 'Fecha de expedición de carnet', `max="${iso(new Date())}T00:00:00Z"`)}</nx-mt-natural-person-information>
  <nx-mt-nominated-driver-information><form><nx-switcher><input type="checkbox" role="switch" id="ng-z-sw" ${o.segundoEncendido ? 'checked aria-checked="true"' : 'disabled aria-checked="false"'}><label for="ng-z-sw"> Segundo conductor </label></nx-switcher></form></nx-mt-nominated-driver-information>
  </app-holder>`
  const grupoAnt = (id: string, pregunta: string, etqs: string[]) =>
    `<div role="radiogroup" aria-labelledby="ng-z-${id}-q"><label id="ng-z-${id}-q">${pregunta}</label>${etqs.map((e, i) => op(`ng-z-${id}-${i}`, `ng-z-${id}`, e, o.antPrefijada?.[id as 'ant1'] === i)).join('')}</div>`
  const antecedentes = o.sinAntecedentes
    ? ''
    : grupoAnt('ant1', '¿Cuánto tiempo llevas en tu compañía?', o.antecedentesRaros ? ['Poco', 'Algo', 'Bastante', 'Mucho', 'Muchísimo', 'Más de cuatro'] : ['Menos de 1 año', '1 año', '2 años', '3 años', '4 años', '5 años o más']) +
      grupoAnt('ant2', '¿Has declarado algún parte culpable con contrario en los últimos 5 años?', ['No he declarado ningún parte', '1 parte', '2 partes', '3 partes o más']) +
      grupoAnt('ant3', '¿Cuánto tiempo llevas como titular de un seguro de vehículo?', ['Menos de 1 año', '1-2 años', '3-4 años', '5-6 años', '7-8 años', '9-10 años o más'])
  // Marcado REAL (documento 4ec62749): `for="null"` y el input en el nxrow HERMANO del nx-label.
  const polizaHtml = o.poliza ? `<div><nx-label><label class="nx-label__content" for="null" id="ng-z-nx-label-411">Cinco últimos dígitos de la póliza actual</label></nx-label><div nxrow><div nxcol="3"><nx-formfield class="no-formfield-label"><div><input id="ng-z-pol" nxinput maxlength="5" required type="text"${o.poliza.valor ? ` value="${o.poliza.valor}"` : ''}${o.poliza.bloqueada ? ' disabled' : ''}></div></nx-formfield></div></div></div>` : ''
  const ajenoHtml = o.obligatorioAjeno ? `<label for="ng-z-ajeno">Dato ajeno obligatorio *</label><input id="ng-z-ajeno" required type="text"><label for="ng-z-opc">Dato opcional</label><input id="ng-z-opc" type="text">` : ''
  const p3 = `<app-insurance><nx-mt-insured-policy-holder><form>${o.cabeceraCompaniaReal ? '<div nxlayout="grid nopadding"><nx-x-common-header><div><div><h3 class="nx-heading"><span>Compañía actual del vehículo</span></h3></div></div></nx-x-common-header></div>' : cab('Compañía actual del vehículo')}<label id="ng-z-l249" for="ng-z-dd250"></label><nx-dropdown role="combobox" id="ng-z-dd250" style="display:inline-block;min-width:120px;min-height:20px" tabindex="0" aria-labelledby="ng-z-l249" aria-controls="ng-z-nx-dropdown-modal-251"><div id="ng-z-dd250-r">${o.companiaPrefijada ?? ''}</div></nx-dropdown></form></nx-mt-insured-policy-holder>
  ${antecedentes}${polizaHtml}${ajenoHtml}<nx-mt-offerings-start-date>${cab('Fecha de inicio del seguro')}${texto('ng-z-ef', '¿Cuándo quieres que comience tu seguro?', `required min="${iso(new Date())}T00:00:00Z" max="${iso(masDias(90))}T00:00:00Z"`)}</nx-mt-offerings-start-date></app-insurance>`
  const p4 = `${o.paquetes ? tablaPaquetes(o.paquetes) : ''}<nx-mt-summary-panel><nx-expansion-panel><nx-expansion-panel-header aria-expanded="false">Vista Ampliada</nx-expansion-panel-header><div id="vista" hidden><nx-mt-agent-options><form>
    ${texto('ng-z-niv', 'Nivel antecedentes', 'disabled')}${texto('ng-z-col', 'Colaborador', 'maxlength="4"')}</form></nx-mt-agent-options></div></nx-expansion-panel></nx-mt-summary-panel><p>Precio no vinculante.</p>`
  const p7 = `${texto('ng-z-iban', 'IBAN')}${texto('ng-z-bic', 'BIC/SWIFT')}`
  const cuerpos = [p1, p2, p3, p4, texto('ng-z-prov', 'Provincia'), '', p7, '']
  return `<!doctype html><html><body>
<div>${pasos.map((p, i) => `<nx-multi-step-item role="tab" aria-selected="${i === 0}" ${i === 0 ? '' : 'aria-disabled="true"'}>${p}</nx-multi-step-item>`).join('')}</div>
<main id="appArea">${cuerpos.map((c, i) => `<div role="tabpanel" id="cdk-stepper-0-content-${i}" aria-label="Paso 1/8: Datos del vehículo" ${i === 0 ? '' : 'hidden'}><main>${c}</main>${nav(i === 0)}</div>`).join('')}</main>
<script>
  const $ = (s) => document.querySelector(s);
  window.__clics = [];
  document.addEventListener('click', (e) => { const t = e.target; if (t && t.id) window.__clics.push(t.id); }, true);
  ['#ng-z-cp1', '#ng-z-loc1'].forEach((s) => ['focus', 'input'].forEach((ev) => $(s).addEventListener(ev, () => { if ($(s).disabled) window.__clics.push(s + ':' + ev + ':bloqueado'); })));
  ['#ng-z-iban', '#ng-z-bic', '#ng-z-col', '#ng-z-niv', '#ng-z-tdoc', '#ng-z-cp2', '#ng-z-cp3', '#ng-z-loc2', '#ng-z-loc3', '#ng-z-sw']
    .forEach((s) => ['focus', 'input', 'click'].forEach((ev) => $(s).addEventListener(ev, () => window.__clics.push(s + ':' + ev))));
  document.querySelectorAll('#ng-z-cm-0, #ng-z-cm-1').forEach((r) => r.addEventListener('change', () => { $('#bloqueMatricula').hidden = false; }));
  $('#ng-z-mat').addEventListener('input', () => { $('#ng-z-enc').disabled = $('#ng-z-mat').value.length < 4; });
  const sig0 = document.querySelector('#cdk-stepper-0-content-0 .sig'); sig0.disabled = true;
  $('#ng-z-enc').addEventListener('click', () => setTimeout(() => {
    const t = document.createElement('div');
    t.innerHTML = ${JSON.stringify(`<h3>Detalles del vehículo</h3>` + TARJETAS.map((e, i) => `<span><input type="radio" id="ng-z-nx-selectable-card-24${i}" ${OCULTO}><label for="ng-z-nx-selectable-card-24${i}">${e}</label></span>`).join(''))};
    $('#ng-z-enc').after(t);
    t.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { sig0.disabled = false; }));
  }, 100));
  $('#ng-z-cp1').addEventListener('input', () => { if ($('#ng-z-cp1').value.length === 5) setTimeout(() => { ${o.localidadPortal === null ? '' : `$('#ng-z-loc1').value = ${JSON.stringify(o.localidadPortal ?? 'Villaficticia')};`} }, 150); });
  const OPS = ${JSON.stringify(o.companias ?? COMPANIAS)};
  window.__abiertos = 0;
  $('#ng-z-dd250').addEventListener('click', () => { if (document.getElementById('ng-z-nx-dropdown-modal-251')) return; window.__abiertos++; setTimeout(() => {
    const ov = document.createElement('div'); ov.className = 'cdk-overlay-pane'; ov.innerHTML = '<div id="ng-z-nx-dropdown-modal-251" role="listbox"></div>'; document.body.appendChild(ov);
    OPS.forEach((t, i) => { const it = document.createElement('nx-dropdown-item'); it.setAttribute('role', 'option'); it.id = 'ng-z-opt-' + i; it.textContent = t;
      it.addEventListener('click', () => { $('#ng-z-dd250-r').textContent = t; ov.remove(); }); ov.firstChild.appendChild(it); });
  }, 100); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const p = document.getElementById('ng-z-nx-dropdown-modal-251'); if (p) p.parentElement.remove(); } });
  ${o.obligatorioAjeno ? `document.querySelectorAll('.sig')[2].disabled = true; $('#ng-z-ajeno').addEventListener('input', () => { document.querySelectorAll('.sig')[2].disabled = $('#ng-z-ajeno').value === ''; });` : ''}
  window.__clicsPrecios = []; document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('app-price')) window.__clicsPrecios.push(e.target.tagName); }, true);
  document.querySelectorAll('.sig').forEach((b, i) => b.addEventListener('click', () => {
    const ps = document.querySelectorAll('[role=tabpanel]'); const ts = document.querySelectorAll('nx-multi-step-item');
    ps[i].hidden = true; ps[i + 1].hidden = false;
    ts[i].setAttribute('aria-selected', 'false'); ts[i + 1].setAttribute('aria-selected', 'true'); ts[i + 1].removeAttribute('aria-disabled');
  }));
</script></body></html>`
}

const CARCASA = `<!doctype html><html><body><h1>ePac</h1><iframe name="appArea" id="appArea" src="https://cloud.e-pacallianz.com/ngx-motor-azs/"></iframe></body></html>`

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

async function abrir(o: Opc = {}) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: u.hostname === 'cloud.e-pacallianz.com' ? app(o) : CARCASA })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://www.e-pacallianz.com/ngx-azs-epac/private/application')
  const pulsados: string[] = []
  const ctx: CtxTurismos = {
    pulsar: async (b) => { pulsados.push(((await b.textContent()) ?? '').replace(/\s+/g, ' ').trim()); await pulsar(b, guard) },
    pausaAccion: async () => undefined,
    marcarOpcionTurismos: async (m: Frame, clave: string) => {
      const r = await marcarOpcionTurismosAllianz(m, guard, clave)
      if (r.estado === 'marcada') pulsados.push(`opcion:${clave}`)
      return r
    },
    marcarTarjetaVehiculoTurismos: async (m: Frame, indice: number, etiqueta: string) => {
      const r = await marcarTarjetaVehiculoTurismosAllianz(m, guard, indice, etiqueta)
      if (r.estado === 'marcada') pulsados.push(`tarjeta:${indice}`)
      return r
    },
    marcarAntecedenteTurismos: async (m: Frame, clave, dato) => {
      const r = await marcarAntecedenteTurismosAllianz(m, guard, clave, dato)
      pulsados.push(`antecedente:${clave}:${r.estado}`)
      return r
    },
    companiaActualTurismos: async (m: Frame, buscada: string | null) => {
      const r = await companiaActualTurismosAllianz(m, guard, buscada)
      pulsados.push(`compania:${r.estado}`)
      return r
    },
    polizaActualTurismos: async (m: Frame, ultimos5: string | null) => {
      const r = await polizaActualTurismosAllianz(m, guard, ultimos5)
      pulsados.push(`poliza:${r.estado}`)
      return r
    },
  }
  const marco = await marcoFormularioTurismos(page, 5_000)
  const clics = () => marco.evaluate(() => (window as unknown as { __clics: string[] }).__clics.filter((c) => c.includes(':')))
  const valor = (id: string) => marco.locator(`#${id}`).inputValue()
  /** Lleva el asistente a «Datos personales» (paso 1 completo y su «Siguiente»), como hace el adaptador. */
  const aPersonales = async () => {
    await rellenarDatosVehiculoTurismosConSupuesto(page, marco, FORM, ctx)
    await marco.evaluate(() => { (document.querySelector('#cdk-stepper-0-content-0 .sig') as HTMLButtonElement).click() })
  }
  return { context, page, ctx, pulsados, guard, marco, clics, valor, aPersonales }
}

const esMapa = (re: RegExp) => (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e) && re.test((e as Error).message)
const sinPersonales = (m: string) => PERSONALES.every((v) => !m.includes(v))

test('v0.6.5 plan (puro): cada campo en SU paso, carné MM/AAAA, colaborador y nivel de antecedentes ya no son huecos, dirección fuera', () => {
  const HOY = new Date('2026-10-15T10:00:00Z')
  const { pasos, supuestos } = planDatosTurismos(FORM, HOY)
  const claves = pasos.map((p) => [p.paso, p.operaciones.map((o) => (o.tipo === 'opcion' ? o.clave : o.tipo === 'texto' ? o.etiqueta : o.tipo === 'compania' ? 'Compañía actual' : o.tipo === 'poliza' ? 'Póliza actual' : o.tipo === 'antecedente' ? `antecedente:${o.clave}` : 'Localidad'))])
  assert.deepEqual(claves, [
    ['Datos del vehículo', ['compra:ya_lo_tenia', 'uso:diario', 'garaje:calle']],
    ['Datos personales', ['tomador:individual', 'Número de documento', 'Código postal', 'Localidad', 'tomador_propietario:si', 'tomador_conduce:si', 'Fecha de nacimiento del conductor', 'Fecha de expedición de carnet', 'segundo_conductor:no']],
    ['Antecedentes', ['Compañía actual', 'Póliza actual', 'antecedente:compania_tiempo', 'antecedente:partes_culpables', 'antecedente:titular_tiempo', '¿Cuándo quieres que comience tu seguro?']],
  ])
  const valor = (etq: string) => pasos.flatMap((p) => p.operaciones).flatMap((o) => (o.tipo === 'texto' && o.etiqueta === etq ? [o.valor] : []))[0]
  assert.equal(valor('Fecha de nacimiento del conductor'), '03/02/1990')
  assert.equal(valor('Fecha de expedición de carnet'), '04/2010', 'carné: MM / AAAA')
  assert.deepEqual(pasos.map((p) => p.huecos), [[], [], []], 'ningún hueco con el riesgo completo')
  assert.deepEqual(pasos[2].operaciones[0], { tipo: 'compania', valor: null }, 'sin compañía en el riesgo: no consta')
  assert.deepEqual(planDatosTurismos({ ...FORM, companiaAnterior: 'Gamma Mutua' }, HOY).pasos[2].operaciones[0], { tipo: 'compania', valor: 'Gamma Mutua' })
  assert.deepEqual(planDatosTurismos({ ...FORM, companiaActual: 'Gamma Mutua' } as unknown as FormularioAuto, HOY).pasos[2].operaciones[0], { tipo: 'compania', valor: 'Gamma Mutua' }, 'clave opcional companiaActual')
  const todo = JSON.stringify(pasos)
  assert.doesNotMatch(todo, /[Cc]olaborador|[Nn]ivel antecedentes|[Dd]irecci[oó]n|Provincia|IBAN|BIC/)
  assert.equal(supuestos, `Precio con supuestos: ya lo tenía (cambio de seguro), uso diario, efecto 16/10/2026, sin 2º conductor, ${SUPUESTO_COMPANIA_NO_CONSTA}, ${SUPUESTO_TIEMPO_TITULAR}.`)
  for (const p of pasos) for (const o of p.operaciones) if (o.tipo === 'texto') assert.equal(senalCuentaBancaria([o.etiqueta]), null, o.etiqueta)
  assert.ok(sinPersonales([...pasos.flatMap((p) => p.huecos), supuestos].join(' ')))
})

test('v0.6.5 plan (puro): propietario/conductor «No» → hueco; sin dato → «Sí» DECLARADO; sin documento/CP → huecos de «Datos personales»', () => {
  const HOY = new Date('2026-10-15T10:00:00Z')
  const no = planDatosTurismos({ ...FORM, tomadorEsConductor: false, tomadorEsPropietario: false }, HOY)
  assert.ok(no.pasos[1].huecos.some((h) => /conductor distinto/.test(h)) && no.pasos[1].huecos.some((h) => /propietario distinto/.test(h)))
  assert.ok(!no.pasos[1].operaciones.some((o) => o.tipo === 'opcion' && /^tomador_(conduce|propietario)/.test(o.clave)))
  const nulo = planDatosTurismos({ ...FORM, tomadorEsConductor: null, tomadorEsPropietario: null }, HOY)
  assert.match(nulo.supuestos ?? '', /sin 2º conductor, el tomador es el propietario, el tomador es el conductor, compañía actual: sin indicar \(no consta\), tiempo como titular de un seguro: 9-10 años o más \(supuesto favorable, no consta\)\.$/)
  const pobre = planDatosTurismos({ ...FORM, documentoTomador: null, tomador: null }, HOY)
  for (const re of [/Número de documento/, /CP del tomador/, /tipo de tomador/]) assert.ok(pobre.pasos[1].huecos.some((h) => re.test(h)), String(re))
  assert.ok(sinPersonales(pobre.pasos.flatMap((p) => p.huecos).join(' ')))
})

test('v0.6.5 plan (puro): `fichaTomador` OPCIONAL (tipo, documento, codigoPostal, localidad, fechaNacimiento, fechaCarnet) se usa si existe', () => {
  const HOY = new Date('2026-10-15T10:00:00Z')
  const conFicha = { ...FORM, documentoTomador: null, tomador: null, conductor: { fechaNacimiento: '', fechaCarne: '', sexo: 'mujer' }, fichaTomador: { tipo: 'fisica', documento: '00000000T', codigoPostal: '00000', localidad: 'Villaficticia', direccion: null, fechaNacimiento: '1990-02-03', fechaCarnet: '2010-04-05', tipoCarnet: 'B' } } as unknown as FormularioAuto
  assert.deepEqual(fichaTomadorTurismos(conFicha), { tipo: 'fisica', documento: '00000000T', codigoPostal: '00000', localidad: 'Villaficticia', fechaNacimiento: '1990-02-03', fechaCarnet: '2010-04-05' })
  assert.equal(tipoTomadorTurismos(conFicha), 'fisica')
  const p = planDatosTurismos(conFicha, HOY).pasos[1]
  assert.deepEqual(p.huecos, [])
  const ops = p.operaciones.flatMap((o) => (o.tipo === 'texto' ? [o.valor] : o.tipo === 'localidad' ? [o.valor] : []))
  assert.deepEqual(ops, ['00000000T', '00000', 'Villaficticia', '03/02/1990', '04/2010'])
  // Ficha con nulos o ausente: no consta (nunca relleno).
  assert.equal(fichaTomadorTurismos(FORM), null)
  assert.deepEqual(planDatosTurismos({ ...conFicha, fichaTomador: { tipo: null, documento: null, codigoPostal: null, localidad: null } } as unknown as FormularioAuto, HOY).pasos[1].huecos.length, 5)
  // La ficha que se contradice con el documento → tipo de tomador sin decidir.
  assert.equal(tipoTomadorTurismos({ ...conFicha, fichaTomador: { tipo: 'juridica', documento: '00000000T' } } as unknown as FormularioAuto), null)
})

test('v0.6.5 recorrido real: los TRES pasos con su «Siguiente» (bloque del tomador, compañía sin dato → vacía y declarada) y para en «Selección de paquete» con las opciones leídas', async () => {
  const { context, page, ctx, pulsados, marco, clics, valor } = await abrir()
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, FORM, ctx)
    await assert.rejects(recorrerPasosTurismos(page, marco, FORM, ctx, r.supuestoVersion, new Date(), 3_000), (e: unknown) => {
      const m = (e as Error).message
      return esMapa(/la pantalla de precios «Selección de paquete» del asistente de Turismos/)(e) &&
        m.includes(`Precio con supuestos: ya lo tenía (cambio de seguro), uso diario, efecto ${dma(iso(masDias(1)))}, sin 2º conductor, ${SUPUESTO_COMPANIA_NO_CONSTA}, ${SUPUESTO_TIEMPO_TITULAR}.`) &&
        m.includes(`opciones de «Compañía actual del vehículo» leídas (4): ${COMPANIAS.join(' | ')}`) && sinPersonales(m)
    })
    assert.equal(await pasoActivoTurismos(marco), 'Selección de paquete')
    assert.deepEqual(pulsados, [
      'opcion:conoce_matricula:si', 'Encuentra mi vehículo', 'tarjeta:0', 'opcion:compra:ya_lo_tenia', 'opcion:uso:diario', 'opcion:garaje:calle',
      'Siguiente', 'Siguiente', 'compania:sin_elegir', 'poliza:ausente', 'antecedente:compania_tiempo:marcada', 'antecedente:partes_culpables:marcada', 'antecedente:titular_tiempo:marcada', 'Siguiente',
    ], 'tomador/propietario/conductor ya estaban en su valor: no se pulsan; nunca «Anterior»')
    assert.equal(await valor('ng-z-doc'), '00000000T')
    assert.equal(await valor('ng-z-cp1'), '00000', 'CP del bloque del TOMADOR')
    assert.equal(await valor('ng-z-loc1'), 'Villaficticia', 'la propuso el portal: no se teclea')
    assert.equal(await valor('ng-z-fnac'), '03/02/1990')
    assert.equal(await valor('ng-z-fcar'), '04/2010')
    assert.equal(await valor('ng-z-ef'), dma(iso(masDias(1))))
    assert.equal(await marco.locator('#ng-z-dd250-r').innerText(), '', 'compañía sin dato: vacía')
    assert.equal(await marco.locator('#ng-z-nx-dropdown-modal-251').count(), 0, 'el panel se cerró')
    for (const id of ['ng-z-cp2', 'ng-z-cp3', 'ng-z-loc2', 'ng-z-loc3', 'ng-z-col', 'ng-z-niv', 'ng-z-iban', 'ng-z-bic', 'ng-z-prov']) assert.equal(await valor(id), '', `${id} intacto`)
    assert.equal(await marco.locator('#ng-z-sw').isChecked(), false, 'segundo conductor apagado, sin tocar')
    assert.deepEqual(await clics(), [], 'ni IBAN/BIC, ni colaborador, ni otros desplegables, ni otros CP, ni el interruptor')
  } finally {
    await context.close()
  }
})

/** Lleva el asistente hasta «Antecedentes» con el recorrido real (paso 1 y 2) y devuelve el resultado de la compañía. */
async function hastaCompania(o: Opc, form: FormularioAuto) {
  const a = await abrir(o)
  const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, a.marco, form, a.ctx)
  const error = await recorrerPasosTurismos(a.page, a.marco, form, a.ctx, r.supuestoVersion, new Date(), 3_000).then(() => new Error('el recorrido NO falló (se esperaba un hueco)'), (e: unknown) => e as Error)
  return { ...a, error, mostrado: await a.marco.locator('#ng-z-dd250-r').innerText(), abiertos: await a.marco.evaluate(() => (window as unknown as { __abiertos: number }).__abiertos) }
}

test('v0.6.8 compañía actual con la cabecera REAL (sin `text`, dentro de un div): se localiza el desplegable, se lee y se elige la única que casa', async () => {
  const r = await hastaCompania({ cabeceraCompaniaReal: true }, { ...FORM, companiaAnterior: 'Aseguradora Alfa' })
  try {
    assert.equal(r.mostrado, 'ASEGURADORA ALFA, S.A.')
    assert.ok(r.pulsados.includes('compania:elegida'))
    assert.ok(!r.pulsados.includes('compania:no_unica'))
  } finally {
    await r.context.close()
  }
})

test('v0.6.5 compañía actual del riesgo: casa con UNA → elegida (sin supuesto); con VARIAS → hueco sin elegir y sin «Siguiente»; con ninguna → vacía y declarada', async () => {
  const una = await hastaCompania({}, { ...FORM, companiaAnterior: 'Aseguradora Alfa' })
  try {
    assert.equal(una.mostrado, 'ASEGURADORA ALFA, S.A.')
    assert.ok(una.error instanceof ErrorMapaIncompleto && /Selección de paquete/.test(una.error.message) && !/compañía actual: sin indicar/.test(una.error.message))
    assert.ok(una.pulsados.includes('compania:elegida'))
  } finally {
    await una.context.close()
  }
  const dos = await hastaCompania({ companias: ['Gamma Mutua', 'GAMMA MUTUA SEGUROS, S.A.', 'Otra'] }, { ...FORM, companiaAnterior: 'gamma mutua' })
  try {
    assert.equal(dos.mostrado, '', 'nunca se adivina entre dos')
    // v0.6.15: ambigua → error de DATOS con las candidatas (nunca «mapa incompleto»), sin elegir y sin «Siguiente» de Antecedentes.
    assert.ok(dos.error instanceof ErrorTarificador && dos.error.tipo === 'datos')
    assert.match(dos.error.message, /casa con 2 opciones de Allianz.*Gamma Mutua \| GAMMA MUTUA SEGUROS, S\.A\./)
    assert.ok(!dos.error.message.includes('Otra'), 'solo las candidatas')
    assert.equal(await pasoActivoTurismos(dos.marco), 'Antecedentes')
    assert.equal(dos.pulsados.filter((p) => p === 'Siguiente').length, 2)
  } finally {
    await dos.context.close()
  }
  // v0.6.19: sin casar y con UNA opción genérica («Otras compañías») se marca esa y se DECLARA en el aviso de supuestos.
  const generica = await hastaCompania({}, { ...FORM, companiaAnterior: 'Delta Ficticia / Epsilon' })
  try {
    assert.equal(generica.mostrado, 'Otras compañías')
    assert.ok(generica.pulsados.includes('compania:elegida'))
    assert.ok(generica.error instanceof ErrorMapaIncompleto && /Compañía anterior «Delta Ficticia \/ Epsilon» no está en la lista de Allianz: se marca «Otras compañías»/.test(generica.error.message))
  } finally {
    await generica.context.close()
  }
  const ninguna = await hastaCompania({ companias: COMPANIAS.filter((c) => c !== 'Otras compañías') }, { ...FORM, companiaAnterior: 'Delta Ficticia' })
  try {
    assert.equal(ninguna.mostrado, '')
    // v0.6.15: la compañía del riesgo que no está en la lista ya no sigue «sin indicar»: error de DATOS con la lista leída.
    assert.ok(ninguna.error instanceof ErrorTarificador && ninguna.error.tipo === 'datos' && /no está en la lista de Allianz/.test(ninguna.error.message))
    assert.equal(await ninguna.marco.locator('#ng-z-nx-dropdown-modal-251').count(), 0, 'cerrado sin elegir')
  } finally {
    await ninguna.context.close()
  }
  const yaTrae = await hastaCompania({ companiaPrefijada: 'Beta Seguros y Reaseguros' }, { ...FORM, companiaAnterior: 'Aseguradora Alfa' })
  try {
    assert.equal(yaTrae.mostrado, 'Beta Seguros y Reaseguros', 'el valor del portal no se toca')
    assert.ok(esMapa(/el portal ya trae una: no se toca/)(yaTrae.error))
  } finally {
    await yaTrae.context.close()
  }
})

test('guard v0.6.5: la puerta de la compañía actual solo en «Antecedentes» (si no, bloqueo SIN abrir) y veta una opción de emisión antes de pulsarla', async () => {
  assert.deepEqual(casarCompaniaActualTurismos(COMPANIAS, 'aseguradora alfa'), [0])
  assert.deepEqual(casarCompaniaActualTurismos(COMPANIAS, 'Beta'), [1], 'sin «Seguros y Reaseguros»')
  assert.deepEqual(casarCompaniaActualTurismos(COMPANIAS, 'Alf'), [], 'nunca por parecido')
  assert.deepEqual(casarCompaniaActualTurismos(COMPANIAS, 'S.A.'), [], 'solo forma jurídica: nada')
  const a = await abrir()
  try {
    await a.aPersonales()
    await assert.rejects(companiaActualTurismosAllianz(a.marco, a.guard, 'Aseguradora Alfa'), EmisionBloqueadaError)
    assert.equal(await a.marco.evaluate(() => (window as unknown as { __abiertos: number }).__abiertos), 0, 'ni se abre')
  } finally {
    await a.context.close()
  }
  const b = await abrir({ companias: ['Contratar', 'Otra'] })
  try {
    await b.aPersonales()
    await b.marco.evaluate(() => { (document.querySelector('#cdk-stepper-0-content-1 .sig') as HTMLButtonElement).click() })
    assert.equal(await pasoActivoTurismos(b.marco), 'Antecedentes')
    await assert.rejects(companiaActualTurismosAllianz(b.marco, b.guard, 'Contratar'), EmisionBloqueadaError)
    assert.equal(await b.marco.locator('#ng-z-dd250-r').innerText(), '', 'la opción vetada no se pulsa')
  } finally {
    await b.context.close()
  }
})

test('v0.6.9 compañía actual: casa por clave normalizada y por contención de la clave de la ficha, solo si hay UNA candidata', () => {
  const LISTA = ['MAPFRE ESPAÑA COMPAÑÍA DE SEGUROS', 'GENERALI-LA ESTRELLA', 'DIVINA PASTORA SEGUROS GENERALES, M.P.S.', 'ASEGURADORA ALFA, S.A.', 'ALFA VIDA SEGUROS', 'BETA NORTE MUTUA', 'BETA SUR, S.A.']
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Divina Pastora'), [2], 'la clave de la ficha está en la opción')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'DIVINA PASTORA, S.A.'), [2], 'con forma jurídica en la ficha')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Mapfre'), [0])
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'generali'), [1])
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Aseguradora Alfa'), [3], 'igual exacta gana a la contención')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Alfa'), [3, 4], 'ambigua: dos candidatas → el llamador no elige')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Beta'), [5, 6], 'ambigua')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Divina'), [2], 'palabra completa')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Past'), [], 'nunca por trozo de palabra')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Otra Compañía'), [], 'ninguna')
  assert.deepEqual(casarCompaniaActualTurismos(LISTA, 'Seguros S.A.'), [], 'solo palabras vacías: nada')
  const CON_HERMANA = ['MAPFRE', 'MAPFRE VIDA', 'S.A.', 'ALFA SEGUROS']
  assert.deepEqual(casarCompaniaActualTurismos(CON_HERMANA, 'Mapfre'), [0], 'igual exacta gana: no también «MAPFRE VIDA» por contención')
  assert.deepEqual(casarCompaniaActualTurismos(CON_HERMANA, 'S.A.'), [], 'ficha vacía tras normalizar: nada, aunque una opción también normalice a vacío')
  assert.deepEqual(casarCompaniaActualTurismos(CON_HERMANA, '  '), [], 'espacios: nada')
})

test('v0.6.5 «Localidad»: el portal propone OTRA → hueco sin teclear y sin «Siguiente»; sin dato y propuesta → se DECLARA; sin propuesta → hueco', async () => {
  const a = await abrir({ localidadPortal: 'Otrapoblacion' })
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, a.marco, FORM, a.ctx)
    await assert.rejects(recorrerPasosTurismos(a.page, a.marco, FORM, a.ctx, r.supuestoVersion, new Date(), 3_000), (e: unknown) => esMapa(/huecos de «Datos personales»: «Localidad» \(no es un campo de texto: desplegable\/autocompletado sin puerta en guard\.ts; el portal propone otra/)(e) && sinPersonales((e as Error).message) && !(e as Error).message.includes('Otrapoblacion'))
    assert.equal(await a.valor('ng-z-loc1'), 'Otrapoblacion', 'no se teclea en el autocompletado')
    assert.equal(a.pulsados.filter((p) => p === 'Siguiente').length, 1, 'el «Siguiente» de «Datos personales» NO se pulsa')
    assert.equal(await pasoActivoTurismos(a.marco), 'Datos personales')
  } finally {
    await a.context.close()
  }
  const sinLocalidad: FormularioAuto = { ...FORM, tomador: { ...FORM.tomador!, poblacion: '' } }
  const b = await abrir()
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(b.page, b.marco, sinLocalidad, b.ctx)
    await assert.rejects(recorrerPasosTurismos(b.page, b.marco, sinLocalidad, b.ctx, r.supuestoVersion, new Date(), 3_000), (e: unknown) => esMapa(/«Selección de paquete»/)(e) && (e as Error).message.includes(SUPUESTO_LOCALIDAD_PORTAL))
  } finally {
    await b.context.close()
  }
  const c = await abrir({ localidadPortal: null })
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(c.page, c.marco, sinLocalidad, c.ctx)
    await assert.rejects(recorrerPasosTurismos(c.page, c.marco, sinLocalidad, c.ctx, r.supuestoVersion, new Date(), 3_000), esMapa(/«Localidad» \(el riesgo no la trae y el portal no propuso ninguna/))
    assert.equal(await pasoActivoTurismos(c.marco), 'Datos personales')
  } finally {
    await c.context.close()
  }
})

test('v0.6.5 fecha de efecto fuera del rango min/max del portal → hueco, sin teclearla', async () => {
  const lejos: FormularioAuto = { ...FORM, fechaVencimiento: iso(masDias(200)) }
  const { context, page, ctx, marco, valor } = await abrir()
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, lejos, ctx)
    await assert.rejects(recorrerPasosTurismos(page, marco, lejos, ctx, r.supuestoVersion, new Date(), 3_000), esMapa(/«¿Cuándo quieres que comience tu seguro\?» \(la fecha queda fuera del rango que admite el portal\)/))
    assert.equal(await valor('ng-z-ef'), '')
  } finally {
    await context.close()
  }
})

test('v0.6.5 sin documento del tomador: para en «Datos personales» ANTES de su «Siguiente» (nada inventado)', async () => {
  const sinDoc: FormularioAuto = { ...FORM, documentoTomador: null, tomador: { ...FORM.tomador!, documentoIdentidad: '' } }
  const { context, page, ctx, pulsados, marco, valor } = await abrir()
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, sinDoc, ctx)
    await assert.rejects(recorrerPasosTurismos(page, marco, sinDoc, ctx, r.supuestoVersion, new Date(), 3_000), esMapa(/los datos de «Datos personales» antes de «SIGUIENTE».*Número de documento/))
    assert.equal(await valor('ng-z-doc'), '')
    assert.equal(pulsados.filter((p) => p === 'Siguiente').length, 1)
  } finally {
    await context.close()
  }
})

test('guard v0.6.5: «Segundo conductor» es un interruptor que SOLO se lee: apagado → ya_marcada; encendido → no_quedo; nunca se pulsa', async () => {
  for (const encendido of [false, true]) {
    const { context, guard, marco, clics, aPersonales } = await abrir({ segundoEncendido: encendido })
    try {
      await aPersonales()
      assert.equal(await pasoActivoTurismos(marco), 'Datos personales')
      assert.deepEqual(await marcarOpcionTurismosAllianz(marco, guard, 'segundo_conductor:no'), encendido ? { estado: 'no_quedo' } : { estado: 'ya_marcada' })
      assert.equal(await marco.locator('#ng-z-sw').isChecked(), encendido, 'el interruptor no cambia')
      assert.deepEqual(await clics(), [], 'ni un clic en el interruptor')
    } finally {
      await context.close()
    }
  }
})

test('guard v0.6.5: propietario/conductor «Sí» por la cabecera de SU formulario; sin cabecera → no_unica; «No» y claves de otro paso → bloqueo', async () => {
  const a = await abrir({ sinDefectos: true })
  try {
    await a.aPersonales()
    assert.deepEqual(await marcarOpcionTurismosAllianz(a.marco, a.guard, 'tomador_conduce:si'), { estado: 'marcada' })
    assert.deepEqual(await Promise.all(['ng-z-cond-0', 'ng-z-cond-1', 'ng-z-prop-0', 'ng-z-prop-1'].map((id) => a.marco.locator(`#${id}`).isChecked())), [true, false, false, false], 'solo el «Sí» del conductor')
    assert.deepEqual(await marcarOpcionTurismosAllianz(a.marco, a.guard, 'tomador_propietario:si'), { estado: 'marcada' })
    assert.equal(await a.marco.locator('#ng-z-prop-0').isChecked(), true)
    assert.deepEqual(await marcarOpcionTurismosAllianz(a.marco, a.guard, 'tomador:individual'), { estado: 'ya_marcada' })
    for (const clave of ['tomador_conduce:no', 'tomador_propietario:no', 'segundo_conductor:si']) await assert.rejects(marcarOpcionTurismosAllianz(a.marco, a.guard, clave), EmisionBloqueadaError, clave)
    // Claves de «Datos del vehículo» con «Datos personales» seleccionado → bloqueo (fase).
    for (const clave of ['garaje:calle', 'conoce_matricula:si']) await assert.rejects(marcarOpcionTurismosAllianz(a.marco, a.guard, clave), EmisionBloqueadaError, clave)
  } finally {
    await a.context.close()
  }
  const b = await abrir({ sinDefectos: true, sinCabeceraConductor: true })
  try {
    await b.aPersonales()
    assert.deepEqual(await marcarOpcionTurismosAllianz(b.marco, b.guard, 'tomador_conduce:si'), { estado: 'no_unica', coincidencias: 0 })
    assert.deepEqual(await Promise.all(['ng-z-cond-0', 'ng-z-prop-0'].map((id) => b.marco.locator(`#${id}`).isChecked())), [false, false], 'nada marcado a ciegas')
  } finally {
    await b.context.close()
  }
})

test('v0.6.5 «Datos personales» con el tomador sin cabecera conductor: el plan lo deja en hueco y no se pulsa «Siguiente»', async () => {
  const { context, page, ctx, pulsados, marco } = await abrir({ sinDefectos: true, sinCabeceraConductor: true })
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, FORM, ctx)
    await assert.rejects(recorrerPasosTurismos(page, marco, FORM, ctx, r.supuestoVersion, new Date(), 3_000), (e: unknown) =>
      esMapa(/cómo se marca el tomador conductor «Sí» \(0 coincidencias\)/)(e) && !(e as Error).message.includes(SUPUESTO_TOMADOR_CONDUCE))
    assert.equal(pulsados.filter((p) => p === 'Siguiente').length, 1)
  } finally {
    await context.close()
  }
})

// ───────────── v0.6.6: campos DESHABILITADOS de los pasos 2-3 (trabajo real 3553424d: CP del tomador `disabled` y relleno) ─────────────

test('v0.6.6 (puro): campo bloqueado igual (normalizado) → vale; distinto (v0.6.7) → vale_distinto; vacío → hueco; sin dato del riesgo y con valor → vale_portal; sin valores en los motivos', () => {
  assert.deepEqual(decidirCampoBloqueadoTurismos('Código postal', ' 00000 ', '00000', 'texto'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Número de documento', '00000000-t', '00000000T', 'texto'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Fecha de nacimiento del conductor', '03 / 02 / 1990', '03/02/1990', 'fecha'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Localidad', 'VILLAFICTÍCIA', 'villaficticia', 'poblacion'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Localidad', 'Villaficticia', null, 'poblacion'), { tipo: 'vale_portal' })
  const distinto = decidirCampoBloqueadoTurismos('Código postal', '11111', '00000', 'texto')
  assert.deepEqual(distinto, { tipo: 'vale_distinto' })
  // v0.6.7: normalización del CP (5 dígitos) y de la localidad (sin prefijo «NNNNN - »).
  assert.deepEqual(decidirCampoBloqueadoTurismos('Código postal', '1001', '01001', 'cp'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Código postal', '00 000', '00000', 'cp'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Localidad', '00000 - VILLAFICTÍCIA', 'Villaficticia', 'poblacion'), { tipo: 'vale' })
  assert.deepEqual(decidirCampoBloqueadoTurismos('Localidad', '00000-Villaficticia', 'VILLAFICTICIA', 'poblacion'), { tipo: 'vale' })
  assert.equal(decidirCampoBloqueadoTurismos('Código postal', '00001', '00000', 'cp').tipo, 'vale_distinto')
  // Solo CP y localidad: documento y fechas bloqueados y distintos siguen siendo hueco (un documento distinto sería otra persona).
  for (const [et, p, rs, como] of [['Fecha de nacimiento del conductor', '03/02/1990', '04/02/1990', 'fecha'], ['Número de documento', '00000000T', '00000001R', 'texto']] as const) {
    const d = decidirCampoBloqueadoTurismos(et, p, rs, como)
    assert.equal(d.tipo, 'hueco')
    assert.match(d.tipo === 'hueco' ? d.motivo : '', /deshabilitado con un valor distinto del riesgo: no se teclea\)$/)
    assert.ok(d.tipo === 'hueco' && !d.motivo.includes('1990') && !d.motivo.includes('0000'))
  }
  const vacio = decidirCampoBloqueadoTurismos('Código postal', '  ', '00000', 'texto')
  assert.match(vacio.tipo === 'hueco' ? vacio.motivo : '', /deshabilitado y vacío/)
  assert.equal(decidirCampoBloqueadoTurismos('Localidad', '', null, 'poblacion').tipo, 'hueco', 'vacío y sin dato: hueco, nunca «vale»')
  assert.equal(normalizarValorCampoTurismos('a-b.c d', 'texto'), 'ABCD')
})

test('v0.6.6 el error crudo de Playwright no saca el valor tecleado (`fill("…")` tapado)', () => {
  const crudo = new Error('locator.fill: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator(\'x\').getByLabel(\'Código postal\').first()\n    - fill("00000")\n  - attempting fill action')
  const c = clasificar(crudo)
  assert.equal(c.tipo, 'portal')
  assert.ok(!c.mensaje.includes('00000'), c.mensaje)
  assert.match(c.mensaje, /fill\(«dato tecleado»\)/)
  assert.ok(!clasificar(new Error('x.type(\'0000BBB\') y pressSequentially(`00000000T`)')).mensaje.match(/0000BBB|00000000T/))
})

/** Recorre hasta donde llegue y devuelve el error, el tiempo y si se tecleó en un campo bloqueado. */
async function recorrerConBloqueo(o: Opc, form: FormularioAuto = FORM, antesDeTeclear?: (marco: Frame) => Promise<void>) {
  const a = await abrir(o)
  if (antesDeTeclear) {
    const base = a.ctx.pausaAccion
    a.ctx.pausaAccion = async () => { await base(); await antesDeTeclear(a.marco) }
  }
  const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, a.marco, form, a.ctx)
  const t0 = Date.now()
  const error = await recorrerPasosTurismos(a.page, a.marco, form, a.ctx, r.supuestoVersion, new Date(), 3_000).then(() => null, (e: unknown) => e as Error)
  const tecleoBloqueado = (await a.marco.evaluate(() => (window as unknown as { __clics: string[] }).__clics)).filter((c) => c.endsWith(':bloqueado'))
  return { ...a, error: error as Error, ms: Date.now() - t0, tecleoBloqueado }
}

test('v0.6.6 CP y localidad del tomador DESHABILITADOS y prerrellenos IGUALES al riesgo → se dan por buenos sin teclear y se llega al precio', async () => {
  const a = await recorrerConBloqueo({ cpBloqueado: '00000', locBloqueada: 'VILLAFICTICIA' })
  try {
    assert.ok(esMapa(/la pantalla de precios «Selección de paquete»/)(a.error), a.error?.message)
    assert.ok(!a.error.message.includes(SUPUESTO_LOCALIDAD_PORTAL), 'la localidad casaba con el riesgo: no es supuesto')
    assert.deepEqual(a.tecleoBloqueado, [], 'ni foco ni tecleo en los bloqueados')
    assert.ok(sinPersonales(a.error.message))
  } finally {
    await a.context.close()
  }
  // Localidad bloqueada y el riesgo SIN localidad: vale la del portal, DECLARADA.
  const sinLoc: FormularioAuto = { ...FORM, tomador: { ...FORM.tomador!, poblacion: '' } }
  const b = await recorrerConBloqueo({ cpBloqueado: '00000', locBloqueada: 'Villaficticia' }, sinLoc)
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(b.error) && b.error.message.includes(SUPUESTO_LOCALIDAD_PORTAL), b.error?.message)
  } finally {
    await b.context.close()
  }
})

test('v0.6.7 CP y localidad del tomador DESHABILITADOS con OTRO valor no vacío → se aceptan, sin teclear, y se declaran como supuesto (sin valores)', async () => {
  const a = await recorrerConBloqueo({ cpBloqueado: '11111', locBloqueada: 'Otrapoblacion' })
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(a.error), a.error?.message)
    assert.ok(a.error.message.includes(SUPUESTO_CP_FIJADO_DISTINTO) && a.error.message.includes(SUPUESTO_LOCALIDAD_FIJADA_DISTINTA), a.error?.message)
    assert.ok(!/huecos de «Datos personales»/.test(a.error.message), a.error.message)
    assert.ok(sinPersonales(a.error.message) && !a.error.message.includes('11111') && !a.error.message.includes('Otrapoblacion'))
    assert.equal(await a.valor('ng-z-cp1'), '11111', 'no se toca')
    assert.deepEqual(a.tecleoBloqueado, [])
  } finally {
    await a.context.close()
  }
})

test('v0.6.6 CP del tomador DESHABILITADO y VACÍO → hueco «deshabilitado y vacío» (nunca un timeout crudo)', async () => {
  const a = await recorrerConBloqueo({ cpBloqueado: '' })
  try {
    assert.ok(esMapa(/«Código postal» \(el portal lo tiene deshabilitado y vacío: no se puede rellenar\)/)(a.error), a.error?.message)
    assert.equal(await pasoActivoTurismos(a.marco), 'Datos personales')
  } finally {
    await a.context.close()
  }
})

test('v0.6.6 el portal BLOQUEA el CP después de localizarlo (como tras validar el documento): se relee y se decide, sin timeout crudo ni el CP en el error', async () => {
  // Justo antes de teclear el CP (la pausa previa a cada tecleo), el portal lo deshabilita con un valor: igual al riesgo → vale.
  const bloquear = (valor: string) => async (m: Frame) => {
    await m.evaluate((v) => {
      const doc = document.querySelector('#ng-z-doc') as HTMLInputElement
      const cp = document.querySelector('#ng-z-cp1') as HTMLInputElement
      if (doc.value && !cp.disabled) { cp.value = v; cp.disabled = true; const loc = document.querySelector('#ng-z-loc1') as HTMLInputElement; loc.value = 'Villaficticia'; loc.disabled = true }
    }, valor)
  }
  const igual = await recorrerConBloqueo({}, FORM, bloquear('00000'))
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(igual.error), igual.error?.message)
    assert.ok(igual.ms < 25_000, `sin esperar los 30 s de Playwright (${igual.ms} ms)`)
  } finally {
    await igual.context.close()
  }
  const otro = await recorrerConBloqueo({}, FORM, bloquear('11111'))
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(otro.error) && otro.error.message.includes(SUPUESTO_CP_FIJADO_DISTINTO), otro.error?.message)
    assert.ok(!/Timeout|locator\.fill|11111|00000/.test(otro.error.message), otro.error.message)
  } finally {
    await otro.context.close()
  }
})

test('v0.6.25 (trabajo real e3c52938): tras teclear el documento el portal rehace el bloque y el CP/Localidad REAPARECEN deshabilitados y rellenos → se leen, no «no aparece»', async () => {
  // Tras el documento, CP y Localidad desaparecen ~0,6 s y vuelven deshabilitados con valor (el localizador común descarta los deshabilitados).
  const rehacer = (cp: string) => async (m: Frame) => {
    await m.evaluate((v) => {
      const w = window as unknown as { __rehecho?: boolean }
      if (w.__rehecho) return
      w.__rehecho = true
      const doc = document.querySelector('#ng-z-doc') as HTMLInputElement
      doc.addEventListener('change', () => {
        const cp1 = document.querySelector('#ng-z-cp1') as HTMLInputElement
        const loc1 = document.querySelector('#ng-z-loc1') as HTMLInputElement
        for (const e of [cp1, loc1]) e.style.display = 'none'
        for (const l of Array.from(document.querySelectorAll('label[for="ng-z-cp1"], label[for="ng-z-loc1"]'))) (l as HTMLElement).style.display = 'none'
        setTimeout(() => {
          cp1.value = v; cp1.disabled = true; loc1.value = 'Villaficticia'; loc1.disabled = true
          for (const e of [cp1, loc1]) e.style.display = ''
          for (const l of Array.from(document.querySelectorAll('label[for="ng-z-cp1"], label[for="ng-z-loc1"]'))) (l as HTMLElement).style.display = ''
        }, 600)
      })
    }, cp)
  }
  const igual = await recorrerConBloqueo({}, FORM, rehacer('00000'))
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(igual.error), igual.error?.message)
    assert.ok(!/«Código postal» \(/.test(igual.error.message) && !/no aparece/.test(igual.error.message), igual.error.message)
    assert.deepEqual(igual.tecleoBloqueado, [], 'ni foco ni tecleo en los bloqueados')
    assert.ok(sinPersonales(igual.error.message))
  } finally {
    await igual.context.close()
  }
  const otro = await recorrerConBloqueo({}, FORM, rehacer('11111'))
  try {
    assert.ok(esMapa(/«Selección de paquete»/)(otro.error) && otro.error.message.includes(SUPUESTO_CP_FIJADO_DISTINTO), otro.error?.message)
    assert.ok(!otro.error.message.includes('11111'))
  } finally {
    await otro.context.close()
  }
})

const marcada = (a: { marco: Frame }, g: string) => a.marco.evaluate((gr) => Array.from(document.querySelectorAll(`input[name="ng-z-${gr}"]`)).findIndex((x) => (x as HTMLInputElement).checked), g)

test('v0.6.10 plan (puro): con dato del riesgo no hay supuesto (0 partes es un DATO); sin dato, el supuesto favorable declarado', () => {
  const HOY = new Date('2026-10-15T10:00:00Z')
  const ops = (f: FormularioAuto) => planDatosTurismos(f, HOY).pasos[2].operaciones.flatMap((o) => (o.tipo === 'antecedente' ? [[o.clave, o.dato]] : []))
  assert.deepEqual(ops(FORM), [['compania_tiempo', 3], ['partes_culpables', 0], ['titular_tiempo', null]])
  const sin = { ...FORM, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null }
  assert.deepEqual(ops(sin), [['compania_tiempo', null], ['partes_culpables', null], ['titular_tiempo', null]])
  const { supuestos } = planDatosTurismos(sin, HOY)
  for (const t of [SUPUESTO_TIEMPO_COMPANIA, SUPUESTO_PARTES_CULPABLES, SUPUESTO_TIEMPO_TITULAR]) assert.ok(supuestos?.includes(t), t)
  assert.equal(SUPUESTO_PARTES_CULPABLES, 'partes culpables: ninguno (supuesto favorable, no consta)')
  assert.ok(!planDatosTurismos(FORM, HOY).supuestos?.includes(SUPUESTO_PARTES_CULPABLES), 'con dato no se declara supuesto')
})

test('v0.6.10 «Antecedentes» sin dato: elige la más favorable en los 3 grupos y declara los 3 supuestos', async () => {
  const sin: FormularioAuto = { ...FORM, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null }
  const r = await hastaCompania({}, sin)
  try {
    assert.equal(await marcada(r, 'ant1'), 5, '«5 años o más»')
    assert.equal(await marcada(r, 'ant2'), 0, '«No he declarado ningún parte»')
    assert.equal(await marcada(r, 'ant3'), 5, '«9-10 años o más»')
    for (const t of [SUPUESTO_TIEMPO_COMPANIA, SUPUESTO_PARTES_CULPABLES, SUPUESTO_TIEMPO_TITULAR]) assert.ok(r.error.message.includes(t), t)
    assert.ok(/Selección de paquete/.test(r.error.message))
  } finally {
    await r.context.close()
  }
})

test('v0.6.10 «Antecedentes» con dato: casa por texto (3 años; ningún parte) y solo declara lo que sigue sin dato', async () => {
  const r = await hastaCompania({}, { ...FORM, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 2 })
  try {
    assert.equal(await marcada(r, 'ant1'), 3, '«3 años»')
    assert.equal(await marcada(r, 'ant2'), 2, '«2 partes»')
    assert.equal(await marcada(r, 'ant3'), 5)
    assert.ok(r.error.message.includes(SUPUESTO_TIEMPO_TITULAR))
    assert.ok(!r.error.message.includes(SUPUESTO_TIEMPO_COMPANIA) && !r.error.message.includes(SUPUESTO_PARTES_CULPABLES), 'un dato no se presenta como supuesto')
  } finally {
    await r.context.close()
  }
})

test('v0.6.10 «Antecedentes»: la máxima sin casar por texto es la última del grupo; grupo ausente → no hace nada ni declara', async () => {
  const sin: FormularioAuto = { ...FORM, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null }
  const raro = await hastaCompania({ antecedentesRaros: true }, sin)
  try {
    assert.equal(await marcada(raro, 'ant1'), 5, 'la última')
    assert.ok(raro.error.message.includes('tiempo en la compañía: «Más de cuatro»'))
  } finally {
    await raro.context.close()
  }
  const ausente = await hastaCompania({ sinAntecedentes: true }, sin)
  try {
    assert.ok(ausente.pulsados.filter((p) => p.startsWith('antecedente:')).every((p) => p.endsWith(':sin_grupo')) && ausente.pulsados.filter((p) => p.startsWith('antecedente:')).length === 3)
    assert.ok(/Selección de paquete/.test(ausente.error.message), 'no es hueco: se sigue')
    for (const t of [SUPUESTO_TIEMPO_COMPANIA, SUPUESTO_PARTES_CULPABLES, SUPUESTO_TIEMPO_TITULAR]) assert.ok(!ausente.error.message.includes(t), t)
  } finally {
    await ausente.context.close()
  }
})

test('guard v0.6.10: la puerta de «Antecedentes» fuera de ese paso es bloqueo; ya marcada por el portal no se toca', async () => {
  const a = await abrir()
  try {
    await a.aPersonales()
    await assert.rejects(marcarAntecedenteTurismosAllianz(a.marco, a.guard, 'partes_culpables', null), EmisionBloqueadaError)
    await a.marco.evaluate(() => { (document.querySelector('#cdk-stepper-0-content-1 .sig') as HTMLButtonElement).click() })
    await a.marco.evaluate(() => { (document.querySelector('#ng-z-ant2-2') as HTMLInputElement).checked = true })
    assert.deepEqual(await marcarAntecedenteTurismosAllianz(a.marco, a.guard, 'partes_culpables', null), { estado: 'con_valor', marcada: '2 partes', coincide: false })
    assert.deepEqual(await marcarAntecedenteTurismosAllianz(a.marco, a.guard, 'partes_culpables', 2), { estado: 'con_valor', marcada: '2 partes', coincide: true })
    assert.equal(await marcada(a, 'ant2'), 2)
    assert.deepEqual(await marcarAntecedenteTurismosAllianz(a.marco, a.guard, 'compania_tiempo', 7), { estado: 'marcada', elegida: '5 años o más' })
  } finally {
    await a.context.close()
  }
})

test('v0.6.10 «Antecedentes»: el portal ya trae valor → se declara con su etiqueta REAL (sin dato / distinto de la ficha); igual al dato → es dato y no se declara', async () => {
  // (a) sin dato: el precio sale con el valor por defecto del portal → supuesto con la etiqueta real.
  const sin = await hastaCompania({ antPrefijada: { ant2: 1 } }, { ...FORM, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null })
  try {
    assert.equal(await marcada(sin, 'ant2'), 1, 'no se toca')
    assert.ok(sin.error.message.includes('partes culpables: «1 parte» (fijado por Allianz)'), sin.error.message)
    assert.ok(!sin.error.message.includes(SUPUESTO_PARTES_CULPABLES), 'no se declara «ninguno» si el portal tiene otro valor')
  } finally {
    await sin.context.close()
  }
  // (b) dato distinto del marcado → se declara «distinto de la ficha».
  const distinto = await hastaCompania({ antPrefijada: { ant1: 1 } }, { ...FORM, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 })
  try {
    assert.equal(await marcada(distinto, 'ant1'), 1, 'no se toca')
    assert.ok(distinto.error.message.includes('tiempo en la compañía: «1 año» (fijado por Allianz, distinto de la ficha)'), distinto.error.message)
  } finally {
    await distinto.context.close()
  }
  // (c) marcado igual al dato → dato: sin supuesto.
  const igual = await hastaCompania({ antPrefijada: { ant1: 3 } }, { ...FORM, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 })
  try {
    assert.ok(!igual.error.message.includes('tiempo en la compañía'), igual.error.message)
    assert.ok(/Selección de paquete/.test(igual.error.message))
  } finally {
    await igual.context.close()
  }
})

test('v0.6.10 «Antecedentes»: la máxima sin casar por texto → se pulsa la última y el supuesto nombra su etiqueta REAL', async () => {
  const raro = await hastaCompania({ antecedentesRaros: true }, { ...FORM, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null })
  try {
    assert.equal(await marcada(raro, 'ant1'), 5)
    assert.ok(raro.error.message.includes('tiempo en la compañía: «Más de cuatro» (la última del grupo, supuesto favorable, no consta)'), raro.error.message)
    assert.ok(!raro.error.message.includes(SUPUESTO_TIEMPO_COMPANIA), 'no dice «5 años o más» si no es lo que se pulsó')
  } finally {
    await raro.context.close()
  }
})

// ─────────── v0.6.11 · «Cinco últimos dígitos de la póliza actual» ───────────
// Números INVENTADOS (90817); ningún dato real.
const POL = '90817'
const valorPoliza = (a: { marco: Frame }) => a.marco.locator('#ng-z-pol').inputValue()

test('v0.6.11 plan (puro): la clave del riesgo solo vale con 5 cifras exactas; la operación va tras la compañía y no genera supuesto', () => {
  assert.equal(polizaActualUltimos5De({ polizaAnteriorUltimos5: POL }), POL)
  for (const v of ['9081', '908171', 'abcde', ' ', null, undefined, 90817]) assert.equal(polizaActualUltimos5De({ polizaAnteriorUltimos5: v }), null, String(v))
  const HOY = new Date('2026-10-15T10:00:00Z')
  const ant = planDatosTurismos({ ...FORM, polizaAnteriorUltimos5: POL } as FormularioAuto, HOY).pasos[2]
  assert.deepEqual(ant.operaciones.slice(0, 2).map((o) => o.tipo), ['compania', 'poliza'])
  const { supuestos } = planDatosTurismos({ ...FORM, polizaAnteriorUltimos5: POL } as FormularioAuto, HOY)
  assert.ok(!supuestos?.includes('póliza') && !JSON.stringify(supuestos).includes(POL))
})

test('v0.6.11 con dato: escribe los 5 dígitos en el input por su etiqueta, sin otros campos, y el dato no sale en ningún mensaje', async () => {
  const r = await hastaCompania({ poliza: {} }, { ...FORM, companiaAnterior: 'Aseguradora Alfa', polizaAnteriorUltimos5: POL } as FormularioAuto)
  try {
    assert.equal(await valorPoliza(r), POL)
    assert.ok(r.pulsados.includes('poliza:escrita'))
    assert.ok(/Selección de paquete/.test(r.error.message), 'sin hueco: se avanza')
    assert.ok(!r.error.message.includes(POL), 'los 5 dígitos no van a los supuestos ni al error')
    assert.ok(!JSON.stringify(clasificar(r.error)).includes(POL))
    assert.ok(!r.error.message.includes(SUPUESTO_POLIZA_FIJADA) && !r.error.message.includes(HUECO_POLIZA_ACTUAL))
    assert.equal(await r.valor('ng-z-col'), '', 'nada más tocado')
  } finally {
    await r.context.close()
  }
})

test('v0.6.11 sin dato: hueco con nombre, el campo queda vacío y NO se pulsa «Siguiente» de Antecedentes', async () => {
  const r = await hastaCompania({ poliza: {} }, { ...FORM, companiaAnterior: 'Aseguradora Alfa' })
  try {
    assert.equal(await valorPoliza(r), '', 'nunca se inventa')
    assert.ok(r.pulsados.includes('poliza:sin_dato'))
    assert.ok(esMapa(/póliza actual: faltan los 5 últimos dígitos/)(r.error), r.error.message)
    assert.ok(!r.pulsados.includes('Siguiente'.toLowerCase()) && (await r.clics()).every((c) => !c.includes('ng-z-ef')), 'no se avanzó')
    assert.equal(await r.marco.locator('[role=tab][aria-selected=true]').innerText(), 'Antecedentes', 'sigue en Antecedentes')
    assert.equal(HUECO_POLIZA_ACTUAL, 'póliza actual: faltan los 5 últimos dígitos')
  } finally {
    await r.context.close()
  }
})

test('v0.6.11 el portal ya trae valor: no se toca y se declara «fijada por Allianz» (sin el valor)', async () => {
  const r = await hastaCompania({ poliza: { valor: '12345' } }, { ...FORM, companiaAnterior: 'Aseguradora Alfa', polizaAnteriorUltimos5: POL } as FormularioAuto)
  try {
    assert.equal(await valorPoliza(r), '12345', 'no se pisa')
    assert.ok(r.pulsados.includes('poliza:con_valor'))
    assert.ok(r.error.message.includes(SUPUESTO_POLIZA_FIJADA), r.error.message)
    assert.ok(!r.error.message.includes('12345') && !r.error.message.includes(POL))
  } finally {
    await r.context.close()
  }
})

test('v0.6.11 campo deshabilitado y vacío → hueco (no se teclea); campo ausente → nada, ni hueco ni supuesto', async () => {
  const bloq = await hastaCompania({ poliza: { bloqueada: true } }, { ...FORM, companiaAnterior: 'Aseguradora Alfa', polizaAnteriorUltimos5: POL } as FormularioAuto)
  try {
    assert.equal(await valorPoliza(bloq), '')
    assert.ok(esMapa(/Cinco últimos dígitos de la póliza actual.*no editable/)(bloq.error), bloq.error.message)
    assert.ok(!bloq.error.message.includes(POL))
  } finally {
    await bloq.context.close()
  }
  const aus = await hastaCompania({}, { ...FORM, companiaAnterior: 'Aseguradora Alfa', polizaAnteriorUltimos5: POL } as FormularioAuto)
  try {
    assert.ok(aus.pulsados.includes('poliza:ausente'))
    assert.ok(/Selección de paquete/.test(aus.error.message))
    assert.ok(!aus.error.message.includes('póliza actual') && !aus.error.message.includes(POL))
  } finally {
    await aus.context.close()
  }
})

test('guard v0.6.11: la puerta de la póliza actual fuera de «Antecedentes» es bloqueo; un dato que no son 5 cifras es bloqueo (sin repetirlo)', async () => {
  const a = await abrir({ poliza: {} })
  try {
    await a.aPersonales()
    await assert.rejects(polizaActualTurismosAllianz(a.marco, a.guard, POL), EmisionBloqueadaError)
    assert.equal(await valorPoliza(a).catch(() => ''), '')
    await a.marco.evaluate(() => { (document.querySelector('#cdk-stepper-0-content-1 .sig') as HTMLButtonElement).click() })
    for (const malo of ['9081', '908171', '9081a', "90817'; x"]) {
      await assert.rejects(polizaActualTurismosAllianz(a.marco, a.guard, malo), (e: unknown) => e instanceof EmisionBloqueadaError && !(e as Error).message.includes(malo))
    }
    assert.deepEqual(await polizaActualTurismosAllianz(a.marco, a.guard, POL), { estado: 'escrita' })
    assert.deepEqual(await polizaActualTurismosAllianz(a.marco, a.guard, '11111'), { estado: 'con_valor' })
    assert.equal(await valorPoliza(a), POL)
  } finally {
    await a.context.close()
  }
})

test('v0.6.11 privacidad: clasificar tapa un fill(...) crudo con los 5 dígitos', () => {
  assert.ok(!clasificar(new Error(`locator.fill("${POL}"): Timeout 3000ms exceeded`)).mensaje.includes(POL))
})

test('v0.6.11 atasco genérico de «SIGUIENTE»: lista las etiquetas de los obligatorios vacíos del paso (ni los opcionales, ni los de otros pasos, ni valores)', async () => {
  const r = await hastaCompania({ obligatorioAjeno: true, poliza: {} }, { ...FORM, companiaAnterior: 'Aseguradora Alfa', polizaAnteriorUltimos5: POL } as FormularioAuto)
  try {
    assert.ok(esMapa(/qué falta para habilitar «SIGUIENTE» en «Antecedentes» \(obligatorios sin rellenar o inválidos: «Dato ajeno obligatorio»\)/)(r.error), r.error.message)
    assert.ok(!/Dato opcional|Matrícula|Número de documento/.test(r.error.message), 'solo los del paso activo')
    assert.ok(!r.error.message.includes(POL))
    assert.deepEqual(await obligatoriosPendientesTurismos(r.marco), ['Dato ajeno obligatorio'])
  } finally {
    await r.context.close()
  }
})

// ───────────── v0.6.12: lector de «Selección de paquete» (tabla comparativa; importes y nombres INVENTADOS) ─────────────
async function llegarAPrecios(o: Opc) {
  const a = await abrir(o)
  const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, a.marco, FORM, a.ctx)
  return { ...a, resultado: await recorrerPasosTurismos(a.page, a.marco, FORM, a.ctx, r.supuestoVersion, new Date(), 3_000) }
}

test('v0.6.12 «Selección de paquete»: 3 paquetes → 3 ofertas (anualidad, primer recibo, supuestos en avisos, coberturas) SIN pulsar nada de la pantalla', async () => {
  const a = await llegarAPrecios({ paquetes: 'completa' })
  try {
    const o = a.resultado.ofertas
    assert.deepEqual(o.map((x) => [x.producto, x.primaAnualEur, x.importeReciboEur]), [['Auto · Paquete Uno', 710, 700], ['Auto · Paquete Dos', 800, 780], ['Auto · Paquete Tres', 1234.56, 1100.5]])
    for (const x of o) {
      assert.equal(x.compania, 'allianz')
      assert.equal(x.primaNetaEur, null)
      assert.equal(x.fraccionamiento, null, 'la pantalla no dice el fraccionamiento')
      assert.ok(x.avisos.some((v) => v.startsWith('Precio con supuestos: ') && v.includes('uso diario')), x.avisos.join(' | '))
      assert.ok(x.avisos.some((v) => v.includes('no indica el fraccionamiento')))
      assert.ok(x.avisos.some((v) => v.startsWith('Precio con las opciones que traía marcadas el portal: Accidentes del conductor: 100.000 [9.95 € Anual (sin impuestos)]; Vehículo de sustitución: No Incluido.')), x.avisos.join(' | '))
      assert.ok(!x.avisos.includes('coberturas no leídas'))
    }
    assert.ok(o[0]!.avisos.some((v) => v.includes('MEJOR OPCIÓN')) && !o[1]!.avisos.some((v) => v.includes('MEJOR OPCIÓN')))
    assert.ok(o[2]!.avisos.some((v) => v.includes('aviso en el título')))
    const cob = (i: number) => o[i]!.coberturas.map((c) => `${c.literal}=${c.estado}`)
    assert.deepEqual(cob(0), ['Daños propios=excluida', 'Fenómenos de la naturaleza=excluida', 'Accidentes del conductor: 100.000=incluida', 'Vehículo de sustitución: No Incluido=excluida', 'RC Obligatoria=incluida', 'Cristales=incluida', 'Robo=excluida'])
    assert.ok(cob(1).includes('Fenómenos de la naturaleza: Sí=incluida') && cob(1).includes('Robo=incluida'))
    assert.ok(cob(2).includes('Daños propios: Baja=incluida') && cob(2).includes('Fenómenos de la naturaleza=incluida'))
    assert.equal(o[0]!.coberturas.find((c) => c.clave === 'Accidentes del conductor')?.capital, 100_000)
    assert.deepEqual(o[2]!.franquicias.map((f) => f.ambito), ['Daños propios'])
    assert.deepEqual(o[0]!.franquicias, [])
    // Solo lectura: lo último que se pulsó fue el «Siguiente» de «Antecedentes»; ni «Seleccionar» ni opciones de la tabla.
    assert.equal(a.pulsados[a.pulsados.length - 1], 'Siguiente')
    assert.deepEqual(await a.marco.evaluate(() => (window as unknown as { __clicsPrecios: string[] }).__clicsPrecios), [], 'ningún clic dentro de la pantalla de precios (ni «Seleccionar», ni opciones, ni desplegables)')
    assert.ok(!a.pulsados.some((p) => /Seleccionar|opcion:(accidentes|vehiculo_sustitucion)/.test(p)), a.pulsados.join(','))
  } finally {
    await a.context.close()
  }
})

test('v0.6.12 «Selección de paquete»: «la anualidad» ilegible → ESE paquete fuera con aviso (las demás ofertas siguen); sin tabla de coberturas → «coberturas no leídas»', async () => {
  const a = await llegarAPrecios({ paquetes: 'ilegible' })
  try {
    const o = a.resultado.ofertas
    assert.deepEqual(o.map((x) => x.producto), ['Auto · Paquete Uno', 'Auto · Paquete Tres'])
    for (const x of o) assert.ok(x.avisos.includes('Paquete «Paquete Dos» descartado: «la anualidad» no se pudo leer como importe.'), x.avisos.join(' | '))
  } finally {
    await a.context.close()
  }
  const b = await llegarAPrecios({ paquetes: 'sin_coberturas' })
  try {
    assert.equal(b.resultado.ofertas.length, 3)
    for (const x of b.resultado.ofertas) assert.deepEqual([x.coberturas, x.franquicias, x.avisos.includes('coberturas no leídas')], [[], [], true])
  } finally {
    await b.context.close()
  }
})

test('v0.6.12 «Selección de paquete»: tabla vacía (sin paquetes) → el hueco de siempre con inventario', async () => {
  const a = await abrir({ paquetes: 'vacia' })
  try {
    const r = await rellenarDatosVehiculoTurismosConSupuesto(a.page, a.marco, FORM, a.ctx)
    await assert.rejects(recorrerPasosTurismos(a.page, a.marco, FORM, a.ctx, r.supuestoVersion, new Date(), 1_500), esMapa(/la pantalla de precios «Selección de paquete» del asistente de Turismos \(sin mapa del lector de primas\)/))
  } finally {
    await a.context.close()
  }
})
