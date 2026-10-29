// Explorador 0.3.18 (29/10/2026) · fixtures SINTÉTICAS (sin PII):
// Fidelidade Vivienda, `OPI_ES_Vivienda/Simualtion.aspx`: el botón de avance de «Simulación» es un `<input type=submit>` de OutSystems SIN
// texto/value/aria-label (el rótulo va por CSS). Excepción ESTRECHA a `sin_descripcion_completa`; cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  avancePorIdAutorizado,
  avanceSinTextoAutorizado,
  MARCA_TIRA_CIFRAS_ONCLICK,
  ONCLICK_REDACTADO,
  onclickEnviaFormulario,
  bloqueoAvance,
  esAvanceAutorizado,
  motivoNoAvanceSinTexto,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type InventarioDom,
} from './index.ts'
import { motivoNoAvancePorId } from './explorador.ts'

const FI = 'fidelidade:particulares:vivienda'
const URL_SIM = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_Boton1'
const BOTON = { tag: 'input', type: 'submit', id: 'OPI_Theme_wt25_block_wtMainContent_FID_Boton1', name: NAME, clase: 'Button First Is_Default' }
const TITULOS = [{ texto: 'Simulación', tag: 'h2' }, { texto: 'Datos de la vivienda', tag: 'h3' }]

function inv(url: string, elementos: unknown[], titulos: unknown[] = TITULOS, importes?: unknown[]): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url, nombre: 'm', titulos, ...(importes ? { importes } : {}), elementos }] }, undefined, { refs: true })!
}
function avanzar(i: InventarioDom, entrada = FI, extra: { precioVisto?: boolean } = {}) {
  return validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref: i.marcos[0].elementos[0].ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo: 'hogar', entrada, datosReales: null, presupuestoEnCurso: false, ...extra },
  )
}
const el0 = (i: InventarioDom) => i.marcos[0].elementos[0]
const ok = (i: InventarioDom) => avanceSinTextoAutorizado(FI, el0(i), i.marcos[0]) !== null

