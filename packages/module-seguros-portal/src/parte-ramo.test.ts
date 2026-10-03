import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CAMPOS_POR_RAMO_SINIESTRO, TIPOS_SEGURO } from '@central/module-seguros'

import {
  CAMPOS_PARTE_POR_RAMO,
  camposParteDeRamo,
  datosClaveParte,
  lineasDatosRamoParte,
  normalizarDatosRamoParte,
} from './parte-ramo.ts'
import { aplicarRamoAlParte, normalizarParte } from './parte-siniestro.ts'

const CTX = { hayHeridos: true, hayTerceros: true, tipoSiniestro: 'robo' }

test('todos los ramos tienen entrada; las claves reutilizadas existen en el catálogo del corredor con el MISMO tipo', () => {
  for (const r of TIPOS_SEGURO) {
    assert.ok(Array.isArray(CAMPOS_PARTE_POR_RAMO[r]), r)
    const delCorredor = new Map(CAMPOS_POR_RAMO_SINIESTRO[r].map((c) => [c.id, c]))
    for (const c of CAMPOS_PARTE_POR_RAMO[r]) {
      const base = delCorredor.get(c.id)
      if (base) assert.equal(c.tipo, base.tipo, `${r}/${c.id}: tipo distinto del corredor`)
    }
  }
})

test('🚨 nada de tramitación de la compañía en el formulario del cliente', () => {
  const prohibidas = /perito|tramitador|reserva|indemniz|pago|iban|cobertura|garant|expediente|culpabilidad|abogado|juzgado|modalidadCobro/i
  for (const r of TIPOS_SEGURO) for (const c of CAMPOS_PARTE_POR_RAMO[r]) assert.doesNotMatch(c.id, prohibidas, `${r}/${c.id}`)
})

test('normalización por ramo: descarta las claves de OTRO ramo y las desconocidas', () => {
  const d = normalizarDatosRamoParte(
    'hogar',
    { averiaActiva: 'si', existeAtestado: 'si', inventada: 'x', culpabilidad: 'propia', __proto__: { a: 1 } },
    CTX,
  )
  assert.deepEqual(d, { averiaActiva: true })
  assert.equal(normalizarDatosRamoParte(null, { averiaActiva: 'si' }, CTX), null, 'sin ramo no entra nada')
  assert.equal(normalizarDatosRamoParte('hogar', 'texto', CTX), null)
  assert.equal(normalizarDatosRamoParte('hogar', {}, CTX), null, 'nada contestado → null, no {}')
})

test('triestado: «no lo sé» es clave AUSENTE, nunca false', () => {
  const d = normalizarDatosRamoParte('auto', { existeAtestado: 'nolose', existeDeclaracionAmistosa: 'No', culpaPropiaDeclarada: 'Sí' }, CTX)
  assert.deepEqual(d, { existeDeclaracionAmistosa: false, culpaPropiaDeclarada: true })
  assert.equal(Object.hasOwn(d ?? {}, 'existeAtestado'), false)
})

test('opción fuera de lista y texto largo se descartan sin tumbar el resto', () => {
  const d = normalizarDatosRamoParte('auto', { cuerpoPolicial: 'swat', existeAtestado: true }, CTX)
  assert.deepEqual(d, { existeAtestado: true })
  const v = normalizarDatosRamoParte('vida', { personaAfectada: 'x'.repeat(301) }, CTX)
  assert.equal(v, null)
})

test('condiciones: sin «Sí» a heridos/terceros o sin el tipo, la lista/campo se descarta', () => {
  const entrada = {
    lesionados: [{ nombre: 'Ana' }],
    afectados: [{ nombre: 'Vecino 2ºB' }],
    denunciaPresentada: 'si',
  }
  assert.equal(
    normalizarDatosRamoParte('hogar', entrada, { hayHeridos: null, hayTerceros: false, tipoSiniestro: 'agua' }),
    null,
  )
  const d = normalizarDatosRamoParte('hogar', entrada, CTX)
  assert.deepEqual(d, { denunciaPresentada: true, afectados: [{ nombre: 'Vecino 2ºB' }], lesionados: [{ nombre: 'Ana' }] })
})

