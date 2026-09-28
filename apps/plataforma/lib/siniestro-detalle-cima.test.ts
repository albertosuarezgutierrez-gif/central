import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  declaracionTardia,
  hrefTelefono,
  leerDetalleCima,
  textoConvenios,
  textoDaa,
  textoResponsabilidad,
  textoSeguro,
  textoVehiculo,
} from './siniestro-detalle-cima.ts'
import { leerSiniestro } from './siniestros-asegura.ts'

const base = { id: 's1', clienteId: 'c1', polizaId: 'p1', estado: 'abierto', origen: 'cima' }

const detalle = {
  fechaDeclaracion: '2026-09-20',
  daa: true,
  responsabilidad: 'PERJUDICADO',
  totalRecobros: 0,
  reservaDesglose: { descripcion: 'RESERVA POR COBERTURAS=16-400.00', coberturas: [{ cobertura: '16', importe: 400 }] },
  convenios: ['SC'],
  expedientes: [{ numero: 'E1', clase: 'DP', estado: 'PE', fechaInicio: '2026-09-01', fechaFin: null, importeReserva: 400, totalPagos: null, totalRecobros: null }],
  riesgo: { descripcion: 'VEHICULO', coberturas: [{ descripcion: 'Daños propios', capital: 12000 }] },
  contactoNombre: 'Ana Pérez',
  contactoTelefono: '600 111 222',
  contactoObservaciones: 'tarde',
  vehiculo: { matricula: '1234ABC', marca: 'SEAT', modelo: 'IBIZA', conductorNombre: 'Luis' },
  vehiculoContrario: { matricula: '9999ZZZ', marcaModelo: 'FORD FOCUS', conductorNombre: null, otros: [] },
  asistencias: [{ descripcion: 'Remolque', prestador: 'GRÚAS SL' }],
  refMediador: 'M-77',
  descripcion: 'Colisión en rotonda',
}

test('asegura vieja sin detalleCima → null (no un objeto de vacíos)', () => {
  assert.equal(leerSiniestro(base)?.detalleCima, null)
  assert.equal(leerDetalleCima({}), null)
  assert.equal(leerDetalleCima('x'), null)
})

test('detalle completo viaja con su forma', () => {
  const d = leerSiniestro({ ...base, detalleCima: detalle })?.detalleCima
  assert.equal(d?.daa, true)
  assert.equal(d?.totalRecobros, 0) // 0 que manda la compañía es dato
  assert.deepEqual(d?.convenios, ['SC'])
  assert.equal(d?.contactoTelefono, '600 111 222')
  assert.equal(d?.expedientes?.[0].importeReserva, 400)
})

test('🚨 un valor cifrado `v1:` NUNCA llega a pantalla, venga en el campo que venga', () => {
  const cifrado = 'v1:aGVsbG8=:abc:def'
  const d = leerDetalleCima({
    ...detalle,
    contactoNombre: cifrado,
    contactoTelefono: cifrado,
    contactoObservaciones: cifrado,
    vehiculo: { ...detalle.vehiculo, conductorNombre: cifrado },
    vehiculoContrario: { matricula: cifrado, marcaModelo: 'FORD', conductorNombre: cifrado, otros: [{ descripcion: 'X', valor: cifrado }] },
    asistencias: [{ descripcion: null, prestador: cifrado }],
    descripcion: cifrado,
  })
  assert.ok(d !== null)
  assert.ok(!JSON.stringify(d).includes('v1:'), JSON.stringify(d))
  assert.equal(d.contactoNombre, null)
  assert.equal(d.contactoTelefono, null)
  assert.equal(d.vehiculoContrario?.matricula, null)
  assert.deepEqual(d.vehiculoContrario?.otros, [])
  assert.equal(d.asistencias, null)
  assert.equal(textoSeguro(cifrado), null)
})

test('importes mal tipados se anulan, no se convierten en 0', () => {
  const d = leerDetalleCima({ totalRecobros: '12', refMediador: 'R' })
  assert.equal(d?.totalRecobros, null)
})

test('responsabilidad legible; lo desconocido como código; null no se pinta', () => {
  assert.match(textoResponsabilidad('CAUSANTE')!, /^Causante/)
  assert.match(textoResponsabilidad('perjudicado')!, /^Perjudicado/)
  assert.equal(textoResponsabilidad('XX'), 'código XX')
  assert.equal(textoResponsabilidad(null), null)
})

test('DAA: false es «No», null no se pinta', () => {
  assert.equal(textoDaa(false), 'No')
  assert.match(textoDaa(true)!, /^Sí/)
  assert.equal(textoDaa(null), null)
})

test('convenios: códigos crudos; sin lista no hay texto', () => {
  assert.equal(textoConvenios(['SC', 'AS']), 'código SC · código AS')
  assert.equal(textoConvenios(null), null)
})

test('declaración tardía: >7 días avisa, 7 no, sin fecha no hay aviso', () => {
  assert.deepEqual(declaracionTardia('2026-09-01', '2026-09-12'), { dias: 11, tardia: true })
  assert.deepEqual(declaracionTardia('2026-09-01T10:00:00Z', '2026-09-08'), { dias: 7, tardia: false })
  assert.equal(declaracionTardia(null, '2026-09-08'), null)
  assert.equal(declaracionTardia('2026-09-01', null), null)
})

test('tel: limpio; sin dígitos no hay enlace', () => {
  assert.equal(hrefTelefono('+34 600 11 22 33'), 'tel:+34600112233')
  assert.equal(hrefTelefono('sin número'), null)
  assert.equal(hrefTelefono(null), null)
})

test('vehículo: marca+modelo y matrícula; vacío → null', () => {
  assert.equal(textoVehiculo({ matricula: '1234ABC', marca: 'SEAT', modelo: 'IBIZA', conductorNombre: null }), 'SEAT IBIZA · 1234ABC')
  assert.equal(textoVehiculo(null), null)
})
