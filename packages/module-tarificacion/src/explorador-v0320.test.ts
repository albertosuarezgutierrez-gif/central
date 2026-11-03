// Explorador 0.3.20 (29/10/2026) · fixtures SINTÉTICAS (sin PII; NIF ficticio 12345678Z si hiciera falta):
// 1) Fidelidade «Simulación»: el input submit «sin rótulo» lleva `value` VIVO → lista CERRADA de rótulos de avance neutros (`rotuloNeutroSinTexto`).
// 2) Mapfre NSE `datosGenerales.jsf`: `formDG:fechaFirmaInputDate` es una FECHA, no «firmar» (`esCampoFechaDeAccion`).
// 3) Allianz VMP: el <select> oculto de un bootstrap-select (marca/modelo) se elige; un lote solo de rellenar sin efecto no se ejecuta (bucle).
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import {
  cuerpoToleradoConAccionReal,
  detalleCuerpoToleradoConAccionReal,
  esAccionSinEfecto,
  esCampoFechaDeAccion,
  ROTULOS_AVANCE_NEUTROS_SIN_TEXTO,
  rotuloNeutroSinTexto,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type InventarioDom,
} from './index.ts'

// ─── 1) Rótulo vivo neutro ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('0.3.20 · rotuloNeutroSinTexto (Fidelidade, value vivo del input submit)', () => {
  it('vacío o ausente = sin rótulo (0.3.18); cada palabra de la lista cerrada, sin mayúsculas/tildes/espacios de más, sí', () => {
    for (const r of [null, undefined, '', '   ']) expect(rotuloNeutroSinTexto(r), String(r)).toBe(true)
    for (const r of ['Siguiente', 'SIGUIENTE', ' siguiente ', 'Avanzar', 'Continuar', 'Siguiente   paso', 'Calcular', 'Simular', 'SIMULAR']) expect(rotuloNeutroSinTexto(r), r).toBe(true)
    expect([...ROTULOS_AVANCE_NEUTROS_SIN_TEXTO]).toEqual(['siguiente', 'avanzar', 'continuar', 'siguiente paso', 'calcular', 'simular'])
  })
  it('cualquier otro rótulo (acción final, mezcla, signos, parecidos) → no', () => {
    for (const r of ['Emitir', 'Contratar', 'Tarificar y contratar', 'Confirmar', 'Firmar', 'Pagar', 'Formalizar', 'Siguiente y contratar', 'Simular y emitir',
      'Siguiente >>', 'Siguiente >', 'Guardar', 'Aceptar', 'Enviar', 'Calcular y contratar', 'Continuar con el pago', 'siguiente.', 'Siguientes', 'Simulación']) {
      expect(rotuloNeutroSinTexto(r), r).toBe(false)
    }
    expect(rotuloNeutroSinTexto(42 as unknown as string)).toBe(false)
  })
  it('defensa en profundidad: aun en la lista, el `textoAccionFinal` de la regla manda', () => {
    expect(rotuloNeutroSinTexto('Siguiente', /siguiente/)).toBe(false)
  })
})

// ─── 2) Mapfre NSE: fecha de firma ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('0.3.20 · esCampoFechaDeAccion / cuerpo tolerado (Mapfre NSE datosGenerales)', () => {
  const real = 'formDG%3AfechaFirmaInputDate=29%2F10%2F2026&formDG%3AfechaFirmaInputCurrentDate=10%2F2026&formDG%3AbtnSiguiente=formDG%3AbtnSiguiente&javax.faces.ViewState=j_id3'
  it('el cuerpo real (fecha de firma con fecha o vacía) ya no casa', () => {
    expect(detalleCuerpoToleradoConAccionReal(real)).toBeNull()
    expect(cuerpoToleradoConAccionReal('formDG%3AfechaFirmaInputDate=&x=1')).toBe(false)
    expect(cuerpoToleradoConAccionReal('formDG%3AfechaFirmaInputHidden=2026-10-29')).toBe(false)
    expect(cuerpoToleradoConAccionReal('formDG%3AfechaFirma=29.10.2026%2010%3A30')).toBe(false)
  })
  it('otros nombres con firm/firma, valores con letras o prefijos de acción → siguen bloqueando', () => {
    for (const c of ['formDG%3AbtnFirmar=1', 'formDG%3AfirmarPoliza=1', 'formDG%3Afirma=1', 'firma=1', 'formDG%3AfechaFirmaX=29%2F10%2F2026', 'formDG%3AfechaFirmaInputDate=Firmar',
      'formDG%3AfechaFirmaInputDate=29%2F10%2F2026%20emitir', 'btnFirmar%3AfechaFirma=29%2F10%2F2026', 'formEmitir%3AfechaFirmaInputDate=', 'formDG%3AfechaFirmaInputDate=12345678Z',
      'fechaFirma%3Apago=1', `${'formDG%3AfechaFirmaInputDate=29%2F10%2F2026'}&javax.faces.source=formDG%3AbtnFirmar`]) {
      expect(cuerpoToleradoConAccionReal(c), c).toBe(true)
    }
  })
  it('pura: nombre y valor', () => {
    expect(esCampoFechaDeAccion('formDG:fechaFirmaInputDate', '29/10/2026')).toBe(true)
    expect(esCampoFechaDeAccion('fechafirma', '')).toBe(true)
    expect(esCampoFechaDeAccion('formDG:fechaFirmaInputDate', 'mañana')).toBe(false)
    expect(esCampoFechaDeAccion('form DG:fechaFirma', '')).toBe(false)
    expect(esCampoFechaDeAccion('formContratar:fechaFirma', '')).toBe(false)
  })
})

