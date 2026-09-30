import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularEdicionRiesgo, claveDatosDeRamo, leerBloqueDeRamo, precargaDePoliza, ramoTarificable,
} from './datos-riesgo-ramo.ts'
import {
  CATALOGO_HOGAR_DE_CAMPO, aplicarEdicionVivienda, datosViviendaDeCotizacion, datosViviendaVacios, faltanDatosVivienda,
  inicialesHogarDeRiesgo, leerDatosVivienda, precargaViviendaDePoliza, validarDatosViviendaRiesgo,
} from './datos-vivienda-riesgo.ts'
import {
  aplicarEdicionCapital, datosCapitalDeCotizacion, faltanDatosCapital, leerDatosCapital, validarDatosCapitalRiesgo,
} from './datos-capital-riesgo.ts'
import { aplicarEdicionLibre, faltanDatosRiesgoLibre, validarDatosRiesgoLibre } from './datos-riesgo-libre.ts'
import { numeroDesdeTexto, soloLoQueCambia } from './datos-riesgo-generico.ts'

const HOY = '2026-09-30'
const AHORA = '2026-09-30T10:00:00.000Z'

// ─── Ramo → clave ────────────────────────────────────────────────────────────
test('cada ramo tiene su clave y los libres se cotizan fuera', () => {
  assert.equal(claveDatosDeRamo('auto'), 'datosVehiculo')
  assert.equal(claveDatosDeRamo('moto'), 'datosVehiculo')
  assert.equal(claveDatosDeRamo('hogar'), 'datosVivienda')
  for (const r of ['vida', 'salud', 'decesos']) assert.equal(claveDatosDeRamo(r), 'datosCapital', r)
  assert.equal(claveDatosDeRamo('comercio'), 'datosComercio', 'el comercio tiene bloque propio')
  for (const r of ['responsabilidad_civil', 'comunidades', 'otros', 'accidentes', 'cualquier-cosa']) assert.equal(claveDatosDeRamo(r), 'datosRiesgoLibre', r)
  assert.equal(ramoTarificable('hogar'), true)
  assert.equal(ramoTarificable('comercio'), false, 'clave propia no es tarifa: el comercio se cotiza fuera')
  assert.equal(ramoTarificable('otros'), false)
})

// ─── Vivienda ────────────────────────────────────────────────────────────────
const viviendaCompleta = {
  cp: '41003', municipioId: 41091, tipoViaId: 'Calle', nombreVia: 'Socorro', numeroVia: '24', metrosCuadrados: 90, anioConstruccion: 1985,
  habitaciones: 3, tipoVivienda: 'MiddleFloor', uso: 'Owner', ocupacion: 'MainResidence', ubicacion: 'Urban', material: 'Brick',
  calidad: 'Normal', alarma: 'None', puertasSecundarias: 'None', asentamiento: 'Replacement', puertaPrincipalBlindada: false,
  ventanasSeguras: false, urbanizacionCerrada: false, capitalContinente: 100000,
}

