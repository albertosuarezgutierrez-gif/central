// Explorador 0.3.42 (04/11/2026) · Pelayo «Datos del Tomador»: el <select> nativo OCULTO que sostiene un custom element visible
// (`<pelayo-select>` dentro del shadow de `<pelayo-modal>`) viaja con `selectOculto` y se elige con `elegir` por el TEXTO de la opción
// («DNI», «CIF», «NIE»: textos de opción, no dato personal). Fixtures SINTÉTICAS, sin PII.
import { describe, it, expect } from 'vitest'
import { sanearInventarioDom, validarRespuestaExplorador, type InventarioDom } from './index.ts'

const ENTRADA = 'pelayo:presupuestos:auto'
const URL_PELAYO = 'https://mediadores.pelayo.com/portalmediador-nuevo-presupuesto/'
const OPC = [{ valor: '', texto: 'Seleccionar tipo de documento' }, { valor: 'DNI', texto: 'DNI' }, { valor: 'CIF', texto: 'CIF' }, { valor: 'NIE', texto: 'NIE' }, { valor: 'PAS', texto: 'Pasaporte' }]
function inv(extra: Record<string, unknown> = {}, opciones: unknown[] = OPC): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: URL_PELAYO, nombre: null, titulos: [{ texto: 'Nueva contratación', tag: 'h3' }], elementos: [
    { tag: 'select', etiqueta: 'Tipo de documento', opciones, opcionesTotal: opciones.length, conValor: false, selectOculto: true, ...extra },
  ] }] }, undefined, { refs: true })!
}
const validar = (i: InventarioDom, acciones: unknown[]) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones, mapeo: [], motivo: null }, { inventario: i, ramo: 'auto', entrada: ENTRADA, datosReales: null, presupuestoEnCurso: false })

describe('0.3.42 · <select> oculto de un custom element (selectOculto)', () => {
  it('el saneado conserva `selectOculto` y las opciones (texto) solo en un select', () => {
    const el = inv().marcos[0].elementos[0]
    expect(el.selectOculto).toBe(true)
    expect(el.opciones?.map((o) => o.texto)).toEqual(['Seleccionar tipo de documento', 'DNI', 'CIF', 'NIE', 'Pasaporte'])
    const otro = sanearInventarioDom({ marcos: [{ url: URL_PELAYO, nombre: 'm', elementos: [{ tag: 'pelayo-select', selectOculto: true }] }] }, undefined, { refs: true })!
    expect(otro.marcos[0].elementos[0].selectOculto).toBeUndefined()
  })
  it('elegir por el TEXTO «DNI» (o su valor) → válido; el valor resuelto es el de la opción', () => {
    const i = inv()
    const ref = i.marcos[0].elementos[0].ref
    for (const opcion of [{ texto: 'DNI' }, { valor: 'DNI' }, 'DNI']) {
      const v = validar(i, [{ accion: 'elegir', ref, opcion }])
      expect(v.ok, JSON.stringify(v)).toBe(true)
      if (v.ok) expect(v.respuesta.acciones[0]).toMatchObject({ accion: 'elegir', opcion: { valor: 'DNI' } })
    }
  })
  it('desplegable u opción de acción final, o fuera de las opciones → rechazo (como el selectpicker)', () => {
    const casos: [string, InventarioDom, unknown][] = [
      ['etiqueta de contratar', inv({ etiqueta: 'Contratar' }), { valor: 'DNI' }],
      ['opción de emisión', inv({}, [...OPC, { valor: '9', texto: 'Emitir póliza' }]), { valor: '9' }],
      ['fuera', inv(), { texto: 'NIF' }],
    ]
    for (const [nombre, i, opcion] of casos) {
      const v = validar(i, [{ accion: 'elegir', ref: i.marcos[0].elementos[0].ref, opcion }])
      expect(v.ok, nombre).toBe(false)
    }
  })
})
