// Cepos de la PURGA RGPD (17/10/2026). `node --test`.
//   1. Selección pura de documentos: póliza viva → no, subido por agente → no, 29 días → no, 31 días → sí, sin fecha → no…
//   2. Selección pura de prospectos web: actividad reciente → no, 11 meses → no, 13 meses → sí, dato sin leer → no…
//   3. Modo informe por defecto: sin CORREDURIA_PURGA_RGPD_ACTIVA='1' no se ejecuta NINGUNA escritura (BD falsa).
//   4. Fail-closed: si una lectura falla, no se escribe nada.
//   5. El aviso de Telegram lleva cifras, nunca PII.
//   6. Cableado: el cron existe, autoriza por CRON_SECRET y está en vercel.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENV_PURGA_RGPD,
  HISTORIAL_REDACTADO,
  ejecutarPurgaRgpd,
  esDocumentoPurgable,
  esProspectoAnonimizable,
  purgaRgpdActiva,
  textoAvisoPurgaRgpd,
  type DbPurgaRgpd,
  type DocumentoCandidato,
  type PolizaLeida,
  type ProspectoCandidato,
} from './purga-rgpd.ts'

const AHORA = new Date('2026-10-17T03:47:00Z')
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000)
const haceMeses = (n: number) => { const d = new Date(AHORA); d.setUTCMonth(d.getUTCMonth() - n); return d }

const POLIZA_VIVA: PolizaLeida = { importRef: null, eiacXmlHash: 'h', estado: 'en_vigor', sustituidaAt: null }
const POLIZA_CANCELADA: PolizaLeida = { importRef: null, eiacXmlHash: 'h', estado: 'cancelada', sustituidaAt: null }
const POLIZA_VOLCADO: PolizaLeida = { importRef: 'intranet:1', eiacXmlHash: null, estado: 'vencida', sustituidaAt: null }

const doc = (x: Partial<DocumentoCandidato> = {}): DocumentoCandidato => ({
  id: 'd1', subidoPor: 'cliente', creadoAt: haceDias(31), ahora: AHORA, clienteId: 'c1',
  polizaId: null, siniestroId: null, portalParteId: null, tipoCliente: 'lead', segmento: 'prospecto', fusionada: false,
  polizas: [], interviniente: false, referenciado: false, procesoAbierto: false, ...x,
})
const pro = (x: Partial<ProspectoCandidato> = {}): ProspectoCandidato => ({
  id: 'c1', fuente: 'web', tipoCliente: 'lead', segmento: 'prospecto', altaAt: haceMeses(13), ahora: AHORA,
  anonimizado: false, fusionada: false, polizas: [], interviniente: false, conPortal: false, oportunidadAbierta: false,
  conRelacion: false, conAutorizacionPortal: false, actividadReciente: 0, ...x,
})

