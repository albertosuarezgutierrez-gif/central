// src/app/estado/page.tsx
// Página pública de estado del sistema ia.rest
// Accesible sin login en www.iarest.es/estado
// Argumento comercial: "somos tan seguros que el uptime es público"

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Estado del sistema · ia.rest',
  description: 'Estado en tiempo real de los servicios de ia.rest — TPV con IA para restaurantes.',
}

const C = {
  paper: '#F6F1E7', paper2: '#EFE7D6', paper3: '#E5DAC2',
  ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6',
  red: '#D9442B', redS: '#F4D8CF',
  amber: '#E8A33B', amberS: '#F7E3B6',
  green: '#3F7D44', greenS: '#D4E4D2',
  dark: '#14110E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

interface EstadoData {
  ok: boolean
  timestamp: string
  estado_general: 'operativo' | 'degradado' | 'incidencia'
  uptime_30d: number
  servicios: Array<{
    nombre: string
    descripcion: string
    estado: 'operativo' | 'degradado' | 'incidencia'
  }>
  incidencias_recientes: Array<{ hora: string; servicio: string }>
}

async function getEstado(): Promise<EstadoData | null> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const r = await fetch(`${baseUrl}/api/estado`, { next: { revalidate: 60 } })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ESTADO_CONFIG = {
  operativo:  { label: 'Operativo',  color: C.green,  bg: C.greenS, dot: C.green  },
  degradado:  { label: 'Degradado',  color: C.amber,  bg: C.amberS, dot: C.amber  },
  incidencia: { label: 'Incidencia', color: C.red,    bg: C.redS,   dot: C.red    },
}

const CAT_LABEL: Record<string, string> = {
  ear: 'Reconocimiento de voz', brain: 'IA/BRAIN', courier: 'Rutas',
  auth: 'Autenticación', stripe: 'Pagos', verifactu: 'Facturación',
  push: 'Notificaciones', db: 'Base de datos', system: 'Sistema',
}

export default async function EstadoPage() {
  const data = await getEstado()

  const estadoGeneral = data?.estado_general ?? 'operativo'
  const cfg = ESTADO_CONFIG[estadoGeneral]

  return (
    <div style={{ minHeight: '100vh', background: C.paper, fontFamily: SN, color: C.ink }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://www.iarest.es" style={{ fontFamily: SE, fontSize: 18, fontStyle: 'italic', color: C.red, textDecoration: 'none' }}>
          ia.rest
        </a>
        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em' }}>
          ESTADO DEL SISTEMA
        </span>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        {/* Banner estado general */}
        <div style={{
          background: cfg.bg,
          border: `1px solid ${cfg.color}`,
          borderRadius: 12, padding: '24px 28px',
          marginBottom: 40, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
            <span style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: cfg.color }}>
              {estadoGeneral === 'operativo'
                ? 'Todos los sistemas operativos'
                : estadoGeneral === 'degradado'
                ? 'Rendimiento reducido en algún servicio'
                : 'Incidencia activa en curso'
              }
            </span>
          </div>
          {data && (
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              Actualizado {relativo(data.timestamp)} · Uptime 30 días: {data.uptime_30d}%
            </div>
          )}
        </div>

        {/* Servicios */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 12 }}>
            SERVICIOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
            {(data?.servicios ?? [
              { nombre: 'App (TPV)', descripcion: 'Panel camarero, KDS, Owner', estado: 'operativo' as const },
              { nombre: 'Reconocimiento de voz (EAR)', descripcion: 'Whisper · Groq', estado: 'operativo' as const },
              { nombre: 'Interpretación IA (BRAIN)', descripcion: 'Claude · Anthropic', estado: 'operativo' as const },
              { nombre: 'Base de datos', descripcion: 'Supabase · EU West', estado: 'operativo' as const },
              { nombre: 'Facturación (VeriFactu)', descripcion: 'Generación de facturas legales', estado: 'operativo' as const },
            ]).map((s, i) => {
              const sc = ESTADO_CONFIG[s.estado]
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', background: C.paper2,
                  borderBottom: `1px solid ${C.rule}`,
                }}>
                  <div>
                    <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 500, color: C.ink }}>
                      {s.nombre}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 2 }}>
                      {s.descripcion}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: sc.bg, border: `1px solid ${sc.color}33`,
                    borderRadius: 999, padding: '4px 10px',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                    <span style={{ fontFamily: SM, fontSize: 10, color: sc.color, fontWeight: 700 }}>
                      {sc.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Incidencias recientes */}
        {(data?.incidencias_recientes ?? []).length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 12 }}>
              INCIDENCIAS RECIENTES (24H)
            </div>
            {data!.incidencias_recientes.map((inc, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: `1px solid ${C.rule}`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, flex: 1 }}>
                  {CAT_LABEL[inc.servicio] ?? inc.servicio}
                </span>
                <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
                  {relativo(inc.hora)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Sin incidencias */}
        {(data?.incidencias_recientes ?? []).length === 0 && (
          <div style={{
            background: C.greenS, border: `1px solid ${C.green}`,
            borderRadius: 8, padding: '16px 20px', textAlign: 'center', marginBottom: 40,
          }}>
            <div style={{ fontFamily: SE, fontSize: 15, fontStyle: 'italic', color: C.green }}>
              Sin incidencias en las últimas 24 horas
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontFamily: SM, fontSize: 11, color: C.ink4, borderTop: `1px solid ${C.rule}`, paddingTop: 24 }}>
          <a href="https://www.iarest.es" style={{ color: C.ink3, textDecoration: 'none' }}>
            ia.rest
          </a>
          {' · '}
          <a href="https://www.iarest.es/estado" style={{ color: C.ink4, textDecoration: 'none' }}>
            Esta página se actualiza cada 60 segundos
          </a>
        </div>
      </div>
    </div>
  )
}