test('vivienda: faltan = los obligatorios de revisarDatosHogar; null (sin ficha) es «falta todo»', () => {
  const todo = faltanDatosVivienda(null)
  for (const k of ['cp', 'municipioId', 'tipoViaId', 'nombreVia', 'numeroVia', 'metrosCuadrados', 'anioConstruccion', 'habitaciones',
    'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento',
    'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'capitalContinente']) assert.ok(todo.includes(k as never), k)
  const v = validarDatosViviendaRiesgo(viviendaCompleta, { hoy: HOY })
  assert.ok(v.ok)
  const { datos } = aplicarEdicionVivienda(null, v.valor, { confirmar: false, ahora: AHORA })
  assert.deepEqual(faltanDatosVivienda(datos), [])
})

test('vivienda: capital 0 en los dos no basta; contenido solo (inquilino) sí; false es un dato, null no', () => {
  const base = aplicarEdicionVivienda(null, { ...viviendaCompleta, capitalContinente: 0 } as never, { confirmar: false, ahora: AHORA }).datos
  assert.deepEqual(faltanDatosVivienda(base), ['capitalContinente'])
  assert.deepEqual(faltanDatosVivienda({ ...base, capitalContenido: 20000 }), [])
  assert.ok(faltanDatosVivienda({ ...base, capitalContinente: 5, ventanasSeguras: null }).includes('ventanasSeguras'))
  assert.ok(!faltanDatosVivienda({ ...base, capitalContinente: 5, ventanasSeguras: false }).includes('ventanasSeguras'))
})

test('vivienda: validación (referencia de 20, año, m², reforma) y null ≠ 0', () => {
  const err = (p: unknown) => { const v = validarDatosViviendaRiesgo(p, { hoy: HOY }); assert.equal(v.ok, false); return v.ok ? [] : v.errores.map((e) => e.campo) }
  assert.deepEqual(err({ referenciaCatastral: '1234567VK4713C' }), ['referenciaCatastral'])
  assert.deepEqual(err({ anioConstruccion: 1400 }), ['anioConstruccion'])
  assert.deepEqual(err({ anioConstruccion: 2028 }), ['anioConstruccion'])
  assert.deepEqual(err({ metrosCuadrados: 0 }), ['metrosCuadrados'])
  assert.deepEqual(err({ habitaciones: 0 }), ['habitaciones'])
  assert.deepEqual(err({ cp: '4100' }), ['cp'])
  assert.deepEqual(err({ ventanasSeguras: 'sí' }), ['ventanasSeguras'])
  const v = validarDatosViviendaRiesgo({ referenciaCatastral: ' 1234567 vk4713c 0001 aa ', joyasEnCajaFuerte: 0, metrosCuadrados: '90,5', capitalContinente: '150.000', vigilante: null, planta: '' }, { hoy: HOY })
  assert.ok(v.ok)
  assert.equal(v.valor.referenciaCatastral, '1234567VK4713C0001AA')
  assert.equal(v.valor.joyasEnCajaFuerte, 0, '0 es un dato')
  assert.equal(v.valor.metrosCuadrados, 90.5)
  assert.equal(v.valor.capitalContinente, 150000)
  assert.equal(v.valor.vigilante, null)
  assert.equal(v.valor.planta, null, 'vacío = null, nunca cadena vacía')
  assert.equal(Object.hasOwn(v.valor, 'nombreVia'), false, 'clave ausente = no se toca')
  assert.ok(!('confirmadoAt' in (validarDatosViviendaRiesgo({ confirmadoAt: '2026-01-01T00:00:00Z' }, { hoy: HOY }) as { valor: object }).valor), 'el sello no se escribe desde fuera')
})

test('vivienda: la reforma no es anterior a la construcción (contando lo guardado)', () => {
  const r = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: { datosVivienda: { anioConstruccion: 1990 } }, parcial: { anioUltimaReforma: 1980 }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.equal(r.ok, false)
})

test('vivienda: editar borra el sello, confirmar lo pone, sin cambios no lo toca; sin datos no se confirma', () => {
  const sellada = { ...datosViviendaVacios(), nombreVia: 'Socorro', confirmadoAt: '2026-09-29T10:00:00.000Z' }
  const a = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: { datosVivienda: sellada }, parcial: { numeroVia: '24' }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(a.ok && a.datos.confirmadoAt === null && a.cambios.length === 1)
  const b = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: { datosVivienda: sellada }, parcial: { nombreVia: 'Socorro' }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(b.ok && b.datos.confirmadoAt === '2026-09-29T10:00:00.000Z' && !b.hayQueEscribir)
  const c = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: { datosVivienda: sellada }, parcial: {}, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.ok(c.ok && c.datos.confirmadoAt === AHORA && c.hayQueEscribir)
  const d = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: {}, parcial: {}, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.equal(d.ok, false)
})

test('CEPO fusión: la clave nueva se pone y NO se pisa ninguna vieja (ni las de otros ramos)', () => {
  const info = { origen: 'poliza:riesgo', presupuestoCodeoscopic: '41999', vehiculo: 'SEAT Ibiza', matricula: '1234BCD', ofertas: [{ a: 1 }] }
  const r = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info, parcial: { nombreVia: 'Socorro' }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok)
  for (const [k, v] of Object.entries(info)) assert.deepEqual(r.infoNueva[k], v, k)
  assert.ok(r.infoNueva.datosVivienda)
  assert.deepEqual(Object.keys(info).length, 5, 'no muta la entrada')
  assert.equal('datosVivienda' in info, false)
  const v = calcularEdicionRiesgo({ ramo: 'auto', clave: 'datosVehiculo', info, parcial: { kmAnuales: 9000 }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(v.ok)
  for (const [k, val] of Object.entries(info)) assert.deepEqual(v.infoNueva[k], val, k)
})

test('discriminante: la clave tiene que ser la del ramo (400), en los cuatro sentidos', () => {
  const p = { x: 1 }
  for (const [ramo, clave] of [['hogar', 'datosVehiculo'], ['auto', 'datosVivienda'], ['vida', 'datosVivienda'], ['comercio', 'datosCapital'], ['comercio', 'datosRiesgoLibre'], ['otros', 'datosComercio'], ['hogar', 'datosRiesgoLibre'], ['moto', 'datosCapital']] as const) {
    const r = calcularEdicionRiesgo({ ramo, clave, info: {}, parcial: p, confirmar: false, ahora: AHORA })
    assert.equal(r.ok, false, `${ramo}/${clave}`)
    assert.ok(!r.ok && r.status === 400)
  }
})

test('precarga de póliza: solo lo que hay, sin cifrado ni valores de cajón; nunca confirmada', () => {
  const v = precargaViviendaDePoliza({ direccion: 'Calle Socorro 24', localidad: 'Sevilla', cp: '41003', metrosCuadrados: 290, anioConstruccion: 0, anioConstruccionCima: 1950 })
  assert.deepEqual(v, { direccion: 'Calle Socorro 24', municipio: 'Sevilla', cp: '41003', metrosCuadrados: 290 })
  assert.deepEqual(precargaViviendaDePoliza({ direccion: 'v1:abc:def:ghi', cp: 'N/A' }), {})
  assert.deepEqual(precargaViviendaDePoliza(null), {})
  const bloque = leerBloqueDeRamo('hogar', {}, v)
  assert.equal(bloque.dePoliza, true)
  assert.equal(bloque.datos.confirmadoAt, null)
  assert.equal(bloque.datos.anioConstruccion, null, 'sin dato = null, no 0')
  assert.equal(precargaDePoliza('vida', { capital: 5 }), null)
  assert.ok(precargaDePoliza('hogar', { cp: '41003' }))
  const libre = precargaDePoliza('otros', { direccion: 'Calle A 1' }, { titulo: 'Bar', detalle: 'Hostelería' })
  assert.deepEqual(libre?.valor, { descripcion: 'Bar · Hostelería', direccion: 'Calle A 1' })
  assert.equal(precargaDePoliza('comercio', { direccion: 'Calle A 1' })?.clave, 'datosComercio')
})

test('editar con precarga: el resto de lo que se veía no desaparece, y solo se anota lo tocado', () => {
  const precarga = { direccion: 'Calle Socorro 24', cp: '41003' }
  const r = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: {}, parcial: { habitaciones: 3 }, confirmar: false, ahora: AHORA, hoy: HOY, precarga })
  assert.ok(r.ok)
  assert.equal(r.datos.direccion, 'Calle Socorro 24')
  assert.deepEqual(r.cambios.map((c) => c.campo), ['habitaciones'])
  // Lo estructurado manda sobre la precarga.
  const s = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info: { datosVivienda: { cp: '41001' } }, parcial: { habitaciones: 3 }, confirmar: false, ahora: AHORA, hoy: HOY, precarga })
  assert.ok(s.ok && s.datos.cp === '41001' && s.datos.direccion === null)
})

