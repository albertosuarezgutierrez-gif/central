// Cepos de «Datos con los que hemos calculado tu precio» (ofertas del bot, 18/10/2026). `node --test`. Datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aniosCumplidos, enmascararMatricula, gruposDatosUsadosOfertas, leerDatosUsados } from './datos-usados-ofertas.ts'

const usados = (cp: string | null, loc: string | null, vehiculo: Record<string, string | null> | null = null) =>
  leerDatosUsados({ origen: 'rpa', datosUsados: { codigoPostal: cp, localidad: loc, vehiculo } })
const FICHA = { marca: 'MARCA', modelo: 'MODELO', version: null, matricula: '1234 BCD' }
const HOY = '2026-10-18'

test('CP y localidad: los que USÓ la compañía; si difieren, por compañía; sin dato, «la que indique la compañía», nunca la ficha', () => {
  const igual = gruposDatosUsadosOfertas({ ofertas: [{ compania: 'Allianz', datosUsados: usados('41003', 'Sevilla') }, { compania: 'Mapfre', datosUsados: usados('41003', 'Sevilla') }], vehiculoFicha: FICHA, conductor: null, hoy: HOY })
  assert.deepEqual(igual[0], { titulo: 'Dónde circula el vehículo', filas: [{ etiqueta: 'Código postal', valor: '41003' }, { etiqueta: 'Localidad', valor: 'Sevilla' }] })
  const distinto = gruposDatosUsadosOfertas({ ofertas: [{ compania: 'Allianz', datosUsados: usados('41010', 'Sevilla') }, { compania: 'Mapfre', datosUsados: usados('41003', 'Sevilla') }, { compania: 'Mapfre', datosUsados: usados('41003', 'Sevilla') }], vehiculoFicha: FICHA, conductor: null, hoy: HOY })
  assert.deepEqual(distinto[0].filas, [
    { etiqueta: 'Código postal (Allianz)', valor: '41010' }, { etiqueta: 'Código postal (Mapfre)', valor: '41003' },
    { etiqueta: 'Localidad', valor: 'Sevilla' },
  ])
  const sinDato = gruposDatosUsadosOfertas({ ofertas: [{ compania: 'Allianz', datosUsados: null }], vehiculoFicha: FICHA, conductor: null, hoy: HOY })
  assert.deepEqual(sinDato[0].filas.map((f) => f.valor), ['la que indique la compañía al emitir', 'la que indique la compañía al emitir'])
  assert.equal(usados('4100', 'X')!.codigoPostal, null, 'un CP que no son 5 dígitos no se pinta')
})

test('vehículo: el que usó la compañía; si falta, el de tus datos marcado; matrícula con solo las 3 últimas', () => {
  const g = gruposDatosUsadosOfertas({
    ofertas: [{ compania: 'Allianz', datosUsados: usados(null, null, { marca: 'MARCA', modelo: 'MODELO', version: '1.0 TSI' }) }, { compania: 'Mapfre', datosUsados: usados(null, null) }],
    vehiculoFicha: FICHA, conductor: null, hoy: HOY,
  })
  const v = g.find((x) => x.titulo === 'Vehículo')!
  assert.deepEqual(v.filas, [
    { etiqueta: 'Vehículo (Allianz)', valor: 'MARCA MODELO 1.0 TSI' },
    { etiqueta: 'Vehículo (Mapfre)', valor: 'MARCA MODELO (según tus datos)' },
    { etiqueta: 'Matrícula', valor: '****BCD' },
  ])
  assert.equal(enmascararMatricula('1234BCD'), '****BCD')
  assert.equal(enmascararMatricula('AB'), '***')
  assert.equal(enmascararMatricula(null), null)
  assert.doesNotMatch(JSON.stringify(g), /1234/, 'la matrícula entera no sale')
})

