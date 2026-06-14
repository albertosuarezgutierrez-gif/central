// /api/cron/psd2-diag — diagnóstico temporal de la conexión Enable Banking.
// Sin secretos: estructura de la clave y, con ?probar=1, una llamada real a /aspsps
// (devuelve el nº de bancos, no datos sensibles). Bajo /api/cron (público en middleware)
// para poder verificar sin sesión. Se retira cuando la conexión PSD2 quede validada.
import { NextRequest, NextResponse } from 'next/server'
import { diagnosticarClave, listarAspsps, inspeccionarSesion, inspeccionarMovimientos, disponible } from '@/lib/enablebanking'
import { sincronizarTodas } from '@/lib/psd2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const diag = diagnosticarClave()
  const sesion = req.nextUrl.searchParams.get('sesion')
  if (sesion && disponible()) {
    try { return NextResponse.json({ ...diag, sesion: await inspeccionarSesion(sesion) }) }
    catch (e) { return NextResponse.json({ ...diag, sesion: { error: e instanceof Error ? e.message : String(e) } }) }
  }
  const movs = req.nextUrl.searchParams.get('movs')
  if (movs && disponible()) {
    try { return NextResponse.json({ ...diag, movs: await inspeccionarMovimientos(movs) }) }
    catch (e) { return NextResponse.json({ ...diag, movs: { error: e instanceof Error ? e.message : String(e) } }) }
  }
  if (req.nextUrl.searchParams.get('resync') === '1' && disponible()) {
    try { return NextResponse.json({ ...diag, resync: await sincronizarTodas() }) }
    catch (e) { return NextResponse.json({ ...diag, resync: { error: e instanceof Error ? e.message : String(e) } }) }
  }
  if (req.nextUrl.searchParams.get('probar') === '1' && disponible()) {
    try {
      const a = await listarAspsps('ES')
      return NextResponse.json({ ...diag, probar: { ok: true, bancos: a.length, ejemplo: a[0]?.name ?? null } })
    } catch (e) {
      return NextResponse.json({ ...diag, probar: { ok: false, error: e instanceof Error ? e.message : String(e) } })
    }
  }
  return NextResponse.json(diag)
}
