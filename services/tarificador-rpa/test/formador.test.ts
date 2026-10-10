// Formador del worker (06/10/2026): validación DETERMINISTA y proyección de candidatos. `node --test`
// (sin navegador: lo que toca la página se valida en real). Vive FUERA de src/ a propósito: aquí se
// nombran textos que src/ no puede nombrar (los vigila test/regression-tarificador-rpa.test.ts de la raíz).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright'
import {
  ACCIONES_PERMITIDAS,
  BLOQUEO_FORMADOR,
  mensajeBloqueo,
  normalizarTexto,
  prepararFormador,
  proyectarCandidato,
  resolverConFormador,
  selectorYaUsado,
  sinSelector,
  validarAccion,
  validarCampo,
  type DescripcionElemento,
} from '../src/formador.ts'

const base: DescripcionElemento = {
  coincidencias: 1, visible: true, tag: 'button', type: null, role: null, texto: 'Calcular', valorBoton: null, title: null, ariaLabel: null,
  id: null, name: null, href: null, onclick: null, onchange: null, formaction: null, etiquetaFila: null, deshabilitado: false, editableContenido: false,
}
const d = (o: Partial<DescripcionElemento>): DescripcionElemento => ({ ...base, ...o })

test('normalizarTexto: sin mayúsculas, tildes ni «>»', () => {
  assert.equal(normalizarTexto('  > CALCULAR  '), 'calcular')
  assert.equal(normalizarTexto('Datos Básicos'), 'datos basicos')
  assert.equal(normalizarTexto(null), '')
})

test('acción calcular: acepta «Calcular», «CALCULAR», «> Calcular» y un input-botón con value', () => {
  for (const t of ['Calcular', 'CALCULAR', '> Calcular', ' calcular »']) assert.deepEqual(validarAccion(d({ texto: t }), 'calcular'), { ok: true }, t)
  assert.deepEqual(validarAccion(d({ tag: 'input', type: 'submit', texto: null, valorBoton: 'Calcular' }), 'calcular'), { ok: true })
  assert.deepEqual(validarAccion(d({ tag: 'a', texto: 'Calcular' }), 'calcular', 'Calcular'), { ok: true })
})

test('acción calcular: rechaza «Emitir», «Aceptar», otro texto y lo que esconde la emisión en id/href', () => {
  assert.equal(validarAccion(d({ texto: 'Emitir' }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Aceptar' }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Guardar' }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Calcular', id: 'btnEmitirPoliza' }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Calcular', href: '/poliza/contratar' }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Calcular y formalizar' }), 'calcular').ok, false)
})

test('acción: exige exactamente 1 elemento visible y habilitado; clave y texto de la tabla cerrada', () => {
  assert.equal(validarAccion(d({ coincidencias: 2 }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ coincidencias: 0 }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ visible: false }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ deshabilitado: true }), 'calcular').ok, false)
  assert.equal(validarAccion(d({ texto: 'Emitir' }), 'emitir').ok, false, 'clave fuera de la lista')
  assert.equal(validarAccion(d({ texto: 'Aceptar' }), 'calcular', 'Aceptar').ok, false, 'texto esperado fuera de la tabla')
  assert.equal(validarAccion(d({ tag: 'input', type: 'text', texto: null, valorBoton: null, title: 'Calcular' }), 'calcular').ok, false, 'un input de texto no es una acción')
})

// Campo con su etiqueta de fila: la del formulario «Metros Cuadrados».
const c = (o: Partial<DescripcionElemento>): DescripcionElemento => d({ texto: null, etiquetaFila: 'Metros Cuadrados *', ...o })
const M2 = 'Metros Cuadrados'

