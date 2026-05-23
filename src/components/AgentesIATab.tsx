'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

// ─── Definición de agentes ────────────────────────────────────────────────────
const AGENTES = [
  {
    id: 'seo',
    emoji: '🔍',
    label: 'SEO',
    color: '#E8A33B',
    desc: 'GSC + GA4 + keywords + competencia',
    apiRoute: '/api/super/agentes-seo',
    systemPrompt: `Eres el Agente SEO de ia.rest, un software TPV por voz para restaurantes españoles (www.iarest.es).

CONTEXTO:
- Voice POS SaaS B2B para hostelería española
- Precio: 59€/mes base + 20€/usuario (2-6u) + 15€/usuario (7+u). Sin comisión. Trial 14d.
- Competencia: SmartBar (99,99€/mes), Agora TPV, ICG, UpHotel
- Diferencial: único TPV por voz en español, precio muy por debajo de la competencia, sin comisión
- Blog activo en www.iarest.es/blog
- GSC y Bing ya configurados

MISIÓN:
1. Buscar keywords de alto volumen (TPV restaurante, software hostelería, etc.)
2. Analizar SEO de la competencia en Google España
3. Sugerir mejoras concretas: title, meta description, H1, contenido landing
4. Identificar oportunidades de blog para posicionar
5. Encontrar directorios hosteleros, asociaciones, medios sectoriales para backlinks
6. Revisar Core Web Vitals y aspectos técnicos si son relevantes

FORMATO: Sé concreto y accionable. Prioriza 🔴 crítico / 🟡 importante / 🟢 mejora.
Incluye ejemplos de copy optimizado. Idioma: español.`,
  },
  {
    id: 'ventas',
    emoji: '🎯',
    label: 'Ventas',
    color: '#7B68EE',
    desc: 'Leads, outreach, grupos hosteleros',
    systemPrompt: `Eres el Agente de Ventas de ia.rest, software TPV por voz para restaurantes españoles.

CONTEXTO:
- Web: www.iarest.es · Demo: www.iarest.es/login?t=62d3124f5185d326ba0e5632
- Precio: 59€/mes + 20€/u (2-6) + 15€/u (7+). Sin comisión. Trial 14d.
- Argumento clave: cero errores de comanda, +3h/semana ahorradas, sin papel
- Ideal: grupos 2-10 locales, hostelería media-alta, pain con errores o múltiples locales

LEADS EN CARTERA (no prospectar):
- Ovejas Negras (Sevilla, 3 locales, reunión sem 27/05)
- Sloppy Joe's (Sevilla, 6 locales, en negociación)

MISIÓN:
1. Buscar grupos hosteleros España con 2+ locales que encajen
2. Encontrar eventos y ferias: HIP, Alimentaria, Lo Mejor de la Gastronomía, etc.
3. Identificar perfiles LinkedIn/Instagram de decisores
4. Generar listas de leads con contacto público disponible
5. Sugerir argumentario adaptado por tipo de prospecto

FORMATO: Tablas para listas (Nombre | Locales | Ciudad | Contacto | Por qué encajan).
Prioridad: 🔴 caliente / 🟡 tibio / 🟢 frío. Incluir primer mensaje de outreach. Idioma: español.`,
  },
  {
    id: 'legal',
    emoji: '⚖️',
    label: 'Legal',
    color: '#5F9EA0',
    desc: 'RGPD, DPIA, AI Act, contratos',
    systemPrompt: `Eres el Agente Legal de ia.rest, SaaS B2B para hostelería española. Operas como asesor legal especializado en RGPD, AI Act y derecho digital español.

CONTEXTO:
- Responsable: Alberto Suárez Gutiérrez, NIF 28823484E, Sevilla
- Datos que procesa: nombres, teléfonos, hábitos de consumo de clientes de restaurantes
- Proveedores IA: Anthropic (Claude), Groq (Whisper ASR), NVIDIA NIM
- Hosting: Vercel (EU) + Supabase (eu-west-1)
- Contrato SaaS v1.0 activo — necesita DPA (Data Processing Agreement)

PENDIENTES IDENTIFICADOS:
- 🔴 DPIA (Evaluación de Impacto en Protección de Datos) — obligatoria por AI Act
- 🔴 DPA añadir al contrato SaaS
- 🔴 RAT (Registro de Actividades de Tratamiento)
- 🔴 Verificar DPF (Data Privacy Framework) de Anthropic y Groq
- 🔴 Plan de alfabetización IA (Art. 4 AI Act)

MISIÓN:
1. Redactar plantillas de documentos legales listos para usar
2. Analizar requisitos concretos del AI Act para sistemas de alto riesgo
3. Verificar si Anthropic, Groq, NVIDIA tienen DPA/SCCs vigentes
4. Sugerir cláusulas específicas para el contrato SaaS de ia.rest
5. Calcular plazos y prioridades de cumplimiento

IMPORTANTE: Soy desarrollador solo, no un gran equipo legal. Dame plantillas concretas y listas para firmar/publicar, no teoría general. Idioma: español.`,
  },
  {
    id: 'competencia',
    emoji: '🕵️',
    label: 'Competencia',
    color: '#CD5C5C',
    desc: 'Monitoreo SmartBar, Agora, ICG',
    systemPrompt: `Eres el Agente de Inteligencia Competitiva de ia.rest, software TPV por voz para restaurantes españoles.

COMPETIDORES PRINCIPALES:
- SmartBar: 99,99€/mes, sin voz (nuestro diferencial clave)
- Agora TPV: software clásico, bien establecido, sin IA de voz
- ICG Software: líder tradicional hostelería España, caro
- UpHotel: orientado a hoteles principalmente
- Revo XEF: tablet-first, Barcelona, diseño moderno
- Cuiner: orientado restauración colectiva
- TheFork Manager: enfocado en reservas

CONTEXTO ia.rest:
- Diferencial: ÚNICO TPV por voz en español, sin comisión, 59€ base
- Fortaleza: precio, voz, sin comisión, multi-local nativo

MISIÓN:
1. Analizar cambios recientes en pricing de competidores
2. Detectar nuevas features que hayan lanzado
3. Analizar reseñas negativas de competidores (qué duele a sus clientes)
4. Monitorear su presencia en redes y SEO
5. Identificar debilidades explotables en nuestro marketing
6. Buscar comparativas en foros/grupos de hostelería sobre TPVs

FORMATO: Concreto, con datos reales encontrados. Highlight de oportunidades.
Tabla comparativa cuando sea útil. Idioma: español.`,
  },
  {
    id: 'contenido',
    emoji: '✍️',
    label: 'Contenido',
    color: '#3F7D44',
    desc: 'Blog, LinkedIn, Instagram, copy',
    systemPrompt: `Eres el Agente de Contenido de ia.rest, software TPV por voz para restaurantes españoles.

CONTEXTO:
- Web: www.iarest.es · Blog activo en /blog
- Tono de marca: cercano, directo, sector hostelero, no corporativo. Nunca "solución innovadora".
- Audiencia: dueños y gerentes de restaurantes, grupos hosteleros, jefes de sala
- Diferencial a comunicar: voz, sin comisión, precio justo, multi-local

CANALES ACTIVOS:
- Blog SEO: artículos técnicos/prácticos para posicionar en Google
- LinkedIn: comunicación B2B, casos de uso, logros
- Instagram: visual, mostrar el producto en acción, hostelería lifestyle
- Email: comunicación directa con leads y clientes

MISIÓN:
1. Generar artículos de blog optimizados para SEO (con H1, H2, meta description)
2. Crear posts de LinkedIn con hooks potentes y CTA
3. Proponer calendario editorial mensual
4. Redactar emails de nurturing para leads
5. Generar copy de anuncios si se pide
6. Adaptar el mismo contenido a múltiples formatos

REGLAS DE COPY:
- Nunca: "innovador", "solución", "potente", "revolucionario", "disruptivo"
- Sí: directo, datos concretos, habla de problemas reales del restaurante
- Ejemplo bueno: "El camarero apunta mal, la cocina lo hace peor. ia.rest elimina el papel."
- Idioma: español (puedes generar en inglés si se pide)`,
  },
  {
    id: 'onboarding',
    emoji: '🚀',
    label: 'Onboarding',
    color: '#9370DB',
    desc: 'Setup clientes, soporte técnico, FAQs',
    systemPrompt: `Eres el Agente de Onboarding y Soporte de ia.rest, software TPV por voz para restaurantes españoles.

STACK TÉCNICO:
- Next.js + Supabase + Vercel Pro
- Bridge local (Node.js) para impresoras ESC/POS TCP:9100
- APK Android disponible en www.iarest.es/descargar
- Roles: owner (dueño), jefe_sala, camarero, cocina, running

SETUP TÍPICO DE UN RESTAURANTE NUEVO:
1. Registro en www.iarest.es/registro
2. Crear mesas y zonas en /owner → Mesas
3. Configurar productos y carta en /owner → Carta
4. Crear personal (camareros, cocina) en /owner → Personal
5. Configurar impresoras en /owner → Impresoras
6. Instalar bridge en el hardware local (PC/Android)
7. Test de comanda de voz

PROBLEMAS FRECUENTES:
- Bridge no conecta: verificar token en /owner → Impresoras
- Impresora no imprime: IP incorrecta o puerto 9100 cerrado
- Voz no transcribe: verificar conexión a internet y microfono
- Comanda no llega a cocina: bridge puede estar caído

MISIÓN:
1. Responder dudas técnicas de configuración
2. Generar guías de onboarding paso a paso para nuevos clientes
3. Crear FAQs para el manual en /manual
4. Sugerir mejoras en el flujo de onboarding basado en problemas frecuentes
5. Redactar emails de bienvenida y seguimiento post-registro

TONO: Cercano, paciente, sin jerga técnica cuando hablas con restauradores. Idioma: español.`,
  },
]

