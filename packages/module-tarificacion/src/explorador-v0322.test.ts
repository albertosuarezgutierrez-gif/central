// Explorador 0.3.22 (29/10/2026) · fixtures SINTÉTICAS (sin PII):
// 1) Allianz VMP «Figuras Intervinientes» (6b3176de…): `elegir` sobre `IntervinientesBean$nifTomador_tipoDoc` rechazado («opcion tiene que
//    ser { valor }»): la opción buscada («DNI/NIF/NIE/CIF») tiene value="" → valor null en el inventario; la IA no podía expresarla.
//    Formas inequívocas (cadena, { texto }) resueltas contra el inventario; la opción vacía ya puesta no se ejecuta; redactada, nunca.
// 2) Mapfre NSE (dbf8ef0e…): `formDG:panelConfirmCTOpenedState` (estado de modal RichFaces) en el POST a datosGenerales.jsf casaba con
//    «confirm». Exención estrecha `<id>OpenedState` = ''|'true'|'false'; el detalle del bloqueo lista TODOS los nombres (nunca valores).
// 3) Fidelidade (530656a4…): la regla sin texto, de una subcadena (Simualtion.aspx) a LISTA CERRADA exacta (+ ClientData.aspx).
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  catalogoDe,
  ENTRADAS_EXPLORACION,
  motivoNoAvanceSinTexto,
  cuerpoToleradoConAccionReal,
  detalleCuerpoToleradoConAccionReal,
  esEstadoModalJsf,
  normalizarOpcionElegir,
  sanearInventarioDom,
  textoDetalleCuerpo,
  validarRespuestaExplorador,
  type ElementoInventario,
  type InventarioDom,
} from './index.ts'

// ─── 1) Allianz VMP: forma de la opción de `elegir` ─────────────────────────────────────────────────────────────────────────────────
const AZ = 'allianz:autos:movilidad_personal'
const URL_SEA = 'https://www.e-pacallianz.com/drvp00/SEAServlet'
const TIPO_DOC = [{ valor: '', texto: 'DNI/NIF/NIE/CIF' }, { valor: 'P', texto: 'Pasaporte' }, { valor: 'O', texto: 'Otros' }]
type Sel = { id: string; opciones: { valor: string; texto: string }[]; conValor?: boolean; total?: number; selectpicker?: boolean }
const sel = (s: Sel) => ({ tag: 'select', id: s.id, name: s.id, etiqueta: 'Tipo de documento', opciones: s.opciones, opcionesTotal: s.total ?? s.opciones.length, conValor: s.conValor ?? false, ...(s.selectpicker ? { selectpicker: true } : {}) })
const CP = { tag: 'input', type: 'text', id: 'cp', name: 'IntervinientesBean$cp', etiqueta: 'Código postal', conValor: false }
function inv(sels: Sel[]): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: URL_SEA, nombre: 'm', titulos: [{ texto: 'Figuras Intervinientes', tag: 'h3' }], elementos: [...sels.map(sel), CP] }] }, undefined, { refs: true })!
}
const ref = (i: InventarioDom, id: string) => i.marcos[0].elementos.find((e) => e.id === id)!.ref!
const validar = (i: InventarioDom, acciones: unknown[], datosReales: { riesgo: unknown } | null = null) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'Figuras Intervinientes', tipo: 'formulario' }, acciones, mapeo: [], motivo: null },
    { inventario: i, ramo: 'patinete', entrada: AZ, datosReales, presupuestoEnCurso: false })
const TD = 'IntervinientesBean$nifTomador_tipoDoc'

