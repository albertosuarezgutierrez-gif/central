// Guardián: el `acceso_token` de un empleado es una credencial (con él se entra al portal /e como
// ese empleado). No puede viajar al navegador en listados ni en props Server→Client del panel.
// Incidente 05/10/2026: GET /api/admin/empleados y /admin/empleados lo devolvían de TODA la plantilla.
// Única lectura permitida: POST /api/admin/empleados/[id]/enlace (uno a uno, a petición expresa).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import {
  COLUMNAS_LISTADO_EMPLEADOS, COLUMNAS_SECRETAS_EMPLEADOS, SQL_COLUMNAS_LISTADO_EMPLEADOS, rutaPortalEmpleado,
} from './empleados-columnas'

const RAIZ = path.resolve(__dirname, '..')
const SECRETAS = COLUMNAS_SECRETAS_EMPLEADOS as readonly string[]
const LECTURA_PERMITIDA = new Set(['app/api/admin/empleados/[id]/enlace/route.ts'])

function ficheros(dir: string): string[] {
  const abs = path.join(RAIZ, dir)
  return readdirSync(abs).flatMap(n => {
    const p = path.join(abs, n)
    const rel = path.join(dir, n).split(path.sep).join('/')
    if (statSync(p).isDirectory()) return ficheros(rel)
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : []
  })
}
const PANEL = [...ficheros('app/admin'), ...ficheros('app/api/admin')]
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8')

/** Proyecciones SQL del fichero: lo que va entre SELECT…FROM y lo que sigue a RETURNING. */
function proyecciones(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bSELECT\b([\s\S]*?)\bFROM\b/gi)) out.push(m[1])
  for (const m of src.matchAll(/\bRETURNING\b([^`;]*)/gi)) out.push(m[1])
  return out
}

describe('lista blanca del listado de empleados', () => {
  it('no contiene columnas secretas', () => {
    for (const c of SECRETAS) expect(COLUMNAS_LISTADO_EMPLEADOS as readonly string[]).not.toContain(c)
    for (const c of SECRETAS) expect(SQL_COLUMNAS_LISTADO_EMPLEADOS).not.toMatch(new RegExp(`\\b${c}\\b`))
  })

  it('el listado (API y página) usa la lista blanca', () => {
    for (const rel of ['app/api/admin/empleados/route.ts', 'app/admin/empleados/page.tsx']) {
      expect(leer(rel), rel).toMatch(/Prisma\.raw\(SQL_COLUMNAS_LISTADO_EMPLEADOS\)/)
    }
  })

  it('la ruta del portal se construye con el token codificado', () => {
    expect(rutaPortalEmpleado('abc_-9')).toBe('/e/abc_-9')
    expect(rutaPortalEmpleado('a/b')).toBe('/e/a%2Fb')
  })
})

describe('el panel (/admin y /api/admin) no expone credenciales del empleado', () => {
  it('encuentra los ficheros del panel', () => {
    expect(PANEL).toContain('app/api/admin/empleados/route.ts')
    expect(PANEL.length).toBeGreaterThan(20)
  })

  it('ninguna SELECT/RETURNING proyecta acceso_token o pin_hash (salvo /enlace)', () => {
    const fallos: string[] = []
    for (const rel of PANEL) {
      const src = leer(rel)
      for (const p of proyecciones(src)) {
        for (const c of SECRETAS) {
          if (!new RegExp(`\\b${c}\\b`).test(p)) continue
          if (c === 'acceso_token' && LECTURA_PERMITIDA.has(rel)) continue
          fallos.push(`${rel}: proyecta ${c}`)
        }
      }
      if (/\bSELECT\s+(?:\w+\.)?\*\s+FROM\s+rrhh\.empleados\b/i.test(src)) fallos.push(`${rel}: SELECT * de rrhh.empleados`)
      if (/\bpin_hash\b/.test(src)) fallos.push(`${rel}: menciona pin_hash`)
    }
    expect(fallos).toEqual([])
  })

  it('ninguna respuesta JSON ni prop de Client Component lleva la clave acceso_token', () => {
    const fallos: string[] = []
    for (const rel of PANEL) {
      const src = leer(rel)
      if (/NextResponse\.json\(\s*\{[^;]*\bacceso_token\s*:/.test(src)) fallos.push(`${rel}: JSON con acceso_token`)
      if (/\.tsx$/.test(rel) && /\bacceso_token\b/.test(src)) fallos.push(`${rel}: componente menciona acceso_token`)
    }
    expect(fallos).toEqual([])
  })
})
