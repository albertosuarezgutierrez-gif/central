import { NextRequest, NextResponse } from 'next/server'

/**
 * ESCUDO SUPER ADMIN
 * 
 * Todas las rutas /super* y /api/super/* requieren la cookie __super_shield.
 * Sin ella → 404 (la página parece no existir).
 * 
 * Para obtener la cookie: GET /api/super/shield?k=SUPER_ACCESS_KEY
 * Eso redirige a /super con la cookie establecida (HttpOnly, Secure, 8h).
 * 
 * /super/gate queda excluido: es el puente de impersonación que ya tiene
 * sus propios datos firmados en el hash de la URL.
 */

const SUPER_ACCESS_KEY = process.env.SUPER_ACCESS_KEY

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isSuper =
    (pathname.startsWith('/super') && !pathname.startsWith('/super/gate')) ||
    pathname.startsWith('/api/super') ||
    pathname === '/api/auth/super-pin'

  if (isSuper) {
    // Si no hay clave configurada → bloquear siempre (fail secure)
    if (!SUPER_ACCESS_KEY) {
      return new NextResponse(null, { status: 404 })
    }

    const shield = req.cookies.get('__super_shield')?.value

    if (shield !== SUPER_ACCESS_KEY) {
      // 404 en lugar de 401/403 → no revela que la ruta existe
      return new NextResponse(null, { status: 404 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/super/:path*', '/api/super/:path*', '/api/auth/super-pin'],
}