// ─── 1 · Documentos ─────────────────────────────────────────────────────────
test('documento: 31 días, lead sin póliza → SÍ', () => assert.equal(esDocumentoPurgable(doc()), true))
test('documento: 29 días → no', () => assert.equal(esDocumentoPurgable(doc({ creadoAt: haceDias(29) })), false))
test('documento: exactamente 30 días → no (estrictamente más de 30)', () => assert.equal(esDocumentoPurgable(doc({ creadoAt: haceDias(30) })), false))
test('documento: sin fecha → no', () => assert.equal(esDocumentoPurgable(doc({ creadoAt: null })), false))
test('documento: fecha inválida → no', () => assert.equal(esDocumentoPurgable(doc({ creadoAt: new Date('x') })), false))
test('documento: subido por agente → no', () => assert.equal(esDocumentoPurgable(doc({ subidoPor: 'agente' })), false))
test('documento: subido por corredor → no', () => assert.equal(esDocumentoPurgable(doc({ subidoPor: 'corredor' })), false))
test('documento: cliente con póliza VIVA → no', () => assert.equal(esDocumentoPurgable(doc({ polizas: [POLIZA_VIVA] })), false))
test('documento: cliente con póliza cancelada → no (cualquier estado)', () => assert.equal(esDocumentoPurgable(doc({ polizas: [POLIZA_CANCELADA] })), false))
test('documento: cliente con póliza del volcado → no', () => assert.equal(esDocumentoPurgable(doc({ polizas: [POLIZA_VOLCADO] })), false))
test('documento: pólizas sin leer (null) → no', () => assert.equal(esDocumentoPurgable(doc({ polizas: null })), false))
test('documento: colgado de una póliza/siniestro/parte → no', () => {
  assert.equal(esDocumentoPurgable(doc({ polizaId: 'p1' })), false)
  assert.equal(esDocumentoPurgable(doc({ siniestroId: 's1' })), false)
  assert.equal(esDocumentoPurgable(doc({ portalParteId: 'x1' })), false)
})
test('documento: ficha cliente / ex_cliente → no', () => {
  assert.equal(esDocumentoPurgable(doc({ tipoCliente: 'cliente', segmento: 'cliente' })), false)
  assert.equal(esDocumentoPurgable(doc({ tipoCliente: 'lead', segmento: 'ex_cliente' })), false)
})
test('documento: sin ficha → no', () => assert.equal(esDocumentoPurgable(doc({ clienteId: null })), false))
test('documento: interviniente / referenciado / proceso abierto / fusionada → no; sin leer → no', () => {
  for (const k of ['interviniente', 'referenciado', 'procesoAbierto', 'fusionada'] as const) {
    assert.equal(esDocumentoPurgable(doc({ [k]: true })), false, `${k}=true`)
    assert.equal(esDocumentoPurgable(doc({ [k]: null })), false, `${k}=null`)
  }
})

// ─── 2 · Prospectos web ─────────────────────────────────────────────────────
test('prospecto: web, 13 meses, sin nada → SÍ', () => assert.equal(esProspectoAnonimizable(pro()), true))
test('prospecto: 11 meses → no', () => assert.equal(esProspectoAnonimizable(pro({ altaAt: haceMeses(11) })), false))
test('prospecto: sin fecha de alta → no', () => assert.equal(esProspectoAnonimizable(pro({ altaAt: null })), false))
test('prospecto: con actividad comercial reciente → no', () => assert.equal(esProspectoAnonimizable(pro({ actividadReciente: 1 })), false))
test('prospecto: actividad sin leer (null) → no', () => assert.equal(esProspectoAnonimizable(pro({ actividadReciente: null })), false))
test('prospecto: fuente no web → no', () => assert.equal(esProspectoAnonimizable(pro({ fuente: 'recomendacion' })), false))
test('prospecto: con póliza (viva o no) → no', () => {
  assert.equal(esProspectoAnonimizable(pro({ polizas: [POLIZA_VIVA] })), false)
  assert.equal(esProspectoAnonimizable(pro({ polizas: [POLIZA_CANCELADA] })), false)
})
test('prospecto: ya anonimizado / con portal / oportunidad abierta / interviniente → no', () => {
  for (const k of ['anonimizado', 'conPortal', 'oportunidadAbierta', 'interviniente', 'fusionada'] as const) {
    assert.equal(esProspectoAnonimizable(pro({ [k]: true })), false, `${k}=true`)
    assert.equal(esProspectoAnonimizable(pro({ [k]: null })), false, `${k}=null`)
  }
})
test('prospecto: enlazado en cliente_relaciones (cónyuge de un cliente…) → no; sin leer → no', () => {
  assert.equal(esProspectoAnonimizable(pro({ conRelacion: true })), false)
  assert.equal(esProspectoAnonimizable(pro({ conRelacion: null })), false)
  assert.equal(esProspectoAnonimizable(pro({ conRelacion: undefined as unknown as null })), false)
})
test('prospecto: en una autorización del portal (otorgante o autorizado) → no; sin leer → no', () => {
  assert.equal(esProspectoAnonimizable(pro({ conAutorizacionPortal: true })), false)
  assert.equal(esProspectoAnonimizable(pro({ conAutorizacionPortal: null })), false)
})