describe('0.3.18 · Fidelidade Vivienda: input submit sin rótulo', () => {
  it('el caso real: único, sin texto ni onclick, origen y ruta exactos, name y clase de la regla → autorizado y el validador deja avanzar', () => {
    const i = inv(URL_SIM, [BOTON, { tag: 'input', type: 'text', name: 'OPI_Theme_wt25$block$wtMainContent$Campo', etiqueta: 'Código postal' }])
    expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0])).toBeNull()
    expect(esAvanceAutorizado(FI, el0(i), i.marcos[0])).toBe(true)
    expect(bloqueoAvance(FI, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i).ok).toBe(true)
  })
  it('con el name recortado por el saneado (≥80 car.) sigue valiendo: el worker repite el name ENTERO vivo', () => {
    const largo = `${NAME}${'X'.repeat(90)}`
    const i = inv(URL_SIM, [{ ...BOTON, name: largo }])
    expect(el0(i).name!.endsWith('…')).toBe(true)
    expect(ok(i)).toBe(true)
  })
  it('sin la regla, el mismo botón se rechaza como sin_descripcion_completa (el resto de entradas no cambia)', () => {
    const i = inv(URL_SIM, [BOTON])
    for (const entrada of ['allianz:particulares:hogar', 'mapfre:automoviles:patinetes', 'occident:productos:hogar']) {
      expect(avanceSinTextoAutorizado(entrada, el0(i), i.marcos[0]), entrada).toBeNull()
      expect(bloqueoAvance(entrada, el0(i), i.marcos[0]), entrada).toBe('sin_descripcion_completa')
      expect(avanzar(i, entrada).ok, entrada).toBe(false)
    }
  })

  it('BRAZO otro origen → rechazado (origen_distinto)', () => {
    for (const url of ['https://mediadores.fidelidade.es.otro.test/OPI_ES_Vivienda/Simualtion.aspx', 'http://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx', 'https://otro.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx', 'https://mediadores.fidelidade.es:8443/OPI_ES_Vivienda/Simualtion.aspx', 'https://usuario@mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx']) {
      const i = inv(url, [BOTON])
      expect(ok(i), url).toBe(false)
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), url).toBe('origen_distinto')
      expect(avanzar(i).ok, url).toBe(false)
    }
  })
  it('BRAZO otra ruta → rechazado (ruta_distinta)', () => {
    for (const url of ['https://mediadores.fidelidade.es/OPI_ES_Empresas/Simualtion.aspx', 'https://mediadores.fidelidade.es/opi_es_vivienda/Simualtion.aspx', 'https://mediadores.fidelidade.es/']) {
      const i = inv(url, [BOTON])
      expect(ok(i), url).toBe(false)
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), url).toBe('ruta_distinta')
      expect(avanzar(i).ok, url).toBe(false)
    }
  })
  it('BRAZO con texto «Emitir» (en el propio botón, en su aria-label o en cualquier texto visible de la pantalla) o con datos bancarios → rechazado', () => {
    const casos: [string, unknown[]][] = [
      ['texto del botón', [{ ...BOTON, texto: 'Emitir' }]],
      ['aria-label del botón', [{ ...BOTON, ariaLabel: 'Emitir póliza' }]],
      ['otro control', [BOTON, { tag: 'button', texto: 'Emitir' }]],
      ['etiqueta', [BOTON, { tag: 'input', type: 'checkbox', name: 'c', etiqueta: 'Acepto y quiero contratar' }]],
      ['confirmar', [BOTON, { tag: 'a', texto: 'Confirmar datos' }]],
      ['firmar', [BOTON, { tag: 'button', texto: 'Firmar' }]],
      ['pagar', [BOTON, { tag: 'button', texto: 'Pagar ahora' }]],
      ['formalizar', [BOTON, { tag: 'button', texto: 'Formalizar' }]],
      ['IBAN', [BOTON, { tag: 'input', type: 'text', name: 'x', etiqueta: 'IBAN' }]],
      ['cuenta bancaria', [BOTON, { tag: 'input', type: 'text', name: 'x', etiqueta: 'Número de cuenta bancaria' }]],
    ]
    for (const [nombre, elementos] of casos) {
      const i = inv(URL_SIM, elementos)
      expect(ok(i), nombre).toBe(false)
      expect(avanzar(i).ok, nombre).toBe(false)
    }
    // «Forma de pago» es un campo normal de una simulación: NO es acción final.
    const normal = inv(URL_SIM, [BOTON, { tag: 'select', name: 'fp', etiqueta: 'Forma de pago' }])
    expect(ok(normal)).toBe(true)
    // La palabra dentro de un título también cierra la regla.
    for (const t of ['Resumen', 'Emisión de la póliza', 'Contratación', 'Firma', 'Revisión', 'Formalización']) {
      const i = inv(URL_SIM, [BOTON], [{ texto: 'Simulación', tag: 'h2' }, { texto: t, tag: 'h3' }])
      expect(ok(i), t).toBe(false)
    }
  })
  it('BRAZO dos controles iguales en el marco → rechazado (no_unico_en_marco)', () => {
    const i = inv(URL_SIM, [BOTON, { ...BOTON, id: 'otro', name: 'OPI_Theme_wt25$block$wtMainContent$FID_Boton2' }])
    expect(ok(i)).toBe(false)
    expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0])).toBe('no_unico_en_marco')
    const r = avanzar(i)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toMatch(/sin_descripcion_completa \(no_unico_en_marco\)/)
  })
  it('BRAZO con onclick (submit u otro) → rechazado', () => {
    for (const onclick of ['WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions("x", "", true))', "document.forms[0].submit()", 'return false;']) {
      const i = inv(URL_SIM, [{ ...BOTON, onclick }])
      expect(ok(i), onclick).toBe(false)
      expect(avanzar(i).ok, onclick).toBe(false)
    }
    // Un onclick VACÍO es como no tenerlo.
    expect(ok(inv(URL_SIM, [{ ...BOTON, onclick: '  ' }]))).toBe(true)
  })
  it('BRAZO clase sin Is_Default (o sin Button) → rechazado', () => {
    for (const clase of ['Button First', 'Button', 'First Is_Default', 'Is_Default_x Button', 'Buttons Is_Defaults']) {
      const i = inv(URL_SIM, [{ ...BOTON, clase }])
      expect(ok(i), clase).toBe(false)
      expect(avanzar(i).ok, clase).toBe(false)
    }
  })
  it('BRAZO name que no empieza por OPI_Theme_wt (o sin $block$wtMainContent$) → rechazado', () => {
    for (const name of ['ctl00$Boton', 'xOPI_Theme_wt25$block$wtMainContent$FID_B', 'OPI_Theme_wt25$block$wtFooter$FID_B', 'OPI_Theme_wt25$wtMainContent$FID_B']) {
      const i = inv(URL_SIM, [{ ...BOTON, name }])
      expect(ok(i), name).toBe(false)
      expect(avanzar(i).ok, name).toBe(false)
    }
    const sinName = inv(URL_SIM, [{ ...BOTON, name: undefined }])
    expect(ok(sinName)).toBe(false)
  })
  it('BRAZO con rótulo inofensivo (texto, aria-label o etiqueta): no es esta regla (la excepción es solo para el control SIN nombre)', () => {
    for (const extra of [{ texto: 'Simular' }, { ariaLabel: 'Simular' }, { etiqueta: 'Simular' }]) {
      const i = inv(URL_SIM, [{ ...BOTON, ...extra }])
      expect(ok(i), JSON.stringify(extra)).toBe(false)
    }
  })
  it('otras diferencias: no es input submit, con importes, con precio ya visto → rechazado', () => {
    for (const el of [{ ...BOTON, type: 'button' }, { ...BOTON, tag: 'button' }, { ...BOTON, type: 'image' }]) {
      const i = inv(URL_SIM, [el])
      expect(ok(i), JSON.stringify(el)).toBe(false)
    }
    const conPrecio = inv(URL_SIM, [BOTON], TITULOS, [{ texto: '47,55 €', etiqueta: 'Prima total' }])
    expect(ok(conPrecio)).toBe(false)
    expect(motivoNoAvanceSinTexto(FI, el0(conPrecio), conPrecio.marcos[0])).toBe('marco_con_importes')
    const i = inv(URL_SIM, [BOTON])
    expect(avanzar(i, FI, { precioVisto: true }).ok).toBe(false)
    expect(JSON.stringify(avanzar(i, FI, { precioVisto: true }))).toMatch(/avance_por_id_con_precio/)
  })
})

