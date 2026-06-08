import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TM_API_KEY      = Deno.env.get('TICKETMASTER_API_KEY') ?? ''
const TG_TOKEN        = Deno.env.get('TELEGRAM_TOKEN') ?? ''
const TG_CHAT         = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''
const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

function calcularImpacto(aforo: number): number {
  if (aforo > 20000) return 1.60
  if (aforo > 10000) return 1.40
  if (aforo > 5000)  return 1.25
  if (aforo > 1000)  return 1.15
  return 1.08
}

async function enviarTelegram(msg: string) {
  if (!TG_TOKEN || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'Markdown' }),
  })
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1. Restaurantes con CP o coordenadas
  const { data: restaurantes, error: errR } = await supabase
    .from('restaurantes')
    .select('id, nombre, ciudad, cp_local, latitud, longitud')
    .eq('activo', true)
    .or('cp_local.not.is.null,latitud.not.is.null')

  if (errR || !restaurantes?.length) {
    return new Response(JSON.stringify({ ok: true, msg: 'Sin restaurantes configurados', procesados: 0 }))
  }

  let insertados = 0
  const hoy    = new Date()
  const en180d = new Date(Date.now() + 180 * 86400000)

  for (const rest of restaurantes) {
    // ── 2. Ticketmaster (90 días) ─────────────────────────────────────────────
    if (TM_API_KEY && rest.cp_local) {
      try {
        const url = `https://app.ticketmaster.com/discovery/v2/events.json` +
          `?apikey=${TM_API_KEY}` +
          `&postalCode=${rest.cp_local}` +
          `&countryCode=ES` +
          `&radius=5&unit=km` +
          `&startDateTime=${hoy.toISOString().slice(0, 19)}Z` +
          `&endDateTime=${en180d.toISOString().slice(0, 19)}Z` +
          `&size=20&sort=date,asc`

        const res  = await fetch(url)
        const data = await res.json()
        const evs  = data._embedded?.events ?? []

        for (const ev of evs) {
          const aforo = ev.accessibility?.seatCount ?? ev.place?.capacity ?? 2000
          const venue = ev._embedded?.venues?.[0]
          await supabase.from('eventos_entorno').upsert({
            local_id:    rest.id,
            nombre:            ev.name,
            fecha_inicio:      ev.dates?.start?.dateTime ?? `${ev.dates?.start?.localDate}T00:00:00Z`,
            tipo:              ev.classifications?.[0]?.segment?.name?.toLowerCase().includes('sport') ? 'deportes' : 'concierto',
            fuente:            'ticketmaster',
            aforo_estimado:    Number(aforo),
            impacto_estimado:  calcularImpacto(Number(aforo)),
            venue_nombre:      venue?.name ?? null,
            venue_direccion:   venue?.address?.line1 ?? null,
            raw:               ev,
          }, { onConflict: 'local_id,nombre,fecha_inicio', ignoreDuplicates: true })
          insertados++
        }
      } catch (e) {
        console.error(`TM error ${rest.nombre}:`, e)
      }
    }

    // ── 3. Open-Meteo (clima, sin API key) ────────────────────────────────────
    if (rest.latitud && rest.longitud) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${rest.latitud}&longitude=${rest.longitud}` +
          `&daily=precipitation_sum,temperature_2m_max,weathercode` +
          `&timezone=Europe%2FMadrid&forecast_days=7`

        const res  = await fetch(url)
        const data = await res.json()
        const d    = data.daily

        for (let i = 0; i < 7; i++) {
          const lluvia  = (d.precipitation_sum[i] ?? 0) > 5
          const calor   = (d.temperature_2m_max[i] ?? 20) > 35
          const frio    = (d.temperature_2m_max[i] ?? 20) < 8

          let nombre: string | null = null
          let impacto = 1.0

          if (lluvia)     { nombre = `Lluvia intensa · ${d.precipitation_sum[i]}mm`;       impacto = 0.75 }
          else if (calor) { nombre = `Calor extremo · ${d.temperature_2m_max[i]}°C`;       impacto = 0.85 }
          else if (frio)  { nombre = `Frío intenso · ${d.temperature_2m_max[i]}°C`;        impacto = 0.90 }

          if (nombre) {
            await supabase.from('eventos_entorno').upsert({
              local_id:   rest.id,
              nombre,
              fecha_inicio:     `${d.time[i]}T00:00:00Z`,
              tipo:             'clima',
              fuente:           'open-meteo',
              impacto_estimado: impacto,
              raw:              { fecha: d.time[i], lluvia: d.precipitation_sum[i], temp: d.temperature_2m_max[i], wmo: d.weathercode[i] },
            }, { onConflict: 'local_id,nombre,fecha_inicio', ignoreDuplicates: true })
            insertados++
          }
        }
      } catch (e) {
        console.error(`Clima error ${rest.nombre}:`, e)
      }
    }
  }


  // ── 4. Claude web_search: ferias, festivos, fútbol (1x/semana) ─────────────
  if (ANTHROPIC_KEY) {
    for (const rest of restaurantes) {
      const ciudad   = (rest as Record<string,unknown>).ciudad as string ?? rest.cp_local ?? 'España'
      const fechaHoy = hoy.toISOString().split('T')[0]
      const fecha180 = en180d.toISOString().split('T')[0]

      // Comprobar si ya corrió esta semana
      const { data: yaHecho } = await supabase
        .from('eventos_entorno').select('id')
        .eq('local_id', rest.id).eq('fuente', 'claude-websearch')
        .gte('created_at', new Date(Date.now() - 6 * 86400000).toISOString()).limit(1)
      if (yaHecho?.length) continue

      // Leer todos los eventos ya guardados (cualquier fuente) para este período
      const { data: existentes } = await supabase
        .from('eventos_entorno')
        .select('nombre, fecha_inicio')
        .eq('local_id', rest.id)
        .gte('fecha_inicio', `${fechaHoy}T00:00:00Z`)
        .lte('fecha_inicio', `${fecha180}T23:59:59Z`)
        .order('fecha_inicio', { ascending: true })

      // Resumen compacto para el prompt: "2026-06-04 Corpus Christi, 2026-06-07 Real Betis vs Athletic"
      const resumenExistentes = (existentes ?? [])
        .map(e => `${e.fecha_inicio.slice(0,10)} ${e.nombre}`)
        .join(' | ')

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content:
              `Busca eventos CONFIRMADOS en ${ciudad} entre ${fechaHoy} y ${fecha180} (próximos 6 meses) relevantes para bares y restaurantes: partidos LaLiga (Sevilla FC, Real Betis), conciertos en recintos >1000 personas, ferias locales, festivos municipales y nacionales, festivales.

EVENTOS YA REGISTRADOS (NO repetir ni incluir nada similar a estos):
${resumenExistentes || 'Ninguno aún'}

Incluye solo eventos con fecha fija confirmada que NO estén ya en la lista anterior. Usa criterio estricto de similitud: si el evento es el mismo partido o festivo aunque el nombre varíe ligeramente, NO lo incluyas.

Responde SOLO con JSON válido sin markdown:
{"eventos":[{"fecha":"YYYY-MM-DD","nombre":"nombre corto descriptivo","tipo":"deportes|concierto|feria|festivo|otro","aforo_estimado":25000}]}
Si no hay nada nuevo: {"eventos":[]}` }],
          }),
        })
        if (!res.ok) continue
        const data = await res.json()
        const text = (data.content ?? [])
          .filter((b: {type:string}) => b.type === 'text')
          .map((b: {text:string}) => b.text).join('')

        let parsed: {eventos: Array<{fecha:string;nombre:string;tipo:string;aforo_estimado?:number}>}
        try { parsed = JSON.parse(text.replace(/```json|```/g,'').trim()) } catch { continue }

        for (const ev of parsed.eventos ?? []) {
          if (!ev.fecha || !ev.nombre) continue

          // Dedup extra: comparar con existentes por fecha exacta + nombre similar
          const fechaEv = ev.fecha
          const nombreEvNorm = ev.nombre.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '')
          const yaExiste = (existentes ?? []).some(e => {
            if (e.fecha_inicio.slice(0,10) !== fechaEv) return false
            const nombreNorm = e.nombre.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '')
            // Coincidencia si uno contiene al otro (ej. "realbetisvsathletic" ⊂ "realbetisvsathleticlaliga")
            return nombreNorm.includes(nombreEvNorm.slice(0, 10)) ||
                   nombreEvNorm.includes(nombreNorm.slice(0, 10))
          })
          if (yaExiste) continue

          const aforo = ev.aforo_estimado ?? 5000
          await supabase.from('eventos_entorno').upsert({
            local_id: rest.id, nombre: ev.nombre,
            fecha_inicio: `${ev.fecha}T00:00:00Z`,
            tipo: ev.tipo ?? 'otro', fuente: 'claude-websearch',
            aforo_estimado: aforo, impacto_estimado: calcularImpacto(aforo), raw: ev,
          }, { onConflict: 'local_id,nombre,fecha_inicio', ignoreDuplicates: true })
          insertados++
        }
      } catch(e) { console.error(`Claude websearch error ${rest.nombre}:`, e) }
    }
  }

  // ── 4. Alertas Telegram: eventos de alto impacto en próximas 72h ──────────
  const en3d = new Date(Date.now() + 3 * 86400000)
  const { data: alertas } = await supabase
    .from('eventos_entorno')
    .select('*, restaurantes(nombre)')
    .gte('fecha_inicio', hoy.toISOString())
    .lte('fecha_inicio', en3d.toISOString())
    .gte('impacto_estimado', 1.25)
    .eq('notificado', false)

  for (const a of alertas ?? []) {
    const pct    = Math.round((a.impacto_estimado - 1) * 100)
    const fecha  = new Date(a.fecha_inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const restNombre = (a.restaurantes as { nombre: string })?.nombre ?? 'Restaurante'
    const msg = `🎉 *${restNombre}*\n` +
      `📍 Evento próximo: *${a.nombre}*\n` +
      `📅 ${fecha}\n` +
      `${a.venue_nombre ? `🏟 ${a.venue_nombre}\n` : ''}` +
      `📈 Impacto estimado: *+${pct}% afluencia*\n` +
      `💡 Considera reforzar personal y stock`

    await enviarTelegram(msg)
    await supabase.from('eventos_entorno').update({ notificado: true }).eq('id', a.id)
  }

  return new Response(
    JSON.stringify({ ok: true, procesados: restaurantes.length, insertados, alertas: alertas?.length ?? 0 }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
