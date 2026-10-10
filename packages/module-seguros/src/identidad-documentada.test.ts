import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capitalizarNombre,
  enmascararFecha,
  marcaAcreditaFicha,
  propuestaIdentidadDesdePoliza,
  textoCambioIdentidadConMotivo,
} from './identidad-documentada.ts'
import {
  MOTIVO_CAMBIO_REQUERIDO,
  MOTIVO_DOCUMENTO_REQUERIDO,
  documentoAcredita,
  revisarEdicion,
} from './cliente-edicion.ts'

const DNI = '12345678Z'
const OTRO = '87654321X'

// ─── Propuesta desde la póliza (caso Estibaliz) ─────────────────────────────

const base = {
  dniFicha: DNI,
  dniLeido: '12.345.678-z',
  esEmpresa: false,
  ficha: { nombre: 'Estibaliz', apellidos: 'Slava' },
  leido: { nombre: 'ESTIBALIZ', apellidos: 'ESLAVA ANTOLI' },
}

test('mismo DNI y la ficha con un solo apellido: propone los de la póliza, capitalizados', () => {
  const p = propuestaIdentidadDesdePoliza(base)
  assert.deepEqual(p, { nombre: 'Estibaliz', apellidos: 'Eslava Antoli', actual: { nombre: 'Estibaliz', apellidos: 'Slava' }, motivo: 'un_apellido' })
})

test('DNI distinto: no se propone nada', () => {
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, dniLeido: OTRO }), null)
})

test('la ficha sin DNI o la póliza sin DNI: no se propone nada (nunca por nombre)', () => {
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, dniFicha: null }), null)
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, dniLeido: null }), null)
})

test('lo mismo salvo mayúsculas y tildes: no se propone nada', () => {
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, ficha: { nombre: 'Estíbaliz', apellidos: 'Eslava Antolí' } }), null)
})

test('ficha con hueco de apellidos: propone con motivo hueco', () => {
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, ficha: { nombre: 'Estibaliz', apellidos: '' } })?.motivo, 'hueco')
})

test('tomador empresa, o la póliza sin apellidos cuando la ficha sí los tiene: nada', () => {
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, esEmpresa: true }), null)
  assert.equal(propuestaIdentidadDesdePoliza({ ...base, leido: { nombre: 'ESTIBALIZ', apellidos: '' } }), null)
})

test('capitalizar respeta lo que ya viene en minúsculas y las partículas', () => {
  assert.equal(capitalizarNombre('MARIA DE LOS ANGELES'), 'Maria de los Angeles')
  assert.equal(capitalizarNombre('García-Pérez'), 'García-Pérez')
})

// ─── La marca guardada con el documento ─────────────────────────────────────

const marca = { identidad: { dniHash: 'h1', clienteId: 'c1', coincidiaConFicha: true } }

test('marca: acredita solo si coincidía, es de esta ficha y la ficha sigue con ese DNI', () => {
  assert.equal(marcaAcreditaFicha(marca, { clienteId: 'c1', dniLookupHash: 'h1' }), true)
  assert.equal(marcaAcreditaFicha(marca, { clienteId: 'c1', dniLookupHash: 'h2' }), false)
  assert.equal(marcaAcreditaFicha(marca, { clienteId: 'c2', dniLookupHash: 'h1' }), false)
  assert.equal(marcaAcreditaFicha({ identidad: { ...marca.identidad, coincidiaConFicha: false } }, { clienteId: 'c1', dniLookupHash: 'h1' }), false)
  assert.equal(marcaAcreditaFicha(marca, { clienteId: 'c1', dniLookupHash: null }), false)
})

test('marca: sin extracción o sin marca es «no se sabe» (null), no «no acredita»', () => {
  assert.equal(marcaAcreditaFicha(null, { clienteId: 'c1', dniLookupHash: 'h1' }), null)
  assert.equal(marcaAcreditaFicha({ datos: {} }, { clienteId: 'c1', dniLookupHash: 'h1' }), null)
})

// ─── El gate ────────────────────────────────────────────────────────────────

test('gate: DNI recibido vale; póliza solo con dniCoincideFicha === true; pedido nunca', () => {
  assert.equal(documentoAcredita({ tipo: 'dni', estado: 'recibido' }), true)
  assert.equal(documentoAcredita({ tipo: 'poliza', estado: 'recibido', dniCoincideFicha: true }), true)
  assert.equal(documentoAcredita({ tipo: 'poliza', estado: 'recibido', dniCoincideFicha: null }), false)
  assert.equal(documentoAcredita({ tipo: 'poliza', estado: 'recibido' }), false)
  assert.equal(documentoAcredita({ tipo: 'poliza', estado: 'pedido', dniCoincideFicha: true }), false)
  assert.equal(documentoAcredita({ tipo: 'recibo', estado: 'recibido', dniCoincideFicha: true }), false)
})

test('sin documento: con permiteMotivo exige motivo ≥5; sin permiso (portal) sigue exigiendo documento', () => {
  const ident = { identidad: { apellidos: 'Eslava Antoli' } }
  assert.deepEqual(revisarEdicion({ ...ident, motivo: 'ok' }, { permiteMotivo: true }), { ok: false, motivo: MOTIVO_CAMBIO_REQUERIDO })
  assert.deepEqual(revisarEdicion(ident, { permiteMotivo: true }), { ok: false, motivo: MOTIVO_CAMBIO_REQUERIDO })
  const r = revisarEdicion({ ...ident, motivo: '  Lo dice la clienta por teléfono ' }, { permiteMotivo: true })
  assert.equal(r.ok && r.motivoCambio, 'Lo dice la clienta por teléfono')
  assert.deepEqual(revisarEdicion({ ...ident, motivo: 'Lo dice la clienta' }), { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
})

test('con documento no hay motivo de por medio', () => {
  const r = revisarEdicion({ identidad: { apellidos: 'X Y' }, documentoId: 'd1' }, { permiteMotivo: true })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.motivoCambio, undefined)
})

test('historial del cambio con motivo: antes → después, DNI enmascarado, fecha solo con el año', () => {
  const t = textoCambioIdentidadConMotivo({
    actor: 'alberto@x.es',
    motivo: 'Corregido con la clienta',
    antes: { apellidos: 'Slava', dni: DNI, fechaNacimiento: '1980-05-17' },
    despues: { apellidos: 'Eslava Antoli', dni: OTRO, fechaNacimiento: '1981-05-17' },
  })
  assert.match(t, /alberto@x\.es/)
  assert.match(t, /Corregido con la clienta/)
  assert.match(t, /apellidos «Slava» → «Eslava Antoli»/)
  assert.ok(!t.includes(DNI) && !t.includes(OTRO), 'el DNI no sale entero')
  assert.match(t, /\*{5}678Z/)
  assert.ok(!t.includes('05-17') && t.includes('**/**/1980'))
  assert.equal(enmascararFecha(null), null)
})
