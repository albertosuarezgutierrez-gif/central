// «El cliente se va» desde un recibo devuelto (29/09/2026): el corredor da la póliza por anulada antes
// que CIMA, la pérdida se convierte en la oportunidad del año que viene, y lo que CIMA mande después
// no la reabre ni la anuncia como fuga. Lee el FUENTE: lo que se vigila vive dentro de SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('un «vigente» de CIMA no reabre una póliza con la baja verificada', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-09-29h_poliza_baja_verificada.sql')
  assert.match(sql, /BEFORE UPDATE OF estado ON seguros\.polizas/)
  assert.match(sql, /WHEN \(OLD\.baja_verificada_at IS NOT NULL AND NEW\.baja_verificada_at IS NOT NULL\)/)
  assert.match(sql, /IF NEW\.estado::text IN \('activa', 'en_renovacion', 'en_vigor', 'recibo_devuelto', 'cambio_clave'\) THEN\s+NEW\.estado := 'cancelada';/)
  // …pero lo que dice CIMA NO se traga: se guarda para que la ficha avise si la sigue dando en vigor.
  assert.match(sql, /NEW\.baja_estado_cima := NEW\.estado::text;/)
})

test('dar de baja: cierra la devolución, anula, pierde lo del impago y abre la competencia del aniversario', () => {
  const src = leer('apps/asegura/lib/devoluciones-recibo.ts')
  const f = src.slice(src.indexOf('export async function darDeBajaPorDevolucion'))
  // Solo desde un recibo DEVUELTO y sobre una póliza aún en vigor.
  assert.match(f, /if \(r\.situacion !== 'devuelto'\)/)
  assert.match(f, /if \(r\.baja \|\| !\(POLIZA_ESTADOS_VIGENTES as readonly string\[\]\)\.includes\(r\.estado\)\)/)
  assert.match(f, /resuelta_motivo = 'manual:baja'/)
  assert.match(f, /baja_estado_previo = estado::text, estado = 'cancelada'/)
  assert.match(f, /update oportunidades set estado = 'perdida', motivo_perdida = \$\{motivo\}/)
  // El correo al cliente que esperaba el OK no sale: ya no hay recibo que reclamar.
  assert.match(f, /update aprobacion set estado = 'rechazada'[\s\S]*origen = \$\{'recibo_devuelto'\} and estado = 'pendiente'/)
  assert.match(f, /'renovacion', 'competencia',\s+\$\{vence\}::date/)
  assert.match(f, /vencimientoCompetencia\(r\.efecto, r\.vencePoliza, hoy\)/)
  // La matrícula viaja a la oportunidad: con ella se tarifica y la sustitución automática la casa con la póliza nueva.
  assert.match(f, /nullif\(trim\(p\.datos_especificos->>'matricula'\), ''\) as matricula/)
  assert.match(f, /\.\.\.\(r\.matricula \? \{ matricula: r\.matricula \} : \{\}\)/)
  // Un solo sitio de cierre: todo en una transacción.
  assert.match(f, /return prismaAsegura\(\)\.\$transaction\(/)
})

test('cuando CIMA trae la baja, queda explicada: sin retención ni aviso de fuga', () => {
  const src = leer('apps/asegura/lib/eventos-cartera.ts')
  const ret = src.slice(src.indexOf('async function abrirRetencion'), src.indexOf('const ESTADOS_VIGENTES'))
  assert.match(ret, /and p\.baja_verificada_at is null/)
  const det = src.slice(src.indexOf('export async function detectarYGuardar'))
  const explica = det.indexOf('explicarBajasVerificadas(tx, correduriaId)')
  assert.ok(explica !== -1, 'el detector llama a explicarBajasVerificadas')
  assert.ok(explica < det.indexOf('for (const e of insertados)'), 'antes de decidir retenciones')
  assert.match(src, /revisado_por = 'sistema:baja_verificada'/)
})

test('la ficha solo ofrece «El cliente se va» en un recibo devuelto de una póliza en vigor sin baja', () => {
  const page = leer('apps/plataforma/app/(usuario)/correduria/poliza/[id]/page.tsx')
  assert.match(page, /const puedeBaja = p\.viva && esEstadoVigente\(p\.estado\) && p\.bajaVerificada === null/)
  // Si CIMA la sigue dando en vigor tras la baja, la cabecera lo dice.
  assert.match(page, /CIMA la sigue dando en vigor/)
  assert.match(page, /\{x\.situacion === 'devuelto' && puedeBaja && <ClienteSeVa reciboId=\{x\.id\} \/>\}/)
})

test('la cabecera pinta matrícula (auto/moto) o dirección (hogar/comunidades) del riesgo principal', () => {
  const page = leer('apps/plataforma/app/(usuario)/correduria/poliza/[id]/page.tsx')
  // 1. Extrae el primer riesgo de p.contrato?.riesgos
  assert.match(page, /const riesgoPrincipal = p\.contrato\?\.riesgos\?\.\[0\]/)
  // 2. Decide por ramo: auto/moto → matrícula; hogar/comunidades → dirección
  assert.match(page, /\['auto', 'moto'\]\.includes\(String\(p\.tipo\)\.toLowerCase\(\)\)/)
  assert.match(page, /admiteDireccionRiesgo\(p\.tipo\)/)
  // 3. Pinta el Dato en la grilla de cabecera
  assert.match(page, /\{datoRiesgo && <Dato label=\{datoRiesgo\.label\} valor=\{datoRiesgo\.valor\} nota=\{datoRiesgo\.nota\} \/\>\}/)
})

test('la tarea del impago no se cuelga de una póliza ya dada de baja (mismo candado)', () => {
  const src = leer('apps/asegura/lib/devoluciones-recibo.ts')
  const tarea = src.slice(src.indexOf('async function asegurarTareaDevolucion'), src.indexOf('async function anotarHito'))
  assert.match(tarea, /and baja_verificada_at is null\) as ok/)
  const baja = src.slice(src.indexOf('export async function darDeBajaPorDevolucion'))
  assert.match(baja, /pg_advisory_xact_lock\(hashtext\(\$\{`devolucion:\$\{r\.polizaId\}`\}\)\)/)
})
