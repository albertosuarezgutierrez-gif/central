// Guardián de AISLAMIENTO del MOTE (05/10/2026, decisión de Alberto). `node --test` (gate en CI vía `pnpm test`).
//
// El mote de una ficha («mamá», «Burra», «Benito Pintor») es cómo la llama Alberto en SU agenda de
// Google. Si se colara en un correo, en el portal del cliente, en un PDF o en un envío a una compañía
// («Estimada Burra») sería grave. Por eso vive en una tabla aparte (`seguros.cliente_mote`, sin
// relación Prisma con `Cliente`) y SOLO lo pueden nombrar los archivos de abajo: la sync de Google,
// la edición en la ficha y la cola de revisión.
//
// FALLA si `cliente_mote` / `clienteMote` / `mote(s)` aparece en código de la correduría o de los
// paquetes fuera de la lista blanca. Añadir un archivo a la lista exige justificar que el mote NO
// sale de la agenda de Alberto.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PATRON = /cliente_?mote|\bmotes?\b/i
const AMBITO = /^(apps\/(asegura|asegura-portal|asegura-web|plataforma)\/|packages\/)/

const PERMITIDOS = new Set([
  // Sync de Google Contacts (lógica pura + selección + cron)
  'packages/module-seguros/src/google-contactos.ts',
  'packages/module-seguros/src/google-contactos-revision.ts',
  'packages/module-seguros/src/google-contactos-unificar.test.ts',
  'packages/module-seguros/src/google-contactos-estados.test.ts',
  'apps/asegura/lib/contactos-google.ts',
  'apps/asegura/lib/google-contactos.ts',
  'apps/asegura/lib/google-people.ts',
  // Cola de revisión («Unificar», «Usar como mote»)
  'apps/asegura/lib/google-contactos-revision.ts',
  'apps/plataforma/app/(usuario)/correduria/GoogleContactosRevision.tsx',
  'apps/plataforma/app/(usuario)/correduria/GoogleContactosOrdenar.tsx',
  // Edición en la ficha (se lee aparte, no viaja con la ficha)
  'apps/asegura/lib/cliente-mote.ts',
  'apps/asegura/app/api/operador/cliente/mote/route.ts',
  'apps/plataforma/app/api/correduria/cliente-mote/route.ts',
  'apps/plataforma/lib/seguimiento-asegura.ts',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/MoteAgenda.tsx',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/Cabecera.tsx',
  // Esquema
  'apps/asegura/prisma/asegura.prisma',
  'apps/asegura/prisma/sql/2026-10-05d_google_contactos_unificar.sql',
])

/** Rastreados y nuevos aún sin añadir (un archivo nuevo también cuenta). */
export function archivosConMote(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter((f) => AMBITO.test(f) && /\.(ts|tsx|mjs|js|sql|prisma)$/.test(f) && !f.includes('/generated/') && !f.includes('node_modules/'))
    .filter((f) => {
      try {
        return PATRON.test(readFileSync(join(ROOT, f), 'utf8'))
      } catch {
        return false
      }
    })
}

test('🪤 el mote solo aparece en la sync de Google, la ficha y la cola (nunca en correos/portal/PDF/envíos)', () => {
  const fuera = archivosConMote().filter((f) => !PERMITIDOS.has(f))
  assert.deepEqual(fuera, [], `El mote se nombra fuera de la lista blanca: ${fuera.join(', ')}`)
})

test('la tabla del mote NO tiene relación Prisma con Cliente (un include no puede arrastrarlo)', () => {
  const schema = readFileSync(join(ROOT, 'apps/asegura/prisma/asegura.prisma'), 'utf8')
  const modelo = schema.match(/model ClienteMote \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(modelo.includes('@@map("cliente_mote")'), 'falta el modelo ClienteMote')
  assert.ok(!/@relation|\bCliente\b\s/.test(modelo.replace('model ClienteMote', '')), 'ClienteMote no debe relacionarse con Cliente')
  const cliente = schema.match(/model Cliente \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(!/ClienteMote|mote/i.test(cliente), 'Cliente no debe tener el mote ni una relación hacia él')
})
