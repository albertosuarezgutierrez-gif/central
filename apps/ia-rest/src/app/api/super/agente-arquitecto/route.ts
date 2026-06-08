export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createSign } from 'crypto'

// ─── Credenciales desde env vars ─────────────────────────────────────────────
const GH_PAT    = process.env.GH_PAT || ''
const GH_REPO   = 'albertosuarezgutierrez-gif/ia.rest'
const SA_EMAIL  = process.env.DRIVE_SA_EMAIL || ''
const SA_KEY    = (process.env.DRIVE_SA_KEY || '').replace(/\\n/g, '\n')

const DRIVE_DOCS: Record<string, string> = {
  master:      '1SDQ-BG0fy8XJKLszKFg282VBmfvGMogk',
  log_cambios: '1D16FFJDVdeOLWQQf1jHUuanZaFDuiJcr',
  skill:       '1hgHx25u_5HTw9rA9bk1CWKHuQR8SX3CY',
  reglas:      '1-Mr5FTRkmIxN5mNfeiUMIEuza2idZTqx',
}

// ─── Google Drive JWT Auth ────────────────────────────────────────────────────
async function getDriveToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const sig = sign.sign(SA_KEY, 'base64url')
  const jwt = `${header}.${payload}.${sig}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  return data.access_token
}

// ─── Herramientas ─────────────────────────────────────────────────────────────
async function readGithubFile(path: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_PAT}`, Accept: 'application/vnd.github.v3.raw' } }
  )
  if (!res.ok) return `Error ${res.status}: ${path} no encontrado`
  const text = await res.text()
  return text.length > 3000 ? text.slice(0, 3000) + '\n...[truncado]' : text
}

async function listGithubDir(path: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_PAT}` } }
  )
  if (!res.ok) return `Error: directorio ${path} no encontrado`
  const items: any[] = await res.json()
  return items.map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n')
}

async function readDriveDoc(docId: string): Promise<string> {
  try {
    const token = await getDriveToken()
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return `Error leyendo doc ${docId}`
    const text = await res.text()
    return text.length > 4000 ? text.slice(0, 4000) + '\n...[truncado]' : text
  } catch (e: any) { return `Error Drive: ${e.message}` }
}

async function updateDriveDoc(docId: string, content: string): Promise<string> {
  try {
    const token = await getDriveToken()
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?fields=name`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const meta = await metaRes.json()
    const boundary = 'arquibot_boundary'
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8', '',
      JSON.stringify({ name: meta.name }),
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8', '',
      content,
      `--${boundary}--`,
    ].join('\r\n')
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${docId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      }
    )
    if (!res.ok) return `Error actualizando: ${await res.text()}`
    return `✅ Doc "${meta.name}" actualizado`
  } catch (e: any) { return `Error Drive: ${e.message}` }
}

async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'read_github_file': return readGithubFile(input.path)
    case 'list_github_dir':  return listGithubDir(input.path)
    case 'read_drive_doc':   return readDriveDoc(DRIVE_DOCS[input.doc])
    case 'update_drive_doc': return updateDriveDoc(DRIVE_DOCS[input.doc], input.content)
    default: return `Herramienta desconocida: ${name}`
  }
}

// ─── Tools para Anthropic ─────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'read_github_file',
    description: 'Lee el contenido de un archivo del repositorio ia.rest en GitHub.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Ruta desde la raíz. Ej: src/lib/ai-client.ts' } }, required: ['path'] }
  },
  {
    name: 'list_github_dir',
    description: 'Lista el contenido de un directorio del repositorio ia.rest.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Ruta del directorio. Ej: src/app/api, src/components' } }, required: ['path'] }
  },
  {
    name: 'read_drive_doc',
    description: 'Lee un documento de Google Drive del proyecto ia.rest.',
    input_schema: { type: 'object', properties: { doc: { type: 'string', enum: ['master', 'log_cambios', 'skill', 'reglas'] } }, required: ['doc'] }
  },
  {
    name: 'update_drive_doc',
    description: 'Actualiza el contenido de un documento de Drive. SOLO usar con aprobación explícita del usuario.',
    input_schema: { type: 'object', properties: { doc: { type: 'string', enum: ['master', 'log_cambios', 'skill', 'reglas'] }, content: { type: 'string' } }, required: ['doc', 'content'] }
  },
]

const SYSTEM = `Eres el Agente Arquitecto de ia.rest — Voice POS SaaS para hostelería española.

CAPACIDADES: Leer repo GitHub, leer/escribir docs Drive, analizar código real.

MODO ANALIZAR — cuando el usuario pide análisis:
Lee los archivos relevantes y presenta propuestas con este formato exacto:
---PROPUESTA---
tipo: [optimizacion_tokens|refactor|doc_update|patron_codigo]
archivo: [ruta o nombre doc]
problema: [qué está mal]
cambio_propuesto: [qué hacer exactamente]
impacto: [alto|medio|bajo]
tokens_ahorro: [estimación si aplica, sino omitir]
---FIN---

MODO APLICAR — cuando el usuario aprueba una propuesta:
Ejecuta exactamente lo aprobado. Para docs Drive: usa update_drive_doc.
Para código: muestra el código completo listo para copiar — NO hagas push.

REGLAS:
- NUNCA update_drive_doc sin aprobación explícita
- NUNCA proponer push a GitHub
- Máximo 4 herramientas por turno para no saturar contexto
- Sé concreto, técnico, en español`

// ─── Endpoint ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  const AVISO_ANTHROPIC = '⚠️ Esta función usa búsqueda web/herramientas vía Anthropic, que ahora mismo no está disponible (sin crédito). El resto del panel funciona con normalidad.'
  if (!apiKey) return NextResponse.json({ error: AVISO_ANTHROPIC }, { status: 500 })

  try {
    const { messages } = await req.json()
    const toolLog: { tool: string; input: any; result: string }[] = []
    let currentMessages = messages.map((m: any) => ({ role: m.role, content: m.content }))
    let finalText = ''
    let iterations = 0

    while (iterations < 8) {
      iterations++
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system: SYSTEM, tools: TOOLS, messages: currentMessages }),
      })
      const data = await res.json()
      if (!data.content) { finalText = 'Error: respuesta vacía'; break }

      const textBlocks = data.content.filter((b: any) => b.type === 'text')
      if (textBlocks.length > 0) finalText = textBlocks.map((b: any) => b.text).join('')
      if (data.stop_reason === 'end_turn') break

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        currentMessages = [...currentMessages, { role: 'assistant', content: data.content }]
        const results = await Promise.all(
          toolUses.map(async (tu: any) => {
            const result = await executeTool(tu.name, tu.input)
            toolLog.push({ tool: tu.name, input: tu.input, result: result.slice(0, 200) })
            return { type: 'tool_result', tool_use_id: tu.id, content: result }
          })
        )
        currentMessages = [...currentMessages, { role: 'user', content: results }]
        continue
      }
      break
    }

    return NextResponse.json({ text: finalText || 'Sin respuesta.', toolLog })
  } catch (err: any) {
    const m = String(err?.message || err)
    const sinSaldo = /credit balance|too low|insufficient|x-api-key|authentication|\b401\b|\b403\b/i.test(m)
    return NextResponse.json({ error: sinSaldo ? AVISO_ANTHROPIC : m }, { status: 500 })
  }
}
