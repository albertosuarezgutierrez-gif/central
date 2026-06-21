import { NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { ADMIN_COOKIE } from '@/lib/superadmin'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  res.cookies.set(ADMIN_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