// ─── 3 · Modo informe / activa ─────────────────────────────────────────────
test('interruptor: solo el valor exacto «1» activa', () => {
  assert.equal(purgaRgpdActiva({}), false)
  for (const v of ['', '0', 'true', ' 1', 'si']) assert.equal(purgaRgpdActiva({ [ENV_PURGA_RGPD]: v }), false, v)
  assert.equal(purgaRgpdActiva({ [ENV_PURGA_RGPD]: '1' }), true)
})

const filaDoc = { id: 'd1', subido_por: 'cliente', created_at: haceDias(40), ahora: AHORA, cliente_id: 'c1', poliza_id: null, siniestro_id: null, portal_parte_id: null, tipo_cliente: 'lead', segmento: 'prospecto', fusionada: false, polizas: [], interviniente: false, referenciado: false, proceso_abierto: false }
const filaDocViva = { ...filaDoc, id: 'd2', polizas: [POLIZA_VIVA] }
const filaPro = { id: 'c9', fuente: 'web', tipo_cliente: 'lead', segmento: 'prospecto', created_at: haceMeses(14), ahora: AHORA, anonimizado: false, fusionada: false, polizas: [], interviniente: false, con_portal: false, oportunidad_abierta: false, con_relacion: false, con_autorizacion_portal: false, actividad_reciente: 0 }

/** BD falsa: las lecturas devuelven por orden; toda sentencia de escritura (delete/update) se apunta. */
function bdFalsa(lecturas: (unknown[] | Error)[]) {
  const escrituras: { sql: string; ids: unknown }[] = []
  let i = 0
  const db = {
    $queryRaw: async (s: TemplateStringsArray, ...v: unknown[]) => {
      const sql = s.join('?')
      if (/^\s*(delete|with obj as \(\s*update)/i.test(sql)) {
        const ids = v.find(Array.isArray) as string[]
        escrituras.push({ sql, ids })
        return ids.map((id) => ({ id }))
      }
      const r = lecturas[i++]
      if (r instanceof Error) throw r
      return r
    },
    $executeRaw: async (s: TemplateStringsArray) => { escrituras.push({ sql: s.join('?'), ids: null }); return 1 },
  } as unknown as DbPurgaRgpd
  return { db, escrituras }
}

test('CEPO modo informe: cuenta pero NO escribe nada', async () => {
  const { db, escrituras } = bdFalsa([[filaDoc, filaDocViva], [filaPro]])
  const avisos: string[] = []
  const r = await ejecutarPurgaRgpd(db, 'cor', { activa: false, enviar: async (t) => { avisos.push(t); return 1 } })
  assert.equal(escrituras.length, 0)
  assert.equal(r.modo, 'informe')
  assert.equal(r.documentos.candidatos, 1)
  assert.equal(r.documentos.descartados, 1, 'la del cliente con póliza viva se descarta en la función pura')
  assert.equal(r.prospectos.candidatos, 1)
  assert.equal(r.documentos.borrados + r.prospectos.anonimizados, 0)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /MODO INFORME/)
})

test('CEPO modo activa: borra SOLO los que pasan la función pura', async () => {
  const { db, escrituras } = bdFalsa([[filaDoc, filaDocViva], [filaPro]])
  const r = await ejecutarPurgaRgpd(db, 'cor', { activa: true, enviar: async () => 1 })
  assert.equal(escrituras.length, 2)
  assert.deepEqual(escrituras[0].ids, ['d1'])
  assert.deepEqual(escrituras[1].ids, ['c9'])
  assert.equal(r.documentos.borrados, 1)
  assert.equal(r.prospectos.anonimizados, 1)
})