describe('0.3.22 · Allianz VMP: elegir con la opción en forma inequívoca', () => {
  it('fixture: la opción de value="" sale con valor null (lo que vio la IA)', () => {
    const el = inv([{ id: TD, opciones: TIPO_DOC }]).marcos[0].elementos[0]
    expect(el.opciones![0]).toEqual({ valor: null, texto: 'DNI/NIF/NIE/CIF' })
    expect(catalogoDe('patinete').some((d) => d.clave === 'vehiculo.codigo_postal')).toBe(true)
  })

  it('real (6b3176de): [elegir tipoDoc «DNI/NIF/NIE/CIF» (vacía, ya puesta), rellenar] → ok; el elegir NO se ejecuta', () => {
    const i = inv([{ id: TD, opciones: TIPO_DOC }])
    for (const opcion of [{ texto: 'DNI/NIF/NIE/CIF' }, { valor: null, texto: 'DNI/NIF/NIE/CIF' }, 'DNI/NIF/NIE/CIF', '  DNI/NIF/NIE/CIF ']) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion }, { accion: 'rellenar', ref: ref(i, 'cp'), dato: 'vehiculo.codigo_postal' }])
      expect(v.ok, `${JSON.stringify(opcion)} → ${JSON.stringify(v)}`).toBe(true)
      if (v.ok) expect(v.respuesta.acciones).toEqual([{ accion: 'rellenar', ref: ref(i, 'cp'), dato: 'vehiculo.codigo_postal' }])
    }
  })

  it('solo el elegir de la opción ya puesta → lote_sin_efecto (no un lote vacío que repita la pantalla)', () => {
    const i = inv([{ id: TD, opciones: TIPO_DOC }])
    const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion: { texto: 'DNI/NIF/NIE/CIF' } }])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores.join(' ')).toMatch(/lote_sin_efecto/)
  })

  it('cadena = valor, cadena = texto, { texto }, { valor, texto } de la MISMA opción → { valor } del inventario', () => {
    const i = inv([{ id: TD, opciones: TIPO_DOC }])
    for (const opcion of ['P', 'Pasaporte', { texto: 'Pasaporte' }, { valor: 'P', texto: 'Pasaporte' }]) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion }])
      expect(v.ok, JSON.stringify(opcion)).toBe(true)
      if (v.ok) expect(v.respuesta.acciones).toEqual([{ accion: 'elegir', ref: ref(i, TD), opcion: { valor: 'P' } }])
    }
  })

  it('formas NO inequívocas o fuera del inventario → rechazo (la comprobación de opción permitida no se relaja)', () => {
    const i = inv([{ id: TD, opciones: TIPO_DOC }])
    const casos: [unknown, RegExp][] = [
      ['NIF', /no está entre las opciones/],
      [{ texto: 'pasaporte' }, /no está entre las opciones/],
      ['Pasaporte español', /no está entre las opciones/],
      [{ valor: null }, /opcion tiene que ser \{ valor \}/],
      [{ valor: 5 }, /opcion tiene que ser \{ valor \}/],
      [{ texto: 'Pasaporte', otra: 1 }, /opcion tiene que ser \{ valor \}/],
      [{}, /opcion tiene que ser \{ valor \}/],
      [['P'], /opcion tiene que ser \{ valor \}/],
      [{ valor: 'O', texto: 'Pasaporte' }, /misma opción/],
      [{ valor: 'X' }, /no está entre las opciones/],
    ]
    for (const [opcion, re] of casos) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion }])
      expect(v.ok, JSON.stringify(opcion)).toBe(false)
      if (!v.ok) expect(v.errores.join(' '), JSON.stringify(opcion)).toMatch(re)
    }
  })

  it('cadena que es valor de una opción y texto de OTRA → ambigua; texto repetido → ambiguo', () => {
    const i = inv([{ id: 'a', opciones: [{ valor: 'A', texto: 'B' }, { valor: 'B', texto: 'C' }] }, { id: 'b', opciones: [{ valor: '1', texto: 'Uno' }, { valor: '2', texto: 'Uno' }] }])
    for (const [id, opcion] of [['a', 'B'], ['b', { texto: 'Uno' }], ['b', 'Uno']] as const) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, id), opcion }])
      expect(v.ok, `${id} ${JSON.stringify(opcion)}`).toBe(false)
      if (!v.ok) expect(v.errores.join(' ')).toMatch(/ambigua/)
    }
  })

  it('opción sin valor que NO es seguro que esté puesta → rechazo (una redactada nunca se elige)', () => {
    const casos: Sel[] = [
      { id: TD, opciones: TIPO_DOC, conValor: true }, // el select ya tiene otro valor: elegir la vacía sería cambiarlo
      { id: TD, opciones: TIPO_DOC, total: 5 }, // no están todas las opciones en el inventario
      { id: TD, opciones: [...TIPO_DOC, { valor: '', texto: 'Seleccione' }] }, // dos sin valor: no se sabe cuál es la puesta
    ]
    for (const s of casos) {
      const i = inv([s])
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion: { texto: 'DNI/NIF/NIE/CIF' } }, { accion: 'rellenar', ref: ref(i, 'cp'), dato: 'vehiculo.codigo_postal' }])
      expect(v.ok, JSON.stringify(s)).toBe(false)
      if (!v.ok) expect(v.errores.join(' ')).toMatch(/no tiene valor en el inventario/)
    }
  })

  it('selectpicker: una opción de ACCIÓN FINAL sigue rechazada aunque llegue por { texto } o cadena', () => {
    const i = inv([{ id: 'VMPBean$accion', opciones: [{ valor: '', texto: 'Seleccione' }, { valor: '7', texto: 'Emitir póliza' }], selectpicker: true }])
    for (const opcion of [{ texto: 'Emitir póliza' }, 'Emitir póliza', '7']) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, 'VMPBean$accion'), opcion }])
      expect(v.ok, JSON.stringify(opcion)).toBe(false)
      if (!v.ok) expect(v.errores.join(' ')).toMatch(/acción final/)
    }
  })

  it('con datos REALES: elegir por { texto } sin mapeo sigue rechazado', () => {
    const i = inv([{ id: TD, opciones: TIPO_DOC }])
    const v = validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion: { texto: 'Pasaporte' } }], { riesgo: {} })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores.join(' ')).toMatch(/con datos reales/)
  })

  it('nx-dropdown: cadena o { texto } = el texto; dato personal sigue rechazado', () => {
    const nx: ElementoInventario = { tag: 'nx-dropdown', ref: 'm1e1', opciones: [{ valor: null, texto: 'Particular' }] }
    expect(normalizarOpcionElegir('Particular', nx)).toEqual({ ok: true, valor: 'Particular' })
    expect(normalizarOpcionElegir({ texto: 'Particular' }, nx)).toEqual({ ok: true, valor: 'Particular' })
    expect(normalizarOpcionElegir({ valor: 'Otra', texto: 'Particular' }, nx).ok).toBe(false)
    const i = sanearInventarioDom({ marcos: [{ url: URL_SEA, nombre: 'm', elementos: [{ tag: 'nx-dropdown', id: 'uso', role: 'combobox', etiqueta: 'Uso' }] }] }, undefined, { refs: true })!
    const v = validar(i, [{ accion: 'elegir', ref: ref(i, 'uso'), opcion: '12345678Z' }])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores.join(' ')).toMatch(/dato personal/)
  })
})

