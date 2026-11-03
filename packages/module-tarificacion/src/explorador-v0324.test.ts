// Explorador 0.3.24 (30/10/2026) · fixtures SINTÉTICAS (sin PII):
// Allianz VMP «Figuras Intervinientes» (8338f86b…): `elegir` sobre `IntervinientesBean$nifTomador_tipoDoc` volvió a caer con «opcion tiene
// que ser { valor }» (la respuesta cruda de la IA no se guarda). En el inventario la opción «DNI/NIF/NIE/CIF» va con `valor: null`; las
// formas que sí dan ese error y la IA tiene a mano son `{ valor: null }` (copia del inventario), sinónimos (`value`, `label`, `text`) o un
// índice. Además `opcionesTotal` era 4 con 3 opciones: la cuarta, el placeholder vacío de bootstrap-select (`bs-title-option`), lo que
// hacía fallar también el «ya puesta». Formas inequívocas resueltas contra el inventario; ambigüedad, índice o redactada = rechazo.
// TARIFICAR ≠ EMITIR: la opción de acción final sigue rechazada por cualquier forma.
import { describe, it, expect } from 'vitest'
import { normalizarOpcionElegir, sanearInventarioDom, validarRespuestaExplorador, type InventarioDom } from './index.ts'

const AZ = 'allianz:autos:movilidad_personal'
const URL_SEA = 'https://www.e-pacallianz.com/drvp00/SEAServlet'
const TD = 'IntervinientesBean$nifTomador_tipoDoc'
const BS_TITLE = { valor: '', texto: '' }
const DNI = { valor: '', texto: 'DNI/NIF/NIE/CIF' }
const REAL = [BS_TITLE, DNI, { valor: 'P', texto: 'Pasaporte' }, { valor: 'O', texto: 'Otros' }]
type Sel = { id?: string; opciones: { valor: string | null; texto: string | null }[]; conValor?: boolean; total?: number }
const CP = { tag: 'input', type: 'text', id: 'cp', name: 'IntervinientesBean$cp', etiqueta: 'Código postal', conValor: false }
function invCrudo(s: Sel) {
  return { marcos: [{ url: URL_SEA, nombre: 'm', titulos: [{ texto: 'Figuras Intervinientes', tag: 'h3' }], elementos: [
    { tag: 'select', id: s.id ?? TD, name: s.id ?? TD, etiqueta: 'Tipo Doc. Tomador', opciones: s.opciones, opcionesTotal: s.total ?? s.opciones.length, conValor: s.conValor ?? false, selectpicker: true },
    CP,
  ] }] }
}
const inv = (s: Sel): InventarioDom => sanearInventarioDom(invCrudo(s), undefined, { refs: true })!
const ref = (i: InventarioDom, id: string) => i.marcos[0].elementos.find((e) => e.id === id)!.ref!
const validar = (i: InventarioDom, acciones: unknown[]) =>
  validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'Figuras Intervinientes', tipo: 'formulario' }, acciones, mapeo: [], motivo: null },
    { inventario: i, ramo: 'patinete', entrada: AZ, datosReales: null, presupuestoEnCurso: false })
const conCp = (i: InventarioDom, opcion: unknown) => validar(i, [{ accion: 'elegir', ref: ref(i, TD), opcion }, { accion: 'rellenar', ref: ref(i, 'cp'), dato: 'vehiculo.codigo_postal' }])

describe('0.3.24 · inventario: placeholder vacío de bootstrap-select y opción de value=""', () => {
  it('real: 4 opciones, la vacía se descarta y se CUENTA; la de value="" lleva `vacio`', () => {
    const el = inv({ opciones: REAL }).marcos[0].elementos.find((e) => e.id === TD)!
    expect(el.opciones).toEqual([{ valor: null, texto: 'DNI/NIF/NIE/CIF', vacio: true }, { valor: 'P', texto: 'Pasaporte' }, { valor: 'O', texto: 'Otros' }])
    expect(el.opcionesTotal).toBe(4)
    expect(el.opcionesVacias).toBe(1)
  })

  it('segunda pasada (asegura) idempotente: conserva `vacio` y `opcionesVacias`', () => {
    const i1 = inv({ opciones: REAL })
    const i2 = sanearInventarioDom(JSON.parse(JSON.stringify(i1)), undefined, { refs: true })!
    expect(i2.marcos[0].elementos.find((e) => e.id === TD)).toEqual(i1.marcos[0].elementos.find((e) => e.id === TD))
  })

  it('redactada (valor con forma de dato) ≠ vacía: ni `vacio` ni cuenta en `opcionesVacias`', () => {
    const el = inv({ opciones: [{ valor: '12345678Z', texto: '12345678Z' }, { valor: '12345678Z', texto: 'DNI/NIF/NIE/CIF' }, { valor: 'P', texto: 'Pasaporte' }] }).marcos[0].elementos.find((e) => e.id === TD)!
    expect(el.opcionesVacias).toBeUndefined()
    expect(el.opciones?.[0]).toEqual({ valor: null, texto: 'DNI/NIF/NIE/CIF' })
  })
})

