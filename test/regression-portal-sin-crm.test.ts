// El rol del CRM de Manuel (`crm_seguros`) recibe DML en cada tabla nueva de `seguros` por los
// privilegios por defecto del schema. En una tabla del portal eso es abrir sesiones ajenas
// (`portal_vinculo`, `portal_enlace_directo`…). Toda tabla `portal_*` creada desde el 24/09/2026
// tiene que revocárselo en su propio SQL. Ver `apps/asegura/prisma/sql/2026-09-24b_portal_sin_crm.sql`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname
const DIRS = ['apps/asegura/prisma/sql', 'apps/asegura-portal/prisma/sql']
const DESDE = '2026-09-24'

test('🚨 toda tabla portal_* nueva le revoca la tabla al rol del CRM', () => {
  const faltan: string[] = []
  for (const d of DIRS) {
    for (const f of readdirSync(join(RAIZ, d))) {
      if (!f.endsWith('.sql') || f.slice(0, 10) < DESDE) continue
      const sql = readFileSync(join(RAIZ, d, f), 'utf8').replace(/--.*$/gm, '')
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?seguros\.(portal_[a-z_]+)/gi)) {
        const re = new RegExp(`REVOKE ALL ON seguros\\.${m[1]} FROM crm_seguros`, 'i')
        if (!re.test(sql)) faltan.push(`${f}: ${m[1]}`)
      }
    }
  }
  assert.deepEqual(faltan, [])
})

test('el barrido ve la tabla de DOCUMENTOS de patrimonio (paso 8) y revoca al CRM', () => {
  const f = 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio_documento.sql'
  const sql = readFileSync(join(RAIZ, f), 'utf8').replace(/--.*$/gm, '')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.portal_patrimonio_documento\b/)
  assert.match(sql, /REVOKE ALL ON seguros\.portal_patrimonio_documento FROM crm_seguros/i)
})

test('el barrido ve las tablas de PATRIMONIO (22/10/2026) y todas revocan al CRM', () => {
  // Si la regex de arriba dejara de casar con este SQL, el primer test pasaría en verde sin mirar nada.
  const f = 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql'
  const sql = readFileSync(join(RAIZ, f), 'utf8').replace(/--.*$/gm, '')
  const tablas = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?seguros\.(portal_patrimonio_[a-z_]+)/gi)].map((m) => m[1])
  assert.ok(tablas.length >= 18, `solo ${tablas.length} tablas portal_patrimonio_* en ${f}`)
  for (const t of ['portal_patrimonio_inquilino', 'portal_patrimonio_contrato', 'portal_patrimonio_aviso_inquilino']) {
    assert.ok(tablas.includes(t), `falta ${t}`)
  }
  const sinRevoke = tablas.filter((t) => !new RegExp(`REVOKE ALL ON seguros\\.${t} FROM crm_seguros`, 'i').test(sql))
  assert.deepEqual(sinRevoke, [])
})

test('el barrido del 24/09 revoca TODAS las portal_* por patrón, no por lista', () => {
  const sql = readFileSync(join(RAIZ, 'apps/asegura/prisma/sql/2026-09-24b_portal_sin_crm.sql'), 'utf8')
  assert.match(sql, /tablename LIKE 'portal\\_%'/)
  assert.match(sql, /REVOKE ALL ON seguros\.%I FROM crm_seguros/)
})
