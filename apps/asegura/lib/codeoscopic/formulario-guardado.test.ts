import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerFormularioAuto } from './formulario-guardado.ts'
import { construirPeticionAuto, type DatosAuto } from './peticion-auto.ts'

// El fixture sale del propio constructor real (`construirPeticionAuto`), no
// se escribe a mano: así el test no puede divergir en silencio del formato
// que de verdad se guarda en `seguros.tarificaciones.peticion`.
const DATOS: DatosAuto = {
  dni: '12345678z',
  nombre: 'Pilar',
  apellido1: 'Franco Ruz',
  fechaNacimiento: '1980-05-10',
  sexo: 'mujer',
  estadoCivil: 'Married',
  telefono: '611223344',
  fechaCarnet: '2000-01-01',
  codigoVehiculo: 'BASE7-999',
  matricula: '1234ABC',
  fechaMatriculacion: '2018-03-01',
  kmAnuales: 12000,
  cpCirculacion: '41003',
  municipioCirculacionId: 41091,
  garaje: 'Garage',
  fechaEfecto: '2026-10-01',
}

test('recupera el tipo de vía (catálogo) y la calle completa + correo tecleados (12/09/2026)', () => {
  const f = extraerFormularioAuto(
    construirPeticionAuto({
      ...DATOS,
      email: 'pilar@example.com',
      cpResidencia: '41003',
      municipioResidenciaId: 41091,
      nombreVia: 'Severo Ochoa',
      numeroVia: '12',
      tipoVia: 'Street',
    }),
  )
  assert.equal(f.tipoViaId, 'Street')
  assert.equal(f.correcciones.nombreVia, 'Severo Ochoa')
  assert.equal(f.correcciones.numeroVia, '12')
  assert.equal(f.correcciones.email, 'pilar@example.com')
})

test('extraerFormularioAuto recupera el vehículo y el tomador de una petición real', () => {
  const peticion = construirPeticionAuto(DATOS)
  const f = extraerFormularioAuto(peticion)

  assert.equal(f.codigoVehiculo, 'BASE7-999')
  assert.equal(f.fechaMatriculacion, '2018-03-01')
  assert.equal(f.garaje, 'Garage')
  assert.equal(f.estadoCivilId, 'Married')
  assert.equal(f.municipioId, 41091)
  assert.equal(f.tipoViaId, null) // sin dirección de residencia no hay tipo de vía
  assert.equal(f.correcciones.dni, '12345678Z') // se normaliza en mayúsculas al construirla
  assert.equal(f.correcciones.nombre, 'Pilar')
  assert.equal(f.correcciones.apellido1, 'Franco Ruz')
  assert.equal(f.correcciones.telefono, '611223344')
  assert.equal(f.correcciones.fechaNacimiento, '1980-05-10')
  assert.equal(f.correcciones.fechaCarnet, '2000-01-01')
})

test('extraerFormularioAuto no inventa nada sobre un cuerpo vacío o ajeno', () => {
  const f = extraerFormularioAuto({})
  assert.equal(f.codigoVehiculo, null)
  assert.equal(f.fechaMatriculacion, null)
  assert.equal(f.garaje, null)
  assert.equal(f.estadoCivilId, null)
  assert.equal(f.municipioId, null)
  assert.deepEqual(f.correcciones, {})

  // Un `peticion` de otra forma (p.ej. hogar, u otro tipo del todo) tampoco
  // hace saltar nada: cada lectura es defensiva y cae a null por su cuenta.
  const f2 = extraerFormularioAuto({ risk: { address: { postalCode: '41003' } } })
  assert.equal(f2.codigoVehiculo, null)
  assert.deepEqual(f2.correcciones, {})
})

test('extraerFormularioAuto no confunde un id numérico con uno de texto', () => {
  const f = extraerFormularioAuto({
    risk: { circulationAddress: { town: { id: 41091 } }, garageType: { id: 3 } },
  })
  assert.equal(f.municipioId, 41091)
  assert.equal(f.garaje, '3')
})