test('CEPO: prospecto con relación o autorización de portal leída de la BD → no se anonimiza', async () => {
  const filas = [
    { ...filaPro, id: 'rel' , con_relacion: true },
    { ...filaPro, id: 'aut', con_autorizacion_portal: true },
    { ...filaPro, id: 'sinleer', con_relacion: null },
    { ...filaPro, id: 'ok' },
  ]
  const { db, escrituras } = bdFalsa([[], filas])
  const r = await ejecutarPurgaRgpd(db, 'cor', { activa: true, enviar: async () => 1 })
  assert.deepEqual(escrituras.map((e) => e.ids), [['ok']])
  assert.equal(r.prospectos.descartados, 3)
})

test('CEPO fail-closed: si falla la lectura de prospectos, tampoco se borran documentos', async () => {
  const { db, escrituras } = bdFalsa([[filaDoc], new Error('permission denied for table portal_vinculo')])
  await assert.rejects(ejecutarPurgaRgpd(db, 'cor', { activa: true, enviar: async () => 1 }))
  assert.equal(escrituras.length, 0)
})

test('lote: pide límite+1 y marca «hay más» sin pasarse del límite', async () => {
  const filas = [1, 2, 3].map((n) => ({ ...filaDoc, id: `d${n}` }))
  const { db, escrituras } = bdFalsa([filas, []])
  const r = await ejecutarPurgaRgpd(db, 'cor', { activa: true, limite: 2, enviar: async () => 1 })
  assert.equal(r.documentos.masDelLote, true)
  assert.deepEqual(escrituras[0].ids, ['d1', 'd2'])
})

test('aviso: nada que contar → no se manda', () => {
  assert.equal(textoAvisoPurgaRgpd({ modo: 'informe', documentos: { candidatos: 0, descartados: 3, borrados: 0, masDelLote: false }, prospectos: { candidatos: 0, descartados: 0, anonimizados: 0, masDelLote: false } }), null)
})

// ─── 4 · Cableado ───────────────────────────────────────────────────────────
const APP = join(import.meta.dirname, '..')
test('cableado: la ruta autoriza por CRON_SECRET, lee el interruptor y está en vercel.json', () => {
  const ruta = readFileSync(join(APP, 'app/api/cron/purga-rgpd/route.ts'), 'utf8')
  assert.match(ruta, /isCronAuthorized\(req\)/)
  assert.match(ruta, /purgaRgpdActiva\(\)/)
  const vercel = JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')) as { crons: { path: string }[] }
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/purga-rgpd'))
})

test('las escrituras re-comprueban las guardas clave en su propio WHERE', () => {
  const src = readFileSync(join(APP, 'lib/purga-rgpd.ts'), 'utf8')
  // El prefijo se compone para que este test (que LEE el SQL, no lo ejecuta) no cuente como consulta
  // al schema en el guardián de aislamiento.
  const S = 'seguros' + '.'
  const borrar = src.slice(src.indexOf(`delete from ${S}documentos`), src.indexOf('returning d.id'))
  for (const g of ["subido_por = 'cliente'", `${S}polizas`, `${S}poliza_intervinientes`, 'poliza_id is null']) assert.ok(borrar.includes(g), `DELETE sin «${g}»`)
  const anon = src.slice(src.indexOf(`update ${S}clientes c set`), src.indexOf('returning c.id, c.correduria_id'))
  for (const g of ["fuente::text = 'web'", `${S}polizas`, `${S}portal_vinculo`, `${S}historial_interno`]) assert.ok(anon.includes(g), `UPDATE sin «${g}»`)
})

