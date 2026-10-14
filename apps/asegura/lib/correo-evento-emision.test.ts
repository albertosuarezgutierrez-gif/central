import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MOTIVO_EMISION_NO_LLEGADA, decidirReevaluacionEmision, TIPOS_EVENTO_CORREO, esCheckTipoEventoCorreo, importeDeItem, planItem, resolverPolizaEvento, validarEntradaEvento,
  type ContextoItem, type ItemEvento, type PolizaCandidata,
} from './correo-evento.ts'

// Emisión (póliza nueva) leída de Allianz «Rel. Emisión Producción» (14/10/2026). CIMA es la fuente: el correo
// nunca crea una póliza ni escribe en la ficha; solo dice si CIMA ya la trae.

const HOY = '2026-10-14'
const ALLIANZ = (p: Partial<PolizaCandidata> = {}): PolizaCandidata => ({
  id: 'p1', clienteId: 'c1', numeroPoliza: '061000001', codigoDgs: 'C0109', aseguradora: 'Allianz', importRef: null,
  eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null, ...p,
})
const ITEM: Extract<ItemEvento, { tipo: 'emision' }> = {
  tipo: 'emision', clave: '061000001', numeroPoliza: '061000001', idRecibo: '900000001', producto: 'Allianz Moto V.03',
  fechaEfecto: '2026-09-29', prima: 113.3,
}
function ctx(resolucion: ContextoItem['resolucion']): ContextoItem {
  return { resolucion, siniestro: null, expediente: null, tareaAbierta: false, fechaCorreo: '2026-10-07', hoy: HOY }
}
const plan = (candidatas: PolizaCandidata[]) =>
  planItem(ITEM, 'allianz', ctx(resolverPolizaEvento(ITEM.numeroPoliza, 'allianz', 'C0109', candidatas)))

test('emisión de una póliza que CIMA YA trae en vigor → duplicado_cima, sin nota ni tarea', () => {
  const p = plan([ALLIANZ()])
  assert.equal(p.estado, 'duplicado_cima')
  assert.equal(p.nota, null)
  assert.equal(p.tarea, null)
  assert.equal(p.abrirSiniestro, null)
  assert.match(p.resumen, /ya en CIMA/)
})

test('emisión de una póliza que CIMA aún NO trae → sin_resolver «póliza nueva aún no llegada por CIMA», sin escribir', () => {
  for (const candidatas of [[], [ALLIANZ({ codigoDgs: 'C0468', aseguradora: 'Occident' })], [ALLIANZ({ importRef: 'volcado', eiacXmlHash: null })]]) {
    const p = plan(candidatas)
    assert.equal(p.estado, 'sin_resolver')
    assert.equal(p.motivo, MOTIVO_EMISION_NO_LLEGADA)
    assert.equal(p.nota, null)
    assert.equal(p.tarea, null)
    assert.equal(p.claveTarea, null)
  }
})

test('emisión con el nº en CIMA pero NO en vigor, o en dos pólizas → sin_resolver (se mira), nunca duplicado', () => {
  const noVigor = plan([ALLIANZ({ estado: 'anulada' })])
  assert.equal(noVigor.estado, 'sin_resolver')
  assert.notEqual(noVigor.motivo, MOTIVO_EMISION_NO_LLEGADA)
  assert.equal(noVigor.nota, null)
  const ambigua = plan([ALLIANZ(), ALLIANZ({ id: 'p2', clienteId: 'c2' })])
  assert.equal(ambigua.estado, 'sin_resolver')
  assert.equal(ambigua.tarea, null)
})

test('validarEntradaEvento: emisión con sus pólizas; texto libre saneado; recibo raro se cuenta', () => {
  const v = validarEntradaEvento({
    mensajeId: '<e@allianz>',
    evento: {
      tipo: 'emision', compania: 'allianz', codigoDgs: 'C0109', ilegibles: 0,
      polizas: [
        { numeroPoliza: '061000001', idRecibo: '900000001', producto: 'Moto ES00 0000 0000 0000 0000 0000', fechaEfecto: '2026-09-29', prima: 113.3 },
        { numeroPoliza: '061000002', idRecibo: '¿?', producto: null, fechaEfecto: null, prima: null },
        { numeroPoliza: '061000001', idRecibo: '900000001', producto: null, fechaEfecto: null, prima: null },
      ],
    },
  })
  assert.ok(v.ok)
  assert.equal(v.entrada.tipo, 'emision')
  assert.equal(v.entrada.items.length, 1)
  assert.equal(v.entrada.ilegibles, 1)
  const i = v.entrada.items[0]
  assert.ok(i.tipo === 'emision')
  assert.equal(i.clave, '061000001')
  assert.doesNotMatch(i.producto ?? '', /0000 0000/)
  assert.equal(importeDeItem(i), 113.3)
  assert.equal(validarEntradaEvento({ mensajeId: '<e@a>', evento: { tipo: 'emision', compania: 'allianz', codigoDgs: 'C0109' } }).ok, false)
})

