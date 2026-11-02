// Guardián: el NETO CONFIRMADO POR EL BANCO (`incomes.amount_net_bank`) manda sobre la comisión teórica.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────────────────────
// El trigger BEFORE INSERT/UPDATE `incomes_compute_net` (función `compute_income_net()`) recalcula
// SIEMPRE `amount := amount_gross × (1 − portal_rates.commission_pct/100)`. El 02/11/2026 se fijó a
// mano (con bypass) el neto real cobrado en banco en 151 reservas Booking 2026, y el siguiente UPDATE
// sin bypass —sync diario de Smoobu, rutas sivra, imports, o un cambio de `portal_rates` vía
// `recompute_incomes_for_portal()`— lo devolvía a la tasa teórica. Eso es la base del IRPF.
//
// `2026-11-02_incomes_amount_net_bank.sql` lo arregla. Este cepo vigila que la ÚLTIMA definición de
// ambas funciones en `apps/plataforma/prisma/sql/` siga respetando `amount_net_bank`: si una migración
// posterior hace CREATE OR REPLACE copiando la versión vieja, falla aquí antes de llegar a la BD.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, '..', 'apps', 'plataforma', 'prisma', 'sql')
const MIGRACION = '2026-11-02_incomes_amount_net_bank.sql'

/** Cuerpo ($function$ … $function$) de la ÚLTIMA migración (por nombre) que redefine `fn`. */
function ultimaDefinicion(fn: string): { fichero: string; cuerpo: string } {
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(\\s*\\)([\\s\\S]*?)\\$function\\$([\\s\\S]*?)\\$function\\$`, 'gi')
  let ultima: { fichero: string; cuerpo: string } | null = null
  for (const fichero of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, fichero), 'utf8')
    for (const m of sql.matchAll(re)) ultima = { fichero, cuerpo: m[2] }
  }
  assert.ok(ultima, `no encuentro ninguna definición de ${fn}() en ${DIR}`)
  return ultima
}

/** Quita comentarios `--` para que un comentario no pase por código. */
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '')

test('compute_income_net(): con amount_net_bank, amount := amount_net_bank y se sale ANTES de aplicar la comisión', () => {
  const { fichero, cuerpo } = ultimaDefinicion('compute_income_net')
  const c = sinComentarios(cuerpo)
  const rama = c.match(/IF\s+NEW\.amount_net_bank\s+IS\s+NOT\s+NULL\s+THEN([\s\S]*?)END\s+IF\s*;/i)
  assert.ok(rama, `${fichero}: compute_income_net() ya no tiene la rama «IF NEW.amount_net_bank IS NOT NULL»`)
  assert.match(rama[1], /NEW\.amount\s*:=\s*NEW\.amount_net_bank\b/i, `${fichero}: la rama no copia amount_net_bank a amount`)
  assert.match(rama[1], /RETURN\s+NEW\s*;/i, `${fichero}: la rama no hace RETURN NEW (seguiría y aplicaría la comisión)`)

  const posRama = c.search(/IF\s+NEW\.amount_net_bank\s+IS\s+NOT\s+NULL/i)
  const posComision = c.search(/FROM\s+portal_rates/i)
  assert.ok(posComision > 0, `${fichero}: ya no lee portal_rates (¿se perdió el comportamiento con NULL?)`)
  assert.ok(posRama < posComision, `${fichero}: la rama de amount_net_bank va DESPUÉS del cálculo de comisión`)
})

test('recompute_incomes_for_portal(): no recalcula filas con amount_net_bank', () => {
  const { fichero, cuerpo } = ultimaDefinicion('recompute_incomes_for_portal')
  const update = sinComentarios(cuerpo).match(/UPDATE\s+incomes[\s\S]*?;/i)
  assert.ok(update, `${fichero}: recompute_incomes_for_portal() ya no tiene el UPDATE de incomes`)
  assert.match(update[0], /amount_net_bank\s+IS\s+NULL/i, `${fichero}: el UPDATE de recompute_incomes_for_portal() pisaría el neto bancario`)
})

test('la migración rellena exactamente 151 ids con guarda de recuento y bypass', () => {
  const sql = readFileSync(join(DIR, MIGRACION), 'utf8')
  assert.match(sql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+amount_net_bank\s+numeric\(12,\s*2\)/i)
  const array = sql.match(/ids\s+text\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]::text\[\]/i)
  assert.ok(array, 'no encuentro el ARRAY de ids del relleno')
  const ids = [...array[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.equal(ids.length, 151, 'el relleno debe cubrir EXACTAMENTE 151 reservas')
  assert.equal(new Set(ids).size, 151, 'hay ids duplicados en el relleno')
  assert.match(sql, /n_filas\s*<>\s*151/i, 'falta la guarda de recuento')
  assert.match(sql, /set_config\('app\.skip_income_net_trigger',\s*'on',\s*true\)/i, 'el relleno debe ir con bypass')
  assert.match(sql, /amount_net_bank\s+IS\s+NULL/i, 'el relleno debe ser idempotente (solo filas sin rellenar)')
})
