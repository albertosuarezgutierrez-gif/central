// Guardián del borrador de presupuesto EN SERVIDOR (05/10/2026). `node --test` (pnpm test:guardia).
//
// Lo que protege, y por qué cada brazo:
//   1. La MIGRACIÓN (`seguros.borradores_presupuesto`): el borrador lleva DNI, nombre y fechas de
//      nacimiento tecleados. Si un día se «simplifica» a jsonb en claro, o se le da GRANT al rol del
//      portal (`prisma_asegura_portal`, SIN RLS útil: el aislamiento es del código) o a la ingesta de
//      Manuel (`crm_seguros`, que recibe DML en `seguros` por privilegios por defecto), nada falla y
//      los datos quedan expuestos. Y sin `correduria_id` en el único, dos corredurías se pisarían.
//   2. La escritura (`apps/asegura/lib/borrador-presupuesto.ts`): cifra, filtra por correduría, y un
//      guardado más VIEJO no pisa al nuevo (pestaña antigua, `keepalive` tardío).
//   3. La pantalla (`AutoNuevo.tsx`): NADA sube al servidor antes de haber leído el del servidor. Sin
//      esa compuerta, los valores por defecto de una pantalla recién abierta en el móvil pisarían el
//      borrador bueno tecleado en el ordenador — exactamente lo contrario de lo que pidió Alberto.
//      Y al pagar, el del servidor se borra igual que el local.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const sinComentariosSql = (s: string) => s.replace(/--.*$/gm, '')

const MIGRACION = sinComentariosSql(leer('apps/asegura/prisma/sql/2026-10-05_borradores_presupuesto.sql'))
const LIB = leer('apps/asegura/lib/borrador-presupuesto.ts')
const PANTALLA = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx')

test('migración: datos CIFRADOS (text), nunca un jsonb en claro', () => {
  assert.match(MIGRACION, /datos_cifrados\s+text\s+NOT NULL/)
  assert.doesNotMatch(MIGRACION, /\bjsonb\b/i, 'el borrador lleva DNI: va cifrado con encryptField, no en jsonb')
})

test('migración: RLS activada, solo prisma_seguros; ni portal ni crm_seguros', () => {
  assert.match(MIGRACION, /ALTER TABLE seguros\.borradores_presupuesto ENABLE ROW LEVEL SECURITY/)
  assert.match(MIGRACION, /REVOKE ALL ON seguros\.borradores_presupuesto FROM[^;]*\bcrm_seguros\b/)
  assert.match(MIGRACION, /GRANT [A-Z, ]+ ON seguros\.borradores_presupuesto TO prisma_seguros;/)
  assert.doesNotMatch(MIGRACION, /prisma_asegura_portal/, 'el portal del cliente no ve borradores del corredor')
  const grants = MIGRACION.match(/GRANT[^;]*;/g) ?? []
  assert.equal(grants.length, 1, `un solo GRANT (a prisma_seguros); hay: ${grants.join(' | ')}`)
})

test('migración: uno por correduría + cliente + ramo + oportunidad, y purga a 60 días', () => {
  assert.match(MIGRACION, /UNIQUE INDEX[^;]*\(correduria_id, cliente_id, ramo, coalesce\(oportunidad_id,/)
  assert.match(MIGRACION, /cron\.schedule\('seguros-purga-borradores-presupuesto'[^;]*interval '60 days'/)
})

test('escritura: cifra, filtra por correduría y no deja que lo viejo pise lo nuevo', () => {
  assert.match(LIB, /encryptField\(JSON\.stringify\(b\.datos\)\)/)
  assert.match(LIB, /c\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(LIB, /where borradores_presupuesto\.guardado_en <= excluded\.guardado_en/)
  assert.match(LIB, /marcaCreible\(/, 'un reloj adelantado se recorta a now()')
  const codigo = LIB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(codigo, /historial_interno|estado_comercial|insert into oportunidades/i, 'un borrador no es cartera ni oportunidad')
})

test('pantalla: nada sube al servidor antes de reconciliar, y al pagar se borra también allí', () => {
  assert.match(PANTALLA, /if \(!reconciliado\.current \|\| !datos\) return/, 'compuerta de subirBorrador')
  assert.match(PANTALLA, /if \(reconciliado\.current && JSON\.stringify\(datos\) !== baseServidor\.current\)/, 'compuerta del autoguardado')
  assert.match(PANTALLA, /elegirMasReciente\(local, srv\)/)
  assert.match(PANTALLA, /borrarBorrador\(claveBorrador\)\s*\n[\s\S]{0,400}borrarBorradorServidor\(clienteId, 'auto'/)
  assert.match(PANTALLA, /addEventListener\('pagehide'/)
  assert.match(PANTALLA, /addEventListener\('visibilitychange'/)
})
