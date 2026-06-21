'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

type Invitado = {
  id: string; nombre: string; mesa_asignada: string | null
  menu_especial: string | null; checkin_at: string | null; invitado_plus: boolean
}

type EventoInfo = {
  numero_evento: string; tipo: string; fecha_evento: string
  hora_inicio: string | null; cliente_nombre: string
  restaurantes: { nombre: string } | null
}

const TIPO_LABELS: Record<string, string> = {
  boda: '💍 Boda', comunion: '⛪ Comunión', bautizo: '👶 Bautizo',
  cumpleanos: '🎂 Cumpleaños', empresa: '🏢 Evento', otro: '📅 Evento'
}

export default function CheckinEventoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [invitado, setInvitado] = useState<Invitado | null>(null)
  const [evento, setEvento] = useState<EventoInfo | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'ya_hecho' | 'error'>('cargando')
  const [error, setError] = useState('')

  useEffect(() => {
    const cargar = async () => {
      // Buscar invitado por token
      const { data: inv, error: err } = await supabase
        .from('evento_invitados')
        .select('*')
        .eq('qr_token', token)
        .single()

      if (err || !inv) { setEstado('error'); setError('QR no válido o expirado.'); return }

      // Cargar info del evento
      const { data: ev } = await supabase
        .from('eventos')
        .select('numero_evento, tipo, fecha_evento, hora_inicio, cliente_nombre, restaurantes(nombre)')
        .eq('id', inv.evento_id)
        .single()

      setInvitado(inv)
      setEvento(ev as unknown as EventoInfo)

      if (inv.checkin_at) { setEstado('ya_hecho'); return }

      // Hacer check-in automático
      const { error: ciErr } = await supabase
        .from('evento_invitados')
        .update({ checkin_at: new Date().toISOString() })
        .eq('id', inv.id)

      if (ciErr) { setEstado('error'); setError('Error al registrar entrada.'); return }
      setInvitado(prev => prev ? { ...prev, checkin_at: new Date().toISOString() } : null)
      setEstado('ok')
    }
    cargar()
  }, [token])

  const fmt_fecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  const K = { bg: '#1A1714', paper: '#F6F1E7', red: '#D9442B', green: '#3F7D44', amber: '#E8A33B', rule: '#3A332C', ink3: '#6B5F52' }

  return (
    <div style={{ minHeight: '100vh', background: K.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <svg width="40" height="40" viewBox="0 0 56 56" style={{ margin: '0 auto' }}>
            <rect width="56" height="56" rx="10" fill="#2A2219"/>
            <g transform="translate(11,14)">
              <rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/>
              <rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/>
              <rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/>
              <rect x="18" y="8" width="3" height="12" rx="1.5" fill="#F6F1E7"/>
              <rect x="24" y="4" width="3" height="20" rx="1.5" fill="#F6F1E7"/>
              <rect x="30" y="10" width="3" height="8" rx="1.5" fill="#F6F1E7"/>
            </g>
          </svg>
        </div>

        {estado === 'cargando' && (
          <div style={{ textAlign: 'center', color: K.ink3, fontFamily: 'system-ui', fontSize: 14 }}>
            Verificando invitación...
          </div>
        )}

        {estado === 'error' && (
          <div style={{ background: K.red + '22', border: `1px solid ${K.red}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <div style={{ color: K.paper, fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>QR no válido</div>
            <div style={{ color: K.ink3, fontFamily: 'system-ui', fontSize: 13 }}>{error}</div>
          </div>
        )}

        {(estado === 'ok' || estado === 'ya_hecho') && invitado && evento && (
          <div style={{ background: '#2A2219', border: `1px solid ${K.rule}`, borderRadius: 16, overflow: 'hidden' }}>

            {/* Header evento */}
            <div style={{ background: estado === 'ok' ? K.green : K.amber, padding: '16px 20px' }}>
              <div style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
                {estado === 'ok' ? '✓ Entrada registrada' : 'Ya registrado anteriormente'}
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontStyle: 'italic', color: '#fff', fontWeight: 700 }}>
                {evento.restaurantes?.nombre ?? ''}
              </div>
            </div>

            {/* Datos evento */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${K.rule}` }}>
              <div style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 700, color: K.paper, marginBottom: 4 }}>
                {TIPO_LABELS[evento.tipo]} · {evento.cliente_nombre}
              </div>
              <div style={{ fontFamily: 'system-ui', fontSize: 13, color: K.ink3 }}>
                {fmt_fecha(evento.fecha_evento)}{evento.hora_inicio ? ` · ${evento.hora_inicio}` : ''}
              </div>
            </div>

            {/* Datos invitado */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontFamily: 'system-ui', fontSize: 11, color: K.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
                Invitado
              </div>
              <div style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: K.paper, marginBottom: 12 }}>
                {invitado.nombre}
              </div>

              {invitado.mesa_asignada && (
                <div style={{ background: '#1A1714', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'system-ui', fontSize: 11, color: K.ink3, marginBottom: 2 }}>Mesa asignada</div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontStyle: 'italic', color: K.paper, fontWeight: 700 }}>
                    {invitado.mesa_asignada}
                  </div>
                </div>
              )}

              {invitado.menu_especial && (
                <div style={{ background: K.amber + '22', border: `1px solid ${K.amber}44`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'system-ui', fontSize: 11, color: K.amber, marginBottom: 2 }}>⚠ Menú especial</div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 13, color: K.paper }}>{invitado.menu_especial}</div>
                </div>
              )}

              {invitado.invitado_plus && (
                <div style={{ fontFamily: 'system-ui', fontSize: 12, color: K.ink3, marginTop: 8 }}>
                  👥 Entrada con acompañante
                </div>
              )}

              <div style={{ marginTop: 16, fontFamily: 'system-ui', fontSize: 11, color: K.ink3, textAlign: 'center' }}>
                {evento.numero_evento}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
