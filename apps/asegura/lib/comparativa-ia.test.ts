import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  MAX_LONGITUD_PREGUNTA, MAX_PREGUNTAS_DIA, decidirPregunta, diferenciasEntre, importesDe, limpiarPregunta,
  promptPregunta, promptResumen, validarSalidaIA, type OpcionIA,
} from './comparativa-ia.ts'

const MAPFRE: OpcionIA = {
  id: 'a', compania: 'Mapfre', producto: 'Auto Plus', modalidad: 'Todo riesgo', primaEur: 412.3, franquiciaEur: 300,
  coberturas: [
    { nombre: 'Lunas', incluida: true, texto: null },
    { nombre: 'Vehículo de sustitución', incluida: false, texto: null },
    { nombre: 'Asistencia en viaje', incluida: null, texto: 'Desde km 0, remolque hasta 150 €' },
  ],
}
const REALE: OpcionIA = {
  id: 'b', compania: 'Reale', producto: 'Coche Reale', modalidad: null, primaEur: 380, franquiciaEur: null,
  coberturas: [
    { nombre: 'LUNAS', incluida: true, texto: null },
    { nombre: 'Vehiculo de sustitucion', incluida: true, texto: null },
  ],
}

// 🪤 CEPO: el prompt no puede llevar datos personales del cliente, ni aunque viajen pegados a la opción.
test('CEPO el prompt no contiene DNI, nombre, email ni fecha de nacimiento del cliente', () => {
  const personal = { tomador: 'Pilar Franco Ruz', dni: '12345678Z', email: 'pilar.franco@example.com', fechaNacimiento: '14/03/1971', matricula: '1234 LKB' }
  const conPii = [{ ...MAPFRE, ...personal }, { ...REALE, ...personal }] as unknown as OpcionIA[]
  const pregunta = `Soy ${personal.tomador}, DNI ${personal.dni}, correo ${personal.email}, nací el ${personal.fechaNacimiento}, ¿cuál cubre lunas?`
  for (const p of [promptResumen(conPii), promptPregunta(conPii[0], conPii[1], pregunta, [personal.tomador])]) {
    for (const v of [personal.dni, personal.email, personal.fechaNacimiento, personal.matricula, 'Pilar', 'Franco', 'Ruz']) {
      assert.ok(!p.includes(v), `el prompt lleva «${v}»`)
    }
  }
  assert.match(limpiarPregunta(pregunta), /\[dato omitido\]/)
})

test('el prompt lleva las cifras HECHAS por el código (prima, diferencia, franquicia)', () => {
  const p = promptPregunta(MAPFRE, REALE, '¿qué cambia?')
  assert.match(p, /412,30€/)
  assert.match(p, /380,00€/)
  assert.match(p, /32,30€ al año/)
  assert.match(p, /Franquicia: no consta/)
  assert.match(p, /Vehículo de sustitución: en Mapfre no incluida; en Reale incluida/)
})

test('diferenciasEntre alinea por nombre normalizado y dice cuando unas coberturas no constan', () => {
  assert.equal(diferenciasEntre(MAPFRE, REALE).some((d) => d.startsWith('Lunas')), false)
  assert.match(diferenciasEntre(MAPFRE, { ...REALE, coberturas: null })[0], /las de Reale no constan/)
})

// 🪤 CEPO: el validador descarta una compañía que no está entre las opciones.
test('CEPO validador descarta una compañía inventada', () => {
  const buena = 'Mapfre cuesta 412,30€ y Reale 380,00€. Las dos incluyen lunas (Según: Mapfre · Lunas).'
  assert.deepEqual(validarSalidaIA(buena, [MAPFRE, REALE]), { ok: true, texto: buena })
  const inventada = 'Mapfre cuesta 412,30€; Allianz ofrece algo parecido por menos (Según: Mapfre · Lunas).'
  assert.deepEqual(validarSalidaIA(inventada, [MAPFRE, REALE]), { ok: false, motivo: 'compania_ajena' })
  const citaAjena = 'Las dos cubren lunas por igual (Según: Zeta Seguros · Lunas).'
  assert.deepEqual(validarSalidaIA(citaAjena, [MAPFRE, REALE]), { ok: false, motivo: 'cita_ajena' })
})

test('validador descarta cifras que no cuadran y recomendaciones; acepta importes de los textos', () => {
  assert.deepEqual(validarSalidaIA('Reale cuesta 350,00€ al año, bastante menos que Mapfre.', [MAPFRE, REALE]), { ok: false, motivo: 'cifra_no_cuadra' })
  assert.equal(validarSalidaIA('Reale cuesta 32,30€ menos al año que Mapfre (Según: Reale · Lunas).', [MAPFRE, REALE]).ok, true)
  assert.equal(validarSalidaIA('En Mapfre el remolque llega hasta 150 € (Según: Mapfre · Asistencia en viaje).', [MAPFRE, REALE]).ok, true)
  assert.deepEqual(validarSalidaIA('Te recomiendo Reale porque cubre el vehículo de sustitución.', [MAPFRE, REALE]), { ok: false, motivo: 'recomienda' })
})

test('importesDe lee el formato español y el de punto decimal', () => {
  assert.deepEqual(importesDe('2.162,49€, 84,80 € y 300 euros; 2162.49€'), [2162.49, 84.8, 300, 2162.49])
})

// 🪤 CEPO: el tope de preguntas lo decide el servidor, antes de gastar IA.
test('CEPO tope de preguntas: a partir de la décima del día, «limite»', () => {
  assert.equal(decidirPregunta({ hechasHoy: MAX_PREGUNTAS_DIA - 1, pregunta: '¿cubre lunas?' }).estado, 'ok')
  assert.deepEqual(decidirPregunta({ hechasHoy: MAX_PREGUNTAS_DIA, pregunta: '¿cubre lunas?' }), { estado: 'limite' })
  assert.deepEqual(decidirPregunta({ hechasHoy: 0, pregunta: 'x'.repeat(MAX_LONGITUD_PREGUNTA + 1) }), { estado: 'invalida' })
  assert.deepEqual(decidirPregunta({ hechasHoy: 0, pregunta: 12 }), { estado: 'invalida' })
})

test('CEPO tope de preguntas: el servicio cuenta y decide ANTES de llamar a la IA', () => {
  const src = readFileSync(new URL('./comparativa-ia-servicio.ts', import.meta.url), 'utf8')
  const cuerpo = src.slice(src.indexOf('export async function preguntaIA'))
  const iDecide = cuerpo.indexOf('decidirPregunta(')
  const iIA = cuerpo.indexOf('iaTexto(')
  assert.ok(iDecide > 0 && iIA > 0, 'preguntaIA tiene que usar decidirPregunta e iaTexto')
  assert.ok(iDecide < iIA, 'el tope se decide antes de gastar IA')
  assert.match(cuerpo.slice(0, iDecide), /TIPO_PREGUNTA/, 'el recuento sale de los eventos de pregunta')
})
