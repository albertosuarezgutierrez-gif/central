// Límite por IP del código del taller. Cepo visto fallar: en resolverCodigoLimitado quitar el `return null` de la IP bloqueada → rojo en 'bloqueada'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LIMITE_CODIGO, resolverCodigoLimitado, type FilaCodigo, type StoreCodigo } from '../lib/limite-codigo.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const t0 = new Date('2026-11-04T10:00:00Z')
const min = (n: number) => new Date(t0.getTime() + n * 60_000)
function montar() {
  const m = new Map<string, FilaCodigo>()
  const store: StoreCodigo = { leer: async (k) => m.get(k) ?? null, guardar: async (k, f) => void m.set(k, f), borrar: async (k) => void m.delete(k) }
  const prueba = (codigo: string, ip: string, ahora = t0) => resolverCodigoLimitado(store, { codigo, ip, ahora, porCodigo: async (c) => (c === 'ABCD2345' ? T : null) })
  return { m, prueba }
}

test('10 fallos desde una IP la bloquean 1 h: ni el código CORRECTO resuelve, y la respuesta es la misma (null) que un código inexistente', async () => {
  const { prueba } = montar()
  for (let i = 0; i < LIMITE_CODIGO.maxFallos; i++) assert.equal(await prueba('MALO0000', '1.1.1.1', min(i)), null)
  assert.equal(await prueba('ABCD2345', '1.1.1.1', min(11)), null, 'IP bloqueada')
  assert.equal(await prueba('ABCD2345', '2.2.2.2', min(11)), T, 'otra IP no')
  assert.equal(await prueba('ABCD2345', '1.1.1.1', min(10 + LIMITE_CODIGO.bloqueoMinutos + 1)), T, 'vencido el bloqueo')
})

test('fuera de la ventana de 15 min los fallos no se acumulan y un acierto limpia la cuenta', async () => {
  const { prueba, m } = montar()
  for (let i = 0; i < 9; i++) await prueba('MALO0000', '1.1.1.1', min(0))
  assert.equal(await prueba('MALO0000', '1.1.1.1', min(LIMITE_CODIGO.ventanaMinutos + 1)), null)
  assert.equal(m.get('codigo:1.1.1.1')!.intentos, 1)
  assert.equal(await prueba('ABCD2345', '1.1.1.1', min(20)), T)
  assert.equal(m.has('codigo:1.1.1.1'), false)
})

test('guardián: constante de plataforma (no de taller), ruta con IP y tabla sin taller_id en 0006', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  assert.match(lee('app', 'api', 'auth', 'taller', 'route.ts'), /tallerPorCodigoLimitado\(codigo, ip/)
  assert.match(lee('prisma', 'sql', '0006_login_taller_usuario_pin.sql'), /CREATE TABLE IF NOT EXISTS taller\.bloqueos_codigo/)
})
