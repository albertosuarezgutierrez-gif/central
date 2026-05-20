import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

// Roles que siempre pueden escanear sin toggle
const ROLES_SIEMPRE = ['owner', 'super_admin', 'jefe_sala']

const SYSTEM_PROMPT = `Eres un clasificador experto de documentos para restaurantes en España.
Analiza la imagen y responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin comillas adicionales, sin markdown.
El JSON debe tener exactamente esta estructura:

{
  "tipo": "cv" | "albaran" | "factura_proveedor" | "carta" | "otro",
  "confianza": <número entre 0 y 1>,
  "datos": {
    ...campos según tipo (ver abajo)
  }
}

Campos según tipo:
- cv: { "nombre": str, "puesto": str, "email": str|null, "telefono": str|null, "experiencia_resumen": str }
- albaran: { "proveedor": str, "fecha": str|null, "referencia": str|null, "total_eur": number|null, "num_lineas": number, "productos": [{"descripcion":str,"cantidad":str,"precio_unitario":str}] }
- factura_proveedor: { "proveedor": str, "fecha": str|null, "numero_factura": str|null, "total_eur": number|null, "base_imponible": number|null, "iva_eur": number|null }
- carta: { "num_productos_detectados": number, "tiene_precios": boolean, "secciones": [str], "muestra_productos": [{"nombre":str,"precio":str|null}] }
- otro: { "descripcion_breve": str }

Sé preciso. Si no puedes leer bien el documento, baja la confianza. Responde SOLO el JSON.`

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  const rid      = getRestauranteId(req)

  if (!session || !rid) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // ── Verificar permiso de escáner ────────────────────────────────────────
  let puedeEscanear = ROLES_SIEMPRE.includes(session.rol)

  if (!puedeEscanear && session.rol === 'camarero') {
    const { data: cam } = await supabase
      .from('camareros')
      .select('puede_escanear')
      .eq('id', session.id)
      .eq('restaurante_id', rid)
      .single()
    puedeEscanear = cam?.puede_escanear === true
  }

  if (!puedeEscanear) {
    return NextResponse.json({ error: 'Sin permiso para usar el escáner' }, { status: 403 })
  }

  // ── Leer imagen ─────────────────────────────────────────────────────────
  const { imagenBase64, mediaType = 'image/jpeg' } = await req.json()

  if (!imagenBase64 || typeof imagenBase64 !== 'string') {
    return NextResponse.json({ error: 'imagen_base64 requerido' }, { status: 400 })
  }

  // Validar tamaño razonable (máx ~4MB base64 ≈ 3MB imagen)
  if (imagenBase64.length > 5_000_000) {
    return NextResponse.json({ error: 'Imagen demasiado grande. Máx 3MB.' }, { status: 400 })
  }

  // ── Llamada NIM Vision ──────────────────────────────────────────────────
  let tipoDetectado: string = 'otro'
  let confianza = 0
  let datos: Record<string, unknown> = {}
  let nimError: string | null = null

  try {
    const raw = await callAIVision(
      SYSTEM_PROMPT,
      [{ data: imagenBase64, mediaType }],
      'Clasifica este documento.',
      800
    )

    const parsed = JSON.parse(cleanJSON(raw))
    tipoDetectado = parsed.tipo    ?? 'otro'
    confianza     = parsed.confianza ?? 0
    datos         = parsed.datos   ?? {}

    // Normalizar tipo
    if (!['cv','albaran','factura_proveedor','carta','otro'].includes(tipoDetectado)) {
      tipoDetectado = 'otro'
    }
    confianza = Math.min(1, Math.max(0, Number(confianza) || 0))

  } catch (e) {
    nimError = e instanceof Error ? e.message : String(e)
    tipoDetectado = 'otro'
    datos = { descripcion_breve: 'Error al analizar — revisa manualmente' }
  }

  // ── Guardar en BD (audit log) ────────────────────────────────────────────
  const { data: docGuardado, error: dbError } = await supabase
    .from('documentos_escaneados')
    .insert({
      restaurante_id:       rid,
      escaneado_por_id:     ROLES_SIEMPRE.includes(session.rol) ? null : session.id,
      escaneado_por_nombre: session.nombre,
      escaneado_por_rol:    session.rol,
      tipo:                 tipoDetectado,
      confianza,
      datos_extraidos:      datos,
      // Guardamos thumbnail en b64 truncado (max 100KB) para historial
      imagen_base64:        imagenBase64.length < 100_000 ? imagenBase64 : imagenBase64.slice(0, 100_000),
      estado:               'pendiente',
    })
    .select('id')
    .single()

  if (dbError) {
    console.error('[scanner/clasificar] BD error:', dbError.message)
  }

  return NextResponse.json({
    ok: true,
    scan_id:   docGuardado?.id ?? null,
    tipo:      tipoDetectado,
    confianza,
    datos,
    nim_error: nimError,
  })
}

export async function GET(req: NextRequest) {
  const session  = getSession(req)
  const rid      = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('documentos_escaneados')
    .select('id, tipo, confianza, estado, created_at, datos, camareros(nombre)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ documentos: [] })

  const documentos = (data ?? []).map((d: {
    id: string; tipo: string; confianza: number; estado: string;
    created_at: string; datos: Record<string, unknown> | null;
    camareros: { nombre: string } | null
  }) => ({
    id: d.id,
    tipo: d.tipo,
    confianza: d.confianza,
    estado: d.estado,
    created_at: d.created_at,
    datos: d.datos,
    camarero_nombre: d.camareros?.nombre ?? null,
  }))

  void session // auth verificada por middleware
  return NextResponse.json({ documentos })
}
