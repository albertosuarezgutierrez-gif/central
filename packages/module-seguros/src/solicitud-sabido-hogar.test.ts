// Cepo (26/10/2026): el enlace de hogar pregunta SOLO lo que falta y nunca enseña lo sabido.
import test from 'node:test'
import assert from 'node:assert/strict'
import { NADA_CONOCIDO, camposSolicitud, validarRespuestas } from './solicitud-datos.ts'
import { camposHogarSinLoSabido, clavesSabidasHogar } from './solicitud-sabido-hogar.ts'

const HOGAR = camposSolicitud('hogar', NADA_CONOCIDO)

/** Cliente antiguo de hogar: dirección y vivienda sabidas, faltan rejas y alarma (el caso de Alberto). */
const SIN_REJAS_NI_ALARMA: Record<string, unknown> = {
  cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', tipoViaId: 'CL', nombreVia: 'SOCORRO', numeroVia: '24', planta: '1', puertaVivienda: 'A',
  tipoVivienda: 'MiddleFloor', metrosCuadrados: 90, anioConstruccion: 1975, habitaciones: 3, uso: 'Owner', propietarioEsTomador: true,
  ocupacion: 'MainResidence', urbanizacionCerrada: false, puertaPrincipalBlindada: true, capitalContenido: 30000, capitalContinente: 120000,
  hipoteca: false, conMadera: false, anioUltimaReforma: 2010, vigilante: false, joyasEnCajaFuerte: 0, joyasFueraDeCaja: 0, objetosDeValor: 0,
  perrosPeligrosos: 0,
  alarma: null, ventanasSeguras: null,
}

test('caso Alberto: de la vivienda solo se pregunta lo que falta (rejas y alarma)', () => {
  const claves = camposHogarSinLoSabido(HOGAR, SIN_REJAS_NI_ALARMA).map((c) => c.clave)
  assert.ok(claves.includes('alarma'))
  assert.ok(claves.includes('ventanasSeguras'))
  for (const fuera of ['vivienda', 'confirmaCatastro', 'tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'habitaciones', 'regimen', 'usoVivienda', 'puertaPrincipalBlindada', 'tramoContenido', 'hipoteca']) {
    assert.ok(!claves.includes(fuera), `no debería preguntar ${fuera}`)
  }
  // Identidad, seguro actual, fecha de efecto y comentario no tienen destino en la vivienda: se siguen pidiendo.
  for (const dentro of ['dni', 'fechaNacimiento', 'tieneSeguro', 'fechaEfecto', 'comentario']) assert.ok(claves.includes(dentro), dentro)
})

test('lo oculto nunca viaja: los campos que quedan no llevan valores de la vivienda', () => {
  const quedan = camposHogarSinLoSabido(HOGAR, SIN_REJAS_NI_ALARMA)
  assert.ok(quedan.every((c) => c.actual === undefined))
  assert.ok(!JSON.stringify(quedan).includes('SOCORRO'))
})

test('lo oculto tampoco se exige al validar (se valida con los mismos campos)', () => {
  const quedan = camposHogarSinLoSabido(HOGAR, SIN_REJAS_NI_ALARMA)
  const v = validarRespuestas(quedan, { dni: '12345678Z', fechaNacimiento: '1980-01-01', alarma: false, ventanasSeguras: true, tieneSeguro: false }, new Date())
  assert.equal(v.ok, true, JSON.stringify(v))
})

test('sin bloque (null) o vacío: se pregunta TODO (null = no se sabe, nunca «no hay»)', () => {
  assert.equal(camposHogarSinLoSabido(HOGAR, null).length, HOGAR.length)
  const vacio = Object.fromEntries(Object.keys(SIN_REJAS_NI_ALARMA).map((k) => [k, null]))
  assert.equal(camposHogarSinLoSabido(HOGAR, vacio).length, HOGAR.length)
  assert.equal(camposHogarSinLoSabido(HOGAR, { ...vacio, nombreVia: '  ', tipoVivienda: '' }).length, HOGAR.length)
})

test('dirección a medias (sin número) se vuelve a pedir, y con ella la tarjeta del Catastro', () => {
  const s = clavesSabidasHogar(HOGAR, { ...SIN_REJAS_NI_ALARMA, numeroVia: null, tipoVivienda: null })
  assert.ok(!s.has('vivienda'))
  assert.ok(!s.has('confirmaCatastro'))
})

test('hipoteca sabida «sí» con el banco sin saber: se vuelve a preguntar (si no, el banco nunca se enseña)', () => {
  const s = clavesSabidasHogar(HOGAR, { ...SIN_REJAS_NI_ALARMA, hipoteca: true, bancoHipoteca: null })
  assert.ok(!s.has('hipoteca'))
  assert.ok(clavesSabidasHogar(HOGAR, { ...SIN_REJAS_NI_ALARMA, hipoteca: false }).has('hipoteca'))
})

test('`false` y `0` son respuestas: se ocultan', () => {
  const s = clavesSabidasHogar(HOGAR, { ...SIN_REJAS_NI_ALARMA, alarma: false, perrosPeligrosos: 0 })
  assert.ok(s.has('alarma'))
  assert.ok(s.has('perrosPeligrosos'))
})
