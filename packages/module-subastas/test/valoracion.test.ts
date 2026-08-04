import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ajusteEstado,
  granularidadZona,
  referenciaOrientativa,
  superficieValorable,
} from '../src/valoracion.ts'
import { evaluarOportunidad } from '../src/scoring.ts'
import { evaluarFlip } from '../src/flip.ts'
import { decidirAviso } from '../src/aviso.ts'
import type { SubastaInmueble } from '../src/types.ts'

const ANIO = 2026

// ── Granularidad de la zona ─────────────────────────────────────────────────

test('la mediana de una ciudad desigual es solo orientativa', () => {
  const g = granularidadZona('SEVILLA (buscador Fotocasa)', 'SEVILLA')
  assert.equal(g, 'municipio_heterogeneo')
  assert.equal(referenciaOrientativa(g), true)
})

test('Jerez también: es grande y cambia mucho por barrio', () => {
  assert.equal(granularidadZona('JEREZ DE LA FRONTERA (buscador Fotocasa)', 'Jerez de la Frontera'), 'municipio_heterogeneo')
})

test('con distrito dentro de la capital SÍ vale', () => {
  const g = granularidadZona('SEVILLA · san-pablo-santa-justa', 'SEVILLA')
  assert.equal(g, 'distrito')
  assert.equal(referenciaOrientativa(g), false)
})

test('un pueblo pequeño es homogéneo: su mediana municipal vale', () => {
  assert.equal(granularidadZona('Isla Cristina (buscador Fotocasa)', 'Isla Cristina'), 'municipio')
})

test('un núcleo de playa del corpus propio es la referencia más fina', () => {
  assert.equal(granularidadZona('Matalascañas', 'Almonte'), 'nucleo')
})

test('sin etiqueta de zona no se adivina nada', () => {
  assert.equal(granularidadZona(null, 'SEVILLA'), null)
  assert.equal(referenciaOrientativa(null), false)
})

// ── Superficie ──────────────────────────────────────────────────────────────

test('cuando los metros discrepan se toma la cifra que NO infla', () => {
  const s = superficieValorable(117.1, 127)!
  assert.equal(s.m2, 117.1)
  assert.equal(s.fuente, 'registral')
  assert.match(s.aviso!, /no infla/)
})

test('si apenas discrepan no se molesta al usuario con un aviso', () => {
  const s = superficieValorable(100, 101)!
  assert.equal(s.aviso, null)
  assert.equal(s.fuente, 'coincidentes')
})

test('con una sola cifra se usa esa', () => {
  assert.equal(superficieValorable(null, 90)?.fuente, 'catastro')
  assert.equal(superficieValorable(90, null)?.fuente, 'registral')
  assert.equal(superficieValorable(null, null), null)
})

// ── Estado ──────────────────────────────────────────────────────────────────

test('un edificio de los 60 no vale lo que el anuncio medio de su zona', () => {
  const a = ajusteEstado(1965, ANIO)
  assert.equal(a.factor, 0.8)
  assert.equal(a.nivel, 'integral')
  assert.match(a.nota!, /1965/)
})

test('la obra reciente no se penaliza', () => {
  assert.equal(ajusteEstado(2015, ANIO).factor, 1)
})

test('sin año no se inventa penalización, pero se avisa', () => {
  const a = ajusteEstado(null, ANIO)
  assert.equal(a.factor, 1)
  assert.match(a.nota!, /puede quedar alto/)
})

// ── El caso real: Avenida Pedro Romero (SUB-JA-2026-263723) ─────────────────

const PEDRO_ROMERO: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-263723',
  fuente: 'boe',
  tipo: 'judicial',
  provincia: 'Sevilla',
  municipio: 'SEVILLA',
  superficie: 117.1,
  superficieCatastro: 127,
  anioConstruccion: 1965,
  valorSubasta: 77746.93,
  precioM2Mercado: 2635,
  muestraMercado: 25,
  zonaMercado: 'SEVILLA (buscador Fotocasa)',
  situacionPosesoria: 'libre',
  descripcion: 'VIVIENDA en planta séptima',
}

test('el valor que salía (334.645€) se corrige a la baja por los tres sitios', () => {
  const o = evaluarOportunidad(PEDRO_ROMERO, undefined, undefined, ANIO)
  // Antes: 2.635 × 127 = 334.645. Ahora: 2.635 × 117,10 × 0,8.
  assert.equal(o.valorMercadoReformado, Math.round(2635 * 117.1))
  assert.equal(o.valorMercado, Math.round(2635 * 117.1 * 0.8))
  assert.ok(o.valorMercado! < 250_000, `esperaba bastante menos de 334.645, salió ${o.valorMercado}`)
  assert.equal(o.valorOrientativo, true)
})

test('y se dice por qué, en la ficha, sin que haya que adivinarlo', () => {
  const o = evaluarOportunidad(PEDRO_ROMERO, undefined, undefined, ANIO)
  assert.ok(o.avisos.some((a) => /mediana de TODO el municipio/.test(a)))
  assert.ok(o.avisos.some((a) => /no cuadran/.test(a)))
  assert.ok(o.avisos.some((a) => /1965/.test(a)))
})

test('ya no se declara «flip apto» con una referencia de ciudad entera', () => {
  const o = evaluarOportunidad(PEDRO_ROMERO, undefined, undefined, ANIO)
  const f = evaluarFlip(PEDRO_ROMERO, o, ANIO)
  assert.equal(f.apto, false)
  assert.ok(f.motivos.some((m) => /mediana de todo el municipio/.test(m)))
})

test('el flip compara contra el valor REFORMADO, no contra el penalizado', () => {
  // Si usara el valor ya descontado por estado, se pagaría dos veces la reforma
  // (una en el descuento del €/m² y otra en `reformaEstimada`).
  const o = evaluarOportunidad(PEDRO_ROMERO, undefined, undefined, ANIO)
  const f = evaluarFlip(PEDRO_ROMERO, o, ANIO)
  const costesVenta = Math.round(o.valorMercadoReformado! * 0.03)
  assert.equal(f.costesVenta, costesVenta)
})

test('y no interrumpe por Telegram aunque los papeles estén limpios', () => {
  const d = decidirAviso({
    rentable: true,
    valorOrientativo: true,
    semaforo: 'verde',
    cargasSubsistentes: 0,
    cargasConocidas: true,
    documentosLeidos: true,
    diasParaCierre: 20,
  })
  assert.equal(d.decision, 'silenciar')
  assert.match(d.motivo, /mediana de todo el municipio/)
})

test('con una referencia del barrio, el mismo piso sí puede avisar', () => {
  const conDistrito = { ...PEDRO_ROMERO, zonaMercado: 'SEVILLA · san-pablo-santa-justa' }
  const o = evaluarOportunidad(conDistrito, undefined, undefined, ANIO)
  assert.equal(o.valorOrientativo, false)
  const d = decidirAviso({
    rentable: true,
    valorOrientativo: o.valorOrientativo,
    semaforo: 'verde',
    cargasSubsistentes: 0,
    cargasConocidas: true,
    documentosLeidos: true,
    diasParaCierre: 20,
  })
  assert.equal(d.decision, 'avisar')
})

test('una tasación publicada no se toca: los correctivos son solo para la estimación', () => {
  const conTasacion = { ...PEDRO_ROMERO, tasacion: 150_000 }
  const o = evaluarOportunidad(conTasacion, undefined, undefined, ANIO)
  assert.equal(o.valorMercado, 150_000)
  assert.equal(o.valorOrientativo, false)
  assert.equal(o.origenValor, 'tasacion')
})
