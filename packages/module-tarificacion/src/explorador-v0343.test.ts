// Explorador 0.3.43 (04/11/2026) · Pelayo «Tipo de documento» = `<pelayo-smart-select>` SIN <select>: desplegable custom (`desplegableCustom`)
// que se elige por el TEXTO EXACTO de la opción («DNI/NIF», «NIE», «Pasaporte»: textos de opción, no dato personal). Fixtures SINTÉTICAS, sin PII.
import { describe, it, expect } from 'vitest'
import { esTagDesplegableCustom, sanearInventarioDom, validarRespuestaExplorador, type InventarioDom } from './index.ts'

const ENTRADA = 'pelayo:presupuestos:auto'
const URL_PELAYO = 'https://mediadores.pelayo.com/portalmediador-nuevo-presupuesto/'
const OPC = ['Seleccionar tipo de documento', 'DNI/NIF', 'NIE', 'Pasaporte'].map((texto) => ({ valor: null, texto }))
function inv(extra: Record<string, unknown> = {}, opciones: unknown[] | undefined = OPC, tag = 'pelayo-smart-select'): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: URL_PELAYO, nombre: null, elementos: [
    { tag, formControlName: 'documentType', desplegableCustom: true, ...(opciones ? { opciones, opcionesTotal: opciones.length } : {}), ...extra },
  ] }] }, undefined, { refs: true })!
}
const validar = (i: InventarioDom, acciones: unknown[]) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones, mapeo: [], motivo: null }, { inventario: i, ramo: 'auto', entrada: ENTRADA, datosReales: null, presupuestoEnCurso: false })
const ref = (i: InventarioDom) => i.marcos[0].elementos[0].ref

describe('0.3.43 · desplegable custom sin <select> (desplegableCustom)', () => {
  it('el saneado conserva la marca y los textos (valor null) solo en un custom element de desplegable', () => {
    const el = inv().marcos[0].elementos[0]
    expect(el.desplegableCustom).toBe(true)
    expect(el.opciones?.map((o) => o.texto)).toEqual(['Seleccionar tipo de documento', 'DNI/NIF', 'NIE', 'Pasaporte'])
    expect(el.opciones?.every((o) => o.valor === null)).toBe(true)
    for (const tag of ['div', 'select', 'nx-dropdown', 'pelayo-input']) expect(inv({}, undefined, tag).marcos[0].elementos[0].desplegableCustom, tag).toBeUndefined()
    expect(inv({ role: 'combobox' }, undefined, 'x-campo').marcos[0].elementos[0].desplegableCustom).toBe(true)
    expect(esTagDesplegableCustom('pelayo-smart-select', null)).toBe(true)
    expect(esTagDesplegableCustom('nx-dropdown', 'combobox')).toBe(false)
  })
  it('elegir «DNI/NIF» (cadena, { texto } o { valor }) → válido, con el texto exacto', () => {
    const i = inv()
    for (const opcion of ['DNI/NIF', { texto: 'DNI/NIF' }, { valor: 'DNI/NIF' }, '  DNI/NIF ']) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i), opcion }])
      expect(v.ok, JSON.stringify(v)).toBe(true)
      if (v.ok) expect(v.respuesta.acciones[0]).toMatchObject({ accion: 'elegir', opcion: { valor: 'DNI/NIF' } })
    }
  })
  it('subcadena, mayúsculas distintas, fuera de las opciones o acción final → rechazo', () => {
    const casos: [string, InventarioDom, unknown][] = [
      ['NIF (subcadena)', inv(), 'NIF'],
      ['DNI (subcadena)', inv(), 'DNI'],
      ['dni/nif', inv(), 'dni/nif'],
      ['etiqueta de contratar', inv({ ariaLabel: 'Contratar' }), 'NIE'],
      ['opción de emisión', inv({}, [...OPC, { valor: null, texto: 'Emitir póliza' }]), 'Emitir póliza'],
    ]
    for (const [nombre, i, opcion] of casos) expect(validar(i, [{ accion: 'elegir', ref: ref(i), opcion }]).ok, nombre).toBe(false)
  })
  it('sin opciones inventariadas: texto 1-80 sin forma de dato personal (el worker lo comprueba vivo)', () => {
    const i = inv({}, undefined)
    expect(validar(i, [{ accion: 'elegir', ref: ref(i), opcion: 'NIE' }]).ok).toBe(true)
    expect(validar(i, [{ accion: 'elegir', ref: ref(i), opcion: '12345678Z' }]).ok).toBe(false)
  })
  it('un custom element SIN la marca sigue sin poder elegirse', () => {
    const i = sanearInventarioDom({ marcos: [{ url: URL_PELAYO, nombre: null, elementos: [{ tag: 'pelayo-smart-select' }] }] }, undefined, { refs: true })!
    expect(validar(i, [{ accion: 'elegir', ref: ref(i), opcion: 'NIE' }]).ok).toBe(false)
  })
})
