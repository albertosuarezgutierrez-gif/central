// Explorador 0.3.19 (29/10/2026) · fixtures SINTÉTICAS (sin PII; NIF ficticio 12345678Z si hiciera falta):
// 1) Fidelidade Vivienda `Simualtion.aspx`: el input submit sin rótulo SÍ lleva onclick OutSystems `OsAjax(…); return false;` (rechazo real
//    `sin_descripcion_completa (con_onclick)`). Regla `onclickForma`: patrón cerrado + A/B coherentes con el name del control.
// 2) Mapfre NSE `busquedaProductos`: el «Siguiente >>» de `formDG` lleva en su oncomplete `mostrarModalPanelConfirmarLimpiezaPolizaPorDias(…)`
//    («conFIRMAr» → `boton_de_emision`). Excepción estrecha: SOLO esa subcadena, SOLO en ese control exacto.
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  avanceSinTextoAutorizado,
  bloqueoAvance,
  ENTRADAS_EXPLORACION,
  MARCA_TIRA_CIFRAS_ONCLICK,
  motivoNoAvanceSinTexto,
  neutralizacionesOnclickDe,
  onclickCasaFormaSinTexto,
  onclickNeutralizado,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type AvanceSinTexto,
  type ElementoInventario,
  type InventarioDom,
} from './index.ts'

function inv(url: string, elementos: unknown[], titulos: unknown[] = [{ texto: 'Simulación', tag: 'h2' }]): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url, nombre: 'm', titulos, elementos }] }, undefined, { refs: true })!
}
const el0 = (i: InventarioDom) => i.marcos[0].elementos[0]
function avanzar(i: InventarioDom, entrada: string, ramo: string) {
  return validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref: el0(i).ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo, entrada, datosReales: null, presupuestoEnCurso: false },
  )
}

// ─── 1) Fidelidade: input submit sin rótulo con onclick OsAjax ───────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const URL_SIM = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wtNextButton$block$wtNextButton2'
const ID = NAME.replace(/\$/g, '_')
const osajax = (a: string, b: string) => `OsAjax(arguments[0] || window.event,'${a}','${b}','','__OSVSTATE,',''); return false;`
const ONCLICK = osajax(ID, NAME)
const BOTON = { tag: 'input', type: 'submit', id: ID, name: NAME, clase: 'Button First Is_Default', onclick: ONCLICK }
const REGLA = ENTRADAS_EXPLORACION[FI].avancesSinTexto![0] as AvanceSinTexto
const okFi = (i: InventarioDom) => avanceSinTextoAutorizado(FI, el0(i), i.marcos[0]) !== null

