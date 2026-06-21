import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET = 'cleaning-photos'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const session_id = form.get('session_id') as string
    const item_id = form.get('item_id') as string
    const slot = (form.get('slot') as string) || '1'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (!session_id || !item_id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg')
    const validExts = ['jpg', 'png', 'webp', 'heic', 'heif']
    const finalExt = validExts.includes(ext) ? ext : 'jpg'
    const path = `sessions/${session_id}/${item_id}_${slot}.${finalExt}`

    const bytes = await file.arrayBuffer()

    // Supabase Storage REST API — PUT /storage/v1/object/<bucket>/<path>
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`
    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': file.type || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: bytes,
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Storage PUT error:', resp.status, err)
      return NextResponse.json({ error: `Storage error ${resp.status}` }, { status: 500 })
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    return NextResponse.json({ url: publicUrl })
  } catch (e: any) {
    console.error('upload-photo error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
