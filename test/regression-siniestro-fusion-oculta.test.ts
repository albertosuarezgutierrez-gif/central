// Alta manual de siniestro FUSIONADA en el que mandó la compañía por CIMA
// (03/10/2026, `siniestro-vinculo.ts`, SQL 2026-10-03d): la fila manual se
// CONSERVA con `fusionado_en_siniestro_id`, así que toda lectura que pinte o
// cuente siniestros tiene que filtrarla. Si un lector se olvida, el cliente (o
// Alberto) ve el mismo siniestro DOS veces y los contadores de «abiertos» y de
// «siniestros de la póliza» se inflan. tsc no lo ve: es un `where` que falta.
//
// Y la otra mitad del mismo fallo: el vínculo parte→siniestro solo puede pasar
// el parte a `abierto_en_compania` con `conocidoPorCompania()` (CIMA o nº de la
// compañía); un alta manual sin nº lo deja en `recibido`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

const LECTORES: { fichero: string; patron: RegExp }[] = [
  // Ficha de cliente: la lista y el contador por póliza.
  { fichero: 'apps/asegura/lib/cartera-ficha.ts', patron: /siniestro\.findMany\(\{\s*(?:\/\/[^\n]*\n\s*)*where: \{ correduriaId, clienteId, fusionadoEnSiniestroId: null \}/ },
  { fichero: 'apps/asegura/lib/cartera-ficha.ts', patron: /siniestro\.count\(\{ where: \{ correduriaId, polizaId: p\.id, fusionadoEnSiniestroId: null \} \}\)/ },
  // Ficha de póliza.
  { fichero: 'apps/asegura/lib/cartera-poliza.ts', patron: /siniestros: \{ where: \{ fusionadoEnSiniestroId: null \}, select: SELECT_SINIESTRO/ },
  // Resumen: «siniestros abiertos».
  { fichero: 'apps/asegura/lib/cartera.ts', patron: /siniestro\.count\(\{ where: \{ correduriaId, fusionadoEnSiniestroId: null, estado:/ },
  // Eventos y conteos crudos.
  { fichero: 'apps/asegura/lib/eventos-cartera.ts', patron: /from siniestros s where s\.correduria_id = \$\{correduriaId\}::uuid and s\.fusionado_en_siniestro_id is null/ },
  { fichero: 'apps/asegura/lib/seguro-anterior-candidatas.ts', patron: /from siniestros s where [^)]*s\.fusionado_en_siniestro_id is null\)/ },
  { fichero: 'apps/asegura/lib/poliza-cambios-detector.ts', patron: /siniestros: \{ where: \{ fusionadoEnSiniestroId: null \}/ },
  // El portal del CLIENTE.
  { fichero: 'apps/asegura-portal/lib/cartera-lectura.ts', patron: /where: \{ polizaId: \{ in: polizaIds \}, fusionadoEnSiniestroId: null \}/ },
]

for (const { fichero, patron } of LECTORES) {
  test(`fusión de siniestros: ${fichero} oculta las altas manuales ya fusionadas (${patron.source.slice(0, 40)}…)`, () => {
    assert.match(leer(fichero), patron)
  })
}

test('fusión de siniestros: el portal tiene GRANT de la columna que filtra (si no, su lectura muere con permission denied)', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-10-03d_siniestro_vinculo_parte_fusion.sql')
  assert.match(sql, /grant select \(fusionado_en_siniestro_id\) on seguros\.siniestros to prisma_asegura_portal/)
})

test('vínculo parte→siniestro: «abierto en la compañía» solo con conocidoPorCompania()', () => {
  const src = leer('apps/asegura/lib/siniestros-vinculo.ts')
  const tramo = src.slice(src.indexOf('export async function vincularParteEn'), src.indexOf('export async function vincularParte('))
  assert.ok(tramo.length > 0, 'no se encuentra vincularParteEn')
  assert.match(tramo, /const comunicado = conocidoPorCompania\(s\)/)
  assert.match(tramo, /if \(comunicado\) \{\s*data\.estado = 'abierto_en_compania'/)
  // Ningún otro camino del tramo pone el estado a abierto_en_compania.
  assert.equal((tramo.match(/'abierto_en_compania'/g) ?? []).length, 2, 'abierto_en_compania solo en la rama comunicado (y el tipo de retorno)')
})