describe('0.3.19 · Fidelidade: input submit sin rótulo con onclick OsAjax de forma cerrada', () => {
  it('el caso real: onclick OsAjax con A = B con «_», B = name → autorizado, sin bloqueo, el validador deja avanzar', () => {
    const i = inv(URL_SIM, [BOTON, { tag: 'input', type: 'text', name: 'OPI_Theme_wt25$block$wtMainContent$CP', etiqueta: 'Código postal' }])
    expect(el0(i).onclick).toBe(ONCLICK)
    expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0])).toBeNull()
    expect(bloqueoAvance(FI, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i, FI, 'hogar').ok).toBe(true)
  })
  it('espacios de más (o saltos de línea) en el onclick se colapsan; nada más se tolera', () => {
    const i = inv(URL_SIM, [{ ...BOTON, onclick: `  OsAjax(arguments[0]  ||\n window.event,'${ID}','${NAME}','','__OSVSTATE,','');   return false;  ` }])
    expect(okFi(i)).toBe(true)
  })
  it('name recortado por el saneado: B tiene que EMPEZAR por lo que llegó (el worker exige el name entero === B)', () => {
    const largo = `${NAME}${'X'.repeat(90)}`
    const i = inv(URL_SIM, [{ ...BOTON, name: largo, id: undefined, onclick: osajax(largo.replace(/\$/g, '_'), largo) }])
    expect(el0(i).name!.endsWith('…')).toBe(true)
    expect(okFi(i)).toBe(true)
    // B que no empieza por el name recortado → no.
    const j = inv(URL_SIM, [{ ...BOTON, name: largo, id: undefined, onclick: osajax('OPI_Theme_wt25_block_wtMainContent_FID_Otro', 'OPI_Theme_wt25$block$wtMainContent$FID_Otro') }])
    expect(okFi(j)).toBe(false)
    expect(motivoNoAvanceSinTexto(FI, el0(j), j.marcos[0])).toBe('onclick_fuera_de_forma')
  })

  const brazos: [string, string][] = [
    ['A no es B con «_»', osajax('OPI_Theme_wt25_block_wtMainContent_FID_Otro', NAME)],
    ['B no es el name del control', osajax('OPI_Theme_wt25_block_wtMainContent_FID_Otro', 'OPI_Theme_wt25$block$wtMainContent$FID_Otro')],
    ['llamada extra detrás', `${ONCLICK} emitir();`],
    ['llamada extra delante', `emitir(); ${ONCLICK}`],
    ['submit en medio', `OsAjax(arguments[0] || window.event,'${ID}','${NAME}','','__OSVSTATE,',''); document.forms[0].submit(); return false;`],
    ['URL en el tercer argumento', `OsAjax(arguments[0] || window.event,'${ID}','${NAME}','https://otro.test/x','__OSVSTATE,',''); return false;`],
    ['sin return false', `OsAjax(arguments[0] || window.event,'${ID}','${NAME}','','__OSVSTATE,','');`],
    ['otra función', `OsAjaxX(arguments[0] || window.event,'${ID}','${NAME}','','__OSVSTATE,',''); return false;`],
    ['comillas dobles', `OsAjax(arguments[0] || window.event,"${ID}","${NAME}","","__OSVSTATE,",""); return false;`],
    ['postback ASP.NET', 'WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions("x", "", true))'],
    ['return false suelto', 'return false;'],
  ]
  for (const [nombre, onclick] of brazos) {
    it(`BRAZO ${nombre} → rechazado (onclick_fuera_de_forma)`, () => {
      const i = inv(URL_SIM, [{ ...BOTON, onclick }])
      expect(okFi(i), nombre).toBe(false)
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), nombre).toBe('onclick_fuera_de_forma')
      expect(avanzar(i, FI, 'hogar').ok, nombre).toBe(false)
    })
  }

  it('BRAZO name ENTERO en el inventario (no recortado): B tiene que ser exactamente el name, no solo empezar por él', () => {
    const corto = 'OPI_Theme_wt25$block$wtMainContent$FID_Boton1'
    const base = { ...BOTON, id: corto.replace(/\$/g, '_'), name: corto }
    expect(okFi(inv(URL_SIM, [{ ...base, onclick: osajax(corto.replace(/\$/g, '_'), corto) }]))).toBe(true)
    const i = inv(URL_SIM, [{ ...base, onclick: osajax(`${corto.replace(/\$/g, '_')}X`, `${corto}X`) }])
    expect(el0(i).name).toBe(corto)
    expect(okFi(i)).toBe(false)
    expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0])).toBe('onclick_fuera_de_forma')
  })
  it('BRAZO A/B con nombre de acción final (el widget es el de Contratar/Emitir/Pago…) → rechazado', () => {
    for (const w of ['wtBtnContratar', 'wtEmitir', 'wtConfirmar', 'wtFirmar', 'wtPago', 'wtFormalizar', 'wtIBAN']) {
      const n = `OPI_Theme_wt25$block$wtMainContent$${w}`
      const i = inv(URL_SIM, [{ ...BOTON, id: n.replace(/\$/g, '_'), name: n, onclick: osajax(n.replace(/\$/g, '_'), n) }])
      expect(okFi(i), w).toBe(false)
      expect(avanzar(i, FI, 'hogar').ok, w).toBe(false)
      // Directo: aunque el name del control fuera inocuo, una B de acción final no casa la forma.
      expect(onclickCasaFormaSinTexto(REGLA, osajax(n.replace(/\$/g, '_'), n), n, { nameExacto: true }), w).toBe(false)
    }
  })
  it('BRAZO onclick recortado («…»), con onclickCompleto aparte o con cifras normalizadas → no casa', () => {
    expect(onclickCasaFormaSinTexto(REGLA, `${ONCLICK.slice(0, 80)}…`, NAME, { nameExacto: false })).toBe(false)
    const conMarca = osajax(`${ID}${MARCA_TIRA_CIFRAS_ONCLICK}`, `${NAME}${MARCA_TIRA_CIFRAS_ONCLICK}`)
    expect(onclickCasaFormaSinTexto(REGLA, conMarca, `${NAME}${MARCA_TIRA_CIFRAS_ONCLICK}`, { nameExacto: false })).toBe(false)
    const i = inv(URL_SIM, [BOTON])
    const el = { ...el0(i), onclickCompleto: ONCLICK } as ElementoInventario
    expect(motivoNoAvanceSinTexto(FI, el, i.marcos[0])).toBe('onclick_fuera_de_forma')
  })
  it('el helper, con una forma PERMISIVA a propósito: aun así rechaza onclick recortado, cifras normalizadas y una B fuera de prefijo/contiene', () => {
    const laxa: AvanceSinTexto = { ...REGLA, onclickForma: /^F\('([^']*)','([^']*)'\).*$/ }
    const f = (a: string, b: string, cola = '') => `F('${a}','${b}')${cola}`
    expect(onclickCasaFormaSinTexto(laxa, f(ID, NAME), NAME, { nameExacto: true })).toBe(true)
    expect(onclickCasaFormaSinTexto(laxa, f(ID, NAME, ' x…'), NAME, { nameExacto: true })).toBe(false)
    expect(onclickCasaFormaSinTexto(laxa, f(ID, NAME, ` ${MARCA_TIRA_CIFRAS_ONCLICK}`), NAME, { nameExacto: true })).toBe(false)
    const fuera = 'Otro_wt$block$wtMainContent$FID_B1'
    expect(onclickCasaFormaSinTexto(laxa, f(fuera.replace(/\$/g, '_'), fuera), fuera, { nameExacto: true })).toBe(false)
    const sinContiene = 'OPI_Theme_wt25$block$wtFooter$FID_B1'
    expect(onclickCasaFormaSinTexto(laxa, f(sinContiene.replace(/\$/g, '_'), sinContiene), sinContiene, { nameExacto: true })).toBe(false)
  })
  it('worker (nameExacto): el name VIVO tiene que ser B entero; un name recortado o con algo más no vale', () => {
    expect(onclickCasaFormaSinTexto(REGLA, ONCLICK, NAME, { nameExacto: true })).toBe(true)
    expect(onclickCasaFormaSinTexto(REGLA, ONCLICK, `${NAME.slice(0, 40)}…`, { nameExacto: true })).toBe(false)
    expect(onclickCasaFormaSinTexto(REGLA, ONCLICK, `${NAME}2`, { nameExacto: true })).toBe(false)
    expect(onclickCasaFormaSinTexto(REGLA, ONCLICK, NAME.slice(0, -1), { nameExacto: true })).toBe(false)
  })
  it('BRAZO regla sin `onclickForma` (como 0.3.18): con onclick sigue siendo con_onclick', () => {
    const sinForma: AvanceSinTexto = { ...REGLA, onclickForma: undefined }
    expect(onclickCasaFormaSinTexto(sinForma, ONCLICK, NAME, { nameExacto: true })).toBe(false)
  })
  it('BRAZO dos botones de la forma en el marco → no_unico_en_marco; otras entradas siguen rechazando', () => {
    const n2 = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wtBackButton$block$wtBackButton2'
    const i = inv(URL_SIM, [BOTON, { ...BOTON, id: n2.replace(/\$/g, '_'), name: n2, onclick: osajax(n2.replace(/\$/g, '_'), n2) }])
    expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0])).toBe('no_unico_en_marco')
    // Un segundo submit de la regla con OTRO onclick (o sin onclick) también rompe la unicidad (como el `iguales` vivo del worker).
    for (const onclick of ['document.forms[0].submit()', undefined]) {
      const k = inv(URL_SIM, [BOTON, { ...BOTON, id: 'b2', name: 'OPI_Theme_wt25$block$wtMainContent$FID_B2', onclick }])
      expect(motivoNoAvanceSinTexto(FI, el0(k), k.marcos[0]), String(onclick)).toBe('no_unico_en_marco')
    }
    const j = inv(URL_SIM, [BOTON])
    for (const entrada of ['allianz:particulares:hogar', 'mapfre:automoviles:patinetes']) expect(avanceSinTextoAutorizado(entrada, el0(j), j.marcos[0]), entrada).toBeNull()
  })
  it('lo demás de 0.3.18 sigue: otra ruta, otro origen, texto de acción final o importes → rechazado aunque el onclick case', () => {
    expect(okFi(inv('https://mediadores.fidelidade.es/OPI_ES_Vivienda/Emision.aspx', [BOTON]))).toBe(false)
    expect(okFi(inv('https://otro.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx', [BOTON]))).toBe(false)
    expect(okFi(inv(URL_SIM, [BOTON, { tag: 'button', texto: 'Contratar' }]))).toBe(false)
    expect(okFi(inv(URL_SIM, [BOTON, { tag: 'input', type: 'text', name: 'x', etiqueta: 'IBAN' }]))).toBe(false)
  })
})