test('write-back de hogar: solo lo declarado; un catálogo SUPUESTO no consta; el Catastro rellena m²/año/CP', () => {
  const cuerpo = {
    referencia: '1234567VK4713C0001AA',
    resueltos: { tipoVivienda: 'MiddleFloor', uso: 'Owner', alarma: 'None', tipoViaId: 'Calle', supuestos: { uso: true, tipoVia: false } },
    correcciones: { habitaciones: 3, capitalContinente: 90000, joyasEnCajaFuerte: 0, metrosCuadrados: 88 },
  }
  const v = datosViviendaDeCotizacion(cuerpo, { metrosCuadrados: 90, anioConstruccion: 1985, codigoPostal: '41003' }, { hoy: HOY })
  assert.equal(v.referenciaCatastral, '1234567VK4713C0001AA')
  assert.equal(v.tipoVivienda, 'MiddleFloor')
  assert.equal(Object.hasOwn(v, 'uso'), false, 'el uso era un supuesto: no es un dato del cliente')
  assert.equal(v.metrosCuadrados, 88, 'lo tecleado manda sobre el Catastro')
  assert.equal(v.anioConstruccion, 1985)
  assert.equal(v.cp, '41003')
  assert.equal(v.joyasEnCajaFuerte, 0)
  assert.equal(Object.hasOwn(v, 'nombreVia'), false)
  assert.deepEqual(datosViviendaDeCotizacion({}, null, { hoy: HOY }), {})
  // un campo inválido se descarta sin tirar los demás
  const w = datosViviendaDeCotizacion({ correcciones: { habitaciones: 0, capitalContinente: 5 } }, null, { hoy: HOY })
  assert.deepEqual(w, { capitalContinente: 5 })
})

