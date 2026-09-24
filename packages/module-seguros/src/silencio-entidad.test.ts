// Guardián del vigía de silencio por compañía.
//
// 🚨 Los cuatro fixtures principales NO están inventados: son la medida real
// contra la BD del CRM el 05/09/2026 (ver la tabla del docstring del módulo).
// Es la regla del repo aplicada a un umbral: un baremo se calibra contra datos
// reales, no contra el caso que uno se imagina — escribir el fixture a mano es
// escribirlo con la misma suposición que el código.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  veredictoEntidad,
  silencioPorEntidad,
  motivosSilencio,
  MIN_HUECOS,
  SUELO_DIAS,
  type EntidadIngesta,
} from './silencio-entidad.ts'

/** Medido el 05/09/2026 contra `cima_ficheros` + `polizas` del CRM. */
const REAL: EntidadIngesta[] = [
  { entidad: 'C0058', diasSinFichero: 74, huecoMaximo: 2, huecosObservados: 2, vivas: 64, vencidasEnSilencio: 7, vencen90d: 12 },
  { entidad: 'C0109', diasSinFichero: 12, huecoMaximo: 19, huecosObservados: 13, vivas: 26, vencidasEnSilencio: 0, vencen90d: 5 },
  { entidad: 'C0613', diasSinFichero: 11, huecoMaximo: 23, huecosObservados: 1, vivas: 1, vencidasEnSilencio: 0, vencen90d: 0 },
  { entidad: 'C0468', diasSinFichero: 6, huecoMaximo: 9, huecosObservados: 24, vivas: 19, vencidasEnSilencio: 0, vencen90d: 0 },
]

test('sobre los datos REALES acusa a Mapfre y NO acusa a nadie más', () => {
  const r = silencioPorEntidad(REAL)!
  const porEntidad = Object.fromEntries(r.map(e => [e.entidad, e.veredicto]))
  assert.equal(porEntidad['C0058'], 'silencio', 'Mapfre: 74 días con su récord en 2')
  assert.equal(porEntidad['C0109'], 'ok', 'Allianz: 12 días dentro de su hueco de 19')
  assert.equal(porEntidad['C0468'], 'ok', 'Occident: 6 días dentro de su hueco de 9')
  // Reale manda cada 23 días y solo tiene UN hueco observado: no se puede
  // juzgar. Decir «ok» sería absolver sin haber mirado.
  assert.equal(porEntidad['C0613'], 'sin_base')
})

test('el silencio va primero en la lista, y las carteras grandes antes', () => {
  const r = silencioPorEntidad(REAL)!
  assert.equal(r[0].entidad, 'C0058')
})

// 🚨 Este es el test que fija la calibración de MIN_HUECOS. Mapfre tiene solo
// DOS huecos observados (sus 14 ficheros se agolpan en pocos días); exigir tres
// habría dejado mudo justo el caso que motivó el módulo.
test('MIN_HUECOS no puede subir por encima de la muestra de Mapfre', () => {
  assert.ok(MIN_HUECOS <= 2, 'con MIN_HUECOS=3 el caso fundacional no habría saltado')
})

test('la renovación perdida alarma SIN necesidad de baremo', () => {
  // Sin histórico utilizable, pero con una pérdida medida: es un hecho, no una
  // inferencia, y no puede quedar tapado por «no tengo muestra».
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 40, huecoMaximo: null, huecosObservados: 0,
    vivas: 3, vencidasEnSilencio: 2, vencen90d: null,
  })
  assert.equal(v.veredicto, 'silencio')
  assert.match(v.motivos.join(' '), /2 renovación/)
})

test('sin muestra y sin pérdida NO se absuelve: es «sin_base», nunca «ok»', () => {
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 40, huecoMaximo: null, huecosObservados: 0,
    vivas: 3, vencidasEnSilencio: 0, vencen90d: null,
  })
  assert.equal(v.veredicto, 'sin_base')
  assert.ok(v.motivos.length > 0, 'un hueco de conocimiento tiene que decirse')
})

test('`vencidasEnSilencio: null` (no comprobado) NO cuenta como pérdida', () => {
  // Es la regla NULL≠0 por su lado peligroso: un `null` tratado como «hay
  // pérdida» convertiría cada consulta caída en una alarma, y el vigía se
  // silenciaría solo en una semana.
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 5, huecoMaximo: 9, huecosObservados: 24,
    vivas: 19, vencidasEnSilencio: null, vencen90d: null,
  })
  assert.equal(v.veredicto, 'ok')
})

test('el suelo de días impide que un puente sea una avería', () => {
  // Manda a diario (hueco máximo 1) y lleva 5 días callada: 5 > 1×2, pero por
  // debajo del suelo no se alarma.
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: SUELO_DIAS - 1, huecoMaximo: 1, huecosObservados: 30,
    vivas: 10, vencidasEnSilencio: 0, vencen90d: 0,
  })
  assert.equal(v.veredicto, 'ok')
  const w = veredictoEntidad({ ...v, diasSinFichero: SUELO_DIAS })
  assert.equal(w.veredicto, 'silencio')
})

test('la que no ha mandado nunca no se confunde con la que se ha callado', () => {
  const v = veredictoEntidad({
    entidad: 'C0072', diasSinFichero: null, huecoMaximo: null, huecosObservados: 0,
    vivas: 0, vencidasEnSilencio: null, vencen90d: null,
  })
  assert.equal(v.veredicto, 'nunca')
})

test('la lista a null es «no se ha podido mirar», jamás «todas bien»', () => {
  assert.equal(silencioPorEntidad(null), null)
  const m = motivosSilencio(null)
  assert.equal(m.length, 1)
  assert.match(m[0], /No se ha podido comprobar/)
})

test('los motivos NO enumeran a las compañías sanas', () => {
  const m = motivosSilencio(silencioPorEntidad(REAL))
  assert.ok(!m.some(x => x.includes('C0468')), 'Occident está bien: no genera línea')
  assert.ok(m.some(x => x.includes('C0058')), 'Mapfre sí')
  assert.ok(m.some(x => x.includes('C0613')), 'y el hueco de conocimiento de Reale también')
})

test('el aviso de Mapfre dice el tamaño de la cartera y lo que viene', () => {
  const texto = veredictoEntidad(REAL[0]).motivos.join(' · ')
  assert.match(texto, /64 póliza/)
  assert.match(texto, /12 más vencen en 90 días/)
  assert.match(texto, /su mayor hueco hasta ahora eran 2/)
})
