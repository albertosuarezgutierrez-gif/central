import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESPEC_COMERCIO, aplicarEdicionComercio, faltanDatosComercio, leerDatosComercio, motivoNoConfirmableComercio,
  precargaComercioDePoliza, textoFaltanComercio, validarDatosComercioRiesgo,
} from './datos-comercio-riesgo.ts'
import { calcularEdicionRiesgo, fusionarInfoRiesgoClave, leerBloqueDeRamo } from './datos-riesgo-ramo.ts'

const HOY = '2026-09-30'
const AHORA = '2026-09-30T10:00:00.000Z'
const OP = { confirmar: false, ahora: AHORA }

const completo = {
  actividad: 'Bar con cocina', direccion: 'Calle Socorro 24', cp: '41003', localidad: 'Sevilla', provincia: 'Sevilla',
  metrosCuadrados: 85, regimenLocal: 'inquilino', capitales: [{ bien: 'CONTENIDO', importe: 20000 }],
}
const ok = (p: unknown) => { const v = validarDatosComercioRiesgo(p, { hoy: HOY }); assert.ok(v.ok, JSON.stringify(v)); return v.valor }
const errores = (p: unknown) => { const v = validarDatosComercioRiesgo(p, { hoy: HOY }); assert.equal(v.ok, false); return v.ok ? [] : v.errores.map((e) => e.campo) }

test('la especificación escalar es EXACTAMENTE la de CIMA + regimenLocal (nada de cocina, aforo ni empleados)', () => {
  assert.deepEqual(ESPEC_COMERCIO.map((c) => c.clave), [
    'actividad', 'direccion', 'otrosDatosVia', 'cp', 'localidad', 'provincia', 'metrosCuadrados', 'superficieTotal', 'anioConstruccion', 'zona', 'regimenLocal',
  ])
  const v = ok({ actividad: 'Bar', aforo: 40, empleados: 3, cocina: true })
  assert.deepEqual(v, { actividad: 'Bar' }, 'lo que no es del bloque no se cuela al JSON guardado')
})

test('faltan para tarificar: actividad, situación, superficie, régimen y al menos un capital (>0); sin ficha = falta todo', () => {
  assert.deepEqual(faltanDatosComercio(null), ['actividad', 'situacion', 'superficie', 'regimenLocal', 'capitales'])
  const d = aplicarEdicionComercio(null, ok(completo), OP).datos
  assert.deepEqual(faltanDatosComercio(d), [])
  assert.deepEqual(faltanDatosComercio({ ...d, direccion: null }), ['situacion'])
  assert.deepEqual(faltanDatosComercio({ ...d, cp: null }), ['situacion'])
  assert.deepEqual(faltanDatosComercio({ ...d, localidad: null }), ['situacion'])
  assert.deepEqual(faltanDatosComercio({ ...d, metrosCuadrados: null }), ['superficie'])
  assert.deepEqual(faltanDatosComercio({ ...d, regimenLocal: null }), ['regimenLocal'])
  assert.deepEqual(faltanDatosComercio({ ...d, capitales: null }), ['capitales'], 'sin mirar no es un capital')
  assert.deepEqual(faltanDatosComercio({ ...d, capitales: [] }), ['capitales'], 'revisado y vacío tampoco')
  assert.deepEqual(faltanDatosComercio({ ...d, capitales: [{ bien: 'CONTENIDO', importe: 0, modalidad: null, descripcion: null }] }), ['capitales'], 'un capital de 0 no basta')
  assert.match(textoFaltanComercio(['superficie', 'capitales']) ?? '', /^Falta para tarificar: la superficie construida, al menos un capital/)
  assert.equal(textoFaltanComercio([]), null)
})

test('validación escalar: CP de 5 cifras, m² > 0, año razonable, régimen cerrado; vacío = borrar', () => {
  assert.deepEqual(errores({ cp: '4100' }), ['cp'])
  assert.deepEqual(errores({ metrosCuadrados: 0 }), ['metrosCuadrados'])
  assert.deepEqual(errores({ superficieTotal: -5 }), ['superficieTotal'])
  assert.deepEqual(errores({ anioConstruccion: 1400 }), ['anioConstruccion'])
  assert.deepEqual(errores({ regimenLocal: 'okupa' }), ['regimenLocal'])
  assert.deepEqual(errores([]), [ESPEC_COMERCIO[0].clave], 'no es un objeto')
  assert.deepEqual(ok({ metrosCuadrados: '85,5', regimenLocal: 'propietario', zona: '' }), { metrosCuadrados: 85.5, regimenLocal: 'propietario', zona: null })
  assert.deepEqual(ok({ regimenLocal: null, actividad: '   ' }), { regimenLocal: null, actividad: null })
})