test('listas: tope de elementos, longitudes, subcampos ajenos fuera, filas vacías fuera', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ nombre: `V${i}`, telefono: '600 11 22 33', raro: 'x' }))
  const d = normalizarDatosRamoParte('hogar', { afectados: [...muchos] }, CTX)
  const lista = d?.afectados as Record<string, unknown>[]
  assert.equal(lista.length, 10)
  assert.deepEqual(lista[0], { nombre: 'V0', telefono: '600 11 22 33' })
  const e = normalizarDatosRamoParte(
    'auto',
    { contrarios: [{}, { matricula: 'X'.repeat(16), telefono: 'llámame', conductor: ' Luis ' }, 'no-objeto'] },
    CTX,
  )
  assert.deepEqual(e, { contrarios: [{ conductor: 'Luis' }] })
})

test('selección múltiple: solo opciones válidas, sin repetir, en el orden del catálogo', () => {
  const d = normalizarDatosRamoParte('hogar', { estanciasAfectadas: ['suelo', 'cocina', 'suelo', 'nave'] }, CTX)
  assert.deepEqual(d, { estanciasAfectadas: ['cocina', 'suelo'] })
})

test('aplicarRamoAlParte: el tipo debe ser del ramo; los datos, del ramo de la póliza', () => {
  const n = normalizarParte(
    { descripcion: 'Se ha roto la tubería de la cocina', fechaHecho: '2026-10-01', tipoSiniestro: 'lunas', hayTerceros: 'si', datosRamo: { averiaActiva: 'si' } },
    new Date('2026-10-03T10:00:00Z'),
  )
  assert.ok(n.ok)
  assert.equal(n.valor.datosRamo, null, 'normalizarParte solo no acepta datos del ramo')
  const h = aplicarRamoAlParte(n.valor, 'hogar', { datosRamo: { averiaActiva: 'si', existeAtestado: 'si' } })
  assert.equal(h.tipoSiniestro, null, '«lunas» no es de hogar')
  assert.deepEqual(h.datosRamo, { averiaActiva: true })
  const a = aplicarRamoAlParte(n.valor, 'auto', { datosRamo: { averiaActiva: 'si' } })
  assert.equal(a.tipoSiniestro, 'lunas')
  assert.equal(a.datosRamo, null)
  const s = aplicarRamoAlParte(n.valor, null, { datosRamo: { averiaActiva: 'si' } })
  assert.equal(s.tipoSiniestro, null)
  assert.equal(s.datosRamo, null)
})

test('lectura legible y datos clave sin nombres ni teléfonos', () => {
  const datos = {
    existeDeclaracionAmistosa: true,
    culpaPropiaDeclarada: false,
    cuerpoPolicial: 'guardia_civil',
    contrarios: [{ conductor: 'Luis Pérez', telefono: '600112233' }],
    raro: 1,
  }
  const l = lineasDatosRamoParte(datos)
  assert.ok(l.some((x) => x.valor === 'Guardia Civil (Tráfico)'))
  assert.ok(l.some((x) => x.etiqueta === 'Vehículo contrario 1' && x.valor.includes('Luis Pérez')))
  const clave = datosClaveParte(datos)
  assert.equal(clave.length, 3)
  assert.ok(clave[0].startsWith('Otros vehículos implicados: 1'))
  assert.ok(!clave.join(' ').includes('Luis'), 'el chat no lleva nombres de terceros')
  assert.ok(!clave.join(' ').includes('600112233'))
  assert.deepEqual(lineasDatosRamoParte(null), [])
  assert.deepEqual(lineasDatosRamoParte([1, 2]), [])
  assert.equal(lineasDatosRamoParte({ cuantiaReclamadaInicial: 2162.49 })[0]?.valor, '2.162,49€')
})

test('camposParteDeRamo acepta «comunidad» y devuelve [] para lo desconocido', () => {
  assert.ok(camposParteDeRamo('comunidad').length > 0)
  assert.equal(camposParteDeRamo('xyz').length, 0)
})
