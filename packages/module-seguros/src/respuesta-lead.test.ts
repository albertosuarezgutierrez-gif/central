import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  apareceEnCorreo, conocidosDeBloque, cuerpoSinCita, decidirFusion, faltanObligatorios, leerRespuestaIa, preguntasRepregunta,
  promptExtraerRespuesta, seGuardaCifrado, validarValorContrato,
} from './respuesta-lead.ts'
import { contratoDatos } from './contrato-datos.ts'

const HOY = '2026-10-19'

test('DNI/NIE: la letra de control manda; una letra mala es INVÁLIDO, nunca se corrige', () => {
  assert.deepEqual(validarValorContrato('dni', '12345678-z', HOY), { ok: true, valor: '12345678Z' })
  assert.deepEqual(validarValorContrato('dni', 'X1234567L', HOY), { ok: true, valor: 'X1234567L' })
  const mal = validarValorContrato('dni', '12345678A', HOY)
  assert.equal(mal.ok, false)
})

test('fechas: existen, nacimiento plausible, efecto no pasada; aaaa-mm-dd y dd/mm/aaaa', () => {
  assert.deepEqual(validarValorContrato('fechaNacimiento', '03/02/1985', HOY), { ok: true, valor: '1985-02-03' })
  assert.equal(validarValorContrato('fechaNacimiento', '1985-02-30', HOY).ok, false)
  assert.equal(validarValorContrato('fechaNacimiento', '2020-01-01', HOY).ok, false)
  assert.equal(validarValorContrato('fechaEfecto', '2026-10-01', HOY).ok, false)
  assert.equal(validarValorContrato('fechaEfecto', '2026-11-01', HOY).ok, true)
  assert.equal(validarValorContrato('fechaCarnet', '2027-01-01', HOY).ok, false)
})

test('CP, matrícula, importes, m² y teléfono', () => {
  assert.deepEqual(validarValorContrato('cp', '41003', HOY), { ok: true, valor: '41003' })
  assert.equal(validarValorContrato('cp', '60003', HOY).ok, false)
  assert.equal(validarValorContrato('cp', '4100', HOY).ok, false)
  assert.deepEqual(validarValorContrato('matricula', '1234 bcd', HOY), { ok: true, valor: '1234BCD' })
  assert.equal(validarValorContrato('matricula', 'ABC', HOY).ok, false)
  assert.deepEqual(validarValorContrato('capitalContinente', '150.000 €', HOY), { ok: true, valor: 150000 })
  assert.equal(validarValorContrato('capital', '-5', HOY).ok, false)
  assert.deepEqual(validarValorContrato('metrosCuadrados', '90 m2', HOY), { ok: true, valor: 90 })
  assert.equal(validarValorContrato('metrosCuadrados', '2', HOY).ok, false)
  assert.equal(validarValorContrato('anioConstruccion', '2031', HOY).ok, false)
  assert.deepEqual(validarValorContrato('telefono', '+34 612 345 678', HOY), { ok: true, valor: '612345678' })
  assert.equal(validarValorContrato('telefono', '512345678', HOY).ok, false)
})

test('🪤 solo cuenta lo que APARECE: cita inventada o valor que no sale de la cita = no existe', () => {
  const texto = 'Hola, mi DNI es 12345678Z y nací el 3 de febrero de 1985. Hago unos 12.000 km al año.'
  assert.equal(apareceEnCorreo('dni', '12345678Z', 'mi DNI es 12345678Z', texto), true)
  assert.equal(apareceEnCorreo('dni', '87654321X', 'mi DNI es 12345678Z', texto), false)
  assert.equal(apareceEnCorreo('dni', '12345678Z', 'DNI 12345678Z', texto), false, 'la cita no está literal')
  assert.equal(apareceEnCorreo('fechaNacimiento', '1985-02-03', 'nací el 3 de febrero de 1985', texto), true)
  assert.equal(apareceEnCorreo('fechaNacimiento', '1986-02-03', 'nací el 3 de febrero de 1985', texto), false)
  assert.equal(apareceEnCorreo('kmAnuales', 12000, 'unos 12.000 km al año', texto), true)
  assert.equal(apareceEnCorreo('kmAnuales', 15000, 'unos 12.000 km al año', texto), false)
})