test('campo: control editable sí; enlace, botón, input-botón o password no', () => {
  assert.deepEqual(validarCampo(c({ tag: 'input', type: 'text' }), M2), { ok: true })
  assert.deepEqual(validarCampo(c({ tag: 'input', type: null }), M2), { ok: true })
  assert.deepEqual(validarCampo(c({ tag: 'select' }), M2), { ok: true })
  assert.deepEqual(validarCampo(c({ tag: 'nx-dropdown' }), M2), { ok: true })
  assert.deepEqual(validarCampo(c({ tag: 'div', role: 'combobox' }), M2), { ok: true })
  assert.equal(validarCampo(c({ tag: 'a', texto: 'Superficie' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'button' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'input', type: 'submit' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'input', type: 'password' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', coincidencias: 3 }), M2).ok, false)
})

test('campo del formador: nunca una casilla (checkbox/radio), ni por type ni por role', () => {
  assert.equal(validarCampo(c({ tag: 'input', type: 'checkbox' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'input', type: 'radio' }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'div', role: 'checkbox', editableContenido: true }), M2).ok, false)
  assert.equal(validarCampo(c({ tag: 'span', role: 'radio' }), M2).ok, false)
})

test('campo del formador: palabras de emisión en id/name/title/aria-label/onclick/onchange → rechazo, sin volcar el valor', () => {
  for (const attr of ['id', 'name', 'title', 'ariaLabel', 'onclick', 'onchange'] as const) {
    for (const v of ['chkEmitirPoliza', 'contratar_ya', 'doFormalizar()']) {
      const r = validarCampo(c({ tag: 'input', type: 'text', [attr]: v }), M2)
      assert.equal(r.ok, false, `${attr}=${v}`)
      assert.ok(!r.ok && !r.motivo.includes(v), `el motivo no lleva el valor (${attr})`)
    }
  }
})

test('campo del formador: la etiqueta de la fila tiene que ser la del campo pedido', () => {
  // ≤2 palabras: el 100 %.
  assert.deepEqual(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'METROS CUADRADOS:' }), M2), { ok: true })
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'Año Construcción' }), M2).ok, false, 'otra fila')
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'Metros' }), M2).ok, false, 'solo una de dos palabras')
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'Fecha Inicio' }), 'Fecha Término').ok, false, 'Fecha Inicio ≠ Fecha Término')
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: null }), M2).ok, false, 'sin etiqueta de fila')
  assert.equal(validarCampo(c({ tag: 'input', type: 'text' }), null).ok, false, 'sin etiqueta pedida')
  // >2 palabras: el 50 %.
  assert.deepEqual(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'Plantas sobre rasante' }), 'Plantas sobre N. Calle'), { ok: true })
  assert.equal(validarCampo(c({ tag: 'input', type: 'text', etiquetaFila: 'Plantas bajo Nivel Calle' }), 'Instalaciones Anexas (Deportivas, Piscinas, etc.)').ok, false)
})

test('selectorYaUsado: un elemento no vale para dos claves en el mismo trabajo', () => {
  const m = new Map<string, string>()
  assert.deepEqual(selectorYaUsado(m, 'metros_cuadrados', '#m2', 'appArea'), { ok: true })
  m.set(`appArea\u0000#m2`, 'metros_cuadrados')
  assert.deepEqual(selectorYaUsado(m, 'metros_cuadrados', '#m2', 'appArea'), { ok: true }, 'la misma clave sí')
  assert.equal(selectorYaUsado(m, 'ano_construccion', '#m2', 'appArea').ok, false)
})

test('ACCIONES_PERMITIDAS: SOLO «calcular» (ampliarla es decisión de Alberto)', () => {
  assert.deepEqual(Object.keys(ACCIONES_PERMITIDAS), ['calcular'])
  assert.deepEqual([...ACCIONES_PERMITIDAS.calcular], ['calcular', 'calcular prima', 'recalcular'])
  for (const otra of ['nueva_alta', 'pestana_proyecto', 'pestana_tarificar', 'desplegar_menu']) assert.equal(validarAccion(d({ texto: 'Calcular' }), otra).ok, false, otra)
})

test('validarAccion: el motivo nombra el atributo que casó, nunca su valor (href/onclick)', () => {
  const href = '/poliza/emitir?nif=12345678Z'
  const r1 = validarAccion(d({ texto: 'Calcular', href }), 'calcular')
  assert.equal(r1.ok, false)
  assert.ok(!r1.ok && r1.motivo.includes('href') && !r1.motivo.includes('12345678Z') && !r1.motivo.includes('/poliza'))
  const r2 = validarAccion(d({ texto: 'Calcular', onclick: "doContratar('ES12 3456')" }), 'calcular')
  assert.ok(!r2.ok && r2.motivo.includes('onclick') && !r2.motivo.includes('ES12'))
  assert.equal(validarAccion(d({ texto: 'Calcular', onchange: 'formalizar()' }), 'calcular').ok, false)
})

