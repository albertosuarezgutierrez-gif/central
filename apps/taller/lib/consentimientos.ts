/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Registro de consentimientos del cliente final (spec §6). Reglas:
//   · Las casillas llegan SIN MARCAR y el servicio no depende de ellas: marcarlas o no nunca bloquea nada.
//   · Solo se escribe una fila cuando la persona MARCA la casilla (no se fabrican consentimientos).
//   · El texto de Grupo ASegura y su versión salen SIEMPRE de module-taller (no del navegador ni de la configuración
//     del taller): la fila guarda el texto EXACTO que se mostró. El texto del taller sale de su configuración.
//   · Solo-añadir (trigger en BD): nunca se actualiza una fila salvo para retirarla.
import {
  TEXTOS_CONSENTIMIENTO_ASEGURA, VERSION_TEXTO_ASEGURA_VIGENTE, consentimientoAseguraVigente, consentimientoTallerVigente,
  decidirLeadSeguros, type CanalConsentimiento, type Consentimiento, type DecisionConsentimiento, type FinalidadConsentimiento,
} from '@central/module-taller'

type Delegado = { findMany(a?: any): Promise<any[]>; create(a: any): Promise<any> }
export type TxConsent = { consentimiento: Delegado }

export const textoAsegura = (): { version: string; texto: string } => ({
  version: VERSION_TEXTO_ASEGURA_VIGENTE,
  texto: TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE],
})

export type CasillasMarcadas = { asegura: boolean; taller: boolean }
export type TextoTaller = { version: string; texto: string }

const aModulo = (f: any): Consentimiento => ({
  id: f.id, tallerId: f.tallerId, clienteId: f.clienteId, finalidad: f.finalidad as FinalidadConsentimiento, otorgado: f.otorgado,
  versionTexto: f.versionTexto, textoMostrado: f.textoMostrado, canal: f.canal as CanalConsentimiento, otorgadoEn: f.otorgadoEn,
  retiradoEn: f.retiradoEn ?? null,
})

export async function cargarConsentimientos(tx: TxConsent, tallerId: string, clienteId: string): Promise<Consentimiento[]> {
  return (await tx.consentimiento.findMany({ where: { tallerId, clienteId } })).map(aModulo)
}

/** Qué tiene VIGENTE hoy el cliente (para no volver a ofrecer lo que ya aceptó). */
export async function estadoConsentimientos(
  tx: TxConsent, tallerId: string, clienteId: string, hoy: Date,
): Promise<{ asegura: DecisionConsentimiento; taller: DecisionConsentimiento }> {
  const todos = await cargarConsentimientos(tx, tallerId, clienteId)
  return {
    asegura: consentimientoAseguraVigente(todos, tallerId, clienteId, hoy),
    taller: consentimientoTallerVigente(todos, tallerId, clienteId, hoy),
  }
}

/** Guarda una fila por casilla MARCADA. Sin marcar → no escribe nada. Devuelve lo que creó. */
export async function registrarConsentimientos(
  tx: TxConsent,
  o: {
    tallerId: string; clienteId: string; canal: CanalConsentimiento; marcadas: CasillasMarcadas; textoTaller: TextoTaller
    firmaRuta?: string | null; ip?: string | null; userAgent?: string | null; ahora: Date
  },
): Promise<{ asegura: boolean; taller: boolean }> {
  const base = {
    tallerId: o.tallerId, clienteId: o.clienteId, canal: o.canal, otorgado: true, firmaRuta: o.firmaRuta ?? null,
    ip: o.ip ?? null, userAgent: o.userAgent ?? null, otorgadoEn: o.ahora,
  }
  const hecho = { asegura: false, taller: false }
  if (o.marcadas.asegura === true) {
    const a = textoAsegura()
    await tx.consentimiento.create({ data: { ...base, finalidad: 'asegura', versionTexto: a.version, textoMostrado: a.texto } })
    hecho.asegura = true
  }
  if (o.marcadas.taller === true) {
    if (!o.textoTaller.texto.trim() || !o.textoTaller.version.trim()) throw new Error('el taller no tiene texto de consentimiento comercial')
    await tx.consentimiento.create({
      data: { ...base, finalidad: 'taller_comercial', versionTexto: o.textoTaller.version, textoMostrado: o.textoTaller.texto },
    })
    hecho.taller = true
  }
  return hecho
}

/**
 * Servicio de leads a `seguros` — F1: SOLO decide, no hay transporte (el envío a /api/operador/* llega en F3).
 * Devuelve `permitido` solo si el cliente tiene el consentimiento de Grupo ASegura vigente; el id que se enviaría
 * es el vigente (la guardia de module-taller lo comprueba).
 */
export async function evaluarLeadSeguros(
  tx: TxConsent, o: { tallerId: string; clienteId: string; hoy: Date },
): Promise<DecisionConsentimiento> {
  const todos = await cargarConsentimientos(tx, o.tallerId, o.clienteId)
  const vigente = consentimientoAseguraVigente(todos, o.tallerId, o.clienteId, o.hoy)
  return decidirLeadSeguros(
    { tallerId: o.tallerId, clienteId: o.clienteId, consentimientoId: vigente.permitido ? vigente.consentimientoId : null },
    todos,
    o.hoy,
  )
}
