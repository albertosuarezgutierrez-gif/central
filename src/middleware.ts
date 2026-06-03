import { NextRequest, NextResponse } from 'next/server'

/**
 * ESCUDO SUPER ADMIN
 *
 * Las APIs /api/super/* (y /api/auth/super-pin) requieren la cookie
 * __super_shield. Sin ella → 404 (parecen no existir).
 *
 * La PÁGINA /super ya NO está bajo el escudo: muestra el login de
 * email + contraseña (/api/auth/super-login). Al validar, ese endpoint pone la
 * cookie __super_shield, de modo que las APIs siguen protegidas. Así el panel
 * es accesible desde cualquier dispositivo sin la llave secreta en la URL.
 *
 * La llave secreta (GET /api/auth/super-shield?k=SUPER_ACCESS_KEY) y el PIN
 * (/api/auth/super-pin) se mantienen como acceso de emergencia.
 */

const SUPER_ACCESS_KEY = process.env.SUPER_ACCESS_KEY

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isSuper =
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
  matcher: ['/api/super/:path*', '/api/auth/super-pin'],
}
