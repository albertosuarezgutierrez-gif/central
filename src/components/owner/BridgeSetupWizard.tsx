'use client'
// ============================================================
// ia.rest · BridgeSetupWizard
// Guía paso a paso que aparece tras instalar el bridge (?setup=1)
// 4 pasos: Bridge OK → Impresoras → Flujos → Prueba
// ============================================================
import { useState, useEffect } from 'react'

const C = {
  bg:    '#14110E',
  paper: '#F6F1E7',
  paper2:'#EDE8DF',
  bone:  '#1E1A16',
  red:   '#D9442B',
  redD:  '#A8311E',
  ink:   '#F6F1E7',
  ink2:  '#D8CDB6',
  ink3:  '#9A8F82',
  rule:  '#2E2925',
  green: '#3F7D44',
}
const SN = "'Inter Tight', sans-serif"

type Impresora = {
  id: string
  nombre: string
  ip_address: string | null
  port: number
  connection_type: string
  activa: boolean
}

const STEPS = [
  { id: 1, label: 'Bridge instalado',    icon: '✓' },
  { id: 2, label: 'Impresoras',          icon: '🖨' },
  { id: 3, label: 'Flujos de trabajo',   icon: '→' },
  { id: 4, label: 'Prueba real',         icon: '▶' },
]

