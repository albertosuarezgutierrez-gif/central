'use client'

import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface WebConfig {
  existe: boolean
  activa?: boolean
  slug?: string
  slug_sugerido?: string
  logo_url?: string
  template?: string
  idiomas_activos?: string[]
  whatsapp?: string
  frase_bienvenida?: string
  descripcion_local?: string
  descripcion_barrio?: string
  horario_lunes?: string
  horario_martes?: string
  horario_miercoles?: string
  horario_jueves?: string
  horario_viernes?: string
  horario_sabado?: string
  horario_domingo?: string
  telefono_reservas?: string
  url_google_maps?: string
  url_reserva_directa?: string
  mostrar_carta?: boolean
  mostrar_reservas?: boolean
  color_acento?: string
  redes_sociales?: { instagram?: string; facebook?: string; tiktok?: string; tripadvisor?: string }
  visitas_total?: number
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const

export default function MiWebTab({ session }: { session: any }) {
  const [config, setConfig] = useState<WebConfig>({ existe: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [traduciendo, setTraduciendo] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    try {
      const r = await fetch('/api/owner/web', {
        headers: { 'x-ia-session': JSON.stringify(session) }
      })
      const d = await r.json()
      setConfig({
        ...d,
        slug: d.slug ?? d.slug_sugerido ?? '',
        mostrar_carta: d.mostrar_carta ?? true,
        mostrar_reservas: d.mostrar_reservas ?? true,
        color_acento: d.color_acento ?? '#D9442B',
        redes_sociales: d.redes_sociales ?? {},
      })
    } catch {
      setMsg({ tipo: 'error', texto: 'Error cargando configuración' })
    }
    setLoading(false)
  }

  async function guardar() {
    setSaving(true)
    setMsg(null)
    try {
      const r = await fetch('/api/owner/web', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
        body: JSON.stringify(config)
      })
      const d = await r.json()
      if (d.ok) {
        setMsg({ tipo: 'ok', texto: '✓ Web guardada correctamente' })
        setConfig(prev => ({ ...prev, existe: true }))
      } else {
        setMsg({ tipo: 'error', texto: d.error ?? 'Error al guardar' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de conexión' })
    }
    setSaving(false)
  }

  async function generarDescripcion() {
    setGenerando(true)
    setMsg(null)
    try {
      const r = await fetch('/api/owner/web/generar-descripcion', {
        method: 'POST',
        headers: { 'x-ia-session': JSON.stringify(session) }
      })
      const d = await r.json()
      if (d.ok) {
        setConfig(prev => ({
          ...prev,
          descripcion_local: d.descripcion_local,
          descripcion_barrio: d.descripcion_barrio,
        }))
        setMsg({ tipo: 'ok', texto: '✓ Descripción generada con IA' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error generando descripción' })
    }
    setGenerando(false)
  }

  async function subirLogo(file: File) {
    setSubiendoLogo(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append('logo', file)
      const r = await fetch('/api/owner/web/upload-logo', {
        method: 'POST',
        headers: { 'x-ia-session': JSON.stringify(session) },
        body: form
      })
      const d = await r.json()
      if (d.ok) {
        // Aplicar identidad corporativa extraída por IA
        setConfig(prev => ({
          ...prev,
          logo_url: d.logo_url,
          ...(d.color_acento ? { color_acento: d.color_acento } : {}),
          ...(d.template ? { template: d.template } : {}),
        }))
        if (d.identidad) {
          setMsg({
            tipo: 'ok',
            texto: `✓ Logo subido · IA detectó tu identidad corporativa: ${d.identidad.descripcion} · Color aplicado: ${d.color_acento}`
          })
        } else {
          setMsg({ tipo: 'ok', texto: '✓ Logo subido correctamente' })
        }
      } else {
        setMsg({ tipo: 'error', texto: d.error ?? 'Error al subir logo' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de conexión' })
    }
    setSubiendoLogo(false)
  }

  async function traducirCarta() {
    setTraduciendo(true)
    setMsg(null)
    try {
      const r = await fetch('/api/owner/web/traducir-carta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
        body: JSON.stringify({ idiomas: ['en', 'fr', 'de'] })
      })
      const d = await r.json()
      if (d.ok) {
        setConfig(prev => ({ ...prev, idiomas_activos: ['es', 'en', 'fr', 'de'] }))
        setMsg({ tipo: 'ok', texto: `✓ Carta traducida a inglés, francés y alemán (${d.platos_traducidos} platos)` })
      } else {
        setMsg({ tipo: 'error', texto: d.error ?? 'Error al traducir' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de conexión' })
    }
    setTraduciendo(false)
  }

  function descargarQR() {
    const a = document.createElement('a')
    a.href = '/api/owner/web/qr'
    a.setAttribute('x-ia-session', JSON.stringify(session))
    // Usamos fetch para incluir la sesión
    fetch('/api/owner/web/qr', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        a.href = url
        a.download = `qr-web-${config.slug ?? 'restaurante'}.png`
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  function set<K extends keyof WebConfig>(key: K, val: WebConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: val }))
  }

  function setRed(key: string, val: string) {
    setConfig(prev => ({ ...prev, redes_sociales: { ...(prev.redes_sociales ?? {}), [key]: val } }))
  }

  if (loading) return (
    <div style={{ padding: 32, fontFamily: SN, color: C.ink, opacity: 0.5 }}>Cargando...</div>
  )

  const urlPublica = config.slug ? `https://www.iarest.es/local/${config.slug}` : ''

  const s = {
    wrap: { padding: '24px', maxWidth: 700, margin: '0 auto' } as React.CSSProperties,
    sec: { background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 20, marginBottom: 16 } as React.CSSProperties,
    lbl: { fontFamily: SN, fontSize: 12, color: C.ink, opacity: 0.55, marginBottom: 4, display: 'block' } as React.CSSProperties,
    inp: { width: '100%', background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 12px', fontFamily: SN, fontSize: 14, color: C.ink, boxSizing: 'border-box' as const },
    ta: { width: '100%', background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 12px', fontFamily: SN, fontSize: 14, color: C.ink, resize: 'vertical' as const, minHeight: 80, boxSizing: 'border-box' as const },
    btn: { background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    btnSec: { background: 'transparent', color: C.ink, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 16px', fontFamily: SN, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
    row: { display: 'flex', gap: 12, alignItems: 'center' } as React.CSSProperties,
    g2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
    h3: { fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.ink, margin: '0 0 14px', textTransform: 'uppercase' as const, letterSpacing: 1, opacity: 0.7 },
    hr: { border: 'none', borderTop: `1px solid ${C.rule}`, margin: '16px 0' } as React.CSSProperties,
  }

  return (
    <div style={s.wrap}>

      {/* Cabecera */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...s.row, justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontFamily: SE, fontSize: 22, color: C.ink, margin: 0 }}>Mi Web</h2>
          <span style={{
            background: config.activa ? '#e8f5e9' : '#f5f0e8',
            color: config.activa ? '#2e7d32' : '#8a7a5a',
            borderRadius: 20, padding: '3px 12px',
            fontFamily: SN, fontSize: 12, fontWeight: 600
          }}>
            {config.activa ? 'Publicada' : 'Borrador'}
          </span>
        </div>
        <p style={{ fontFamily: SN, fontSize: 13, color: C.ink, opacity: 0.55, margin: 0 }}>
          Tu web incluida con ia.rest. Personalízala y publícala en minutos.
        </p>
      </div>

      {/* URL pública */}
      {config.slug && (
        <div style={{ ...s.sec, background: '#f0f7ff', borderColor: '#bdd7f5', marginBottom: 16 }}>
          <div style={{ ...s.row, justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...s.lbl, color: '#1a56db', opacity: 1 }}>URL de tu web</span>
              <div style={{ fontFamily: SM, fontSize: 13, color: '#1a56db', wordBreak: 'break-all' }}>
                {urlPublica}
              </div>
            </div>
            <a
              href={urlPublica} target="_blank" rel="noopener noreferrer"
              style={{ ...s.btnSec, textDecoration: 'none', whiteSpace: 'nowrap', color: '#1a56db', borderColor: '#bdd7f5' }}
            >
              Ver →
            </a>
          </div>
          {(config.visitas_total ?? 0) > 0 && (
            <p style={{ fontFamily: SN, fontSize: 11, color: '#1a56db', margin: '8px 0 0' }}>
              {config.visitas_total?.toLocaleString()} visitas totales
            </p>
          )}
        </div>
      )}

      {msg && (
        <div style={{
          background: msg.tipo === 'ok' ? '#e8f5e9' : '#fdecea',
          color: msg.tipo === 'ok' ? '#2e7d32' : '#c0392b',
          borderRadius: 8, padding: '10px 14px',
          fontFamily: SN, fontSize: 13, marginBottom: 16
        }}>
          {msg.texto}
        </div>
      )}

      {/* Estado */}
      <div style={s.sec}>
        <p style={s.h3}>Estado y URL</p>
        <label style={{ fontFamily: SN, fontSize: 14, color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={config.activa ?? false} onChange={e => set('activa', e.target.checked)} />
          Web publicada y visible para clientes
        </label>
        <div>
          <label style={s.lbl}>Slug de la URL</label>
          <input
            style={s.inp}
            value={config.slug ?? ''}
            onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
            placeholder="nombre-de-tu-restaurante"
          />
          <p style={{ fontFamily: SN, fontSize: 11, color: C.ink, opacity: 0.4, margin: '4px 0 0' }}>
            Solo letras minúsculas, números y guiones
          </p>
        </div>
      </div>

      {/* Logo */}
      <div style={s.sec}>
        <p style={s.h3}>Logo</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Preview */}
          <div style={{
            width: 80, height: 80, borderRadius: 12,
            border: `2px dashed ${config.logo_url ? C.green : C.rule}`,
            background: config.logo_url ? '#fff' : '#f8f6f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0
          }}>
            {config.logo_url
              ? <img src={config.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
              : <span style={{ fontSize: 28 }}>🏪</span>
            }
          </div>
          {/* Acciones */}
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'inline-block', cursor: 'pointer',
              background: C.red, color: '#fff', borderRadius: 8,
              padding: '9px 16px', fontFamily: SN, fontSize: 13, fontWeight: 600,
              opacity: subiendoLogo ? 0.6 : 1
            }}>
              {subiendoLogo ? 'Subiendo...' : '↑ Subir logo'}
              <input
                type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: 'none' }}
                disabled={subiendoLogo}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f) }}
              />
            </label>
            <p style={{ fontFamily: SN, fontSize: 11, color: C.ink, opacity: 0.4, margin: '6px 0 0' }}>
              PNG, JPG, SVG · Máx 2MB · Fondo transparente recomendado
            </p>
            {config.logo_url && (
              <button
                style={{ background: 'transparent', border: 'none', color: C.red, fontFamily: SN, fontSize: 12, cursor: 'pointer', padding: '4px 0', marginTop: 4 }}
                onClick={() => set('logo_url', undefined)}
              >
                Eliminar logo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div style={s.sec}>
        <div style={{ ...s.row, justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ ...s.h3, margin: 0 }}>Descripción</p>
          <button style={{ ...s.btnSec, fontSize: 12 }} onClick={generarDescripcion} disabled={generando}>
            {generando ? 'Generando...' : '✨ Generar con IA'}
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={s.lbl}>Frase de bienvenida</label>
          <input style={s.inp} value={config.frase_bienvenida ?? ''} onChange={e => set('frase_bienvenida', e.target.value)} placeholder="El mejor rincón de Triana desde 1987..." />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={s.lbl}>Sobre el local</label>
          <textarea style={s.ta} value={config.descripcion_local ?? ''} onChange={e => set('descripcion_local', e.target.value)} placeholder="Describe tu restaurante..." />
        </div>
        <div>
          <label style={s.lbl}>El barrio</label>
          <textarea style={{ ...s.ta, minHeight: 60 }} value={config.descripcion_barrio ?? ''} onChange={e => set('descripcion_barrio', e.target.value)} placeholder="Contexto sobre la zona..." />
        </div>
      </div>

      {/* Horarios */}
      <div style={s.sec}>
        <p style={s.h3}>Horarios</p>
        <div style={s.g2}>
          {DIAS.map(dia => (
            <div key={dia}>
              <label style={s.lbl}>{dia.charAt(0).toUpperCase() + dia.slice(1)}</label>
              <input
                style={s.inp}
                value={(config as any)[`horario_${dia}`] ?? ''}
                onChange={e => set(`horario_${dia}` as any, e.target.value)}
                placeholder="13:00–16:00 / 20:00–24:00"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Contacto */}
      <div style={s.sec}>
        <p style={s.h3}>Contacto y reservas</p>
        <div style={{ marginBottom: 12 }}>
          <label style={s.lbl}>Teléfono reservas</label>
          <input style={s.inp} value={config.telefono_reservas ?? ''} onChange={e => set('telefono_reservas', e.target.value)} placeholder="+34 954 000 000" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={s.lbl}>URL Google Maps</label>
          <input style={s.inp} value={config.url_google_maps ?? ''} onChange={e => set('url_google_maps', e.target.value)} placeholder="https://maps.google.com/..." />
        </div>
        <div>
          <label style={s.lbl}>URL reserva directa <span style={{ opacity: 0.5 }}>(para Google Business)</span></label>
          <input style={s.inp} value={config.url_reserva_directa ?? ''} onChange={e => set('url_reserva_directa', e.target.value)} placeholder={`https://www.iarest.es/local/${config.slug ?? 'tu-local'}#reservar`} />
        </div>
        <hr style={s.hr} />
        <p style={{ ...s.h3, marginBottom: 12 }}>Redes sociales</p>
        <div style={s.g2}>
          {(['instagram', 'facebook', 'tiktok', 'tripadvisor'] as const).map(red => (
            <div key={red}>
              <label style={s.lbl}>{red.charAt(0).toUpperCase() + red.slice(1)}</label>
              <input style={s.inp} value={config.redes_sociales?.[red] ?? ''} onChange={e => setRed(red, e.target.value)} placeholder={red === 'instagram' || red === 'tiktok' ? '@turestaurante' : 'URL'} />
            </div>
          ))}
        </div>
      </div>

      {/* Opciones */}
      <div style={s.sec}>
        <p style={s.h3}>Visualización</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <label style={{ fontFamily: SN, fontSize: 14, color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={config.mostrar_carta ?? true} onChange={e => set('mostrar_carta', e.target.checked)} />
            Mostrar carta en la web
          </label>
          <label style={{ fontFamily: SN, fontSize: 14, color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={config.mostrar_reservas ?? true} onChange={e => set('mostrar_reservas', e.target.checked)} />
            Mostrar formulario de reserva
          </label>
        </div>
        <div>
          <label style={s.lbl}>Color de acento</label>
          <div style={{ ...s.row, gap: 10 }}>
            <input
              type="color"
              value={config.color_acento ?? '#D9442B'}
              onChange={e => set('color_acento', e.target.value)}
              style={{ width: 40, height: 36, border: `1px solid ${C.rule}`, borderRadius: 6, cursor: 'pointer', padding: 2 }}
            />
            <span style={{ fontFamily: SM, fontSize: 13, color: C.ink }}>{config.color_acento ?? '#D9442B'}</span>
          </div>
        </div>
      </div>

      {/* Template */}
      <div style={s.sec}>
        <p style={s.h3}>Diseño</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([
            { id: 'clasico', label: 'El Clásico', desc: 'Dorado, editorial' },
            { id: 'urbano', label: 'Urbano', desc: 'Dark, bold, gastrobar' },
            { id: 'mediterraneo', label: 'Mediterráneo', desc: 'Cálido, naranja' },
            { id: 'taberna', label: 'De Toda la Vida', desc: 'Rojo, taberna' },
            { id: 'finedining', label: 'Fine Dining', desc: 'Negro y oro' },
          ] as const).map(t => (
            <div
              key={t.id}
              onClick={() => set('template', t.id)}
              style={{
                border: `2px solid ${config.template === t.id ? C.red : C.rule}`,
                borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                background: config.template === t.id ? '#fff5f3' : '#fff',
                transition: 'all .15s'
              }}
            >
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: config.template === t.id ? C.red : C.ink }}>{t.label}</div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink, opacity: 0.45, marginTop: 2 }}>{t.desc}</div>
            </div>
          ))}
        </div>
        {config.slug && (
          <a
            href={`/local/${config.slug}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 12, fontFamily: SN, fontSize: 12, color: '#1a56db', textDecoration: 'none' }}
          >
            Ver web con este diseño →
          </a>
        )}
      </div>

      {/* Multiidioma */}
      <div style={s.sec}>
        <div style={{ ...s.row, justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ ...s.h3, margin: 0 }}>Multiidioma</p>
          <button style={{ ...s.btnSec, fontSize: 12, opacity: traduciendo ? 0.6 : 1 }} onClick={traducirCarta} disabled={traduciendo}>
            {traduciendo ? 'Traduciendo...' : '🌍 Traducir carta con IA'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'es', label: '🇪🇸 Español', always: true },
            { id: 'en', label: '🇬🇧 Inglés' },
            { id: 'fr', label: '🇫🇷 Francés' },
            { id: 'de', label: '🇩🇪 Alemán' },
          ].map(lang => {
            const activo = config.idiomas_activos?.includes(lang.id)
            return (
              <div key={lang.id} style={{
                background: activo ? '#e8f5e9' : '#f5f5f5',
                color: activo ? '#2e7d32' : '#999',
                borderRadius: 20, padding: '5px 14px',
                fontFamily: SN, fontSize: 12, fontWeight: 600,
                border: `1px solid ${activo ? '#a5d6a7' : '#e0e0e0'}`
              }}>
                {lang.label} {activo ? '✓' : ''}
              </div>
            )
          })}
        </div>
        <p style={{ fontFamily: SN, fontSize: 11, color: C.ink, opacity: 0.4, margin: '8px 0 0' }}>
          La web detecta el idioma del visitante y muestra la carta en el suyo automáticamente
        </p>
      </div>

      {/* QR descargable */}
      {config.existe && config.slug && (
        <div style={s.sec}>
          <p style={s.h3}>QR de tu web</p>
          <div style={{ ...s.row, gap: 16 }}>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, opacity: 0.7, flex: 1, lineHeight: 1.6 }}>
              Descarga el QR para imprimir en mesas, tarjetas o escaparate. El cliente lo escanea y accede directamente a tu web.
            </div>
            <button style={{ ...s.btn, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={descargarQR}>
              ⬇ Descargar QR
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp */}
      <div style={s.sec}>
        <p style={s.h3}>WhatsApp reservas</p>
        <label style={s.lbl}>Número de WhatsApp <span style={{ opacity: 0.5 }}>(con prefijo país)</span></label>
        <input style={s.inp} value={config.whatsapp ?? ''} onChange={e => set('whatsapp', e.target.value)} placeholder="+34 600 000 000" />
        <p style={{ fontFamily: SN, fontSize: 11, color: C.ink, opacity: 0.4, margin: '4px 0 0' }}>
          Añade un botón de WhatsApp directo en la web para reservas
        </p>
      </div>

      {/* Guardar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, paddingBottom: 32 }}>
        <button style={{ ...s.btn, opacity: saving ? 0.6 : 1 }} onClick={guardar} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

    </div>
  )
}
