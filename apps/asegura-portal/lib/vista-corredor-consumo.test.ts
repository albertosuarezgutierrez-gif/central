import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { consumirEnlaceVista, type TxVistaCorredor } from './vista-corredor-consumo.ts'

/** Tabla de una fila con la semántica de `updateMany`: solo actualiza si el `where` casa AHORA. */
function txFalsa(): TxVistaCorredor & { fila: { id: string; usadoEn: Date | null } } {
  const fila = { id: 'v1', usadoEn: null as Date | null }
  return {
    fila,
    portalVistaCorredor: {
      async updateMany({ where, data }) {
        await Promise.resolve() // cede el turno: simula la carrera entre dos peticiones
        if (where.id !== fila.id || fila.usadoEn !== null) return { count: 0 }
        fila.usadoEn = data.usadoEn
        return { count: 1 }
      },
    },
  }
}

test('dos aperturas simultáneas del mismo enlace: solo UNA lo consume', async () => {
  const tx = txFalsa()
  const r = await Promise.all([consumirEnlaceVista(tx, 'v1'), consumirEnlaceVista(tx, 'v1')])
  assert.deepEqual(r.filter(Boolean).length, 1)
})

test('un enlace ya usado no se vuelve a consumir', async () => {
  const tx = txFalsa()
  assert.equal(await consumirEnlaceVista(tx, 'v1'), true)
  assert.equal(await consumirEnlaceVista(tx, 'v1'), false)
})

test('🪤 el updateMany lleva `usadoEn: null` y la apertura contesta «usado» si pierde la carrera', () => {
  const c = readFileSync(new URL('./vista-corredor-consumo.ts', import.meta.url), 'utf8')
  assert.match(c, /where: \{ id, usadoEn: null \}/)
  const v = readFileSync(new URL('./vista-corredor.ts', import.meta.url), 'utf8')
  assert.match(v, /consumirEnlaceVista\(tx, fila\.id\)/)
  assert.match(v, /estado: 'usado'/)
})