export default function BridgeSetupWizard({
  setTab,
  session,
}: {
  setTab: (t: string) => void
  session: { restaurante_id: string }
}) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  const [step,        setStep]        = useState(1)
  const [impresoras,  setImpresoras]  = useState<Impresora[]>([])
  const [renaming,    setRenaming]    = useState<Record<string, string>>({})
  const [testStatus,  setTestStatus]  = useState<Record<string, 'idle'|'sending'|'sent'|'error'>>({})
  const [dismissed,   setDismissed]   = useState(false)
  const [minimized,   setMinimized]   = useState(false)

  useEffect(() => {
    const done = localStorage.getItem('ia_rest_bridge_setup_done')
    if (done) setDismissed(true)
  }, [])

  useEffect(() => {
    if (step === 2) loadImpresoras()
  }, [step])

  async function loadImpresoras() {
    try {
      const r = await fetch('/api/owner/impresoras', { headers: sh() })
      const d = await r.json()
      const local = (d.impresoras ?? []).filter((i: Impresora) => i.connection_type === 'ip_local')
      setImpresoras(local)
      const init: Record<string, string> = {}
      local.forEach((i: Impresora) => { init[i.id] = i.nombre })
      setRenaming(init)
    } catch {}
  }

  async function saveNombre(id: string) {
    const nombre = renaming[id]?.trim()
    if (!nombre) return
    await fetch('/api/owner/impresoras', {
      method: 'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nombre }),
    })
    setImpresoras(prev => prev.map(i => i.id === id ? { ...i, nombre } : i))
  }

  async function sendTest(imp: Impresora) {
    setTestStatus(p => ({ ...p, [imp.id]: 'sending' }))
    try {
      const r = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'test', impresora_id: imp.id }),
      })
      const d = await r.json()
      setTestStatus(p => ({ ...p, [imp.id]: d.ok ? 'sent' : 'error' }))
    } catch {
      setTestStatus(p => ({ ...p, [imp.id]: 'error' }))
    }
  }

  function goFlujos() {
    setTab('flujos')
    setStep(3)
  }

  function finish() {
    localStorage.setItem('ia_rest_bridge_setup_done', '1')
    setDismissed(true)
    // Remove ?setup from URL without reload
    const url = new URL(window.location.href)
    url.searchParams.delete('setup')
    window.history.replaceState({}, '', url.toString())
  }

  if (dismissed) return null

  return (
    <>
      {/* Overlay fondo oscuro */}
      {!minimized && (
        <div
          onClick={() => setMinimized(true)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(20,17,14,0.6)',
            zIndex: 999,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Panel wizard */}
      <div style={{
        position:   'fixed',
        right:      0,
        top:        0,
        bottom:     0,
        width:      minimized ? 56 : 'min(420px, 100vw)',
        background: C.bg,
        borderLeft: `1px solid ${C.rule}`,
        zIndex:     1000,
        display:    'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease',
        overflow:   'hidden',
      }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '16px 20px',
          borderBottom:   `1px solid ${C.rule}`,
          flexShrink:     0,
        }}>
          {!minimized && (
            <div>
              <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 16, color: C.ink }}>
                Configuración inicial
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
                Sigue los pasos para empezar
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: minimized ? 'auto' : 0 }}>
            <button
              onClick={() => setMinimized(p => !p)}
              style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', padding: 4, fontSize: 18 }}
              title={minimized ? 'Expandir' : 'Minimizar'}
            >
              {minimized ? '◀' : '▶'}
            </button>
            {!minimized && (
              <button
                onClick={finish}
                style={{ background: 'none', border: 'none', color: C.ink3, cursor: 'pointer', padding: 4, fontSize: 18 }}
                title="Cerrar"
              >×</button>
            )}
          </div>
        </div>

        {!minimized && (
          <>
            {/* Progress steps */}
            <div style={{
              display:        'flex',
              padding:        '16px 20px',
              gap:            8,
              borderBottom:   `1px solid ${C.rule}`,
              flexShrink:     0,
            }}>
              {STEPS.map((s, i) => {
                const done    = step > s.id
                const current = step === s.id
                return (
                  <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width:      28, height: 28, borderRadius: '50%',
                      background: done ? C.green : current ? C.red : C.bone,
                      border:     `1px solid ${done ? C.green : current ? C.red : C.rule}`,
                      display:    'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize:   12, fontWeight: 700, color: C.ink,
                      fontFamily: SN,
                    }}>
                      {done ? '✓' : s.id}
                    </div>
                    <div style={{ fontSize: 9, color: done ? C.green : current ? C.ink : C.ink3, fontFamily: SN, textAlign: 'center', lineHeight: 1.2 }}>
                      {s.label}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ position: 'absolute', display: 'none' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Step content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px' }}>

              {/* PASO 1: Bridge OK */}
              {step === 1 && (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>✅</div>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 18, color: C.ink, textAlign: 'center', marginBottom: 8 }}>
                    Bridge instalado correctamente
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2, textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
                    El Bridge está conectado a ia.rest y escuchando trabajos de impresión.
                  </div>
                  <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>
                      <div>✓ Bridge ejecutándose en este ordenador</div>
                      <div>✓ Token verificado con ia.rest</div>
                      <div>✓ Impresoras detectadas en red</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    style={{
                      width: '100%', padding: '14px', background: C.red, color: C.ink,
                      border: 'none', borderRadius: 10, fontFamily: SN, fontWeight: 700,
                      fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    Siguiente → Mis impresoras
                  </button>
                </div>
              )}

              {/* PASO 2: Impresoras */}
              {step === 2 && (
                <div>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 6 }}>
                    Tus impresoras
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
                    Pulsa <strong style={{ color: C.ink }}>TEST</strong> en cada una para saber cuál es cuál — saldrá un ticket. Luego ponle el nombre que quieras.
                  </div>

                  {impresoras.length === 0 ? (
                    <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 20, textAlign: 'center', color: C.ink3, fontSize: 13, fontFamily: SN, marginBottom: 20 }}>
                      No se encontraron impresoras locales.<br/>
                      <span style={{ fontSize: 12 }}>Asegúrate de que el bridge está en la misma red que las impresoras.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {impresoras.map(imp => (
                        <div key={imp.id} style={{
                          background: C.bone, border: `1px solid ${C.rule}`,
                          borderRadius: 10, padding: '14px 16px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 18 }}>🖨</span>
                            <div style={{ flex: 1 }}>
                              <input
                                value={renaming[imp.id] ?? imp.nombre}
                                onChange={e => setRenaming(p => ({ ...p, [imp.id]: e.target.value }))}
                                onBlur={() => saveNombre(imp.id)}
                                style={{
                                  background: 'transparent', border: 'none',
                                  borderBottom: `1px solid ${C.rule}`, color: C.ink,
                                  fontFamily: SN, fontWeight: 600, fontSize: 14,
                                  width: '100%', outline: 'none', padding: '2px 0',
                                }}
                              />
                              <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>
                                {imp.ip_address}:{imp.port}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => sendTest(imp)}
                            disabled={testStatus[imp.id] === 'sending'}
                            style={{
                              width: '100%', padding: '8px',
                              background: testStatus[imp.id] === 'sent' ? C.green : C.redD,
                              color: C.ink, border: 'none', borderRadius: 6,
                              fontFamily: SN, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            {testStatus[imp.id] === 'sending' ? 'Enviando...'
                              : testStatus[imp.id] === 'sent' ? '✓ Ticket enviado'
                              : testStatus[imp.id] === 'error' ? '✗ Sin respuesta'
                              : 'TEST — imprimir ticket de prueba'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={goFlujos}
                    style={{
                      width: '100%', padding: '14px', background: C.red, color: C.ink,
                      border: 'none', borderRadius: 10, fontFamily: SN, fontWeight: 700,
                      fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    Siguiente → Flujos de trabajo
                  </button>
                </div>
              )}

              {/* PASO 3: Flujos */}
              {step === 3 && (
                <div>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 6 }}>
                    Flujos de trabajo
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.6, marginBottom: 20 }}>
                    Ahora dile a ia.rest qué impresora imprime cada sección.
                  </div>

                  <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600, marginBottom: 10 }}>Cómo hacerlo:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { n: '1', t: 'Pulsa "+ Nueva regla"' },
                        { n: '2', t: 'Elige la sección (ej: Barra, Cocina)' },
                        { n: '3', t: 'Elige tu impresora (ej: Impresora 1)' },
                        { n: '4', t: 'Repite para cada sección' },
                      ].map(s => (
                        <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', background: C.red,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: C.ink, flexShrink: 0,
                          }}>{s.n}</div>
                          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{s.t}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 16, padding: '10px 14px', background: C.bone, borderRadius: 8, border: `1px solid ${C.rule}` }}>
                    💡 Los flujos están en el panel de abajo. Esta guía queda minimizada para que puedas trabajar.
                  </div>

                  <button
                    onClick={() => { setMinimized(true); setStep(4) }}
                    style={{
                      width: '100%', padding: '14px', background: C.red, color: C.ink,
                      border: 'none', borderRadius: 10, fontFamily: SN, fontWeight: 700,
                      fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    Entendido — voy a crear los flujos
                  </button>
                </div>
              )}

              {/* PASO 4: Prueba real */}
              {step === 4 && (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>🎉</div>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 18, color: C.ink, textAlign: 'center', marginBottom: 8 }}>
                    ¡Casi listo!
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.6, textAlign: 'center', marginBottom: 24 }}>
                    Haz un pedido de prueba para comprobar que todo funciona de verdad.
                  </div>

                  <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600, marginBottom: 8 }}>Prueba rápida:</div>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>
                      1. Ve a la pantalla del camarero (<strong style={{ color: C.ink }}>/edge</strong>)<br/>
                      2. Di un pedido por voz o escríbelo<br/>
                      3. Pulsa <strong style={{ color: C.ink }}>Marchar</strong><br/>
                      4. La impresora debe imprimir el ticket ✓
                    </div>
                  </div>

                  <a
                    href="/edge"
                    style={{
                      display: 'block', width: '100%', padding: '14px',
                      background: C.green, color: C.ink, textDecoration: 'none',
                      border: 'none', borderRadius: 10, fontFamily: SN, fontWeight: 700,
                      fontSize: 15, cursor: 'pointer', textAlign: 'center', marginBottom: 12,
                      boxSizing: 'border-box',
                    }}
                  >
                    Abrir pantalla del camarero
                  </a>

                  <button
                    onClick={finish}
                    style={{
                      width: '100%', padding: '12px', background: 'transparent', color: C.ink3,
                      border: `1px solid ${C.rule}`, borderRadius: 10, fontFamily: SN,
                      fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Todo funciona — cerrar guía
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
