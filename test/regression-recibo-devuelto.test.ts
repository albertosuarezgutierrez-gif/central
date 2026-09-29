// Recibos devueltos (28/09/2026): el plazo del art. 15 LCS corre desde el EFECTO del recibo, la
// devolución que avisa la compañía por correo no la deshace un dato viejo de CIMA, y la oportunidad
// solo se cierra con el cobro probado. Lee el FUENTE: lo que se vigila vive dentro de SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('el borrador al cliente cuenta el mes desde la fecha de EFECTO del recibo, no desde el fin de su periodo', () => {
  const src = leer('apps/asegura/lib/aprobaciones.ts')
  const proponer = src.slice(src.indexOf('export async function proponerReciboDevuelto'), src.indexOf('export const ORIGEN_ANULACION'))
  assert.match(proponer, /r\.fecha_efecto_actual at time zone 'Europe\/Madrid', 'YYYY-MM-DD'\) as vencimiento/)
  assert.doesNotMatch(proponer, /r\.fecha_vencimiento/)
})

test('la cola de impagos juzga el reloj por la fecha de efecto', () => {
  const src = leer('apps/asegura/lib/cartera-impagados.ts')
  assert.match(src, /const fecha = fechaIso\(r\.fechaEfectoActual\)/)
  assert.doesNotMatch(src, /fechaIso\(r\.fechaVencimiento\)/)
})

test('el trigger no tumba la ingesta y solo cede ante un dato de CIMA POSTERIOR a la devolución', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-09-29c_recibo_devolucion.sql')
  assert.match(sql, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING[\s\S]*RETURN NEW;/)
  // Y solo si la fecha es la del BANCO: con la del correo (Mapfre) un cobro viejo reescrito tarde la cerraría.
  assert.match(sql, /IF d\.resolucion_auto AND dia_cima IS NOT NULL AND dia_cima > d\.fecha_devolucion THEN/)
  assert.match(sql, /BEFORE INSERT OR UPDATE ON seguros\.poliza_recibos/)
  // Por nº de recibo sin ceros, no por uuid: la ingesta puede borrar y reinsertar.
  assert.match(sql, /id_recibo_norm = ltrim\(NEW\.id_recibo, '0'\)/)
})

test('las tareas de devolución salen en «Tareas de hoy» y el cierre exige el cobro probado', () => {
  const src = leer('apps/asegura/lib/devoluciones-recibo.ts')
  assert.match(src, /'central:seguimiento'\)`/)
  const cerrar = src.slice(src.indexOf('async function cerrarDevolucionesCobradas'), src.indexOf('// ── «Cobrado de nuevo»'))
  assert.match(cerrar, /r\.situacion::text = 'cobrado'/)
  assert.match(cerrar, /not exists \(select 1 from recibo_devolucion x/)
  // A mano solo se resuelve lo que avisó el correo: lo de CIMA lo resuelve CIMA.
  const resolver = src.slice(src.indexOf('export async function resolverDevolucion'))
  assert.match(resolver, /if \(resueltas === 0\)[\s\S]*status: 409/)
})

test('la pasada del detector sigue las devoluciones con su propio punto de guardado', () => {
  const src = leer('apps/asegura/lib/eventos-cartera.ts')
  assert.match(src, /savepoint devoluciones`[\s\S]*seguirDevoluciones\(tx, correduriaId\)[\s\S]*rollback to savepoint devoluciones/)
})

test('revisión de alto riesgo: guardas que no pueden volver a caer', () => {
  const src = leer('apps/asegura/lib/devoluciones-recibo.ts')
  // No se marca devuelto un recibo del que CIMA ya sabe algo posterior.
  assert.match(src, /\(fecha_situacion is null or \(fecha_situacion at time zone 'Europe\/Madrid'\)::date <= \$\{d\.fechaDevolucion\}::date\)/)
  // «Cobrado de nuevo» solo resuelve la devolución de ESA compañía.
  assert.match(src, /\(id_recibo_norm, codigo_entidad_dgs\) = \(select ltrim\(id_recibo, '0'\), codigo_entidad_dgs/)
  // Al pasar de hito solo se cierran las tareas propias, nunca una manual que diga «devuelto».
  assert.match(src, /starts_with\(observaciones, \$\{PREFIJO_TAREA_DEVOLUCION\}\)/)
  assert.doesNotMatch(src, /ilike '%devuelto%'/)
  // Una oportunidad CERRADA por Alberto no se reabre, y el triaje y la pasada diaria van en fila.
  assert.match(src, /estado::text in \('ganada', 'perdida'\)/)
  assert.match(src, /pg_advisory_xact_lock\(hashtext\(\$\{`devolucion:\$\{r\.polizaId\}`\}\)\)/)
})