describe('0.3.18 · revisión adversarial (29/10/2026)', () => {
  it('BRAZO otra pantalla del MISMO módulo /OPI_ES_Vivienda/ (emisión, contratación, resumen…) → rechazado (ruta_distinta): la regla es SOLO Simualtion.aspx', () => {
    for (const p of ['Emision.aspx', 'Contratacion.aspx', 'Resumen.aspx', 'Projeto.aspx', 'Simualtion2.aspx']) {
      const i = inv(`https://mediadores.fidelidade.es/OPI_ES_Vivienda/${p}`, [BOTON])
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), p).toBe('ruta_distinta')
      expect(avanzar(i).ok, p).toBe(false)
    }
  })
  it('BRAZO name o id del control con acción final (OutSystems pone el nombre del widget en el name) → rechazado (name_de_accion_final)', () => {
    for (const sufijo of ['FID_BtnEmitir', 'wtBtnContratar', 'wtConfirmar', 'wtFirmar', 'wtPagar', 'wtPago', 'wtFormalizar', 'wtEmision', 'wtIBAN', 'wtTarjeta', 'wtBtnContract', 'wtPayment']) {
      const i = inv(URL_SIM, [{ ...BOTON, name: `OPI_Theme_wt25$block$wtMainContent$${sufijo}` }])
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), sufijo).toBe('name_de_accion_final')
      expect(avanzar(i).ok, sufijo).toBe(false)
      const j = inv(URL_SIM, [{ ...BOTON, id: `OPI_Theme_wt25_block_wtMainContent_${sufijo}` }])
      expect(motivoNoAvanceSinTexto(FI, el0(j), j.marcos[0]), `id ${sufijo}`).toBe('name_de_accion_final')
    }
  })
  it('BRAZO datos bancarios con otras palabras (nº de cuenta, datos bancarios, cuenta corriente) → rechazado', () => {
    for (const etiqueta of ['Nº de cuenta', 'N.º de cuenta', 'Datos bancarios', 'Cuenta corriente']) {
      const i = inv(URL_SIM, [BOTON, { tag: 'input', type: 'text', name: 'x', etiqueta }])
      expect(motivoNoAvanceSinTexto(FI, el0(i), i.marcos[0]), etiqueta).toBe('texto_de_accion_final')
    }
  })
})

