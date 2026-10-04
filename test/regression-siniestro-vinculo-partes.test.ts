// Revisión 03/10/2026 (hallazgos menores): cepos sobre el FUENTE de lo que tsc no ve.
//  - moverParte → abierto_en_compania: rechaza siniestro fusionado, no re-vincula en silencio
//    un parte ya vinculado y deja el mismo rastro (`siniestroVinculo`) que el vínculo manual.
//  - abrirSiniestro con parteId: el historial NO se anota dentro de la transacción
//    (un error tragado dentro de la tx la deja abortada); se difiere a tras el commit.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

test('moverParte: siniestro destino fusionado se rechaza', () => {
  const s = leer('apps/asegura/lib/partes-portal.ts')
  assert.match(s, /fusionadoEnSiniestroId: true/)
  assert.match(s, /fusionadoEnSiniestroId !== null\) return fallo\('siniestro_fusionado', 409\)/)
})

test('moverParte: parte ya vinculado a otro siniestro → conflicto, no re-vínculo silencioso', () => {
  const s = leer('apps/asegura/lib/partes-portal.ts')
  assert.match(s, /actual\.siniestroId !== null && actual\.siniestroId !== siniestroId\) return fallo\('ya_vinculado', 409\)/)
})

test('moverParte: registra siniestroVinculo y siniestroVinculadoAt como el vínculo manual', () => {
  const s = leer('apps/asegura/lib/partes-portal.ts')
  assert.match(s, /data\.siniestroVinculo = 'manual'/)
  assert.match(s, /data\.siniestroVinculadoAt = new Date\(\)/)
})

test('abrirSiniestro con parte: el historial va fuera de la transacción', () => {
  const c = leer('apps/asegura/lib/cartera-siniestros.ts')
  assert.match(c, /diferirHistorial: true/)
  const tx = c.slice(c.indexOf('db.$transaction(async (tx)'), c.indexOf('if (r instanceof ParteNoVinculable)'))
  assert.doesNotMatch(tx, /anotarHistorial/)
  assert.match(c, /await anotarHistorialVinculo\(db, correduriaId, r\.nota\.clienteId, r\.nota\.texto\)/)
  const v = leer('apps/asegura/lib/siniestros-vinculo.ts')
  assert.match(v, /if \(e\.diferirHistorial\) return \{ ok: true[^\n]*nota:/)
})
