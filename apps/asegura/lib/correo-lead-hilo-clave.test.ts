// 🪤 Revisión 19/10/2026: el hilo de un lead se identifica también por su CLIENTE. La raíz (`References[0]`) la escribe
// el remitente; sin `cliente_id` en la clave única, dos clientes con la misma raíz fundirían sus hilos (y la F2 leería
// la respuesta de uno en la ficha del otro). Lee el SQL y el código: la clave y el ON CONFLICT tienen que coincidir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (s: string) => s.replace(/\s+/g, ' ')

test('🪤 cliente_id en la clave única del hilo (SQL) y en el ON CONFLICT (código)', () => {
  const sql = norm(readFileSync(new URL('../prisma/sql/2026-10-19b_correduria_f1.sql', import.meta.url), 'utf8'))
  const idx = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS correduria_hilo_unico ON seguros\.correduria_hilo \(([^;]+)\);/)
  assert.ok(idx, 'no encuentro el índice único del hilo')
  assert.match(idx![1], /^correduria_id, cliente_id, message_id_raiz,/)
  const src = norm(readFileSync(new URL('./correo-lead.ts', import.meta.url), 'utf8'))
  assert.match(src, /on conflict \(correduria_id, cliente_id, message_id_raiz, \(coalesce\(oportunidad_id,/)
})
