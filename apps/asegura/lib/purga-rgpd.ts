// PURGA RGPD de lo que la política de privacidad promete borrar/anonimizar (17/10/2026):
//   1. Documentos subidos por quien NO llega a ser cliente → se BORRAN a los 30 días.
//   2. Prospectos WEB sin acuerdo → se ANONIMIZAN al año (la fila se queda, con la marca `NOMBRE_ANONIMIZADO`).
//
// 🚨 MODO INFORME POR DEFECTO: sin `CORREDURIA_PURGA_RGPD_ACTIVA=1` (exacto) solo se CUENTA lo que se haría.
// 🚨 FAIL-CLOSED: la decisión es PURA (`esDocumentoPurgable`, `esProspectoAnonimizable`); cualquier dato que no se
//    pudo leer (`null`/`undefined`) dice NO. Si una consulta falla, lanza: el cron no borra nada y responde 500.
// 🚨 Criterio CONSERVADOR: cualquier póliza (en cualquier estado, también del volcado histórico o de una ficha fusionada
//    en esta), figurar como interviniente en una póliza, un proceso comercial abierto o un documento referenciado por
//    otra tabla → NO se toca. Además se re-aplica `esCarteraEnVigor()` a las pólizas leídas.
// 🚨 La sentencia que escribe RE-COMPRUEBA las guardas clave en su propio WHERE (una póliza creada entre la lectura y
//    la escritura gana) y la anonimización es UNA sentencia (ficha + teléfonos + emails + carnés + historial): o todo o nada.
// Sin `import` de prisma en tiempo de ejecución (solo el TIPO): el cepo `purga-rgpd.test.ts` la prueba con una BD falsa.

import { esCarteraEnVigor } from '@central/module-seguros'
import type { prisma } from './tenant'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
export type DbPurgaRgpd = Pick<Tx, '$queryRaw' | '$executeRaw'>

export const DIAS_RETENCION_DOCUMENTOS = 30
export const MESES_RETENCION_PROSPECTO = 12
export const LOTE_PURGA_RGPD = 200
/** Marca de una ficha anonimizada (no hay columna propia): la selección la excluye, así que es idempotente. */
export const NOMBRE_ANONIMIZADO = 'Anonimizado (RGPD)'
export const ENV_PURGA_RGPD = 'CORREDURIA_PURGA_RGPD_ACTIVA'

/** Solo el valor EXACTO `'1'` activa el borrado. `'true'`, `' 1'`, vacío o ausente = modo informe. */
export function purgaRgpdActiva(env: Record<string, string | undefined> = process.env): boolean {
  return env[ENV_PURGA_RGPD] === '1'
}

/** Póliza tal como se lee para decidir (cualquier estado). */
export type PolizaLeida = { importRef: string | null; eiacXmlHash: string | null; estado: string | null; sustituidaAt: unknown }

