import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AVISO_CARTA_IMPAGO,
  MAX_ESCANEOS_POR_DIA,
  claveEscaneo,
  esCartaImpago,
  nombreDeArchivo,
  normalizarLecturaEscaner,
  prefijoArchivosDelDia,
  prefijoEscaneosDelDia,
  proponerPoliza,
  textoAvisoImpago,
} from './escaner-documento.ts'

test('lectura: valores de cajón y basura quedan en null, procedencia documento', () => {
  const l = normalizarLecturaEscaner({ tipo: 'otro ', fecha: 'N/A', importe: '0', compania: 'no consta', numeroPoliza: '0000000' })
  assert.deepEqual(l, { tipo: 'otro', fecha: null, importe: null, compania: null, numeroPoliza: null, procedencia: 'documento' })
  assert.deepEqual(normalizarLecturaEscaner(null).tipo, null)
  assert.equal(normalizarLecturaEscaner({ tipo: 'inventado' }).tipo, null)
})
test('lectura: fecha real, importe en formato español, tipo con guion', () => {
  const l = normalizarLecturaEscaner({ tipo: 'carta-impago', fecha: '2026-10-13', importe: '1.234,56 €' })
  assert.equal(l.tipo, 'carta_impago')
  assert.equal(l.fecha, '2026-10-13')
  assert.equal(l.importe, 1234.56)
  assert.equal(normalizarLecturaEscaner({ fecha: '2026-02-31' }).fecha, null)
  assert.equal(normalizarLecturaEscaner({ importe: -5 }).importe, null)
})
const C = [
  { id: 'c:1', compania: 'Mapfre', numeroPoliza: '12-345 678' },
  { id: 'd:2', compania: 'Allianz Seguros', numeroPoliza: null },
  { id: 'd:3', compania: 'Mapfre España', numeroPoliza: 'ZZ99999' },
]
test('propuesta: por número exacto, por compañía única, ambigua y sin coincidencia', () => {
  assert.deepEqual(proponerPoliza({ compania: null, numeroPoliza: '12345678' }, C), { polizaId: 'c:1', motivo: 'numero' })
  assert.deepEqual(proponerPoliza({ compania: 'ALLIANZ', numeroPoliza: null }, C), { polizaId: 'd:2', motivo: 'compania' })
  assert.deepEqual(proponerPoliza({ compania: 'Mapfre', numeroPoliza: null }, C), { polizaId: null, motivo: 'ambigua' })
  assert.deepEqual(proponerPoliza({ compania: 'Axa', numeroPoliza: '1' }, C), { polizaId: null, motivo: 'sin_coincidencia' })
  assert.deepEqual(proponerPoliza({ compania: null, numeroPoliza: null }, []), { polizaId: null, motivo: 'sin_coincidencia' })
})
test('impago: solo el tipo confirmado dispara el aviso', () => {
  assert.equal(esCartaImpago('carta_impago'), true)
  for (const t of ['recibo', 'otro', null, undefined, 'CARTA_IMPAGO']) assert.equal(esCartaImpago(t), false)
  assert.match(AVISO_CARTA_IMPAGO, /Contacta con tu corredor/)
  assert.match(textoAvisoImpago({ identidadId: 'i1', clienteNombre: null, compania: 'Mapfre', numeroPoliza: '1', fecha: null }), /SIN vincular/)
})
test('nombre de archivo: sin caracteres peligrosos', () => {
  assert.equal(nombreDeArchivo({ tipo: 'recibo', compania: 'Mapfre', numeroPoliza: 'a/b', fecha: '2026-10-13', extension: 'PDF' }), 'Recibo - Mapfre - a b - 2026-10-13.pdf')
  assert.equal(nombreDeArchivo({ tipo: 'otro', compania: null, numeroPoliza: null, fecha: null, extension: '' }), 'Otro documento')
})

import { readFileSync } from 'node:fs'
test('contrato: archivar valida la póliza contra las propias y avisa del impago', () => {
  const r = readFileSync(new URL('../app/api/documentos/archivar/route.ts', import.meta.url), 'utf8')
  assert.match(r, /polizasPropiasParaEscanerDeSesion\(\)/)
  // Póliza ajena o inexistente: 404, nunca 403 (no confirmar que el id existe).
  assert.match(r, /error: 'no_encontrada' \}, \{ status: 404 \}/)
  assert.doesNotMatch(r, /status: 403/)
  assert.match(r, /esCartaImpago\(tipo\)/)
  // El tope de archivado también en BD (un `rateLimit` en memoria no es un tope entre instancias).
  assert.match(r, /reservarArchivoDeSesion\(\)/)
  assert.doesNotMatch(r, /rateLimit\(/)
  const e = readFileSync(new URL('../app/api/documentos/escanear/route.ts', import.meta.url), 'utf8')
  // El cupo de IA va en BD: un `rateLimit` en memoria se reinicia en cada instancia y no es un tope.
  assert.match(e, /reservarEscaneoDeSesion\(\)/)
  assert.doesNotMatch(e, /rateLimit\(/)
})

test('cupo del escáner: clave por día de MADRID, no UTC', () => {
  // 23:30 UTC del 13/10 = 01:30 del 14/10 en Madrid (CEST): cuenta en el día 14.
  assert.equal(prefijoEscaneosDelDia(new Date('2026-10-13T23:30:00Z')), 'escaner:2026-10-14:')
  assert.equal(prefijoEscaneosDelDia(new Date('2026-10-13T10:00:00Z')), 'escaner:2026-10-13:')
  assert.equal(claveEscaneo(new Date('2026-10-13T10:00:00Z'), 'u1'), 'escaner:2026-10-13:u1')
  assert.equal(MAX_ESCANEOS_POR_DIA, 15)
  // El cupo de archivado no comparte prefijo con el de lecturas (si no, uno gastaría el del otro).
  assert.equal(prefijoArchivosDelDia(new Date('2026-10-13T10:00:00Z')), 'escaner-archivo:2026-10-13:')
  assert.ok(!prefijoArchivosDelDia(new Date('2026-10-13T10:00:00Z')).startsWith(prefijoEscaneosDelDia(new Date('2026-10-13T10:00:00Z'))))
})
