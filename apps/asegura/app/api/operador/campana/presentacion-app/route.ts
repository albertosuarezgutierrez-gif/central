import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { embudoPresentacionApp, pasadaPresentacionApp } from '@/lib/presentacion-app'
import { CAMPANA_PRESENTACION_APP } from '@central/module-seguros'
import { CAMPANA_AVISO_VENC_APP } from '@/lib/correo-avisos-intranet'

/** Las campañas que este embudo sabe leer. Otra cosa en `?campana=` es un 400, no «campaña vacía». */
const CAMPANAS = [CAMPANA_PRESENTACION_APP, CAMPANA_AVISO_VENC_APP] as const

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/operador/campana/presentacion-app — el embudo de la campaña (enviado → entregado → abierto →
 * clic → visita con `?r=` → registrado en el portal) de `?campana=` (`presentacion_app` por defecto, o
 * `aviso_venc_app`) y, con `?seleccion=1`, el ENSAYO de la selección
 * de hoy (nunca envía: el envío solo lo hace el cron, con sus cerrojos). Solo lectura.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const params = new URL(req.url).searchParams
    const campana = params.get('campana') ?? CAMPANA_PRESENTACION_APP
    if (!(CAMPANAS as readonly string[]).includes(campana)) return NextResponse.json({ estado: 'error', motivo: 'campana_desconocida' }, { status: 400 })
    const embudo = await embudoPresentacionApp(correduria.id, campana)
    if (embudo.estado === 'sin_migracion') return NextResponse.json(embudo, { status: 503 })
    // El ensayo de selección es solo de la campaña a leads (la del aviso no tiene cron propio).
    const conSeleccion = params.get('seleccion') === '1' && campana === CAMPANA_PRESENTACION_APP
    const seleccion = conSeleccion ? await pasadaPresentacionApp(correduria.id, { forzarContar: true }) : null
    return NextResponse.json({ estado: 'ok', embudo, seleccion })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/campana/presentacion-app', e) }, { status: 500 })
  }
}