test('capitales: bien cerrado, importe obligatorio (0 es un dato), OTROS exige descripción, importes en español', () => {
  assert.deepEqual(errores({ capitales: [{ bien: 'CASA', importe: 5 }] }), ['capitales'])
  assert.deepEqual(errores({ capitales: [{ bien: 'CONTENIDO' }] }), ['capitales'], 'sin importe no hay capital')
  assert.deepEqual(errores({ capitales: [{ bien: 'CONTENIDO', importe: '' }] }), ['capitales'])
  assert.deepEqual(errores({ capitales: [{ bien: 'CONTENIDO', importe: -1 }] }), ['capitales'])
  assert.deepEqual(errores({ capitales: [{ bien: 'OTROS', importe: 100 }] }), ['capitales'], 'OTROS sin descripción')
  assert.deepEqual(errores({ capitales: 'x' }), ['capitales'])
  assert.deepEqual(errores({ capitales: Array.from({ length: 31 }, () => ({ bien: 'RC', importe: 1 })) }), ['capitales'])
  const v = ok({ capitales: [{ bien: 'mercaderias', importe: '10.000,50', modalidad: ' VP ' }, { bien: 'OVJ', importe: 0 }, { bien: 'OTROS', importe: 300, descripcion: 'Maquinaria' }] })
  assert.deepEqual(v.capitales, [
    { bien: 'MERCADERIAS', importe: 10000.5, modalidad: 'VP', descripcion: null },
    { bien: 'OVJ', importe: 0, modalidad: null, descripcion: null },
    { bien: 'OTROS', importe: 300, modalidad: null, descripcion: 'Maquinaria' },
  ])
  assert.equal(ok({ capitales: null }).capitales, null)
  assert.deepEqual(ok({ capitales: [] }).capitales, [], '[] = revisado, no hay')
})

test('medidas de protección: la descripción es obligatoria, el valor no', () => {
  assert.deepEqual(errores({ medidasProteccion: [{ valor: 'sí' }] }), ['medidasProteccion'])
  assert.deepEqual(errores({ medidasProteccion: {} }), ['medidasProteccion'])
  assert.deepEqual(ok({ medidasProteccion: [{ medida: ' Alarma  conectada ', valor: 'Prosegur' }, { medida: 'Extintores', valor: '' }] }).medidasProteccion,
    [{ medida: 'Alarma conectada', valor: 'Prosegur' }, { medida: 'Extintores', valor: null }])
})

test('tres estados en las listas y en el sello: null ≠ [] ≠ con filas; editar borra la confirmación', () => {
  const vacio = leerBloqueDeRamo('comercio', {})
  assert.equal(vacio.datos.capitales, null)
  assert.equal(vacio.datos.medidasProteccion, null)
  assert.deepEqual(vacio.faltan, ['actividad', 'situacion', 'superficie', 'regimenLocal', 'capitales'])
  const a = aplicarEdicionComercio(null, ok({ actividad: 'Bar', capitales: [] }), OP)
  assert.deepEqual(a.datos.capitales, [])
  assert.deepEqual(a.cambios.map((c) => [c.campo, c.antes, c.despues]), [['actividad', null, 'Bar'], ['capitales', null, 'ninguno']])
  const sellado = aplicarEdicionComercio(a.datos, {}, { confirmar: true, ahora: AHORA }).datos
  assert.equal(sellado.confirmadoAt, AHORA)
  // Solo cambia una LISTA (sin escalares): el sello también se borra.
  const b = aplicarEdicionComercio(sellado, ok({ capitales: [{ bien: 'RC', importe: 300000 }] }), { confirmar: false, ahora: '2026-10-01T00:00:00.000Z' })
  assert.equal(b.datos.confirmadoAt, null)
  assert.equal(b.cambios.length, 1)
  assert.match(String(b.cambios[0].despues), /^RC 300\.000,00 €$/)
  // La misma lista otra vez no es un cambio y conserva el sello.
  const c = aplicarEdicionComercio(sellado, ok({ capitales: [] }), { confirmar: false, ahora: '2026-10-01T00:00:00.000Z' })
  assert.equal(c.cambios.length, 0)
  assert.equal(c.datos.confirmadoAt, AHORA)
  // Una clave ausente no se toca.
  const d = aplicarEdicionComercio(b.datos, ok({ actividad: 'Bar y terraza' }), OP)
  assert.deepEqual(d.datos.capitales, b.datos.capitales)
  // Borrar una lista la devuelve a «sin mirar».
  assert.equal(aplicarEdicionComercio(b.datos, { capitales: null }, OP).datos.capitales, null)
})