// ─── 2) Mapfre NSE: «Siguiente >>» con mostrarModalPanelConfirmarLimpiezaPolizaPorDias en el oncomplete ─────────────────────────────
const MF = 'mapfre:automoviles:patinetes'
const URL_BP = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf'
const SUB = 'mostrarModalPanelConfirmarLimpiezaPolizaPorDias'
const a4j = (oncomplete = `${SUB}('false','formDG:btnSiguiente')`, extra = '') =>
  `A4J.AJAX.Submit('formDG',event,{'similarityGroupingId':'formDG:btnSiguiente','parameters':{'irSiguiente':'true','formDG:btnSiguiente':'formDG:btnSiguiente','valorAgente':'1234567'${extra}},'oncomplete':function(request,event,data){${oncomplete}}});return false;`
const SIG = { tag: 'a', role: 'link', id: 'formDG:btnSiguiente', name: 'formDG:btnSiguiente', clase: 'boton red S', texto: 'Siguiente >>', onclick: a4j() }
const invN = (el: unknown, url = URL_BP) => inv(url, [el], [{ texto: 'Oferta / contratación', tag: 'h2' }])

describe('0.3.19 · Mapfre NSE: «Siguiente >>» con el modal de limpieza de póliza en el oncomplete', () => {
  it('el caso real: se neutraliza SOLO la subcadena exacta y el avance pasa (sin la regla, boton_de_emision)', () => {
    const i = invN(SIG)
    expect(el0(i).onclick).toContain(SUB)
    expect(el0(i).onclick).not.toMatch(/\d{7,}/)
    expect(bloqueoAvance(MF, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i, MF, 'patinete').ok).toBe(true)
    // Misma pantalla para una entrada sin la regla (control de que la causa era esa subcadena).
    expect(bloqueoAvance('mapfre:nueva_produccion:auto', el0(i), i.marcos[0])).toBe('boton_de_emision')
  })
  it('onclickNeutralizado devuelve el onclick sin la subcadena (y sin «confirm»); la regla solo existe en la entrada de patinete', () => {
    const r = onclickNeutralizado(neutralizacionesOnclickDe(MF), { tag: 'a', id: 'formDG:btnSiguiente', name: 'formDG:btnSiguiente', texto: 'Siguiente >>', onclick: a4j(), origen: 'https://wmediadores.mapfre.com', ruta: '/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf' })
    expect(r).not.toBeNull()
    expect(r).not.toContain(SUB)
    expect(r).not.toMatch(/confirm|firm/i)
    expect(r).toContain("('false','formDG:btnSiguiente')")
    for (const e of Object.keys(ENTRADAS_EXPLORACION).filter((x) => x !== MF)) expect(neutralizacionesOnclickDe(e), e).toEqual([])
  })

  const rechazos: [string, unknown, string?][] = [
    ['otro origen (host)', SIG, 'https://wmediadores.mapfre.com.otro.test/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf'],
    ['otro origen (http)', SIG, 'http://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf'],
    ['otro origen (puerto)', SIG, 'https://wmediadores.mapfre.com:8443/EVT21_NSE_FWEB/app/emision/busquedaProductos/busquedaProductos.jsf'],
    ['otra ruta (cargaOperacion)', SIG, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/cargaOperacion.jsf'],
    ['otra ruta (prefijo sin la barra)', SIG, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductosX/b.jsf'],
    ['otra ruta (mayúsculas)', SIG, 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/EMISION/busquedaProductos/b.jsf'],
    ['otro tag', { ...SIG, tag: 'button', role: undefined }],
    ['otro id', { ...SIG, id: 'formDG:btnSiguiente2' }],
    ['sin id', { ...SIG, id: undefined }],
    ['otro name', { ...SIG, name: 'formDG:btnSiguiente2' }],
    ['otro texto', { ...SIG, texto: 'Siguiente' }],
    ['texto con más', { ...SIG, texto: 'Siguiente >> y confirmar' }],
    ['la subcadena dos veces', { ...SIG, onclick: a4j(`${SUB}('false','formDG:btnSiguiente');${SUB}('true','x')`) }],
    ['subcadena + confirmar aparte', { ...SIG, onclick: a4j(`${SUB}('false','formDG:btnSiguiente');confirmarPoliza()`) }],
    ['subcadena + emitir aparte', { ...SIG, onclick: a4j(`${SUB}('false','formDG:btnSiguiente');emitirPoliza()`) }],
    ['subcadena + firmar en los parámetros', { ...SIG, onclick: a4j(undefined, ",'accion':'firmar'") }],
    ['identificador más largo (sufijo pegado)', { ...SIG, onclick: a4j(`${SUB}YConfirmar('false')`) }],
    ['identificador más largo (prefijo pegado)', { ...SIG, onclick: a4j(`x${SUB}('false')`) }],
    ['método de otro objeto', { ...SIG, onclick: a4j(`obj.${SUB}('false')`) }],
    ['sin llamada (solo el nombre)', { ...SIG, onclick: a4j(`var f=${SUB};f('false')`) }],
  ]
  for (const [nombre, el, url] of rechazos) {
    it(`BRAZO ${nombre} → boton_de_emision`, () => {
      const i = invN(el, url)
      expect(bloqueoAvance(MF, el0(i), i.marcos[0]), nombre).toBe('boton_de_emision')
      expect(avanzar(i, MF, 'patinete').ok, nombre).toBe(false)
    })
  }
  it('el RESTO del onclick con emisión/acción prohibida → no se neutraliza (null), aunque todo lo demás case', () => {
    const c = { tag: 'a', id: 'formDG:btnSiguiente', name: 'formDG:btnSiguiente', texto: 'Siguiente >>', origen: 'https://wmediadores.mapfre.com', ruta: '/EVT21_NSE_FWEB/app/emision/busquedaProductos/b.jsf' }
    for (const extra of ['emitirPoliza()', 'confirmarPoliza()', 'enviarSolicitud()', "x('Aceptar')"]) {
      expect(onclickNeutralizado(neutralizacionesOnclickDe(MF), { ...c, onclick: a4j(`${SUB}('false');${extra}`) }), extra).toBeNull()
    }
    expect(onclickNeutralizado(neutralizacionesOnclickDe(MF), { ...c, onclick: a4j(`${SUB}('false');${SUB}('true')`) })).toBeNull()
  })
  it('BRAZO onclick recortado → onclick_truncado (no se neutraliza lo que no se ve entero)', () => {
    const r = onclickNeutralizado(neutralizacionesOnclickDe(MF), { tag: 'a', id: 'formDG:btnSiguiente', name: 'formDG:btnSiguiente', texto: 'Siguiente >>', onclick: `${a4j().slice(0, 300)}…`, origen: 'https://wmediadores.mapfre.com', ruta: '/EVT21_NSE_FWEB/app/emision/busquedaProductos/b.jsf' })
    expect(r).toBeNull()
  })
  it('BRAZO ruta con «..» o «//» → no se neutraliza', () => {
    for (const ruta of ['/EVT21_NSE_FWEB/app/emision/busquedaProductos/../emitir.jsf', '/EVT21_NSE_FWEB/app/emision/busquedaProductos//b.jsf']) {
      expect(onclickNeutralizado(neutralizacionesOnclickDe(MF), { tag: 'a', id: 'formDG:btnSiguiente', name: 'formDG:btnSiguiente', texto: 'Siguiente >>', onclick: a4j(), origen: 'https://wmediadores.mapfre.com', ruta }), ruta).toBeNull()
    }
  })
  it('el modal que abre después NO queda autorizado: su «Confirmar»/«Aceptar» (o cualquier otro control con la subcadena) sigue bloqueado', () => {
    const modal: [string, unknown][] = [
      ['Confirmar del modal', { tag: 'input', type: 'button', id: 'formModal:btnConfirmar', name: 'formModal:btnConfirmar', texto: 'Confirmar', onclick: "limpiarPoliza('true')" }],
      ['Aceptar del modal', { tag: 'input', type: 'button', id: 'formModal:btnAceptar', name: 'formModal:btnAceptar', texto: 'Aceptar', onclick: "limpiarPoliza('true')" }],
      ['otro control con la subcadena', { tag: 'a', role: 'link', id: 'formDG:btnOtro', name: 'formDG:btnOtro', texto: 'Siguiente >>', onclick: a4j() }],
    ]
    for (const [nombre, el] of modal) {
      const i = invN(el)
      expect(bloqueoAvance(MF, el0(i), i.marcos[0]), nombre).not.toBeNull()
      expect(avanzar(i, MF, 'patinete').ok, nombre).toBe(false)
    }
  })
})