test('proyección de candidatos: nunca un value, ni un password, ni texto de un campo; PII tapada', () => {
  const campo = proyectarCandidato({ tag: 'INPUT', type: 'text', id: 'nif', value: '12345678Z', texto: 'contenido', etiqueta: 'NIF del tomador 12345678Z', selector: '#nif', marco: 'appArea' }, 'campo')!
  const json = JSON.stringify(sinSelector(campo))
  assert.ok(!('value' in campo))
  assert.ok(!json.includes('12345678Z'))
  assert.equal(campo.texto, null)
  assert.equal(campo.tag, 'input')
  assert.ok(!('selector' in sinSelector(campo)))
  assert.equal(proyectarCandidato({ tag: 'input', type: 'password', selector: '#p' }, 'campo'), null)
  const boton = proyectarCandidato({ tag: 'input', type: 'submit', valorBoton: 'Calcular', value: 'x', selector: '#c' }, 'accion')!
  assert.equal(boton.texto, 'Calcular')
  const texto = proyectarCandidato({ tag: 'input', type: 'text', valorBoton: 'secreto', selector: '#t' }, 'accion')!
  assert.equal(texto.texto, null, 'el valor de un input que no es botón no se usa nunca')
  const conClave = proyectarCandidato({ tag: 'a', texto: 'Hola superSecreta99', selector: 'a' }, 'accion', (t) => t.replaceAll('superSecreta99', '[REDACTADO]'))!
  assert.ok(!conClave.texto!.includes('superSecreta99'))
  assert.equal(proyectarCandidato({ tag: 'a', texto: 'x' }, 'accion'), null, 'sin selector no hay candidato')
})

test('tablas: ninguna acción permitida casa con el bloqueo', () => {
  for (const [clave, textos] of Object.entries(ACCIONES_PERMITIDAS)) {
    for (const t of textos) assert.ok(!BLOQUEO_FORMADOR.some((b) => t.includes(b)), `${clave}: «${t}»`)
  }
})

test('mensajeBloqueo: legible para Alberto, solo con lo bloqueante', () => {
  const m = mensajeBloqueo('allianz', 'formulario', {
    revisadoPorIA: true, enPantallaEsperada: true, sugerencias: [], incidencias: [],
    avisos: [
      { texto: 'Fecha de efecto anterior a hoy', interpretacion: 'Hay que poner la fecha de efecto de hoy en adelante', bloqueante: true },
      { texto: 'Revise coberturas', interpretacion: 'Informativo', bloqueante: false },
    ],
  })!
  assert.match(m, /Fecha de efecto anterior a hoy/)
  assert.ok(!m.includes('Revise coberturas'))
  assert.equal(mensajeBloqueo('allianz', 'resultado', { revisadoPorIA: false, enPantallaEsperada: null, avisos: [], sugerencias: [], incidencias: [] }), null)
})

const baseCtx = { trabajoId: '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b', compania: 'allianz', ramo: 'comunidades', apiUrl: 'https://x.test', secreto: 's'.repeat(20), redactar: (t: string) => t, log: () => undefined }
const respuesta = (cuerpo: unknown, status = 200) => (async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch

test('prepararFormador: fail-closed (apagado, error HTTP o red caída → inactivo)', async () => {
  assert.equal((await prepararFormador({ ...baseCtx, fetchImpl: respuesta({ formadorActivo: false }) })).activo, false)
  assert.equal((await prepararFormador({ ...baseCtx, fetchImpl: respuesta({ formadorActivo: true }, 503) })).activo, false)
  assert.equal((await prepararFormador({ ...baseCtx, fetchImpl: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch })).activo, false)
  const on = await prepararFormador({ ...baseCtx, fetchImpl: respuesta({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: true } }) })
  assert.equal(on.activo, true)
  assert.equal(on.acompanado, true)
})

test('resolverConFormador: apagado o acción fuera de la lista → null sin tocar la página', async () => {
  const page = {} as Page
  assert.equal(await resolverConFormador(page, undefined, { clave: 'calcular', tipo: 'accion', descripcion: '' }), null)
  const ctx = await prepararFormador({ ...baseCtx, fetchImpl: respuesta({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }) })
  assert.equal(await resolverConFormador(page, ctx, { clave: 'emitir', tipo: 'accion', descripcion: '' }), null)
})