test('esCheckTipoEventoCorreo: el CHECK de tipo (falta el SQL) se reconoce; otro error no', () => {
  const choque = Object.assign(new Error('Raw query failed. Code: `23514`. Message: `new row for relation "correo_evento_entrante" violates check constraint "correo_evento_entrante_tipo_check"`'), {
    meta: { code: '23514', message: 'new row for relation "correo_evento_entrante" violates check constraint "correo_evento_entrante_tipo_check"' },
  })
  assert.equal(esCheckTipoEventoCorreo(choque), true)
  const otroCheck = Object.assign(new Error('x'), { meta: { code: '23514', message: 'violates check constraint "correo_evento_entrante_clave_check"' } })
  assert.equal(esCheckTipoEventoCorreo(otroCheck), false)
  assert.equal(esCheckTipoEventoCorreo(new Error('connection reset')), false)
})

test('la BD trata el CHECK de tipo como sin_migracion (503) y no escribe tarea/clave para la emisión', () => {
  const src = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  assert.match(src, /resultados\.length === 0 && esCheckTipoEventoCorreo\(e\)[\s\S]{0,200}estado: 'sin_migracion'/)
  assert.match(src, /item\.tipo !== 'emision' \? claveTareaDe/)
})

test('la migración de emisión existe, es aditiva y su lista de tipos = TIPOS_EVENTO_CORREO', () => {
  const sql = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '2026-10-14d_correo_evento_emision.sql'), 'utf8')
  const sinComentarios = sql.replace(/--.*$/gm, '')
  assert.doesNotMatch(sinComentarios, /\b(drop\s+table|delete\s+from|truncate|update\s)/i)
  const lista = /CHECK\s*\(\s*tipo\s+IN\s*\(([^)]*)\)\s*\)/i.exec(sinComentarios)?.[1]
  assert.ok(lista, 'la migración no redefine el CHECK de tipo')
  const tipos = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(tipos, [...TIPOS_EVENTO_CORREO].sort())
})

// Reevaluación (14/10/2026): una emisión sin_resolver pasa a duplicado_cima cuando CIMA ya trae la póliza.
const reeval = (candidatas: PolizaCandidata[]) =>
  decidirReevaluacionEmision(ITEM, 'allianz', resolverPolizaEvento(ITEM.numeroPoliza, 'allianz', 'C0109', candidatas), HOY)

test('reevaluación: única póliza en vigor → resuelve, con póliza, cliente y resumen con fecha', () => {
  const d = reeval([ALLIANZ()])
  assert.deepEqual(d, { resuelve: true, polizaId: 'p1', clienteId: 'c1', motivo: null, resumen: 'CIMA ya la trae (14/10/2026)' })
})

test('reevaluación: no encontrada, dos pólizas o no en vigor → se queda', () => {
  assert.equal(reeval([]).resuelve, false)
  assert.equal(reeval([ALLIANZ(), ALLIANZ({ id: 'p2', clienteId: 'c2' })]).resuelve, false)
  assert.equal(reeval([ALLIANZ({ estado: 'anulada' })]).resuelve, false)
})

test('reevaluación: solo emisiones', () => {
  const otro = { tipo: 'impago', clave: 'x', numeroPoliza: '061000001' } as unknown as ItemEvento
  assert.equal(decidirReevaluacionEmision(otro, 'allianz', { estado: 'en_vigor', poliza: ALLIANZ() }, HOY).resuelve, false)
})

test('reevaluación: el UPDATE lleva la guarda estado = sin_resolver y el puerto no crea nada', () => {
  const bd = readFileSync(join(import.meta.dirname, 'correo-evento-bd.ts'), 'utf8')
  const fn = bd.slice(bd.indexOf('export async function reevaluarEmisionesSinResolver'))
  assert.match(fn, /where id = \$\{f\.id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = 'sin_resolver' and revisado_at is null/)
  assert.doesNotMatch(fn, /insert into|crearTarea|anotar\(/)
})
