import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularEdicionRiesgo, claveDatosDeRamo, leerBloqueDeRamo, precargaDePoliza, ramoTarificable,
} from './datos-riesgo-ramo.ts'
import {
  CATALOGO_HOGAR_DE_CAMPO, aplicarEdicionVivienda, busquedaCatastroDeVivienda, datosViviendaDeCotizacion, datosViviendaVacios, faltanDatosVivienda,
  inicialesHogarDeRiesgo, leerDatosVivienda, precargaViviendaDePoliza, validarDatosViviendaRiesgo,
} from './datos-vivienda-riesgo.ts'
import {
  aplicarEdicionCapital, camposCapitalDelRamo, datosCapitalDeCotizacion, faltanDatosCapital, leerDatosCapital, textoAseguradosAdicionales,
  validarAseguradosAdicionales, validarDatosCapitalRiesgo,
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
  referenciaCatastral: '1234567VK4713C0001AA', propietarioEsTomador: true, provincia: 'Sevilla',
  cp: '41003', municipioId: 41091, tipoViaId: 'Calle', nombreVia: 'Socorro', numeroVia: '24', metrosCuadrados: 90, anioConstruccion: 1985,
  habitaciones: 3, tipoVivienda: 'MiddleFloor', uso: 'Owner', ocupacion: 'MainResidence', ubicacion: 'Urban', material: 'Brick',
  calidad: 'Normal', alarma: 'None', puertasSecundarias: 'None', asentamiento: 'Replacement', puertaPrincipalBlindada: false,
  ventanasSeguras: false, urbanizacionCerrada: false, capitalContinente: 100000,
}

test('vivienda: faltan = los obligatorios de revisarDatosHogar; null (sin ficha) es «falta todo»', () => {
  const todo = faltanDatosVivienda(null)
  for (const k of ['cp', 'municipioId', 'tipoViaId', 'nombreVia', 'numeroVia', 'metrosCuadrados', 'anioConstruccion', 'habitaciones',
    'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento',
    'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'capitalContinente',
    // 07/10/2026: lo que la pantalla de precio exige y antes no se decía (sin referencia no pasa del buscador).
    'referenciaCatastral', 'propietarioEsTomador']) assert.ok(todo.includes(k as never), k)
  assert.ok(!todo.includes('provincia' as never), 'la provincia solo prerrellena el buscador: no es obligatoria')
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
  assert.equal(a.resueltos.propietarioEsTomador, true, 'sí/no del propietario se siembra como resuelto (false también es un dato)')
  assert.equal(inicialesHogarDeRiesgo({ ...d, propietarioEsTomador: false }).resueltos.propietarioEsTomador, false)
  assert.equal(Object.hasOwn(inicialesHogarDeRiesgo({ ...d, propietarioEsTomador: null }).resueltos, 'propietarioEsTomador'), false, 'null no se siembra')
  assert.equal(Object.hasOwn(a.correcciones, 'provincia') || Object.hasOwn(a.resueltos, 'provincia'), false, 'la provincia solo es del buscador, no viaja a la cotización')
  assert.deepEqual(inicialesHogarDeRiesgo(null), { resueltos: {}, correcciones: {} })
})