test('iniciales de hogar: catálogos a resueltos, resto a correcciones; el Catastro solo si no hay referencia o está confirmado', () => {
  const d = aplicarEdicionVivienda(null, { ...viviendaCompleta, referenciaCatastral: '1234567VK4713C0001AA', joyasEnCajaFuerte: 0 } as never, { confirmar: false, ahora: AHORA }).datos
  const a = inicialesHogarDeRiesgo(d)
  assert.equal(a.resueltos.tipoVivienda, 'MiddleFloor')
  assert.equal(a.resueltos.municipioId, 41091)
  assert.equal(a.correcciones.habitaciones, 3)
  assert.equal(a.correcciones.joyasEnCajaFuerte, 0)
  assert.equal(Object.hasOwn(a.correcciones, 'metrosCuadrados'), false, 'con referencia catastral manda el Catastro')
  assert.equal(Object.hasOwn(a.correcciones, 'vigilante'), false, 'null no se siembra')
  const b = inicialesHogarDeRiesgo({ ...d, confirmadoAt: AHORA })
  assert.equal(b.correcciones.metrosCuadrados, 90)
  const c = inicialesHogarDeRiesgo({ ...d, referenciaCatastral: null })
  assert.equal(c.correcciones.metrosCuadrados, 90)
  assert.deepEqual(inicialesHogarDeRiesgo(null), { resueltos: {}, correcciones: {} })
})

test('catálogos de hogar: nueve campos, uno por catálogo', () => {
  assert.equal(new Set(Object.values(CATALOGO_HOGAR_DE_CAMPO)).size, 9)
})

// ─── Capital ─────────────────────────────────────────────────────────────────
test('capital: en vida falta el capital; en salud y decesos no falta nada; null ≠ 0', () => {
  assert.deepEqual(faltanDatosCapital(null, 'vida'), ['capital'])
  assert.deepEqual(faltanDatosCapital({ capital: null }, 'vida'), ['capital'])
  assert.deepEqual(faltanDatosCapital({ capital: 100000 }, 'vida'), [])
  assert.deepEqual(faltanDatosCapital(null, 'salud'), [])
  assert.deepEqual(faltanDatosCapital(null, 'decesos'), [])
  const v = validarDatosCapitalRiesgo({ capital: 0 }, { hoy: HOY })
  assert.equal(v.ok, false, 'un capital de 0 no es un capital')
  assert.ok(validarDatosCapitalRiesgo({ capital: '120.000', duracionAnios: '20' }, { hoy: HOY, ramo: 'vida' }).ok)
  const salud = validarDatosCapitalRiesgo({ duracionAnios: 20 }, { hoy: HOY, ramo: 'salud' })
  assert.equal(salud.ok, false, 'la duración no existe en salud')
  assert.ok(validarDatosCapitalRiesgo({ duracionAnios: null }, { hoy: HOY, ramo: 'salud' }).ok, 'borrarla sí se admite')
  assert.equal(validarDatosCapitalRiesgo({ duracionAnios: 0 }, { hoy: HOY }).ok, false)
})

