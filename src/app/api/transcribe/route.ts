import { NextRequest, NextResponse } from 'next/server'
import { transcribir } from '@/lib/ear'
import { routearComanda } from '@/lib/brain-router'
import { crearPrintJobs } from '@/lib/courier'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { azureDisponible, verificarAzure } from '@/lib/azure-speaker'

// ── Cache de idempotencia en memoria (dura hasta redeploy) ──────────────
// Protege contra peticiones duplicadas que lleguen en ráfaga (red lenta + reintento)
// NOTA: en entornos serverless multi-instancia esta cache no se comparte entre lambdas.
// Para idempotencia total se necesitaría persistir en Supabase (pendiente migración).
const recentRecordings = new Map<string, { ts: number; result: object }>()
const IDEMPOTENCY_TTL_MS = 30_000 // 30s

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
    const recordingId = formData.get('recording_id') as string | null  // idempotency key
    const pendingItemsRaw = formData.get('pending_items') as string | null  // flujo conversacional
    const pendingContext  = formData.get('pending_context') as string | null  // flujo clarificacion
    if (!audio || !camareroId || !turnoId)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

    // ── Idempotencia: si ya procesamos esta grabacion, devolver resultado cacheado ──
    if (recordingId) {
      const cached = recentRecordings.get(recordingId)
      if (cached && Date.now() - cached.ts < IDEMPOTENCY_TTL_MS) {
        return NextResponse.json(cached.result)
      }
      // Limpiar entradas viejas
      for (const [k, v] of recentRecordings) {
        if (Date.now() - v.ts > IDEMPOTENCY_TTL_MS) recentRecordings.delete(k)
      }
    }

    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    // ── VOICE PROFILE: verificación no bloqueante ────────────────────────────
    // Si el camarero tiene perfil activo, verificamos que la voz coincide.
    // NUNCA bloquea la comanda — solo registra el score para auditoría.
    let speakerMatch: number | null = null
    if (azureDisponible()) {
      try {
        const { data: vp } = await supabase
          .from('voice_profiles')
          .select('azure_profile_id, estado')
          .eq('camarero_id', camareroId)
          .eq('estado', 'activo')
          .maybeSingle()

        if (vp?.azure_profile_id) {
          speakerMatch = await verificarAzure(vp.azure_profile_id, audio)
          if (speakerMatch !== null) {
            supabase.from('voice_profiles').update({
              ultimo_score:    speakerMatch,
              ultimo_score_at: new Date().toISOString(),
            }).eq('camarero_id', camareroId).then(() => {/* fire and forget */})
          }
        }
      } catch { /* no bloquear la comanda bajo ningún concepto */ }
    }
    // ────────────────────────────────────────────────────────────────────────

    const { texto: textoRaw, latencia_ms: latenciaEar } = await transcribir(audio)
    // Si hay contexto previo de clarificación, se lo pasamos a BRAIN para que resuelva
    const texto = pendingContext
      ? `${pendingContext} → respuesta: ${textoRaw}`
      : textoRaw
    const brainResult = await routearComanda(texto, rid)

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
      const { data: comanda, error: comandaError } = await supabase.from('comandas')
        .insert({ mesa_id: mesa.id, camarero_id: camareroId, turno_id: turnoId,
          tipo: brainResult.tipo, estado: brainResult.tipo === 'cuenta' ? 'nueva' : 'en_cocina',
          restaurante_id: rid,
          ...(brainResult.num_comensales ? { num_comensales: brainResult.num_comensales } : {}),
          ...(brainResult.nota_general ? { nota_general: brainResult.nota_general } : {}) })
        .select().single()
      if (comandaError) throw comandaError
      comandaId = comanda.id

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

      if (brainResult.items.length > 0) {
        const itemsConFormato = brainResult.items.filter(i => i.formato)
        const formatoMap: Record<string, { id: string; nombre: string; precio: number }> = {}
        const precioMap: Record<string, { id: string; precio: number }> = {}
        const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

        // Precio base de TODOS los productos (lookup automático desde carta)
        const todosNombres = [...new Set(brainResult.items.map(i => i.nombre))]
        const { data: todosProds } = await supabase
          .from('productos').select('id,nombre,precio').in('nombre', todosNombres).eq('restaurante_id', rid)
        for (const p of todosProds ?? []) {
          if (p.precio != null) precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
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

      if (['comanda', 'marchar'].includes(brainResult.tipo) && brainResult.items.length > 0) {
        const { data: camarero } = await supabase.from('camareros').select('nombre').eq('id', camareroId).single()
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
          },
          brainResult.items.map(item => ({ nombre: item.nombre, cantidad: item.cantidad,
            notas: item.notas ?? null, seccion_id: (item as Record<string, unknown>).seccion_id as string ?? null }))
        ).catch(err => console.error('[COURIER]', err))
      }

      const nuevoEstado = ({ comanda: 'activa', marchar: 'marchar', '86': mesa.estado, cuenta: 'cuenta_pedida', aviso: 'aviso' })[brainResult.tipo] as string
      await supabase.from('mesas').update({ estado: brainResult.tipo === 'cuenta' ? 'cuenta' : nuevoEstado, ultima_comanda: new Date().toISOString(), camarero_id: camareroId }).eq('id', mesa.id).eq('restaurante_id', rid)

      // ── PEDIR CUENTA por voz ───────────────────────────────
      if (brainResult.tipo === 'cuenta' && comanda?.id) {
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

        import('@/lib/courier').then(({ crearPrintJobCuenta }) => {
          crearPrintJobCuenta({
            comanda_id: comanda.id,
            restaurante_id: rid,
            mesa_label: mesa.codigo,
            zona_tipo: (mesa as Record<string, unknown>).zona as string ?? null,
            zona_nombre: ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null,
            camarero_nombre: camNombre?.nombre ?? 'Equipo',
            numero_ticket: comanda.numero_ticket ?? 0,
            restaurante_nombre: restData?.nombre ?? 'Restaurante',
            restaurante_direccion: restData?.direccion ?? null,
            items: (itemsCuenta ?? []).map((it: { nombre: string; cantidad: number; precio_unitario: number | null }) => ({
              nombre: it.nombre, cantidad: it.cantidad, precio_unitario: it.precio_unitario ?? 0,
            })),
            total: Math.round(totalCuenta * 100) / 100,
          }).catch((e: unknown) => console.error('[COURIER-CUENTA-VOZ]', e))
        }).catch((e: unknown) => console.error('[COURIER-CUENTA-IMPORT]', e))
      }

      if (brainResult.tipo === '86') {
        await supabase.from('productos_86').insert(
          brainResult.items.map((item) => ({ nombre: item.nombre, turno_id: turnoId, restaurante_id: rid }))
        )
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
          estado: 'en_cocina',
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
        // Enviar a impresora igual que con mesa (courier)
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
          },
          brainResult.items.map(item => ({ nombre: item.nombre, cantidad: item.cantidad, notas: item.notas ?? null, seccion_id: null }))
        ).catch(err => console.error('[COURIER nominal]', err))
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

    // ── Log de aprendizaje: guardar casos de baja confianza para mejora del modelo ──
    if ((brainResult.confianza ?? 1) < 0.65 || brainResult.items.length === 0) {
      try {
        await supabase.from('ia_training_log').insert({
          restaurante_id: rid,
          texto_original: texto,
          resultado_brain: brainResult,
          fuente_brain: (brainResult as { fuente?: string }).fuente ?? 'desconocido',
          confianza: brainResult.confianza ?? 0,
          revisado: false,
        })
      } catch { /* no bloquear la respuesta si falla el log */ }
    }

    const okResult = { ok: true, texto, brain: brainResult, fuente_brain: brainResult.fuente, latencia_ms: latenciaTotal, latencia_ear_ms: latenciaEar, latencia_brain_ms: brainResult.latencia_brain_ms, comanda_id: comandaId, mesa_id: mesa?.id ?? null, nombre_cuenta: nombreCuentaUsada, alertas_86: alertas86, alertas_alergenos: alertasAlergenos }
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
        origen: 'transcribe',
        mensaje: msg.substring(0, 500),
        contexto: JSON.stringify({ is401, url: req.url }),
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