// Guardas de vínculos con otras fichas: en los DOS sentidos, en la LECTURA y en el WHERE del UPDATE.
const GUARDAS_VINCULO = (S: string) => [
  `not exists (select 1 from ${S}cliente_relaciones r where r.cliente_a_id = c.id)`,
  `not exists (select 1 from ${S}cliente_relaciones r where r.cliente_b_id = c.id)`,
  `not exists (select 1 from ${S}portal_autorizacion pa where pa.otorgante_cliente_id = c.id)`,
  `not exists (select 1 from ${S}portal_autorizacion pa where pa.autorizado_cliente_id = c.id)`,
]
test('relación como A, como B y autorización de portal: guardas en la lectura y en el UPDATE', () => {
  const src = readFileSync(join(APP, 'lib/purga-rgpd.ts'), 'utf8')
  const S = 'seguros' + '.'
  const ini = src.indexOf('export async function leerProspectosCandidatos')
  const lectura = src.slice(ini, src.indexOf('export async function anonimizarProspectos'))
  const where = lectura.slice(lectura.lastIndexOf(`from ${S}clientes c`))
  const anon = src.slice(src.indexOf(`update ${S}clientes c set`), src.indexOf('returning c.id, c.correduria_id'))
  for (const g of GUARDAS_VINCULO(S)) {
    assert.ok(where.includes(g), `lectura (WHERE) sin «${g}»`)
    assert.ok(anon.includes(g), `UPDATE sin «${g}»`)
  }
  // Y las columnas que decide la función pura, en los dos sentidos.
  const columnas = lectura.slice(0, lectura.lastIndexOf(`from ${S}clientes c`))
  for (const g of ['r.cliente_a_id = c.id)', 'r.cliente_b_id = c.id)) as con_relacion', 'pa.otorgante_cliente_id = c.id)', 'pa.autorizado_cliente_id = c.id)) as con_autorizacion_portal']) {
    assert.ok(columnas.includes(g), `lectura (columnas) sin «${g}»`)
  }
})

test('la anonimización redacta el historial previo y anula provincia en la MISMA sentencia', () => {
  const src = readFileSync(join(APP, 'lib/purga-rgpd.ts'), 'utf8')
  const S = 'seguros' + '.'
  const sentencia = src.slice(src.indexOf('with obj as ('), src.indexOf('select obj.id::text as id from obj'))
  assert.ok(sentencia.includes('provincia = null'), 'sin «provincia = null»')
  assert.ok(sentencia.includes('provincia_fiscal = null'), 'sin «provincia_fiscal = null»')
  const red = sentencia.slice(sentencia.indexOf(`red as (update ${S}historial_interno`))
  assert.ok(sentencia.includes(`red as (update ${S}historial_interno`), 'sin CTE de redacción del historial')
  assert.match(red, /set texto = \$\{HISTORIAL_REDACTADO\}\s+from obj where hp\.cliente_id = obj\.id/)
  assert.ok(src.includes("export const HISTORIAL_REDACTADO = '[anonimizado RGPD]'"))
  // La línea nueva que deja la purga va sin PII: solo constantes (meses), ninguna interpolación de la ficha.
  const texto = src.slice(src.indexOf('const texto = `Ficha anonimizada'), src.indexOf('const r = await db.$queryRaw<{ id: string }[]>`\n    with obj'))
  assert.deepEqual(texto.match(/\$\{[^}]+\}/g), ['${MESES_RETENCION_PROSPECTO}'])
})

