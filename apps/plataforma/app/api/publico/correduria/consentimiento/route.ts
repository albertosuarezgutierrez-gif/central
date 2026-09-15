import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { normalizarCategorias } from '@/lib/consentimiento-categorias'

export const dynamic = 'force-dynamic'

// POST /api/publico/correduria/consentimiento — receptor único de los tres reenvíos
// fire-and-forget (`asegura-web`, `ia-rest`, `housesevillana` → @central/core-consent).
// Escribe en `consentimiento_registro` (migración 2026-09-14, SIN PII a propósito: ni IP,
// ni user-agent, ni identificador de persona — solo qué categorías se aceptaron/rechazaron).
//
// SIN sesión (bajo `/api/publico` en el middleware). housesevillana llama DIRECTO desde el
// navegador (no tiene servidor propio), así que esta respuesta necesita CORS — a diferencia de
// `/api/publico/disponibilidad`, esto NO se cachea en el CDN (POST, `force-dynamic`), así que el
// comodín fijo no es por la landmine de `Vary: Origin`, es simplemente que cualquier origen del
// holding puede reenviar aquí y no hay sesión que proteger.
//
// Ningún llamador espera nada de la respuesta (todos usan `.catch()` y no leen el cuerpo): un
// fallo aquí es una fila menos en el registro, nunca algo que deba propagarse al visitante.
const CORS = { 'Access-Control-Allow-Origin': '*' }

const APPS = new Set(['asegura-web', 'ia-rest', 'housesevillana'])

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  })
}

export async function POST(req: NextRequest) {
  // Límite generoso a propósito: a diferencia de `/lead`, este tráfico es un evento por visitante
  // de tres webs públicas, no un formulario que alguien rellena a mano — 6/hora lo saturaría con
  // uso normal. Solo protege la tabla de un bucle o un bot; no hay nada más que frenar (sin
  // Telegram, sin escritura en la cartera).
  const ip = getIp(req)
  if (!rateLimit(`consentimiento:${ip}`, 60, 60 * 1000).allowed) {
    return NextResponse.json({ ok: false }, { status: 429, headers: CORS })
  }

  const body = await req.json().catch(() => null)
  const app = typeof body?.app === 'string' ? body.app : ''
  const categorias = body?.categorias

  if (!APPS.has(app)) {
    return NextResponse.json({ ok: false, motivo: 'app desconocida' }, { status: 400, headers: CORS })
  }
  // 🚨 El guard anterior rechazaba ARRAYS, que es justo lo que mandan las tres webs
  // (`acceptedCategories` de vanilla-cookieconsent). Resultado medido el 15/09/2026: 400 en
  // todos los envíos, tabla vacía desde el día que se creó, y nadie se enteraba porque el
  // reenvío es fire-and-forget. La normalización vive en `lib/consentimiento-categorias.ts`
  // con su cepo, visto en rojo antes de darlo por bueno.
  const normalizadas = normalizarCategorias(categorias)
  if (!normalizadas) {
    return NextResponse.json({ ok: false, motivo: 'categorias inválidas' }, { status: 400, headers: CORS })
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO consentimiento_registro (app, categorias)
      VALUES (${app}, ${JSON.stringify(normalizadas)}::jsonb)
    `
  } catch {
    // Sin log del cuerpo ni del motivo: es una fila de auditoría, no un flujo que nadie vigila en
    // caliente — igual que el reenvío que la origina, un fallo aquí no es accionable.
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ ok: true }, { headers: CORS })
}
