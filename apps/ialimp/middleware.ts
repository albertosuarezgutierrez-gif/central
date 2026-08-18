import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

// ── Registro de actividad (historial del god-panel de plataforma) ────
// Emite fire-and-forget a /api/interno/actividad (Bearer CRON_SECRET) las
// navegaciones de página y las acciones de escritura de usuarios logueados.
// La identidad del admin viaja ya decodificada; limpiadora/propietario van
// por su token de cookie y los resuelve el endpoint. Nunca añade latencia
// (waitUntil) ni puede romper la petición.
const ACTIVIDAD_EXCLUIDAS = ['/api/interno', '/api/auth', '/api/l/auth', '/api/propietario/auth', '/api/l/photo']

function logActividad(
  req: NextRequest,
  event: NextFetchEvent,
  actor?: { tipo: string; id: string | null; empresa_id: string | null; nombre: string | null },
) {
  const secret = process.env.CRON_SECRET
  if (!secret) return
  const { pathname } = req.nextUrl
  if (pathname.includes('.') || ACTIVIDAD_EXCLUIDAS.some(p => pathname.startsWith(p))) return

  const metodo = req.method
  // Navegación de página: carga completa o navegación cliente (RSC) no-prefetch.
  const esNavegacion = !pathname.startsWith('/api/') && metodo === 'GET' &&
    (req.headers.get('sec-fetch-dest') === 'document' ||
     (req.headers.get('rsc') === '1' && !req.headers.get('next-router-prefetch')))
  // Acción: cualquier escritura contra la API.
  const esAccion = pathname.startsWith('/api/') && metodo !== 'GET' && metodo !== 'HEAD'
  if (!esNavegacion && !esAccion) return

  event.waitUntil(
    fetch(new URL('/api/interno/actividad', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        ruta: pathname,
        metodo,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: req.headers.get('user-agent'),
        actor: actor || null,
        limpiadora_token: actor ? null : (req.cookies.get('limpiadora_token')?.value || null),
        prop_token: actor ? null : (req.cookies.get('ialimp_prop')?.value || null),
      }),
    }).catch(() => {}),
  )
}

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

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  if (pathname === '/limpiadoras' || pathname === '/equipo') {
    return NextResponse.redirect(new URL('/l', req.url))
  }

  // El portal del propietario es público (por token/cookie propia), pero si hay
  // sesión de propietario se registra su actividad igual que la del resto.
  if ((pathname.startsWith('/propietario') || pathname.startsWith('/api/propietario')) &&
      req.cookies.get('ialimp_prop')) {
    logActividad(req, event)
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
    if (req.cookies.get('limpiadora_token')) logActividad(req, event)
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

  // Actividad del panel (owner/usuario de empresa). El superadmin (Alberto) no se registra.
  if (payload.rol !== 'superadmin' && !SUPERADMIN_PATHS.some(p => pathname.startsWith(p))) {
    logActividad(req, event, {
      tipo: payload.type === 'usuario' ? 'usuario' : 'owner',
      id: (payload.usuario_id || payload.empresa_id || null) as string | null,
      empresa_id: (payload.empresa_id || null) as string | null,
      nombre: (payload.email || null) as string | null,
    })
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
