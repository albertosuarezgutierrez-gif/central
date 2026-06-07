export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

const ROLES_SIEMPRE = ['owner', 'super_admin', 'jefe_sala']

// Normaliza fechas a ISO (YYYY-MM-DD) para que entren directas en <input type="date">.
// Acepta DD/MM/YYYY, DD.MM.YY, DD-MM-YYYY, etc. Devuelve null si no reconoce el formato.
function toISODate(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null
  const s = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
  if (!m) return null
  const d = m[1].padStart(2, '0')
  const mo = m[2].padStart(2, '0')
  const y = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${y}-${mo}-${d}`
}

const SYSTEM_PROMPT = `Eres un clasificador experto de documentos y etiquetas para restaurantes en España.
Analiza la imagen y responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown.

{
  "tipo": "cv" | "albaran" | "factura_proveedor" | "carta" | "etiqueta_producto" | "otro",
  "confianza": <número entre 0 y 1>,
  "confianza_por_campo": { "<campo>": <0-1> },
  "datos": { ...campos según tipo }
}

Campos según tipo:
- cv: { "nombre": str, "puesto": str, "email": str|null, "telefono": str|null, "experiencia_resumen": str }
- albaran: {
    "proveedor": str,
    "fecha": str|null,
    "referencia": str|null,
    "total_eur": number|null,
    "num_lineas": number,
    "productos": [{"descripcion":str,"cantidad":str,"precio_unitario":str,"codigo_barras":str|null,"fecha_caducidad":str|null}]
  }
- factura_proveedor: {
    "proveedor": str,
    "fecha": str|null,
    "numero_factura": str|null,
    "total_eur": number|null,
    "base_imponible": number|null,
    "iva_eur": number|null
  }
- carta: {
    "num_productos_detectados": number,
    "tiene_precios": boolean,
    "secciones": [str],
    "muestra_productos": [{"nombre":str,"precio":str|null}]
  }
- etiqueta_producto: {
    "nombre_producto": str,
    "codigo_barras": str|null,
    "cantidad": str|null,
    "unidad": str|null,
    "lote": str|null,
    "fecha_caducidad": str|null,
    "fecha_fabricacion": str|null,
    "proveedor": str|null,
    "temperatura_conservacion": str|null,
    "alergenos": [str]
  }
- otro: { "descripcion_breve": str }

IMPORTANTE para etiqueta_producto:
- fecha_caducidad: extraer en formato DD/MM/YYYY si aparece como "CAD:", "Consumir antes de:", "Best before:", "Fecha de caducidad:" etc.
- codigo_barras: si aparece código de barras EAN-13 o similar, extraerlo como string
- Si hay dudas entre albaran y etiqueta_producto: etiqueta es de UN solo producto, albaran lista VARIOS

IMPORTANTE confianza_por_campo:
- Incluir la confianza de extracción de cada dato clave (0=no legible, 1=perfectamente claro)
- Si un campo no se puede leer bien, ponlo a null y confianza baja

Sé preciso. Si no puedes leer bien el documento, baja la confianza. Responde SOLO el JSON.`

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  const rid      = getRestauranteId(req)

  if (!session || !rid) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let puedeEscanear = ROLES_SIEMPRE.includes(session.rol)
  if (!puedeEscanear && session.rol === 'camarero') {
    const { data: cam } = await supabase
      .from('personal')
      .select('puede_escanear')
      .eq('id', session.id)
      .eq('local_id', rid)
      .single()
    puedeEscanear = cam?.puede_escanear === true
  }
  if (!puedeEscanear) {
    return NextResponse.json({ error: 'Sin permiso para usar el escáner' }, { status: 403 })
  }

  const { imagenBase64, mediaType = 'image/jpeg', contexto } = await req.json()
  // contexto: 'recepcion' | 'general' — para saber cómo enrutar el resultado

  if (!imagenBase64 || typeof imagenBase64 !== 'string') {
    return NextResponse.json({ error: 'imagen_base64 requerido' }, { status: 400 })
  }
  if (imagenBase64.length > 5_000_000) {
    return NextResponse.json({ error: 'Imagen demasiado grande. Máx 3MB.' }, { status: 400 })
  }

  let tipoDetectado = 'otro'
  let confianza = 0
  let confianzaPorCampo: Record<string, number> = {}
  let datos: Record<string, unknown> = {}
  let nimError: string | null = null

  try {
    const raw = await callAIVision(
      SYSTEM_PROMPT,
      [{ data: imagenBase64, mediaType }],
      'Clasifica este documento o etiqueta.',
      900
    )
    const parsed = JSON.parse(cleanJSON(raw))
    tipoDetectado      = parsed.tipo               ?? 'otro'
    confianza          = parsed.confianza           ?? 0
    confianzaPorCampo  = parsed.confianza_por_campo ?? {}
    datos              = parsed.datos               ?? {}

    const tiposValidos = ['cv','albaran','factura_proveedor','carta','etiqueta_producto','otro']
    if (!tiposValidos.includes(tipoDetectado)) tipoDetectado = 'otro'
    confianza = Math.min(1, Math.max(0, Number(confianza) || 0))

  } catch (e) {
    nimError = e instanceof Error ? e.message : String(e)
    tipoDetectado = 'otro'
    datos = { descripcion_breve: 'Error al analizar — revisa manualmente' }
  }

  // Etiqueta de producto: normalizar fechas a ISO para el puente a Recepción.
  if (tipoDetectado === 'etiqueta_producto') {
    const isoCad = toISODate(datos.fecha_caducidad)
    if (isoCad) datos.fecha_caducidad = isoCad
    const isoFab = toISODate(datos.fecha_fabricacion)
    if (isoFab) datos.fecha_fabricacion = isoFab
  }

  // Campos con confianza baja (< 0.7) → marcar para revisión
  const camposARevisar = Object.entries(confianzaPorCampo)
    .filter(([, v]) => v < 0.7)
    .map(([k]) => k)

  // Guardar en BD con imagen completa (no truncada)
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
      imagen_base64:        imagenBase64.length < 200_000 ? imagenBase64 : imagenBase64.slice(0, 200_000),
      estado:               confianza >= 0.75 && camposARevisar.length === 0 ? 'ok' : 'revision',
      metadatos:            { confianza_por_campo: confianzaPorCampo, campos_a_revisar: camposARevisar, contexto: contexto ?? 'general' },
    })
    .select('id')
    .single()

  if (dbError) console.error('[scanner/clasificar] BD error:', dbError.message)

  // El puente etiqueta→stock depende de que el scan se haya persistido (necesita scan_id).
  // Si falla la persistencia de una etiqueta, no lo tragamos en silencio: forzamos revisión.
  const persistError = dbError ? dbError.message : null

  // Para albaranes: extraer productos con sus caducidades
  const productosConCaducidad = tipoDetectado === 'albaran'
    ? ((datos.productos as { descripcion?: string; cantidad?: string; precio_unitario?: string; fecha_caducidad?: string | null; codigo_barras?: string | null }[] | undefined) ?? [])
        .filter(p => p.fecha_caducidad)
        .map(p => ({ nombre: p.descripcion, fecha_caducidad: p.fecha_caducidad, codigo_barras: p.codigo_barras ?? null }))
    : []

  return NextResponse.json({
    ok: true,
    scan_id:                docGuardado?.id ?? null,
    tipo:                   tipoDetectado,
    confianza,
    confianza_pct:          Math.round(confianza * 100),
    nivel_confianza:        confianza >= 0.85 ? 'alta' : confianza >= 0.65 ? 'media' : 'baja',
    campos_a_revisar:       camposARevisar,
    requiere_revision:      camposARevisar.length > 0 || confianza < 0.75
                              || (tipoDetectado === 'etiqueta_producto' && !!persistError),
    datos,
    productos_con_caducidad: productosConCaducidad,
    nim_error:              nimError,
    persist_error:          persistError,
  })
}

export async function GET(req: NextRequest) {
  const session  = getSession(req)
  const rid      = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('documentos_escaneados')
    .select('id, tipo, confianza, estado, created_at, datos_extraidos, camareros(nombre)')
    .eq('local_id', rid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ documentos: [] })

  const documentos = (data ?? []).map((d: {
    id: string; tipo: string; confianza: number; estado: string;
    created_at: string; datos_extraidos: Record<string, unknown> | null;
    camareros: { nombre: string } | { nombre: string }[] | null
  }) => ({
    id: d.id,
    tipo: d.tipo,
    confianza: d.confianza,
    confianza_pct: Math.round((d.confianza ?? 0) * 100),
    nivel_confianza: d.confianza >= 0.85 ? 'alta' : d.confianza >= 0.65 ? 'media' : 'baja',
    estado: d.estado,
    created_at: d.created_at,
    datos: d.datos_extraidos,
    camarero_nombre: Array.isArray(d.camareros)
      ? (d.camareros[0]?.nombre ?? null)
      : (d.camareros?.nombre ?? null),
  }))

  void session
  return NextResponse.json({ documentos })
}
