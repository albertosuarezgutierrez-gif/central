import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { puertaSync } from '@central/module-seguros/google-contactos'

// 🪤 El cron NO escribe hasta que Alberto activa la sincronización tras revisar la simulación.
// La decisión es pura (`puertaSync`); aquí se vigila que `sincronizarGoogleContactos` la consulte
// ANTES de cualquier escritura (BD, Google o la creación de la etiqueta) y que corte si no es
// `adelante`. Leer el fuente es a propósito: la función habla con Prisma y con Google.
const fuente = readFileSync(new URL('./google-contactos.ts', import.meta.url), 'utf8')
const inicio = fuente.indexOf('export async function sincronizarGoogleContactos')
const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio))

test('cron sin activar → pendiente_activar (la puerta pura)', () => {
  assert.equal(puertaSync({ estado: 'conectada', syncActivadaEn: null }), 'pendiente_activar')
})

test('sincronizarGoogleContactos consulta la puerta ANTES de cualquier escritura y corta si no es «adelante»', () => {
  assert.ok(inicio >= 0)
  const iPuerta = cuerpo.indexOf('puertaSync(conexion)')
  assert.ok(iPuerta > 0, 'no consulta puertaSync')
  assert.match(cuerpo.slice(iPuerta, iPuerta + 200), /if \(puerta !== 'adelante'[^)]*\) return/)
  for (const escritura of ['.update(', '.upsert(', '.create(', '.createMany(', '.deleteMany(', '.updateMany(', 'asegurarGrupo(', 'encolarRevisiones(', 'accesoDesdeRefresh(', 'new People(']) {
    const i = cuerpo.indexOf(escritura)
    if (i >= 0) assert.ok(i > iPuerta, `${escritura} va ANTES de la puerta`)
  }
})
