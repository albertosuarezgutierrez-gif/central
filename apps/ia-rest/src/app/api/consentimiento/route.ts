export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

// POST /api/consentimiento — reenvío fire-and-forget del registro de qué se
// aceptó/rechazó en el banner de cookies (@central/core-consent).
//
// 🚨 DESVIACIÓN respecto al plan (docs/superpowers/plans/2026-09-14-consentimiento-unificado.md,
// Task C1 Step 4): el plan asumía —copiando literalmente el Task B2 original,
// que hablaba de Prisma— un INSERT directo contra la BD. Comprobado (ver
// `apps/ia-rest/AGENTS.md`): esta app NO usa Prisma, usa el cliente de Supabase
// directo contra el schema `iarest` de la BD compartida, y la tabla
// `consentimiento_registro` vive en el schema `public`, que es de
// `apps/plataforma`, no de `iarest`. Escribir ahí desde aquí exigiría un
// cliente Supabase apuntando a OTRO schema solo para esta tabla de auditoría —
// la misma clase de acoplamiento cruzado que el propio `AGENTS.md` de esta app
// prohíbe para los módulos nuevos del holding.
//
// Se sigue en su lugar el MISMO patrón que ya aplicó Task B2 en
// `apps/asegura-web/app/api/consentimiento/route.ts`: reenvío fire-and-forget
// desde el servidor a un puerto de plataforma. Nadie espera una respuesta útil
// de este endpoint (el banner ya decidió y ya arrancó GA4 o no), así que un
// fallo de red o un 404 del lado de plataforma no debe bloquear ni
// reintentarse desde el navegador.
//
// ⚠️ PENDIENTE, fuera del alcance de este Task Group (solo apps/ia-rest):
// `apps/plataforma` todavía NO expone `/api/publico/correduria/consentimiento`.
// Hasta que exista, este endpoint reenvía a una ruta que responde 404 —
// inerte, igual que en asegura-web. No cambia el comportamiento visible: el
// banner funciona igual, solo que sin dejar rastro en `consentimiento_registro`
// todavía.
const PLATAFORMA_URL = (process.env.PLATAFORMA_URL || 'https://plataforma-ten-flame.vercel.app').replace(/\/+$/, '')

export async function POST(req: NextRequest) {
  const { categorias } = await req.json().catch(() => ({ categorias: null }))
  if (!categorias || typeof categorias !== 'object') {
    return NextResponse.json({ error: 'categorias inválidas' }, { status: 400 })
  }

  // Fire-and-forget de verdad: no se espera el resultado del reenvío ni se
  // propaga su fallo al visitante — el registro es una prueba de auditoría,
  // nunca una condición para que el banner funcione.
  fetch(`${PLATAFORMA_URL}/api/publico/correduria/consentimiento`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'ia-rest', categorias }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Sin log del cuerpo (solo categorías booleanas, sin PII) pero tampoco hace
    // falta: un fallo aquí no es accionable en caliente, es una fila menos en
    // el registro de auditoría.
  })

  return NextResponse.json({ ok: true })
}
