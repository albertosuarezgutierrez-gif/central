import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// ── Google Auth (Service Account → JWT → AccessToken) ─────────────────────────
async function getGoogleAccessToken(): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_DRIVE_SA_KEY!)
  const now = Math.floor(Date.now() / 1000)

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const signingInput = `${encode(header)}.${encode(payload)}`

  const pemKey = sa.private_key
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '')

  const binaryKey = Buffer.from(keyData, 'base64')
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${Buffer.from(signature).toString('base64url')}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Error obteniendo token Google: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// ── Crear carpeta en Drive ─────────────────────────────────────────────────────
async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`Error creando carpeta: ${JSON.stringify(data)}`)
  return data.id
}

// ── Subir archivo JSON a Drive ─────────────────────────────────────────────────
async function uploadJsonToDrive(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string
): Promise<string> {
  const boundary = 'backup_multipart_boundary'
  const body =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    content +
    `\r\n--${boundary}--`

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  )
  const data = await res.json()
  if (!data.id) throw new Error(`Error subiendo archivo: ${JSON.stringify(data)}`)
  return data.id
}

// ── Handler principal ──────────────────────────────────────────────────────────
async function runBackup(req: NextRequest): Promise<NextResponse> {
  // Auth: cron interno O super_admin
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = getSession(req)
    if (!session || session.rol !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const supabase = createServerClient()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const now = new Date()
  const ts = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const fechaStr = ts.slice(0, 10) // "2026-05-19"

  // Obtener token Google
  const accessToken = await getGoogleAccessToken()

  // Crear subcarpeta con fecha
  const subFolderId = await createDriveFolder(accessToken, fechaStr, folderId)

  const backup: Record<string, unknown> = {
    exportado_en: now.toISOString(),
    version: '1.0',
  }

  const errores: string[] = []

  // ── Tablas completas ───────────────────────────────────────────────────────
  const tablasCompletas = [
    'restaurantes',
    'camareros',
    'productos',
    'producto_formatos',
    'mesas',
    'zonas',
    'secciones_cocina',
    'impresoras',
    'cuentas',
    'cobro_config',
  ]

  for (const tabla of tablasCompletas) {
    const { data, error } = await supabase.from(tabla).select('*')
    if (error) {
      errores.push(`${tabla}: ${error.message}`)
      backup[tabla] = []
    } else {
      backup[tabla] = data
    }
  }

  // ── Tablas últimos 30 días ─────────────────────────────────────────────────
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const tablasRecientes = [
    'comandas',
    'comanda_items',
    'turnos',
    'facturas_verifactu',
    'pagos',
    'transcripciones',
    'movimientos_caja',
    'ia_training_log',
  ]

  for (const tabla of tablasRecientes) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .gte('created_at', hace30dias)
      .order('created_at', { ascending: false })
    if (error) {
      errores.push(`${tabla}: ${error.message}`)
      backup[tabla] = []
    } else {
      backup[tabla] = data
    }
  }

  if (errores.length > 0) {
    backup['_errores'] = errores
  }

  // ── Subir a Drive ──────────────────────────────────────────────────────────
  const filename = `backup_iarest_${ts}.json`
  const fileId = await uploadJsonToDrive(
    accessToken,
    subFolderId,
    filename,
    JSON.stringify(backup, null, 2)
  )

  const totalTablas = tablasCompletas.length + tablasRecientes.length
  const totalRegistros = Object.values(backup)
    .filter(Array.isArray)
    .reduce((acc, arr) => acc + (arr as unknown[]).length, 0)

  console.log(`[backup/drive] OK — ${filename} — ${totalRegistros} registros — ${errores.length} errores`)

  return NextResponse.json({
    ok: true,
    archivo: filename,
    drive_id: fileId,
    carpeta_fecha: fechaStr,
    tablas_exportadas: totalTablas,
    registros_totales: totalRegistros,
    errores: errores.length > 0 ? errores : undefined,
  })
}

export async function POST(req: NextRequest) {
  try {
    return await runBackup(req)
  } catch (err: any) {
    console.error('[backup/drive] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    return await runBackup(req)
  } catch (err: any) {
    console.error('[backup/drive] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
// backup-drive v1.0 Tue May 19 07:53:55 UTC 2026
