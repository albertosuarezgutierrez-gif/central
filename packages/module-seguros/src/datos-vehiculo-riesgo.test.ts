import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarEdicionVehiculo,
  datosVehiculoDeCotizacion,
  datosVehiculoDeInfoRiesgo,
  datosVehiculoVacios,
  faltanDatosVehiculo,
  fusionarInfoRiesgo,
  incoherenciaFechasVehiculo,
  leerDatosVehiculo,
  motivoNoConfirmable,
  textoFaltanVehiculo,
  validarDatosVehiculoRiesgo,
} from './datos-vehiculo-riesgo.ts'

const HOY = '2026-09-30'
const ok = (p: unknown) => {
  const v = validarDatosVehiculoRiesgo(p, { hoy: HOY })
  assert.ok(v.ok, JSON.stringify(v))
  return v.valor
}
const errores = (p: unknown) => {
  const v = validarDatosVehiculoRiesgo(p, { hoy: HOY })
  assert.equal(v.ok, false)
  return v.ok ? [] : v.errores.map((e) => e.campo)
}

test('la matrícula se normaliza: mayúsculas, sin espacios ni guiones', () => {
  assert.equal(ok({ matricula: ' 1234-bcd ' }).matricula, '1234BCD')
  assert.equal(ok({ matricula: 'se 1234 ab' }).matricula, 'SE1234AB')
})

test('una matrícula basura se rechaza', () => {
  assert.deepEqual(errores({ matricula: 'AB' }), ['matricula'])
  assert.deepEqual(errores({ matricula: 'ABCDEF' }), ['matricula'])
  assert.deepEqual(errores({ matricula: 12345 }), ['matricula'])
})

test('solo salen las claves que vinieron; vacío = null (borrar), nunca cadena vacía ni 0', () => {
  const v = ok({ marca: '  ', kmAnuales: '', garaje: null })
  assert.deepEqual(v, { marca: null, kmAnuales: null, garaje: null })
  assert.equal('matricula' in v, false)
})

test('fechas: reales, aaaa-mm-dd y no futuras', () => {
  assert.equal(ok({ fechaMatriculacion: '2019-05-17' }).fechaMatriculacion, '2019-05-17')
  assert.deepEqual(errores({ fechaMatriculacion: '2027-01-01' }), ['fechaMatriculacion'])
  assert.deepEqual(errores({ fechaMatriculacion: '2019-02-30' }), ['fechaMatriculacion'])
  assert.deepEqual(errores({ fechaMatriculacion: '17/05/2019' }), ['fechaMatriculacion'])
  assert.deepEqual(errores({ fechaCompra: '1850-01-01' }), ['fechaCompra'])
})

test('la compra no es anterior a la matriculación (en la misma edición y contra lo guardado)', () => {
  assert.deepEqual(errores({ fechaMatriculacion: '2020-01-01', fechaCompra: '2019-01-01' }), ['fechaCompra'])
  const previo = { ...datosVehiculoVacios(), fechaMatriculacion: '2020-01-01' }
  const { datos } = aplicarEdicionVehiculo(previo, ok({ fechaCompra: '2019-01-01' }), { confirmar: false, ahora: 'x' })
  assert.match(incoherenciaFechasVehiculo(datos) ?? '', /anterior/)
})

test('km: entero positivo, acepta «15.000», rechaza 0, decimales y basura', () => {
  assert.equal(ok({ kmAnuales: '15.000' }).kmAnuales, 15000)
  assert.equal(ok({ kmAnuales: 12000 }).kmAnuales, 12000)
  for (const km of [0, -5, 1.5, '1.5', 'mucho', 1e9]) assert.deepEqual(errores({ kmAnuales: km }), ['kmAnuales'])
})

test('CP de 5 cifras y municipio id entero', () => {
  assert.equal(ok({ cpCirculacion: '41003' }).cpCirculacion, '41003')
  assert.deepEqual(errores({ cpCirculacion: '4100' }), ['cpCirculacion'])
  assert.equal(ok({ municipioCirculacionId: '5023' }).municipioCirculacionId, 5023)
  assert.deepEqual(errores({ municipioCirculacionId: 'Sevilla' }), ['municipioCirculacionId'])
})

test('confirmadoAt no se puede escribir desde fuera', () => {
  assert.equal('confirmadoAt' in ok({ confirmadoAt: '2026-01-01T00:00:00Z', marca: 'SEAT' }), false)
})

test('faltan: null (sin ficha) es «falta todo», nunca «nada falta»', () => {
  assert.deepEqual(faltanDatosVehiculo(null), ['matricula', 'codigoVehiculo', 'fechaMatriculacion', 'kmAnuales', 'garaje'])
  assert.deepEqual(faltanDatosVehiculo(datosVehiculoVacios()), ['matricula', 'codigoVehiculo', 'fechaMatriculacion', 'kmAnuales', 'garaje'])
})

