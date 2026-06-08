import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const LIMPIADORA_PAGE_PATHS = ['/limpiadoras']
const LIMPIADORA_API_PREFIX = '/api/limpiadoras'
const ADMIN_LIMPIADORA_API_PREFIX = '/api/admin/limpiadoras'

// Rutas totalmente públicas (se evalúan DENTRO del wrapper auth)
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/_next',
  '/favicon',
  '/icons',
  '/manifest.json',
  '/sw.js',
  '/api/limpiadoras/auth',
  '/limpiadoras/login',
  '/robots.txt',
  '/sitemap.xml',
]

// NextAuth v5: usar `auth` como wrapper del middleware
export default auth(function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl
  const session = req.auth

  // 1. Rutas totalmente públicas
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 2. APIs admin limpiadoras → solo NextAuth
  if (pathname.startsWith(ADMIN_LIMPIADORA_API_PREFIX)) {
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    return NextResponse.next()
  }

  // 3. APIs limpiadoras → cookie limpiadora_token OR NextAuth
  if (pathname.startsWith(LIMPIADORA_API_PREFIX)) {
    const limpToken = req.cookies.get('limpiadora_token')?.value
    if (limpToken) return NextResponse.next()
    if (session) return NextResponse.next()
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 4. Zona limpiadoras (páginas)
  if (LIMPIADORA_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    if (session) return NextResponse.redirect(new URL('/dashboard', req.url))
    const limpToken = req.cookies.get('limpiadora_token')?.value
    if (!limpToken) return NextResponse.redirect(new URL('/limpiadoras/login', req.url))
    return NextResponse.next()
  }

  // 5. Raíz
  if (pathname === '/') {
    if (session) return NextResponse.redirect(new URL('/dashboard', req.url))
    const limpToken = req.cookies.get('limpiadora_token')?.value
    if (limpToken) return NextResponse.redirect(new URL('/limpiadoras', req.url))
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 6. Zona admin — requiere NextAuth session
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Crons Vercel excluidos del matcher — NO pasan por el middleware
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|robots.txt|sitemap.xml|api/rates/snapshot|api/updates/sync|api/limpiadoras/auto-sessions|api/mensajes/auto-reply|api/mercado/cron).*)',
  ],
}