test('confirmar: sin ningún dato no; con una lista revisada vacía sí (es algo que afirmar)', () => {
  assert.ok(motivoNoConfirmableComercio(leerDatosComercio({})!))
  assert.equal(motivoNoConfirmableComercio(aplicarEdicionComercio(null, { capitales: [] }, OP).datos), null)
  assert.equal(calcularEdicionRiesgo({ ramo: 'comercio', clave: 'datosComercio', info: {}, parcial: {}, confirmar: true, ahora: AHORA }).ok, false)
  const r = calcularEdicionRiesgo({ ramo: 'comercio', clave: 'datosComercio', info: {}, parcial: { actividad: 'Bar' }, confirmar: true, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok && r.datos.confirmadoAt === AHORA && r.faltan.length === 4)
})

test('lectura tolerante: un tipo raro es «no se sabe»; lo que no se reconoce se ignora', () => {
  const d = leerDatosComercio({
    actividad: 5, cp: 41003, metrosCuadrados: '85', regimenLocal: 'okupa', confirmadoAt: 'ayer',
    capitales: [{ bien: 'CASA', importe: 5 }, { bien: 'CONTINENTE', importe: '9' }, { bien: 'rc', importe: 7, modalidad: ' VP ' }, 3],
    medidasProteccion: [{ medida: '  ' }, { medida: 'Alarma', valor: 7 }],
    maquinaria: 20000,
  })!
  assert.equal(d.actividad, null)
  assert.equal(d.cp, null)
  assert.equal(d.metrosCuadrados, null, 'un número como texto es «no se sabe»')
  assert.equal(d.regimenLocal, null)
  assert.equal(d.confirmadoAt, null)
  assert.deepEqual(d.capitales, [{ bien: 'RC', importe: 7, modalidad: 'VP', descripcion: null }])
  assert.deepEqual(d.medidasProteccion, [{ medida: 'Alarma', valor: null }])
  assert.equal(leerDatosComercio('x'), null)
  assert.equal(leerDatosComercio([]), null)
  assert.equal(leerDatosComercio({})!.capitales, null, 'sin clave de lista = sin mirar, no vacía')
})

test('COMPATIBILIDAD: un info_riesgo antiguo con claves sueltas se lee sin romper y guardar NO borra las ajenas', () => {
  const viejo = { origen: 'poliza:riesgo', m2: 85, maquinaria: 20000, mercancia: 10000, alarma: 'sí', presupuestoCodeoscopic: '41999', datosRiesgoLibre: { descripcion: 'Bar', capital: 5 } }
  const b = leerBloqueDeRamo('comercio', viejo)
  assert.equal(b.clave, 'datosComercio')
  assert.equal(b.dePoliza, false)
  assert.equal(b.datos.actividad, null)
  const r = calcularEdicionRiesgo({ ramo: 'comercio', clave: 'datosComercio', info: viejo, parcial: { actividad: 'Bar', capitales: [{ bien: 'CONTENIDO', importe: 20000 }] }, confirmar: false, ahora: AHORA, hoy: HOY })
  assert.ok(r.ok)
  for (const [k, v] of Object.entries(viejo)) assert.deepEqual(r.infoNueva[k], v, k)
  assert.ok(r.infoNueva.datosComercio)
  assert.equal('datosComercio' in viejo, false, 'no muta la entrada')
  assert.deepEqual(fusionarInfoRiesgoClave(viejo, 'datosComercio', { x: 1 }).maquinaria, 20000)
})

test('precarga de póliza: lo que escribe el mapper de CIMA, sin cifrado ni cajón, y los OTROS (coberturas) fuera', () => {
  const p = precargaComercioDePoliza({
    actividad: 'Bar', direccion: 'Calle A 1', localidad: 'Sevilla', cp: '41003', metrosCuadrados: '85.00', zona: 'Z3', anioConstruccionCima: '1994',
    capitales: [
      { bien: 'CONTINENTE', importe: '100000.00', modalidad: 'VP' },
      { bien: 'OTROS', importe: '513.00', descripcion: 'Daños por agua' },
      { bien: 'CONTENIDO', importe: 'n/d' },
    ],
    medidasProteccion: [{ medida: 'Alarma', valor: 'Sí' }, { medida: null, valor: 'x' }],
  })
  assert.deepEqual(p, {
    actividad: 'Bar', direccion: 'Calle A 1', localidad: 'Sevilla', cp: '41003', metrosCuadrados: 85, zona: 'Z3', anioConstruccion: 1994,
    capitales: [{ bien: 'CONTINENTE', importe: 100000, modalidad: 'VP', descripcion: null }],
    medidasProteccion: [{ medida: 'Alarma', valor: 'Sí' }],
  })
  assert.deepEqual(precargaComercioDePoliza({ direccion: 'v1:abc:def:ghi', cp: 'N/A', zona: 'OTRO', metrosCuadrados: 0, capitales: [], medidasProteccion: [] }), {})
  assert.deepEqual(precargaComercioDePoliza(null), {})
  const b = leerBloqueDeRamo('comercio', {}, p as never)
  assert.equal(b.dePoliza, true)
  assert.equal(b.datos.confirmadoAt, null, 'la precarga nunca cuenta como confirmada')
  assert.equal(b.datos.superficieTotal, null, 'sin dato = null, no 0')
  // Lo estructurado manda sobre la precarga.
  const s = leerBloqueDeRamo('comercio', { datosComercio: { actividad: 'Tienda' } }, p as never)
  assert.equal(s.datos.actividad, 'Tienda')
  assert.equal(s.datos.direccion, null)
  assert.equal(s.dePoliza, false)
})
