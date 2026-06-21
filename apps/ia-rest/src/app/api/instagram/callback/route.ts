export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  if (error) return new NextResponse(`<html><body style="background:#14110E;color:#F6F1E7;padding:40px;font-family:sans-serif"><h2>❌ Error OAuth Instagram</h2><p>${error}</p></body></html>`, { headers: { 'Content-Type': 'text/html' } })
  if (code) return new NextResponse(`<html><body style="background:#14110E;color:#F6F1E7;padding:40px;font-family:sans-serif"><h2>✅ Código recibido</h2><pre style="background:#1E1A15;padding:20px;border-radius:8px;color:#D9442B;word-break:break-all">${code}</pre></body></html>`, { headers: { 'Content-Type': 'text/html' } })
  return NextResponse.json({ ok: true })
}
