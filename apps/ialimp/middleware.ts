import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

const PUBLIC_PATHS = [
  '/login', '/register', '/registro', '/cotizador', '/manual', '/legal',
  '/manifest.json',
  '/api/auth', '/api/pms/sync', '/api/empresas/register',
  '/api/leads', '/api/propietario', '/propietario',
  '/api/superadmin/login', '/superadmin',
  '/api/cotizador',
  '/propuesta',
  '/presentacion',
  '/api/catastro',
  '/api/m',
  '/api/lead-saas',
]

const SUPERADMIN_PATHS = ['/superadmin', '/api/superadmin']

const MODULO_MAP: Record<string, string> = {
  '/admin/equipo':        'rrhh',
  '/admin/negocio':       'clientes',
  '/admin/materiales':    'stock',
  '/admin/configuracion': 'configuracion',
  '/admin/clientes':    'clientes',
  '/admin/rrhh':        'rrhh',
  '/admin/lenceria':    'lenceria',
  '/admin/stock':       'stock',
  '/admin/facturas':    'facturacion',
  '/admin/informes':    'informes',
  '/admin/agenda':      'agenda',
  '/admin/crm':         'clientes',
  '/admin/planes':      'configuracion',
  '/admin/cotizador':   'configuracion',
  '/admin/usuarios':    'configuracion',
  '/admin/contabilidad': 'contabilidad',
  '/admin/concursos':    'concursos',
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/limpiadoras' || pathname === '/equipo') {
    return NextResponse.redirect(new URL('/l', req.url))
  }

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return NextResponse.next()
  }

  // Rutas limpiadora — auth por PIN/cookie propia
  if (pathname === '/l' || pathname.startsWith('/l/') || pathname.startsWith('/api/l/')) {
    return NextResponse.next()
  }

  // Rutas repartidor — auth por PIN/cookie propia (igual que limpiadora)
  if (pathname === '/r' || pathname.startsWith('/r/') || pathname.startsWith('/api/r/')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('ialimp_session')?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifySessionToken(token) as any
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (SUPERADMIN_PATHS.some(p => pathname.startsWith(p))) {
    if (payload.rol !== 'superadmin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  if (payload.rol === 'superadmin') return NextResponse.next()

  const moduloRequerido = Object.entries(MODULO_MAP).find(([path]) =>
    pathname.startsWith(path)
  )?.[1]

  const modulosOff: string[] = (payload as any).modulos_off || []
  if (moduloRequerido && modulosOff.includes(moduloRequerido)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Módulo no contratado' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (payload.rol === 'owner') return NextResponse.next()

  if (moduloRequerido) {
    const modulos: string[] = payload.modulos || []
    if (!modulos.includes(moduloRequerido)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Sin permiso para este módulo' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
}
