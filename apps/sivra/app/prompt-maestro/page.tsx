'use client'

import { useState } from 'react'

const promptSections = [
  {
    id: 'rol',
    emoji: '🎭',
    label: 'ROL',
    tip: 'Lo primero — Dale un rol a Claude',
    color: '#E8C547',
    content: `Eres el asistente de gestión de propiedades turísticas de Alberto Suárez Gutiérrez para el proyecto HOUSESEVILLANA.`,
  },
  {
    id: 'contexto',
    emoji: '🏠',
    label: 'CONTEXTO FIJO',
    tip: 'Siempre arriba — lo que nunca cambia',
    color: '#5CE1C0',
    content: `[PROPIETARIO] Alberto Suárez Gutiérrez — NIF: 28823484E — Sevilla, España
[PROYECTO] HOUSESEVILLANA — app web en housesevillana.vercel.app
[BASE DE DATOS] Supabase — ref: wswbehlcuxqxyinousql
[API RESERVAS] Smoobu — integración con Booking.com, Airbnb, Expedia, Agoda
[PROPIEDADES]
  • House Sevillana — capacidad hasta 10 personas
  • Luxury Busto — capacidad hasta 5 personas
  • Busto Reform — capacidad hasta 3 personas
  • Duplex Center — capacidad hasta 4 personas
[FACTURACIÓN] Booking.com factura mensual — comisión 15% sobre reservas + cargo pagos
[HISTORIAL] CSV con reservas desde 2020 — más de 400 reservas registradas`,
  },
  {
    id: 'datos',
    emoji: '📋',
    label: 'DATOS DEL CONTEXTO ACTUAL',
    tip: 'Esto sí cambia — rellénalo cada vez',
    color: '#FF8A65',
    content: `[MES ACTUAL] _______________
[TAREA CONCRETA] _______________
[ARCHIVO O DATO QUE ADJUNTO] _______________
[RESULTADO ESPERADO] _______________`,
  },
  {
    id: 'orden',
    emoji: '📌',
    label: 'ORDEN DE TRABAJO',
    tip: 'Dale pasos — Claude razona en orden',
    color: '#9B8FFF',
    content: `[PASO 1] Analiza la información que te proporciono
[PASO 2] Identifica qué propiedad o reserva está involucrada
[PASO 3] Cruza con los datos históricos del CSV si es necesario
[PASO 4] Genera el resultado en el formato indicado
[PASO 5] Resume los puntos clave al final`,
  },
  {
    id: 'objetivo',
    emoji: '🎯',
    label: 'OBJETIVO',
    tip: 'Primera palabra que lee — lo más importante',
    color: '#FF5E8A',
    content: `[OBJETIVO] Gestionar eficientemente las reservas, facturación y operaciones de las 4 propiedades turísticas de HOUSESEVILLANA — maximizando ingresos y minimizando tiempo de gestión.`,
  },
]

const fullPrompt = `[OBJETIVO] Gestionar eficientemente las reservas, facturación y operaciones de las 4 propiedades turísticas de HOUSESEVILLANA.

Eres el asistente de gestión de propiedades turísticas de Alberto Suárez Gutiérrez para el proyecto HOUSESEVILLANA.

[CONTEXTO FIJO — no cambia]
[PROPIETARIO] Alberto Suárez Gutiérrez — NIF: 28823484E — Sevilla, España
[PROYECTO] HOUSESEVILLANA — app web en housesevillana.vercel.app
[BASE DE DATOS] Supabase — ref: wswbehlcuxqxyinousql
[API RESERVAS] Smoobu — integración con Booking.com, Airbnb, Expedia, Agoda
[PROPIEDADES]
  • House Sevillana — hasta 10 personas
  • Luxury Busto — hasta 5 personas
  • Busto Reform — hasta 3 personas
  • Duplex Center — hasta 4 personas
[FACTURACIÓN] Booking.com factura mensual — comisión 15% + cargo pagos
[HISTORIAL] CSV con reservas desde 2020 — más de 400 reservas

[TAREA ACTUAL]
[MES] _______________
[TAREA] _______________
[ARCHIVO] _______________
[RESULTADO ESPERADO] _______________

[ORDEN DE TRABAJO]
[PASO 1] Analiza la información que te proporciono
[PASO 2] Identifica qué propiedad o reserva está involucrada
[PASO 3] Cruza con datos históricos si es necesario
[PASO 4] Genera el resultado en el formato indicado
[PASO 5] Resume los puntos clave al final`