function esFecha(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

/** Ninguna póliza leída, y desde luego ninguna en vigor. `null`/no-array = no se sabe → false. */
function sinPolizas(polizas: readonly PolizaLeida[] | null | undefined): boolean {
  if (!Array.isArray(polizas)) return false
  if (polizas.some((p) => esCarteraEnVigor(p))) return false
  return polizas.length === 0
}

/** La ficha es un lead/prospecto (nunca cliente ni ex-cliente). */
function esLeadOProspecto(tipo: string | null | undefined, segmento: string | null | undefined): boolean {
  if (segmento === 'cliente' || segmento === 'ex_cliente') return false
  return tipo === 'lead' || segmento === 'prospecto'
}

// ─── 1 · Documentos de no clientes ──────────────────────────────────────────

export type DocumentoCandidato = {
  id: string
  subidoPor: string | null
  creadoAt: Date | null
  ahora: Date | null
  clienteId: string | null
  /** Cuelga de una póliza, siniestro o parte: nunca es «de un no cliente». */
  polizaId: string | null
  siniestroId: string | null
  portalParteId: string | null
  tipoCliente: string | null
  segmento: string | null
  /** Lápida de fusión: los datos viven en la superviviente. */
  fusionada: boolean | null
  /** Pólizas de la ficha y de las fichas fusionadas en ella. */
  polizas: PolizaLeida[] | null
  /** Figura como interviniente en alguna póliza (conductor, asegurado…). */
  interviniente: boolean | null
  /** Alguna tabla lo referencia (anulación, oferta, tarificador…). */
  referenciado: boolean | null
  /** Oportunidad sin cerrar, o presupuesto/historial de los últimos 30 días: aún puede llegar a cliente. */
  procesoAbierto: boolean | null
}

export function esDocumentoPurgable(d: DocumentoCandidato, dias = DIAS_RETENCION_DOCUMENTOS): boolean {
  if (d.subidoPor !== 'cliente') return false
  if (!esFecha(d.creadoAt) || !esFecha(d.ahora)) return false
  if (d.ahora.getTime() - d.creadoAt.getTime() <= dias * 86_400_000) return false
  if (!d.clienteId) return false
  if (d.polizaId || d.siniestroId || d.portalParteId) return false
  if (!esLeadOProspecto(d.tipoCliente, d.segmento)) return false
  if (d.fusionada !== false) return false
  if (!sinPolizas(d.polizas)) return false
  if (d.interviniente !== false) return false
  if (d.referenciado !== false) return false
  if (d.procesoAbierto !== false) return false
  return true
}

// ─── 2 · Prospectos web ─────────────────────────────────────────────────────

export type ProspectoCandidato = {
  id: string
  fuente: string | null
  tipoCliente: string | null
  segmento: string | null
  altaAt: Date | null
  ahora: Date | null
  anonimizado: boolean | null
  fusionada: boolean | null
  polizas: PolizaLeida[] | null
  interviniente: boolean | null
  /** Tiene cuenta en el portal del cliente. */
  conPortal: boolean | null
  /** Oportunidad sin cerrar (propia o como figura): el acuerdo aún está en juego. */
  oportunidadAbierta: boolean | null
  /** Eventos comerciales (historial_interno, oportunidades, presupuestos) en los últimos 12 meses. 0 = revisado, ninguno. */
  actividadReciente: number | null
}

/** `ahora` menos `meses` meses (calendario, UTC), igual que `interval 'N months'`. */
export function haceMeses(ahora: Date, meses: number): Date {
  const d = new Date(ahora.getTime())
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d
}

export function esProspectoAnonimizable(p: ProspectoCandidato, meses = MESES_RETENCION_PROSPECTO): boolean {
  if (p.fuente !== 'web') return false
  if (!esLeadOProspecto(p.tipoCliente, p.segmento)) return false
  if (!esFecha(p.altaAt) || !esFecha(p.ahora)) return false
  if (p.altaAt.getTime() >= haceMeses(p.ahora, meses).getTime()) return false
  if (p.anonimizado !== false) return false
  if (p.fusionada !== false) return false
  if (!sinPolizas(p.polizas)) return false
  if (p.interviniente !== false) return false
  if (p.conPortal !== false) return false
  if (p.oportunidadAbierta !== false) return false
  if (typeof p.actividadReciente !== 'number' || !Number.isFinite(p.actividadReciente) || p.actividadReciente !== 0) return false
  return true
}

// ─── Texto del aviso (cifras, SIN PII) ──────────────────────────────────────

export type ResumenPurgaRgpd = {
  modo: 'informe' | 'activa'
  documentos: { candidatos: number; descartados: number; borrados: number; masDelLote: boolean }
  prospectos: { candidatos: number; descartados: number; anonimizados: number; masDelLote: boolean }
}

export function textoAvisoPurgaRgpd(r: ResumenPurgaRgpd): string | null {
  const hayAlgo = r.documentos.candidatos + r.prospectos.candidatos + r.documentos.borrados + r.prospectos.anonimizados > 0
  if (!hayAlgo) return null
  const mas = (b: boolean) => (b ? ' (lote lleno: hay más)' : '')
  const lineas =
    r.modo === 'informe'
      ? [
          '🧹 <b>Purga RGPD</b> · MODO INFORME (no se ha tocado nada)',
          `• Documentos de no clientes (&gt;${DIAS_RETENCION_DOCUMENTOS} días) que se borrarían: ${r.documentos.candidatos}${mas(r.documentos.masDelLote)}`,
          `• Prospectos web (&gt;${MESES_RETENCION_PROSPECTO} meses sin acuerdo) que se anonimizarían: ${r.prospectos.candidatos}${mas(r.prospectos.masDelLote)}`,
          `Para ejecutar: ${ENV_PURGA_RGPD}=1 en central-asegura.`,
        ]
      : [
          '🧹 <b>Purga RGPD</b> · ejecutada',
          `• Documentos borrados: ${r.documentos.borrados} de ${r.documentos.candidatos}${mas(r.documentos.masDelLote)}`,
          `• Prospectos anonimizados: ${r.prospectos.anonimizados} de ${r.prospectos.candidatos}${mas(r.prospectos.masDelLote)}`,
        ]
  return lineas.join('\n')
}

// ─── Lectura y escritura ────────────────────────────────────────────────────

type FilaDoc = {
  id: string; subido_por: string | null; created_at: Date | null; ahora: Date | null; cliente_id: string | null
  poliza_id: string | null; siniestro_id: string | null; portal_parte_id: string | null
  tipo_cliente: string | null; segmento: string | null; fusionada: boolean | null
  polizas: PolizaLeida[] | null; interviniente: boolean | null; referenciado: boolean | null; proceso_abierto: boolean | null
}

type FilaProspecto = {
  id: string; fuente: string | null; tipo_cliente: string | null; segmento: string | null; created_at: Date | null; ahora: Date | null
  anonimizado: boolean | null; fusionada: boolean | null; polizas: PolizaLeida[] | null; interviniente: boolean | null
  con_portal: boolean | null; oportunidad_abierta: boolean | null; actividad_reciente: number | bigint | null
}

const num = (v: number | bigint | null | undefined): number | null => (v == null ? null : Number(v))

/** Documentos candidatos (pre-filtro SQL; decide `esDocumentoPurgable`). Pide `limite + 1` para saber si hay más. */
export async function leerDocumentosCandidatos(db: DbPurgaRgpd, correduriaId: string, limite = LOTE_PURGA_RGPD): Promise<{ candidatos: DocumentoCandidato[]; masDelLote: boolean }> {
  const filas = await db.$queryRaw<FilaDoc[]>`
    select d.id::text as id, d.subido_por, d.created_at, now() as ahora, d.cliente_id::text as cliente_id,
           d.poliza_id::text as poliza_id, d.siniestro_id::text as siniestro_id, d.portal_parte_id::text as portal_parte_id,
           c.tipo::text as tipo_cliente, c.segmento::text as segmento, (c.merged_into_cliente_id is not null) as fusionada,
           coalesce((select jsonb_agg(jsonb_build_object('importRef', p.import_ref, 'eiacXmlHash', p.eiac_xml_hash, 'estado', p.estado::text, 'sustituidaAt', p.sustituida_at))
                     from seguros.polizas p
                     where p.cliente_id = any(array[c.id] || array(select a.id from seguros.clientes a where a.merged_into_cliente_id = c.id))), '[]'::jsonb) as polizas,
           exists (select 1 from seguros.poliza_intervinientes i where i.cliente_id = c.id) as interviniente,
           (exists (select 1 from seguros.anulacion x where x.adjunto_documento_id = d.id)
            or exists (select 1 from seguros.formacion x where x.documento_id = d.id)
            or exists (select 1 from seguros.oportunidad_oferta x where x.documento_id = d.id)
            or exists (select 1 from seguros.tarificacion_trabajos x where x.evidencia_documento_id = d.id)
            or exists (select 1 from seguros.tarificador_grabacion_pantallas x where x.documento_id = d.id)
            or exists (select 1 from seguros.tarificador_fichas x where x.origen_documento_id = d.id)
            or exists (select 1 from seguros.tarificador_coberturas_presupuesto x where x.documento_id = d.id)
            or exists (select 1 from seguros.tarificacion_emision_autorizacion x where x.evidencia_previa_id = d.id or x.evidencia_posterior_id = d.id)
            or exists (select 1 from seguros.tarificador_atascos x where x.captura_documento_id = d.id)) as referenciado,
           (exists (select 1 from seguros.oportunidades o where o.cliente_id = c.id and o.cerrada_at is null)
            or exists (select 1 from seguros.presupuesto pr where pr.cliente_id = c.id and pr.creado_at > now() - ${DIAS_RETENCION_DOCUMENTOS}::int * interval '1 day')
            or exists (select 1 from seguros.historial_interno h where h.cliente_id = c.id
                       and greatest(h.created_at, coalesce(h.updated_at, h.created_at)) > now() - ${DIAS_RETENCION_DOCUMENTOS}::int * interval '1 day')) as proceso_abierto
    from seguros.documentos d
    join seguros.clientes c on c.id = d.cliente_id and c.correduria_id = d.correduria_id
    where d.correduria_id = ${correduriaId}::uuid
      and d.subido_por = 'cliente'
      and d.created_at < now() - ${DIAS_RETENCION_DOCUMENTOS}::int * interval '1 day'
      and d.poliza_id is null and d.siniestro_id is null and d.portal_parte_id is null
      and (c.tipo::text = 'lead' or c.segmento::text = 'prospecto') and c.segmento::text not in ('cliente', 'ex_cliente')
      and not exists (select 1 from seguros.polizas p where p.cliente_id = c.id)
    order by d.created_at
    limit ${limite + 1}::int`
  const masDelLote = filas.length > limite
  const candidatos = filas.slice(0, limite).map((f): DocumentoCandidato => ({
    id: f.id, subidoPor: f.subido_por, creadoAt: f.created_at, ahora: f.ahora, clienteId: f.cliente_id,
    polizaId: f.poliza_id, siniestroId: f.siniestro_id, portalParteId: f.portal_parte_id,
    tipoCliente: f.tipo_cliente, segmento: f.segmento, fusionada: f.fusionada, polizas: f.polizas,
    interviniente: f.interviniente, referenciado: f.referenciado, procesoAbierto: f.proceso_abierto,
  }))
  return { candidatos, masDelLote }
}

/** Borra esos documentos RE-COMPROBANDO las guardas clave en el propio DELETE. Devuelve cuántos borró. */
export async function borrarDocumentos(db: DbPurgaRgpd, correduriaId: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0
  const r = await db.$queryRaw<{ id: string }[]>`
    delete from seguros.documentos d
    using seguros.clientes c
    where d.id = any(${[...ids]}::uuid[]) and d.correduria_id = ${correduriaId}::uuid
      and c.id = d.cliente_id and c.correduria_id = d.correduria_id and c.merged_into_cliente_id is null
      and d.subido_por = 'cliente'
      and d.created_at < now() - ${DIAS_RETENCION_DOCUMENTOS}::int * interval '1 day'
      and d.poliza_id is null and d.siniestro_id is null and d.portal_parte_id is null
      and c.segmento::text not in ('cliente', 'ex_cliente')
      and not exists (select 1 from seguros.polizas p
                      where p.cliente_id = any(array[c.id] || array(select a.id from seguros.clientes a where a.merged_into_cliente_id = c.id)))
      and not exists (select 1 from seguros.poliza_intervinientes i where i.cliente_id = c.id)
      and not exists (select 1 from seguros.oportunidades o where o.cliente_id = c.id and o.cerrada_at is null)
    returning d.id::text as id`
  return r.length
}

/** Prospectos web candidatos (pre-filtro SQL; decide `esProspectoAnonimizable`). */
export async function leerProspectosCandidatos(db: DbPurgaRgpd, correduriaId: string, limite = LOTE_PURGA_RGPD): Promise<{ candidatos: ProspectoCandidato[]; masDelLote: boolean }> {
  const filas = await db.$queryRaw<FilaProspecto[]>`
    select c.id::text as id, c.fuente::text as fuente, c.tipo::text as tipo_cliente, c.segmento::text as segmento,
           c.created_at, now() as ahora, (c.nombre = ${NOMBRE_ANONIMIZADO}) as anonimizado,
           (c.merged_into_cliente_id is not null) as fusionada,
           coalesce((select jsonb_agg(jsonb_build_object('importRef', p.import_ref, 'eiacXmlHash', p.eiac_xml_hash, 'estado', p.estado::text, 'sustituidaAt', p.sustituida_at))
                     from seguros.polizas p
                     where p.cliente_id = any(array[c.id] || array(select a.id from seguros.clientes a where a.merged_into_cliente_id = c.id))), '[]'::jsonb) as polizas,
           exists (select 1 from seguros.poliza_intervinientes i where i.cliente_id = c.id) as interviniente,
           exists (select 1 from seguros.portal_vinculo v where v.cliente_id = c.id) as con_portal,
           exists (select 1 from seguros.oportunidades o
                   where o.cerrada_at is null
                     and (o.cliente_id = c.id or exists (select 1 from seguros.oportunidad_figura f where f.oportunidad_id = o.id and f.cliente_id = c.id))) as oportunidad_abierta,
           ((select count(*) from seguros.historial_interno h where h.cliente_id = c.id
               and greatest(h.created_at, coalesce(h.updated_at, h.created_at)) > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month')
            + (select count(*) from seguros.oportunidades o where o.cliente_id = c.id
               and greatest(o.created_at, coalesce(o.updated_at, o.created_at), coalesce(o.cerrada_at, o.created_at)) > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month')
            + (select count(*) from seguros.oportunidad_figura f join seguros.oportunidades o on o.id = f.oportunidad_id where f.cliente_id = c.id
               and greatest(o.created_at, coalesce(o.updated_at, o.created_at)) > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month')
            + (select count(*) from seguros.presupuesto pr where pr.cliente_id = c.id
               and pr.creado_at > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month'))::int as actividad_reciente
    from seguros.clientes c
    where c.correduria_id = ${correduriaId}::uuid
      and c.fuente::text = 'web'
      and (c.tipo::text = 'lead' or c.segmento::text = 'prospecto') and c.segmento::text not in ('cliente', 'ex_cliente')
      and c.created_at < now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month'
      and c.nombre <> ${NOMBRE_ANONIMIZADO}
      and c.merged_into_cliente_id is null
      and not exists (select 1 from seguros.polizas p where p.cliente_id = c.id)
    order by c.created_at
    limit ${limite + 1}::int`
  const masDelLote = filas.length > limite
  const candidatos = filas.slice(0, limite).map((f): ProspectoCandidato => ({
    id: f.id, fuente: f.fuente, tipoCliente: f.tipo_cliente, segmento: f.segmento, altaAt: f.created_at, ahora: f.ahora,
    anonimizado: f.anonimizado, fusionada: f.fusionada, polizas: f.polizas, interviniente: f.interviniente,
    conPortal: f.con_portal, oportunidadAbierta: f.oportunidad_abierta, actividadReciente: num(f.actividad_reciente),
  }))
  return { candidatos, masDelLote }
}

/**
 * Anonimiza esas fichas en UNA sentencia (atómica): nombre → marca, PII y sus índices ciegos a NULL, `activo = false`;
 * borra sus teléfonos, emails y carnés (tablas hijas de PII); deja UNA línea en `historial_interno` sin PII.
 * La fila del cliente NO se borra (sin cascada). Re-comprueba las guardas clave en el UPDATE. Devuelve cuántas.
 */
export async function anonimizarProspectos(db: DbPurgaRgpd, correduriaId: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0
  const texto = `Ficha anonimizada por retención RGPD: prospecto web sin acuerdo durante más de ${MESES_RETENCION_PROSPECTO} meses (política de privacidad).`
  const r = await db.$queryRaw<{ id: string }[]>`
    with obj as (
      update seguros.clientes c set
        nombre = ${NOMBRE_ANONIMIZADO}, apellidos = '', dni = null, dni_lookup_hash = null,
        telefono = null, telefono_lookup_hash = null, wa_phone_number = null,
        email = null, email_lookup_hash = null, email_dominio_hash = null, email_usuario_hash = null,
        fecha_nacimiento = null, direccion = null, codigo_postal = null, ciudad = null,
        direccion_fiscal = null, cp_fiscal = null, ciudad_fiscal = null, cuenta_bancaria = null,
        notas = null, estado_civil = null, ocupacion = null, sector = null, saludo = null,
        activo = false, updated_at = now()
      where c.id = any(${[...ids]}::uuid[]) and c.correduria_id = ${correduriaId}::uuid
        and c.fuente::text = 'web' and c.segmento::text not in ('cliente', 'ex_cliente')
        and c.created_at < now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month'
        and c.nombre <> ${NOMBRE_ANONIMIZADO} and c.merged_into_cliente_id is null
        and not exists (select 1 from seguros.polizas p
                        where p.cliente_id = any(array[c.id] || array(select a.id from seguros.clientes a where a.merged_into_cliente_id = c.id)))
        and not exists (select 1 from seguros.poliza_intervinientes i where i.cliente_id = c.id)
        and not exists (select 1 from seguros.portal_vinculo v where v.cliente_id = c.id)
        and not exists (select 1 from seguros.oportunidades o where o.cliente_id = c.id and o.cerrada_at is null)
        and not exists (select 1 from seguros.historial_interno h where h.cliente_id = c.id
                        and greatest(h.created_at, coalesce(h.updated_at, h.created_at)) > now() - ${MESES_RETENCION_PROSPECTO}::int * interval '1 month')
      returning c.id, c.correduria_id
    ),
    tel as (delete from seguros.cliente_telefonos t using obj where t.cliente_id = obj.id returning 1),
    ema as (delete from seguros.cliente_emails e using obj where e.cliente_id = obj.id returning 1),
    car as (delete from seguros.cliente_carnets_conducir k using obj where k.cliente_id = obj.id returning 1),
    his as (insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
            select obj.correduria_id, obj.id, cast('gestion' as seguros.tipo_historial_interno), ${texto} from obj returning 1)
    select obj.id::text as id from obj`
  return r.length
}

export type ResultadoPurgaRgpd = ResumenPurgaRgpd & { avisado: boolean }

/**
 * Una pasada completa. `activa` = false → solo lee y cuenta. `enviar` = Telegram (inyectable para el cepo); se llama solo
 * si hay algo que contar. Las lecturas que fallan LANZAN antes de escribir nada.
 */
export async function ejecutarPurgaRgpd(
  db: DbPurgaRgpd,
  correduriaId: string,
  opts: { activa: boolean; limite?: number; enviar: (texto: string) => Promise<number | null> },
): Promise<ResultadoPurgaRgpd> {
  const limite = opts.limite ?? LOTE_PURGA_RGPD
  // Las DOS lecturas antes de cualquier escritura: si una falla, no se toca nada.
  const docs = await leerDocumentosCandidatos(db, correduriaId, limite)
  const pros = await leerProspectosCandidatos(db, correduriaId, limite)
  const idsDocs = docs.candidatos.filter((d) => esDocumentoPurgable(d)).map((d) => d.id)
  const idsPros = pros.candidatos.filter((p) => esProspectoAnonimizable(p)).map((p) => p.id)

  let borrados = 0
  let anonimizados = 0
  if (opts.activa) {
    borrados = await borrarDocumentos(db, correduriaId, idsDocs)
    anonimizados = await anonimizarProspectos(db, correduriaId, idsPros)
  }
  const resumen: ResumenPurgaRgpd = {
    modo: opts.activa ? 'activa' : 'informe',
    documentos: { candidatos: idsDocs.length, descartados: docs.candidatos.length - idsDocs.length, borrados, masDelLote: docs.masDelLote },
    prospectos: { candidatos: idsPros.length, descartados: pros.candidatos.length - idsPros.length, anonimizados, masDelLote: pros.masDelLote },
  }
  const texto = textoAvisoPurgaRgpd(resumen)
  const avisado = texto ? (await opts.enviar(texto).catch(() => null)) !== null : false
  return { ...resumen, avisado }
}