describe('0.3.24 · Allianz VMP: formas de `opcion` en elegir', () => {
  it('real: la opción sin valor por { valor: null } / { valor: "" } / "" / texto / sinónimos → ya puesta (no se ejecuta), el lote sigue', () => {
    const i = inv({ opciones: REAL })
    for (const opcion of [{ valor: null }, { valor: '' }, '', { texto: 'DNI/NIF/NIE/CIF' }, 'DNI/NIF/NIE/CIF', { label: 'DNI/NIF/NIE/CIF' }, { text: 'DNI/NIF/NIE/CIF' },
      { etiqueta: 'DNI/NIF/NIE/CIF' }, { value: null, label: 'DNI/NIF/NIE/CIF' }, { valor: null, texto: 'DNI/NIF/NIE/CIF' }, { value: null }]) {
      const v = conCp(i, opcion)
      expect(v.ok, JSON.stringify(opcion)).toBe(true)
      if (v.ok) expect(v.respuesta.acciones, JSON.stringify(opcion)).toEqual([{ accion: 'rellenar', ref: ref(i, 'cp'), dato: 'vehiculo.codigo_postal' }])
    }
  })

  it('sinónimos con una opción con valor → { valor } del inventario', () => {
    const i = inv({ opciones: REAL })
    for (const opcion of [{ value: 'P' }, { label: 'Pasaporte' }, { text: 'Pasaporte' }, { value: 'P', label: 'Pasaporte' }, { valor: 'P', etiqueta: 'Pasaporte' }]) {
      const v = conCp(i, opcion)
      expect(v.ok, JSON.stringify(opcion)).toBe(true)
      if (v.ok) expect(v.respuesta.acciones[0], JSON.stringify(opcion)).toEqual({ accion: 'elegir', ref: ref(i, TD), opcion: { valor: 'P' } })
    }
  })

  it('formas no inequívocas → rechazo con el formato correcto en el error', () => {
    const i = inv({ opciones: REAL })
    const casos: [unknown, RegExp][] = [
      [0, /opcion tiene que ser \{ valor \}.*"opcion": \{ "valor": "P" \}/],
      [1, /opcion tiene que ser/],
      [null, /opcion tiene que ser/],
      [{ indice: 1 }, /opcion tiene que ser/],
      [{ index: 0 }, /opcion tiene que ser/],
      [{ valor: 'P', value: 'P' }, /una sola clave/],
      [{ texto: 'Pasaporte', label: 'Pasaporte' }, /una sola clave/],
      [{ valor: null, texto: 5 }, /opcion tiene que ser/],
      [{ texto: null }, /opcion tiene que ser/],
      [{ label: '' }, /opcion tiene que ser/],
      [{ value: 'P', label: 'Otros' }, /misma opción/],
      [{ label: 'pasaporte' }, /no está entre las opciones/],
    ]
    for (const [opcion, re] of casos) {
      const v = conCp(i, opcion)
      expect(v.ok, JSON.stringify(opcion)).toBe(false)
      if (!v.ok) expect(v.errores.join(' '), JSON.stringify(opcion)).toMatch(re)
    }
  })

  it('{ valor: null } con dos opciones sin valor (con texto) → ambigua; con el select CON valor o la opción redactada → rechazo', () => {
    const dos = inv({ opciones: [BS_TITLE, DNI, { valor: '', texto: 'Seleccione' }, { valor: 'P', texto: 'Pasaporte' }] })
    const v1 = conCp(dos, { valor: null })
    expect(v1.ok).toBe(false)
    if (!v1.ok) expect(v1.errores.join(' ')).toMatch(/ambigua/)
    const casos: Sel[] = [
      { opciones: REAL, conValor: true }, // el select ya tiene otro valor: «la vacía» sería cambiarlo
      { opciones: REAL, total: 5 }, // falta una opción que no es el placeholder vacío
      { opciones: [BS_TITLE, { valor: '12345678Z', texto: 'DNI/NIF/NIE/CIF' }, { valor: 'P', texto: 'Pasaporte' }] }, // redactada, no vacía
      { opciones: [{ valor: '12345678Z', texto: '12345678Z' }, DNI, { valor: 'P', texto: 'Pasaporte' }] }, // la descartada es redactada, no placeholder
    ]
    for (const s of casos) {
      const i = inv(s)
      for (const opcion of [{ valor: null }, { texto: 'DNI/NIF/NIE/CIF' }]) {
        const v = conCp(i, opcion)
        expect(v.ok, JSON.stringify([s, opcion])).toBe(false)
        if (!v.ok) expect(v.errores.join(' ')).toMatch(/no tiene valor en el inventario/)
      }
    }
  })

  it('selectpicker: la opción de ACCIÓN FINAL sigue rechazada por cualquier sinónimo', () => {
    const i = inv({ id: 'VMPBean$accion', opciones: [BS_TITLE, { valor: '7', texto: 'Emitir póliza' }] })
    for (const opcion of [{ label: 'Emitir póliza' }, { text: 'Emitir póliza' }, { value: '7' }, { etiqueta: 'Emitir póliza' }]) {
      const v = validar(i, [{ accion: 'elegir', ref: ref(i, 'VMPBean$accion'), opcion }])
      expect(v.ok, JSON.stringify(opcion)).toBe(false)
      if (!v.ok) expect(v.errores.join(' ')).toMatch(/acción final/)
    }
  })

  it('nx-dropdown: la «opción sin valor» no existe (su opción es el texto)', () => {
    const nx = { tag: 'nx-dropdown', ref: 'm1e1', opciones: [{ valor: null, texto: 'Particular' }] }
    expect(normalizarOpcionElegir({ valor: null }, nx).ok).toBe(false)
    expect(normalizarOpcionElegir('', nx).ok).toBe(false)
    expect(normalizarOpcionElegir({ label: 'Particular' }, nx)).toEqual({ ok: true, valor: 'Particular' })
  })
})