// ─── 2) Mapfre NSE: estado de modal RichFaces y diagnóstico con TODOS los nombres ───────────────────────────────────────────────────
describe('0.3.22 · Mapfre NSE: <id>OpenedState no es una acción', () => {
  it('esEstadoModalJsf: solo id JSF, último segmento …OpenedState, prefijo sin acción, valor vacío/true/false', () => {
    for (const [n, v] of [['formDG:panelConfirmCTOpenedState', ''], ['formDG:panelConfirmCTOpenedState', 'false'], ['formDG:modalLocalidadOpenedState', 'false'], ['formDG:modalLocalidadOpenedState', 'true']]) {
      expect(esEstadoModalJsf(n, v), `${n}=${v}`).toBe(true)
    }
    for (const [n, v] of [
      // Revisión adversarial 0.3.22: un modal de CONFIRMACIÓN ABIERTO ('true') = el POST puede ser su confirmación → sigue bloqueando.
      ['formDG:panelConfirmCTOpenedState', 'true'],
      ['formDG:panelConfirmCTOpenedState', 'TRUE'], ['formDG:panelConfirmCTOpenedState', 'emitir'], ['formDG:panelConfirmCTOpenedState', '1'],
      ['formEmitir:panelOpenedState', 'true'], ['btnConfirmar:panelOpenedState', ''], ['formDG:panelConfirmCT', ''], ['formDG:panelConfirmCTOpenedStateX', ''],
      ['formDG:OpenedState', ''], ['panelConfirmCTOpenedState', ''], [':panelConfirmCTOpenedState', ''], ['formDG:panelConfirmEmitirOpenedState', 'true'], ['formDG:modalLocalidadFirmaOpenedState', 'false'], ['formDG:panelPagoOpenedState', ''], ['formDG:panel ConfirmOpenedState', ''], ['formDG:panelconfirmctopenedstate', ''],
    ]) expect(esEstadoModalJsf(n, v), `${n}=${v}`).toBe(false)
  })

  const REAL = 'formDG=formDG&formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AlocalidadFirma=SEVILLA&formDG%3ApanelConfirmCTOpenedState=&formDG%3AbtnSiguiente=formDG%3AbtnSiguiente&javax.faces.ViewState=j_id3'
  it('real (dbf8ef0e): cuerpo de datosGenerales con panelConfirmCTOpenedState vacío → no casa', () => {
    expect(detalleCuerpoToleradoConAccionReal(REAL)).toBeNull()
    expect(cuerpoToleradoConAccionReal(REAL.replace('OpenedState=', 'OpenedState=false'))).toBe(false)
    // Modal de confirmación ABIERTO: el envío puede ser la confirmación → bloquea.
    expect(cuerpoToleradoConAccionReal(REAL.replace('OpenedState=', 'OpenedState=true'))).toBe(true)
  })
  it('OpenedState con valor de acción, prefijo de acción o el botón pulsado → sigue bloqueando', () => {
    for (const c of [
      'formDG%3ApanelConfirmCTOpenedState=confirmar',
      'btnFirmar%3ApanelOpenedState=true',
      `${REAL}&javax.faces.source=formDG%3AbtnConfirmar`,
      `${REAL}&formDG%3AbtnFirmar=formDG%3AbtnFirmar`,
    ]) expect(cuerpoToleradoConAccionReal(c), c).toBe(true)
  })

  it('el detalle lista TODOS los nombres que casan (sin repetir), nunca valores', () => {
    const c = 'formDG%3AbtnConfirmarX=VALOR_SECRETO_1&formDG%3AbtnFirmar=VALOR_SECRETO_2&formDG%3AbtnFirmar=otra&javax.faces.source=formDG%3AbtnEmitir&formDG%3AnifTomador=12345678Z'
    const d = detalleCuerpoToleradoConAccionReal(c)!
    expect(d.parametro).toBe('formDG:btnConfirmarX')
    // 0.3.23: cada hallazgo lleva la CLASE de su valor (nunca el valor); dos valores de clase distinta del mismo nombre, dos entradas.
    expect(d.parametros).toEqual([
      { parametro: 'formDG:btnConfirmarX', patron: 'confirm', valor: 'otro' },
      { parametro: 'formDG:btnFirmar', patron: 'firm', valor: 'otro' },
      { parametro: 'javax.faces.source', patron: 'emit', valor: 'otro' },
    ])
    const t = textoDetalleCuerpo(d)
    expect(t).toBe('parámetros (3): «formDG:btnConfirmarX» [valor: otro] casa con «confirm», «formDG:btnFirmar» [valor: otro] casa con «firm», «javax.faces.source» [valor: otro] casa con «emit»')
    expect(t).not.toMatch(/SECRETO|12345678Z|btnEmitir/)
  })
  it('uno solo: el formato de siempre (0.3.23: con la clase del valor); muchos: recortado con «+N más» solo con un tope explícito', () => {
    expect(textoDetalleCuerpo(detalleCuerpoToleradoConAccionReal('javax.faces.partial.render=formDG%3ApanelConfirmar')!)).toBe('parámetro «javax.faces.partial.render» [valor: otro] casa con «confirm»')
    const muchos = Array.from({ length: 12 }, (_, k) => `formDG%3AbtnConfirmarNumero${k}=x`).join('&')
    const t = textoDetalleCuerpo(detalleCuerpoToleradoConAccionReal(muchos)!, 150)
    expect(t.length).toBeLessThanOrEqual(170)
    expect(t).toMatch(/^parámetros \(12\): «formDG:btnConfirmarNumero0» \[valor: otro\] casa con «confirm»/)
    expect(t).toMatch(/\(\+\d+ más\)$/)
  })
})