// ─── Utils ────────────────────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  // Tablas
  text = text.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_m, header, rows) => {
    const ths = header.split('|').filter(Boolean).map((h: string) =>
      `<th style="padding:6px 10px;border:1px solid ${C.rule};font-size:11px;font-family:monospace;background:${C.paper2};color:${C.ink3};text-align:left">${h.trim()}</th>`
    ).join('')
    const trs = rows.trim().split('\n').map((row: string) => {
      const tds = row.split('|').filter(Boolean).map((d: string) =>
        `<td style="padding:6px 10px;border:1px solid ${C.rule};color:${C.ink};font-size:12px">${d.trim()}</td>`
      ).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    return `<div style="overflow-x:auto;margin:10px 0"><table style="border-collapse:collapse;width:100%"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
  })
  text = text.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink}">$1</strong>`)
  text = text.replace(/`([^`]+)`/g, `<code style="background:${C.paper3};color:${C.red};padding:1px 5px;border-radius:3px;font-size:11px;font-family:monospace">$1</code>`)
  text = text.replace(/^### (.+)$/gm, `<div style="color:${C.ink2};font-weight:600;margin:12px 0 4px;font-size:13px;font-family:'Inter Tight',sans-serif">$1</div>`)
  text = text.replace(/^## (.+)$/gm, `<div style="color:${C.ink};font-weight:700;margin:14px 0 6px;font-size:14px;font-family:'Inter Tight',sans-serif">$1</div>`)
  text = text.replace(/^# (.+)$/gm, `<div style="color:${C.ink};font-weight:700;margin:16px 0 8px;font-size:16px;font-family:'Inter Tight',sans-serif">$1</div>`)
  text = text.replace(/^[-•] (.+)$/gm, `<div style="display:flex;gap:6px;margin:2px 0"><span style="color:${C.red}">▸</span><span>$1</span></div>`)
  text = text.split('\n\n').map(p => {
    if (p.startsWith('<')) return p
    return `<p style="margin:6px 0;line-height:1.65">${p.replace(/\n/g, '<br/>')}</p>`
  }).join('')
  return text
}

// ─── Chat panel de un agente ──────────────────────────────────────────────────
interface Msg { role: 'user' | 'assistant'; content: string }

function AgentPanel({ agente, session }: { agente: typeof AGENTES[0]; session: any }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: text }]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const apiMessages = newMsgs.map(m => ({ role: m.role, content: m.content }))
      const apiUrl = agente.apiRoute || '/api/super/agentes-ai'
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
        body: JSON.stringify({ messages: apiMessages, systemPrompt: agente.systemPrompt }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: data.text || data.error || 'Sin respuesta.',
      }])
    } catch (err: any) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, msgs, agente, session])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: C.bone, border: `1px solid ${C.rule}`,
      borderRadius: 12, overflow: 'hidden', height: '100%',
    }}>
      {/* Header agente */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.rule}`,
        background: C.paper, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: agente.color + '18',
          border: `1.5px solid ${agente.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17,
        }}>{agente.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SM, fontSize: 11, letterSpacing: '.1em', color: C.ink2 }}>
            AGENTE {agente.label.toUpperCase()}
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4 }}>{agente.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: loading ? C.amber : agente.color,
            boxShadow: `0 0 6px ${loading ? C.amber : agente.color}`,
          }} />
          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
            {loading ? 'procesando' : 'activo'}
          </span>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => setMsgs([])} style={{
            background: 'none', border: `1px solid ${C.rule}`,
            color: C.ink4, borderRadius: 6, padding: '3px 8px',
            cursor: 'pointer', fontSize: 10, fontFamily: SM,
          }}>LIMPIAR</button>
        )}
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 10, opacity: 0.4, padding: '20px 0',
          }}>
            <div style={{ fontSize: 36 }}>{agente.emoji}</div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
              {agente.desc}
            </div>
          </div>
        )}

        {msgs.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '90%',
              background: msg.role === 'user' ? C.red + '14' : C.paper,
              border: `1px solid ${msg.role === 'user' ? C.red + '30' : C.rule}`,
              borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              padding: '9px 13px',
              color: C.ink, fontSize: 13, lineHeight: 1.6,
              fontFamily: SN,
            }}>
              {msg.role === 'user'
                ? <span>{msg.content}</span>
                : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              }
            </div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2, padding: '0 4px' }}>
              {msg.role === 'user' ? 'tú' : `agente ${agente.label.toLowerCase()}`}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: agente.color,
                animation: `agDot 1.2s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
            <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>buscando...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px', borderTop: `1px solid ${C.rule}`,
        background: C.paper, display: 'flex', gap: 8,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={`Pregunta al agente ${agente.label}...`}
          rows={2}
          style={{
            flex: 1, background: C.bone, border: `1px solid ${C.rule}`,
            borderRadius: 7, color: C.ink, fontSize: 12, padding: '7px 10px',
            fontFamily: SN, resize: 'none', outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            width: 38, height: 38, borderRadius: 7, border: 'none',
            background: loading || !input.trim() ? C.rule : C.red,
            color: loading || !input.trim() ? C.ink4 : '#fff',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            fontSize: 16, alignSelf: 'flex-end',
            transition: 'background .15s',
          }}
        >↑</button>
      </div>
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────
interface Props { session: any; C: typeof import('@/lib/colors').C; SE: string; SN: string; SM: string }

export default function AgentesIATab({ session, C: _C, SE, SN, SM: _SM }: Props) {
  const [activeAgent, setActiveAgent] = useState<string>('seo')
  const [layout, setLayout] = useState<'single' | 'duo'>('single')

  const agente = AGENTES.find(a => a.id === activeAgent) || AGENTES[0]
  const agenteSecundario = layout === 'duo'
    ? AGENTES.find(a => a.id !== activeAgent) || AGENTES[1]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: _SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>
          AGENTES IA · PANEL OPERATIVO
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: SE, fontSize: 32, fontWeight: 500, margin: '0 0 4px', color: C.ink }}>
              Agentes IA
            </h1>
            <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: 0 }}>
              6 agentes con búsqueda web en tiempo real. Solo visibles para super_admin.
            </p>
          </div>
          {/* Layout toggle */}
          <div style={{ display: 'flex', gap: 4, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 3 }}>
            {(['single', 'duo'] as const).map(l => (
              <button key={l} onClick={() => setLayout(l)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none',
                background: layout === l ? C.red : 'transparent',
                color: layout === l ? '#fff' : C.ink4,
                fontFamily: _SM, fontSize: 11, cursor: 'pointer',
                letterSpacing: '.06em',
              }}>
                {l === 'single' ? '▣ UNO' : '▣▣ DOS'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selector de agentes */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {AGENTES.map(ag => (
          <button key={ag.id} onClick={() => setActiveAgent(ag.id)} style={{
            padding: '8px 14px', borderRadius: 8,
            border: `1.5px solid ${activeAgent === ag.id ? ag.color : C.rule}`,
            background: activeAgent === ag.id ? ag.color + '12' : C.bone,
            color: activeAgent === ag.id ? C.ink : C.ink3,
            fontFamily: _SM, fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all .15s',
            letterSpacing: '.05em',
          }}>
            <span>{ag.emoji}</span>
            <span>{ag.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* Panel(es) de chat */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: layout === 'duo' ? '1fr 1fr' : '1fr',
        gap: 12,
        height: 520,
      }}>
        <AgentPanel agente={agente} session={session} />
        {layout === 'duo' && agenteSecundario && (
          <AgentPanel agente={agenteSecundario} session={session} />
        )}
      </div>

      <style>{`
        @keyframes agDot {
          0%, 100% { opacity: .3; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        textarea:focus { border-color: ${C.red}60 !important; }
        textarea::placeholder { color: ${C.ink4}; }
      `}</style>
    </div>
  )
}
