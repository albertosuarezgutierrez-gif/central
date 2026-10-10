import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validarResumen } from './cima-sincro-resumen.ts'

test('resumen: solo póliza, campo y motivo/tipo; cualquier valor extra se rechaza (sin PII)', () => {
  const ok = { copiados: [{ poliza: 'A123', campo: 'fechaNacimiento', motivo: 'formato' }], conflictos: [{ poliza: null, campo: 'telefono', tipo: 'aviso' }] }
  assert.equal(validarResumen(ok).ok, true)
  assert.equal(validarResumen({ copiados: [], conflictos: [] }).ok, true)
  for (const mal of [
    null, {}, { copiados: [] },
    { copiados: [{ poliza: 'A1', campo: 'nombre', motivo: 'formato', valor: 'Juan' }], conflictos: [] },
    { copiados: [], conflictos: [{ poliza: 'A1', campo: 'dni', tipo: 'distinto' }] },
    { copiados: [{ poliza: 'A1', campo: 'nombre', motivo: 'otro' }], conflictos: [] },
  ]) assert.equal(validarResumen(mal).ok, false, JSON.stringify(mal))
})

test('el evento se inserta con source, correduria_id y occurred_at', () => {
  const f = readFileSync(new URL('./sincro-cima.ts', import.meta.url), 'utf8')
  assert.match(f, /insert into operational_events \(event_name, source, correduria_id, occurred_at, payload\)/)
  assert.match(f, /EVENTO_RESUMEN_SINCRO/)
})
