// «Solicitar baja desde el portal»: el cliente abre su propio expediente de anulación.
//
// Aparte de `anulacion-portal.ts` A PROPÓSITO: aquí no se importa Prisma ni `./auditoria` (todo entra por
// `deps`), de modo que el cepo puede ejecutar la decisión entera con una BD simulada. `anulacion-portal.ts`
// la cablea con la real (`solicitarAnulacionPortal`).
//
// 🚨 Orden de las comprobaciones (cambiarlo es abrir un agujero, y ningún log lo mostraría):
//   1. la ficha sale del VÍNCULO de la identidad (nunca llega un `clienteId`);
//   2. la póliza se busca por id + correduría + ESA ficha: ajena e inexistente dan lo mismo (`no_es_tuya`, 403:
//      no se hace de oráculo de «¿existe esa póliza?»);
//   3. solo cartera EN VIGOR (`esCarteraEnVigor`): una cancelada o del volcado histórico no se anula;
//   4. una baja abierta por póliza (pre-chequeo + el índice único parcial, que es quien decide);
//   5. las reglas de la solicitud (`solicitudDesdePortal`);
//   6. INSERT con `origen = 'portal'`: nace RETENIDA (no se puede firmar hasta que el corredor la libere o pasen
//      48 h), salvo efecto inminente (≤3 días), que nace liberada por plazo.
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { ESTADOS_ANULACION_ABIERTA, esCarteraEnVigor, liberaSolaAt, solicitudDesdePortal } from '@central/module-seguros'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABIERTOS = [...ESTADOS_ANULACION_ABIERTA] as string[]

