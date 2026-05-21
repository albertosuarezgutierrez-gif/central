export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { transcribir } from '@/lib/ear'
import { routearComanda } from '@/lib/brain-router'
import { crearPrintJobs, crearPrintJobCuenta } from '@/lib/courier'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { azureDisponible, verificarAzure } from '@/lib/azure-speaker'

// ── Cache de idempotencia en memoria (dura hasta redeploy) ──────────────
// Protege contra peticiones duplicadas que lleguen en ráfaga (red lenta + reintento)
// NOTA: en entornos serverless multi-instancia esta cache no se comparte entre lambdas.
// Para idempotencia total se necesitaría persistir en Supabase (pendiente migración).
const recentRecordings = new Map<string, { ts: number; result: object }>()
const IDEMPOTENCY_TTL_MS = 30_000 // 30s

// ── Cache de prompt Whisper por restaurante (5 min) ─────────────────────
// Evita hit a BD en cada comanda. El prompt incluye nombres de carta + vocabulario hostelero.
const whisperPromptCache = new Map<string, { ts: number; prompt: string }>()
const PROMPT_CACHE_TTL_MS = 5 * 60_000 // 5 min

async function buildWhisperPrompt(restauranteId: string, supabase: ReturnType<typeof createServerClient>): Promise<string> {
  const cached = whisperPromptCache.get(restauranteId)
  if (cached && Date.now() - cached.ts < PROMPT_CACHE_TTL_MS) return cached.prompt

  const [{ data: productos }, { data: personal }, { data: secciones }] = await Promise.all([
    supabase
      .from('productos')
      .select('nombre, nombre_alternativo')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .limit(60),
    supabase
      .from('camareros')
      .select('nombre')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .limit(20),
    supabase
      .from('secciones_cocina')
      .select('nombre')
      .eq('restaurante_id', restauranteId)
      .eq('activa', true)
      .limit(10),
  ])

  // Priorizar productos con motes (aliases) — ayudan más a Whisper
  const sorted = [...(productos ?? [])].sort((a, b) => {
    const aHas = Array.isArray(a.nombre_alternativo) && a.nombre_alternativo.length > 0
    const bHas = Array.isArray(b.nombre_alternativo) && b.nombre_alternativo.length > 0
    return (bHas ? 1 : 0) - (aHas ? 1 : 0)
  })
  // Formato: "Nombre canónico/mote1/mote2" para que Whisper conozca ambas formas
  const nombres = sorted.map(p => {
    const motes = Array.isArray(p.nombre_alternativo) ? p.nombre_alternativo.filter(Boolean) : []
    return motes.length > 0 ? `${p.nombre}/${motes.join('/')}` : p.nombre
  }).join(', ')
  const vocab   = 'mesa, caña, cerveza, vino, agua, tónica, marchar, cuenta, 86, ración, media ración, sin gluten, sin sal, muy hecho, poco hecho, mensaje a cocina, avisa a barra'
  const vinoVocab = 'Ribera del Duero, Rioja, Albariño, Rueda, Priorat, Rías Baixas, Jerez, Cava, Verdejo, Mencía, Monastrell, Tempranillo, Garnacha, copa de tinto, botella de blanco, media botella, vino de la casa, crianza, reserva, gran reserva, rosado, espumoso, champán, Vega Sicilia, Torres, Marqués de Riscal, Marqués de Murrieta, Protos, Pesquera, Abadía Retuerta, tinto de la casa, blanco de la casa'
  const personalNombres = (personal ?? []).map((c: { nombre: string }) => c.nombre.split(' ')[0]).join(', ')
  const seccionNombres = (secciones ?? []).map((s: { nombre: string }) => s.nombre).join(', ')
  const promptFull = [
    nombres ? `Carta: ${nombres}.` : '',
    `Vocabulario hostelero: ${vocab}.`,
    `Vinos y D.O. españolas: ${vinoVocab}.`,
    personalNombres ? `Personal: ${personalNombres}.` : '',
    seccionNombres ? `Secciones cocina: ${seccionNombres}.` : '',
  ].filter(Boolean).join(' ')

  // Groq Whisper tiene un límite de 224 tokens (~800 chars) para el campo prompt.
  // Si se supera → 400 Bad Request. Truncamos a 800 chars con margen de seguridad.
  const MAX_PROMPT_CHARS = 800
  const prompt = promptFull.length > MAX_PROMPT_CHARS
    ? promptFull.substring(0, MAX_PROMPT_CHARS)
    : promptFull

  if (promptFull.length > MAX_PROMPT_CHARS) {
    console.warn(`[WHISPER PROMPT] truncado ${promptFull.length} → ${MAX_PROMPT_CHARS} chars (restaurante ${restauranteId})`)
  }

  whisperPromptCache.set(restauranteId, { ts: Date.now(), prompt })
  return prompt
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    // Bug-fix: validar sesión explícitamente — getRestauranteId hace fallback al demo
    // si la sesión está rota, lo que crearía comandas sin restaurante_id real.
    const session = getSession(req)
    if (!session) {
      return NextResponse.json({ error: 'Sesión inválida — vuelve a iniciar sesión' }, { status: 401 })
    }

    const formData = await req.formData()
    const audio = formData.get('audio') as Blob
    const camareroId = formData.get('camarero_id') as string
    const turnoId = formData.get('turno_id') as string
    const recordingId    = formData.get('recording_id') as string | null  // idempotency key
    const pendingItemsRaw = formData.get('pending_items') as string | null  // flujo conversacional
    const pendingContext  = formData.get('pending_context') as string | null  // flujo clarificacion
    // voiceConfirm=ON → frontend envía require_confirm=true → no crear print_jobs hasta /confirmar
    const requireConfirm  = formData.get('require_confirm') === 'true'
    if (!audio || !camareroId || !turnoId)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

    // ── Seguridad: camarero_id debe coincidir con la sesión autenticada ──────
    // Evita que un camarero envíe comandas con el ID de otro camarero.
    if (camareroId !== session.id) {
      console.warn('[TRANSCRIBE] camarero_id mismatch:', camareroId, '!= session.id:', session.id)
      return NextResponse.json({ error: 'Sesión inválida — recarga la app' }, { status: 403 })
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Idempotencia: si ya procesamos esta grabacion, devolver resultado cacheado ──
    // Capa 1: cache en memoria (instantáneo, misma instancia serverless)
    // Capa 2: BD Supabase (cross-instancia — evita duplicados en Vercel multi-lambda)
    if (recordingId) {
      const cached = recentRecordings.get(recordingId)
      if (cached && Date.now() - cached.ts < IDEMPOTENCY_TTL_MS) {
        return NextResponse.json(cached.result)
      }
      for (const [k, v] of recentRecordings) {
        if (Date.now() - v.ts > IDEMPOTENCY_TTL_MS) recentRecordings.delete(k)
      }
      // Capa 2: lookup en BD para instancias distintas
      const supabaseIdem = createServerClient()
      const { data: txExistente } = await supabaseIdem
        .from('transcripciones')
        .select('id')
        .eq('recording_id', recordingId)
        .maybeSingle()
      if (txExistente) {
        return NextResponse.json({ ok: true, texto: '', brain: null, comanda_id: null,
          latencia_ms: 0, aviso_ruido: false, alertas_86: [], alertas_alergenos: [],
          _idempotente: true })
      }
    }

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    // ── VOICE PROFILE + DETECCIÓN DE RUIDO ─────────────────────────────────
    // Dos capas de calidad:
    //   1. Whisper (siempre): no_speech_prob + avg_logprob — detecta ruido sin Azure
    //   2. Azure Speaker Recognition (si configurado): verifica que es la voz del camarero
    //
    // Nunca bloquea la comanda. Si hay baja calidad → devuelve aviso_ruido:true
    // para que el camarero revise antes de confirmar.
    let speakerMatch: number | null = null

    // Capa 2: Azure speaker verification (paralela a la transcripción)
    const speakerPromise: Promise<void> = azureDisponible()
      ? Promise.resolve(
          supabase
            .from('voice_profiles')
            .select('azure_profile_id, estado')
            .eq('camarero_id', camareroId)
            .eq('estado', 'activo')
            .maybeSingle()
        ).then(async ({ data: vp }) => {
            if (!vp?.azure_profile_id) return
            speakerMatch = await verificarAzure(vp.azure_profile_id, audio)
            if (speakerMatch !== null) {
              supabase.from('voice_profiles').update({
                ultimo_score:    speakerMatch,
                ultimo_score_at: new Date().toISOString(),
              }).eq('camarero_id', camareroId).then(() => {})
            }
          }).catch(() => { /* no bloquear */ })
      : Promise.resolve()

    // Capa 1: Whisper con verbose_json → métricas de calidad de audio
    // El prompt con la carta mejora el reconocimiento en entornos ruidosos
    const [whisperPrompt, restauranteData] = await Promise.all([
      buildWhisperPrompt(rid, supabase).catch(() => undefined),
      supabase.from('restaurantes').select('idioma_whisper').eq('id', rid).maybeSingle(),
    ])
    const idiomaWhisper = (restauranteData.data as { idioma_whisper?: string } | null)?.idioma_whisper ?? 'es'
    const [{ texto: textoRaw, latencia_ms: latenciaEar, no_speech_prob, avg_logprob }] =
      await Promise.all([transcribir(audio, whisperPrompt, idiomaWhisper), speakerPromise])

    // ── Calcular aviso de ruido/baja confianza — 4 capas ────────────────────
    //
    // Capa A — métricas Whisper verbose_json (disponibles con OpenAI; Groq turbo las omite)
    const esRuidoMetricas =
      (no_speech_prob !== null && no_speech_prob > 0.55) ||
      (avg_logprob    !== null && avg_logprob    < -1.0)
    //
    // Capa B — alucinaciones conocidas de Whisper en español
    // (Whisper genera estas frases cuando graba ruido/silencio, muy bien documentado)
    const ALUCINACIONES = [
      // Alucinaciones clásicas de Whisper con ruido
      'gracias', 'suscríbete', 'hasta pronto', 'hasta la próxima',
      'subtítulos', 'muchas gracias', 'de nada', 'bye', 'thank you', 'thanks', 'you',
      // Alucinaciones en entorno hostelero ruidoso (detectadas en producción)
      'tetris', 'patris', 'matrix', 'felix', 'paris',  // palabras cortas inventadas
      'sí', 'no', 'ok', 'eh', 'ah', 'um', 'mm',       // respuestas monosilábicas de fondo
      'música', 'musica', 'audio', 'sonido',            // meta-alucinaciones
      'hola', 'adios', 'adiós',                         // saludos sin contexto de comanda
    ]
    const textoNorm = textoRaw.trim().toLowerCase().replace(/[.!?,¡¿]/g, '').trim()
    const esAlucinacion = ALUCINACIONES.some(a => textoNorm === a || textoNorm.startsWith(a + ' '))
    //
    // Capa C — texto demasiado corto sin items (grabación cortada o ruido)
    // Subido de 4 a 6 chars: "Tetris" (6 chars) también se filtra
    const esTextoVacio = textoRaw.trim().length < 6
    //
    // Capa D — Azure speaker match bajo (voz no coincide con el perfil)
    const esSpeakerBajo = speakerMatch !== null && speakerMatch < 0.40
    //
    // Capa E — texto sin ningún token hostelero reconocible + muy corto
    // Captura palabras sueltas inventadas que no son alucinaciones conocidas
    const TOKENS_HOSTELEROS = ['mesa', 'terraza', 'barra', 'salon', 'caña', 'café', 'cafe',
      'agua', 'vino', 'cerveza', 'cuenta', 'marchar', 'nota', 'una', 'dos', 'tres',
      'cuatro', 'cinco', 'tapa', 'media', 'racion', 'comanda', 'para', 'con', 'sin']
    const palabrasTexto = textoNorm.split(/\s+/).filter(Boolean)
    const esTokenSueltoSinContexto = palabrasTexto.length === 1 &&
      textoNorm.length < 10 &&
      !TOKENS_HOSTELEROS.some(t => textoNorm.includes(t))
    //
    const avisoRuido = esRuidoMetricas || esAlucinacion || esTextoVacio || esSpeakerBajo || esTokenSueltoSinContexto
    // ────────────────────────────────────────────────────────────────────────
    // Si hay contexto previo de clarificación, se lo pasamos a BRAIN para que resuelva
    const texto = pendingContext
      ? `${pendingContext} → respuesta: ${textoRaw}`
      : textoRaw
    const brainResult = await routearComanda(texto, rid, turnoId || undefined, camareroId || undefined)

    // Guardia: asegurar que items siempre es array (defensa en profundidad)
    if (!Array.isArray(brainResult.items)) brainResult.items = []

    // Flujo conversacional: si hay items pendientes de grabación anterior
    // (camarero dijo items pero no la mesa), esta grabación es solo la mesa
    if (pendingItemsRaw) {
      try {
        const prevItems = JSON.parse(pendingItemsRaw)
        if (brainResult.items.length === 0 && prevItems.length > 0) {
          brainResult.items = prevItems
        }
      } catch { /* ignorar */ }
    }

    // ── CHEQUEO 86: antes de insertar, detectar items agotados ──────────────
    let alertas86: string[] = []
    if (brainResult.items.length > 0 && brainResult.tipo !== '86') {
      const { data: activos86 } = await supabase
        .from('productos_86')
        .select('nombre')
        .eq('turno_id', turnoId)
        .eq('restaurante_id', rid)
      if (activos86?.length) {
        const nombres86 = activos86.map(p => p.nombre.toLowerCase())
        alertas86 = brainResult.items
          .filter(it => nombres86.includes(it.nombre.toLowerCase()))
          .map(it => it.nombre)
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── LOOKUP DE MESA: robusto en 2 pasos ──────────────────────────────────
    // EU Reglamento 1169/2011 — 14 alérgenos de declaración obligatoria
    let alertasAlergenos: { producto: string; alergenos: string[] }[] = []

    // Paso 1: buscar por codigo exacto (T04, P02, B01…)
    let { data: mesa } = await supabase.from('mesas')
      .select('id, codigo, estado, alergenos_mesa, numero, zona, zona_id, zonas(nombre)')
      .eq('codigo', brainResult.mesa)
      .eq('restaurante_id', rid)
      .maybeSingle()

    // Paso 2: fallback por numero extraído del codigo BRAIN
    // Cubre casos donde el prompt devuelve código con prefijo distinto al de la BD
    if (!mesa && brainResult.mesa) {
      const num = parseInt((brainResult.mesa).replace(/[^0-9]/g, ''))
      if (num > 0) {
        const prefix = (brainResult.mesa).match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()
        // Mapa de prefijos a zonas según la BD real
        const prefixToZona: Record<string, string> = { S: "salon", T: "terraza", B: "barra", M: "salon" }
        const zonaHint = prefix ? prefixToZona[prefix] : null

        const { data: candidatas } = await supabase.from('mesas')
          .select('id, codigo, estado, alergenos_mesa, numero, zona, zona_id, zonas(nombre)')
          .eq('restaurante_id', rid)
          .eq('numero', num)

        if (candidatas?.length === 1) {
          mesa = candidatas[0]
          console.log(`[TRANSCRIBE] mesa fallback by numero: ${brainResult.mesa} → ${mesa.codigo}`)
        } else if (candidatas && candidatas.length > 1) {
          // Intentar discriminar por zona inferida del prefijo
          const candidataZona = zonaHint
            ? candidatas.find(m => (m as any).zona === zonaHint)
            : null
          // Sin zona clara, preferir salón (la más común sin prefijo)
          mesa = candidataZona ?? candidatas.find(m => (m as any).zona === 'salon') ?? candidatas[0]
          console.log(`[TRANSCRIBE] mesa fallback ambigua: ${brainResult.mesa} → ${mesa?.codigo} (zona ${mesa?.zona})`)
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (mesa?.alergenos_mesa?.length && brainResult.items.length > 0) {
      const alergenosMesa: string[] = mesa.alergenos_mesa
      const nombresItems = brainResult.items.map(it => it.nombre)
      const { data: productosConAlergenos } = await supabase
        .from('productos')
        .select('nombre, alergenos')
        .in('nombre', nombresItems)
        .eq('restaurante_id', rid)
        .not('alergenos', 'is', null)
      if (productosConAlergenos?.length) {
        for (const prod of productosConAlergenos) {
          if (!prod.alergenos?.length) continue
          const conflicto = (prod.alergenos as string[]).filter(a =>
            alergenosMesa.some(am => am.toLowerCase() === a.toLowerCase())
          )
          if (conflicto.length > 0) {
            alertasAlergenos.push({ producto: prod.nombre, alergenos: conflicto })
          }
        }
      }
    }

    let comandaId: string | null = null
    if (mesa) {
      // ── Para 'cuenta': buscar comanda activa existente (NO insertar nueva vacía)
      // Si insertamos nueva, los items están vacíos → ticket sin productos → total €0,00
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let comanda: any = null
      if (brainResult.tipo === 'cuenta') {
        // FIX: buscar la comanda MÁS RECIENTE que tenga al menos un item (inner join)
        // Evita marcar como cuenta_pedida comandas vacías creadas por asignar-rapida u otros flows
        const { data: existente } = await supabase.from('comandas')
          .select('*, comanda_items!inner(id)')
          .eq('mesa_id', mesa.id)
          .eq('restaurante_id', rid)
          .in('estado', ['en_cocina', 'marchar', 'nueva', 'pendiente_confirmacion'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        comanda = existente ?? null
        if (comanda) comandaId = comanda.id
      } else {
        // requireConfirm=true → comanda nace en 'pendiente_confirmacion', sin print_jobs.
        // PATCH /confirmar la activa cuando el camarero confirma en pantalla.
        const estadoInicial = requireConfirm ? 'pendiente_confirmacion' : 'en_cocina'
        const { data: nuevaComanda, error: comandaError } = await supabase.from('comandas')
          .insert({ mesa_id: mesa.id, camarero_id: camareroId, turno_id: turnoId,
            tipo: brainResult.tipo, estado: estadoInicial,
            restaurante_id: rid,
            ...(brainResult.num_comensales ? { num_comensales: brainResult.num_comensales } : {}),
            ...(brainResult.nota_general ? { nota_general: brainResult.nota_general } : {}) })
          .select().single()
        if (comandaError) throw comandaError
        comanda = nuevaComanda
        comandaId = nuevaComanda.id
      }

      // ── Servicio/cubierto automático (voz) ───────────────────────────────
      // Si BRAIN capturó num_comensales Y es la primera comanda de esta mesa
      // en el turno activo, insertar línea de servicio automáticamente.
      let servicioInsertado = false
      if (brainResult.num_comensales && brainResult.num_comensales > 0) {
        const { data: esPrimera } = await supabase
          .rpc('es_primera_comanda', {
            p_mesa_id:  mesa.id,
            p_turno_id: turnoId,
          })
          // es_primera_comanda comprueba ANTES de insertar esta comanda,
          // pero ya la insertamos — así que chequeamos si no hay OTRAS comandas
        // Realmente necesitamos saber si ésta es la única comanda de la mesa en el turno
        const { count: otrasComandas } = await supabase
          .from('comandas')
          .select('id', { count: 'exact', head: true })
          .eq('mesa_id', mesa.id)
          .eq('turno_id', turnoId)
          .neq('id', comanda.id)
          .not('estado', 'in', '(cancelada,cerrada)')

        void esPrimera // usamos otrasComandas que es más preciso post-insert

        if ((otrasComandas ?? 1) === 0) {
          // Primera comanda — verificar config servicio
          const { data: restCfg } = await supabase
            .from('restaurantes')
            .select('servicio_activo,servicio_precio,servicio_nombre,servicio_auto')
            .eq('id', rid).single()

          // Override por zona
          const { data: mesaZonaServ } = await supabase
            .from('mesas')
            .select('zona_id, zonas(servicio_override, servicio_precio_zona, nombre)')
            .eq('id', mesa.id).single()

          const zonaServ = (mesaZonaServ?.zonas as unknown) as { servicio_override: boolean | null; servicio_precio_zona: number | null; nombre?: string } | null

          const servicioActivoZona =
            zonaServ?.servicio_override !== null && zonaServ?.servicio_override !== undefined
              ? zonaServ.servicio_override
              : restCfg?.servicio_activo ?? false

          const servicioPrecioZona =
            zonaServ?.servicio_precio_zona !== null && zonaServ?.servicio_precio_zona !== undefined
              ? zonaServ.servicio_precio_zona
              : Number(restCfg?.servicio_precio ?? 0)

          if (servicioActivoZona && restCfg?.servicio_auto) {
            const pax = brainResult.num_comensales
            // Insertar línea de servicio al inicio de los items
            await supabase.from('comanda_items').insert({
              comanda_id:     comanda.id,
              nombre:         `${restCfg.servicio_nombre} (${pax} pax)`,
              cantidad:       pax,
              notas:          null,
              producto_id:    null,
              precio_unitario: servicioPrecioZona,
              restaurante_id: rid,
            })

            // Tarea para running
            const { data: mesaZona } = await supabase
              .from('mesas').select('zona_id,zonas(nombre)').eq('id', mesa.id).single()
            if (mesaZona?.zona_id) {
              const { data: runningId } = await supabase.rpc('get_running_de_zona', {
                p_zona_id: mesaZona.zona_id, p_restaurante_id: rid,
              })
              await supabase.from('marchar_log').insert({
                restaurante_id: rid,
                receptor_id:    runningId || camareroId,
                mesa_id:        mesa.id,
                mesa_codigo:    mesa.codigo,
                zona_nombre:    ((mesaZona.zonas as unknown) as { nombre?: string } | null)?.nombre ?? null,
                tipo:           'servicio',
                num_comensales: pax,
                items_resumen:  `${restCfg.servicio_nombre} · ${pax} pax`,
                items_detalle:  [
                  { nombre: 'Pan / aceite',           cantidad: pax },
                  { nombre: 'Cubiertos completos',     cantidad: pax },
                  { nombre: 'Agua / carta de bebidas', cantidad: 1  },
                ],
                recogido: false,
              })
            }
            servicioInsertado = true
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────
      void servicioInsertado

      // formatoMap y norm hoistados para reutilizar en crearPrintJobs
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const formatoMap: Record<string, { id: string; nombre: string; precio: number }> = {}

      if (brainResult.items.length > 0) {
        const itemsConFormato = brainResult.items.filter(i => i.formato)
        const precioMap: Record<string, { id: string; precio: number }> = {}

        // Precio base de TODOS los productos (lookup automático desde carta)
        const todosNombres = [...new Set(brainResult.items.map(i => i.nombre))]
        const { data: todosProds } = await supabase
          .from('productos').select('id,nombre,precio').in('nombre', todosNombres).eq('restaurante_id', rid)
        for (const p of todosProds ?? []) {
          if (p.precio != null) precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
        }

        // Fallback: si algún nombre no matcheó (case-sensitive .in() puede fallar con capitalización)
        // Cubre: "cerveza caña" del brain vs "Cerveza caña" en BD, y aliases/motes
        const nombresNoMatcheados = todosNombres.filter(n => !precioMap[norm(n)])
        if (nombresNoMatcheados.length > 0) {
          const { data: prodsPorAlias } = await supabase
            .from('productos').select('id,nombre,precio,nombre_alternativo')
            .eq('restaurante_id', rid).eq('activo', true)
          for (const p of prodsPorAlias ?? []) {
            // Fix: comparar nombre canónico case-insensitive (norm() quita tildes+mayúsculas)
            const nombreNorm = norm(p.nombre)
            const matchedPorNombre = nombresNoMatcheados.find(n => norm(n) === nombreNorm)
            if (matchedPorNombre && p.precio != null) {
              precioMap[nombreNorm] = { id: p.id, precio: Number(p.precio) }
              // Reparar el nombre en brainResult para que el insert use el nombre canónico de BD
              for (const item of brainResult.items) {
                if (norm(item.nombre) === nombreNorm) item.nombre = p.nombre
              }
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[TRANSCRIBE] precio fallback case-insensitive: "${matchedPorNombre}" → "${p.nombre}" (${p.precio}€)`)
              }
            }
            // Fallback alias/motes
            const aliases: string[] = Array.isArray(p.nombre_alternativo) ? p.nombre_alternativo : []
            for (const alias of aliases) {
              const aliasNorm = norm(alias)
              if (nombresNoMatcheados.some(n => norm(n) === aliasNorm)) {
                if (p.precio != null) {
                  precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
                  precioMap[aliasNorm] = { id: p.id, precio: Number(p.precio) }
                  for (const item of brainResult.items) {
                    if (norm(item.nombre) === aliasNorm) item.nombre = p.nombre
                  }
                }
              }
            }
          }
          // Log de productos sin precio para detectar carta incompleta
          const sinPrecio = nombresNoMatcheados.filter(n => !precioMap[norm(n)])
          if (sinPrecio.length > 0) {
            console.warn(`[TRANSCRIBE] productos sin precio en carta: ${sinPrecio.join(', ')} (restaurante ${rid})`)
          }
        }

        if (itemsConFormato.length > 0) {
          const nombresUnicos = [...new Set(itemsConFormato.map(i => i.nombre))]
          const { data: prods } = await supabase
            .from('productos').select('id,nombre').in('nombre', nombresUnicos).eq('restaurante_id', rid)
          if (prods?.length) {
            const { data: formatos } = await supabase
              .from('producto_formatos').select('id,producto_id,nombre,precio')
              .in('producto_id', prods.map(p => p.id)).eq('activo', true)
            for (const f of formatos ?? []) {
              const prod = prods.find(p => p.id === f.producto_id)
              if (prod) formatoMap[`${norm(prod.nombre)}:${norm(f.nombre)}`] = { id: f.id, nombre: f.nombre, precio: f.precio }
            }
          }
        }

        await supabase.from('comanda_items').insert(
          brainResult.items.map((item) => {
            const fmtData = item.formato ? (formatoMap[`${norm(item.nombre)}:${norm(item.formato)}`] ?? null) : null
            const prodBase = precioMap[norm(item.nombre)] ?? null
            return {
              comanda_id: comanda.id, nombre: item.nombre, cantidad: item.cantidad,
              notas: item.notas || null,
              producto_id: item.producto_id ?? prodBase?.id ?? null,
              precio_unitario: fmtData?.precio ?? item.precio_unitario ?? prodBase?.precio ?? null,
              restaurante_id: rid,
              formato_id: fmtData?.id ?? null,
              formato_nombre: fmtData?.nombre ?? null,
            }
          })
        )
      }

      // Solo crear print_jobs si no requiere confirmación — si la requiere, /confirmar los crea
      if (!requireConfirm && ['comanda', 'marchar'].includes(brainResult.tipo) && brainResult.items.length > 0) {
        const { data: camarero } = await supabase.from('camareros').select('nombre').eq('id', camareroId).single()

        if (brainResult.tipo === 'marchar') {
          // ── B1 FIX: usar /api/marchar para notificaciones al running + marchar_log ──
          // Fix #3: APP_URL explícita > VERCEL_URL automático de Vercel > prod hardcoded
          const baseUrl = process.env.APP_URL
            ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.iarest.es')
          fetch(`${baseUrl}/api/marchar`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ia-session': req.headers.get('x-ia-session') ?? '',
            },
            body: JSON.stringify({
              comanda_id:  comanda.id,
              mesa_codigo: mesa.codigo,
              items:       brainResult.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad })),
              zona_nombre: ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null,
              camarero_nombre: camarero?.nombre ?? 'Equipo',
            }),
          }).catch(err => console.error('[MARCHAR-VOZ]', err))
        } else {
          crearPrintJobs(
            {
              id: comanda.id,
              tipo: brainResult.tipo,
              mesa_codigo: mesa.codigo,
              camarero_nombre: camarero?.nombre ?? 'Equipo',
              numero_ticket: comanda.numero_ticket ?? undefined,
              restaurante_id: rid,
              zona_tipo:   (mesa as Record<string, unknown>).zona as string ?? null,
              zona_nombre: ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null,
              nota_general: brainResult.nota_general ?? null,
            },
            brainResult.items.map(item => {
              const fmtData = item.formato
                ? (formatoMap[`${norm(item.nombre)}:${norm(item.formato)}`] ?? null)
                : null
              return {
                nombre:        item.nombre,
                cantidad:      item.cantidad,
                notas:         item.notas ?? null,
                seccion_id:    (item as Record<string, unknown>).seccion_id as string ?? null,
                formato_nombre: fmtData?.nombre ?? null,
              }
            })
          ).catch(err => console.error('[COURIER]', err))
        }
      }

      const nuevoEstado = ({ comanda: 'activa', marchar: 'marchar', '86': mesa.estado, cuenta: 'cuenta_pedida', aviso: 'aviso' })[brainResult.tipo] as string
      // No actualizar mesa si requireConfirm — se actualiza al confirmar en /confirmar
      if (!requireConfirm) await supabase.from('mesas').update({ estado: brainResult.tipo === 'cuenta' ? 'cuenta' : nuevoEstado, ultima_comanda: new Date().toISOString(), camarero_id: camareroId }).eq('id', mesa.id).eq('restaurante_id', rid)

      // ── PEDIR CUENTA por voz ───────────────────────────────
      // Si requireConfirm, el ticket de cuenta espera a la confirmación del camarero
      if (!requireConfirm && brainResult.tipo === 'cuenta' && comanda?.id) {
        // Cambiar estado comanda a cuenta_pedida + imprimir ticket
        await supabase.from('comandas').update({ estado: 'cuenta_pedida' }).eq('id', comanda.id)

        // Datos para ticket de cuenta
        const { data: itemsCuenta } = await supabase
          .from('comanda_items').select('nombre, cantidad, precio_unitario')
          .eq('comanda_id', comanda.id).eq('restaurante_id', rid)

        const { data: restData } = await supabase
          .from('restaurantes').select('nombre, direccion').eq('id', rid).single()

        const { data: camNombre } = await supabase
          .from('camareros').select('nombre').eq('id', camareroId).single()

        const totalCuenta = (itemsCuenta ?? []).reduce(
          (s: number, it: { precio_unitario: number | null; cantidad: number }) =>
            s + (it.precio_unitario ?? 0) * it.cantidad, 0
        )

        if (!itemsCuenta?.length) {
          console.warn(`[COURIER-CUENTA-VOZ] Comanda ${comanda.id} sin items — no se crea print_job`)
        } else {
          try {
            const printResult = await crearPrintJobCuenta({
              comanda_id: comanda.id,
              restaurante_id: rid,
              mesa_label: mesa.codigo,
              zona_tipo: (mesa as Record<string, unknown>).zona as string ?? null,
              zona_nombre: ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null,
              camarero_nombre: camNombre?.nombre ?? 'Equipo',
              numero_ticket: comanda.numero_ticket ?? 0,
              restaurante_nombre: restData?.nombre ?? 'Restaurante',
              restaurante_direccion: restData?.direccion ?? null,
              items: itemsCuenta.map((it: { nombre: string; cantidad: number; precio_unitario: number | null }) => ({
                nombre: it.nombre, cantidad: it.cantidad, precio_unitario: it.precio_unitario ?? 0,
              })),
              total: Math.round(totalCuenta * 100) / 100,
            })
            if (!printResult?.job_id) {
              console.warn(`[COURIER-CUENTA-VOZ] Sin impresora para comanda ${comanda.id} (mesa ${mesa.codigo})`)
            }
          } catch (e: unknown) {
            console.error('[COURIER-CUENTA-VOZ] Error creando print_job:', e)
          }
        }
      }

      if (brainResult.tipo === '86') {
        await supabase.from('productos_86').insert(
          brainResult.items.map((item) => ({ nombre: item.nombre, turno_id: turnoId, restaurante_id: rid }))
        )
      }

      // ── AVISO / MENSAJE entre roles ───────────────────────────────────────
      if (brainResult.tipo === 'aviso' && brainResult.nota_general) {
        const ROL_MAP: Record<string, string> = {
          cocina: 'cocina', barra: 'camarero', sala: 'camarero', todos: 'todos',
        }
        let rolDestino = 'todos'
        let destinatarioId: string | null = null
        let seccionImpresoraId: string | null = null

        if (brainResult.destinatario_nombre) {
          // Mensaje privado a persona
          const { data: destinatario } = await supabase
            .from('camareros')
            .select('id, rol')
            .eq('restaurante_id', rid)
            .eq('activo', true)
            .ilike('nombre', `${brainResult.destinatario_nombre}%`)
            .limit(1)
            .maybeSingle()
          if (destinatario) {
            destinatarioId = destinatario.id
            rolDestino = destinatario.rol ?? 'camarero'
          }
        } else {
          const destRaw = (brainResult.mesa ?? 'todos').toLowerCase()
          if (ROL_MAP[destRaw]) {
            rolDestino = ROL_MAP[destRaw]
          } else {
            // Puede ser nombre de sección — buscar en secciones_cocina
            const { data: seccion } = await supabase
              .from('secciones_cocina')
              .select('id, impresora_id')
              .eq('restaurante_id', rid)
              .ilike('nombre', `${brainResult.mesa}%`)
              .limit(1)
              .maybeSingle()
            if (seccion) {
              seccionImpresoraId = seccion.impresora_id
              rolDestino = 'cocina'
              // Si la sección tiene impresora → print_job de tipo aviso
              if (seccion.impresora_id) {
                try {
                  await supabase.from('print_jobs').insert({
                    restaurante_id: rid,
                    impresora_id:   seccion.impresora_id,
                    tipo:           'aviso',
                    estado:         'pendiente', // qa-ignore: tabla print_jobs, no comandas
                    payload: {
                      tipo:    'aviso',
                      mensaje: brainResult.nota_general,
                      origen:  session.nombre,
                      mesa:    mesa?.codigo ?? null,
                      seccion: brainResult.mesa,
                    },
                  })
                } catch (e) { console.error('[AVISO-SECCION] print_job:', e) }
              }
            }
          }
        }

        try {
          await supabase.from('mensajes_turno').insert({
            restaurante_id:  rid,
            turno_id:        turnoId ?? null,
            camarero_id:     camareroId,
            rol_origen:      session.rol,
            nombre_origen:   session.nombre,
            rol_destino:     rolDestino,
            destinatario_id: destinatarioId,
            tipo:            'voz',
            texto:           brainResult.nota_general,
            mesa_ref:        mesa?.codigo ?? null,
            leido_por:       [camareroId],
          })
        } catch (e) { console.error('[AVISO-VOZ] mensajes_turno:', e) }
        void seccionImpresoraId
      }

      // ── MARCHAR GRANULAR: si hay items, actualizar estado en comanda_items ─
      if (brainResult.tipo === 'marchar' && brainResult.items.length > 0 && mesa) {
        try {
          // Buscar comanda activa de esta mesa
          const { data: comanda } = await supabase
            .from('comandas')
            .select('id')
            .eq('mesa_id', mesa.id)
            .eq('restaurante_id', rid)
            .in('estado', ['en_cocina', 'nueva', 'lista'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (comanda) {
            for (const item of brainResult.items) {
              await supabase
                .from('comanda_items')
                .update({ estado: 'listo' })
                .eq('comanda_id', comanda.id)
                .eq('restaurante_id', rid)
                .ilike('nombre', `%${item.nombre}%`)
                .eq('estado', 'pendiente')
            }
          }
        } catch (e) { console.error('[MARCHAR-GRANULAR]', e) }
      }
    }

    // ── CUENTA NOMINAL: si BRAIN devuelve nombre_cuenta sin mesa ────────────
    let nombreCuentaUsada: string | null = null
    if (!mesa && brainResult.nombre_cuenta && brainResult.items.length > 0) {
      const nombreNorm = brainResult.nombre_cuenta.trim()
      const { data: comanda, error: cErr } = await supabase.from('comandas')
        .insert({
          mesa_id: null,
          nombre_cuenta: nombreNorm,
          camarero_id: camareroId,
          turno_id: turnoId,
          tipo: brainResult.tipo === 'cuenta' ? 'comanda' : brainResult.tipo,
          // Fix #2: respetar requireConfirm también en cuentas nominales
          estado: requireConfirm ? 'pendiente_confirmacion' : 'en_cocina',
          restaurante_id: rid,
        })
        .select().single()
      if (cErr) throw cErr
      comandaId = comanda.id
      nombreCuentaUsada = nombreNorm

      // Insertar items con precios
      if (brainResult.items.length > 0) {
        const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const todosNombres = [...new Set(brainResult.items.map(i => i.nombre))]
        const { data: todosProds } = await supabase
          .from('productos').select('id,nombre,precio').in('nombre', todosNombres).eq('restaurante_id', rid)
        const precioMap: Record<string, { id: string; precio: number }> = {}
        for (const p of todosProds ?? []) {
          if (p.precio != null) precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
        }
        // Fallback por nombre_alternativo (motes/apodos)
        const nombresNoMatcheados2 = todosNombres.filter(n => !precioMap[norm(n)])
        if (nombresNoMatcheados2.length > 0) {
          const { data: prodsPorAlias2 } = await supabase
            .from('productos').select('id,nombre,precio,nombre_alternativo')
            .eq('restaurante_id', rid).eq('activo', true)
          for (const p of prodsPorAlias2 ?? []) {
            const aliases2: string[] = Array.isArray(p.nombre_alternativo) ? p.nombre_alternativo : []
            for (const alias of aliases2) {
              const aliasNorm = norm(alias)
              if (nombresNoMatcheados2.some(n => norm(n) === aliasNorm)) {
                if (p.precio != null) {
                  precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
                  precioMap[aliasNorm] = { id: p.id, precio: Number(p.precio) }
                  for (const item of brainResult.items) {
                    if (norm(item.nombre) === aliasNorm) item.nombre = p.nombre
                  }
                }
              }
            }
          }
        }
        await supabase.from('comanda_items').insert(
          brainResult.items.map(item => {
            const prodBase = precioMap[norm(item.nombre)] ?? null
            return {
              comanda_id: comanda.id, nombre: item.nombre, cantidad: item.cantidad,
              notas: item.notas || null,
              producto_id: item.producto_id ?? prodBase?.id ?? null,
              precio_unitario: item.precio_unitario ?? prodBase?.precio ?? null,
              restaurante_id: rid,
            }
          })
        )
        // Solo enviar a impresora si no requiere confirmación
        if (!requireConfirm) {
        const { data: camarero } = await supabase.from('camareros').select('nombre').eq('id', camareroId).single()
        crearPrintJobs(
          {
            id: comanda.id,
            tipo: brainResult.tipo,
            mesa_codigo: `★ ${nombreNorm}`,
            camarero_nombre: camarero?.nombre ?? 'Equipo',
            numero_ticket: comanda.numero_ticket ?? undefined,
            restaurante_id: rid,
            zona_tipo: null,
            nota_general: brainResult.nota_general ?? null,
          },
          brainResult.items.map(item => ({ nombre: item.nombre, cantidad: item.cantidad, notas: item.notas ?? null, seccion_id: null }))
        ).catch(err => console.error('[COURIER nominal]', err))
        } // end if(!requireConfirm)
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const latenciaTotal = Date.now() - start
    await supabase.from('transcripciones').insert({
      camarero_id: camareroId, turno_id: turnoId, texto_original: texto,
      texto_brain: brainResult, latencia_ms: latenciaTotal, comanda_id: comandaId, restaurante_id: rid,
      fuente_brain: brainResult.fuente,
      latencia_brain_ms: brainResult.latencia_brain_ms,
      speaker_match: speakerMatch,
      // Fix #10: persistir recording_id para idempotencia cross-instancia
      ...(recordingId ? { recording_id: recordingId } : {}),
    })

    if (alertasAlergenos.length > 0 && comandaId && mesa) {
      const logs = alertasAlergenos.flatMap(a =>
        a.alergenos.map(al => ({
          comanda_id: comandaId,
          mesa_id: mesa!.id,
          restaurante_id: rid,
          producto_nombre: a.producto,
          alergeno: al,
          confirmado_por: camareroId,
          nota: `Alerta automática — alérgeno declarado en mesa ${mesa!.codigo}`,
        }))
      )
      await supabase.from('alergeno_confirmaciones').insert(logs)
    }

    // ── Log de aprendizaje: TODOS los casos (columnas reales de ia_training_log) ──────
    // Guarda: baja confianza, items vacíos, Y todos los casos resueltos (fuente real)
    // calidad: 1=fallo, 2=dudoso, 3=ok, 4=bueno, 5=perfecto (con corrección humana)
    try {
      const conf = brainResult.confianza ?? 0
      const fuente = (brainResult as { fuente?: string }).fuente ?? 'claude_api'
      // Calidad automática basada en confianza y resultado
      let calidad: number
      if (conf >= 0.90 && brainResult.items.length > 0) calidad = 4        // bueno
      else if (conf >= 0.75 && brainResult.items.length > 0) calidad = 3   // ok
      else if (conf >= 0.50) calidad = 2                                    // dudoso
      else calidad = 1                                                       // fallo

      await supabase.from('ia_training_log').insert({
        restaurante_id: rid,
        input_raw: texto,
        input_context: {
          hora: new Date().toISOString(),
          turno_id: turnoId,
          comanda_id: comandaId,
          camarero_id: camareroId,
          mesa: brainResult.mesa,
          aviso_ruido: avisoRuido,
          speaker_match: speakerMatch,
        },
        output_brain: brainResult,
        fuente,
        calidad,
        confianza: conf,
        fue_corregido: false,
        latencia_ms: latenciaTotal,
        modelo_usado: fuente === 'patron' ? 'patron' : 'nvidia/llama-3.3-70b',
        turno_id: turnoId,
        camarero_id: camareroId,
        // Fix duplicados: recording_id como clave de idempotencia en el log
        ...(recordingId ? { recording_id: recordingId } : {}),
      })
    } catch { /* nunca bloquear la comanda */ }

    const okResult = {
      ok: true, texto, brain: brainResult, fuente_brain: brainResult.fuente,
      latencia_ms: latenciaTotal, latencia_ear_ms: latenciaEar,
      latencia_brain_ms: brainResult.latencia_brain_ms,
      comanda_id: comandaId, mesa_id: mesa?.id ?? null,
      nombre_cuenta: nombreCuentaUsada,
      alertas_86: alertas86, alertas_alergenos: alertasAlergenos,
      aviso_ruido: avisoRuido, speaker_match: speakerMatch,
      no_speech_prob, avg_logprob,
      // Recomendación de vino → el cliente la lee via VOX directamente
      voz_recomendacion: brainResult.tipo === 'recomendacion_vino'
        ? (brainResult.nota_general ?? null)
        : null,
    }
    // Cachear resultado para idempotencia (si vuelve la misma recording_id, devuelve esto)
    if (recordingId) recentRecordings.set(recordingId, { ts: Date.now(), result: okResult })
    return NextResponse.json(okResult)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const is401 = msg.includes('401') || (err as { status?: number })?.status === 401

    // ── Registrar error en system_errors para auditoría y aprendizaje ──
    try {
      const supabaseErr = createServerClient()
      const ridErr = req.headers.get('x-restaurante-id') ?? 'unknown'
      await supabaseErr.from('system_errors').insert({
        restaurante_id: ridErr !== 'unknown' ? ridErr : null,
        funcion_origen: 'transcribe',
        mensaje: msg.substring(0, 500),
        contexto: { is401, url: req.url },
      })
    } catch { /* no propagar errores de logging */ }

    if (is401) {
      const missingGroq = !process.env.GROQ_API_KEY
      const missingAnthropic = !process.env.ANTHROPIC_API_KEY
      const hint = missingGroq
        ? 'GROQ_API_KEY no configurada en Vercel env vars'
        : missingAnthropic
          ? 'ANTHROPIC_API_KEY no configurada en Vercel env vars'
          : 'API key inválida o expirada (Groq/Anthropic) — revisar Vercel env vars'
      console.error('[TRANSCRIBE] 401 —', hint, err)
      return NextResponse.json({ error: hint, code: 'API_KEY_INVALID' }, { status: 500 })
    }

    // Traducir errores JS técnicos a mensajes legibles en español
    let msgEs = 'Error interno al procesar la voz'
    if (msg.includes('Cannot read properties of undefined')) {
      msgEs = 'Error al procesar la comanda — inténtalo de nuevo'
    } else if (msg.includes('Failed to fetch') || msg.includes('network')) {
      msgEs = 'Sin conexión — comprueba el WiFi o los datos'
    } else if (msg.includes('timeout') || msg.includes('AbortError')) {
      msgEs = 'Tiempo de espera agotado — inténtalo de nuevo'
    } else if (msg.includes('JSON') || msg.includes('parse')) {
      msgEs = 'No se pudo interpretar la respuesta — inténtalo de nuevo'
    } else if (msg.includes('audio') || msg.includes('codec') || msg.includes('media')) {
      msgEs = 'Formato de audio no soportado — actualiza la app o usa Chrome'
    } else if (msg.length < 120 && !msg.match(/[A-Z][a-z]+ \w+ properties/)) {
      // Solo mostrar el mensaje original si parece legible (no un error JS técnico)
      msgEs = msg
    }

    console.error('[TRANSCRIBE]', err)
    return NextResponse.json({ error: msgEs }, { status: 500 })
  }
}