test('buscador del Catastro: tipo de vía + calle + número + municipio/provincia del riesgo; sin inventar', () => {
  const v = (x: object) => x as never
  assert.deepEqual(
    busquedaCatastroDeVivienda(v({ tipoViaId: '7', nombreVia: 'Socorro', numeroVia: '24', municipio: 'Sevilla', provincia: 'Sevilla', direccion: 'otra' }), 'Calle'),
    { direccion: 'Calle Socorro 24', municipio: 'Sevilla', provincia: 'Sevilla' }, 'la calle estructurada manda sobre el texto libre')
  assert.equal(busquedaCatastroDeVivienda(v({ tipoViaId: 'Calle', nombreVia: 'San  Vicente', numeroVia: '40' })).direccion, 'Calle San Vicente 40', 'un id que ya es una palabra vale')
  assert.equal(busquedaCatastroDeVivienda(v({ tipoViaId: '7', nombreVia: 'Socorro', numeroVia: '24' })).direccion, 'Socorro 24', 'un código numérico no es un tipo de vía')
  assert.equal(busquedaCatastroDeVivienda(v({ nombreVia: 'Socorro', direccion: 'Calle Socorro 24, 2º' })).direccion, 'Calle Socorro 24, 2º', 'sin número no hay calle completa: manda lo escrito')
  assert.deepEqual(busquedaCatastroDeVivienda(v({ direccion: 'Calle A 1' })), { direccion: 'Calle A 1', municipio: null, provincia: null }, 'sin municipio: null, nunca «Sevilla»')
  assert.deepEqual(busquedaCatastroDeVivienda(null), { direccion: null, municipio: null, provincia: null })
  assert.equal(busquedaCatastroDeVivienda(v({ nombreVia: 'Socorro' })).direccion, 'Socorro', 'solo calle: se enseña para completarla')
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
  assert.ok(validarDatosCapitalRiesgo({ capital: '120.000', profesion: '2612', fumador: false }, { hoy: HOY, ramo: 'vida' }).ok)
  assert.equal(validarDatosCapitalRiesgo({ capital: 1, duracionAnios: 20 }, { hoy: HOY, ramo: 'vida' }).ok, false, 'la duración se quitó de vida (03/10/2026): ya no se acepta')
  assert.ok(validarDatosCapitalRiesgo({ duracionAnios: null }, { hoy: HOY, ramo: 'vida' }).ok, 'borrar una heredada sí se admite')
  assert.deepEqual(camposCapitalDelRamo('vida'), ['capital', 'profesion', 'fumador'])
  assert.equal(validarDatosCapitalRiesgo({ duracionAnios: 20 }, { hoy: HOY, ramo: 'salud' }).ok, false, 'la duración no existe en salud')
  assert.equal(validarDatosCapitalRiesgo({ duracionAnios: 0 }, { hoy: HOY }).ok, false)
  // Profesión: 4 cifras (CNO-11 nivel 4); fumador: sí/no/null. Ni la profesión ni el fumador existen en salud/decesos.
  const err = (p: unknown, ramo: 'vida' | 'salud' | 'decesos') => { const x = validarDatosCapitalRiesgo(p, { hoy: HOY, ramo }); return x.ok ? [] : x.errores.map((e) => e.campo) }
  assert.deepEqual(err({ profesion: '261' }, 'vida'), ['profesion'])
  assert.deepEqual(err({ profesion: '26123' }, 'vida'), ['profesion'])
  assert.deepEqual(err({ profesion: 'abcd' }, 'vida'), ['profesion'])
  assert.deepEqual(err({ fumador: 'no' }, 'vida'), ['fumador'])
  assert.deepEqual(err({ profesion: '2612' }, 'salud'), ['profesion'])
  assert.deepEqual(err({ fumador: true }, 'decesos'), ['fumador'])
  const ok = validarDatosCapitalRiesgo({ profesion: ' 2612 ', fumador: false }, { hoy: HOY, ramo: 'vida' })
  assert.ok(ok.ok && ok.valor.profesion === '2612' && ok.valor.fumador === false, 'fumar «no» es un dato, no un vacío')
  assert.ok(validarDatosCapitalRiesgo({ profesion: null, fumador: null }, { hoy: HOY, ramo: 'vida' }).ok, 'null borra')
})

test('capital: fusión sin pisar claves viejas, sello y discriminante', () => {
  const info = { origen: 'x', presupuestoCodeoscopic: '41999' }
  const r = calcularEdicionRiesgo({ ramo: 'vida', clave: 'datosCapital', info, parcial: { capital: 150000, profesion: '2612', fumador: false }, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok)
  assert.equal(r.infoNueva.origen, 'x')
  assert.equal(r.infoNueva.presupuestoCodeoscopic, '41999')
  assert.equal((r.datos as { confirmadoAt: string }).confirmadoAt, AHORA)
  const luego = leerDatosCapital(r.infoNueva.datosCapital)
  assert.deepEqual(luego && [luego.capital, luego.profesion, luego.fumador, luego.modalidadDeseada, luego.asegurados], [150000, '2612', false, null, null])
  const edit = aplicarEdicionCapital(luego, { capital: 200000 }, { confirmar: false, ahora: AHORA })
  assert.equal(edit.datos.confirmadoAt, null)
  assert.equal(calcularEdicionRiesgo({ ramo: 'salud', clave: 'datosCapital', info: {}, parcial: {}, confirmar: true, ahora: AHORA }).ok, false, 'sin datos no se confirma')
})

test('write-back de capital: solo lo declarado y de ese ramo', () => {
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { estadoCivilId: '1', capital: 100000, duracionAnios: 15, profesion: '2612', fumador: false } }, 'vida', { hoy: HOY }), { capital: 100000, profesion: '2612', fumador: false }, 'la duración ya no se anota; fumador=false sí es un dato')
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 100000, profesion: '26', fumador: true } }, 'vida', { hoy: HOY }), { capital: 100000, fumador: true }, 'una profesión inválida se descarta, el resto se conserva')
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 5000, modalidadDeseada: 'Copago' } }, 'salud', { hoy: HOY }), { capital: 5000, modalidadDeseada: 'Copago' })
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 5000, duracionAnios: 9 } }, 'decesos', { hoy: HOY }), { capital: 5000 })
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: '' } }, 'vida', { hoy: HOY }), {})
  assert.deepEqual(datosCapitalDeCotizacion(null, 'vida'), {})
})