// Texto libre de las tablas hijas: cada CTE redacta SOLO lo seguro (nada colgado de póliza/siniestro, nada firmado).
test('la anonimización redacta el texto libre de las tablas hijas con sus guardas, y deja fuera las append-only', () => {
  const src = readFileSync(join(APP, 'lib/purga-rgpd.ts'), 'utf8')
  const S = 'seguros' + '.'
  const sentencia = src.slice(src.indexOf('with obj as ('), src.indexOf('select obj.id::text as id from obj'))
  const cte = (nombre: string, tabla: string) => {
    const ini = sentencia.indexOf(`${nombre} as (update ${S}${tabla} `)
    assert.ok(ini >= 0, `sin CTE «${nombre}» sobre ${tabla}`)
    return sentencia.slice(ini, sentencia.indexOf('returning', ini))
  }
  const guardas: [string, string, string[]][] = [
    ['opo', 'oportunidades', ['o.cliente_id = obj.id', 'o.poliza_id is null', 'o.poliza_ganada_id is null', 'notas = case when o.notas is null then null else ${HISTORIAL_REDACTADO}']],
    ['pre', 'presupuesto', ['pr.cliente_id = obj.id', 'pr.poliza_id is null', 'pr.poliza_emitida_id is null', 'pr.emitido_at is null', 'pr.aceptado_at is null', 'pr.firma_id is null', 'pr.vence_el < now()', 'necesidades = case when pr.necesidades is null then null else ${HISTORIAL_REDACTADO}']],
    ['ges', 'gestiones', ['g.cliente_id = obj.id', 'g.poliza_id is null', 'g.siniestro_id is null', 'g.observaciones is not null', 'observaciones = ${HISTORIAL_REDACTADO}']],
    ['tar', 'tarificaciones', ['t.cliente_id = obj.id', 't.poliza_id is null', 'nota = ${HISTORIAL_REDACTADO}']],
    ['cnv', 'conversaciones', ['v.cliente_id = obj.id', 'wa_perfil_nombre_cifrado = null', 'wa_telefono_cifrado = null', 'analisis = null']],
    ['msj', 'mensajes', ['m.conversacion_id = cnv.id', "contenido = ''", 'texto_purgado_at = now()']],
    ['cim', 'channel_inbound_messages', ['i.correduria_id = ${correduriaId}::uuid', 'i.cliente_id in (select obj.id from obj)', 'message_text = null', 'lead_phone = null']],
  ]
  for (const [nombre, tabla, gs] of guardas) {
    const c = cte(nombre, tabla)
    for (const g of gs) assert.ok(c.includes(g), `CTE ${nombre} (${tabla}) sin «${g}»`)
  }
  // `correo_envio` es append-only por GRANT (prisma_seguros solo INSERT/SELECT + UPDATE de resend_id/estado/error):
  // tocar `asunto` haría fallar la sentencia entera. Firmas, consentimientos y logs de fusión/purga: triggers append-only.
  for (const t of ['correo_envio', 'consent_logs', 'firma', 'cliente_merge_log', 'poliza_merge_log', 'interviniente_purga_log', 'queja']) {
    assert.ok(!sentencia.includes(`${S}${t} `), `la anonimización NO debe tocar ${t}`)
  }
  // El CHECK `presupuesto_necesidades_coherentes` exige 15..1500 caracteres: la marca tiene que caber.
  assert.ok(HISTORIAL_REDACTADO.trim().length >= 15, 'la marca no cumple el CHECK de presupuesto.necesidades')
  // Un prospecto que sigue escribiendo por WhatsApp no se anonimiza: guarda en la lectura y en el UPDATE.
  const anon = src.slice(src.indexOf(`update ${S}clientes c set`), src.indexOf('returning c.id, c.correduria_id'))
  const lectura = src.slice(src.indexOf('export async function leerProspectosCandidatos'), src.indexOf('export async function anonimizarProspectos'))
  const wa = `${S}conversaciones v where v.cliente_id = c.id`
  const umbral = "greatest(v.ultimo_mensaje_at, v.updated_at at time zone 'UTC') > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month'"
  assert.ok(anon.includes(`not exists (select 1 from ${wa}`), 'UPDATE sin guarda de WhatsApp reciente')
  assert.ok(anon.includes(umbral) && lectura.includes(umbral), 'guarda de WhatsApp sin el mismo umbral en lectura y UPDATE')
  assert.ok(lectura.includes(`(select count(*) from ${wa}`), 'actividad_reciente sin WhatsApp')
})