export default function PromptMaestroPage() {
  const [copied, setCopied] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(fullPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 40%, #0a1628 100%)',
      fontFamily: "'Courier New', monospace",
      padding: '24px 16px',
      color: '#F0EDE8',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#E8C547', boxShadow: '0 0 12px #E8C547',
          }} />
          <span style={{ fontSize: 11, color: '#666', letterSpacing: 3, textTransform: 'uppercase' }}>
            Anthropic Prompt Engineering
          </span>
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 900, margin: '8px 0 4px',
          background: 'linear-gradient(135deg, #E8C547, #FF8A65)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: -1,
        }}>
          PROMPT MAESTRO
        </h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 28, letterSpacing: 1 }}>
          HOUSESEVILLANA · Sevilla · 4 propiedades
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
        }}>
          <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 8, letterSpacing: 2 }}>
            ✦ REGLAS DEL CURSO ANTHROPIC APLICADAS
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['🎭 Dale un rol primero', '📌 Fijo siempre arriba', '[ ] Usa corchetas', '🔢 Orden A→B→C', '🎯 Objetivo = primera palabra'].map((tip) => (
              <span key={tip} style={{
                fontSize: 11, padding: '4px 10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20, color: '#aaa',
              }}>{tip}</span>
            ))}
          </div>
        </div>

        {promptSections.map((section, i) => (
          <div
            key={section.id}
            onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
            style={{
              marginBottom: 10,
              border: `1px solid ${activeSection === section.id ? section.color + '55' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10,
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px',
              background: activeSection === section.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: section.color + '20',
                border: `1px solid ${section.color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>
                {section.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: section.color }}>
                  {String(i + 1).padStart(2, '0')} · {section.label}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{section.tip}</div>
              </div>
              <div style={{
                fontSize: 16, color: '#444',
                transform: activeSection === section.id ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}>▶</div>
            </div>

            {activeSection === section.id && (
              <div style={{
                padding: '16px',
                background: 'rgba(0,0,0,0.3)',
                borderTop: `1px solid ${section.color}22`,
              }}>
                <pre style={{
                  margin: 0, fontSize: 12, lineHeight: 1.7,
                  color: '#C8C4BE', whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                }}>
                  {section.content}
                </pre>
              </div>
            )}
          </div>
        ))}

        <div style={{
          marginTop: 20,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.03)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: 11, color: '#666', letterSpacing: 2 }}>
              PROMPT COMPLETO · LISTO PARA USAR
            </span>
            <button
              onClick={handleCopy}
              style={{
                padding: '6px 16px',
                background: copied
                  ? 'linear-gradient(135deg, #5CE1C0, #6366f1)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: 1,
                transition: 'all 0.2s',
                boxShadow: '0 0 16px rgba(99,102,241,0.35)',
              }}
            >
              {copied ? '✓ COPIADO' : 'COPIAR'}
            </button>
          </div>
          <pre style={{
            margin: 0, padding: '16px',
            fontSize: 11, lineHeight: 1.8,
            color: '#556655', whiteSpace: 'pre-wrap',
            fontFamily: 'inherit', maxHeight: 220,
            overflowY: 'auto',
          }}>
            {fullPrompt}
          </pre>
        </div>

        <p style={{
          textAlign: 'center', fontSize: 11, color: '#444',
          marginTop: 20, letterSpacing: 1,
        }}>
          Rellena los campos [___] con cada nueva tarea · El resto es fijo
        </p>
      </div>
    </div>
  )
}
