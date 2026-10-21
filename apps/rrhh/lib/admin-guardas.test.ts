// Cepo: desde que el marco del panel vive en app/admin/layout.tsx, es tentador quitar el guard de
// cada page («ya lo comprueba el layout»). El layout NO es barrera: no se re-ejecuta en cada
// navegación cliente y no protege los datos que la page lee. Cada page.tsx de /admin debe llamar
// a getSesion() por su cuenta (y filtrar por SU empresa_id).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { esActivo } from '@/components/AdminNav'

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? pages(p) : n === 'page.tsx' ? [p] : []
  })
}

describe('guard de sesión en cada page de /admin', () => {
  const lista = pages(join(__dirname, '..', 'app', 'admin'))
  it('encuentra las pages', () => { expect(lista.length).toBeGreaterThan(10) })
  for (const p of lista) {
    it(p.split('app/admin')[1], () => { expect(readFileSync(p, 'utf8')).toMatch(/await getSesion\(\)/) })
  }
})

describe('esActivo (menú del panel)', () => {
  it('marca la sección y sus subrutas', () => {
    expect(esActivo('/admin/empleados', '/admin/empleados')).toBe(true)
    expect(esActivo('/admin/empleados/abc/contrato', '/admin/empleados')).toBe(true)
  })
  it('no confunde prefijos ni rutas nulas', () => {
    expect(esActivo('/admin/empresa', '/admin/empleados')).toBe(false)
    expect(esActivo('/admin/empleadosx', '/admin/empleados')).toBe(false)
    expect(esActivo(null, '/admin/empleados')).toBe(false)
  })
})
