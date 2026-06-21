import { createServerClient } from '@/lib/supabase'

export const revalidate = 120 // refrescar cada 2 min

const CAT_LABELS: Record<string, string> = {
  ENV: 'Configuración', BD: 'Base de datos', NEGOCIO: 'Operaciones',
  APIs: 'Servicios externos', CRONS: 'Automatizaciones', PERF: 'Rendimiento',
}

export default async function StatusPage() {
  let score = null as number | null
  let lastRun = null as any
  let catResumen = [] as { cat: string; ok: number; total: number }[]
  let hace = ''

  try {
    const sb = createServerClient()
    const { data: run } = await sb.from('qa_runs')
      .select('id,score,criticos,warnings,ok,total,created_at,trigger')
      .order('created_at', { ascending: false }).limit(1).single()

    if (run) {
      lastRun = run
      score = run.score
      const mins = Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000)
      hace = mins < 60 ? `hace ${mins} min` : `hace ${Math.round(mins/60)}h`

      const { data: checks } = await sb.from('qa_checks')
        .select('categoria,estado').eq('run_id', run.id)
      if (checks) {
        const grupos: Record<string, { ok: number; total: number }> = {}
        checks.forEach((c: any) => {
          if (!grupos[c.categoria]) grupos[c.categoria] = { ok: 0, total: 0 }
          grupos[c.categoria].total++
          if (c.estado === 'ok') grupos[c.categoria].ok++
        })
        catResumen = Object.entries(grupos)
          .filter(([cat]) => Object.keys(CAT_LABELS).includes(cat))
          .map(([cat, v]) => ({ cat, ...v }))
      }
    }
  } catch {}

  const color = score === null ? '#9C8E7E' : score >= 90 ? '#3F7D44' : score >= 70 ? '#E8A33B' : '#D9442B'
  const label = score === null ? 'Sin datos' : score >= 90 ? 'Operacional' : score >= 70 ? 'Degradado' : 'Incidencia'
  const dot   = score === null ? '⚪' : score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴'

  return (
    <html lang="es">
      <head>
        <title>Estado del sistema · ia.rest</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700&family=Newsreader:ital,wght@1,300&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: '#14110E', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: 'Inter Tight, sans-serif' }}>

        {/* Logo */}
        <a href="https://www.iarest.es" style={{ textDecoration: 'none', marginBottom: 40 }}>
          <span style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontWeight: 300, fontSize: 28, color: '#F6F1E7', letterSpacing: '.02em' }}>
            ia<span style={{ color: '#D9442B' }}>.</span>rest
          </span>
        </a>

        {/* Score principal */}
        <div style={{ background: '#1E1A15', border: `1px solid ${color}40`, borderRadius: 20, padding: '32px 40px', textAlign: 'center', marginBottom: 24, width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{dot}</div>
          <div style={{ fontSize: 32, fontWeight: 700, color, marginBottom: 6 }}>
            {score !== null ? `${score}/100` : '—'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#F6F1E7', marginBottom: 8 }}>{label}</div>
          {hace && <div style={{ fontSize: 12, color: '#6B5F52' }}>Última verificación {hace}</div>}
        </div>

        {/* Por categoría */}
        {catResumen.length > 0 && (
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {catResumen.map(({ cat, ok, total }) => {
              const pct = total > 0 ? ok / total : 1
              const c = pct === 1 ? '#3F7D44' : pct >= 0.8 ? '#E8A33B' : '#D9442B'
              return (
                <div key={cat} style={{ background: '#1E1A15', border: `1px solid #2E2720`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#D8CDB6' }}>{CAT_LABELS[cat] ?? cat}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c }}>
                    {pct === 1 ? '✓ OK' : `${ok}/${total}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ fontSize: 11, color: '#6B5F52', textAlign: 'center', lineHeight: 1.8 }}>
          Esta página se actualiza automáticamente cada 2 minutos.<br />
          <a href="https://www.iarest.es" style={{ color: '#D9442B', textDecoration: 'none' }}>www.iarest.es</a>
        </div>
      </body>
    </html>
  )
}
