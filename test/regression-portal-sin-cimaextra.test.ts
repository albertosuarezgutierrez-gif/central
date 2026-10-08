// Guardián: el portal del CLIENTE nunca lee `cimaExtra` (03/10/2026).
//
// `cimaExtra` es «todo lo que CIMA manda y ningún extractor lee» (asegura#873): sin filtrar por nivel, sin
// revisar, y pensado SOLO para la intranet del operador (/correduria, `MasDatosCima`). En el portal el
// aislamiento lo da el CÓDIGO y cada dato sale por LISTA BLANCA y por nivel; un campo suelto aquí podría
// llevar comisiones, prima neta o datos de terceros al cliente.
//
// 1. Ninguna línea de `apps/asegura-portal/**` ni `packages/module-seguros-portal/**` menciona `cimaExtra`.
// 2. `datos_especificos` de PÓLIZA solo lo tocan los archivos de la lista de abajo (cada uno con su motivo,
//    y todos leen por clave concreta). Un archivo nuevo que lo lea rompe este test: hay que justificarlo.
// 3. Ni siquiera esos archivos lo propagan entero (spread, Object.entries/keys/values, JSON.stringify).
// 4. El schema del portal NO declara `datos_extra` en el modelo del recibo (`poliza_recibos`): ahí vive el
//    `cimaExtra` de los recibos. (`poliza_coberturas.datos_extra` SÍ se lee: límite de la RC/PS, central#4157.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const RAICES = ['apps/asegura-portal', 'packages/module-seguros-portal']
const EXT = /\.(ts|tsx|mts|js|mjs|prisma|sql)$/

function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'generated') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (EXT.test(n)) out.push(p)
  }
  return out
}

const TODOS = RAICES.flatMap((r) => archivos(join(ROOT, r)))
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/')
const texto = (p: string) => readFileSync(p, 'utf8')

/** Quién puede tocar `datos_especificos` de póliza, y por qué. Todos por clave/lista blanca. */
const PERMITIDOS_DATOS_ESPECIFICOS: Record<string, string> = {
  'apps/asegura-portal/prisma/schema.prisma': 'declara la columna concedida al rol del portal',
  'apps/asegura-portal/prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql': 'GRANT de columnas al rol del portal',
  'apps/asegura-portal/lib/cartera-lectura.ts': 'lectura de cartera: dirección cifrada, prima dudosa, gemela; cada uso por clave',
  'apps/asegura-portal/lib/datos-poliza-cima.ts': 'lo que CIMA sirve al asegurado, filtrado por NIVEL y por lista blanca',
  'apps/asegura-portal/lib/datos-poliza-cima.test.ts': 'test de lo anterior',
  'apps/asegura-portal/lib/presupuesto.ts': 'bien y ubicación de la póliza para el presupuesto (dirección descifrada por clave)',
  'apps/asegura-portal/lib/flota.ts': 'flota de empresa (05/10/2026): matrícula/marca por `describirBien` y `fechaMatriculacion` por clave (`matriculacionDeCompania`); no viaja a la pantalla',
  'packages/module-seguros-portal/src/bien-asegurado.ts': 'describe el bien (matrícula/dirección) por clave concreta',
  'packages/module-seguros-portal/src/bien-asegurado.test.ts': 'test de lo anterior',
}

test('el portal nunca menciona cimaExtra', () => {
  const malos = TODOS.filter((p) => /cimaExtra/i.test(texto(p))).map(rel)
  assert.deepEqual(malos, [], 'cimaExtra es solo del operador: no entra en el portal ni en module-seguros-portal')
})

test('datos_especificos de póliza solo lo toca la lista justificada', () => {
  const tocan = TODOS.filter((p) => /datosEspecificos|datos_especificos/.test(texto(p))).map(rel)
  const nuevos = tocan.filter((f) => !(f in PERMITIDOS_DATOS_ESPECIFICOS))
  assert.deepEqual(nuevos, [], 'archivo nuevo del portal lee datos_especificos: justifícalo en PERMITIDOS_DATOS_ESPECIFICOS (por clave, por nivel, nunca entero)')
  // La lista no se pudre: cada entrada tiene que seguir tocándolo.
  const huerfanos = Object.keys(PERMITIDOS_DATOS_ESPECIFICOS).filter((f) => !tocan.includes(f))
  assert.deepEqual(huerfanos, [], 'entrada de la lista que ya no lee datos_especificos: quítala')
})

test('datos_especificos nunca se propaga entero (spread / Object.* / JSON.stringify)', () => {
  const RE = /(\.\.\.|Object\.(?:entries|keys|values)\(|JSON\.stringify\()\s*[A-Za-z_.?!()]*(?:datosEspecificos|datos_especificos)\b/
  const malos = TODOS.filter((p) => !/\.(test\.ts|sql|prisma)$/.test(p) && RE.test(texto(p))).map(rel)
  assert.deepEqual(malos, [])
})

test('el schema del portal no declara datos_extra en el recibo', () => {
  const s = texto(join(ROOT, 'apps/asegura-portal/prisma/schema.prisma'))
  const m = /model\s+\w+\s*\{[^}]*@@map\("poliza_recibos"\)[^}]*\}/.exec(s)
  if (m === null) return // el portal ni siquiera mapea recibos
  assert.ok(!/datos_extra/.test(m[0]), 'el modelo del recibo del portal declara datos_extra (cimaExtra del recibo)')
})
