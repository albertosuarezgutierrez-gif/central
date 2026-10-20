import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comparativaDeOportunidad } from '@/lib/comparativa-oportunidad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/oportunidad/comparativa?oportunidadId=` — la COMPARATIVA ÚNICA de una oportunidad (20/10/2026)
 * — plataforma → asegura. GRATIS: no llama a Codeoscopic ni a la IA; solo lee lo guardado.
 *
 *   → { estado:'ok', oportunidad, comparacion, huella, guardado, avant2, polizaCartera }
 *     · `comparacion`: `compararOfertas` sobre TODAS las fuentes (ofertas PDF/bot no descartadas, la última cotización
 *       de Avant2 de la oportunidad y la póliza de la cartera): tabla de precios (`resumen`), matriz con tres estados
 *       (`celdas[].estado3`: incluida · no_incluida · no_se_sabe) y orden explicado (`ranking`).
 *     · `guardado`: el último estudio (`presupuesto.estudio`) con su resumen y su etiqueta, y `vigente` = misma huella
 *       que las ofertas de ahora (si no, «Generar presupuesto» redactará uno nuevo; si sí, reutiliza el texto).
 *     · `avant2`: la cotización ya pagada y el aviso «ya hay una cotización del dd/mm, ¿nueva consulta 0,50€?» que la
 *       pantalla enseña ANTES de dejar pedir otra de pago. `null` = la oportunidad no tiene ninguna.
 *
 * 🚨 Nada sale al cliente. Solo lectura (GET): no lleva `auditado()`.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', motivo: 'falta oportunidadId (uuid)' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await comparativaDeOportunidad(correduria.id, oportunidadId)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/comparativa', e) }, { status: 500 })
  }
}