test('faltan: 0 km es un dato de ajuste distinto de null; con todo, no falta nada', () => {
  const completo = { ...datosVehiculoVacios(), matricula: '1234BCD', codigoVehiculo: '123', fechaMatriculacion: '2019-05-17', kmAnuales: 10000, garaje: 'Garage' }
  assert.deepEqual(faltanDatosVehiculo(completo), [])
  assert.deepEqual(faltanDatosVehiculo({ ...completo, kmAnuales: null }), ['kmAnuales'])
  assert.equal(textoFaltanVehiculo([]), null)
  assert.match(textoFaltanVehiculo(['matricula', 'codigoVehiculo']) ?? '', /^Falta para pedir precio: matrícula, versión del catálogo\.$/)
})

test('fallback de lectura: claves antiguas, sin escribirlas ni darlas por confirmadas', () => {
  const d = datosVehiculoDeInfoRiesgo({ matricula: '1234 bcd', vehiculo: 'SEAT Ibiza 1.0' })
  assert.equal(d.matricula, '1234BCD')
  assert.equal(d.marca, 'SEAT Ibiza 1.0')
  assert.equal(d.modelo, null)
  assert.equal(d.confirmadoAt, null)
  const d2 = datosVehiculoDeInfoRiesgo({ marca: 'Yamaha', modelo: 'MT-07', vehiculo: 'ignorado' })
  assert.equal(d2.marca, 'Yamaha')
  assert.equal(d2.modelo, 'MT-07')
})

test('lo estructurado manda sobre las claves antiguas', () => {
  const d = datosVehiculoDeInfoRiesgo({ matricula: 'VIEJA1', datosVehiculo: { matricula: '1234BCD', marca: 'Kia', confirmadoAt: '2026-09-30T10:00:00Z' } })
  assert.equal(d.matricula, '1234BCD')
  assert.equal(d.marca, 'Kia')
  assert.equal(d.confirmadoAt, '2026-09-30T10:00:00Z')
})

test('leerDatosVehiculo no se fía: tipo raro = null, sello con formato raro = null', () => {
  const d = leerDatosVehiculo({ kmAnuales: '10000', matricula: 5, confirmadoAt: 'ayer' })
  assert.equal(d?.kmAnuales, null)
  assert.equal(d?.matricula, null)
  assert.equal(d?.confirmadoAt, null)
  assert.equal(leerDatosVehiculo('x'), null)
})

test('editar sin confirmar BORRA el sello; confirmar lo pone; sin cambios no lo toca', () => {
  const sellado = { ...datosVehiculoVacios(), matricula: '1234BCD', confirmadoAt: '2026-09-29T10:00:00Z' }
  const a = aplicarEdicionVehiculo(sellado, { marca: 'SEAT' }, { confirmar: false, ahora: '2026-09-30T09:00:00Z' })
  assert.equal(a.datos.confirmadoAt, null)
  assert.deepEqual(a.cambios, [{ campo: 'marca', antes: null, despues: 'SEAT' }])
  const b = aplicarEdicionVehiculo(a.datos, {}, { confirmar: true, ahora: '2026-09-30T09:05:00Z' })
  assert.equal(b.datos.confirmadoAt, '2026-09-30T09:05:00Z')
  assert.deepEqual(b.cambios, [])
  const c = aplicarEdicionVehiculo(sellado, { matricula: '1234BCD' }, { confirmar: false, ahora: '2026-09-30T09:00:00Z' })
  assert.equal(c.datos.confirmadoAt, '2026-09-29T10:00:00Z')
  assert.deepEqual(c.cambios, [])
})

test('editar y confirmar a la vez: cambia y sella', () => {
  const r = aplicarEdicionVehiculo(null, { matricula: '1234BCD', kmAnuales: 9000 }, { confirmar: true, ahora: 'T' })
  assert.equal(r.datos.confirmadoAt, 'T')
  assert.equal(r.cambios.length, 2)
})

test('borrar un dato deja null y cuenta como cambio', () => {
  const p = { ...datosVehiculoVacios(), garaje: 'Garage' }
  const r = aplicarEdicionVehiculo(p, { garaje: null }, { confirmar: false, ahora: 'T' })
  assert.equal(r.datos.garaje, null)
  assert.deepEqual(r.cambios, [{ campo: 'garaje', antes: 'Garage', despues: null }])
})

test('fusionar: conserva las claves ajenas y la `vehiculo` de texto tal cual, sin mutar la entrada', () => {
  const info = { origen: 'retencion', polizaId: 'abc', vehiculo: 'SEAT Ibiza 1.0', matricula: '1234BCD' }
  const copia = JSON.parse(JSON.stringify(info))
  const out = fusionarInfoRiesgo(info, { ...datosVehiculoVacios(), matricula: '1234BCD' })
  assert.equal(out.vehiculo, 'SEAT Ibiza 1.0')
  assert.equal(out.origen, 'retencion')
  assert.equal(out.polizaId, 'abc')
  assert.deepEqual(info, copia)
  assert.ok('datosVehiculo' in out)
  assert.deepEqual(fusionarInfoRiesgo(null, datosVehiculoVacios()), { datosVehiculo: datosVehiculoVacios() })
})

test('no se confirma un vehículo sin matrícula', () => {
  assert.ok(motivoNoConfirmable(datosVehiculoVacios()))
  assert.equal(motivoNoConfirmable({ ...datosVehiculoVacios(), matricula: '1234BCD' }), null)
})