// ─── 0.3.18 · Allianz ePAC drvp00 `control.do`: «Aceptar» SIN id y CON onclick EXACTO `eventoSiguienteDialog()` ─────────────────────────
// Real 29/10/2026 («Datos del Vehículo · Selección de Municipio · Tomador y Conductor Principal»): rechazo `aceptar_no_autorizado
// (sin_id_u_onclick)`. El botón no tiene id pero SÍ onclick `eventoSiguienteDialog()`; único «Aceptar» del marco.
describe('0.3.18 · ePAC drvp00: «Aceptar» sin id con onclick exacto eventoSiguienteDialog()', () => {
  const MP = 'allianz:autos:movilidad_personal'
  const URL_CONTROL = 'https://www.e-pacallianz.com/drvp00/main/control.do'
  const TIT = [{ texto: 'Datos del Vehículo', tag: 'h2' }, { texto: 'Selección de Municipio', tag: 'h2' }, { texto: 'Tomador y Conductor Principal', tag: 'h2' }]
  const ACEPTAR = { tag: 'button', type: 'button', clase: 'btn btn-block alz-wm-btn', texto: 'Aceptar', onclick: 'eventoSiguienteDialog()' }
  const invE = (elementos: unknown[], url = URL_CONTROL, titulos: unknown[] = TIT, importes?: unknown[]) => inv(url, elementos, titulos, importes)
  const ok = (i: InventarioDom) => avancePorIdAutorizado(MP, el0(i), i.marcos[0]) !== null

  it('el caso real: sin id, onclick exacto, texto exacto, único, marco control.do → autorizado; el validador deja avanzar', () => {
    const i = invE([ACEPTAR, { tag: 'select', id: 'muni', etiqueta: 'Municipio' }])
    expect(ok(i)).toBe(true)
    expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0])).toBeNull()
    expect(bloqueoAvance(MP, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i, MP).ok).toBe(true)
  })
  it('acepta espacios alrededor (trim), y nada más', () => {
    expect(ok(invE([{ ...ACEPTAR, onclick: '  eventoSiguienteDialog()  ' }]))).toBe(true)
  })
  it('BRAZO otro onclick (variantes, añadidos, emisión) → rechazado con onclick_no_autorizado (no el engañoso sin_id_u_onclick)', () => {
    for (const onclick of ['eventoSiguienteDialog();', 'eventoSiguienteDialog(1)', 'eventoSiguiente()', 'eventoSiguienteDialog(); emitir()', 'emitirPoliza()', 'eventoSiguienteDialogo()', 'eventoSiguiente Dialog()']) {
      const i = invE([{ ...ACEPTAR, onclick }])
      expect(ok(i), onclick).toBe(false)
      expect(avanzar(i, MP).ok, onclick).toBe(false)
      if (!/emitir/i.test(onclick)) {
        expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0]), onclick).toBe('onclick_no_autorizado')
        expect(JSON.stringify(avanzar(i, MP)), onclick).toMatch(/aceptar_no_autorizado \(onclick_no_autorizado\)/)
      }
    }
  })
  it('BRAZO con id (aunque el onclick sea el exacto) → rechazado', () => {
    const i = invE([{ ...ACEPTAR, id: 'btnAceptar' }])
    expect(ok(i)).toBe(false)
    expect(avanzar(i, MP).ok).toBe(false)
  })
  it('BRAZO otro texto («Aceptar y emitir», «Confirmar», «Aceptar condiciones») → rechazado', () => {
    for (const texto of ['Aceptar y emitir', 'Confirmar', 'Aceptar condiciones', 'Continuar']) {
      const i = invE([{ ...ACEPTAR, texto }])
      expect(ok(i), texto).toBe(false)
    }
  })
  it('BRAZO no único: un segundo «Aceptar» (con o sin onclick) en el marco → rechazado (texto_no_unico_en_marco)', () => {
    for (const otro of [{ tag: 'button', type: 'button', texto: 'Aceptar' }, { ...ACEPTAR }, { tag: 'button', id: 'btnAceptar', onclick: 'eventoSiguiente()', texto: 'Aceptar' }]) {
      const i = invE([ACEPTAR, otro])
      expect(ok(i)).toBe(false)
      expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0])).toBe('texto_no_unico_en_marco')
      expect(avanzar(i, MP).ok).toBe(false)
    }
  })
  it('BRAZO otro marco (servlet u otra ruta) → rechazado (ruta_de_marco_distinta)', () => {
    for (const url of ['https://www.e-pacallianz.com/drvp00/SEAServlet', 'https://www.e-pacallianz.com/drvp00/main/emision.do']) {
      const i = invE([ACEPTAR], url)
      expect(ok(i), url).toBe(false)
      expect(motivoNoAvancePorId(MP, el0(i), i.marcos[0]), url).toBe('ruta_de_marco_distinta')
    }
  })
  it('BRAZO título de tarificación/emisión/resumen/pago o importes en el marco → rechazado', () => {
    for (const t of ['Tarificar', 'Resumen', 'Emisión', 'Forma de pago', 'Formalización']) {
      expect(ok(invE([ACEPTAR], URL_CONTROL, [...TIT, { texto: t, tag: 'h3' }])), t).toBe(false)
    }
    const conPrecio = invE([ACEPTAR], URL_CONTROL, TIT, [{ texto: '47,55 €' }])
    expect(ok(conPrecio)).toBe(false)
  })
  it('BRAZO el control envía el formulario por sí mismo (button submit) → rechazado aunque el onclick sea el exacto', () => {
    for (const type of ['submit', undefined]) {
      const i = invE([{ ...ACEPTAR, type }])
      expect(ok(i), String(type)).toBe(false)
    }
  })
  it('BRAZO otra entrada (sin la regla) → rechazado', () => {
    const i = invE([ACEPTAR])
    for (const entrada of ['allianz:particulares:hogar', 'mapfre:automoviles:patinetes', FI]) expect(avancePorIdAutorizado(entrada, el0(i), i.marcos[0]), entrada).toBeNull()
  })
  it('la regla sin onclick (0.3.17) sigue igual: el «Aceptar» sin id NI onclick se autoriza; con un onclick cualquiera, no', () => {
    const sinOnclick = invE([{ tag: 'button', type: 'button', clase: 'botonAzul', texto: 'Aceptar' }])
    expect(ok(sinOnclick)).toBe(true)
    expect(ok(invE([{ tag: 'button', type: 'button', texto: 'Aceptar', onclick: 'otraCosa()' }]))).toBe(false)
  })
})

