// Enlace de datos, fase 2 (26/10/2026): los campos nuevos de cada bloque del riesgo y su validación.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAPEO_HISTORIAL_CODEOSCOPIC, CAMPOS_HISTORIAL_VEHICULO, historialParaCotizar, leerDatosVehiculo, validarDatosVehiculoRiesgo } from './datos-vehiculo-riesgo.ts'
import { camposLibreDelRamo, leerDatosRiesgoLibre, validarDatosRiesgoLibre } from './datos-riesgo-libre.ts'
import { edadesNormalizadas } from './datos-capital-riesgo.ts'
import { clavesBorrador, limpiarBorrador, ultimoPasoDe } from './solicitud-borrador.ts'
import { NADA_CONOCIDO, camposAPreguntar, camposSolicitud, validarRespuestas } from './solicitud-datos.ts'

const HOY = '2026-10-26'

test('vehículo: el seguro actual y el historial validan (vencimiento futuro sí; DGS con forma; años 0..70)', () => {
  const v = validarDatosVehiculoRiesgo({ aseguradoAntes: true, companiaAnterior: ' Mapfre ', companiaAnteriorCodigo: 'c0058', vencimientoAnterior: '2027-03-01', aniosSinSiniestros: '0' }, { hoy: HOY })
  assert.ok(v.ok)
  if (v.ok) assert.deepEqual(v.valor, { aseguradoAntes: true, companiaAnterior: 'Mapfre', companiaAnteriorCodigo: 'C0058', vencimientoAnterior: '2027-03-01', aniosSinSiniestros: 0 })
  const err = (p: unknown) => { const x = validarDatosVehiculoRiesgo(p, { hoy: HOY }); return x.ok ? [] : x.errores.map((e) => e.campo) }
  assert.deepEqual(err({ companiaAnteriorCodigo: 'Mapfre' }), ['companiaAnteriorCodigo'])
  assert.deepEqual(err({ vencimientoAnterior: '2027-02-30' }), ['vencimientoAnterior'])
  assert.deepEqual(err({ aniosSinSiniestros: 71 }), ['aniosSinSiniestros'])
  assert.deepEqual(err({ aseguradoAntes: 'si' }), ['aseguradoAntes'])
  // Lo guardado antes no los trae: `null`, no se sabe.
  const viejo = leerDatosVehiculo({ matricula: '1234BCD' })!
  for (const k of CAMPOS_HISTORIAL_VEHICULO) assert.equal(viejo[k], null, k)
})

test('vehículo → Codeoscopic: solo lo que se sabe, con los nombres de DatosAuto, y cada campo con su sitio declarado', () => {
  assert.deepEqual(historialParaCotizar(null), {})
  assert.deepEqual(historialParaCotizar({ aseguradoAntes: null, aniosSinSiniestros: 5 }), {}, 'sin «¿tiene seguro?» no se declara nada')
  assert.deepEqual(historialParaCotizar({ aseguradoAntes: false, aniosSinSiniestros: 5, companiaAnteriorCodigo: 'C0058' }), { aseguradoAntes: false })
  assert.deepEqual(historialParaCotizar({ aseguradoAntes: true, aniosSinSiniestros: 0, companiaAnteriorCodigo: 'C0058' }), { aseguradoAntes: true, companiaAnteriorCodigo: 'C0058', aniosSinSiniestros: 0 })
  for (const k of CAMPOS_HISTORIAL_VEHICULO) assert.ok(Object.hasOwn(MAPEO_HISTORIAL_CODEOSCOPIC, k), k)
})

test('libre: los campos de accidentes y mascotas solo en su ramo; especie cerrada; fecha del animal no futura', () => {
  assert.ok(camposLibreDelRamo('accidentes').includes('profesion'))
  assert.ok(!camposLibreDelRamo('responsabilidad_civil').includes('raza'))
  assert.equal(validarDatosRiesgoLibre({ raza: 'Labrador' }, { hoy: HOY, ramo: 'responsabilidad_civil' }).ok, false, 'la raza de un RC no se guarda')
  assert.ok(validarDatosRiesgoLibre({ raza: 'Labrador', especie: 'perro', ppp: false, fechaNacimientoAnimal: '2020-04-01' }, { hoy: HOY, ramo: 'mascotas' }).ok)
  assert.equal(validarDatosRiesgoLibre({ especie: 'dragon' }, { hoy: HOY, ramo: 'mascotas' }).ok, false)
  assert.equal(validarDatosRiesgoLibre({ fechaNacimientoAnimal: '2030-01-01' }, { hoy: HOY, ramo: 'mascotas' }).ok, false)
  assert.equal(leerDatosRiesgoLibre({ fechaNacimientoAnimal: 'ayer' })!.fechaNacimientoAnimal, null)
})

test('edades: «45, 43 y 12» → «45, 43, 12»; lo que no son edades, null', () => {
  assert.equal(edadesNormalizadas('45, 43 y 12'), '45, 43, 12')
  assert.equal(edadesNormalizadas('45 43'), '45, 43')
  assert.equal(edadesNormalizadas('cuarenta'), null)
  assert.equal(edadesNormalizadas('130'), null)
  assert.equal(edadesNormalizadas(Array(12).fill('30').join(',')), null, 'más de 11 personas no cabe (tomador + 10)')
})

test('formulario: el buscador del catálogo es una ayuda (sin «No lo sé», fuera de «a preguntar», en el borrador por subclaves)', () => {
  const campos = camposSolicitud('auto', NADA_CONOCIDO)
  const c = campos.find((x) => x.clave === 'versionCatalogo')!
  assert.equal(c.admiteNoLoSe, false)
  assert.equal(c.obligatorio, false)
  assert.ok(!camposAPreguntar(campos, {}).sinContestar.includes(c.etiqueta))
  assert.ok(clavesBorrador(campos).has('versionCatalogoCodigo'))
  const b = limpiarBorrador(campos, { versionCatalogoMarcaId: '7', otra: 'x' })
  assert.deepEqual(b, { versionCatalogoMarcaId: '7' })
  assert.match(ultimoPasoDe(campos, b!) ?? '', /pregunta/)
  // Edades: se validan al enviar.
  const salud = camposSolicitud('salud', NADA_CONOCIDO).filter((x) => x.clave === 'edades')
  const mal = validarRespuestas(salud, { edades: 'muchas' })
  assert.equal(mal.ok, false)
  const bien = validarRespuestas(salud, { edades: '45 y 12' })
  assert.ok(bien.ok && bien.respuestas.edades === '45, 12')
})