// ─── 3) Fidelidade Vivienda: lista CERRADA de pantallas de la simulación (530656a4…) ────────────────────────────────────────────────
describe('0.3.22 · Fidelidade: la regla sin texto vale en Simualtion.aspx y ClientData.aspx, y solo ahí', () => {
  const FI = 'fidelidade:particulares:vivienda'
  const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wt22$block$wtForm$FID_B2B_SIM_Pat_wtNextButton$block$wtNextButton2'
  const ID = NAME.replace(/\$/g, '_')
  const BOTON = { tag: 'input', type: 'submit', id: ID, name: NAME, clase: 'Button First Is_Default', onclick: `OsAjax(arguments[0] || window.event,'${ID}','${NAME}','','__OSVSTATE,',''); return false;` }
  const invFi = (url: string) => sanearInventarioDom({ marcos: [{ url, nombre: 'm', titulos: [{ texto: 'Datos Cliente', tag: 'h2' }], elementos: [BOTON] }] }, undefined, { refs: true })!
  const motivo = (url: string) => { const i = invFi(url); return motivoNoAvanceSinTexto(FI, i.marcos[0].elementos[0], i.marcos[0]) }

  it('la lista de la regla es EXACTAMENTE esas dos rutas', () => {
    expect(ENTRADAS_EXPLORACION[FI].avancesSinTexto!.map((a) => [...a.rutas])).toEqual([['/OPI_ES_Vivienda/Simualtion.aspx', '/OPI_ES_Vivienda/ClientData.aspx']])
  })
  it('real (530656a4): «Datos Cliente» en ClientData.aspx → autorizado; Simualtion.aspx sigue', () => {
    expect(motivo('https://mediadores.fidelidade.es/OPI_ES_Vivienda/ClientData.aspx')).toBeNull()
    expect(motivo('https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx')).toBeNull()
  })
  it('BRAZO otra pantalla, ruta que solo CONTIENE una de la lista, mayúsculas distintas → ruta_distinta', () => {
    for (const p of ['/OPI_ES_Vivienda/Emision.aspx', '/OPI_ES_Vivienda/Contratacion.aspx', '/OPI_ES_Vivienda/Payment.aspx', '/OPI_ES_Vivienda/ClientData.aspx/Emitir', '/X/OPI_ES_Vivienda/ClientData.aspx', '/OPI_ES_Vivienda/clientdata.aspx', '/OPI_ES_Vivienda/ClientData2.aspx']) {
      expect(motivo(`https://mediadores.fidelidade.es${p}`), p).toBe('ruta_distinta')
    }
  })
  it('BRAZO otro origen con la ruta de la lista → origen_distinto', () => {
    expect(motivo('https://otro.fidelidade.es/OPI_ES_Vivienda/ClientData.aspx')).toBe('origen_distinto')
  })
})