// ─── 3) Allianz VMP: bootstrap-select y lotes sin efecto ───────────────────────────────────────────────────────────────────────────
const MP = 'allianz:autos:movilidad_personal'
const URL_VMP = 'https://www.e-pacallianz.com/drvp00/main/control.do'
const OPC_MARCA = [{ valor: '', texto: 'Seleccione' }, { valor: '101', texto: 'SEGWAY' }, { valor: '102', texto: 'XIAOMI' }]
function invVmp(extra: Record<string, unknown> = {}, opciones: unknown[] = OPC_MARCA): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: URL_VMP, nombre: 'm', titulos: [{ texto: 'Datos del Vehículo', tag: 'h3' }], elementos: [
    { tag: 'select', id: 'VMPBean$marca', name: 'VMPBean$marca', etiqueta: 'Marca', opciones, opcionesTotal: opciones.length, conValor: false, selectpicker: true, ...extra },
    { tag: 'input', type: 'text', id: 'VMPBean$matricula', name: 'VMPBean$matricula', etiqueta: 'Matrícula', conValor: false },
  ] }] }, undefined, { refs: true })!
}
const validar = (i: InventarioDom, acciones: unknown[], datosReales: { riesgo: unknown } | null = null) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones, mapeo: [], motivo: null }, { inventario: i, ramo: 'patinete', entrada: MP, datosReales, presupuestoEnCurso: false })

describe('0.3.20 · Allianz VMP: <select> oculto de bootstrap-select', () => {
  it('el saneado conserva `selectpicker` solo en un select', () => {
    expect(invVmp().marcos[0].elementos[0].selectpicker).toBe(true)
    const otro = sanearInventarioDom({ marcos: [{ url: URL_VMP, nombre: 'm', elementos: [{ tag: 'button', type: 'button', selectpicker: true }] }] }, undefined, { refs: true })!
    expect(otro.marcos[0].elementos[0].selectpicker).toBeUndefined()
  })
  it('elegir la opción de la marca → válido', () => {
    const i = invVmp()
    const v = validar(i, [{ accion: 'elegir', ref: i.marcos[0].elementos[0].ref, opcion: { valor: '102' } }])
    expect(v.ok, JSON.stringify(v)).toBe(true)
  })
  it('desplegable u opción de acción final, o valor fuera de las opciones → rechazo', () => {
    const casos: [string, InventarioDom, string][] = [
      ['id de emisión', invVmp({ id: 'VMPBean$emitir', name: 'VMPBean$emitir' }), '102'],
      ['etiqueta de contratar', invVmp({ etiqueta: 'Contratar' }), '102'],
      ['opción de emisión', invVmp({}, [...OPC_MARCA, { valor: '9', texto: 'Emitir póliza' }]), '9'],
      ['opción de confirmar', invVmp({}, [...OPC_MARCA, { valor: 'confirmar', texto: 'X' }]), 'confirmar'],
      ['valor fuera', invVmp(), '999'],
    ]
    for (const [nombre, i, valor] of casos) {
      const v = validar(i, [{ accion: 'elegir', ref: i.marcos[0].elementos[0].ref, opcion: { valor } }])
      expect(v.ok, nombre).toBe(false)
    }
  })
})

describe('0.3.20 · lotes sin efecto (bucle real: rellenar vehiculo.matricula sin valor ×2)', () => {
  const i = invVmp()
  const mat = i.marcos[0].elementos[1].ref
  it('esAccionSinEfecto: rellenar de clave omitible sin datos reales; con datos reales u otra clave, no', () => {
    expect(esAccionSinEfecto({ accion: 'rellenar', ref: mat, dato: 'vehiculo.matricula' }, 'patinete', null)).toBe(true)
    expect(esAccionSinEfecto({ accion: 'rellenar', ref: mat, dato: 'vehiculo.matricula' }, 'patinete', { riesgo: {} })).toBe(false)
    expect(esAccionSinEfecto({ accion: 'rellenar', ref: mat, dato: 'vehiculo.codigo_postal' }, 'patinete', null)).toBe(false)
    expect(esAccionSinEfecto({ accion: 'marcar', ref: mat }, 'patinete', null)).toBe(false)
  })
  it('[rellenar sin efecto, parar] → manda el parar (antes: se ejecutaba el rellenar y el robot cortaba por bucle)', () => {
    const v = validar(i, [{ accion: 'rellenar', ref: mat, dato: 'vehiculo.matricula' }, { accion: 'parar', motivo: 'dato_no_disponible' }])
    expect(v.ok && v.respuesta.acciones).toEqual([{ accion: 'parar', motivo: 'dato_no_disponible' }])
  })
  it('lote SOLO de rellenar sin efecto → rechazo explicado', () => {
    const v = validar(i, [{ accion: 'rellenar', ref: mat, dato: 'vehiculo.matricula' }])
    expect(v.ok).toBe(false)
    expect(!v.ok && v.errores.join(' ')).toMatch(/lote_sin_efecto/)
  })
  it('con algo con efecto delante del parar, la tolerancia de siempre (se ejecuta lo útil, el parar cae)', () => {
    const marca = i.marcos[0].elementos[0].ref
    const v = validar(i, [{ accion: 'rellenar', ref: mat, dato: 'vehiculo.matricula' }, { accion: 'elegir', ref: marca, opcion: { valor: '102' } }, { accion: 'parar', motivo: 'dato_no_disponible' }])
    expect(v.ok && v.respuesta.acciones.map((a) => a.accion)).toEqual(['rellenar', 'elegir'])
  })
})
