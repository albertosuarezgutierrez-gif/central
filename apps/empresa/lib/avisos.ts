// Aviso INTERNO al operador (Telegram del bot único, a TELEGRAM_CHAT_ID = Alberto). Solo nombre de la empresa y versión:
// ni datos del firmante ni de empleados. Sin token configurado no hace nada (la firma ya está guardada: el aviso no la condiciona).
import { tgSend, escapeHtml } from '@central/core-telegram'

export async function avisarFirma(razonSocial: string, n: number): Promise<void> {
  await tgSend(`✍️ <b>Contrato de encargo firmado</b>\n${escapeHtml(razonSocial)} · versión ${n}\nHerramientas activadas. Detalle en plataforma → Operador → Empresas.`)
}
