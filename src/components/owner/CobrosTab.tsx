'use client'
// CobrosTab v1.0 — Portal de cobros para eventos y congresos
import { useState, useEffect } from 'react'
import { C, SE, SN } from '@/lib/colors'

interface CobrosTabProps {
  restauranteId: string
  sh: () => Record<string, string>
}

export default function CobrosTab({ restauranteId, sh }: CobrosTabProps) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 0' }}>
      {/* Banner próximamente */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.rule}`,
        borderRadius: 14, padding: '2rem', textAlign: 'center'
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `rgba(217,68,43,.1)`, border: `1px solid ${C.red}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
        </div>
        <h2 style={{ fontFamily: SE, fontSize: '1.4rem', color: C.paper, margin: '0 0 .5rem' }}>
          Portal de Cobros
        </h2>
        <p style={{ fontFamily: SN, fontSize: '0.9rem', color: C.ink3, margin: '0 0 1.5rem', lineHeight: 1.6 }}>
          Crea portales de pago para tus eventos y congresos.<br/>
          Cada invitado elige su menú y paga directamente desde su móvil.
        </p>

        {/* Demo link */}
        <div style={{
          background: C.bg3, border: `1px solid ${C.rule}`,
          borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', textAlign: 'left'
        }}>
          <p style={{ fontFamily: SN, fontSize: '0.75rem', color: C.ink3, margin: '0 0 .4rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Demo disponible</p>
          <a href="https://www.iarest.es/demo-saboga.html" target="_blank"
            style={{ fontFamily: SN, fontSize: '0.9rem', color: C.red, textDecoration: 'none' }}>
            www.iarest.es/demo-saboga.html →
          </a>
          <p style={{ fontFamily: SN, fontSize: '0.75rem', color: C.ink4, margin: '.4rem 0 0' }}>
            Prueba el flujo completo: crear cobro, menús, PDF y vista del cliente
          </p>
        </div>

        {/* Funcionalidades */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { icon: '📋', text: 'N menús con PDF adjunto' },
            { icon: '🔗', text: 'Link único por evento' },
            { icon: '💳', text: 'Pago directo con tarjeta' },
            { icon: '📊', text: 'Historial en tiempo real' },
          ].map((f, i) => (
            <div key={i} style={{
              background: C.bg3, border: `1px solid ${C.rule}`,
              borderRadius: 8, padding: '.75rem', textAlign: 'center'
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
              <p style={{ fontFamily: SN, fontSize: '0.78rem', color: C.ink2, margin: 0, lineHeight: 1.4 }}>{f.text}</p>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: SN, fontSize: '0.8rem', color: C.ink4, margin: 0 }}>
          Módulo en desarrollo activo · Disponible próximamente
        </p>
      </div>
    </div>
  )
}
