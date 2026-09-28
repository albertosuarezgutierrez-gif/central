// El justificante de la baja firmada, para el CLIENTE (28/09/2026). Caso fundacional: Pablo firmó en el
// portal, la carta salió a Mapfre y a él no le llegó nada — ni un «ok», ni el documento. La tarjeta de
// firma desaparece al recargar, así que no le quedaba prueba de haber firmado. Alberto: «debería
// llegarle otro mail con el documento firmado o algún justificante» y «guardarlo en su intranet con la
// póliza».
//
// Dos entregas, independientes (una que falle no se lleva la otra):
//   1. ARCHIVO: el PDF firmado (carta + justificante de firma, el MISMO que recibe la compañía) en
//      `documentos` de la póliza que se da de baja, `visible_por_cliente` → lo ve en su portal, en la
//      ficha de esa póliza, y Alberto en Documentos. Una sola vez (marca en `notas`).
//   2. CORREO al cliente con el PDF y el original en texto adjuntos. Una sola vez por póliza, salvo
//      reenvío pedido a mano desde plataforma.
//
// Solo para firma ELECTRÓNICA (`firma_id` + `carta_texto`): de una firma en papel no hay nada que
// certificar aquí. El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { prismaAsegura } from './asegura-db'
import { adjuntosFirmados, type FirmaGuardada } from './aprobaciones'
import { guardarDocumento } from './cartera-documentos'
import { cuerpoCorreoJustificante } from './correo-justificante-anulacion.ts'
import { enlacePortal } from './correo-invitacion-portal.ts'
import { estadoEmailDeFicha } from './email-ficha'

export const TIPO_CORREO_JUSTIFICANTE = 'anulacion_justificante'
/** Marca en `documentos.notas`: es lo que hace idempotente el archivo. */
export const marcaJustificante = (anulacionId: string) => `justificante_anulacion:${anulacionId}`

export type ResultadoJustificante =
  | {
      estado: 'hecho'
      /** `archivado` = se guardó ahora; `ya_estaba` = ya lo tenía; `fallo` = no se pudo (motivo en el log). */
      archivo: 'archivado' | 'ya_estaba' | 'fallo'
      /** `ya_enviado` = ya lo recibió y no se pidió reenviar. */
      correo: 'enviado' | 'ya_enviado' | 'sin_email' | 'sin_portal' | 'fallo'
    }
  | { estado: 'no_encontrada' }
  /** No es una firma electrónica (papel) o aún no está firmada: no hay justificante que dar. */
  | { estado: 'sin_firma_electronica' }

type Fila = FirmaGuardada & {
  estado: string; tipo: 'no_renovacion' | 'inmediata' | 'sustitucion'; carta: string | null; firmaId: string | null
  polizaId: string; clienteId: string; nombre: string | null; numero: string | null; compania: string | null
  fechaEfecto: string; firmadaEl: string | null; firmadaAt: Date | null
}

/**
 * Archiva el PDF firmado en la póliza y se lo manda al cliente. Idempotente: llamarla dos veces no
 * duplica el documento ni el correo (salvo `reenviar`, que solo repite el correo).
 */
