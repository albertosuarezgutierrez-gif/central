import { NextResponse } from 'next/server'
import { BRIDGE_VERSION, BRIDGE_EXE_URL } from '@/lib/bridge-config'

// GET /api/bridge/version
// El bridge comprueba aqui si hay una version nueva
// Para actualizar: cambiar BRIDGE_VERSION en src/lib/bridge-config.ts

export async function GET() {
  return NextResponse.json({
    version: BRIDGE_VERSION,
    url:     BRIDGE_EXE_URL,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    }
  })
}
