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

// BD falsa: el SELECT devuelve `filas`; el DELETE ... RETURNING devuelve `borrados`; las demás sentencias se anotan.
function mkDb(filas: unknown[], borrados: string[], sqls: string[], vals: unknown[][] = []) {
  return {
    $queryRaw: async (s: TemplateStringsArray, ...v: unknown[]) => {
      const q = s.join('?'); sqls.push(q); vals.push(v)
      if (/delete from seguros\.documentos/.test(q)) {
        if (!/returning id/.test(q)) throw new Error('el DELETE debe devolver los ids borrados')
        return borrados.map((id) => ({ id }))
      }
      return filas
    },
    $executeRaw: async (s: TemplateStringsArray, ...v: unknown[]) => { sqls.push(s.join('?')); vals.push(v); return 1 },
  } as unknown as DbPurga
}

test('barrido: borra solo documentos de fallo, por tandas; sin candidatos no escribe', async () => {
  const sqls: string[] = []
  const vals: unknown[][] = []
  const fila = { id: 't1', estado: 'error_definitivo', terminado_at: new Date('2026-09-01T00:00:00Z'), evidencia_id: A, evidencia_nombre: 'fallo-abcdef12.png', html_id: B, capturas: [`documento:${A}`], ahora: AHORA }
  assert.equal(await purgarEvidenciaCaducada(mkDb([], [], sqls), 'c1'), 0)
  assert.equal(sqls.length, 1, 'sin candidatos solo lee')
  sqls.length = 0
  assert.equal(await purgarEvidenciaCaducada(mkDb([fila], [A, B], sqls, vals), 'c1'), 2, 'devuelve los borrados de verdad')
  assert.equal(sqls.length, 4) // 0 = lectura; 1 delete; 2 captura_ref; 3 html
  assert.match(sqls[0], /t\.estado = any\(\?::text\[\]\)/)
  assert.match(sqls[0], /limit \?::int/)
  assert.match(sqls[1], /delete from seguros\.documentos/)
  assert.match(sqls[1], /subido_por = 'agente'/)
  assert.match(sqls[1], /nombre_fichero ~/)
  assert.deepEqual([...(vals[1][0] as string[])].sort(), [A, B])
})

test('(a) las referencias solo se anulan si su documento YA NO existe (nunca las de un documento vivo)', async () => {
  const sqls: string[] = []
  const fila = { id: 't1', estado: 'ok', terminado_at: new Date('2026-09-01T00:00:00Z'), evidencia_id: C, evidencia_nombre: 'oferta.pdf', html_id: B, capturas: [`documento:${A}`], ahora: AHORA }
  await purgarEvidenciaCaducada(mkDb([fila], [], sqls), 'c1')
  const [, , pasos, html] = sqls
  for (const q of [pasos, html]) {
    assert.match(q, /not exists \(select 1 from seguros\.documentos/, 'condicionada a que el documento ya no exista')
    assert.doesNotMatch(q, /captura_ref is not null\s*$|html_documento_id' is not null\s*$/, 'sin anulación incondicional')
  }
  assert.match(pasos, /set captura_ref = null/)
  assert.match(html, /error - 'html_documento_id'/)
})

test('(b) la selección exige algo purgable (documento de fallo del agente y de la correduría) o una referencia colgando', async () => {
  const sqls: string[] = []
  await purgarEvidenciaCaducada(mkDb([], [], sqls), 'c1')
  const q = sqls[0].slice(sqls[0].indexOf('where t.correduria_id'))
  assert.match(q, /exists \(select 1 from seguros\.documentos x[\s\S]*x\.correduria_id = t\.correduria_id[\s\S]*x\.subido_por = 'agente'[\s\S]*x\.nombre_fichero ~ '\^fallo-/)
  assert.doesNotMatch(q, /like 'fallo-%'/)
  assert.doesNotMatch(q, /html_documento_id' is not null/)
  assert.doesNotMatch(q, /captura_ref is not null\)/)
})

test('si el borrado falla NO se anula ninguna referencia (el trabajo se vuelve a seleccionar)', async () => {
  const sqls: string[] = []
  const fila = { id: 't1', estado: 'error_definitivo', terminado_at: new Date('2026-09-01T00:00:00Z'), evidencia_id: A, evidencia_nombre: 'fallo-abcdef12.png', html_id: B, capturas: [], ahora: AHORA }
  const db = {
    $queryRaw: async (s: TemplateStringsArray) => {
      const q = s.join('?'); sqls.push(q)
      if (/delete from seguros\.documentos/.test(q)) throw new Error('fallo de borrado')
      return [fila]
    },
    $executeRaw: async (s: TemplateStringsArray) => { sqls.push(s.join('?')); return 1 },
  } as unknown as DbPurga
  await assert.rejects(purgarEvidenciaCaducada(db, 'c1'), /fallo de borrado/)
  assert.equal(sqls.length, 2)
  assert.ok(!sqls.some((q) => /set captura_ref = null|error - 'html_documento_id'/.test(q)))
})

test('cableado: el barrido llama a la purga de evidencia', () => {
  const src = readFileSync(join(import.meta.dirname, 'tarificador.ts'), 'utf8')
  const i = src.indexOf('export async function barrerTarificadorRpa')
  assert.match(src.slice(i), /purgarEvidenciaCaducada\(prisma, correduriaId\)/)
})
