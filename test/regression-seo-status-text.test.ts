// Guardián: `seo_proposals.status` es TEXT en la BD compartida, no un enum (31/08/2026).
//
// El cron semanal del agente SEO de housesevillana (`apps/sivra/api/seo-refresh`) murió el
// 31/08/2026 con `42704: type "public.SeoStatus" does not exist`: el schema de Prisma de
// sivra declaraba `status SeoStatus` (enum) mientras la columna real de `seo_proposals` es
// `text` — Prisma castea el parámetro a `"public"."SeoStatus"` en el INSERT y Postgres no
// conoce ese tipo. El `create` de sivra no había funcionado NUNCA (las 6 filas que existían
// las insertó el botón de plataforma por SQL crudo, con ids UUID en vez de cuid); hasta ese
// día el cron moría antes de llegar al INSERT (token de GitHub, etc.) y el desajuste no se veía.
//
// El arreglo correcto es el schema, NO la BD: crear el enum y convertir la columna rompería
// el INSERT crudo de plataforma (`app/api/sivra/seo-refresh/route.ts`, que manda 'APPLIED'
// como parámetro text) y es un cambio de BD compartida para nada. Este test fija esa decisión.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SCHEMA = join(ROOT, 'apps/sivra/prisma/schema.prisma')

test('el schema de sivra no declara el enum SeoStatus (no existe en la BD)', () => {
  const schema = readFileSync(SCHEMA, 'utf8')
  assert.ok(
    !/enum\s+SeoStatus/.test(schema),
    'apps/sivra/prisma/schema.prisma declara `enum SeoStatus`, pero ese tipo NO existe en la ' +
      'BD compartida (la columna seo_proposals.status es text). Prisma castearía el INSERT a ' +
      '"public"."SeoStatus" y el cron seo-refresh volvería a morir con 42704. Deja status como String.',
  )
})

test('SeoProposal.status es String con default "PENDING"', () => {
  const schema = readFileSync(SCHEMA, 'utf8')
  const modelo = schema.match(/model\s+SeoProposal\s*\{[\s\S]*?\n\}/)?.[0]
  assert.ok(modelo, 'el modelo SeoProposal ha desaparecido del schema de sivra')
  assert.match(
    modelo,
    /status\s+String\s+@default\("PENDING"\)/,
    'SeoProposal.status debe ser `String @default("PENDING")` — la columna real es text ' +
      '(valores PENDING/APPLIED/REJECTED/REVERTED) y el default de la BD es \'PENDING\'::text.',
  )
})
