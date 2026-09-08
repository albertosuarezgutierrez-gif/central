import { NextResponse, type NextRequest } from 'next/server'
import { decodeJwt } from 'jose'
import { COOKIE_NAME } from '@/lib/auth-cookie'

/**
 * El único trabajo de este middleware: que la sesión del CORREDOR no escriba
 * como el cliente (08/09/2026).
 *
 * Alberto puede VER cualquier bóveda (dictado: «el corredor puede acceder a
 * cualquier cosa»), pero un parte de siniestro, una autorización o un «mis
 * datos» firmados desde su sesión quedarían registrados como declaraciones del
 * cliente — y un parte tiene plazo del art. 16 LCS. Se corta aquí, en un solo
 * sitio, y no en cada una de las veinte rutas que escriben: una ruta nueva que
 * se olvidara del veto lo tendría igual.
 *
 * 🚨 Se DECODIFICA sin verificar la firma, y es correcto: el veto protege de un
 * clic de Alberto, no de un atacante. Un token falso con `corredor` solo
 * consigue vetarse a sí mismo, y uno falso SIN `corredor` muere en
 * `getIdentidad()` como siempre. Verificar aquí exigiría el secreto en edge y
 * duplicar `verificarSesion`.
 *
 * Exentas: `/api/salir` (soltar la vista) y `/api/acceso/*` (que Alberto pueda
 * entrar como él mismo con la cookie de corredor todavía puesta).
 */
const EXENTAS = ['/api/salir', '/api/acceso/']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return NextResponse.next()
  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (EXENTAS.some((e) => pathname.startsWith(e))) return NextResponse.next()

  const cookie = req.cookies.get(COOKIE_NAME)?.value
  if (!cookie) return NextResponse.next()
  let corredor = false
  try {
    const c = decodeJwt(cookie).corredor
    corredor = typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).clienteId === 'string'
  } catch {
    corredor = false
  }
  if (!corredor) return NextResponse.next()
  return NextResponse.json(
    { error: 'modo_corredor', motivo: 'Estás viendo el portal como lo ve el cliente: aquí no se escribe en su nombre.' },
    { status: 403 },
  )
}

export const config = { matcher: '/api/:path*' }
