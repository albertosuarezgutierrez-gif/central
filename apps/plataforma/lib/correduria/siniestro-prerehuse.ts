// Aviso de Telegram por un posible rehúse (el puerto de asegura marca `preRehuse:true`). Solo desde rutas API.
import { tgAviso } from '../telegram/avisos'
import { URL_PLATAFORMA_POR_DEFECTO } from '../correduria-emision-tg.ts'
import { hayPreRehuse, textoPreRehuse } from './siniestro-hilo.ts'
import { hiloAsegura } from './siniestro-hilo-red.ts'

/** Si la respuesta trae `preRehuse:true`, avisa por Telegram. FAIL-OPEN: nunca rompe ni retrasa la respuesta al corredor. */
export async function avisarPreRehuseSiProcede(respuesta: unknown, correduriaId: string | null, siniestroId: string): Promise<void> {
  if (!hayPreRehuse(respuesta)) return
  try {
    let referencia: string | null = null
    try {
      const h = (await hiloAsegura(correduriaId, siniestroId)).json as { siniestro?: { referencia?: unknown } } | null
      const r = h?.siniestro?.referencia
      referencia = typeof r === 'string' && r !== '' ? r : null
    } catch { /* sin número: el aviso sale igual */ }
    const base = (process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO).replace(/\/$/, '')
    await tgAviso('correduria.siniestro-prerehuse', textoPreRehuse(referencia, `${base}/correduria/siniestro/${encodeURIComponent(siniestroId)}`))
  } catch { /* fail-open */ }
}
