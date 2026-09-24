// Cepo del flujo de retención (pieza 2-b). Lee el FUENTE: lo que vigila vive en SQL crudo y en el
// orden de la transacción, donde ni tsc ni el build miran, e importar el módulo arrastraría Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')

test('la retención se abre DENTRO de la transacción del detector, antes de guardar la foto', () => {
  const abre = src.indexOf('await abrirRetencion(tx,')
  const foto = src.indexOf('insert into cartera_foto')
  assert.ok(abre > 0, 'abrirRetencion con el tx de la detección')
  assert.ok(abre < foto, 'si la retención falla, la foto no se guarda y se reintenta')
})

test('solo baja / anula al vencimiento SIN sustitución abren retención', () => {
  assert.match(src, /new Set<string>\(\['POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_BAJA'\]\)/)
  assert.match(src, /!RETENIBLES\.has\(e\.tipo\) \|\| !esFugaSinExplicar\(e\)/)
  assert.match(src, /p\.sustituida_at is null/)
})


test('un fallo al abrir la retención de UNA póliza no tumba la detección (punto de guardado)', () => {
  assert.match(src, /savepoint retencion`[\s\S]*abrirRetencion\(tx,[\s\S]*rollback to savepoint retencion/)
})

test('en cada pasada se cierran las retenciones que ya no hacen falta, antes de guardar la foto', () => {
  const cierra = src.indexOf('await cerrarRetencionesResueltas(tx,')
  assert.ok(cierra > 0 && cierra < src.indexOf('insert into cartera_foto'))
  assert.match(src, /resolucion = 'no_es_perdida'/)
  assert.match(src, /any\(\$\{ESTADOS_VIGENTES\}::text\[\]\)/)
})

test('no se abre retención si la póliza ya tiene CUALQUIER oportunidad abierta (portal incluido)', () => {
  const abrir = src.slice(src.indexOf('async function abrirRetencion'), src.indexOf('const ESTADOS_VIGENTES'))
  assert.doesNotMatch(abrir, /info_riesgo->>'origen' = \$\{ORIGEN_RETENCION\}/)
})

test('🚨 la sustitución se enlaza ANTES de la foto: la baja de la vieja no nace como fuga', () => {
  const enlace = src.indexOf('await enlazarSustituciones(tx, correduriaId)')
  assert.ok(enlace > 0, 'detectarYGuardar ya no enlaza sustituciones')
  assert.ok(enlace < src.indexOf('await fotoActual(correduriaId, tx)'), 'enlazar después de la foto deja la baja como fuga')
  // Con punto de guardado: un fallo del enlace no puede tumbar la detección de eventos entera.
  assert.ok(src.lastIndexOf('savepoint sustitucion`', enlace) > 0 && src.indexOf('rollback to savepoint sustitucion', enlace) > enlace)
})

test('🚨 el cierre de oportunidades ganadas va en su PROPIO punto de guardado y se audita tras el commit', () => {
  const d = src.slice(src.indexOf('export async function detectarYGuardar'))
  const sust = d.slice(d.indexOf('savepoint sustitucion'), d.indexOf('release savepoint sustitucion'))
  assert.doesNotMatch(sust, /ganarOportunidadesEmitidas/, 'dentro del savepoint de sustituciones, un fallo suyo deshace los enlaces')
  assert.match(d, /savepoint ganar_oportunidad`\s+try \{\s+ganadas = await ganarOportunidadesEmitidas\(tx, correduriaId\)/)
  assert.match(d, /rollback to savepoint ganar_oportunidad`\s+oportunidadesFallidas = true/)
  const tras = d.slice(d.indexOf('}, { timeout: 30_000 }).then('))
  assert.match(tras, /for \(const g of ganadas\) anotarCambio\(/)
})
