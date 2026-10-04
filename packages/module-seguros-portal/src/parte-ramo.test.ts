import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CAMPOS_POR_RAMO_SINIESTRO, TIPOS_SEGURO } from '@central/module-seguros'

import {
  CAMPOS_PARTE_POR_RAMO,
  camposParteDeRamo,
  datosClaveParte,
  lineasDatosRamoParte,
  normalizarDatosRamoParte,
  partirDatosRamoParte,
  unirDatosRamoParte,
  CLAVES_PII_PARTE,
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

// ── 🔒 Datos personales de terceros: cifrados, nunca en `datos_ramo` en claro ──

/** Un parte con TODAS las respuestas posibles de un ramo, PII incluida. */
function parteCompleto(ramo: string) {
  const entrada: Record<string, unknown> = {}
  for (const c of camposParteDeRamo(ramo)) {
    if (c.tipo === 'lista') {
      entrada[c.id] = [Object.fromEntries(c.subcampos.map((s) => [s.id, s.tipo === 'triestado' ? 'si' : s.tipo === 'opcion' ? s.opciones![0].valor : s.tipo === 'telefono' ? '600111222' : 'Pepa Ruiz']))]
    } else if (c.tipo === 'multiopcion') entrada[c.id] = [c.opciones[0].valor]
    else if (c.tipo === 'triestado') entrada[c.id] = 'si'
    else if ('opciones' in c && c.opciones && c.opciones.length > 0) entrada[c.id] = c.opciones[0].valor
    else if (c.tipo === 'dinero') entrada[c.id] = 100
    else entrada[c.id] = 'Pepa Ruiz'
  }
  return normalizarDatosRamoParte(ramo, entrada, { hayHeridos: true, hayTerceros: true, tipoSiniestro: 'robo' })
}

test('🚨 CEPO: ninguna clave de datos personales queda en la mitad EN CLARO, en ningún ramo', () => {
  for (const r of TIPOS_SEGURO) {
    const datos = parteCompleto(r)
    const { claro, pii } = partirDatosRamoParte(datos)
    for (const k of Object.keys(claro ?? {})) assert.equal(CLAVES_PII_PARTE.has(k), false, `${r}: «${k}» en claro`)
    // Y el texto de una persona («Pepa Ruiz», su teléfono) no aparece en claro por otra clave.
    const enClaro = JSON.stringify(claro ?? {})
    assert.doesNotMatch(enClaro, /Pepa Ruiz|600111222/, `${r}: un nombre o teléfono se ha quedado en claro`)
    // Lo que sí es dato del parte se conserva entero entre las dos mitades.
    assert.deepEqual(unirDatosRamoParte(claro, pii), datos ?? {}, r)
  }
})

test('🚨 CEPO: toda LISTA del catálogo es PII y todo texto libre suelto está decidido', () => {
  // Texto libre suelto que NO es de una persona. Uno nuevo que no esté aquí ni en
  // CLAVES_PII_PARTE rompe este test: hay que decidir si nombra a alguien.
  const TEXTO_NO_PERSONAL = new Set<string>([])
  for (const r of TIPOS_SEGURO)
    for (const c of CAMPOS_PARTE_POR_RAMO[r]) {
      if (c.tipo === 'lista') assert.ok(CLAVES_PII_PARTE.has(c.id), `${r}/${c.id}: lista sin cifrar`)
      if (c.tipo === 'texto') assert.ok(CLAVES_PII_PARTE.has(c.id) || TEXTO_NO_PERSONAL.has(c.id), `${r}/${c.id}: texto libre sin decidir`)
    }
})

test('partir: mitades vacías son null (nunca `{}`), y null entra null sale', () => {
  assert.deepEqual(partirDatosRamoParte(null), { claro: null, pii: null })
  assert.deepEqual(partirDatosRamoParte({ averiaActiva: true }), { claro: { averiaActiva: true }, pii: null })
  assert.deepEqual(partirDatosRamoParte({ personaAfectada: 'X' }), { claro: null, pii: { personaAfectada: 'X' } })
})

test('unir: una clave PII colada en claro NO se pinta; basura de la BD se ignora', () => {
  assert.deepEqual(unirDatosRamoParte({ averiaActiva: true, lesionados: [{ nombre: 'colado' }] }, null), { averiaActiva: true })
  assert.deepEqual(unirDatosRamoParte('x', [1]), {})
  assert.deepEqual(unirDatosRamoParte(null, { personaAfectada: 'Ana', averiaActiva: true }), { personaAfectada: 'Ana' })
})

test('🔒 Telegram: ni listas ni `personaAfectada` salen con nombre en los datos clave', () => {
  const d = normalizarDatosRamoParte('accidentes', { personaAfectada: 'Pepa Ruiz', bajaMedica: 'si' }, CTX)
  const clave = datosClaveParte(d, 10)
  assert.ok(clave.length > 0)
  assert.doesNotMatch(clave.join(' | '), /Pepa/)
})
