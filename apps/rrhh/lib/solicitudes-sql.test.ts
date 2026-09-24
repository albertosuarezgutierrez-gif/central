import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// En Postgres `date - date` ya es un integer (días). `EXTRACT(DAY FROM <integer>)` no existe y
// la consulta revienta ENTERA: `/api/admin/empleados` devolvía 500 siempre y el filtro por
// trabajador de /admin/fichajes se quedaba vacío sin avisar (24/09/2026).
describe('SQL de vacaciones en lib/solicitudes.ts', () => {
  const src = readFileSync(join(__dirname, 'solicitudes.ts'), 'utf8')
  it('no aplica EXTRACT(DAY …) a una resta de fechas', () => {
    expect(src).not.toMatch(/EXTRACT\s*\(\s*DAY\s+FROM\s*\([^)]*::date\s*-\s*[^)]*::date\s*\)/i)
  })
  it('cuenta los días como (fin - inicio) + 1', () => {
    expect(src.match(/\(fecha_fin::date - fecha_inicio::date\) \+ 1/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
