import assert from 'node:assert/strict'
import test from 'node:test'

import { BIEN_VACIO, bienTieneAlgo, describirBien, describirBienConGemela } from './bien-asegurado.ts'
import { camposVisibles } from './acceso.ts'
import { camposDeAlcance } from './autorizacion.ts'

test('un vehículo sale como marca, modelo y matrícula, y sin ubicación', () => {
  const b = describirBien('auto', { marca: 'SEAT', modelo: 'Ibiza', matricula: '1234ABC' })
  assert.equal(b.cosa, 'SEAT Ibiza · 1234ABC')
  assert.equal(b.ubicacion, null)
})

test('un inmueble sale como dirección + CP + localidad, y NUNCA como `cosa`', () => {
  const b = describirBien('hogar', { direccion: 'Calle Falsa 1', cp: '41003', localidad: 'Sevilla' })
  assert.equal(b.ubicacion, 'Calle Falsa 1, 41003 Sevilla')
  // 🚨 El cepo: si la dirección se colase por `cosa`, la vería un tercero con
  // el alcance más bajo, porque `bien` es visible desde `tarjeta`.
  assert.equal(b.cosa, null)
})

test('la dirección IDENTIFICA el inmueble: se ve desde el nivel más bajo', () => {
  // 🚨 Decisión de Alberto (07/09/2026), y este cepo está INVERTIDO a propósito
  // respecto al que hubo aquí hasta esa fecha: antes afirmaba que un tercero de
  // una persona física NO veía la dirección nunca. El porqué del cambio, en el
  // docblock de `direccionRiesgo` (`acceso.ts`) — en un hogar la dirección hace
  // de matrícula, y sin ella dos pólizas de la misma compañía son la misma fila.
  for (const alcance of ['ver', 'ver_economico'] as const) {
    assert.equal(camposDeAlcance(alcance, 'fisica').direccionRiesgo, true, `${alcance} capaba la dirección`)
  }
  assert.equal(camposVisibles('tarjeta').direccionRiesgo, true)
})

test('🚨 pero lo que SÍ sigue capado a un tercero no se abrió de rebote', () => {
  // El cepo que importa ahora: al sacar `direccionRiesgo` de `NUNCA_A_UN_TERCERO`
  // era fácil llevarse por delante a sus vecinos. Estos NO se tocan.
  const ve = camposDeAlcance('ver_economico', 'fisica')
  for (const campo of ['iban', 'dniTomador', 'documentos', 'siniestros', 'autorizarTerceros'] as const) {
    assert.equal(ve[campo], false, `${campo} se abrió a un tercero de una persona física`)
  }
})

test('la de una SOCIEDAD también, desde `ver_economico`', () => {
  assert.equal(camposDeAlcance('ver_economico', 'juridica').direccionRiesgo, true)
})

test('la identificación de la COSA se ve desde el nivel más bajo', () => {
  // El conductor de la furgoneta tiene que saber cuál es la furgoneta.
  assert.equal(camposVisibles('tarjeta').bien, true)
  assert.equal(camposVisibles('completo').direccionRiesgo, true)
})

test('🚨 un valor todavía CIFRADO no se pinta jamás: es un «no lo sé», no un dato', () => {
  // Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el sobre tal cual. Si esto
  // no lo anulase, la póliza de hogar se titularía con el criptograma — y no
  // fallaría nada: saldría.
  const b = describirBien('hogar', {
    direccion: 'v1:FUMEZniYx4Hh2jjo:FuPCNpibIpu4YFgo3hFm7oOx12zWJ6z842ED6S67:ShDbzH6ve2oAr+eADLuC5w==',
    localidad: 'SEVILLA',
    cp: '41003',
  })
  assert.ok(!(b.ubicacion ?? '').includes('v1:'), 'se coló el sobre cifrado en la pantalla')
  // Lo que sí es legible se sigue enseñando: anular la calle no borra la ciudad.
  assert.equal(b.ubicacion, '41003 SEVILLA')
})

test('la GEMELA solo entra cuando la fila viva no dice NADA, y entra entera', () => {
  const gemela = { direccion: 'Calle Falsa 1', cp: '41003', localidad: 'Sevilla', metrosCuadrados: 76 }

  // Caso real medido el 07/09/2026: la fila de CIMA sin `datos_especificos`.
  const rescatada = describirBienConGemela('hogar', null, gemela)
  assert.equal(rescatada.ubicacion, 'Calle Falsa 1, 41003 Sevilla')
  assert.deepEqual(rescatada.detalles, ['76 m²'])

  // 🚨 Y el cepo del otro lado: si la viva YA describe algo, la gemela no toca
  // nada. Mezclar clave a clave cruzaría dos contratos y el resultado sería
  // plausible, que es la forma cara de equivocarse.
  const propia = describirBienConGemela('hogar', { direccion: 'Calle Verdadera 9' }, gemela)
  assert.equal(propia.ubicacion, 'Calle Verdadera 9')
  assert.deepEqual(propia.detalles, [], 'se colaron los metros de la gemela en la póliza buena')

  // Sin gemela no pasa nada: se calla, como siempre.
  assert.equal(bienTieneAlgo(describirBienConGemela('hogar', null, null)), false)
})

test('las claves internas del volcado (`_algo`) no se leen jamás', () => {
  const b = describirBien('hogar', { _avant: 'REF-INTERNA-9', direccion: 'Calle Falsa 1' })
  assert.equal(b.ubicacion, 'Calle Falsa 1')
  assert.ok(!JSON.stringify(b).includes('REF-INTERNA-9'))
})

test('los valores de cajón se anulan, no se pintan', () => {
  for (const v of ['', '   ', 'n/a', 'no consta', 'desconocido', 'pendiente']) {
    const b = describirBien('auto', { marca: v, modelo: v, matricula: v })
    assert.equal(b.cosa, null, `«${v}» se coló como matrícula`)
  }
})

test('un jsonb que no es un objeto no revienta: sale vacío', () => {
  for (const v of [null, undefined, 42, 'texto', ['a'], true]) {
    assert.deepEqual(describirBien('auto', v), BIEN_VACIO)
  }
})

test('un ramo sin bien descriptible calla, no dice «no tiene»', () => {
  const b = describirBien('vida', {})
  assert.equal(bienTieneAlgo(b), false)
})

test('los metros y el año solo salen si son creíbles', () => {
  assert.deepEqual(describirBien('hogar', { metrosCuadrados: 0, anioConstruccion: 1 }).detalles, [])
  assert.deepEqual(describirBien('hogar', { metrosCuadrados: 92, anioConstruccion: 1975 }).detalles, [
    '92 m²',
    'Construido en 1975',
  ])
})

test('el ramo desconocido se resuelve por las CLAVES, no se pierde', () => {
  // Un ramo que no esté en las dos listas pero traiga matrícula sigue siendo un
  // vehículo: el catálogo de ramos crece y este fichero no puede quedarse atrás
  // en silencio.
  assert.equal(describirBien('lo-que-sea', { matricula: '1234ABC' }).cosa, '1234ABC')
  assert.equal(describirBien('lo-que-sea', { direccion: 'Calle Falsa 1' }).ubicacion, 'Calle Falsa 1')
})
