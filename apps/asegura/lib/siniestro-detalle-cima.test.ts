import assert from 'node:assert/strict'
import { test } from 'node:test'
import { descifrarSeguro, detalleCimaDeFila, importeCima, type FilaDetalleCima } from './siniestro-detalle-cima.ts'

// Descifrado de mentira: `v1:X` → X; `v1:ROTO` lanza (clave distinta / texto corrupto).
const descifrar = (v: string): string => {
  if (!v.startsWith('v1:')) return v
  if (v === 'v1:ROTO') throw new Error('Malformed encrypted field')
  return v.slice(3)
}
// Sin clave, `decryptField` devuelve el texto TAL CUAL: el cifrado no se toca.
const sinClave = (v: string): string => v

const vacia: FilaDetalleCima = {
  fechaDeclaracion: null, daaCima: null, responsabilidadCima: null, totalRecobrosCima: null,
  reservaDesgloseCima: null, conveniosCima: null, expedientesCima: null, riesgoCima: null,
  contactoNombreCima: null, contactoTelefonoCima: null, vehiculoCima: null, vehiculoContrarioCima: null,
  asistenciasCima: null, refMediadorCima: null, descripcionCima: null, contactoObservacionesCima: null,
}

const llena: FilaDetalleCima = {
  fechaDeclaracion: new Date('2026-09-20T00:00:00Z'),
  daaCima: false,
  responsabilidadCima: 'CAUSANTE',
  totalRecobrosCima: '0.00',
  reservaDesgloseCima: { descripcion: 'RESERVA POR COBERTURAS=16-400.00/43-78.00', coberturas: [{ cobertura: '16', importe: '400.00' }, { cobertura: '43', importe: 'x' }] },
  conveniosCima: ['SC', 'AS'],
  expedientesCima: [{ numero: 'E1', clase: 'DP', estado: 'PE', fechaInicio: '2026-09-01', fechaFin: null, importeReserva: '400.00', totalPagos: null, totalRecobros: null, coberturas: [] }],
  riesgoCima: { id: '1', descripcion: 'VEHICULO 1234ABC', coberturas: [{ id: '16', descripcion: 'Daños propios', capital: '12000.50' }] },
  contactoNombreCima: 'v1:Ana Pérez',
  contactoTelefonoCima: 'v1:600111222',
  vehiculoCima: { matricula: '1234ABC', marca: 'SEAT', modelo: 'IBIZA', conductorNombre: 'v1:Luis' },
  vehiculoContrarioCima: { matricula: 'v1:9999ZZZ', marcaModelo: 'FORD FOCUS', conductorNombre: 'v1:ROTO', otros: [{ idDato: 'CONT_X', descripcion: null, valor: 'v1:dato' }] },
  asistenciasCima: [{ clase: 'GR', razonSocial: 'GRÚAS SL', nombre: null, descripcion: 'Remolque' }, { clase: 'PF', razonSocial: null, nombre: 'v1:Pepe', descripcion: null }],
  refMediadorCima: 'M-77',
  descripcionCima: 'Colisión en rotonda',
  contactoObservacionesCima: 'v1:llamar por la tarde',
}

test('fila sin nada de CIMA → null entero (nunca un objeto de vacíos)', () => {
  assert.equal(detalleCimaDeFila(vacia, descifrar), null)
})

test('fila llena: PII descifrada, importes a número, códigos crudos', () => {
  const d = detalleCimaDeFila(llena, descifrar)!
  assert.equal(d.fechaDeclaracion, '2026-09-20')
  assert.equal(d.daa, false) // false es un dato, no «no consta»
  assert.equal(d.responsabilidad, 'CAUSANTE')
  assert.equal(d.totalRecobros, 0) // «0.00» que manda la compañía SÍ es cero
  assert.deepEqual(d.reservaDesglose?.coberturas, [{ cobertura: '16', importe: 400 }, { cobertura: '43', importe: null }])
  assert.deepEqual(d.convenios, ['SC', 'AS'])
  assert.equal(d.expedientes?.[0].importeReserva, 400)
  assert.equal(d.expedientes?.[0].totalPagos, null)
  assert.deepEqual(d.riesgo?.coberturas, [{ descripcion: 'Daños propios', capital: 12000.5 }])
  assert.equal(d.contactoNombre, 'Ana Pérez')
  assert.equal(d.contactoTelefono, '600111222')
  assert.equal(d.contactoObservaciones, 'llamar por la tarde')
  assert.equal(d.vehiculo?.conductorNombre, 'Luis')
  assert.equal(d.vehiculoContrario?.matricula, '9999ZZZ')
  assert.equal(d.vehiculoContrario?.conductorNombre, null) // descifrado que lanza → null
  assert.deepEqual(d.vehiculoContrario?.otros, [{ descripcion: 'CONT_X', valor: 'dato' }])
  assert.deepEqual(d.asistencias, [{ descripcion: 'Remolque', prestador: 'GRÚAS SL' }, { descripcion: null, prestador: 'Pepe' }])
})

test('🚨 sin clave de descifrado NINGÚN `v1:` sale de asegura', () => {
  const d = detalleCimaDeFila(llena, sinClave)!
  assert.ok(!JSON.stringify(d).includes('v1:'), JSON.stringify(d))
  assert.equal(d.contactoNombre, null)
  assert.equal(d.contactoTelefono, null)
  assert.equal(d.vehiculoContrario?.matricula, null)
  assert.deepEqual(d.asistencias, [{ descripcion: 'Remolque', prestador: 'GRÚAS SL' }]) // la de persona física sin descifrar se cae entera
})

test('descifrarSeguro: lanza → null; sigue cifrado → null; claro heredado pasa', () => {
  assert.equal(descifrarSeguro('v1:ROTO', descifrar), null)
  assert.equal(descifrarSeguro('v1:abc', sinClave), null)
  assert.equal(descifrarSeguro('600 000 000', descifrar), '600 000 000')
  assert.equal(descifrarSeguro(null, descifrar), null)
})

test('importeCima: vacío/basura → null, nunca 0', () => {
  assert.equal(importeCima(null), null)
  assert.equal(importeCima(''), null)
  assert.equal(importeCima('abc'), null)
  assert.equal(importeCima('78.00'), 78)
})

test('listas vacías de la BD no se convierten en «no hay»: salen null', () => {
  const d = detalleCimaDeFila({ ...vacia, conveniosCima: [], expedientesCima: [], refMediadorCima: 'R1' }, descifrar)!
  assert.equal(d.convenios, null)
  assert.equal(d.expedientes, null)
})
