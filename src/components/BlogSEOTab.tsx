'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Borrador {
  id: string
  slug: string
  titulo: string
  keyword: string
  meta_description: string
  estado: 'borrador' | 'publicado' | 'rechazado'
  created_at: string
  published_at?: string
}

interface Props { session: any }

export default function BlogSEOTab({ session }: Props) {
  const [borradores, setBorradores] = useState<Borrador[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [accionando, setAccionando] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const headers = { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) }

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/blog-publicar', { headers })
    const data = await res.json()
    setBorradores(data.borradores || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function generar() {
    setGenerando(true)
    setMsg('')
    try {
      const res = await fetch('/api/cron/blog-seo', { headers: { ...headers, authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev'}` } })
      const data = await res.json()
      if (data.ok) {
        setMsg(`✅ Artículo generado: "${data.titulo}"`)
        cargar()
      } else {
        setMsg(`⚠️ ${data.msg || data.error}`)
      }
    } catch (e: any) {
      setMsg(`❌ Error: ${e.message}`)
    } finally {
      setGenerando(false)
    }
  }

  async function accion(id: string, tipo: 'publicar' | 'rechazar') {
    setAccionando(id + tipo)
    setMsg('')
    try {
      const res = await fetch('/api/super/blog-publicar', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, accion: tipo }),
      })
      const data = await res.json()
      if (data.ok) {
        setMsg(tipo === 'publicar'
          ? `✅ Publicado — Vercel desplegará en ~60s. URL: /blog/${borradores.find(b => b.id === id)?.slug}`
          : '✅ Borrador rechazado')
        cargar()
      } else {
        setMsg(`❌ Error: ${data.error}`)
      }
    } finally {
      setAccionando(null)
    }
  }

  const pendientes  = borradores.filter(b => b.estado === 'borrador')
  const publicados  = borradores.filter(b => b.estado === 'publicado')
  const rechazados  = borradores.filter(b => b.estado === 'rechazado')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>
          BLOG SEO · GENERACIÓN AUTOMÁTICA
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: SE, fontSize: 32, fontWeight: 500, margin: '0 0 4px', color: C.ink }}>Blog SEO</h1>
            <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: 0 }}>
              El cron genera artículos cada lunes. Aquí los revisas y publicas con un click.
            </p>
          </div>
          <button
            onClick={generar}
            disabled={generando}
            style={{
              background: generando ? C.rule : C.red, color: generando ? C.ink4 : '#fff',
              border: 'none', borderRadius: 8, padding: '10px 18px',
              fontFamily: SM, fontSize: 11, cursor: generando ? 'default' : 'pointer',
              letterSpacing: '.06em',
            }}
          >
            {generando ? '⏳ Generando...' : '⚡ GENERAR AHORA'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, fontFamily: SN, fontSize: 13,
          background: msg.startsWith('✅') ? C.green + '15' : msg.startsWith('⚠️') ? C.amber + '15' : C.red + '15',
          border: `1px solid ${msg.startsWith('✅') ? C.green + '40' : msg.startsWith('⚠️') ? C.amber + '40' : C.red + '40'}`,
          color: C.ink2,
        }}>{msg}</div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Pendientes', count: pendientes.length, color: C.amber },
          { label: 'Publicados', count: publicados.length, color: C.green },
          { label: 'Rechazados', count: rechazados.length, color: C.ink4 },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: C.bone, border: `1px solid ${C.rule}`,
            borderRadius: 8, padding: '12px 16px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: SE, fontSize: 28, color: s.color }}>{s.count}</div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em' }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.ink4, fontFamily: SM, fontSize: 12 }}>Cargando...</div>
      ) : (
        <>
          {/* Pendientes */}
          {pendientes.length > 0 && (
            <div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.amber, letterSpacing: '.1em', marginBottom: 12 }}>
                ⚡ PENDIENTES DE REVISIÓN
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendientes.map(b => (
                  <div key={b.id} style={{
                    background: C.bone, border: `1.5px solid ${C.amber}50`,
                    borderRadius: 10, padding: 18,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: SM, fontSize: 10, color: C.amber, letterSpacing: '.08em', marginBottom: 6 }}>
                          KEYWORD: {b.keyword}
                        </div>
                        <div style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
                          {b.titulo}
                        </div>
                        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 8, lineHeight: 1.5 }}>
                          {b.meta_description}
                        </div>
                        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                          /blog/{b.slug} · {new Date(b.created_at).toLocaleDateString('es-ES')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <a
                          href={`/api/super/blog-preview?id=${b.id}`}
                          target="_blank"
                          style={{
                            padding: '7px 12px', borderRadius: 6,
                            border: `1px solid ${C.rule}`, background: 'none',
                            color: C.ink3, fontFamily: SM, fontSize: 10,
                            textDecoration: 'none', letterSpacing: '.06em',
                          }}
                        >
                          👁 VER
                        </a>
                        <button
                          onClick={() => accion(b.id, 'rechazar')}
                          disabled={accionando === b.id + 'rechazar'}
                          style={{
                            padding: '7px 12px', borderRadius: 6,
                            border: `1px solid ${C.rule}`, background: 'none',
                            color: C.ink4, fontFamily: SM, fontSize: 10,
                            cursor: 'pointer', letterSpacing: '.06em',
                          }}
                        >
                          ✗ RECHAZAR
                        </button>
                        <button
                          onClick={() => accion(b.id, 'publicar')}
                          disabled={accionando === b.id + 'publicar'}
                          style={{
                            padding: '7px 16px', borderRadius: 6, border: 'none',
                            background: accionando === b.id + 'publicar' ? C.rule : C.green,
                            color: '#fff', fontFamily: SM, fontSize: 10,
                            cursor: accionando === b.id + 'publicar' ? 'default' : 'pointer',
                            letterSpacing: '.06em',
                          }}
                        >
                          {accionando === b.id + 'publicar' ? '⏳' : '✓ PUBLICAR'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Publicados */}
          {publicados.length > 0 && (
            <div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.green, letterSpacing: '.1em', marginBottom: 12 }}>
                ✅ PUBLICADOS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {publicados.map(b => (
                  <div key={b.id} style={{
                    background: C.bone, border: `1px solid ${C.rule}`,
                    borderRadius: 8, padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontFamily: SN, fontSize: 13, color: C.ink }}>{b.titulo}</div>
                      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2 }}>
                        /blog/{b.slug} · Publicado {b.published_at ? new Date(b.published_at).toLocaleDateString('es-ES') : '—'}
                      </div>
                    </div>
                    <a
                      href={`https://www.iarest.es/blog/${b.slug}`}
                      target="_blank"
                      style={{ fontFamily: SM, fontSize: 10, color: C.red, textDecoration: 'none', letterSpacing: '.06em' }}
                    >
                      VER →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {borradores.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10,
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
              <div style={{ fontFamily: SN, fontSize: 14, color: C.ink3 }}>
                Sin borradores todavía. Pulsa <strong>GENERAR AHORA</strong> para crear el primer artículo.
              </div>
            </div>
          )}
        </>
      )}

      {/* Info cron */}
      <div style={{
        background: C.paper2, border: `1px solid ${C.rule}`,
        borderRadius: 8, padding: '14px 18px', fontSize: 12, color: C.ink3,
      }}>
        <span style={{ fontFamily: SM, color: C.ink4, fontSize: 10, letterSpacing: '.08em' }}>CRON AUTOMÁTICO</span>
        <span style={{ marginLeft: 8 }}>Cada lunes a las 8:00 el agente analiza GSC, elige la mejor keyword sin artículo y genera el borrador automáticamente. Tú solo apruebas.</span>
      </div>
    </div>
  )
}
