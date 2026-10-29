// Explorador 0.3.21 (29/10/2026) · fixtures SINTÉTICAS (sin PII; NIF ficticio 12345678Z si hiciera falta):
// 1) Fidelidade «Simulación» (b8e871fe…): [rellenar, marcar, avanzar DESHABILITADO] → se ejecuta lo anterior y se OMITE el avanzar.
// 2) Allianz VMP (3c888bba…): 56 marcas y el inventario cortaba en 40 («XIAOMI» fuera): tope 200 con fondo común y pistas no personales.
// 3) Mapfre NSE (e6b08ea8…): `formDG:localidadFirma` en el cuerpo del POST a la ruta tolerada es un DATO (lugar), no «firmar».
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  avanceDeshabilitadoAlFinal,
  catalogoDe,
  cuerpoToleradoConAccionReal,
  detalleCuerpoToleradoConAccionReal,
  esCampoDatoDeFirma,
  esCampoFechaDeAccion,
  indiceRefs,
  MAX_BYTES_INVENTARIO_DOM,
  MAX_OPCIONES_EXTRA_INVENTARIO,
  MAX_OPCIONES_GARANTIZADAS_SELECT,
  MAX_OPCIONES_INVENTARIO,
  opcionCasaConPista,
  pistasOpcionesInventario,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type InventarioDom,
} from './index.ts'

