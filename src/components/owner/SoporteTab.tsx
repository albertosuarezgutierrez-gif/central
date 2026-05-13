'use client'
// src/components/owner/SoporteTab.tsx
// Chat de soporte con IA integrado en /owner → Auditoría → Soporte
// El dueño describe su problema y la IA responde con contexto real del restaurante

import { useState, useEffect, useRef, useCallback } from 'react'

/* ─── Tokens de diseño ─── */
const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  red:'#D9442B', redD:'#A8311E', redS:'#F4D8CF',
  amber:'#E8A33B', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
  dark:'#14110E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

/* ─── Tipos ─── */
interface Mensaje {
  id?: string
  rol: 'usuario' | 'ia' | 'alberto'
  texto: string
  created_at?: string
}

interface Ticket {
  id: string
  asunto: string
  estado: 'abierto' | 'resuelto' | 'escalado'
  created_at: string
  updated_at: string
}

/* ─── Sugerencias rápidas ─── */
const SUGERENCIAS = [
  'No imprime los tickets',
  'Las comandas no llegan a cocina',
  'Un camarero no puede entrar con su PIN',
  'No se generan las facturas',
  'La app no carga bien',
]

/* ─── Helpers ─── */
function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/* ─── Componente principal ─── */
interface Props {
  restauranteId: string
}

