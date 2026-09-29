import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lee el FUENTE: lo que vigila vive en un Prisma.sql, donde ni tsc ni el build miran.
const src = readFileSync(new URL('./presupuesto-seguimiento-servicio.ts', import.meta.url), 'utf8')

test('al marcar un seguimiento como avisado se crea la llamada en «Hoy» (y solo la primera vez)', () => {
  const marcar = src.slice(src.indexOf('export async function marcarSeguimientoAvisado'), src.indexOf('async function tareaDeSeguimiento'))
  assert.match(marcar, /yaConstaba: true \}[\s\S]*presupuestoEvento\.create[\s\S]*await tareaDeSeguimiento\(/, 'la tarea va DESPUÉS del «ya constaba»: repetir el aviso no duplica llamadas')
})

test('la llamada cuelga de la oportunidad ABIERTA del cliente y ramo, y no duplica una pendiente', () => {
  const tarea = src.slice(src.indexOf('async function tareaDeSeguimiento'))
  assert.match(tarea, /ESTADOS_ABIERTA/)
  assert.match(tarea, /o\.tipo::text = p\.ramo/)
  assert.match(tarea, /not exists \([\s\S]*estado::text = 'pendiente'[\s\S]*'llamada'/)
  assert.match(tarea, /catch \(err\)/, 'un fallo aquí no puede deshacer el «avisado»: el Telegram ya salió')
})
