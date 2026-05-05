// src/components/AlertaBanner.tsx
// Banner de alertas activas para el camarero en /edge
// Se muestra arriba con animación slideDown, lee por TTS, botón "Visto ✓"

'use client'

import { useEffect, useRef } from 'react'
import type { AlertaActiva } from '@/hooks/useAlertas'

const ICONOS: Record<string, string> = {
  mesa_sin_pedir:        '🪑',
  ticket_sin_marcar:     '🍳',
  esperando_cuenta:      '💳',
  mesa_tiempo_total:     '⏱',
  mesa_sin_camarero:     '👤',
  solo_bebidas:          '🍺',
  num_items_bajo:        '📋',
  importe_bajo:          '€',
  producto_86_frecuente: '⚠️',
  latencia_alta:         '📡',
}

function getIcono(tipos: string[]): string {
  if (tipos.includes('ticket_sin_marcar') && tipos.includes('mesa_tiempo_total')) return '🚨'
  return ICONOS[tipos[0]] ?? '🔔'
}

interface Props {
  alertas: AlertaActiva[]
  onMarcarLeida: (id: string) => void
}

export default function AlertaBanner({ alertas, onMarcarLeida }: Props) {
  const audioRef = useRef<boolean>(false)

  // Recibir mensajes del service worker para TTS al reabrir app
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'ALERTA_VOZ' && event.data.mensaje && !audioRef.current) {
        audioRef.current = true
        const utt = new SpeechSynthesisUtterance(event.data.mensaje)
        utt.lang = 'es-ES'
        utt.rate = 0.95
        utt.onend = () => { audioRef.current = false }
        window.speechSynthesis.speak(utt)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  if (!alertas.length) return null

  const alerta    = alertas[0]
  const icono     = getIcono(alerta.trigger_tipos)
  const esUrgente =
    (alerta.trigger_tipos.includes('ticket_sin_marcar') && alerta.trigger_tipos.includes('mesa_tiempo_total')) ||
    alerta.trigger_tipos.includes('esperando_cuenta')

  return (
    <div
      style={{
        position:  'fixed',
        top:       0,
        left:      0,
        right:     0,
        zIndex:    999,
        background: esUrgente ? '#D9442B' : '#1A1714',
        color:     '#F6F1E7',
        padding:   '12px 16px',
        display:   'flex',
        alignItems: 'center',
        gap:       '12px',
        fontFamily: "'Inter Tight', sans-serif",
        fontSize:  '13px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        animation: 'iaAlertaSlide 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      <style>{`
        @keyframes iaAlertaSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>

      <span style={{ fontSize: '20px', flexShrink: 0 }}>{icono}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: '2px', fontSize: '12px', opacity: 0.75 }}>
          {alerta.regla_nombre}
          {alertas.length > 1 && (
            <span style={{
              marginLeft: '8px',
              background: 'rgba(255,255,255,0.2)',
              padding: '1px 6px',
              borderRadius: '10px',
              fontSize: '10px',
            }}>
              +{alertas.length - 1} más
            </span>
          )}
        </div>
        <div style={{ lineHeight: 1.4 }}>{alerta.mensaje_voz}</div>
      </div>

      <button
        onClick={() => onMarcarLeida(alerta.id)}
        style={{
          background:   'rgba(255,255,255,0.15)',
          border:       '1px solid rgba(255,255,255,0.3)',
          color:        '#F6F1E7',
          padding:      '6px 14px',
          borderRadius: '3px',
          fontSize:     '12px',
          fontWeight:   600,
          cursor:       'pointer',
          flexShrink:   0,
          fontFamily:   "'Inter Tight', sans-serif",
        }}
      >
        Visto ✓
      </button>
    </div>
  )
}