type Plantilla = (texto: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown>
/** Lo único que se le pide a la BD (el cliente de Prisma lo cumple; el cepo pone uno de mentira). */
export type DbSolicitud = { $queryRaw: Plantilla; $executeRaw: Plantilla }

export type FichaSolicitud =
  | { estado: 'ok'; clienteId: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

export type DepsSolicitud = {
  db: DbSolicitud
  ficha: (correduriaId: string, identidadId: string) => Promise<FichaSolicitud>
  /** `YYYY-MM-DD` en Madrid. */
  hoy: () => string
  anotar: (cambio: { entidad: string; id: string; campo: string; antes: string | null; despues: string }) => void
}

export type ResultadoSolicitudPortal =
  | {
      estado: 'creada'
      id: string
      advertencia: string | null
      /** `true` = se puede firmar ya (efecto inminente); `false` = retenida hasta `liberaSolaAt`. */
      liberada: boolean
      liberaSolaAt: string | null
      fechaEfecto: string
      motivo: string
      /** El texto estable del motivo («competidor: X · precio_ofrecido: 123,45€») o lo que escribió en «otro». */
      motivoTexto: string | null
      /** Lo justo para el aviso a Alberto: la póliza es de este cliente, no hay nada de otro. */
      poliza: { id: string; compania: string | null; numeroPoliza: string | null }
    }
  | { estado: 'no_es_tuya' }
  | { estado: 'no_vigente' }
  | { estado: 'ya_abierta' }
  | { estado: 'ofrecer_presupuesto'; motivo: string }
  | { estado: 'invalida'; motivo: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

type FilaPoliza = {
  id: string; compania: string | null; numeroPoliza: string | null; vencimiento: string | null
  estado: string | null; importRef: string | null; eiacXmlHash: string | null; sustituidaAt: Date | null
}

/** El índice único parcial (o un 23505 pelado) dice que otra baja se abrió entre el pre-chequeo y el INSERT. */
export function esConflictoDeBajaAbierta(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const x = e as { message?: unknown; code?: unknown; meta?: { code?: unknown } }
  const mensaje = typeof x.message === 'string' ? x.message : ''
  return /uq_anulacion_abierta_por_poliza/.test(mensaje) || /\b23505\b/.test(mensaje) || x.code === '23505' || x.meta?.code === '23505' || x.code === 'P2002'
}

export async function solicitarAnulacionConDeps(
  deps: DepsSolicitud,
  correduriaId: string,
  identidadId: string,
  cuerpo: unknown,
): Promise<ResultadoSolicitudPortal> {
  const { db } = deps
  const polizaId = typeof (cuerpo as { polizaId?: unknown } | null)?.polizaId === 'string' ? (cuerpo as { polizaId: string }).polizaId.trim() : ''
  if (!UUID.test(polizaId)) return { estado: 'no_es_tuya' }

  const f = await deps.ficha(correduriaId, identidadId)
  if (f.estado !== 'ok') return f

  const [p] = (await db.$queryRaw`
    select p.id::text as id, p.aseguradora as compania, p.numero_poliza as "numeroPoliza",
           to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento, p.estado::text as estado,
           p.import_ref as "importRef", p.eiac_xml_hash as "eiacXmlHash", p.sustituida_at as "sustituidaAt"
    from polizas p
    where p.id = ${polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${f.clienteId}::uuid
      and p.merged_into_poliza_id is null`) as FilaPoliza[]
  if (!p) return { estado: 'no_es_tuya' }
  if (!esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt })) {
    return { estado: 'no_vigente' }
  }

  const abiertas = (await db.$queryRaw`
    select id::text as id from anulacion
    where poliza_id = ${polizaId}::uuid and correduria_id = ${correduriaId}::uuid and estado = any(${ABIERTOS}::text[])
    limit 1`) as { id: string }[]
  if (abiertas.length > 0) return { estado: 'ya_abierta' }

  const hoy = deps.hoy()
  const v = solicitudDesdePortal(cuerpo, { vencimiento: p.vencimiento, hoy })
  if (!v.ok) return v.error === 'ofrecer_presupuesto' ? { estado: 'ofrecer_presupuesto', motivo: v.motivo } : { estado: 'invalida', motivo: v.motivo }
  const s = v.solicitud

  let nueva: { id: string; creadaAt: Date }
  try {
    const [r] = (await db.$queryRaw`
      insert into anulacion (correduria_id, poliza_id, cliente_id, tipo, solicitada_por, motivo, motivo_texto, fecha_efecto,
                             creada_por, origen, fecha_venta, liberada_at, liberada_por)
      values (${correduriaId}::uuid, ${polizaId}::uuid, ${f.clienteId}::uuid, ${s.tipo}, 'cliente', ${s.motivo},
              ${s.motivoTexto}, ${s.fechaEfecto}::date, 'portal', 'portal', ${s.fechaVenta}::date,
              case when ${s.liberadaDeEntrada}::boolean then now() end,
              case when ${s.liberadaDeEntrada}::boolean then 'plazo' end)
      returning id::text as id, created_at as "creadaAt"`) as { id: string; creadaAt: Date }[]
    nueva = r
  } catch (e) {
    // La carrera que el pre-chequeo no puede cerrar: la decide el índice parcial.
    if (esConflictoDeBajaAbierta(e)) return { estado: 'ya_abierta' }
    throw e
  }

  deps.anotar({ entidad: 'anulacion', id: nueva.id, campo: 'estado', antes: null, despues: 'solicitada' })
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${f.clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`El cliente pidió desde el portal la baja (${s.motivo}, efecto ${s.fechaEfecto}). ${s.liberadaDeEntrada ? 'Efecto inminente: queda lista para firmar.' : 'Retenida 48 h: llámale antes de que firme.'}`})`
  } catch (e) {
    console.error('[anulacion-solicitud] historial no anotado:', e instanceof Error ? e.message : e)
  }

  return {
    estado: 'creada',
    id: nueva.id,
    advertencia: v.advertencia,
    liberada: s.liberadaDeEntrada,
    liberaSolaAt: s.liberadaDeEntrada ? null : liberaSolaAt(nueva.creadaAt).toISOString(),
    fechaEfecto: s.fechaEfecto,
    motivo: s.motivo,
    motivoTexto: s.motivoTexto,
    poliza: { id: p.id, compania: p.compania, numeroPoliza: p.numeroPoliza },
  }
}
