// Salidas hacia terceros (correo) tras un PUERTO. F1: NO se envía nada real; la implementación «registrar» deja constancia
// en `auditoria` (entidad `salida_pendiente`) de lo que SE ENVIARÍA, para que F3 lo conecte sin tocar los flujos.
export type Salida = { tallerId: string; tipo: 'resguardo' | 'presupuesto'; a: string; asunto: string; texto: string; referencia?: string }
export interface Notificador {
  enviar(s: Salida): Promise<void>
}

type TxAuditoria = { auditoria: { create(a: { data: Record<string, unknown> }): Promise<unknown> } }

export function notificadorRegistro(tx: TxAuditoria, usuarioId: string | null = null): Notificador {
  return {
    async enviar(s) {
      await tx.auditoria.create({
        data: {
          tallerId: s.tallerId, usuarioId, entidad: 'salida_pendiente', accion: `correo:${s.tipo}`,
          despues: { a: s.a, asunto: s.asunto, referencia: s.referencia ?? null, enviado: false },
        },
      })
    },
  }
}