// ─── 1) Fidelidade: avanzar deshabilitado al final del lote ─────────────────────────────────────────────────────────────────────────
const FI = 'fidelidade:particulares:vivienda'
const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const NAME = 'OPI_Theme_wt25$block$wtMainContent$FID_B2B_SIM_Pat_wt22$block$wtForm$FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton2'
function invFi(desh = true, otroMarco = false): InventarioDom {
  const boton = { tag: 'input', type: 'submit', id: NAME.replace(/\$/g, '_'), name: NAME, clase: 'Button First Is_Default', ...(desh ? { deshabilitado: true } : {}) }
  const campos = [
    { tag: 'input', type: 'text', id: 'nom', name: 'OPI_Theme_wt25$block$wtMainContent$Nom', etiqueta: 'Nombre y apellidos/Razón Social', conValor: false },
    { tag: 'input', type: 'radio', id: 'reg1', name: 'OPI_Theme_wt25$block$wtMainContent$Regimen', etiqueta: 'Propietario', conValor: false },
    { tag: 'input', type: 'text', id: 'emitir', name: 'emitir', etiqueta: 'Emitir', conValor: false },
  ]
  const marcos = otroMarco
    ? [{ url: URL_FI, nombre: 'a', titulos: [{ texto: 'Simulación', tag: 'h2' }], elementos: campos }, { url: URL_FI, nombre: 'b', elementos: [boton] }]
    : [{ url: URL_FI, nombre: 'a', titulos: [{ texto: 'Simulación', tag: 'h2' }], elementos: [...campos, boton] }]
  return sanearInventarioDom({ marcos }, undefined, { refs: true })!
}
const validarFi = (i: InventarioDom, acciones: unknown[]) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'Simulación', tipo: 'formulario' }, acciones, mapeo: [], motivo: null }, { inventario: i, ramo: 'hogar', entrada: FI, datosReales: null, presupuestoEnCurso: false })
const AV = (ref: string) => ({ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' })

describe('0.3.21 · Fidelidade: avanzar DESHABILITADO al final de un lote de rellenar/marcar', () => {
  const i = invFi()
  const [nom, reg, , boton] = i.marcos[0].elementos.map((e) => e.ref!)
  it('real (b8e871fe): [rellenar nombre, marcar régimen, avanzar deshabilitado] → se ejecutan las dos primeras, el avanzar se omite', () => {
    const v = validarFi(i, [{ accion: 'rellenar', ref: nom, dato: 'tomador.nombre_completo' }, { accion: 'marcar', ref: reg }, AV(boton)])
    expect(v.ok, JSON.stringify(v)).toBe(true)
    expect(v.ok && v.respuesta.acciones).toEqual([{ accion: 'rellenar', ref: nom, dato: 'tomador.nombre_completo' }, { accion: 'marcar', ref: reg }])
  })
  it('nunca se vuelve pulsable: avanzar deshabilitado SOLO, o no el último, o tras un avanzar → rechazo', () => {
    expect(validarFi(i, [AV(boton)]).ok).toBe(false)
    expect(validarFi(i, [AV(boton), { accion: 'marcar', ref: reg }]).ok).toBe(false)
    const v = validarFi(i, [{ accion: 'marcar', ref: reg }, AV(boton), AV(boton)])
    expect(v.ok).toBe(false)
  })
  it('solo si lo de delante es rellenar/marcar/elegir válido: una acción previa inválida tira el lote igual', () => {
    expect(validarFi(i, [{ accion: 'rellenar', ref: nom, dato: 'no.existe' }, AV(boton)]).ok).toBe(false)
    expect(validarFi(i, [{ accion: 'rellenar', ref: 'm0e99', dato: 'tomador.nombre_completo' }, AV(boton)]).ok).toBe(false)
    expect(validarFi(i, [{ accion: 'terminar', refsPrecio: [] }, AV(boton)]).ok).toBe(false)
  })
  it('el control en OTRO marco que lo de delante → no se omite (rechazo de siempre)', () => {
    const j = invFi(true, true)
    const v = validarFi(j, [{ accion: 'marcar', ref: j.marcos[0].elementos[1].ref }, AV(j.marcos[1].elementos[0].ref!)])
    expect(v.ok).toBe(false)
    expect(!v.ok && v.errores.join(' ')).toMatch(/deshabilitado/)
  })
  it('pura: habilitado → false (el avanzar se valida y ejecuta como siempre); ref inexistente → false', () => {
    const h = invFi(false)
    expect(avanceDeshabilitadoAlFinal([{ accion: 'marcar', ref: reg }, AV(boton)], indiceRefs(h))).toBe(false)
    expect(avanceDeshabilitadoAlFinal([{ accion: 'marcar', ref: reg }, AV('m0e99')], indiceRefs(i))).toBe(false)
    expect(avanceDeshabilitadoAlFinal([{ accion: 'marcar', ref: reg }, AV(boton)], indiceRefs(i))).toBe(true)
    expect(avanceDeshabilitadoAlFinal([{ accion: 'avanzar', ref: reg }, AV(boton)], indiceRefs(i))).toBe(false)
    expect(avanceDeshabilitadoAlFinal([{ accion: 'parar', motivo: 'ambiguo' }, AV(boton)], indiceRefs(i))).toBe(false)
  })
})

// ─── 2) Allianz VMP: opciones del select ───────────────────────────────────────────────────────────────────────────────────────────
const URL_VMP = 'https://www.e-pacallianz.com/drvp00/main/control.do'
const MARCAS = ['Seleccione', ...Array.from({ length: 48 }, (_, k) => `MARCA ${String(k).padStart(2, '0')}`), 'RED BULL RACING', 'SEGWAY', 'SMARTGYRO', 'TAURUS', 'URBANGLIDE', 'XIAOMI', 'ZWHEEL']
const opcionesDe = (textos: string[]) => textos.map((t, k) => ({ valor: k === 0 ? '' : String(100 + k), texto: t }))
const selectVmp = (id: string, textos: string[]) => ({ tag: 'select', id, name: id, etiqueta: 'Marca', opciones: opcionesDe(textos), opcionesTotal: textos.length, conValor: false, selectpicker: true })
const crudoVmp = (sels: unknown[]) => ({ marcos: [{ url: URL_VMP, nombre: 'm', titulos: [{ texto: 'Datos del Vehículo', tag: 'h3' }], elementos: sels }] })

describe('0.3.21 · Allianz VMP: tope de opciones y pistas no personales', () => {
  it('real (3c888bba): 56 marcas → salen todas y «XIAOMI» se puede elegir', () => {
    const i = sanearInventarioDom(crudoVmp([selectVmp('VMPBean$marca', MARCAS)]), undefined, { refs: true })!
    const sel = i.marcos[0].elementos[0]
    expect(sel.opciones).toHaveLength(MARCAS.length)
    const x = sel.opciones!.find((o) => o.texto === 'XIAOMI')!
    const v = validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'elegir', ref: sel.ref, opcion: { valor: x.valor } }], mapeo: [], motivo: null },
      { inventario: i, ramo: 'patinete', entrada: 'allianz:autos:movilidad_personal', datosReales: null, presupuestoEnCurso: false })
    expect(v.ok, JSON.stringify(v)).toBe(true)
  })
  it('más de 200 → 200 por select; la que casa con la pista se rescata (en lugar de la última), con pista vacía no', () => {
    const muchas = ['Seleccione', ...Array.from({ length: 299 }, (_, k) => `MARCA ${String(k).padStart(3, '0')}`), 'XIAOMI']
    const sin = sanearInventarioDom(crudoVmp([selectVmp('s', muchas)]), undefined, { refs: true })!.marcos[0].elementos[0]
    expect(sin.opciones).toHaveLength(MAX_OPCIONES_INVENTARIO)
    expect(sin.opciones!.some((o) => o.texto === 'XIAOMI')).toBe(false)
    expect(sin.opcionesTotal).toBe(muchas.length)
    const con = sanearInventarioDom(crudoVmp([selectVmp('s', muchas)]), undefined, { refs: true, pistasOpciones: pistasOpcionesInventario('patinete') })!
    const s2 = con.marcos[0].elementos[0]
    expect(s2.opciones).toHaveLength(MAX_OPCIONES_INVENTARIO)
    expect(s2.opciones!.at(-1)).toEqual({ valor: String(100 + muchas.length - 1), texto: 'XIAOMI' })
    // Idempotente: la segunda pasada (asegura, sin pistas) conserva lo mismo.
    expect(sanearInventarioDom(con, undefined, { refs: true })!.marcos[0].elementos[0].opciones).toEqual(s2.opciones)
  })
  it('fondo común: muchos selects grandes no pasan de 40 + 300 extra en total ni echan elementos por bytes', () => {
    const grandes = Array.from({ length: 10 }, (_, k) => selectVmp(`s${k}`, ['Seleccione', ...Array.from({ length: 199 }, (_, j) => `OPCION LARGA DE CATALOGO ${k}-${j}`)]))
    const i = sanearInventarioDom(crudoVmp([...grandes, { tag: 'button', id: 'btnSiguiente', texto: 'Siguiente' }]), undefined, { refs: true })!
    const tot = i.marcos[0].elementos.reduce((n, e) => n + (e.opciones?.length ?? 0), 0)
    expect(tot).toBe(10 * MAX_OPCIONES_GARANTIZADAS_SELECT + MAX_OPCIONES_EXTRA_INVENTARIO)
    expect(i.recortado).toBeNull()
    expect(i.marcos[0].elementos.at(-1)!.id).toBe('btnSiguiente')
    expect(new TextEncoder().encode(JSON.stringify(i)).length).toBeLessThan(MAX_BYTES_INVENTARIO_DOM)
  })
  it('pistas: solo sintéticos NO personales (nunca nombre, NIF, fecha de nacimiento, matrícula)', () => {
    const p = pistasOpcionesInventario('patinete')
    expect(p).toEqual(expect.arrayContaining(['Xiaomi', 'Electric Scooter 4 Pro', 'Sevilla', '41001']))
    const personales = catalogoDe('patinete').filter((d) => d.personal).map((d) => d.sintetico).filter((x): x is string => typeof x === 'string')
    expect(personales.length).toBeGreaterThan(0)
    for (const x of personales) expect(p).not.toContain(x)
    expect(pistasOpcionesInventario('ramo-inexistente')).toEqual([])
  })
  it('opcionCasaConPista: por palabras completas, ≥3 car.', () => {
    expect(opcionCasaConPista('XIAOMI', ['Xiaomi'])).toBe(true)
    expect(opcionCasaConPista('ELECTRIC SCOOTER 4 PRO', ['Electric Scooter 4 Pro'])).toBe(true)
    expect(opcionCasaConPista('Xiaomi Mi', ['Xiaomi'])).toBe(true)
    expect(opcionCasaConPista('XIAOMIX', ['Xiaomi'])).toBe(false)
    expect(opcionCasaConPista('No', ['No'])).toBe(false)
    expect(opcionCasaConPista(null, ['Xiaomi'])).toBe(false)
  })
})