export default function SoporteTab({ restauranteId }: Props) {
  const [vista, setVista]           = useState<'lista' | 'chat'>('lista')
  const [tickets, setTickets]       = useState<Ticket[]>([])
  const [ticketActivo, setTicketActivo] = useState<Ticket | null>(null)
  const [mensajes, setMensajes]     = useState<Mensaje[]>([])
  const [texto, setTexto]           = useState('')
  const [enviando, setEnviando]     = useState(false)
  const [escalado, setEscalado]     = useState(false)
  const [cargandoTickets, setCargandoTickets] = useState(true)
  const finRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* Cargar lista de tickets */
  const cargarTickets = useCallback(async () => {
    setCargandoTickets(true)
    try {
      const res = await fetch('/api/owner/soporte', {
        headers: { 'x-ia-restaurante-id': restauranteId },
      })
      const json = await res.json()
      setTickets(json.tickets ?? [])
    } finally {
      setCargandoTickets(false)
    }
  }, [restauranteId])

  useEffect(() => { cargarTickets() }, [cargarTickets])

  /* Scroll al último mensaje */
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  /* Abrir ticket existente */
  async function abrirTicket(ticket: Ticket) {
    setTicketActivo(ticket)
    setEscalado(ticket.estado === 'escalado')
    setVista('chat')
    const res = await fetch(`/api/owner/soporte?ticket_id=${ticket.id}`, {
      headers: { 'x-ia-restaurante-id': restauranteId },
    })
    const json = await res.json()
    setMensajes(json.mensajes ?? [])
  }

  /* Nuevo ticket */
  function nuevoTicket() {
    setTicketActivo(null)
    setMensajes([])
    setEscalado(false)
    setTexto('')
    setVista('chat')
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  /* Enviar mensaje */
  async function enviar(textoEnviar?: string) {
    const msg = (textoEnviar ?? texto).trim()
    if (!msg || enviando) return

    // Añadir mensaje usuario optimistamente
    const msgUsuario: Mensaje = { rol: 'usuario', texto: msg, created_at: new Date().toISOString() }
    setMensajes(prev => [...prev, msgUsuario])
    setTexto('')
    setEnviando(true)

    // Placeholder IA mientras carga
    setMensajes(prev => [...prev, { rol: 'ia', texto: '…', created_at: new Date().toISOString() }])

    try {
      const res = await fetch('/api/owner/soporte', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ia-restaurante-id': restauranteId,
        },
        body: JSON.stringify({ texto: msg, ticket_id: ticketActivo?.id }),
      })
      const json = await res.json()

      if (json.ok) {
        // Reemplazar placeholder con respuesta real
        setMensajes(prev => {
          const sin = prev.filter(m => m.texto !== '…')
          return [...sin, { rol: 'ia', texto: json.respuesta, created_at: new Date().toISOString() }]
        })

        // Si es ticket nuevo, actualizar el activo
        if (!ticketActivo) {
          setTicketActivo({ id: json.ticket_id, asunto: msg.slice(0, 80), estado: 'abierto', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          cargarTickets()
        }

        if (json.escalado) setEscalado(true)
      }
    } catch {
      setMensajes(prev => prev.filter(m => m.texto !== '…'))
      setMensajes(prev => [...prev, {
        rol: 'ia',
        texto: 'No se pudo conectar con el asistente. Comprueba tu conexión e inténtalo de nuevo.',
        created_at: new Date().toISOString(),
      }])
    } finally {
      setEnviando(false)
      textareaRef.current?.focus()
    }
  }

  /* Cerrar ticket */
  async function cerrarTicket() {
    if (!ticketActivo) return
    await fetch('/api/owner/soporte', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-restaurante-id': restauranteId },
      body: JSON.stringify({ ticket_id: ticketActivo.id, estado: 'resuelto' }),
    })
    cargarTickets()
    setVista('lista')
  }

  /* ── Vista: lista de tickets ── */
  if (vista === 'lista') return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 20, fontStyle: 'italic', color: C.ink }}>Soporte</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 2 }}>
            Escríbenos si tienes algún problema — la IA te ayuda al momento
          </div>
        </div>
        <button onClick={nuevoTicket} style={{
          fontFamily: SN, fontSize: 13, fontWeight: 600,
          background: C.red, color: '#fff', border: 'none',
          borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
        }}>
          + Nueva consulta
        </button>
      </div>

      {/* Sugerencias rápidas */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: SM, fontSize: 9, letterSpacing: '.1em', color: C.ink4, marginBottom: 8 }}>
          CONSULTAS FRECUENTES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGERENCIAS.map(s => (
            <button key={s} onClick={() => { nuevoTicket(); setTimeout(() => enviar(s), 200) }} style={{
              fontFamily: SN, fontSize: 12, color: C.ink3,
              background: C.paper2, border: `1px solid ${C.rule}`,
              borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
            }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de tickets anteriores */}
      {cargandoTickets ? (
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4, padding: '24px 0', textAlign: 'center' }}>
          Cargando…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{
          background: C.paper2, border: `1px solid ${C.rule}`,
          borderRadius: 8, padding: '32px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: SE, fontSize: 16, fontStyle: 'italic', color: C.ink3 }}>
            Sin consultas anteriores
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 4 }}>
            Cuando tengas una duda o incidencia, úsala como punto de partida
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: SM, fontSize: 9, letterSpacing: '.1em', color: C.ink4, marginBottom: 8 }}>
            CONSULTAS ANTERIORES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tickets.map(t => (
              <button key={t.id} onClick={() => abrirTicket(t)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: C.bone, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.asunto || 'Consulta sin título'}
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2 }}>
                    {relativo(t.updated_at)}
                  </div>
                </div>
                <span style={{
                  fontFamily: SM, fontSize: 10, padding: '2px 8px', borderRadius: 999, marginLeft: 12,
                  background: t.estado === 'resuelto' ? C.greenS : t.estado === 'escalado' ? C.amberS : C.paper2,
                  color: t.estado === 'resuelto' ? C.green : t.estado === 'escalado' ? C.amber : C.ink4,
                  border: `1px solid ${t.estado === 'resuelto' ? C.green : t.estado === 'escalado' ? C.amber : C.rule}`,
                  flexShrink: 0,
                }}>
                  {t.estado === 'resuelto' ? 'Resuelto' : t.estado === 'escalado' ? 'Escalado' : 'Abierto'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  /* ── Vista: chat ── */
  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: 400 }}>

      {/* Header chat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setVista('lista')} style={{
          fontFamily: SN, fontSize: 12, color: C.ink3,
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
        }}>
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>
            {ticketActivo?.asunto || 'Nueva consulta'}
          </div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
            Soporte ia.rest · respuesta inmediata
          </div>
        </div>
        {ticketActivo && ticketActivo.estado === 'abierto' && (
          <button onClick={cerrarTicket} style={{
            fontFamily: SN, fontSize: 11, color: C.green,
            background: C.greenS, border: `1px solid ${C.green}`,
            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
          }}>
            ✓ Resuelto
          </button>
        )}
      </div>

      {/* Banner escalado */}
      {escalado && (
        <div style={{
          background: C.amberS, border: `1px solid ${C.amber}`,
          borderRadius: 6, padding: '10px 14px', marginBottom: 12,
          fontFamily: SN, fontSize: 12, color: C.ink2,
        }}>
          <strong>Este problema requiere revisión directa.</strong> Alberto lo atenderá en cuanto pueda, normalmente antes de las próximas 12h.
        </div>
      )}

      {/* Área de mensajes */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '4px 0 16px',
      }}>
        {/* Mensaje de bienvenida si es nuevo */}
        {mensajes.length === 0 && (
          <div style={{
            background: C.paper2, border: `1px solid ${C.rule}`,
            borderRadius: 12, borderBottomLeftRadius: 4,
            padding: '12px 16px', alignSelf: 'flex-start', maxWidth: '85%',
          }}>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, marginBottom: 8 }}>
              Hola, soy el asistente de soporte de ia.rest. Tengo acceso al estado actual de tu sistema en tiempo real.
            </div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>
              ¿En qué puedo ayudarte?
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={m.id ?? i} style={{
            alignSelf: m.rol === 'usuario' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
          }}>
            <div style={{
              background: m.rol === 'usuario' ? C.dark : m.rol === 'alberto' ? C.amberS : C.paper2,
              color: m.rol === 'usuario' ? C.paper : C.ink2,
              border: `1px solid ${m.rol === 'usuario' ? 'transparent' : m.rol === 'alberto' ? C.amber : C.rule}`,
              borderRadius: 12,
              borderBottomRightRadius: m.rol === 'usuario' ? 4 : 12,
              borderBottomLeftRadius: m.rol === 'usuario' ? 12 : 4,
              padding: '10px 14px',
              fontFamily: SN, fontSize: 13, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {m.rol === 'alberto' && (
                <div style={{ fontFamily: SM, fontSize: 9, color: C.amber, marginBottom: 4 }}>
                  ALBERTO
                </div>
              )}
              {m.texto === '…' ? (
                <span style={{ letterSpacing: 4, opacity: 0.5 }}>···</span>
              ) : m.texto}
            </div>
            {m.created_at && (
              <div style={{
                fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 2,
                textAlign: m.rol === 'usuario' ? 'right' : 'left',
              }}>
                {relativo(m.created_at)}
              </div>
            )}
          </div>
        ))}
        <div ref={finRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end',
        borderTop: `1px solid ${C.rule}`, paddingTop: 12,
      }}>
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
          }}
          placeholder="Describe el problema… (Enter para enviar)"
          disabled={enviando}
          rows={1}
          style={{
            flex: 1, fontFamily: SN, fontSize: 13, color: C.ink,
            background: C.bone, border: `1px solid ${C.rule}`,
            borderRadius: 8, padding: '10px 12px', resize: 'none',
            outline: 'none', lineHeight: 1.4,
            opacity: enviando ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => enviar()}
          disabled={!texto.trim() || enviando}
          style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600,
            background: texto.trim() && !enviando ? C.red : C.paper2,
            color: texto.trim() && !enviando ? '#fff' : C.ink4,
            border: 'none', borderRadius: 8,
            padding: '10px 16px', cursor: texto.trim() && !enviando ? 'pointer' : 'default',
            transition: 'all .15s', whiteSpace: 'nowrap',
          }}
        >
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
