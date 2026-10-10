import test from 'node:test'
import assert from 'node:assert/strict'
import { conflictosDeLectura, copiadosDeRespuesta, lineasConflictos, TOPE_LINEAS_CONFLICTOS } from './cima-sincro-resumen.ts'
import { interpretarSincroCima } from '../cima-sincro-asegura.ts'

const dif = (campo: string, aviso?: string) => ({ campo, accion: 'discrepa', ficha: 'SECRETO-FICHA', cima: 'SECRETO-CIMA', ...(aviso ? { aviso } : {}) })
const lectura = (n: number) => interpretarSincroCima(200, {
  estado: 'ok', fichas: 9, sinDatosCima: 0, rellenos: 0, ilegibles: 0,
  discrepancias: Array.from({ length: n }, (_, i) => ({ clienteId: `c${i}`, nombre: 'Persona Secreta', poliza: i === 1 ? null : `P${i}`, diferencias: [dif(i === 0 ? 'telefono' : 'fechaNacimiento', i === 0 ? 'Ese teléfono ya está en la ficha de Ana' : undefined)] })),
})

test('conflictos: póliza, campo y tipo; sin ningún valor ni nombre', () => {
  const c = conflictosDeLectura(lectura(3))
  assert.deepEqual(c, [
    { poliza: 'P0', campo: 'telefono', tipo: 'aviso' },
    { poliza: null, campo: 'fechaNacimiento', tipo: 'distinto' },
    { poliza: 'P2', campo: 'fechaNacimiento', tipo: 'distinto' },
  ])
  assert.doesNotMatch(JSON.stringify(c), /SECRETO|Persona|Ana/)
  assert.deepEqual(conflictosDeLectura(interpretarSincroCima(500, null)), [])
})

test('copiados: se leen de la respuesta del puerto; lo ilegible es null (no «ninguno»)', () => {
  assert.deepEqual(copiadosDeRespuesta({ aplicados: 1, copiados: [{ poliza: 'A1', campo: 'nombre', motivo: 'formato', extra: 'x' }] }), [{ poliza: 'A1', campo: 'nombre', motivo: 'formato' }])
  assert.deepEqual(copiadosDeRespuesta({ copiados: [] }), [])
  for (const mal of [null, {}, { copiados: 'x' }, { copiados: [{ poliza: 1, campo: 'nombre', motivo: 'formato' }] }, { copiados: [{ poliza: 'A', campo: 'dni', motivo: 'formato' }] }]) {
    assert.equal(copiadosDeRespuesta(mal), null, JSON.stringify(mal))
  }
})

test('líneas del aviso: «campo · nº póliza», 10 como máximo y el resto contado', () => {
  const c = conflictosDeLectura(lectura(14))
  const l = lineasConflictos(c)
  assert.equal(TOPE_LINEAS_CONFLICTOS, 10)
  assert.equal(l.length, 11)
  assert.equal(l[0], '• Teléfono · P0')
  assert.equal(l[1], '• Fecha de nacimiento · sin nº de póliza')
  assert.equal(l[10], '… y 4 más.')
  assert.deepEqual(lineasConflictos([]), [])
  assert.doesNotMatch(l.join('\n'), /SECRETO|Persona/)
})
