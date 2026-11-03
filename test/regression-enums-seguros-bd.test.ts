// Cepo: los enum de seguros.* en los schema.prisma deben coincidir con la BD (la BD manda).
// Incidente 02/11/2026: asegura.prisma tenía portal_bien_tipo = {vehiculo,vivienda,otro} y la BD
// {vehiculo,vivienda,local,mascota,persona,empresa}: leer «mascota» con Prisma reventaba.
// BD_SEGUROS = `pg_enum` del schema seguros (proyecto central wswbehlcuxqxyinousql), leído el 02/11/2026.
// Si la BD cambia, actualiza ESTA foto y el schema a la vez.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BD_SEGUROS: Record<string, string[]> = {
  portal_bien_tipo: ['vehiculo', 'vivienda', 'local', 'mascota', 'persona', 'empresa'],
  portal_canal_tipo: ['whatsapp', 'email'],
  portal_obligacion_tipo: ['poliza', 'itv', 'carnet', 'recibo', 'mantenimiento', 'revision_gas', 'libre'],
  portal_parte_estado: ['enviado', 'recibido', 'abierto_en_compania', 'descartado'],
  portal_procedencia: ['compania', 'calculado', 'declarado', 'documento'],
}

const RAIZ = join(import.meta.dirname, '..')
const SCHEMAS = ['apps/asegura/prisma/asegura.prisma', 'apps/asegura-portal/prisma/schema.prisma']

function enumsPrisma(ruta: string): Map<string, string[]> {
  const src = readFileSync(join(RAIZ, ruta), 'utf8')
  const out = new Map<string, string[]>()
  for (const m of src.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const cuerpo = m[2]
    const mapa = cuerpo.match(/@@map\("([^"]+)"\)/)?.[1] ?? m[1]
    const vals = cuerpo
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => l && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0])
    out.set(mapa, vals)
  }
  return out
}

for (const ruta of SCHEMAS) {
  test(`${ruta}: enum de seguros alineados con la BD`, () => {
    const enums = enumsPrisma(ruta)
    for (const [nombre, vals] of enums) {
      const bd = BD_SEGUROS[nombre]
      if (!bd) continue
      assert.deepEqual([...vals].sort(), [...bd].sort(), `enum ${nombre} en ${ruta} difiere de la BD`)
    }
  })
}

test('portal_bien_tipo incluye mascota en ambos schemas', () => {
  for (const ruta of SCHEMAS) assert.ok(enumsPrisma(ruta).get('portal_bien_tipo')?.includes('mascota'), ruta)
})