test('capital: fusión sin pisar claves viejas, sello y discriminante', () => {
  const info = { origen: 'x', presupuestoCodeoscopic: '41999' }
  const r = calcularEdicionRiesgo({ ramo: 'vida', clave: 'datosCapital', info, parcial: { capital: 150000, duracionAnios: 20 }, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok)
  assert.equal(r.infoNueva.origen, 'x')
  assert.equal(r.infoNueva.presupuestoCodeoscopic, '41999')
  assert.equal((r.datos as { confirmadoAt: string }).confirmadoAt, AHORA)
  const luego = leerDatosCapital(r.infoNueva.datosCapital)
  assert.deepEqual(luego && [luego.capital, luego.duracionAnios, luego.modalidadDeseada], [150000, 20, null])
  const edit = aplicarEdicionCapital(luego, { capital: 200000 }, { confirmar: false, ahora: AHORA })
  assert.equal(edit.datos.confirmadoAt, null)
  assert.equal(calcularEdicionRiesgo({ ramo: 'salud', clave: 'datosCapital', info: {}, parcial: {}, confirmar: true, ahora: AHORA }).ok, false, 'sin datos no se confirma')
})

test('write-back de capital: solo lo declarado y de ese ramo', () => {
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { estadoCivilId: '1', capital: 100000, duracionAnios: 15 } }, 'vida', { hoy: HOY }), { capital: 100000, duracionAnios: 15 })
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 5000, modalidadDeseada: 'Copago' } }, 'salud', { hoy: HOY }), { capital: 5000, modalidadDeseada: 'Copago' })
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 5000, duracionAnios: 9 } }, 'decesos', { hoy: HOY }), { capital: 5000 })
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: '' } }, 'vida', { hoy: HOY }), {})
  assert.deepEqual(datosCapitalDeCotizacion(null, 'vida'), {})
})

// ─── Libre ───────────────────────────────────────────────────────────────────
test('libre: sin «faltan» (no hay tarifa); confirmable solo con algo; 0 es dato', () => {
  assert.deepEqual(faltanDatosRiesgoLibre(), [])
  const v = validarDatosRiesgoLibre({ descripcion: 'Bar de Antonio', capital: 0, notas: '' }, { hoy: HOY })
  assert.ok(v.ok)
  assert.equal(v.valor.capital, 0)
  assert.equal(v.valor.notas, null)
  const r = calcularEdicionRiesgo({ ramo: 'comunidades', clave: 'datosRiesgoLibre', info: { otra: 1 }, parcial: { descripcion: 'Bar', capital: 50000 }, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok && r.faltan.length === 0 && r.infoNueva.otra === 1)
  assert.equal(calcularEdicionRiesgo({ ramo: 'otros', clave: 'datosRiesgoLibre', info: {}, parcial: {}, confirmar: true, ahora: AHORA }).ok, false)
  assert.equal(aplicarEdicionLibre(null, { descripcion: 'x' }, { confirmar: false, ahora: AHORA }).datos.confirmadoAt, null)
  assert.equal(validarDatosRiesgoLibre({ capital: -1 }, { hoy: HOY }).ok, false)
  assert.equal(validarDatosRiesgoLibre([], { hoy: HOY }).ok, false)
})

test('lectura: un tipo raro es «no se sabe», no un valor inventado', () => {
  const v = leerDatosVivienda({ cp: 41003, habitaciones: '3', vigilante: 'sí', metrosCuadrados: 90, confirmadoAt: 'ayer' })
  assert.ok(v)
  assert.deepEqual([v.cp, v.habitaciones, v.vigilante, v.metrosCuadrados, v.confirmadoAt], [null, null, null, 90, null])
  assert.equal(leerDatosVivienda([]), null)
})

test('numeroDesdeTexto y soloLoQueCambia', () => {
  assert.equal(numeroDesdeTexto('15.000'), 15000)
  assert.equal(numeroDesdeTexto('1.250,50'), 1250.5)
  assert.equal(numeroDesdeTexto('12,5'), 12.5)
  assert.ok(Number.isNaN(numeroDesdeTexto('abc')))
  assert.ok(Number.isNaN(numeroDesdeTexto('')))
  assert.deepEqual(soloLoQueCambia({ a: 'x', n: 12000, v: null }, { a: 'x', n: '12.000', v: '' }), {})
  assert.deepEqual(soloLoQueCambia({ a: 'x', v: null }, { a: 'y', v: 'z', nuevo: '' }), { a: 'y', v: 'z' })
  assert.deepEqual(soloLoQueCambia({ a: 'x' }, { a: '' }), { a: null }, 'borrar un dato sí es un cambio')
})
