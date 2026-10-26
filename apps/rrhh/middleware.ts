import { NextResponse, type NextRequest } from 'next/server'
import { destinoCanonico } from '@/lib/host-canonico'

// Portal del Empleado: en producción solo se usa desde empleados.grupoasegura.es.
export function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const destino = destinoCanonico(process.env.VERCEL_ENV, host, req.nextUrl.pathname, req.nextUrl.search)
  if (destino) return NextResponse.redirect(destino, 308)
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/|api/).*)'] }
