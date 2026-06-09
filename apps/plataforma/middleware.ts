import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from './lib/auth'

const PUBLIC = ['/login', '/register', '/api/auth']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
