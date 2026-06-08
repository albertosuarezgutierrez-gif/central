import { NextResponse } from 'next/server'

// Utility: generar claves VAPID nuevas para configurar en Vercel
// GET /api/admin/vapid-keys → devuelve un par de claves nuevas (solo en dev/preview)
export async function GET() {
  // Solo disponible si no hay claves configuradas (onboarding)
  if (process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({
      error: 'VAPID ya configurado',
      public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    }, { status: 409 })
  }

  try {
    const webpush = (await import('web-push')).default
    const keys = webpush.generateVAPIDKeys()
    return NextResponse.json({
      instrucciones: 'Copia estos valores como variables de entorno en Vercel',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      nota: 'El VAPID_PRIVATE_KEY es SENSIBLE — márcalo como Sensitive en Vercel'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
