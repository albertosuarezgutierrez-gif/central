// Cepos de la purga de EVIDENCIA de fallo (capturas/HTML con datos personales). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIAS_RETENCION_EVIDENCIA, ESTADOS_PURGA_EVIDENCIA, evidenciaCaducada, idDeCapturaRef, idsEvidenciaAPurgar, type TrabajoEvidencia } from './tarificador-purga-evidencia-reglas.ts'
import { purgarEvidenciaCaducada, type DbPurga } from './tarificador-purga.ts'

const AHORA = new Date('2026-10-15T12:00:00Z')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const base: TrabajoEvidencia = { estado: 'error_definitivo', terminadoAt: '2026-09-20T00:00:00Z', evidenciaId: A, evidenciaNombre: 'fallo-abcdef12.png', htmlId: B, capturasRef: [`documento:${A}`, null] }

test('retención 15 días y solo estados terminados', () => {
  assert.equal(DIAS_RETENCION_EVIDENCIA, 15)
  assert.deepEqual([...ESTADOS_PURGA_EVIDENCIA].sort(), ['cancelado', 'error_definitivo', 'ok'])
  assert.ok(evidenciaCaducada(base, AHORA))
  assert.ok(!evidenciaCaducada({ ...base, terminadoAt: '2026-10-01T00:00:00Z' }, AHORA), '14 días: aún no')
  assert.ok(evidenciaCaducada({ ...base, terminadoAt: '2026-09-30T11:00:00Z' }, AHORA), '15 días y 1 h: sí')
  for (const estado of ['requiere_humano', 'atascado', 'pendiente', 'en_curso', 'error_reintentable', 'emitido']) assert.ok(!evidenciaCaducada({ ...base, estado }, AHORA), estado)
  assert.ok(!evidenciaCaducada({ ...base, terminadoAt: null }, AHORA))
})

test('ids a borrar: captura, html y capturas de pasos, sin duplicados; el PDF de una oferta nunca', () => {
  assert.deepEqual(idsEvidenciaAPurgar(base, AHORA).sort(), [A, B])
  assert.deepEqual(idsEvidenciaAPurgar({ ...base, estado: 'ok', evidenciaId: C, evidenciaNombre: 'oferta.pdf', htmlId: null, capturasRef: [`documento:${A}`] }, AHORA), [A])
  assert.deepEqual(idsEvidenciaAPurgar({ ...base, estado: 'requiere_humano' }, AHORA), [])
  assert.deepEqual(idsEvidenciaAPurgar({ ...base, evidenciaId: 'no-uuid', htmlId: null, capturasRef: ['documento:xx', 'otra:' + A] }, AHORA), [])
  assert.equal(idDeCapturaRef(`documento:${C}`), C)
  assert.equal(idDeCapturaRef(C), null)
})

test('barrido: anula referencias y borra solo documentos de fallo, por tandas; sin candidatos no escribe', async () => {
  const sqls: string[] = []
  const vals: unknown[][] = []
  const fila = { id: 't1', estado: 'error_definitivo', terminado_at: new Date('2026-09-01T00:00:00Z'), evidencia_id: A, evidencia_nombre: 'fallo-abcdef12.png', html_id: B, capturas: [`documento:${A}`], ahora: AHORA }
  const mk = (filas: unknown[]) => ({
    $queryRaw: async (s: TemplateStringsArray, ...v: unknown[]) => { sqls.push(s.join('?')); vals.push(v); return filas },
    $executeRaw: async (s: TemplateStringsArray, ...v: unknown[]) => { sqls.push(s.join('?')); vals.push(v); return 2 },
  }) as unknown as DbPurga
  assert.equal(await purgarEvidenciaCaducada(mk([]), 'c1'), 0)
  assert.equal(sqls.length, 1, 'sin candidatos solo lee')
  sqls.length = 0; vals.length = 0
  assert.equal(await purgarEvidenciaCaducada(mk([fila]), 'c1'), 2)
  assert.equal(sqls.length, 4) // 0 = lectura; 1 captura_ref; 2 html; 3 delete
  assert.match(sqls[0], /t\.estado = any\(\?::text\[\]\)/)
  assert.match(sqls[0], /limit \?::int/)
  assert.match(sqls[1], /set captura_ref = null/)
  assert.match(sqls[2], /error - 'html_documento_id'/)
  assert.match(sqls[3], /delete from seguros\.documentos/)
  assert.match(sqls[3], /subido_por = 'agente'/)
  assert.match(sqls[3], /nombre_fichero ~/)
  assert.deepEqual([...(vals[3][0] as string[])].sort(), [A, B])
})

test('cableado: el barrido llama a la purga de evidencia', () => {
  const src = readFileSync(join(import.meta.dirname, 'tarificador.ts'), 'utf8')
  const i = src.indexOf('export async function barrerTarificadorRpa')
  assert.match(src.slice(i), /purgarEvidenciaCaducada\(prisma, correduriaId\)/)
})