test('write-back: solo claves con valor; garaje y km solo si están declarados', () => {
  const v = datosVehiculoDeCotizacion({
    resueltos: { matricula: '1234BCD', codigoVehiculo: '99', fechaMatriculacion: '2019-05-17', garaje: 'Garage', garajeEsSupuesto: true, vehiculoRiesgo: { marca: 'SEAT', modelo: 'Ibiza', marcaId: '7', garaje: null, kmAnuales: null } },
    correcciones: { kmAnuales: 10000, fechaCompra: '2019-06-01' },
  }, { hoy: HOY })
  assert.deepEqual(v, { matricula: '1234BCD', codigoVehiculo: '99', fechaMatriculacion: '2019-05-17', fechaCompra: '2019-06-01', marca: 'SEAT', modelo: 'Ibiza', marcaId: '7' })
  assert.equal('garaje' in v, false)
  assert.equal('kmAnuales' in v, false)
})

test('write-back: con km y garaje declarados van; un campo inválido se descarta sin tirar los demás', () => {
  const v = datosVehiculoDeCotizacion({
    resueltos: { matricula: '1234BCD', fechaMatriculacion: '2099-01-01', vehiculoRiesgo: { garaje: 'Calle', kmAnuales: 8000 } },
  }, { hoy: HOY })
  assert.deepEqual(v, { matricula: '1234BCD', garaje: 'Calle', kmAnuales: 8000 })
  assert.deepEqual(datosVehiculoDeCotizacion(null), {})
  assert.deepEqual(datosVehiculoDeCotizacion({ resueltos: { matricula: '' } }), {})
})

test('D1: cambia el código de versión SIN ids nuevos → ids y textos de catálogo viejos se anulan', () => {
  const previo = { ...datosVehiculoVacios(), codigoVehiculo: '111', marcaId: 'M1', modeloId: 'MO1', motorId: 'MT1', marca: 'SEAT', modelo: 'Ibiza', version: '1.0 TSI', matricula: '1234BCD' }
  const r = aplicarEdicionVehiculo(previo, { codigoVehiculo: '222' }, { confirmar: false, ahora: 'T' })
  assert.equal(r.datos.codigoVehiculo, '222')
  for (const k of ['marcaId', 'modeloId', 'motorId', 'marca', 'modelo', 'version'] as const) assert.equal(r.datos[k], null, k)
  assert.equal(r.datos.matricula, '1234BCD', 'lo que no es de catálogo no se toca')
  assert.ok(r.cambios.some((c) => c.campo === 'marcaId' && c.antes === 'M1' && c.despues === null), 'el cambio queda anotado para el historial')
})

test('D1: cambia el código CON ids y textos nuevos → se ponen los nuevos', () => {
  const previo = { ...datosVehiculoVacios(), codigoVehiculo: '111', marcaId: 'M1', marca: 'SEAT' }
  const r = aplicarEdicionVehiculo(previo, { codigoVehiculo: '222', marcaId: 'M2', modeloId: 'MO2', motorId: 'MT2', marca: 'FORD', modelo: 'Fiesta', version: '1.1' }, { confirmar: false, ahora: 'T' })
  assert.deepEqual([r.datos.marcaId, r.datos.marca, r.datos.modelo, r.datos.version], ['M2', 'FORD', 'Fiesta', '1.1'])
})

test('D1: el mismo código de siempre no borra nada', () => {
  const previo = { ...datosVehiculoVacios(), codigoVehiculo: '111', marcaId: 'M1', marca: 'SEAT' }
  const r = aplicarEdicionVehiculo(previo, { codigoVehiculo: '111', kmAnuales: 9000 }, { confirmar: false, ahora: 'T' })
  assert.equal(r.datos.marcaId, 'M1')
  assert.equal(r.datos.marca, 'SEAT')
})

test('D2: teclear a mano marca/modelo/versión sin código nuevo → se borran el código y los ids del catálogo', () => {
  const previo = { ...datosVehiculoVacios(), codigoVehiculo: '111', marcaId: 'M1', modeloId: 'MO1', motorId: 'MT1', marca: 'SEAT', modelo: 'Ibiza' }
  const r = aplicarEdicionVehiculo(previo, { modelo: 'Leon' }, { confirmar: false, ahora: 'T' })
  assert.equal(r.datos.modelo, 'Leon')
  for (const k of ['codigoVehiculo', 'marcaId', 'modeloId', 'motorId'] as const) assert.equal(r.datos[k], null, k)
  assert.equal(r.datos.marca, 'SEAT')
})

test('D2: repetir el mismo texto de marca/modelo no rompe el catálogo elegido', () => {
  const previo = { ...datosVehiculoVacios(), codigoVehiculo: '111', marcaId: 'M1', marca: 'SEAT', modelo: 'Ibiza' }
  const r = aplicarEdicionVehiculo(previo, { marca: 'SEAT', modelo: 'Ibiza' }, { confirmar: false, ahora: 'T' })
  assert.equal(r.datos.codigoVehiculo, '111')
  assert.equal(r.cambios.length, 0)
})
