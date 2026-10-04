import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalleSiniestroCompania, descripcionRiesgoLegible, textoClaro, normalizarCodigoCoberturaNumerico, type EntradaDetalle } from './siniestro-detalle.ts'

const vacio: EntradaDetalle = {
  fechaDeclaracion: null,
  posicion: null,
  responsabilidad: null,
  daa: null,
  reserva: null,
  reservaDesglose: null,
  totalRecobros: null,
  expedientes: null,
  riesgo: null,
  vehiculo: null,
  vehiculoContrario: null,
  asistencias: null,
  descripcion: null,
  tramitador: { nombre: null, telefono: null, email: null },
  perito: { nombre: null, telefono: null, email: null },
}

test('sin nada informado devuelve null, no un objeto de huecos', () => {
  assert.equal(detalleSiniestroCompania(vacio), null)
})

test('un valor cifrado v1: jamás se pinta', () => {
  assert.equal(textoClaro('v1:abc'), null)
  const d = detalleSiniestroCompania({
    ...vacio,
    vehiculoContrario: { matricula: 'v1:xx', marcaModelo: 'FORD FOCUS', conductorNombre: 'v1:yy' },
    tramitador: { nombre: 'v1:zz', telefono: '900111222', email: null },
  })
  assert.equal(d?.vehiculoContrario, 'FORD FOCUS')
  assert.deepEqual(d?.tramitador, { nombre: null, telefono: '900111222', email: null })
  assert.doesNotMatch(JSON.stringify(d), /v1:/)
})

test('asistencias: la empresa sí, el nombre de persona física ni se lee', () => {
  const d = detalleSiniestroCompania({
    ...vacio,
    asistencias: [
      { clase: 'GR', razonSocial: 'GRUAS SUR SL', nombre: null, descripcion: 'Remolque a taller' },
      { clase: 'CE', razonSocial: null, nombre: 'Juan en claro', descripcion: null },
    ],
  })
  assert.deepEqual(d?.asistencias, [{ descripcion: 'Remolque a taller', prestador: 'GRUAS SUR SL' }])
  assert.doesNotMatch(JSON.stringify(d), /Juan/)
})

test('culpa y papel se traducen; un código desconocido no se pinta crudo', () => {
  const d = detalleSiniestroCompania({ ...vacio, posicion: 'cu', responsabilidad: 'PERJUDICADO' })
  assert.equal(d?.culpa, 'Con culpa del asegurado')
  assert.match(d?.papel ?? '', /^Perjudicado/)
  assert.equal(detalleSiniestroCompania({ ...vacio, posicion: 'NA', responsabilidad: 'XX' }), null)
})

test('importes: decimal-string se lee, cadena vacía es null y nunca 0', () => {
  const d = detalleSiniestroCompania({
    ...vacio,
    reserva: '400.00',
    totalRecobros: '',
    reservaDesglose: { descripcion: null, coberturas: [{ cobertura: 'Daños propios', importe: '120.50' }] },
  })
  assert.equal(d?.reserva, 400)
  assert.equal(d?.totalRecobrado, null)
  assert.deepEqual(d?.reservaPorCobertura, [{ cobertura: 'Daños propios', importe: 120.5 }])
})

test('fecha de declaración desde Date de Prisma o texto', () => {
  assert.equal(detalleSiniestroCompania({ ...vacio, fechaDeclaracion: new Date('2026-03-04T00:00:00Z') })?.fechaDeclaracion, '2026-03-04')
  assert.equal(detalleSiniestroCompania({ ...vacio, fechaDeclaracion: '2026-03-04' })?.fechaDeclaracion, '2026-03-04')
})

test('parte amistoso: false es un dato, no un hueco', () => {
  assert.equal(detalleSiniestroCompania({ ...vacio, daa: false })?.parteAmistoso, false)
})

test('vehículo propio con matrícula en claro', () => {
  const d = detalleSiniestroCompania({ ...vacio, vehiculo: { marca: 'SEAT', modelo: 'IBIZA', matricula: '1234ABC', conductorNombre: 'v1:q' } })
  assert.equal(d?.vehiculo, 'SEAT IBIZA · 1234ABC')
})

test('🚨 reserva por cobertura: el código se traduce con las coberturas de la póliza; sin nombre, la fila no se pinta', () => {
  const d = detalleSiniestroCompania(
    { ...vacio, reservaDesglose: { coberturas: [{ cobertura: '16', importe: '171.31' }, { cobertura: '43', importe: '78.00' }, { cobertura: 'constructor', importe: '1' }] } },
    { '16': 'Fenómenos Naturaleza' },
  )
  assert.deepEqual(d?.reservaPorCobertura, [{ cobertura: 'Fenómenos Naturaleza', importe: 171.31 }, { cobertura: 'constructor', importe: 1 }])
  assert.doesNotMatch(JSON.stringify(d), /"43"|"16"/)
  assert.equal(detalleSiniestroCompania({ ...vacio, reservaDesglose: { coberturas: [{ cobertura: '16', importe: '5' }] } }), null)
})

test('riesgo afectado: se quita el código interno delante del nombre', () => {
  assert.equal(descripcionRiesgoLegible('1219-Allianz Auto Terceros'), 'Allianz Auto Terceros')
  assert.equal(descripcionRiesgoLegible('HONDA NTV 700'), 'HONDA NTV 700')
  assert.equal(descripcionRiesgoLegible('1219'), null)
  assert.equal(detalleSiniestroCompania({ ...vacio, riesgo: { descripcion: '1219-Allianz Auto Terceros', coberturas: [] } })?.riesgo?.descripcion, 'Allianz Auto Terceros')
})

test('culpa indeterminada (IN) no se pinta: no consta, no se afirma', () => {
  assert.equal(detalleSiniestroCompania({ ...vacio, posicion: 'IN' }), null)
  assert.equal(detalleSiniestroCompania({ ...vacio, posicion: 'RE' })?.culpa, 'Sin culpa: tu compañía reclama al contrario')
})

test('normalizarCodigoCoberturaNumerico: elimina ceros a la izquierda de códigos numéricos', () => {
  assert.equal(normalizarCodigoCoberturaNumerico('016'), '16')
  assert.equal(normalizarCodigoCoberturaNumerico('0'), '0')
  assert.equal(normalizarCodigoCoberturaNumerico('A01'), 'A01')
  assert.equal(normalizarCodigoCoberturaNumerico(''), null)
  assert.equal(normalizarCodigoCoberturaNumerico(null), null)
})

test('🚨 reserva por cobertura: código normalizado casa con mapa normalizado (016 ≡ 16)', () => {
  const d = detalleSiniestroCompania(
    { ...vacio, reservaDesglose: { coberturas: [{ cobertura: '016', importe: 171.31 }] } },
    { '16': 'Daños propios' }
  )
  assert.deepEqual(d?.reservaPorCobertura, [{ cobertura: 'Daños propios', importe: 171.31 }])
})
