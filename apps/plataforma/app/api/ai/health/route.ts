import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Healthcheck de la pasarela de IA: ¿está viva y qué proveedores tiene configurados? No gasta tokens
 * ni requiere secreto (no expone datos sensibles, solo presencia de keys como booleano).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    proveedores: {
      nim: !!process.env.NVIDIA_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
    limite_mensual: Number(process.env.AI_GATEWAY_LIMITE_MENSUAL ?? 0) || 0,
  })
}
