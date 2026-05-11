import { NextResponse } from 'next/server'

// Redirige a la última versión del APK en GitHub Releases
// URL corporativa: https://www.iarest.es/app
export async function GET() {
  return NextResponse.redirect(
    'https://github.com/albertosuarezgutierrez-gif/ia.rest/releases/download/android-v1.0/iarest.apk',
    { status: 302 }
  )
}
