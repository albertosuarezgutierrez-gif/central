// Cepo de «rebote ≠ baja» en el código que ESCRIBE (07/11/2026): el webhook y su SQL. Lee el fuente: la BD no corre aquí.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tragarSoloTablaAusente } from './pg-error.ts'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')
const rebote = leer('./email-rebote.ts')
const ruta = leer('../app/api/webhooks/resend/route.ts')
const sql = leer('../prisma/sql/2026-11-07_email_rebotado.sql')

test('🚨 un rebote marca el email como malo y NUNCA escribe la baja', () => {
  const rama = rebote.slice(rebote.indexOf('const hashDestino = hashSeguro('), rebote.indexOf('async function anotar('))
  assert.ok(rama.length > 0)
  assert.match(rama, /update clientes set email_rebotado_at/)
  assert.doesNotMatch(rama, /email_opt_out_at/)
})

test('la queja de spam sí es baja (y no toca la marca de rebote)', () => {
  const rama = rebote.slice(rebote.indexOf("if (accion.accion === 'baja')"), rebote.indexOf('const hashDestino = hashSeguro('))
  assert.match(rama, /email_opt_out_at = now\(\)/)
  assert.doesNotMatch(rama, /email_rebotado/)
})

test('el webhook pasa TODO evento por aplicarReboteOQueja y ya no por las bajas viejas', () => {
  assert.match(ruta, /aplicarReboteOQueja\(eventoCorreo\)/)
  assert.doesNotMatch(ruta, /aplicarBajaPorRebote|aplicarBajaCampanaPorRebote/)
  // Ninguna escritura propia de la baja en la ruta (el comentario puede nombrarla).
  assert.doesNotMatch(ruta, /set\s+email_opt_out_at/i)
})

test('el SQL es idempotente, limpia la marca al cambiar el email y su backfill excluye quejas y bajas pedidas', () => {
  for (const c of ['email_rebotado_at', 'email_rebotado_motivo', 'email_rebotado_hash']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`))
  }
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_clientes_limpiar_rebote/)
  assert.match(sql, /BEFORE UPDATE OF email, email_lookup_hash ON seguros\.clientes/)
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_cliente_emails_limpiar_rebote/)
  // La limpieza nunca toca la baja.
  const funcs = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('-- ── Backfill 1'))
  assert.doesNotMatch(funcs, /email_opt_out_at/)
  const backfill = sql.slice(sql.indexOf('-- ── Backfill 2'))
  assert.match(backfill, /q\.tipo = 'email\.complained'/)
  assert.match(backfill, /k\.baja_en IS NOT NULL/)
  assert.match(backfill, /email_opt_out_source IS NULL/)
  assert.match(backfill, /email_rebotado_at IS NULL/)
})

test('🚨 solo 42P01 (tabla ausente) da «sin filas»; cualquier otro fallo de BD se propaga', () => {
  assert.deepEqual(tragarSoloTablaAusente({ code: 'P2010', meta: { code: '42P01', message: 'relation "campana_envio" does not exist' } }), [])
  const generico = new Error('Connection terminated unexpectedly')
  assert.throws(() => tragarSoloTablaAusente(generico), (e) => e === generico)
  assert.throws(() => tragarSoloTablaAusente({ code: 'P2010', meta: { code: '57014' } }))
  // El catch de origenDelCorreo usa el helper (no un `() => []` que se lo trague todo).
  assert.match(rebote, /\.catch\(tragarSoloTablaAusente\)/)
  assert.doesNotMatch(rebote, /\.catch\(\(\) => \[\]/)
})
