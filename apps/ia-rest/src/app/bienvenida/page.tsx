'use client'
import { SE, SN, SM } from '@/lib/colors'
// /bienvenida — Pantalla post-pago con datos clave del restaurante
// Accesible vía: /bienvenida?r=CODIGO tras el checkout de Stripe

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@supabase/supabase-js'
import { SB_OPTS } from '@/lib/supabase'

const C = {
  bg: '#14110E', e1: '#1E1A16', e2: '#252018',
  rule: '#2E2925', rule2: '#3A342E',
  fg: '#F6F1E7', fg2: '#D8CDB6', fg3: '#9A8F82',
  red: '#D9442B', redS: 'rgba(217,68,43,.1)',
  green: '#3F7D44', greenS: 'rgba(63,125,68,.1)',
  amber: '#E8A33B', amberS: 'rgba(232,163,59,.1)',
  pur: '#9B6BE8', purS: 'rgba(155,107,232,.1)',
}

function CopyBox({ label, value, sub, mono = true }: { label: string; value: string; sub?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: SM, fontSize: 10, color: C.fg3, letterSpacing: '.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.e2, border: `1px solid ${C.rule2}`, borderRadius: 8, padding: '11px 14px' }}>
        <span style={{ flex: 1, fontFamily: mono ? SM : SN, fontSize: mono ? 12 : 14, color: C.fg, wordBreak: 'break-all', lineHeight: 1.4 }}>
          {value}
        </span>
        <button
          onClick={copy}
          style={{ background: C.e1, border: `1.5px solid ${C.rule2}`, borderRadius: 6, color: copied ? C.green : C.fg3, fontSize: 11, padding: '4px 9px', cursor: 'pointer', fontFamily: SN, flexShrink: 0, transition: 'all .15s' }}
        >
          {copied ? '✓' : 'Copiar'}
        </button>
      </div>
      {sub && <p style={{ fontFamily: SN, fontSize: 11, color: C.fg3, margin: '5px 0 0', lineHeight: 1.5 }}>{sub}</p>}
    </div>
  )
}

export default function BienvenidaPage() {
  const { session, checking } = useAuth('owner')
  const [datos, setDatos] = useState<{
    nombre: string
    codigo_acceso: string
    pin_owner: string | null
    bridge_token: string | null
    email: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const sh = () => ({ 'x-ia-session': typeof localStorage !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : '' })

  useEffect(() => {
    if (!session) return
    const cargar = async () => {
      try {
        // Cargar datos del restaurante
        const r = await fetch('/api/owner/restaurante', { headers: sh() })
        const d = await r.json()

        // Cargar token bridge
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SB_OPTS
        )
        const { data: bt } = await sb
          .from('bridge_tokens')
          .select('token')
          .eq('local_id', d.id)
          .eq('activo', true)
          .single()

        setDatos({
          nombre:        d.nombre,
          codigo_acceso: d.codigo_acceso,
          pin_owner:     null, // El PIN está en sesión, no lo re-exponemos por seguridad
          bridge_token:  bt?.token ?? null,
          email:         null, // El email se envía por webhook, no está en sesión local
        })
      } catch {
        setDatos(null)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [session])

  if (checking || loading) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SE, fontSize: 20, fontStyle: 'italic', color: C.fg3 }}>Cargando…</div>
    </div>
  )

  const urlAcceso = datos?.codigo_acceso
    ? `www.iarest.es/login?r=${datos.codigo_acceso}`
    : 'www.iarest.es/owner'

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', color: C.fg, fontFamily: SN }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.greenS, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>
            🎉
          </div>
          <h1 style={{ fontFamily: SE, fontSize: 32, fontWeight: 700, margin: '0 0 6px' }}>
            ¡Bienvenido a <span style={{ color: C.red }}>ia.rest</span>!
          </h1>
          <p style={{ fontSize: 14, color: C.fg3, margin: 0 }}>
            Trial de 14 días activo · Sin cargos hasta el día 14
          </p>
          <div style={{ marginTop: 10, background: C.greenS, border: `1px solid rgba(63,125,68,.3)`, borderRadius: 8, padding: '8px 14px', display: 'inline-block' }}>
              <p style={{ fontFamily: SN, fontSize: 12, color: C.green, margin: 0 }}>
                ✉ Datos de acceso enviados por email al registrarte
              </p>
            </div>
        </div>

        {/* Datos críticos */}
        <div style={{ background: C.e1, border: `1px solid ${C.rule2}`, borderRadius: 12, padding: '20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>📌</span>
            <p style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.fg2, margin: 0 }}>
              Guarda estos datos — los necesitarás siempre
            </p>
          </div>

          <CopyBox
            label="URL de acceso de tu restaurante"
            value={urlAcceso}
            sub="Esta URL la usan tus camareros y cocina para acceder desde el móvil"
            mono={false}
          />

          <CopyBox
            label="Panel de owner (gestión completa)"
            value="www.iarest.es/owner"
            sub="Tu PIN lo tienes en el email. Entra con él para empezar la configuración"
            mono={false}
          />

          {datos?.bridge_token && (
            <CopyBox
              label="Token bridge (para conectar impresoras)"
              value={datos.bridge_token}
              sub="Lo pegas en iarest-bridge-v6.exe durante la instalación"
            />
          )}
        </div>

        {/* Screenshot alert */}
        <div style={{ background: C.amberS, border: `1px solid rgba(232,163,59,.25)`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📱</span>
          <div>
            <p style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.amber, margin: '0 0 3px' }}>Haz screenshot ahora</p>
            <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: 0, lineHeight: 1.5 }}>
              Los datos también están en el email, pero tenerlos a mano acelera la configuración inicial.
            </p>
          </div>
        </div>

        {/* CTAs */}
        <button
          onClick={() => window.location.href = '/onboarding'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: C.green, border: 'none', color: '#fff', borderRadius: 8, padding: '13px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8, fontFamily: SN }}
        >
          Empezar configuración →
        </button>

        <button
          onClick={() => window.location.href = '/owner'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: C.e1, border: `1.5px solid ${C.rule2}`, color: C.fg3, borderRadius: 8, padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SN }}
        >
          Ir al panel de owner directamente
        </button>

      </div>
    </div>
  )
}