test('conductor: edad y carné en AÑOS (nunca fechas); ilegible no se pinta', () => {
  const g = gruposDatosUsadosOfertas({ ofertas: [{ compania: 'Allianz', datosUsados: null }], vehiculoFicha: null, conductor: { fechaNacimiento: '1980-10-19', fechaCarnet: '20/03/2016' }, hoy: HOY })
  const c = g.find((x) => x.titulo === 'Conductor')!
  assert.deepEqual(c.filas, [{ etiqueta: 'Edad', valor: '45 años' }, { etiqueta: 'Carné de conducir', valor: '10 años' }])
  assert.doesNotMatch(JSON.stringify(g), /1980|2016/, 'ninguna fecha sale')
  assert.equal(aniosCumplidos('1980-10-18', HOY), 46)
  assert.equal(aniosCumplidos('2027-01-01', HOY), null)
  assert.equal(aniosCumplidos('basura', HOY), null)
  assert.equal(gruposDatosUsadosOfertas({ ofertas: [], vehiculoFicha: null, conductor: { fechaNacimiento: null, fechaCarnet: null }, hoy: HOY }).length, 0)
})

test('cableado: el bloque de datos de ofertas añade el cálculo, lee por correduría y no saca fechas', () => {
  const lib = import.meta.dirname
  const ace = readFileSync(join(lib, 'presupuesto-aceptacion.ts'), 'utf8')
  assert.match(ace, /datos: \[\.\.\.gruposRevisionOfertas\(p\.tomador\), \.\.\.calculo\]/)
  const bd = readFileSync(join(lib, 'datos-usados-ofertas-bd.ts'), 'utf8')
  assert.match(bd, /p\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(bd, /o\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(bd, /datosUsados: leerDatosUsados\(f\.datos_extra\)/, 'CP y localidad salen de lo que USÓ la compañía')
  assert.doesNotMatch(bd, /codigoPostal|codigo_postal/, 'el CP de la ficha no se lee aquí')
})

test('revisión 18/10: sin conductor habitual el grupo es «Conductor (tomador)»; ficha ilegible se DICE, no se omite', () => {
  const base = { ofertas: [{ compania: 'Allianz', datosUsados: null }], vehiculoFicha: null, hoy: HOY }
  const tomador = gruposDatosUsadosOfertas({ ...base, conductor: { fechaNacimiento: '1980-10-19', fechaCarnet: null }, conductorEsTomador: true })
  assert.ok(tomador.some((g) => g.titulo === 'Conductor (tomador)'))
  const habitual = gruposDatosUsadosOfertas({ ...base, conductor: { fechaNacimiento: '1980-10-19', fechaCarnet: null }, conductorEsTomador: false })
  assert.ok(habitual.some((g) => g.titulo === 'Conductor'))
  const ilegible = gruposDatosUsadosOfertas({ ...base, conductor: 'ilegible', conductorEsTomador: true })
  assert.deepEqual(ilegible.find((g) => g.titulo === 'Conductor (tomador)'), { titulo: 'Conductor (tomador)', filas: [{ etiqueta: 'Edad y carné de conducir', valor: 'no lo hemos podido leer' }] })
  // Persona jurídica (`null`): no hay edad que pintar.
  assert.equal(gruposDatosUsadosOfertas({ ...base, conductor: null }).some((g) => g.titulo.startsWith('Conductor')), false)
  const bd = readFileSync(join(import.meta.dirname, 'datos-usados-ofertas-bd.ts'), 'utf8')
  assert.match(bd, /p === null\s*\? 'ilegible' as const/, 'un fallo de lectura de la ficha pasa como «ilegible»')
  assert.match(bd, /conductorEsTomador = false/)
})

test('revisión 18/10: si el presupuesto mezcla bot y PDF, la fila única de CP dice a qué compañía/s corresponde', () => {
  const ofertas = [{ compania: 'Allianz', datosUsados: usados('41003', 'Sevilla') }, { compania: 'Mapfre', datosUsados: usados('41003', 'Sevilla') }]
  const mezcla = gruposDatosUsadosOfertas({ ofertas, vehiculoFicha: null, conductor: null, mezclaConPdf: true, hoy: HOY })
  assert.deepEqual(mezcla[0].filas, [{ etiqueta: 'Código postal (Allianz, Mapfre)', valor: '41003' }, { etiqueta: 'Localidad (Allianz, Mapfre)', valor: 'Sevilla' }])
  const solo = gruposDatosUsadosOfertas({ ofertas, vehiculoFicha: null, conductor: null, hoy: HOY })
  assert.equal(solo[0].filas[0].etiqueta, 'Código postal')
  const bd = readFileSync(join(import.meta.dirname, 'datos-usados-ofertas-bd.ts'), 'utf8')
  assert.match(bd, /mezclaConPdf: delBot\.length < filas\.length/)
})
