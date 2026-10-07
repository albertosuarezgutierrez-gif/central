import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

import {
  interpretarRiesgo, estadoPresupuestoVariante, textoFaltan, faltaMovil, faltaSexo, EDITOR_DE_FALTA, rotulosFaltaEnFormulario,
  interpretarComparacion, mejoresComparacion, diferenciaComparacion, ordenarParaComparar,
} from './riesgo-asegura.ts'

const OP = { id: 'op-1', clienteId: 'cli-1', clienteNombre: 'Manuel', ramo: 'moto', estado: 'competencia' }

function variante(extra: Record<string, unknown>) {
  return { id: 'v', referencia: 'P1', creadoAt: '2026-09-29T08:00:00.000Z', tomador: { clienteId: 'cli-1', nombre: 'Manuel' }, ...extra }
}

test('404 o estado no_encontrado → no_encontrado, nunca un riesgo vacío', () => {
  assert.deepEqual(interpretarRiesgo(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarRiesgo(200, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
})

test('un fallo del puerto es error con su motivo, no un riesgo sin figuras', () => {
  const r = interpretarRiesgo(500, { estado: 'error', causa: 'credenciales' })
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' && r.motivo, 'credenciales')
  assert.equal(interpretarRiesgo(200, { estado: 'ok' }).estado, 'error')
})

test('cambios: [] (primera o igual) ≠ null (no se puede comparar)', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', cambios: [] }), variante({ id: 'b', cambios: null }), variante({ id: 'c' })],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.riesgo.variantes[0].cambios, [])
  assert.equal(r.riesgo.variantes[1].cambios, null)
  assert.equal(r.riesgo.variantes[2].cambios, null, 'sin la clave: no consta, no «igual»')
})

test('nPrecios ausente o raro → null («—»), nunca 0 opciones', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', nPrecios: 12 }), variante({ id: 'b' }), variante({ id: 'c', nPrecios: '12' }), variante({ id: 'd', nPrecios: 0 })],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.deepEqual(r.riesgo.variantes.map((v) => v.nPrecios), [12, null, null, 0])
})

test('figura sin faltan legible → null (no se pudo leer), no «nada falta»', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador', 'propietario'], vinculos: [], variantes: [],
    figuras: [
      { rol: 'tomador', clienteId: 'cli-1', nombre: 'Manuel', porDefecto: true, faltan: [] },
      { rol: 'propietario', clienteId: 'cli-2', nombre: 'Antonio', vinculo: 'Padre/Madre' },
      { rol: 'inventado', clienteId: 'cli-3', nombre: 'X' },
    ],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.equal(r.riesgo.figuras.length, 2, 'un rol desconocido se descarta')
  assert.deepEqual(r.riesgo.figuras[0].faltan, [])
  assert.equal(r.riesgo.figuras[1].faltan, null)
  assert.equal(textoFaltan(null), 'No se pudo leer su ficha')
  assert.equal(textoFaltan([]), null)
})

test('estado del presupuesto: null = sin preparar; lo más avanzado manda', () => {
  assert.equal(estadoPresupuestoVariante(null), null)
  const base = { id: 'p', enviadoAt: null, vistoAt: null, elegidoAt: null, aceptadoAt: null, emitidoAt: null, retiradoAt: null }
  assert.equal(estadoPresupuestoVariante(base), 'Preparado, sin enviar')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', vistoAt: 'y' }), 'Enviado · visto')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', retiradoAt: 'z' }), 'Retirado')
})

