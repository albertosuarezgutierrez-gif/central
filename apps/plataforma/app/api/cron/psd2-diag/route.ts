// /api/cron/psd2-diag — diagnóstico temporal de la clave privada de Enable Banking.
// Devuelve SOLO estructura (cabecera PEM, longitudes, si decodifica) — nunca el secreto.
// Está bajo /api/cron (público en el middleware) para poder verificar el pegado de la
// env var sin sesión. Se retira cuando la conexión PSD2 quede validada.
import { NextResponse } from 'next/server'
import { diagnosticarClave } from '@/lib/enablebanking'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(diagnosticarClave())
}
