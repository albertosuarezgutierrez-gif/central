import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ESTADOS_SINIESTRO,
  etiquetaEstadoSiniestro,
  ordenarHistorialSiniestros,
  resumirHistorialSiniestros,
  lugarSiniestro,
  descripcionSiniestro,
  siniestroAbierto,
  tonoEstadoSiniestro,
} from './siniestro-historial.ts'

test('el vocabulario son los CUATRO estados del enum de la BD', () => {
  assert.deepEqual([...ESTADOS_SINIESTRO], ['abierto', 'en_tramitacion', 'cerrado', 'rechazado'])
})

test('abierto = abierto o en tramitación, y nada más', () => {
  assert.equal(siniestroAbierto('abierto'), true)
  assert.equal(siniestroAbierto('en_tramitacion'), true)
  assert.equal(siniestroAbierto('cerrado'), false)
  assert.equal(siniestroAbierto('rechazado'), false)
})

test('normaliza caja y espacios: la BD manda el enum, pero nadie compara a mano', () => {
  assert.equal(siniestroAbierto(' EN_TRAMITACION '), true)
  assert.equal(tonoEstadoSiniestro('  Rechazado '), 'rechazado')
})

test('🚨 RECHAZADO no es CERRADO: cuatro palabras para cuatro cosas', () => {
  const etiquetas = ESTADOS_SINIESTRO.map(etiquetaEstadoSiniestro)
  assert.equal(new Set(etiquetas).size, 4, 'dos estados comparten etiqueta')
  // La palabra importa: «cerrado» le dice a alguien que se resolvió.
  assert.match(etiquetaEstadoSiniestro('rechazado'), /rechazad/i)
  assert.doesNotMatch(etiquetaEstadoSiniestro('rechazado'), /cerrad/i)
  assert.notEqual(tonoEstadoSiniestro('rechazado'), tonoEstadoSiniestro('cerrado'))
})

test('un estado desconocido NO cae a «cerrado»: sale tal cual', () => {
  assert.equal(etiquetaEstadoSiniestro('reabierto_por_la_compania'), 'reabierto_por_la_compania')
  // El tono sí tiene que elegir algo; elige el neutro, nunca «abierto».
  assert.equal(tonoEstadoSiniestro('reabierto_por_la_compania'), 'cerrado')
})

test('🚨 el historial ordena por fecha DESC y lo SIN FECHA va al final', () => {
  const dia = (d: string) => new Date(`${d}T10:00:00.000Z`)
  const orden = ordenarHistorialSiniestros([
    { id: 'sin-fecha', fechaHora: null },
    { id: 'viejo', fechaHora: dia('2023-05-08') },
    { id: 'nuevo', fechaHora: dia('2026-07-01') },
  ])
  assert.deepEqual(
    orden.map((s) => s.id),
    ['nuevo', 'viejo', 'sin-fecha'],
    'una fecha ausente no es ni reciente ni antigua: va al final, nunca arriba',
  )
})

test('ordenar no muta la lista que recibe', () => {
  const original = [{ id: 'a', fechaHora: null }, { id: 'b', fechaHora: new Date() }]
  ordenarHistorialSiniestros(original)
  assert.equal(original[0].id, 'a')
})

test('el resumen cuenta por TONO, así que rechazado no engorda «cerrados»', () => {
  const r = resumirHistorialSiniestros([
    { estado: 'abierto' },
    { estado: 'en_tramitacion' },
    { estado: 'cerrado' },
    { estado: 'cerrado' },
    { estado: 'rechazado' },
  ])
  assert.deepEqual(r, { total: 5, abiertos: 2, cerrados: 2, rechazados: 1 })
})

test('sin siniestros el resumen es todo ceros — «no nos consta», no «no has tenido»', () => {
  assert.deepEqual(resumirHistorialSiniestros([]), {
    total: 0,
    abiertos: 0,
    cerrados: 0,
    rechazados: 0,
  })
})

// ─── DÓNDE pasó ──────────────────────────────────────────────────────────────

test('la ciudad en MAYÚSCULAS de la compañía se lee, y la provincia es un CÓDIGO', () => {
  // Los dos valores son literales de la cartera (07/09/2026).
  assert.equal(lugarSiniestro({ ciudad: 'DOS HERMANAS', provincia: '41' }), 'Dos Hermanas (Sevilla)')
  assert.equal(lugarSiniestro({ ciudad: 'ALCALA DE GUADAIRA', provincia: '41' }), 'Alcala de Guadaira (Sevilla)')
  assert.equal(lugarSiniestro({ ciudad: 'CHIPIONA', provincia: '11' }), 'Chipiona (Cádiz)')
})

test('🚨 la provincia NO se pinta como código: «41» no es un dato para nadie', () => {
  const l = lugarSiniestro({ ciudad: 'SEVILLA', provincia: '41' })
  assert.ok(l !== null && !l.includes('41'), `el código se ha colado en «${l}»`)
})

test('la ciudad y su provincia homónimas no se repiten', () => {
  assert.equal(lugarSiniestro({ ciudad: 'SEVILLA', provincia: '41' }), 'Sevilla')
})

test('un lugar a medias se da a medias, y sin lugar es null (no una cadena vacía)', () => {
  assert.equal(lugarSiniestro({ ciudad: null, provincia: '41' }), 'Sevilla')
  assert.equal(lugarSiniestro({ ciudad: 'CAMAS', provincia: null }), 'Camas')
  assert.equal(lugarSiniestro({ ciudad: null, provincia: null }), null)
  assert.equal(lugarSiniestro({ ciudad: '  ', provincia: '  ' }), null)
})

test('un nombre ya bien escrito no se toca (una póliza aportada trae texto de una IA)', () => {
  assert.equal(lugarSiniestro({ ciudad: 'A Coruña', provincia: 'A Coruña' }), 'A Coruña')
  assert.equal(lugarSiniestro({ ciudad: 'Camas', provincia: 'Sevilla' }), 'Camas (Sevilla)')
})

test('una provincia que no existe no inventa nombre', () => {
  assert.equal(lugarSiniestro({ ciudad: null, provincia: '99' }), null)
})

// ─── QUÉ pasó ────────────────────────────────────────────────────────────────

test('la descripción se devuelve ENTERA: media frase es otro relato', () => {
  const largo =
    'Vehículo asegurado estacionado, vehículo contrario haciendo maniobra colisiona con el vehículo asegurado.'
  assert.equal(descripcionSiniestro(largo), largo)
})

test('🚨 un valor de cajón NO es una descripción: es un renglón en blanco con aspecto de dato', () => {
  for (const v of [null, undefined, '', '   ', '-', '—', '··']) {
    assert.equal(descripcionSiniestro(v), null, `«${v}» no puede pasar por descripción`)
  }
})