// ─── 3) Mapfre NSE: datos sobre la firma en el cuerpo del POST ─────────────────────────────────────────────────────────────────────
describe('0.3.21 · Mapfre NSE: localidad/hora/lugar de firma (lista cerrada) en el cuerpo tolerado', () => {
  const real = 'formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AfechaFirmaInputCurrentDate=10%2F2026&formDG%3AlocalidadFirma=SEVILLA&formDG%3AbtnSiguiente=formDG%3AbtnSiguiente&javax.faces.ViewState=j_id3'
  it('el cuerpo real (localidadFirma con un lugar o vacío) ya no casa', () => {
    expect(detalleCuerpoToleradoConAccionReal(real)).toBeNull()
    for (const c of ['formDG%3AlocalidadFirma=', 'formDG%3AlocalidadFirma=San+Juan+de+Aznalfarache', 'formDG%3AlocalidadFirma=C%C3%A1diz', 'formDG%3AhoraFirma=10%3A30',
      'formDG%3AprovinciaFirmaCombo=41', 'formDG%3AlugarFirma_input=Sevilla', 'formDG%3ApaisFirma_hinput=ESPA%C3%91A', 'formDG%3AmunicipioFirmaInput=Dos+Hermanas', 'formDG%3ApoblacionFirma=']) {
      expect(cuerpoToleradoConAccionReal(c), c).toBe(false)
    }
  })
  it('nombres fuera de la lista cerrada, valores de acción o con datos → siguen bloqueando', () => {
    for (const c of [
      'formDG%3AbtnCargaLocalidadFirmaSuscriptor=formDG%3AbtnCargaLocalidadFirmaSuscriptor', 'formDG%3AbtnAbrirModalLocalidadFirma=1', 'formDG%3AlocalidadFirmar=Sevilla',
      'formDG%3AlocalidadFirmaX=Sevilla', 'formDG%3AfirmaLocalidad=Sevilla', 'formEmitir%3AlocalidadFirma=Sevilla', 'btnFirmar%3AlocalidadFirma=',
      'formDG%3AlocalidadFirma=Firmar', 'formDG%3AlocalidadFirma=Sevilla+y+emitir', 'formDG%3AlocalidadFirma=Contratar', 'formDG%3AlocalidadFirma=Aceptar',
      'formDG%3AlocalidadFirma=Pagar', 'formDG%3AlocalidadFirma=Formalizar', 'formDG%3AlocalidadFirma=Grabar', 'formDG%3AlocalidadFirma=Confirmar',
      'formDG%3AlocalidadFirma=ES9121000418450200051332', 'formDG%3AlocalidadFirma=4111+1111+1111+1111', 'formDG%3AlocalidadFirma=12345678Z',
      'formDG%3AlocalidadFirma=Sevilla%3Bx', 'formDG%3AlocalidadFirma=Sevilla%3Ax', 'formDG%3AlocalidadFirma=alert(1)', `formDG%3AlocalidadFirma=${'a'.repeat(61)}`,
      'formDG%3AhoraFirma=Firmar', 'formDG%3AhoraFirma=10%3A30+pagar', 'formDG%3AlocalidadFirma=tarjeta',
      'formDG%3AlocalidadFirma=Sevilla&javax.faces.source=formDG%3AbtnFirmar',
    ]) {
      expect(cuerpoToleradoConAccionReal(c), c).toBe(true)
    }
  })
  it('pura: el alias explícito es el mismo predicado; sin mayúsculas en el segmento', () => {
    expect(esCampoDatoDeFirma).toBe(esCampoFechaDeAccion)
    expect(esCampoDatoDeFirma('formDG:LocalidadFirma', 'Sevilla')).toBe(true)
    expect(esCampoDatoDeFirma('formDG:localidadFirma', 'Sevilla')).toBe(true)
    expect(esCampoDatoDeFirma('form DG:localidadFirma', '')).toBe(false)
  })
})
