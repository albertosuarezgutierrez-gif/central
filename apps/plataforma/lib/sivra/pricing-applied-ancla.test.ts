// Guardián de la procedencia del ancla en `pricing_applied` (28/08/2026).
//
// Estas dos columnas existen para que el seguimiento del serrucho pueda ATRIBUIR la mejora a la
// rama que se tocó, no solo verla en el agregado. Nada de esto lo caza `tsc` ni `next build`:
// las filas de `$queryRaw` son `any` y un INSERT con las columnas y los valores descuadrados es
// TypeScript perfectamente válido — revienta en runtime, dentro de un `catch {}` que además lo
// silencia («no crítico»). Mismo patrón de guardián que `cols-subasta.test.ts` y
// `pricing-ancla-global.test.ts`: se lee el FUENTE.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROUTE = readFileSync(join(raiz, 'app/api/sivra/pricing/apply/route.ts'), 'utf8')
const SQL = readFileSync(join(raiz, 'prisma/sql/2026-08-28_pricing_applied_ancla.sql'), 'utf8')

test('la migración declara las dos columnas, y ambas nullable (el histórico es NULL)', () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS ancla_origen TEXT/)
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS base_fuente TEXT/)
  // Un DEFAULT las llenaría de un valor inventado en filas que nunca lo midieron: es justo la
  // mentira que la columna viene a evitar.
  assert.ok(!/base_fuente TEXT[^,;]*DEFAULT/i.test(SQL), 'base_fuente no puede llevar DEFAULT')
  assert.ok(!/ancla_origen TEXT[^,;]*DEFAULT/i.test(SQL), 'ancla_origen no puede llevar DEFAULT')
  // Solo sobre el ALTER: el `WHERE base_fuente IS NOT NULL` del índice parcial es legítimo y no
  // tiene nada que ver con la nulabilidad de la columna.
  const alter = SQL.match(/ALTER TABLE pricing_applied[\s\S]*?;/)![0]
  assert.ok(!/NOT NULL/i.test(alter), 'un NOT NULL obligaría a rellenar el histórico con un valor falso')
})

test('el INSERT de pricing_applied nombra las dos columnas nuevas', () => {
  const m = ROUTE.match(/INSERT INTO pricing_applied \(([^)]+)\)/)
  assert.ok(m, 'no se encuentra el INSERT INTO pricing_applied')
  const cols = m![1].split(',').map(c => c.trim())
  assert.ok(cols.includes('ancla_origen'), 'falta ancla_origen en el INSERT')
  assert.ok(cols.includes('base_fuente'), 'falta base_fuente en el INSERT')
})

test('columnas y valores del INSERT cuadran en número', () => {
  // El fallo clásico al añadir una columna: nombrarla y no pasar su valor (o al revés). Postgres
  // lo rechaza en runtime con 42601 y el `catch {}` de la ruta se lo traga: la pasada seguiría
  // «ok» y la auditoría dejaría de escribirse ENTERA, en silencio.
  const cols = ROUTE.match(/INSERT INTO pricing_applied \(([^)]+)\)/)![1]
    .split(',').map(c => c.trim()).filter(Boolean)
  // `[\s\S]` en vez del flag `s`: el target de tsconfig es anterior a es2018 y `tsc` rechaza dotAll.
  const fila = ROUTE.match(/const auditRows = audit\.map\(a =>\s*\n\s*Prisma\.sql`\(([\s\S]+?)\)`\)/)
  assert.ok(fila, 'no se encuentra la plantilla de fila de auditRows')
  const valores = fila![1].split(',').map(v => v.trim()).filter(Boolean)
  assert.equal(valores.length, cols.length,
    `el INSERT nombra ${cols.length} columnas y la fila pasa ${valores.length} valores`)
})

test('base_fuente sale del MISMO useMonth que eligió la base, sin re-derivarse', () => {
  assert.match(ROUTE, /base_fuente: useMonth \? 'mes' : 'global'/)
  // Si alguien la recalculara con su propia condición (p. ej. `mb.n >= MIN_BUCKET` suelto), la
  // columna podría decir 'mes' en una noche tarificada por el ancla global — y el seguimiento
  // mediría lo contrario de lo que pasó.
  // Se cuentan las ASIGNACIONES, no la declaración de tipo del array (`base_fuente: 'mes' | 'global'`).
  // Por línea y no por regex con lookahead: `\s*` casa el vacío y el lookahead se evaluaría en el
  // espacio, contando la declaración de tipo como una asignación más.
  const asignaciones = ROUTE.split('\n')
    .filter(l => /\bbase_fuente:/.test(l) && !/base_fuente: '/.test(l))
  assert.equal(asignaciones.length, 1,
    `base_fuente se asigna en un solo sitio (encontradas ${asignaciones.length})`)
})

test('ancla_origen es el mismo valor que ya viaja en la respuesta HTTP', () => {
  // `anclaOrigen` lo calcula `elegirAnclaGlobal` + `corpus_fiable` una sola vez por piso y pasada.
  // La fila y la respuesta tienen que contar lo mismo, o el panel y la BD se contradicen.
  assert.match(ROUTE, /\$\{anclaOrigen\}/)
  assert.match(ROUTE, /ancla_global: \{ origen: anclaOrigen/)
})

test('ninguna consulta del repo colapsa el NULL de estas columnas', () => {
  // Regla raíz: `NULL` = «esa fila es anterior a la columna», no «usó el ancla global».
  for (const col of ['base_fuente', 'ancla_origen']) {
    const patron = new RegExp(`COALESCE\\s*\\(\\s*${col}`, 'i')
    assert.ok(!patron.test(ROUTE), `${col} no puede colapsarse con COALESCE`)
  }
})
