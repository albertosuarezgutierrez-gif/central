import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/consentimiento — reenvío fire-and-forget del registro de qué se
// aceptó/rechazó en el banner de cookies (@central/core-consent).
//
// 🚨 DESVIACIÓN respecto al plan (docs/superpowers/plans/2026-09-14-consentimiento-unificado.md,
// Task B2): el plan asumía un `import { prisma } from '@/lib/prisma'` y un INSERT
// directo. Esta app NO TIENE Prisma, ni rol de BD, ni secreto de sesión — es una
// decisión de arquitectura A PROPÓSITO (ver `lib/sitio.ts` y `CLAUDE.md` de
// asegura-web: "si algún día esta app necesita credenciales de BD, la decisión
// correcta casi siempre es mover esa función a apps/asegura, no traer la BD al
// sitio público"). Meter Prisma aquí para esto habría sido la primera excepción
// a esa regla, y por una tabla de auditoría sin PII no compensa.
//
// Se sigue el MISMO patrón que `/api/lead`: reenvío desde el servidor a un
// puerto de plataforma. Aquí el reenvío es fire-and-forget de verdad — a
// diferencia de `/api/lead`, nadie espera una respuesta útil de este endpoint
// (el banner ya decidió y ya arrancó/apagó lo que tocaba), así que un fallo de
// red o un 404 del lado de plataforma no debe bloquear ni reintentarse desde
// el navegador.
//
// ✅ YA NO ESTÁ PENDIENTE (medido 15/09/2026): `apps/plataforma` expone
// `/api/publico/correduria/consentimiento` desde el PR #2934 (14/09 15:47 CEST)
// — un GET contra él devuelve 405, o sea la ruta existe y solo acepta POST — y
// la tabla `consentimiento_registro` está creada en la Supabase compartida. Este
// reenvío ya no cae en un 404.
//
// 🚨 Y la tabla estuvo a cero por un BUG, no por falta de visitantes (medido el
// 15/09/2026). Se leyó ese cero como «todavía no ha aceptado nadie» y era falso:
// abajo se manda `acceptedCategories`, que es un ARRAY, y el receptor lo rechazaba
// con un 400 por un guard `Array.isArray`. Como este reenvío es fire-and-forget,
// el 400 moría en el `.catch()` y no se veía en ninguna parte. Lo destapó cruzar
// las dos fuentes: PostHog registraba visitas de ESE MISMO DÍA (gente aceptando el
// banner) contra una tabla de auditoría vacía. Arreglado en el receptor
// (`apps/plataforma/lib/consentimiento-categorias.ts`).
const PLATAFORMA_URL = (process.env.PLATAFORMA_URL || 'https://plataforma-ten-flame.vercel.app').replace(/\/+$/, '')

export async function POST(req: NextRequest) {
  // Un cuerpo `null` es JSON VÁLIDO, así que `req.json()` lo resuelve sin entrar
  // en el `.catch` — y desestructurar `null` lanza, devolviendo un 500 donde
  // toca un 400. Por eso se lee el cuerpo entero y se accede con `?.`.
  const cuerpo = await req.json().catch(() => null)
  const categorias = (cuerpo as { categorias?: unknown } | null)?.categorias
  if (!categorias || typeof categorias !== 'object') {
    return NextResponse.json({ error: 'categorias inválidas' }, { status: 400 })
  }

  // Fire-and-forget de verdad: no se espera el resultado del reenvío ni se
  // propaga su fallo al visitante — el registro es una prueba de auditoría,
  // nunca una condición para que el banner funcione.
  fetch(`${PLATAFORMA_URL}/api/publico/correduria/consentimiento`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'asegura-web', categorias }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Sin log del cuerpo (solo categorías booleanas, sin PII) pero tampoco hace
    // falta: un fallo aquí no es accionable en caliente, es una fila menos en
    // el registro de auditoría.
  })

  return NextResponse.json({ ok: true })
}