// ─── 0.3.18 · Mapfre NSE «Oferta / contratación» (`busquedaProductos.jsf`): onclick A4J con id JSF de ≥7 cifras ───────────────────────
// Real 29/10/2026: `avanzar m1e77: onclick_truncado [tag=a name=formDG:btnSiguiente …]`. El saneado tiraba el onclick ENTERO porque una
// tira de ≥7 cifras (`j_id_jsp_1234567890_5`) parece dato personal, y lo dejaba como ONCLICK_REDACTADO (= recortado).
describe('0.3.18 · saneado del onclick: tiras de ≥7 cifras de ids JSF', () => {
  const MF = 'mapfre:automoviles:patinetes'
  const URL_NSE = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/busquedaProductos.jsf'
  const a4j = (contenedor: string, extra = '') =>
    `A4J.AJAX.Submit('formDG',event,{'similarityGroupingId':'formDG:btnSiguiente','parameters':{'formDG:btnSiguiente':'formDG:btnSiguiente'${extra}},'containerId':'${contenedor}'});return false;`
  const SIG = (onclick: string) => ({ tag: 'a', role: 'link', name: 'formDG:btnSiguiente', clase: 'boton red S', texto: 'Siguiente >>', onclick })
  const invN = (onclick: string) => inv(URL_NSE, [SIG(onclick)], [{ texto: 'Oferta / contratación', tag: 'h2' }])

  it('el caso real: A4J con j_id_jsp_<10 cifras> → onclick conservado con la tira normalizada (sin las cifras) y bloqueo null', () => {
    const i = invN(a4j('j_id_jsp_1234567890_5'))
    const oc = el0(i).onclick!
    expect(oc).not.toBe(ONCLICK_REDACTADO)
    expect(oc).not.toMatch(/\d{7,}/)
    expect(oc).toContain(`j_id_jsp_${MARCA_TIRA_CIFRAS_ONCLICK}_5`)
    expect(bloqueoAvance(MF, el0(i), i.marcos[0])).toBeNull()
    expect(avanzar(i, MF, {}).ok).toBe(true)
  })
  it('mojarra.jsfcljs con varias tiras largas → igual (normalizadas, no redactado)', () => {
    const i = invN(`mojarra.jsfcljs(document.getElementById('formDG'),{'formDG:btnSiguiente':'formDG:btnSiguiente','j_id_jsp_9876543210_12':'j_id_jsp_9876543210_12'},'');return false`)
    expect(el0(i).onclick).not.toBe(ONCLICK_REDACTADO)
    expect(el0(i).onclick).not.toMatch(/\d{7,}/)
    expect(bloqueoAvance(MF, el0(i), i.marcos[0])).toBeNull()
  })
  it('BRAZO onclick con NIF, NIE, IBAN (junto o con espacios), email o teléfono → sigue REDACTADO y bloqueado (onclick_truncado)', () => {
    for (const dato of ['12345678Z', 'X1234567L', 'ES9121000418450200051332', 'ES91 2100 0418 4502 0005 1332', 'nombre@example.com', '612 345 678', '612345678', '+34 612345678']) {
      const i = invN(a4j('j_id_jsp_1234567890_5', `,'dato':'${dato}'`))
      expect(el0(i).onclick, dato).toBe(ONCLICK_REDACTADO)
      expect(bloqueoAvance(MF, el0(i), i.marcos[0]), dato).toBe('onclick_truncado')
      expect(avanzar(i, MF, {}).ok, dato).toBe(false)
      expect(JSON.stringify(i), dato).not.toContain(dato)
    }
  })
  it('BRAZO tira de cifras con separadores (12.345.678, 1234 5678) → sigue redactada (solo se normalizan tiras CONTIGUAS de ≥7)', () => {
    for (const dato of ['12.345.678', '1234 5678 90']) {
      const i = invN(a4j('j_id_jsp_1234567890_5', `,'ref':'${dato}'`))
      expect(el0(i).onclick, dato).toBe(ONCLICK_REDACTADO)
    }
  })
  it('una tira larga suelta que no se reconoce como dato (cuenta, póliza) no se filtra: se guarda NORMALIZADA, nunca la cifra', () => {
    const i = invN(a4j('j_id_jsp_1234567890_5', ",'poliza':'98765432109876'"))
    expect(JSON.stringify(i)).not.toContain('98765432109876')
  })
  it('SOLO el onclick: un id/name/texto con tira de ≥7 cifras se sigue descartando como antes', () => {
    const i = inv(URL_NSE, [{ ...SIG(a4j('c')), id: 'formDG:j_id_jsp_1234567890_5', texto: 'Póliza 1234567890' }])
    expect(el0(i).id).toBeUndefined()
    expect(el0(i).texto).toBeUndefined()
  })
  it('BRAZO escape: la casilla cuyo jsfcljs nombra OTRO componente que solo difiere en las cifras NO pasa por propia (marcar bloqueado)', () => {
    const ID = `formDG:j_id_jsp_${MARCA_TIRA_CIFRAS_ONCLICK}_5`
    // id literal igual a la forma normalizada (no podría venir de un portal JSF, pero se prueba el peor caso):
    const radio = { tag: 'input', type: 'radio', id: ID, name: 'r', etiqueta: 'MásPatín', onclick: "mojarra.jsfcljs(document.getElementById('formDG'),{'formDG:j_id_jsp_1234567890_5':'formDG:j_id_jsp_1234567890_5'},'')" }
    const i = inv(URL_NSE, [radio])
    expect(onclickEnviaFormulario(el0(i).onclick, el0(i))).toBe(true)
    const r = validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'marcar', ref: el0(i).ref }], mapeo: [], motivo: null }, { inventario: i, ramo: 'patinete', entrada: MF, datosReales: null, presupuestoEnCurso: false })
    expect(r.ok).toBe(false)
  })
})
