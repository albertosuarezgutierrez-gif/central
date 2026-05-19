import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── OAuth2: refresh_token → access_token ──────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  if (!refreshToken) throw new Error('GOOGLE_DRIVE_REFRESH_TOKEN no configurado. Ve a /super y autoriza Drive.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Error refresh token: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── Crear subcarpeta en Drive ──────────────────────────────────────────────────
async function createFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`Error creando carpeta: ${JSON.stringify(data)}`)
  return data.id
}

// ── Subir JSON a Drive ─────────────────────────────────────────────────────────
async function uploadJson(accessToken: string, folderId: string, filename: string, content: string): Promise<string> {
  const boundary = 'backup_boundary_iarest'
  const meta = JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/json' })
  const body =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}` +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}` +
    `\r\n--${boundary}--`

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  })
  const data = await res.json()
  if (!data.id) throw new Error(`Error subiendo archivo: ${JSON.stringify(data)}`)
  return data.id
}

// ── Auth ───────────────────────────────────────────────────────────────────────
function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  const session = getSession(req)
  return !!(session && session.rol === 'super_admin')
}

// ── Handler ────────────────────────────────────────────────────────────────────
async function runBackup(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const now = new Date()
  const ts = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const fechaStr = ts.slice(0, 10)

  const accessToken = await getAccessToken()
  const subFolderId = await createFolder(accessToken, fechaStr, folderId)

  const backup: Record<string, unknown> = { exportado_en: now.toISOString(), version: '1.0' }
  const errores: string[] = []

  // Tablas completas
  const tablasCompletas = [
    'restaurantes', 'camareros', 'productos', 'producto_formatos',
    'mesas', 'zonas', 'secciones_cocina', 'impresoras', 'cuentas', 'cobro_config',
  ]
  for (const tabla of tablasCompletas) {
    const { data, error } = await supabase.from(tabla).select('*')
    if (error) { errores.push(`${tabla}: ${error.message}`); backup[tabla] = [] }
    else backup[tabla] = data
  }

  // Tablas últimos 30 días
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const tablasRecientes = [
    'comandas', 'comanda_items', 'turnos', 'facturas_verifactu',
    'pagos', 'transcripciones', 'movimientos_caja', 'ia_training_log',
  ]
  for (const tabla of tablasRecientes) {
    const { data, error } = await supabase
      .from(tabla).select('*')
      .gte('created_at', hace30dias)
      .order('created_at', { ascending: false })
    if (error) { errores.push(`${tabla}: ${error.message}`); backup[tabla] = [] }
    else backup[tabla] = data
  }

  if (errores.length > 0) backup['_errores'] = errores

  const filename = `backup_iarest_${ts}.json`
  const fileId = await uploadJson(accessToken, subFolderId, filename, JSON.stringify(backup, null, 2))

  const totalRegistros = Object.values(backup)
    .filter(Array.isArray)
    .reduce((acc, arr) => acc + (arr as unknown[]).length, 0)

  console.log(`[backup/drive] ✅ ${filename} — ${totalRegistros} registros — ${errores.length} errores`)

  return NextResponse.json({
    ok: true,
    archivo: filename,
    drive_id: fileId,
    carpeta_fecha: fechaStr,
    tablas_exportadas: tablasCompletas.length + tablasRecientes.length,
    registros_totales: totalRegistros,
    errores: errores.length > 0 ? errores : undefined,
  })
}

export async function POST(req: NextRequest) {
  try { return await runBackup(req) }
  catch (err: any) {
    console.error('[backup/drive]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try { return await runBackup(req) }
  catch (err: any) {
    console.error('[backup/drive]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