// ─── Comparar dos variantes ─────────────────────────────────────────────────
test('comparar: 404 → no_encontrado; fallo → error con motivo, nunca una tabla vacía', () => {
  assert.deepEqual(interpretarComparacion(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  const e = interpretarComparacion(500, { estado: 'error', causa: 'conexion' })
  assert.equal(e.estado, 'error')
  assert.equal(e.estado === 'error' && e.motivo, 'conexion')
  assert.equal(interpretarComparacion(200, { estado: 'ok' }).estado, 'error', 'sin a/b no se inventa la comparación')
})

test('comparar: cambios null ≠ [] y compañía sin precio en una columna → null, no 0', () => {
  const r = interpretarComparacion(200, {
    estado: 'ok', a: 'ta', b: 'tb', cambios: null,
    companias: [
      { compania: 'Mapfre', a: { primaEur: 300, modalidad: 'Terceros' }, b: { primaEur: 280.5, modalidad: null } },
      { compania: 'Allianz', a: null, b: { primaEur: 250 } },
      { compania: 'Reale', a: { primaEur: '200' }, b: null },
      { compania: '', a: { primaEur: 1 }, b: null },
    ],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.equal(r.comparacion.cambios, null)
  assert.equal(r.comparacion.companias.length, 2, 'una prima que no es número no cuenta; sin nombre se descarta')
  assert.equal(r.comparacion.companias[1].a, null)
  const igual = interpretarComparacion(200, { estado: 'ok', a: 'ta', b: 'tb', cambios: [], companias: [] })
  assert.deepEqual(igual.estado === 'ok' && igual.comparacion.cambios, [])
})

test('comparar: la mejor de cada columna, y la diferencia solo con las dos primas', () => {
  const filas = [
    { compania: 'Mapfre', a: { primaEur: 300, modalidad: null }, b: { primaEur: 280.5, modalidad: null } },
    { compania: 'Allianz', a: null, b: { primaEur: 250, modalidad: null } },
  ]
  assert.deepEqual(mejoresComparacion(filas), { a: 300, b: 250 })
  assert.deepEqual(mejoresComparacion([]), { a: null, b: null })
  assert.equal(diferenciaComparacion(filas[0]), -19.5)
  assert.equal(diferenciaComparacion(filas[1]), null)
})

test('comparar: la más antigua va como a, se marque en el orden que se marque', () => {
  const vs = [
    { ...variante({ id: 'p5', referencia: 'P5', creadoAt: '2026-09-29T10:00:00Z' }) },
    { ...variante({ id: 'p2', referencia: 'P2', creadoAt: '2026-09-20T10:00:00Z' }) },
  ]
  const r = interpretarRiesgo(200, { estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [], variantes: vs })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  const par = ordenarParaComparar(r.riesgo.variantes, ['p5', 'p2'])
  assert.deepEqual(par?.map((v) => v.referencia), ['P2', 'P5'])
  assert.equal(ordenarParaComparar(r.riesgo.variantes, ['p5']), null)
  assert.equal(ordenarParaComparar(r.riesgo.variantes, ['p5', 'nada']), null)
})

test('la variante trae de qué póliza es (null = presupuesto de cliente nuevo)', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', polizaId: 'pol-1' }), variante({ id: 'b' })],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.riesgo.variantes[0].polizaId, 'pol-1')
  assert.equal(r.riesgo.variantes[1].polizaId, null)
})

test('aseguradoraActual: la compañía de HOY se distingue de la de la oferta; sin el campo, null', () => {
  const base = { estado: 'ok', roles: ['tomador'], figuras: [], vinculos: [], variantes: [] }
  const hoy = interpretarRiesgo(200, { ...base, oportunidad: { ...OP, aseguradora: 'Mapfre', aseguradoraActual: true, prima: 276.69 } })
  assert.equal(hoy.estado === 'ok' && hoy.riesgo.oportunidad.aseguradoraActual, true)
  const viejo = interpretarRiesgo(200, { ...base, oportunidad: { ...OP, aseguradora: 'Mapfre' } })
  assert.equal(viejo.estado === 'ok' && viejo.riesgo.oportunidad.aseguradoraActual, null, 'asegura anterior: no consta')
})

test('interpretarRiesgo: datosVehiculo y faltanVehiculo — sin bloque = null, nunca un vehículo vacío que parezca leído', () => {
  const base = { estado: 'ok', oportunidad: { id: 'o1', clienteId: 'c1', ramo: 'auto' }, figuras: [], roles: [], variantes: [] }
  const sin = interpretarRiesgo(200, base)
  assert.equal(sin.estado, 'ok')
  if (sin.estado === 'ok') {
    assert.equal(sin.riesgo.datosVehiculo, null)
    assert.equal(sin.riesgo.faltanVehiculo, null)
  }
  const con = interpretarRiesgo(200, {
    ...base,
    datosVehiculo: { matricula: '1234BCD', kmAnuales: '10000', fechaMatriculacion: '2019-05-17', confirmadoAt: '2026-09-30T10:00:00Z' },
    faltanVehiculo: ['codigoVehiculo', 'garaje', 'inventado'],
  })
  assert.equal(con.estado, 'ok')
  if (con.estado === 'ok') {
    assert.equal(con.riesgo.datosVehiculo?.matricula, '1234BCD')
    assert.equal(con.riesgo.datosVehiculo?.kmAnuales, null, 'un km con tipo raro es «no se sabe», no un dato')
    assert.equal(con.riesgo.datosVehiculo?.marca, null)
    assert.equal(con.riesgo.datosVehiculo?.confirmadoAt, '2026-09-30T10:00:00Z')
    assert.deepEqual(con.riesgo.faltanVehiculo, ['codigoVehiculo', 'garaje'])
  }
})

test('interpretarRiesgo: datosRiesgo de cada ramo — clave rara o datos ilegibles = null, nunca un bloque vacío que parezca leído', () => {
  const base = { estado: 'ok', oportunidad: { id: 'o1', clienteId: 'c1', ramo: 'hogar' }, figuras: [], roles: [], variantes: [] }
  const leer = (datosRiesgo: unknown) => {
    const r = interpretarRiesgo(200, { ...base, datosRiesgo })
    assert.equal(r.estado, 'ok')
    return r.estado === 'ok' ? r.riesgo.datosRiesgo : undefined
  }
  assert.equal(leer(undefined), null, 'asegura vieja: no se enseña el bloque')
  assert.equal(leer({ clave: 'otraCosa', datos: {}, faltan: [] }), null)
  assert.equal(leer({ clave: 'datosVivienda', datos: 'x', faltan: [] }), null)
  const v = leer({ clave: 'datosVivienda', datos: { cp: '41003', habitaciones: '3', metrosCuadrados: 90, ventanasSeguras: false }, faltan: ['uso', 7], dePoliza: true, tarifica: true })
  assert.equal(v?.clave, 'datosVivienda')
  if (v?.clave === 'datosVivienda') {
    assert.equal(v.datos.cp, '41003')
    assert.equal(v.datos.habitaciones, null, 'un número como texto es «no se sabe»')
    assert.equal(v.datos.metrosCuadrados, 90)
    assert.equal(v.datos.ventanasSeguras, false, 'false es un dato')
    assert.equal(v.datos.vigilante, null)
    assert.deepEqual(v.faltan, ['uso'])
    assert.equal(v.dePoliza, true)
  }
  const c = leer({ clave: 'datosCapital', datos: { capital: 0, profesion: '2612', fumador: false, asegurados: [{ nombre: 'Ana', apellido1: 'Pérez', fechaNacimiento: '1990-05-17', sexo: 'mujer' }, { nombre: 'x' }] }, faltan: ['capital'], tarifica: true })
  assert.equal(c?.clave === 'datosCapital' && c.datos.capital, 0, 'un 0 declarado es un dato')
  if (c?.clave === 'datosCapital') {
    assert.equal(c.datos.profesion, '2612')
    assert.equal(c.datos.fumador, false, 'no fuma es un dato, no un vacío')
    assert.equal(c.datos.asegurados?.length, 1, 'una fila a medias no se inventa')
    assert.equal(Object.hasOwn(c.datos.asegurados?.[0] ?? {}, 'dni'), false, 'el riesgo no lleva DNI')
  }
  const sinFumador = leer({ clave: 'datosCapital', datos: { capital: 5 }, faltan: [], tarifica: true })
  assert.equal(sinFumador?.clave === 'datosCapital' && sinFumador.datos.fumador, null, 'sin dato es null')
  assert.equal(sinFumador?.clave === 'datosCapital' && sinFumador.datos.asegurados, null, 'sin mirar ≠ []')
  const k = leer({ clave: 'datosComercio', datos: { actividad: 'Bar', regimenLocal: 'inquilino', capitales: [{ bien: 'CONTENIDO', importe: 0 }], medidasProteccion: null }, faltan: ['capitales', 4], dePoliza: true, tarifica: false })
  assert.equal(k?.clave, 'datosComercio')
  if (k?.clave === 'datosComercio') {
    assert.equal(k.datos.regimenLocal, 'inquilino')
    assert.deepEqual(k.datos.capitales, [{ bien: 'CONTENIDO', importe: 0, modalidad: null, descripcion: null }], 'un importe de 0 es un dato')
    assert.equal(k.datos.medidasProteccion, null, 'sin mirar ≠ vacío')
    assert.equal(k.datos.metrosCuadrados, null)
    assert.deepEqual(k.faltan, ['capitales'])
    assert.equal(k.tarifica, false)
  }
  assert.equal(leer({ clave: 'datosComercio', datos: 'x', faltan: [] }), null)
  const l = leer({ clave: 'datosRiesgoLibre', datos: { descripcion: 'Bar', capital: 5000 }, faltan: [], tarifica: false })
  assert.equal(l?.clave === 'datosRiesgoLibre' && l.tarifica, false)
  assert.equal(l?.clave === 'datosRiesgoLibre' && l.datos.notas, null)
})

test('faltaMovil: solo si la ficha se leyó y no tiene móvil (null = no se sabe, no se ofrece escribir)', () => {
  assert.equal(faltaMovil(['sexo', 'telefono']), true)
  assert.equal(faltaMovil(['sexo']), false)
  assert.equal(faltaMovil([]), false)
  assert.equal(faltaMovil(null), false)
})

test('faltaSexo: solo si la ficha se leyó y no tiene sexo', () => {
  assert.equal(faltaSexo(['sexo', 'telefono']), true)
  assert.equal(faltaSexo(['telefono']), false)
  assert.equal(faltaSexo(null), false)
})

test('cada clave posible de faltanDeFigura() tiene un editor asociado en la pantalla', () => {
  const fuente = readFileSync(new URL('../../asegura/lib/oportunidad-riesgo.ts', import.meta.url), 'utf8')
  const ini = fuente.indexOf('export function faltanDeFigura')
  const fin = fuente.indexOf('/** Qué rol de figura va a qué clave', ini)
  assert.ok(ini > 0 && fin > ini, 'no se encuentra faltanDeFigura')
  const cuerpo = fuente.slice(ini, fin)
  const claves = new Set<string>()
  for (const m of cuerpo.matchAll(/f\.push\('([^']+)'\)/g)) claves.add(m[1])
  for (const m of cuerpo.matchAll(/return \['([^']+)'\]/g)) claves.add(m[1])
  const lista = cuerpo.match(/for \(const k of \[([^\]]+)\] as const\)/)
  assert.ok(lista, 'no se encuentra la lista de campos de persona')
  for (const m of lista[1].matchAll(/'([^']+)'/g)) claves.add(m[1])
  assert.ok(claves.size >= 9, `se esperaban al menos 9 claves, salen ${claves.size}`)
  for (const k of claves) assert.ok(k in EDITOR_DE_FALTA, `la clave «${k}» de faltanDeFigura no tiene editor en EDITOR_DE_FALTA`)
  for (const k of Object.keys(EDITOR_DE_FALTA)) assert.ok(claves.has(k), `EDITOR_DE_FALTA tiene «${k}», que faltanDeFigura ya no devuelve`)
})

test('rotulosFaltaEnFormulario: solo lo que se corrige en los formularios, null = nada', () => {
  assert.deepEqual(rotulosFaltaEnFormulario(['dni', 'sexo', 'telefono', 'fechaCarnet']), ['DNI', 'fecha del carnet'])
  assert.deepEqual(rotulosFaltaEnFormulario(null), [])
})
