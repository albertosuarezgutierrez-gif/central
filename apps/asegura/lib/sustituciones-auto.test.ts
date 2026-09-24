// Cepo del enlace automático de sustituciones: lee el FUENTE (SQL crudo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./sustituciones-auto.ts', import.meta.url), 'utf8')

test('solo escribe NUESTROS campos, y sin pisar un enlace que ya exista', () => {
  assert.match(src, /set poliza_origen_id = \$\{e\.viejaId\}::uuid, updated_at = now\(\)\s+where id = \$\{e\.nuevaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and poliza_origen_id is null/)
  assert.match(src, /set sustituida_at = now\(\), updated_at = now\(\)\s+where id = \$\{e\.viejaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and sustituida_at is null/)
  assert.doesNotMatch(src, /update\s+(seguros\.)?polizas\b[^`]*\bset[^`]*\bestado\s*=/, 'el estado de la póliza es de CIMA')
})

test('la lectura va acotada a la correduría, a la cartera viva y sin fusionadas', () => {
  assert.match(src, /where p\.correduria_id = \$\{correduriaId\}::uuid and \$\{viva\} and p\.merged_into_poliza_id is null/)
})

test('🚨 solo se marca emitido el presupuesto cuya nueva es de la compañía ELEGIDA (por código DGS)', () => {
  assert.match(src, /lower\(trim\(o\.compania\)\) in \(lower\(cd\.nombre_comun\), lower\(coalesce\(cd\.nombre_cima, ''\)\)\)/)
  assert.match(src, /pr\.aceptado_at is not null and pr\.emitido_at is null and pr\.retirado_at is null/)
})

test('🚨 la anulación por sustitución no se abre sobre una póliza que ya tuvo expediente ni si la firmó con el presupuesto', () => {
  assert.match(src, /not exists \(select 1 from anulacion a where a\.poliza_id = v\.id\)/)
  assert.match(src, /not exists \(select 1 from presupuesto pr where pr\.poliza_id = v\.id and pr\.aceptado_at is not null and pr\.retirado_at is null\)/)
  // Nace pidiendo la firma: nunca firmada ni comunicada por su cuenta.
  assert.doesNotMatch(src, /insert into anulacion[^`]*'firmada'/)
})

test('🚨 la oportunidad se gana sola SOLO con una candidata del mismo cliente y la misma matrícula', () => {
  const f = src.slice(src.indexOf('export async function ganarOportunidadesEmitidas'))
  assert.match(f, /join polizas p on p\.correduria_id = \$\{correduriaId\}::uuid and p\.cliente_id = op\.cliente_id/)
  assert.match(f, /regexp_replace\(coalesce\(p\.datos_especificos->>'matricula', ''\)[^\n]*= op\.mat/)
  assert.match(f, /where op\.mat <> ''/, 'sin matrícula no se cierra sola')
  assert.match(f, /from cand where n = 1 and m = 1/, 'con dos candidatas, o una póliza para dos oportunidades, no se elige')
  // La póliza de la competencia que se quería sustituir no es la ganada.
  assert.match(f, /<> op\.num_comp/)
  // Llegó después de abrirse la oportunidad, viva y vigente; una póliza no gana dos oportunidades.
  assert.match(f, /p\.created_at >= \(op\.created_at at time zone 'UTC'\) - interval '10 minutes'/)
  // La renovación de lo que ya teníamos (misma compañía, ya en cartera antes) no es venta.
  assert.match(f, /v\.codigo_entidad_dgs is not distinct from p\.codigo_entidad_dgs\s+and v\.created_at < \(op\.created_at at time zone 'UTC'\)/)
  assert.match(f, /sqlCarteraViva\('p'\)/)
  assert.match(f, /not exists \(select 1 from oportunidades g where g\.poliza_ganada_id = p\.id\)/)
})

test('🚨 no toca retenciones ni leads del volcado, y solo cierra oportunidades abiertas', () => {
  const f = src.slice(src.indexOf('export async function ganarOportunidadesEmitidas'))
  assert.match(f, /o\.import_ref is null/)
  assert.match(f, /coalesce\(o\.info_riesgo->>'origen', ''\) <> \$\{ORIGEN_RETENCION\}/)
  assert.match(f, /where id = \$\{f\.id\}::uuid and estado::text = \$\{f\.estado\}/)
})