test('leerRespuestaIa: válido y aparecido → valor; letra mala → inválido; fuera del contrato o inventado → nada', () => {
  const texto = 'Te paso: DNI 12345678A, matrícula 1234-BCD, empiezo el 1 de noviembre. Fumo: no.'
  const raw = {
    dni: { valor: '12345678A', cita: 'DNI 12345678A' },
    matricula: { valor: '1234BCD', cita: 'matrícula 1234-BCD' },
    fechaEfecto: { valor: '2026-11-01', cita: 'empiezo el 1 de noviembre' },
    kmAnuales: { valor: 10000, cita: '10.000 km' }, // no está en el texto
    preexistencias: { valor: 'diabetes', cita: 'Fumo: no' }, // salud: nunca
    inventada: { valor: 'x', cita: 'DNI' },
  }
  const r = leerRespuestaIa(raw, { texto, ramos: ['auto'], hoy: HOY })
  assert.deepEqual(r.valores, { matricula: '1234BCD', fechaEfecto: '2026-11-01' })
  assert.deepEqual(r.invalidos.map((x) => x.clave), ['dni'])
  assert.deepEqual(leerRespuestaIa('no es json', { texto, ramos: ['auto'], hoy: HOY }), { valores: {}, invalidos: [] })
  assert.deepEqual(leerRespuestaIa(null, { texto, ramos: ['auto'], hoy: HOY }), { valores: {}, invalidos: [] })
})

test('🪤 lo citado de NUESTRA petición (ejemplos, pie legal) no se lee como dato del cliente', () => {
  const t = [
    'Mi matrícula es 1234BCD.',
    '',
    'El lun, 19 oct 2026 a las 10:00, Grupo ASegura <hola@grupoasegura.es>',
    'escribió:',
    '> Marca, modelo y versión exacta (por ejemplo, «Seat León 1.5 TSI FR»).',
  ].join('\n')
  assert.equal(cuerpoSinCita(t), 'Mi matrícula es 1234BCD.')
  assert.equal(cuerpoSinCita('Todo bien\n> citado'), 'Todo bien')
  assert.equal(cuerpoSinCita('Hola\n--\nPie legal NIF X'), 'Hola')
})

test('🪤 fusión: nunca pisa — distinto = discrepancia; confirmado por Alberto = protegido (no al bloque)', () => {
  const nuevos = { matricula: '1234BCD', kmAnuales: 12000, cpCirculacion: '41003', telefono: '612345678' }
  const libre = decidirFusion({ nuevos, previos: {}, claveBloque: 'datosVehiculo', bloque: { matricula: null, kmAnuales: null, cpCirculacion: null, confirmadoAt: null } })
  assert.deepEqual(libre.escribir.sort(), ['cpCirculacion', 'kmAnuales', 'matricula', 'telefono'])
  assert.deepEqual(libre.aBloque.sort(), ['cpCirculacion', 'kmAnuales', 'matricula'])
  const conDato = decidirFusion({ nuevos, previos: { telefono: '612 345 678' }, claveBloque: 'datosVehiculo', bloque: { matricula: '9999ZZZ', kmAnuales: 12000, confirmadoAt: null } })
  assert.deepEqual(conDato.discrepancias, ['matricula'])
  assert.deepEqual(conDato.iguales.sort(), ['kmAnuales', 'telefono'])
  assert.deepEqual(conDato.escribir, ['cpCirculacion'])
  const confirmado = decidirFusion({ nuevos, previos: {}, claveBloque: 'datosVehiculo', bloque: { matricula: null, confirmadoAt: '2026-10-18T10:00:00Z' } })
  assert.deepEqual(confirmado.aBloque, [])
  assert.deepEqual(confirmado.protegidos.sort(), ['cpCirculacion', 'kmAnuales', 'matricula'])
  const dni = decidirFusion({ nuevos: { dni: '12345678Z' }, previos: {}, claveBloque: 'datosVehiculo', bloque: null, fichaDni: 'distinto' })
  assert.deepEqual(dni.discrepancias, ['dni'])
})

test('faltan: solo obligatorios con pregunta; la repregunta pide SOLO eso', () => {
  const conocidos = new Set(['dni', 'nombre', 'apellido1', 'fechaNacimiento', 'sexo', 'estadoCivil', 'telefono', 'capital'])
  const faltan = faltanObligatorios('vida', conocidos).map((f) => f.clave)
  assert.deepEqual(faltan, ['fechaEfecto'])
  const bloques = preguntasRepregunta(['vida'], new Set(faltan))
  assert.equal(bloques.length, 1)
  assert.deepEqual(bloques[0].preguntas, [contratoDatos('vida').campos.find((f) => f.clave === 'fechaEfecto')!.pregunta])
  assert.deepEqual(conocidosDeBloque('hogar', { metrosCuadrados: 90, anioConstruccion: null, confirmadoAt: null }), ['metrosCuadrados'])
})

test('el DNI, los datos de terceros y el nacimiento se guardan cifrados; el prompt no pide salud', () => {
  for (const clave of ['dni', 'fechaNacimiento', 'conductor', 'aseguradosAdicionales']) assert.equal(seGuardaCifrado({ clave }), true, clave)
  assert.equal(seGuardaCifrado({ clave: 'kmAnuales' }), false)
  assert.equal(seGuardaCifrado({ clave: 'nombreVia', deLaPersona: true }), true)
  assert.equal(seGuardaCifrado({ clave: 'nombreVia' }), false)
  assert.ok(!/preexistencias/.test(promptExtraerRespuesta(['salud'], HOY)))
})
