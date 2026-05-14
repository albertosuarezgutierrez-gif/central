import { NextResponse } from 'next/server'

// GET /api/bridge/version
// El bridge comprueba aqui si hay una version nueva
// Para actualizar: cambiar CURRENT_VERSION y subir nuevo bridge-local.js
const CURRENT_VERSION = '4.1'

export async function GET() {
  return NextResponse.json({
    version: CURRENT_VERSION,
    url:     'https://www.iarest.es/bridge-local.js',
  }, {
    headers: {
      'Cache-Control': 'no-store',
    }
  })
}