// ─── Asegurados adicionales (salud y decesos, 07/10/2026) ───────────────────
const ana = { nombre: 'Ana', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '1990-05-17', sexo: 'mujer' }
const anaConDni = { ...ana, dni: '12345678Z', nacionalidad: 'ESP' }

test('asegurados: validación fila a fila, NUNCA se guarda un DNI, [] ≠ null', () => {
  const v = validarAseguradosAdicionales([anaConDni], { hoy: HOY })
  assert.ok(v.ok && v.valor?.length === 1)
  assert.deepEqual(v.ok && v.valor?.[0], ana, 'el DNI y la nacionalidad que vengan se ignoran: en info_riesgo no se escribe ningún documento')
  assert.equal(JSON.stringify(v).includes('12345678'), false)
  const motivo = (l: unknown) => { const x = validarAseguradosAdicionales(l, { hoy: HOY }); return x.ok ? null : x.errores.map((e) => e.motivo).join(' ') }
  assert.match(motivo([{ ...ana, nombre: '' }]) ?? '', /Asegurado 1: falta el nombre/)
  assert.match(motivo([{ ...ana, apellido1: null }]) ?? '', /primer apellido/)
  assert.match(motivo([ana, { ...ana, fechaNacimiento: '2999-01-01' }]) ?? '', /Asegurado 2: .*no futura/)
  assert.match(motivo([{ ...ana, fechaNacimiento: '1990-02-31' }]) ?? '', /real/)
  assert.match(motivo([{ ...ana, sexo: '' }]) ?? '', /hombre o mujer/)
  assert.match(motivo({}) ?? '', /lista/)
  assert.match(motivo(Array.from({ length: 11 }, () => ana)) ?? '', /como mucho 10/)
  const vacia = validarAseguradosAdicionales([], { hoy: HOY })
  assert.ok(vacia.ok && Array.isArray(vacia.valor) && vacia.valor.length === 0, '[] = revisado, ninguno')
  const borrar = validarAseguradosAdicionales(null, { hoy: HOY })
  assert.ok(borrar.ok && borrar.valor === null, 'null = sin mirar')
  assert.equal(textoAseguradosAdicionales([]), 'ninguno')
})

test('asegurados: se guardan por ramo (no en vida), se anotan de la cotización y se leen sin fiarse', () => {
  const salud = calcularEdicionRiesgo({ ramo: 'salud', clave: 'datosCapital', info: {}, parcial: { asegurados: [ana] }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(salud.ok && salud.cambios.some((c) => c.campo === 'asegurados' && c.despues === 'Ana Pérez (1990-05-17)'))
  const luego = leerDatosCapital(salud.ok ? salud.infoNueva.datosCapital : null)
  assert.equal(luego?.asegurados?.length, 1)
  assert.equal(Object.hasOwn(luego?.asegurados?.[0] ?? {}, 'dni'), false)
  const vida = calcularEdicionRiesgo({ ramo: 'vida', clave: 'datosCapital', info: {}, parcial: { asegurados: [ana] }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.equal(vida.ok, false, 'una vida no tiene asegurados adicionales')
  // Sin cambios no se reescribe; quitar todos los asegurados («[]») sí es un cambio y borra el sello.
  const sellado = { ...luego!, confirmadoAt: '2026-10-01T10:00:00.000Z' }
  const igual = calcularEdicionRiesgo({ ramo: 'salud', clave: 'datosCapital', info: { datosCapital: sellado }, parcial: { asegurados: luego!.asegurados }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(igual.ok && !igual.hayQueEscribir && igual.datos.confirmadoAt === '2026-10-01T10:00:00.000Z')
  const quitar = calcularEdicionRiesgo({ ramo: 'salud', clave: 'datosCapital', info: { datosCapital: sellado }, parcial: { asegurados: [] }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(quitar.ok && quitar.hayQueEscribir && quitar.datos.confirmadoAt === null)
  // Write-back: solo con filas; [] (la cotización no llevaba asegurados) no borra ni afirma «ninguno».
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { asegurados: [anaConDni] } }, 'decesos', { hoy: HOY }), { asegurados: [ana] }, 'la cotización manda el DNI al vendor; al riesgo no se anota')
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { asegurados: [] } }, 'salud', { hoy: HOY }), {})
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { capital: 5, asegurados: [{ ...ana, sexo: '' }] } }, 'salud', { hoy: HOY }), { capital: 5 }, 'un asegurado inválido se descarta sin tirar el resto')
  assert.deepEqual(datosCapitalDeCotizacion({ resueltos: { asegurados: [ana] } }, 'vida', { hoy: HOY }), {}, 'en vida no se anota')
  // Lectura: una fila a medias no se inventa.
  assert.deepEqual(leerDatosCapital({ asegurados: [{ nombre: 'Luis' }, ana] })?.asegurados?.map((a) => a.nombre), ['Ana'])
  assert.equal(leerDatosCapital({ asegurados: 'x' })?.asegurados, null)
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