export async function entregarJustificanteAnulacion(
  correduriaId: string, anulacionId: string, opciones: { reenviar?: boolean } = {},
): Promise<ResultadoJustificante> {
  const db = prismaAsegura()
  const [a] = await db.$queryRaw<Fila[]>`
    select a.estado, a.tipo, a.carta_texto as carta, a.firma_id::text as "firmaId",
           a.poliza_id::text as "polizaId", a.cliente_id::text as "clienteId", c.nombre,
           p.numero_poliza as numero, coalesce(cd.nombre_comun, p.aseguradora) as compania,
           to_char(a.fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto",
           to_char(a.firmada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "firmadaEl", a.firmada_at as "firmadaAt",
           f.firmante_nombre as firmante, f.metodo, f.sello_tiempo as sello, f.doc_hash as "docHash"
    from anulacion a join polizas p on p.id = a.poliza_id join clientes c on c.id = a.cliente_id
      left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
      left join firma f on f.id = a.firma_id
    where a.id = ${anulacionId}::uuid and a.correduria_id = ${correduriaId}::uuid`
  if (!a) return { estado: 'no_encontrada' }
  if (!a.firmaId || !a.carta || !a.docHash || !a.firmadaEl || !['firmada', 'comunicada', 'confirmada'].includes(a.estado)) {
    return { estado: 'sin_firma_electronica' }
  }

  const num = (a.numero ?? 'poliza').replace(/[^\w.-]+/g, '_')
  // El MISMO par que recibe la compañía: PDF (carta + justificante) y el original que respalda la huella.
  const adjuntos = await adjuntosFirmados(`solicitud-anulacion-${num}`, a.carta, a)
  const pdf = adjuntos.find((x) => x.tipo === 'application/pdf')

  let archivo: 'archivado' | 'ya_estaba' | 'fallo' = 'fallo'
  try {
    const ya = await db.documento.count({ where: { correduriaId, polizaId: a.polizaId, notas: marcaJustificante(anulacionId) } })
    if (ya > 0) archivo = 'ya_estaba'
    else if (!pdf) console.error(`[justificante-anulacion] ${anulacionId}: no hay PDF firmado que archivar`)
    else {
      const g = await guardarDocumento(correduriaId, {
        polizaId: a.polizaId, clienteId: a.clienteId, tipo: 'otro',
        nombre: `Baja firmada - poliza ${num}.pdf`, mime: 'application/pdf', contenido: Buffer.from(pdf.contenido),
        notas: marcaJustificante(anulacionId), subidoPor: 'agente', visiblePorCliente: true,
      })
      if (g.ok) archivo = 'archivado'
      else console.error(`[justificante-anulacion] ${anulacionId}: no se archivó el PDF:`, g.motivo)
    }
  } catch (e) {
    console.error(`[justificante-anulacion] ${anulacionId}: no se archivó el PDF:`, e instanceof Error ? e.message : e)
  }

  let correo: 'enviado' | 'ya_enviado' | 'sin_email' | 'sin_portal' | 'fallo' = 'fallo'
  try {
    // Por BAJA, no por póliza: una segunda baja firmada de la misma póliza (tras desistir de la primera)
    // también tiene que llegar. `correo_envio` no guarda la anulación, así que se acota por su firma.
    const [previo] = await db.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n from correo_envio
      where poliza_id = ${a.polizaId}::uuid and tipo = ${TIPO_CORREO_JUSTIFICANTE} and estado = 'enviado'
        and creado_en >= ${a.firmadaAt ?? new Date(0)}`
    const enlace = enlacePortal()
    const ficha = await estadoEmailDeFicha(correduriaId, a.clienteId)
    if (!opciones.reenviar && Number(previo?.n ?? 0) > 0) correo = 'ya_enviado'
    else if (!enlace) correo = 'sin_portal'
    else if (ficha.estado !== 'ok') correo = 'sin_email'
    else {
      const cuerpo = cuerpoCorreoJustificante({
        nombre: a.nombre, compania: a.compania, tipo: a.tipo, fechaEfecto: a.fechaEfecto, firmadaEl: a.firmadaEl,
        comunicada: a.estado !== 'firmada', enlace,
        conPdf: !!pdf, enPortal: archivo === 'archivado' || archivo === 'ya_estaba',
      })
      const { enviarCorreoSeguido } = await import('./correo-envio')
      const r = await enviarCorreoSeguido({
        correduriaId, clienteId: a.clienteId, polizaId: a.polizaId, tipo: TIPO_CORREO_JUSTIFICANTE, to: ficha.email, ...cuerpo, adjuntos,
      })
      if (r.resultado === 'enviado') correo = 'enviado'
      else console.error(`[justificante-anulacion] ${anulacionId}: el correo no salió:`, r.resultado, r.motivo ?? '')
    }
  } catch (e) {
    console.error(`[justificante-anulacion] ${anulacionId}: el correo no salió:`, e instanceof Error ? e.message : e)
  }

  if (correo === 'enviado') {
    try {
      await db.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
        values (${correduriaId}::uuid, ${a.clienteId}::uuid, ${a.polizaId}::uuid, cast('contacto' as tipo_historial_interno),
                ${'Se le mandó por correo la carta de baja firmada con su justificante.'})`
    } catch (e) {
      console.error('[justificante-anulacion] historial no anotado:', e instanceof Error ? e.message : e)
    }
  }
  return { estado: 'hecho', archivo, correo }
}
