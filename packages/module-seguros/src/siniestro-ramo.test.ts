import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RAMOS_SINIESTRO,
  RAMOS_SINIESTRO_CON_CATALOGO,
  CAMPOS_POR_RAMO_SINIESTRO,
  camposDeRamoSiniestro,
  normalizarDatosRamoSiniestro,
} from './siniestro-ramo.ts'

test('siniestro-ramo: todos los ramos de RAMOS_SINIESTRO tienen entrada en el catálogo (aunque sea vacía)', () => {
  for (const ramo of RAMOS_SINIESTRO) {
    assert.ok(ramo in CAMPOS_POR_RAMO_SINIESTRO, `falta el ramo ${ramo}`)
  }
  assert.deepEqual([...RAMOS_SINIESTRO_CON_CATALOGO].sort(), [...RAMOS_SINIESTRO].sort())
})

test('siniestro-ramo: un ramo desconocido o null da lista vacía, nunca lanza', () => {
  assert.deepEqual(camposDeRamoSiniestro('no_existe'), [])
  assert.deepEqual(camposDeRamoSiniestro(null), [])
  assert.deepEqual(camposDeRamoSiniestro(undefined), [])
})

test('siniestro-ramo: auto y moto comparten el mismo catálogo de dinámica de accidente', () => {
  assert.deepEqual(camposDeRamoSiniestro('auto'), camposDeRamoSiniestro('moto'))
  assert.ok(camposDeRamoSiniestro('auto').some((c) => c.id === 'tipoColision'))
})

test('siniestro-ramo: otros no tiene catálogo propio (cajón de sastre, ya cubierto por la cabecera)', () => {
  assert.deepEqual(camposDeRamoSiniestro('otros'), [])
})

test('siniestro-ramo: normalizarDatosRamoSiniestro descarta claves fuera de catálogo y valores de cajón', () => {
  const r = normalizarDatosRamoSiniestro('auto', {
    tipoColision: 'trasera',
    campoQueNoExiste: 'x',
    tallerNombre: 'no consta',
    existeAtestado: 'Sí',
  })
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.datos, { tipoColision: 'trasera', existeAtestado: true })
  }
})

test('siniestro-ramo: un triestado que no es sí/no/no-lo-sé no se escribe (nunca se colapsa a false)', () => {
  const r = normalizarDatosRamoSiniestro('auto', { existeAtestado: 'todavía no lo sé' })
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.datos, null)
})

test('siniestro-ramo: una opción fuera de la lista del campo es inválida', () => {
  const r = normalizarDatosRamoSiniestro('auto', { tipoColision: 'meteorito' })
  assert.deepEqual(r, { ok: false, error: 'campo_invalido:tipoColision' })
})

test('siniestro-ramo: una fecha inventada (31 de febrero) es inválida, no se auto-corrige', () => {
  const r = normalizarDatosRamoSiniestro('responsabilidad_civil', { fechaHechoCausante: '2026-02-31' })
  assert.deepEqual(r, { ok: false, error: 'campo_invalido:fechaHechoCausante' })
})

test('siniestro-ramo: sin datos que queden tras normalizar, la columna es null (nunca {})', () => {
  const r = normalizarDatosRamoSiniestro('hogar', { tipoInmueble: 'no aplica' })
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.datos, null)
})

test('siniestro-ramo: un dinero fuera de rango es inválido', () => {
  const r = normalizarDatosRamoSiniestro('responsabilidad_civil', { cuantiaReclamadaInicial: -5 })
  assert.deepEqual(r, { ok: false, error: 'campo_invalido:cuantiaReclamadaInicial' })
})

test('siniestro-ramo: vida/salud/decesos no piden diagnóstico ni centro médico (art. 9 RGPD)', () => {
  const camposPersonales = new Set(camposDeRamoSiniestro('vida').map((c) => c.id))
  for (const prohibido of ['diagnostico', 'centroMedico', 'medicoTratante', 'codigoCie']) {
    assert.ok(!camposPersonales.has(prohibido), `no debería existir el campo ${prohibido}`)
  }
})

test('siniestro-ramo: entrada que no es un objeto es inválida', () => {
  assert.deepEqual(normalizarDatosRamoSiniestro('auto', 'texto'), { ok: false, error: 'datos_ramo_invalidos' })
  assert.deepEqual(normalizarDatosRamoSiniestro('auto', ['a']), { ok: false, error: 'datos_ramo_invalidos' })
})

test('siniestro-ramo: sin entrada (null/undefined), datos es null', () => {
  assert.deepEqual(normalizarDatosRamoSiniestro('auto', null), { ok: true, datos: null })
  assert.deepEqual(normalizarDatosRamoSiniestro('auto', undefined), { ok: true, datos: null })
})
