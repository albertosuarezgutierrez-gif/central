'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ManualComanda from '@/components/ManualComanda'
import ChuleteVoz from '@/components/ChuleteVoz'
import MesaDetalleSheet from '@/components/edge/MesaDetalleSheet'
import { useProductos86, useComandas, useServicioPendiente } from '@/hooks/useRealtime'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAlertas } from '@/hooks/useAlertas'
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { useAutoReload } from '@/hooks/useAutoReload'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import FueraCartaPill from '@/components/edge/FueraCartaPill'
import RecomendacionesPill from '@/components/edge/RecomendacionesPill'
import AlertaBanner from '@/components/AlertaBanner'
import SugerenciaButton from '@/components/SugerenciaButton'
import ComandaModModal, { ItemMod } from '@/components/ComandaModModal'
import ComensalesModal from '@/components/edge/ComensalesModal'
import PlanoSala, { MesaPlano, ZonaInfo } from '@/components/PlanoSala'
import { useMensajes } from '@/hooks/useMensajes'
import FicharSalidaBtn from '@/components/FicharSalidaBtn'
import SmartScanFAB from '@/components/SmartScanFAB'
import CuentasTab from '@/components/edge/CuentasTab'

/* ─── PALETA CREMA (light) ──────────────────────────────────── */

type Screen = 'idle'|'recording'|'processing'|'speaking'|'asking'|'confirm'|'sent'|'error'
type Tab    = 'hablar'|'manual'|'sala'|'cuentas'|'carta'|'chat'|'config'

const ALL_TABS: {id:Tab;lbl:string;path:string;fijo?:boolean}[] = [
  {id:'hablar',  lbl:'Hablar',   fijo:true, path:'M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v4'},
  {id:'manual',  lbl:'Manual',              path:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7M17.5 14v7'},
  {id:'cuentas', lbl:'Cuentas',             path:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4'},
  {id:'sala',    lbl:'Pedidos',             path:'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4'},
  {id:'carta',   lbl:'Carta',               path:'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 9h6M9 13h4'},
  {id:'chat',    lbl:'Chat',                path:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'},
  {id:'config',  lbl:'Config',  fijo:true,  path:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'},
]


interface ProductoCarta {
  id: string; nombre: string; precio: number | null
  categoria: string; descripcion?: string | null
  alergenos?: string[] | null; activo: boolean
  familia?: string | null; metadata?: Record<string, unknown> | null
}

interface BrainResult {
  mesa: string; tipo: string
  items: { nombre: string; cantidad: number; notas?: string }[]
  nota_general?: string | null
  confianza: number; raw: string
}
interface ChatMsg {
  id: string; from: 'brain'|'camarero'|'sistema'
  texto: string; ts: Date; tipo?: 'ok'|'error'|'aviso'|'pregunta'
}

function buildTTS(b: BrainResult, a86: string[] = [], aAlerg: {producto:string;alergenos:string[]}[] = []): string {
  const s86 = a86.length ? `Atención, ochenta y seis: ${a86.join(' y ')}. ` : ''
  const sAl = aAlerg.length ? `Alérgeno detectado: ${aAlerg.map(a=>`${a.producto} contiene ${a.alergenos.join(' y ')}`).join('. ')}. ` : ''
  const sNota = b.nota_general ? `. Nota: ${b.nota_general}` : ''
  const items = b.items ?? []
  if (!items.length) return `${s86}${sAl}${b.tipo} para ${b.mesa}. ¿Confirmamos?`
  const itemsStr = items.map(it=>`${it.cantidad===1?'una de':it.cantidad} ${it.nombre}${it.notas ? `, ${it.notas}` : ''}`).join(', ')
  return `${s86}${sAl}${b.mesa}: ${itemsStr}${sNota}. ¿Confirmamos?`
}

// ── VOX: TTS neural via servidor (Microsoft Edge Neural Voices) ──────────────
// Primario: /api/vox → Edge Neural (es-ES-ElviraNeural) → audio/mpeg reproducido con Audio API
// Fallback: Web Speech API del navegador (voz del SO)
let _audioCtx: AudioContext | null = null
let _currentSource: AudioBufferSourceNode | null = null

function stopVox() {
  try { _currentSource?.stop(); _currentSource = null } catch { /* ok */ }
  if (typeof window !== 'undefined') {
    try { window.speechSynthesis?.cancel() } catch { /* ok */ }
  }
}

function speakFallback(text: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'es-ES'; utt.rate = 1.05; utt.pitch = 1; utt.volume = 1
    const v = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('female'))
           ?? window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es'))
    if (v) utt.voice = v
    utt.onend = () => resolve(); utt.onerror = () => resolve()
    window.speechSynthesis.speak(utt)
  })
}

function speak(text: string): Promise<void> {
  stopVox()
  return new Promise(async (resolve) => {
    try {
      // Obtener audio del servidor
      const res = await fetch('/api/vox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`VOX HTTP ${res.status}`)
      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer.byteLength) throw new Error('VOX audio vacío')

      // Reproducir con Web Audio API (sin restricciones de autoplay que tiene <audio>)
      if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (_audioCtx.state === 'suspended') await _audioCtx.resume()

      const audioBuffer = await _audioCtx.decodeAudioData(arrayBuffer)
      const source = _audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(_audioCtx.destination)
      _currentSource = source
      source.onended = () => { _currentSource = null; resolve() }
      source.start(0)
    } catch (err) {
      // Fallback a Web Speech API del navegador
      console.warn('[VOX] fallback a Web Speech API:', err)
      await speakFallback(text)
      resolve()
    }
  })
}

/* ─── COLORES ESTADO MESA ─────────────────────────────────────── */
const MBORDER: Record<string,string> = {
  libre: C.rule, activa:`${C.gr}66`, marchando:`${C.amb}88`,
  marchar:`${C.amb}88`, aviso:`${C.amb}88`, urgente: C.verm, cuenta:`${C.verm}88`,
}
const MBG: Record<string,string> = {
  libre: C.bg1, activa: C.grS, marchando: C.ambS,
  marchar: C.ambS, aviso: C.ambS, urgente: C.vermS, cuenta: C.vermS,
}
const MCOL: Record<string,string> = {
  libre: C.ink4, activa: C.gr, marchando: C.amb,
  marchar: C.amb, aviso: C.amb, urgente: C.verm, cuenta: C.verm,
}

/* ─── CHAT TAB — componente propio para cumplir Rules of Hooks ── */
interface CompañeroActivo { id: string; nombre: string; rol: string }
type DestinoChat = 'todos' | 'cocina' | 'jefe_sala' | string  // string = camarero_id individual

function EdgeChatTab({ session, mensajes, marcarMensajeLeido, chatTexto, setChatTexto, chatDestino, setChatDestino, chatEndRef, enviarMensaje, mesaFijada, restauranteId }: {
  session: { id: string; nombre: string; rol: string }
  mensajes: { id: string; camarero_id: string|null; rol_origen: string; nombre_origen: string; rol_destino: string; destinatario_id?: string|null; mesa_ref: string|null; leido_por: string[]; texto: string; tipo?: string; created_at: string }[]
  marcarMensajeLeido: (id: string) => void
  chatTexto: string
  setChatTexto: (v: string) => void
  chatDestino: DestinoChat
  setChatDestino: (v: DestinoChat) => void
  chatEndRef: React.RefObject<HTMLDivElement | null>
  enviarMensaje: (texto: string, opts?: { rol_destino?: string; destinatario_id?: string; mesa_ref?: string; tipo?: string }) => Promise<void>
  mesaFijada: string | null
  restauranteId: string
}) {
  const rolLabel = (r: string) => ({ camarero: 'Sala', cocina: 'Cocina', jefe_sala: 'Jefe', running: 'Running', super_admin: 'Admin' }[r] ?? r)
  const rolColor = (r: string) => ({ camarero: C.teal, cocina: C.verm, jefe_sala: C.amb, running: C.gr }[r] ?? C.ink3)

  // — Compañeros activos —
  const [compañeros, setCompañeros] = useState<CompañeroActivo[]>([])
  useEffect(() => {
    if (!restauranteId) return
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    const cargar = async () => {
      const r = await fetch('/api/mensajes/activos', { headers: { 'x-ia-session': ses } })
      if (!r.ok) return
      const d = await r.json()
      setCompañeros((d.activos ?? []).filter((c: CompañeroActivo) => c.id !== session.id))
    }
    cargar()
    const t = setInterval(cargar, 30_000)
    return () => clearInterval(t)
  }, [restauranteId, session.id])

  // — Audio recording state —
  const [grabando, setGrabando]           = useState(false)
  const [subiendoAudio, setSubiendoAudio] = useState(false)
  const mediaRecRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const grabTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [grabSecs, setGrabSecs]           = useState(0)

  // — Pitido notificación (mejora 4) —
  const prevMsgCount = useRef(mensajes.length)
  useEffect(() => {
    if (mensajes.length > prevMsgCount.current) {
      const ultimo = mensajes[mensajes.length - 1]
      // Solo pitar si el mensaje no es mío
      if (ultimo && ultimo.camarero_id !== session.id) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
          osc.start(); osc.stop(ctx.currentTime + 0.08)
        } catch { /* silencioso si no hay AudioContext */ }
      }
    }
    prevMsgCount.current = mensajes.length
  }, [mensajes.length, session.id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    mensajes
      .filter(m => !m.leido_por?.includes(session.id) && m.camarero_id !== session.id)
      .forEach(m => marcarMensajeLeido(m.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.length])

  // Construye opts para enviar según destino seleccionado
  const buildEnviarOpts = (tipo?: string) => {
    const esIndividual = chatDestino !== 'todos' && chatDestino !== 'cocina' && chatDestino !== 'jefe_sala'
    const comp = esIndividual ? compañeros.find(c => c.id === chatDestino) : null
    return {
      rol_destino:     esIndividual ? (comp?.rol ?? 'camarero') : chatDestino,
      destinatario_id: esIndividual ? chatDestino : undefined,
      mesa_ref:        mesaFijada ?? undefined,
      ...(tipo ? { tipo } : {}),
    }
  }

  const handleEnviar = async () => {
    const t = chatTexto.trim()
    if (!t) return
    setChatTexto('')
    await enviarMensaje(t, buildEnviarOpts())
  }

  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start(200)
      mediaRecRef.current = rec
      setGrabando(true)
      setGrabSecs(0)
      grabTimerRef.current = setInterval(() => setGrabSecs(s => s + 1), 1000)
    } catch {
      alert('No se pudo acceder al micrófono')
    }
  }

  const pararGrabacion = async () => {
    const rec = mediaRecRef.current
    if (!rec) return
    clearInterval(grabTimerRef.current!)
    setGrabando(false)
    setGrabSecs(0)
    await new Promise<void>(res => {
      rec.onstop = () => res()
      rec.stop()
      rec.stream.getTracks().forEach(t => t.stop())
    })
    const blob = new Blob(chunksRef.current, { type: rec.mimeType })
    if (blob.size < 1000) return
    await subirAudio(blob, rec.mimeType)
  }

  const subirAudio = async (blob: Blob, mimeType: string) => {
    setSubiendoAudio(true)
    try {
      const ext  = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `audio.${ext}`, { type: mimeType })
      const fd   = new FormData()
      fd.append('audio', file)
      const ses = localStorage.getItem('ia_rest_session') ?? ''
      const res = await fetch('/api/mensajes/audio', {
        method: 'POST',
        headers: { 'x-ia-session': ses },
        body: fd,
      })
      if (!res.ok) { alert('Error al subir audio'); return }
      const { url } = await res.json()
      await enviarMensaje(url, buildEnviarOpts('audio'))
    } finally {
      setSubiendoAudio(false)
    }
  }

  // Label para el destino seleccionado actualmente
  const destinoLabel = () => {
    if (chatDestino === 'todos') return 'Todos'
    if (chatDestino === 'cocina') return 'Cocina'
    if (chatDestino === 'jefe_sala') return 'Jefe sala'
    return compañeros.find(c => c.id === chatDestino)?.nombre ?? '...'
  }
  const esIndividual = chatDestino !== 'todos' && chatDestino !== 'cocina' && chatDestino !== 'jefe_sala'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Selector de destinatario ── */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.rule}`, background: C.bg1, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
          <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, letterSpacing: '.08em', flexShrink: 0 }}>PARA:</span>

          {/* Roles fijos */}
          {(['todos','cocina','jefe_sala'] as const).map(d => (
            <button key={d} onClick={() => setChatDestino(d)} style={{
              padding: '4px 10px', borderRadius: 20, flexShrink: 0,
              border: `1px solid ${chatDestino===d ? rolColor(d==='todos'?'jefe_sala':d) : C.rule}`,
              background: chatDestino===d ? rolColor(d==='todos'?'jefe_sala':d) : 'transparent',
              color: chatDestino===d ? '#fff' : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer',
            }}>
              {d==='todos' ? 'Todos' : d==='cocina' ? 'Cocina' : 'Jefe sala'}
            </button>
          ))}

          {/* Separador visual si hay compañeros */}
          {compañeros.length > 0 && (
            <span style={{ width: 1, height: 16, background: C.rule, flexShrink: 0, margin: '0 2px' }} />
          )}

          {/* Compañeros activos */}
          {compañeros.map(c => {
            const sel = chatDestino === c.id
            const color = rolColor(c.rol)
            return (
              <button key={c.id} onClick={() => setChatDestino(c.id)} style={{
                padding: '4px 10px', borderRadius: 20, flexShrink: 0,
                border: `1px solid ${sel ? color : C.rule}`,
                background: sel ? color : 'transparent',
                color: sel ? '#fff' : C.ink3,
                fontFamily: SN, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {/* Dot verde = activo */}
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sel ? '#fff' : '#4CAF50', flexShrink: 0 }} />
                {c.nombre.split(' ')[0]}
              </button>
            )
          })}
        </div>

        {/* Indicador de mensaje privado */}
        {esIndividual && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.amb} strokeWidth={2.5}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={{ fontFamily: SN, fontSize: 11, color: C.amb }}>
              Mensaje privado para {destinoLabel()} — solo lo verá él/ella
            </span>
          </div>
        )}

        {/* Indicador de mesa fijada */}
        {mesaFijada && (
          <div style={{ marginTop: esIndividual ? 2 : 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>
              Se adjuntará referencia de mesa {mesaFijada}
            </span>
          </div>
        )}
      </div>

      {/* ── Mensajes ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mensajes.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink4 }}>Sin mensajes en el turno</span>
            <span style={{ fontFamily: SC, fontSize: 14, color: C.ink4 }}>empieza tú la conversación</span>
          </div>
        )}
        {mensajes.map(m => {
          const esMio   = m.camarero_id === session.id
          const esAudio = m.tipo === 'audio'
          const esPriv  = !!m.destinatario_id
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: esMio ? 'flex-end' : 'flex-start' }}>
              {!esMio && (
                <span style={{ fontFamily: SN, fontSize: 10, color: rolColor(m.rol_origen), marginBottom: 2, paddingLeft: 4 }}>
                  {m.nombre_origen} · {rolLabel(m.rol_origen)}
                  {m.mesa_ref && <span style={{ color: C.ink3 }}> · {m.mesa_ref}</span>}
                  {esPriv && <span style={{ color: C.amb }}> · privado</span>}
                </span>
              )}
              <div style={{
                maxWidth: '80%', padding: esAudio ? '6px 10px' : '8px 12px',
                borderRadius: esMio ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: esMio ? C.verm : C.bg1,
                border: esMio ? (esPriv ? `1px solid ${C.amb}` : 'none') : `1px solid ${esPriv ? C.amb+'66' : C.rule}`,
                color: esMio ? '#fff' : C.ink,
                fontFamily: SN, fontSize: 14, lineHeight: 1.4,
              }}>
                {esAudio ? (
                  <audio src={m.texto} controls preload="metadata" style={{
                    height: 32, minWidth: 180, maxWidth: '100%',
                    filter: esMio ? 'invert(1) brightness(2) sepia(0.3)' : 'invert(0)',
                  }} />
                ) : m.texto}
              </div>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2, paddingRight: esMio ? 4 : 0, paddingLeft: esMio ? 0 : 4 }}>
                {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {esMio && m.rol_destino !== 'todos' && !m.destinatario_id && (
                  <span style={{ color: C.ink4 }}> · para {rolLabel(m.rol_destino)}</span>
                )}
                {esMio && m.destinatario_id && (
                  <span style={{ color: C.amb }}>
                    {' · para '}
                    {compañeros.find(c => c.id === m.destinatario_id)?.nombre ?? 'privado'}
                  </span>
                )}
                {esMio && (
                  <span style={{ marginLeft: 4, color: (m.leido_por ?? []).filter(id => id !== session.id).length > 0 ? '#4FC3F7' : C.ink4 }}>
                    {(m.leido_por ?? []).filter(id => id !== session.id).length > 0 ? '✓✓' : '✓'}
                  </span>
                )}
              </span>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>

      {/* ── Plantillas rápidas — ocultas si graba ── */}
      {!grabando && (
        <div style={{ padding: '6px 12px', borderTop: `1px solid ${C.rule}`, background: C.bg, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
          {['La mesa tiene prisa', '86 un producto', 'Alérgeno detectado', '¿Cuánto falta?'].map(t => (
            <button key={t} onClick={() => setChatTexto(t)} style={{
              whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${C.rule}`, background: C.bg1,
              fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer', flexShrink: 0,
            }}>{t}</button>
          ))}
        </div>
      )}

      {/* ── Indicador grabación ── */}
      {grabando && (
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.rule}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.verm, flexShrink: 0, animation: 'pulse-rec 1s ease-in-out infinite' }} />
          <span style={{ fontFamily: SM, fontSize: 13, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(grabSecs / 60)).padStart(2, '0')}:{String(grabSecs % 60).padStart(2, '0')}
          </span>
          <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            grabando para {destinoLabel()}…
          </span>
        </div>
      )}

      <style>{`
        @keyframes pulse-rec { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
      `}</style>

      {/* ── Input ── */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.rule}`, background: C.bg1, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        {!grabando && (
          <textarea
            value={chatTexto}
            onChange={e => setChatTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
            placeholder={`Mensaje a ${destinoLabel().toLowerCase()}…`}
            rows={1}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 20,
              border: `1px solid ${esIndividual ? C.amb+'66' : C.rule}`, background: C.bg,
              fontFamily: SN, fontSize: 14, color: C.ink, resize: 'none',
              outline: 'none', lineHeight: 1.4, transition: 'border-color .2s',
            }}
          />
        )}
        {!grabando && chatTexto.trim() && (
          <button onClick={handleEnviar} style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: C.verm, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        )}
        <button
          onClick={grabando ? pararGrabacion : iniciarGrabacion}
          disabled={subiendoAudio}
          title={grabando ? 'Parar y enviar audio' : 'Grabar audio'}
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: grabando ? C.verm : subiendoAudio ? C.rule : C.bg1,
            border: grabando ? 'none' : `1px solid ${C.rule}`,
            cursor: subiendoAudio ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s',
            boxShadow: grabando ? `0 0 0 4px ${C.verm}33` : 'none',
          } as React.CSSProperties}
        >
          {subiendoAudio ? (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth={2}
              style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </svg>
          ) : grabando ? (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          ) : (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth={2}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
export default function EdgePage() {
  const { session, checking } = useAuth()
  const [turnoId, setTurnoId] = useState<string|null>(null)
  if (checking||!session) return <div style={{minHeight:'100dvh',background:C.bg}}/>
  return <EdgeContent session={session} turnoId={turnoId} setTurnoId={setTurnoId}/>
}

function EdgeContent({ session, turnoId, setTurnoId }:{
  session: {id:string;nombre:string;rol:string;restaurante_id:string}
  turnoId: string|null
  setTurnoId: (id:string|null)=>void
}) {
  // B2 FIX: iOS no permite getUserMedia desde promesas — necesita gesto directo
  const isIOS = typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !('MSStream' in window)

  const [tab, setTab]     = useState<Tab>('hablar')
  const [screen, setScreen] = useState<Screen>('idle')
  const [cuentasCount, setCuentasCount] = useState(0)
  const [iniciandoTurno, setIniciandoTurno] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain]           = useState<BrainResult|null>(null)
  const [error, setError]           = useState('')
  const [latencia, setLatencia]     = useState<number|null>(null)
  const [alert86, setAlert86]       = useState<string[]>([])
  const [lastComandaId, setLastComandaId] = useState<string|null>(null)
  const speakingRef = useRef(false)
  const [pendingItems, setPendingItems] = useState<BrainResult['items']>([])
  const [alertas86, setAlertas86]       = useState<string[]>([])
  const [alertasAlerg, setAlertasAlerg] = useState<{producto:string;alergenos:string[]}[]>([])
  const [avisoRuido,   setAvisoRuido]   = useState(false)
  const [mostrarAlerg, setMostrarAlerg] = useState(false)
  const [pedidoCuenta, setPedidoCuenta] = useState<{loading:boolean;error:string;factura:null|{numero_factura:number;importe_total:number}}>({loading:false,error:'',factura:null})
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [showPush, setShowPush]     = useState(false)
  const [pushMsg, setPushMsg]       = useState('')
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([])
  // Mesa seleccionada para ver detalle
  const [mesaDetalle, setMesaDetalle] = useState<{id:string;codigo:string;capacidad?:number}|null>(null)
  const [comensalesModal, setComensalesModal] = useState<{
    mesaId: string; mesaCodigo: string; capacidad?: number
  } | null>(null)
  const [servicioConfig, setServicioConfig] = useState<{
    activo: boolean; precio: number; nombre: string; skip: boolean
    preguntar_voz: boolean  // preguntar comensales al dictar por voz
  }>({ activo: false, precio: 1.50, nombre: 'Cubierto', skip: true, preguntar_voz: false })
  const [mesasPaxMap, setMesasPaxMap] = useState<Record<string, number>>({})
  // Datos para el plano visual
  const [mesasPlano, setMesasPlano] = useState<MesaPlano[]>([])
  const mesasPlanoRef = useRef<MesaPlano[]>([])   // espejo síncrono — evita recrear stopRecording en cada realtime update
  const [zonasPlano, setZonasPlano] = useState<ZonaInfo[]>([])
  // Guarda resultado de BRAIN mientras esperamos comensales por voz
  const [pendingVozComanda, setPendingVozComanda] = useState<{
    mesaId: string; mesaCodigo: string; paxYaConocido: number | null
  } | null>(null)

  // Config camarero
  const [tabsVisibles, setTabsVisibles] = useState<Tab[]>(ALL_TABS.map(t=>t.id))
  const [voiceConfirm, setVoiceConfirm] = useState(true)
  const [autoConfirm, setAutoConfirm]   = useState(false)   // enviar sin confirmar si confianza alta
  const [autoThreshold, setAutoThreshold] = useState(85)    // % mínimo para auto-confirmar
  const [ttsOff, setTtsOff]             = useState(false)   // BRAIN no habla, solo escribe
  const [mesaFijada, setMesaFijada]     = useState<string|null>(null)  // mesa pinchada en HABLAR
  const [clarificacionCtx, setClarificacionCtx] = useState<string|null>(null)
  const [preguntaBrain, setPreguntaBrain]       = useState<string>('¿Qué mesa?')
  const [chipsClarificacion, setChipsClarificacion] = useState<{nombre:string;precio?:number|null;cantidad:number}[]>([])
  const [mesaClarificacion, setMesaClarificacion]   = useState<string|null>(null) // codigo de mesa
  // ── NIM conversacional: cuando BRAIN no entiende ────────────────────
  const [nimActivo, setNimActivo]               = useState(false)
  const [nimHistorial, setNimHistorial]         = useState<{role:string;content:string}[]>([])
  const [nimTextoOriginal, setNimTextoOriginal] = useState<string>("")
  const [alergenosMesa, setAlergenosMesa]   = useState<string[]>([])
  const [zonasAsignadas, setZonasAsignadas] = useState<string[]>([])   // [] = todas
  const [fontBig, setFontBig]               = useState(false)
  const [mesaRapidaModal, setMesaRapidaModal] = useState(false)
  const [mesaRapidaForm, setMesaRapidaForm]   = useState({ zona: '', alias: '', telefono: '' })
  const [mesaRapidaLoading, setMesaRapidaLoading] = useState(false)
  const [mesaRapidaErr, setMesaRapidaErr]     = useState('')
  const [productosCarta, setProductosCarta] = useState<ProductoCarta[]>([])
  const [cartaBusqueda, setCartaBusqueda]   = useState('')
  const [cartaFiltroMaridaje, setCartaFiltroMaridaje] = useState<string | null>(null)

  const addMsg = useCallback((from:ChatMsg['from'], texto:string, tipo?:ChatMsg['tipo']) => {
    setChatMsgs(prev => [...prev.slice(-4), {id:Date.now().toString(), from, texto, ts:new Date(), tipo}])
  }, [])

  // setScreenSafe: actualiza estado Y ref en un solo punto → evita stale closures en guards PTT/VAD
  const setScreenSafe = useCallback((s: Screen) => {
    screenRef.current = s
    setScreen(s)
  }, [])

  const { prompt: installPrompt, install } = useInstallPrompt()
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate()
  useAutoReload(30 * 60 * 1000) // recarga automática si el camarero vuelve tras ≥30 min en background (30 min = sin duda fuera de servicio activo)
  const { subscribed, subscribe }          = usePushNotifications(session.id)
  const { alertas, marcarLeida }           = useAlertas(session.id, session.restaurante_id)
  const { offline, pendientes: offlineQueue, encolar, sincronizar: sincronizarOffline } =
    useOfflineQueue((comanda, exito) => {
      if (exito) addMsg('brain', `✓ Sincronizada: ${comanda.mesa_codigo}`, 'ok')
    })
  const productos86                        = useProductos86(turnoId??undefined)
  const { comandas }                       = useComandas(turnoId??undefined)
  const servicioPendiente                  = useServicioPendiente(session.restaurante_id)
  const handleMensajeNuevo = useCallback((m: import('@/hooks/useMensajes').Mensaje) => {
    if (ttsOff) return
    const quien = m.nombre_origen ?? m.rol_origen
    const texto = m.tipo === 'audio' ? `Audio de ${quien}` : `Mensaje de ${quien}: ${m.texto}`
    speak(texto)
  }, [ttsOff])

  const { mensajes, noLeidos, enviar: enviarMensaje, marcarLeido: marcarMensajeLeido } =
    useMensajes(session.restaurante_id, session.id, session.rol, turnoId, handleMensajeNuevo)
  const [chatTexto, setChatTexto]          = useState('')
  const [chatDestino, setChatDestino]      = useState<DestinoChat>('todos')
  const chatEndRef                         = useRef<HTMLDivElement>(null)
  const prev86 = useRef(0)

  const ultimasComandas = Object.values(
    comandas
      .filter(c => c.camarero_id === session.id && ['nueva','en_cocina','lista','cuenta_pedida'].includes(c.estado))
      .reduce((acc, c) => {
        // Quedarse con la comanda más reciente por mesa
        if (!acc[c.mesa_id] || c.created_at > acc[c.mesa_id].created_at) acc[c.mesa_id] = c
        return acc
      }, {} as Record<string, typeof comandas[0]>)
  ).sort((a, b) => new Date((b as {created_at:string}).created_at).getTime() - new Date((a as {created_at:string}).created_at).getTime()).slice(0, 4) // 4 mesas más recientes

  // Todas las mesas ocupadas del turno (de cualquier camarero) para el grid
  const mesasOcupadas = comandas
    .filter(c => ['nueva','en_cocina','cuenta_pedida'].includes(c.estado))
    .reduce((acc: Record<string,typeof comandas[0]>, c) => {
      // Una entrada por mesa (la más reciente)
      if (!acc[c.mesa_id] || new Date(c.created_at) > new Date(acc[c.mesa_id].created_at)) {
        acc[c.mesa_id] = c
      }
      return acc
    }, {})

  useEffect(() => {
    if (productos86.length > prev86.current) {
      const nuevos = productos86.slice(0, productos86.length - prev86.current)
      setAlert86(nuevos.map(p=>p.nombre))
      addMsg('sistema', `86 · ${nuevos.map(p=>p.nombre).join(', ')}`, 'aviso')
      setTimeout(() => setAlert86([]), 8000)
      prev86.current = productos86.length
    }
  }, [productos86.length, addMsg])

  useEffect(() => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    const fetchTurno = () =>
      fetch('/api/turno', { headers: { 'x-ia-session': ses } })
        .then(r => r.json())
        .then(d => setTurnoId(d.turno?.id ?? null))
        .catch(() => {})
    fetchTurno()
    // Fix #9: reducido a 20s para detectar apertura/cierre de turno más rápido
    const turnoInterval = setInterval(fetchTurno, 20_000)
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_cfg')||'{}')
      if (cfg.voiceConfirm !== undefined) setVoiceConfirm(cfg.voiceConfirm)
      if (cfg.zonasAsignadas) setZonasAsignadas(cfg.zonasAsignadas)
      else if (cfg.zonaAsignada) setZonasAsignadas([cfg.zonaAsignada]) // backward compat
      if (cfg.fontBig !== undefined) setFontBig(cfg.fontBig)
      if (cfg.autoConfirm !== undefined) setAutoConfirm(cfg.autoConfirm)
      if (cfg.autoThreshold !== undefined) setAutoThreshold(cfg.autoThreshold)
      if (cfg.ttsOff !== undefined) setTtsOff(cfg.ttsOff)
      if (cfg.tabsVisibles) {
        // Asegurar que hablar y config siempre están (fijos)
        const fijos = ALL_TABS.filter(t=>t.fijo).map(t=>t.id)
        const saved: Tab[] = cfg.tabsVisibles
        // Añadir tabs nuevos que no existían cuando el usuario guardó su config
        const nuevos = ALL_TABS.filter(t=>!t.fijo && !saved.includes(t.id)).map(t=>t.id)
        setTabsVisibles([...new Set([...fijos, ...saved, ...nuevos])])
      }
    } catch {}
    // Cargar config de servicio/cubierto
    fetch('/api/owner/config/servicio', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => {
        if (d.config) setServicioConfig({
          activo:        d.config.servicio_activo       ?? false,
          precio:        d.config.servicio_precio       ?? 1.50,
          nombre:        d.config.servicio_nombre       ?? 'Cubierto',
          skip:          d.config.servicio_skip         ?? true,
          preguntar_voz: d.config.servicio_preguntar_voz ?? false,
        })
      })
      .catch(() => {})
    // Cargar carta para consulta del camarero
    fetch('/api/owner/carta', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => { if (d.productos) setProductosCarta(d.productos.filter((p: ProductoCarta) => p.activo)) })
      .catch(() => {})
    // Cargar mesas y zonas para el plano visual
    Promise.all([
      fetch('/api/owner/mesas', { headers: { 'x-ia-session': ses } }).then(r => r.json()),
      fetch('/api/owner/zonas', { headers: { 'x-ia-session': ses } }).then(r => r.json()),
    ]).then(([dm, dz]) => {
      if (dm.mesas) {
        const mapped = dm.mesas.map((m: {
          id:string;codigo:string;capacidad:number;zona:string;
          pos_x:number|null;pos_y:number|null;forma:string|null;estado:string;
        }) => ({
          ...m,
          estado: (m.estado ?? 'libre') as MesaPlano['estado'],
          es_mia: false,
        }))
        setMesasPlano(mapped)
        mesasPlanoRef.current = mapped
      }
      if (Array.isArray(dz)) setZonasPlano(dz.map((z: {id:string;tipo:string;nombre:string}) => ({
        id: z.id, tipo: z.tipo, nombre: z.nombre,
      })))
    }).catch(() => {})
    return () => clearInterval(turnoInterval)
  }, [])

  // ── Activar turno propio (fichaje de entrada) — el camarero inicia su turno sin necesitar al owner
  const activarTurno = async () => {
    setIniciandoTurno(true)
    try {
      const ses = localStorage.getItem('ia_rest_session') ?? ''
      const r = await fetch('/api/turnos/fichar', { method: 'POST', headers: { 'x-ia-session': ses } })
      const d = await r.json()
      if (d.ok) {
        // Turno creado — re-fetch inmediato para obtener el turnoId (capa 2 de /api/turno)
        const r2 = await fetch('/api/turno', { headers: { 'x-ia-session': ses } })
        const d2 = await r2.json()
        if (d2.turno?.id) setTurnoId(d2.turno.id)
      }
    } catch {}
    setIniciandoTurno(false)
  }

  // ── Polling background cuentas pendientes → mantiene badge actualizado
  //    aunque el camarero esté en cualquier otro tab (Hablar, Manual, etc.)
  useEffect(() => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    const checkCuentas = () =>
      fetch('/api/edge/mis-cuentas', { headers: { 'x-ia-session': ses } })
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d.cuentas)) {
            // Badge solo cuenta cuentas urgentes (pedidas) — no todas las mesas activas
            const urgentes = (d.cuentas as {estado:string;tipo:string}[])
              .filter(c => c.estado === 'cuenta_pedida' || c.tipo === 'cuenta').length
            setCuentasCount(urgentes)
          }
        })
        .catch(() => {})
    checkCuentas()
    const iv = setInterval(checkCuentas, 30_000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveCfg = useCallback((patch: Record<string,unknown>) => {
    try {
      const cfg = JSON.parse(localStorage.getItem('ia_cfg')||'{}')
      localStorage.setItem('ia_cfg', JSON.stringify({...cfg,...patch}))
    } catch {}
  }, [])
  void mesasPaxMap // usado en sessionStorage via ComensalesModal

  // Sincronizar estados de mesas con comandas activas en tiempo real
  useEffect(() => {
    if (!mesasPlano.length) return
    setMesasPlano(prev => {
      const next = prev.map(m => {
        const comanda = mesasOcupadas[m.id]
        if (!comanda) {
          if (m.estado === 'reservada') return m  // preservar candado + hora reserva
          return {
            ...m, estado: 'libre' as const,
            num_comensales: null, es_mia: false,
            minutos_abierta: null, servicio_pendiente: false,
            nombre_cuenta: null, reserva_hora: null,
          }
        }
        const min = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000)
        const estado: MesaPlano['estado'] = comanda.tipo === 'cuenta' || comanda.estado === 'cuenta_pedida' ? 'cuenta'
          : comanda.estado === 'en_cocina' ? 'en_cocina'
          : min > 60 ? 'urgente' : 'activa'
        return {
          ...m,
          estado,
          num_comensales: comanda.num_comensales ?? null,
          es_mia: comanda.camarero_id === session.id,
          minutos_abierta: min,
          servicio_pendiente: servicioPendiente.has(m.id),
          nombre_cuenta: (comanda as {nombre_cuenta?: string | null}).nombre_cuenta ?? null,
          reserva_hora: null,
        }
      })
      mesasPlanoRef.current = next  // mantener ref síncrona
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandas, session.id, servicioPendiente])

  // ── Timer para actualizar colores de tiempo en PlanoSala ──────────────
  // minutos_abierta se congela entre eventos Realtime; este timer lo recalcula
  // cada 60s para que los dots <15' / 15-30' / 30-45' / >45' sean precisos
  useEffect(() => {
    const t = setInterval(() => {
      setMesasPlano(prev => {
        const next = prev.map(m => {
          const comanda = mesasOcupadas[m.id]
          if (!comanda || m.estado === 'libre' || m.estado === 'reservada') return m
          const min = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000)
          const estado: MesaPlano['estado'] = comanda.tipo === 'cuenta' || comanda.estado === 'cuenta_pedida' ? 'cuenta'
            : comanda.estado === 'en_cocina' ? 'en_cocina'
            : min > 60 ? 'urgente' : 'activa'
          return { ...m, minutos_abierta: min, estado }
        })
        mesasPlanoRef.current = next
        return next
      })
    }, 60_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesasOcupadas])

  useEffect(() => {
    if (screen !== 'speaking' || !brain) return
    speakingRef.current = true
    speak(buildTTS(brain, alertas86, alertasAlerg)).then(() => {
      if (speakingRef.current) { speakingRef.current=false; setScreenSafe('confirm') }
    })
    return () => { speakingRef.current = false }
  }, [screen, brain]) // eslint-disable-line react-hooks/exhaustive-deps

  // brainRef: espejo síncrono de `brain` para guards en stopRecording sin stale closures
  // Necesario para evitar que `brain` aparezca en las dependencias de stopRecording,
  // lo que lo recrearía con cada comanda y desregistraría los handlers de auricular.
  const brainRef     = useRef<BrainResult|null>(null)
  const mediaRef     = useRef<MediaRecorder|null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const recordingRef = useRef(false)
  // screenRef: espejo síncrono de `screen` para guards en callbacks sin stale closures
  const screenRef    = useRef<Screen>('idle')
  // processingRef: mutex para evitar doble fetch concurrente (legacy, sustituido por fetchInFlightRef)
  const processingRef = useRef(false)
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout>|null>(null)
  const analyserRef      = useRef<AnalyserNode|null>(null)
  const audioCtxRef      = useRef<AudioContext|null>(null)
  const vadFrameRef      = useRef<number|null>(null)
  // ── Anti-duplicado: lock global + cooldown + duración mínima ────────
  const fetchInFlightRef  = useRef(false)           // bloquea si hay fetch activo
  const cooldownRef       = useRef(false)            // 1.5s tras stop antes de nuevo start
  const recordStartRef    = useRef(0)                // timestamp inicio grabación
  const recordingIdRef    = useRef('')               // idempotency key por grabación
  const pttManualRef      = useRef(false)            // true = usuario mantiene botón pulsado → VAD desactivado
  const abortFetchRef     = useRef<AbortController|null>(null)  // cancela fetch en vuelo
  const ruidoRetryRef     = useRef(0)               // contador de reintentos por ruido (max 1)
  const maxRecTimerRef    = useRef<ReturnType<typeof setTimeout>|null>(null)  // auto-stop 90s
  const watchdogRef       = useRef<ReturnType<typeof setTimeout>|null>(null)  // watchdog processing
  const mesaTouchRef      = useRef({startY:0, moved:false})                   // scroll-safe tap mesas
  const [audioLevel, setAudioLevel] = useState(0)  // nivel RMS visual (0-100)
  const levelTimerRef     = useRef<ReturnType<typeof setTimeout>|null>(null)

  // ── Auriculares 3.5mm — PTT por botón de cable ──────────────────
  const silentAudioRef       = useRef<HTMLAudioElement|null>(null)
  const mediaSessionReadyRef = useRef(false)
  const [headphoneConnected, setHeadphoneConnected] = useState(false)

  // Activa MediaSession con audio silencioso en loop.
  // Necesario para que Chrome Android enrute teclas de auricular a la app.
  // Solo se activa una vez por sesión, en el primer gesto del usuario.
  const activateMediaSession = useCallback(() => {
    // Si corre dentro del APK nativo, la MediaSession la gestiona Android directamente
    if (typeof window !== 'undefined' && (window as any).isNativeApp) return
    if (mediaSessionReadyRef.current) return
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return
    try {
      if (!silentAudioRef.current) {
        // WAV silencioso mínimo (1 sample, 8-bit, 8kHz) en base64
        const a = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
        a.loop = true
        a.volume = 0.001
        silentAudioRef.current = a
      }
      silentAudioRef.current.play().catch(() => {/* autoplay bloqueado hasta gesto — normal */})
      mediaSessionReadyRef.current = true
    } catch { /* ignore en browsers sin soporte */ }
  }, [])

  const startRecording = useCallback(async () => {
    // Bloquear si hay fetch activo (anti-duplicado principal)
    if (fetchInFlightRef.current) return
    // Bloquear durante cooldown post-grab (evita doble-tap accidental)
    if (cooldownRef.current) return
    // Guard via screenRef (síncrono) — evita stale closures cuando el PTT llega muy rápido
    const cur = screenRef.current
    // Permitir grabar desde: idle, asking, sent, speaking (interrumpe TTS), error (reintentar)
    if (cur === 'sent') {
      stopVox()
      speakingRef.current = false
      setBrain(null); brainRef.current = null; setTranscript(''); setError('')
      setAlertas86([]); setAlertasAlerg([]); setPendingItems([]); setAvisoRuido(false); ruidoRetryRef.current = 0
      setNimActivo(false); setNimHistorial([]); setNimTextoOriginal(""); setClarificacionCtx(null); setPreguntaBrain('¿Qué mesa?')
      setChipsClarificacion([]); setMesaClarificacion(null)
      setPedidoCuenta({ loading: false, error: '', factura: null })
      // continúa sin return — empieza a grabar directamente
    } else if (cur === 'speaking') {
      // Bug-fix: interrumpir TTS (VOX neural o Web Speech) para grabar
      stopVox()
      speakingRef.current = false
      // Fix #5: en iOS, getUserMedia desde el handler de speaking puede fallar.
      // Mostrar asking para que el camarero pulse PTT con gesto directo (requerido por Safari).
      if (isIOS) {
        setScreenSafe('asking')
        setPreguntaBrain('Pulsa para grabar la siguiente comanda')
        setChipsClarificacion([])
        return
      }
      // No reseteamos brain/transcript — visible en UI mientras graba la siguiente
      // continúa sin return
    } else if (cur === 'error') {
      // Bug-fix: permitir PTT desde error — sin esto queda bloqueado permanentemente
      setBrain(null); brainRef.current = null; setTranscript(''); setError('')
      processingRef.current = false; fetchInFlightRef.current = false
      // continúa sin return
    } else if (cur === 'confirm') {
      // Bug-fix: pulsar PTT desde confirm cancela la comanda pendiente y graba de nuevo
      if (lastComandaId) {
        fetch(`/api/comanda/${lastComandaId}/cancelar`, {
          method: 'PATCH',
          headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
        }).catch(() => {})
      }
      setBrain(null); brainRef.current = null; setTranscript(''); setError('')
      processingRef.current = false; fetchInFlightRef.current = false
      // continúa sin return
    } else if (cur !== 'idle' && cur !== 'asking') return
    // Lock extra: evitar doble MediaRecorder si el PTT llega antes de que React actualice
    if (recordingRef.current) return
    try {
      // Generar ID único por grabación (idempotencia servidor)
      recordingIdRef.current = crypto.randomUUID()
      recordStartRef.current = Date.now()
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current = []
      // Bug-fix iOS: audio/webm no está soportado en Safari — detectar formato disponible
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','']
        .find(t => !t || MediaRecorder.isTypeSupported(t)) ?? ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mr.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100); mediaRef.current=mr; recordingRef.current=true
      setScreenSafe('recording')
      if (navigator.vibrate) navigator.vibrate(50)

      // ── Auto-stop máximo 90s (seguridad — no puede quedar grabando para siempre) ──
      if (maxRecTimerRef.current) clearTimeout(maxRecTimerRef.current)
      maxRecTimerRef.current = setTimeout(() => {
        if (recordingRef.current) stopRecording()
      }, 90_000)

      // ── VAD + medidor de nivel audio ──────────────────────────────
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        audioCtxRef.current = audioCtx
        analyserRef.current = analyser
        const buf = new Uint8Array(analyser.frequencyBinCount)
        let silentMs = 0
        // Umbral adaptativo: medir ruido ambiente en los primeros 400ms
        let ambientRms = 8  // default conservador
        const SILENCE_DURATION  = 2500   // 2.5s — más margen en ambiente ruidoso
        const FRAME_INTERVAL    = 80
        let lastFrame = Date.now()

        const vadLoop = () => {
          if (!recordingRef.current) return
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i] - 128)
          const rms = sum / buf.length

          // Actualizar medidor visual (escalar RMS 0-30 → 0-100)
          if (levelTimerRef.current) clearTimeout(levelTimerRef.current)
          const lvl = Math.min(100, Math.round((rms / 30) * 100))
          setAudioLevel(lvl)
          levelTimerRef.current = setTimeout(() => setAudioLevel(0), 150)

          // Si el camarero mantiene el botón pulsado → NO auto-stop
          if (pttManualRef.current) {
            silentMs = 0
            vadFrameRef.current = setTimeout(vadLoop, FRAME_INTERVAL) as unknown as number
            return
          }

          const now = Date.now()
          const delta = now - lastFrame
          lastFrame = now

          // Umbral adaptativo: threshold = ruido ambiente + margen
          const SILENCE_THRESHOLD = Math.max(6, ambientRms * 1.4)
          if (rms < SILENCE_THRESHOLD) {
            silentMs += delta
            if (silentMs >= SILENCE_DURATION) {
              if (recordingRef.current) stopRecording()
              return
            }
          } else {
            silentMs = 0
          }
          vadFrameRef.current = setTimeout(vadLoop, FRAME_INTERVAL) as unknown as number
        }

        // Calibrar ruido ambiente en los primeros 400ms antes de activar VAD
        vadFrameRef.current = setTimeout(() => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i] - 128)
          ambientRms = sum / buf.length
          vadLoop()
        }, 400) as unknown as number
      } catch { /* VAD no disponible — modo normal sin auto-stop */ }
      // ─────────────────────────────────────────────────────────────
    } catch { setError('Sin acceso al micrófono'); setScreenSafe('error') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setScreenSafe])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    // Mutex: evitar doble fetch si stopRecording se llama dos veces casi simultáneamente
    if (processingRef.current) return

    // ── Duración mínima 600ms — evita blobs de ruido por tap accidental ──
    const durMs = Date.now() - recordStartRef.current
    if (durMs < 600) {
      recordingRef.current = false
      const mr = mediaRef.current
      mr.onstop = () => {}; mr.stop()
      mr.stream.getTracks().forEach(t => t.stop())
      chunksRef.current = []
      // Limpiar VAD
      if (vadFrameRef.current) { clearTimeout(vadFrameRef.current); vadFrameRef.current = null }
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} audioCtxRef.current = null }
      analyserRef.current = null
      setScreenSafe('idle')
      cooldownRef.current = true
      setTimeout(() => { cooldownRef.current = false }, 500)
      return
    }

    processingRef.current = true
    recordingRef.current = false; setScreenSafe('processing')
    // Limpiar timers de grabación
    if (maxRecTimerRef.current) { clearTimeout(maxRecTimerRef.current); maxRecTimerRef.current = null }
    if (vadFrameRef.current) { clearTimeout(vadFrameRef.current); vadFrameRef.current = null }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} audioCtxRef.current = null }
    analyserRef.current = null; setAudioLevel(0)
    // ── Watchdog: si processing dura más de 35s, forzar reset ───────────────
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = setTimeout(() => {
      if (screenRef.current === 'processing') {
        console.warn('[PTT] watchdog: processing timeout → reset')
        processingRef.current = false; fetchInFlightRef.current = false
        setError('Tiempo de espera agotado. Inténtalo de nuevo.')
        setScreenSafe('error')
      }
    }, 35_000)
    const mr = mediaRef.current
    // Timeout en onstop: en Android WebView puede no dispararse nunca → PROCESANDO colgado
    await Promise.race([
      new Promise<void>(resolve => { mr.onstop=()=>resolve(); mr.stop() }),
      new Promise<void>(resolve => setTimeout(resolve, 2500))   // fallback 2.5s
    ])
    mr.stream.getTracks().forEach(t=>t.stop())
    if (!chunksRef.current.length) { processingRef.current = false; setScreenSafe('idle'); return }

    // ── Cooldown 1.5s — impide nueva grabación mientras procesa ─────────
    cooldownRef.current = true
    setTimeout(() => { cooldownRef.current = false }, 1500)

    // Bug-fix: usar el mimeType real del MediaRecorder (puede ser mp4 en iOS, no siempre webm)
    const actualMimeType = mediaRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: actualMimeType })

    // ── Guardia: sin turno activo → activar turno automáticamente ──────
    if (!turnoId) {
      processingRef.current = false
      setScreenSafe('idle')
      activarTurno()
      return
    }

    const fd   = new FormData()
    fd.append('audio', blob, 'audio.webm')
    fd.append('camarero_id', session.id)
    fd.append('turno_id', turnoId)
    fd.append('recording_id', recordingIdRef.current)  // idempotency key
    if (pendingItems.length > 0) fd.append('pending_items', JSON.stringify(pendingItems))
    if (clarificacionCtx)        fd.append('pending_context', clarificacionCtx)
    // voiceConfirm=ON → backend crea comanda en pendiente_confirmacion sin print_jobs
    // Los jobs se crean en PATCH /confirmar cuando el camarero confirma en pantalla
    if (voiceConfirm) fd.append('require_confirm', 'true')

    // ── Lock global: bloquea cualquier nuevo fetch hasta terminar ────────
    fetchInFlightRef.current = true
    const abortCtrl = new AbortController()
    abortFetchRef.current = abortCtrl
    try {
      const r = await fetch('/api/transcribe', {method:'POST', body:fd, signal:abortCtrl.signal, headers:{'x-ia-session':localStorage.getItem('ia_rest_session')??''}})
      const d = await r.json()
      if (d.ok) {
        // ── AUTO-RETRY por ruido: primer intento con ruido → reintentar automáticamente ──
        // Solo reintenta 1 vez. En el segundo intento procesa sea como sea (aviso en banner).
        if (d.aviso_ruido && ruidoRetryRef.current < 1) {
          ruidoRetryRef.current += 1
          setScreenSafe('idle')
          speak('No te entendí bien, ¿puedes repetir?').then(() => {
            setTimeout(() => startRecording(), 400)
          })
          return
        }
        ruidoRetryRef.current = 0  // reset en respuesta buena

        setTranscript(d.texto); setBrain(d.brain); brainRef.current = d.brain; setLatencia(d.latencia_ms)
        setLastComandaId(d.comanda_id??null); setAlertas86(d.alertas_86??[]); setAlertasAlerg(d.alertas_alergenos??[]); setAvisoRuido(d.aviso_ruido??false)
        addMsg('camarero', d.texto)

        // ── BRAIN pide clarificación por ambigüedad (ej: "un tinto" con 4 tintos) ──
        if (d.brain?.necesita_clarificacion && d.brain?.pregunta_clarificacion) {
          const pregunta  = d.brain.pregunta_clarificacion as string
          const opciones  = (d.brain.opciones_clarificacion ?? []) as {nombre:string;precio?:number|null;cantidad:number}[]
          setClarificacionCtx(d.texto)
          setPreguntaBrain(pregunta)
          setMesaClarificacion(d.brain?.mesa ?? null)
          addMsg('brain', pregunta, 'pregunta')
          if (opciones.length >= 2) {
            // Muchas opciones → chips tocables, no voz
            setChipsClarificacion(opciones)
            setScreenSafe('asking')
          } else {
            // Pocas opciones → flujo de voz (blanco/tinto/rosado)
            setChipsClarificacion([])
            setScreenSafe('asking')
            // B2 FIX: iOS no permite autostart getUserMedia desde promesa
            if (!isIOS) speak(pregunta).then(() => startRecording())
            else speak(pregunta)  // solo TTS, el camarero pulsa PTT
          }
          processingRef.current = false
          return
        }
        // Limpiar contexto de clarificación si se resolvió con éxito
        setNimActivo(false); setNimHistorial([]); setNimTextoOriginal(""); setClarificacionCtx(null); setPreguntaBrain('¿Qué mesa?')
        setChipsClarificacion([]); setMesaClarificacion(null)

        // ── Intent: MESA RÁPIDA por voz ─────────────────────────────────
        if (d.brain?.intent === 'mesa_rapida') {
          const z = d.brain.zona || ''
          const a = d.brain.alias_cliente || ''
          if (z && a) {
            setMesaRapidaLoading(true)
            fetch('/api/mesa/asignar-rapida', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
              body: JSON.stringify({ zona: z, alias_cliente: a }),
            }).then(r => r.json()).then(data => {
              setMesaRapidaLoading(false)
              if (data.mesa) {
                const msg = data.desde_reserva
                  ? `Mesa ${data.mesa.codigo} reservada a nombre de ${a}. Abierta.`
                  : `Mesa ${data.mesa.codigo} asignada a ${a}.`
                addMsg('sistema', msg, 'ok')
                if (!ttsOff) speak(msg)
                if (navigator.vibrate) navigator.vibrate([30, 50, 30])
                // No abrir sheet automáticamente — el camarero ya sabe su mesa
              } else {
                const errMsg = data.otras_zonas?.length
                  ? `Sin mesas libres en ${z}. Disponible en: ${data.otras_zonas.join(', ')}.`
                  : data.error || 'Sin mesas libres.'
                addMsg('sistema', errMsg, 'aviso')
                if (!ttsOff) speak(errMsg)
              }
            }).catch(() => setMesaRapidaLoading(false))
          } else {
            // Faltan datos → abrir modal pre-relleno
            setMesaRapidaForm({ zona: z, alias: a, telefono: '' })
            setMesaRapidaErr('')
            setMesaRapidaModal(true)
          }
          setScreenSafe('idle'); setBrain(null); brainRef.current = null; setTranscript('')
          processingRef.current = false
          return
        }
        // ── RECOMENDACIÓN DE VINO ─────────────────────────────────────────
        if (d.brain?.tipo === 'recomendacion_vino' && d.voz_recomendacion) {
          addMsg('brain', `🍷 ${d.voz_recomendacion}`, 'ok')
          if (!ttsOff) speak(d.voz_recomendacion)
          setScreenSafe('sent')
          processingRef.current = false
          return
        }

        // Excepción: si usó nombre_cuenta, la comanda ya se creó sin mesa
        const esNominal = !!(d.nombre_cuenta && d.comanda_id)
        const mesaInvalida = !esNominal && !d.comanda_id && (
          !d.brain?.mesa ||
          ['T00','M00','','desconocida','undefined'].includes(d.brain.mesa) ||
          d.brain?.tipo === 'aviso' && !d.brain?.items?.length
        )
        if (mesaInvalida) {
          if (d.brain?.items?.length>0) setPendingItems(d.brain.items)
          // NO añadimos al chat aquí — ya lo muestra screen==='asking' directamente
          setScreenSafe('asking')
          // B2 FIX: iOS requiere gesto directo para getUserMedia
          if (!isIOS) speak('¿Qué mesa?').then(() => startRecording())
          else speak('¿Qué mesa?')
          processingRef.current = false
          return
        }

        // Cuenta nominal creada → notificar
        if (esNominal) {
          const bItemsN: BrainResult['items'] = d.brain?.items || []
          const msgN = `★ ${d.nombre_cuenta}: ${bItemsN.map((it: BrainResult['items'][0]) => `${it.cantidad}× ${it.nombre}`).join(', ')}`
          addMsg('brain', msgN, 'ok')
          setLastComandaId(d.comanda_id)
          if (!ttsOff) speak(`${d.nombre_cuenta}: ${bItemsN.map((it: BrainResult['items'][0]) => `${it.cantidad===1?'una de':it.cantidad} ${it.nombre}`).join(', ')}. Anotado.`)
          setScreenSafe('sent')
          processingRef.current = false
          return
        }

        // ── Detectar productos fuera de carta → NIM conversacional ──────────
        // Si BRAIN no entendió (items vacíos, confianza baja), NIM pregunta al camarero
        const bItems: BrainResult['items'] = d.brain?.items || []
        const esFueraCarta = bItems.length === 0 &&
          d.brain?.tipo === 'comanda' &&
          d.brain?.confianza < 0.5
        if (esFueraCarta) {
          // ── Activar NIM conversacional en vez de mostrar error ──────────
          const sesion = localStorage.getItem('ia_rest_session') ?? ''
          const nimHistorialActual = nimActivo ? nimHistorial : []
          try {
            const nimRes = await fetch('/api/brain/conversar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-ia-session': sesion },
              body: JSON.stringify({
                texto_original: d.texto,
                historial: nimHistorialActual,
              }),
            })
            const nimData = await nimRes.json()
            if (nimData.resuelto && nimData.brain_texto) {
              // NIM resolvió → pasar el texto normalizado a BRAIN como pendingContext
              addMsg('brain', nimData.respuesta, 'ok')
              if (!ttsOff) speak(nimData.respuesta)
              setClarificacionCtx(nimData.brain_texto)
              setNimActivo(false); setNimHistorial([]); setNimTextoOriginal('')
              setScreenSafe('asking')
              processingRef.current = false
              return
            }
            // NIM hace una pregunta al camarero
            addMsg('brain', nimData.respuesta, 'pregunta')
            if (!ttsOff) speak(nimData.respuesta)
            setNimActivo(true)
            setNimHistorial(nimData.historial_nuevo ?? [])
            setNimTextoOriginal(d.texto)
            setClarificacionCtx(d.texto)   // para que el siguiente transcribe lo use como contexto
            setScreenSafe('asking')
            if (!isIOS) speak(nimData.respuesta).then(() => startRecording())
          } catch {
            // Fallback al mensaje de error clásico si NIM falla
            const aviso = `"${d.texto}" — no lo entendí. ¿Puedes repetirlo?`
            addMsg('sistema', aviso, 'aviso')
            setScreenSafe('idle')
          }
          processingRef.current = false
          return
        }
        // ─────────────────────────────────────────────────────────────────

        // ── Intent: CUENTA por voz ────────────────────────────────────────
        // El servidor ya actualizó la mesa a estado 'cuenta' y creó el print job.
        // El frontend solo confirma visualmente; NO auto-enviar como comanda vacía.
        if (d.brain?.tipo === 'cuenta' && d.comanda_id) {
          const mesaCuenta = d.brain.mesa || '?'
          addMsg('brain', `🧾 Cuenta solicitada · ${mesaCuenta}`, 'ok')
          if (!ttsOff) speak(`Cuenta solicitada, mesa ${mesaCuenta}`)
          if (navigator.vibrate) navigator.vibrate([30, 50, 30])
          setScreenSafe('sent')
          processingRef.current = false
          return
        }
        // ─────────────────────────────────────────────────────────────────

        setPendingItems([])
        const msgTxt = `${d.brain?.mesa||'?'}: ${bItems.map((it: BrainResult['items'][0])=>`${it.cantidad}× ${it.nombre}`).join(', ')}`
        addMsg('brain', msgTxt + (d.alertas_86?.length?` · ⚠ 86`:'') + (d.alertas_alergenos?.length?` · ⚠ alérgeno`:''), (d.alertas_86?.length||d.alertas_alergenos?.length)?'aviso':'ok')

        // ── ¿Preguntar comensales? ─────────────────────────────
        // Solo si: config activo + config preguntar_voz + BRAIN no capturó pax + es primera comanda de la mesa
        const paxEnVoz  = d.brain?.num_comensales ?? null
        const mesaIdRes = d.mesa_id ?? null  // mesa_id devuelto por transcribe
        const necesitaPax =
          servicioConfig.activo &&
          servicioConfig.preguntar_voz &&
          !paxEnVoz &&
          d.comanda_id  // comanda ya creada, pero sin pax

        // Bug-fix: no abrir modal de comensales si autoConfirm va a ir a sent directamente
        if (necesitaPax && mesaIdRes && !autoConfirm) {
          setPendingVozComanda({ mesaId: mesaIdRes, mesaCodigo: d.brain?.mesa||'?', paxYaConocido: null })
          // Mostramos confirm sheet igual pero con el modal de comensales encima
        }

        const hasTTS = typeof window!=='undefined' && 'speechSynthesis' in window
        const conf   = d.brain?.confianza ?? 0

        // Auto-confirmar si confianza suficiente y opción activada
        if (autoConfirm && conf * 100 >= autoThreshold && d.comanda_id) {
          // voiceConfirm=true → comanda en pendiente_confirmacion → confirmar en background
          if (voiceConfirm) {
            fetch(`/api/comanda/${d.comanda_id}/confirmar`, {
              method: 'PATCH',
              headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
            }).catch(err => console.error('[CONFIRMAR auto]', err))
          }
          setScreenSafe('sent')
          addMsg('brain', `✓ Auto-enviado · ${d.brain?.mesa||'?'}`, 'ok')
        } else if (voiceConfirm && !ttsOff && hasTTS) {
          // Confirmación por voz ON + TTS disponible → BRAIN lee la comanda antes de confirmar
          setScreenSafe('speaking')
        } else if (voiceConfirm) {
          // Confirmación por voz ON pero TTS desactivado → mostrar pantalla de confirmación visual
          setScreenSafe('confirm')
        } else {
          // Confirmación por voz OFF → enviar directamente sin confirmación
          setScreenSafe('sent')
          addMsg('brain', `✓ Enviado · ${d.brain?.mesa||'?'}`, 'ok')
        }
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        const msg = d.code==='API_KEY_INVALID'?'API key no configurada':d.error||'Error al procesar la voz'
        setError(msg); addMsg('sistema', msg, 'error'); setScreenSafe('error')
      }
    } catch { 
      setError('Sin conexión')
      addMsg('sistema','Sin conexión con el servidor — comanda guardada, se enviará al recuperar WiFi','error')
      setScreenSafe('error')
      // Circuit breaker: encolar para reintento offline si BRAIN ya procesó items
      // Usamos brainRef.current (síncrono) en lugar de brain (estado React, stale en callbacks)
      const brainSnap = brainRef.current
      if (brainSnap && brainSnap.items?.length > 0 && brainSnap.mesa) {
        const sesHeader = localStorage.getItem('ia_rest_session') ?? ''
        const mesaObj = mesasPlanoRef.current.find(m => m.codigo === brainSnap.mesa)
        if (mesaObj) encolar({
          mesa_codigo: brainSnap.mesa,
          mesa_id: mesaObj.id,
          items: brainSnap.items,
          sesion_header: sesHeader,
        })
      }
    } finally {
      // ── Siempre liberar todos los locks, pase lo que pase ───────────
      fetchInFlightRef.current = false
      abortFetchRef.current = null
      processingRef.current = false
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
    }
  // brain eliminado de deps → stopRecording NO se recrea en cada comanda → handlers de auricular estables
  // mesasPlano eliminado de deps → usa mesasPlanoRef.current → no se recrea en cada realtime update
  }, [session.id, turnoId, pendingItems, voiceConfirm, startRecording, addMsg, ttsOff, autoConfirm, autoThreshold, servicioConfig, encolar, setScreenSafe])

  useEffect(() => {
    // Bug-fix: usar screenRef.current (síncrono) en lugar de screen (closure stale)
    const dn = (e:KeyboardEvent) => { if(e.code==='Space'&&!e.repeat&&screenRef.current==='idle'){e.preventDefault();startRecording()} }
    const up = (e:KeyboardEvent) => { if(e.code==='Space'&&screenRef.current==='recording') stopRecording() }
    window.addEventListener('keydown',dn); window.addEventListener('keyup',up)
    return () => { window.removeEventListener('keydown',dn); window.removeEventListener('keyup',up) }
  }, [startRecording, stopRecording])

  // ── MediaSession — botón auricular 3.5mm como PTT (toggle) ──────
  // Comportamiento: 1er click → empieza a grabar · 2º click → para y envía
  // Funciona con cualquier auricular con cable y botón (play/pause).
  // En APK nativo se salta — Android gestiona el botón directamente via dispatchKeyEvent.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if ((window as any).isNativeApp) return // APK nativo — no interferir
    const toggle = () => {
      if (screenRef.current === 'idle' || screenRef.current === 'speaking') { activateMediaSession(); startRecording() }
      else if (screenRef.current === 'recording') stopRecording()
    }
    const stop = () => { if (screenRef.current === 'recording') stopRecording() }
    try {
      navigator.mediaSession.setActionHandler('play',  toggle)
      navigator.mediaSession.setActionHandler('pause', stop)
      navigator.mediaSession.setActionHandler('stop',  stop)
      // Neutralizar seek para que no interfiera con nada
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward',  null)
    } catch { /* Browser sin soporte completo de MediaSession */ }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play',  null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('stop',  null)
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRecording, stopRecording, activateMediaSession])

  // ── Activar MediaSession en el primer toque de pantalla ─────────
  // Necesario para "robar" la sesión a Spotify/YouTube en cuanto
  // el camarero toca cualquier parte de la app, sin esperar al PTT.
  useEffect(() => {
    const onFirstTouch = () => {
      activateMediaSession()
      document.removeEventListener('touchstart', onFirstTouch)
      document.removeEventListener('mousedown',  onFirstTouch)
    }
    document.addEventListener('touchstart', onFirstTouch, { passive: true })
    document.addEventListener('mousedown',  onFirstTouch, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onFirstTouch)
      document.removeEventListener('mousedown',  onFirstTouch)
    }
  }, [activateMediaSession])

  // ── Exponer PTT globalmente para app nativa Android ─────────────
  // La app Android (WebView) llama a window.startPTT() / window.stopPTT()
  // cuando el botón del auricular es interceptado por MediaSession nativo.
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).startPTT = () => { pttManualRef.current=true; activateMediaSession(); startRecording() }
    ;(window as any).stopPTT  = () => { pttManualRef.current=false; stopRecording() }
    return () => {
      delete (window as any).startPTT
      delete (window as any).stopPTT
    }
  }, [startRecording, stopRecording, activateMediaSession])

  // ── Detección de auriculares conectados ─────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    const checkHeadphones = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const hasHeadphone = devices.some(d =>
          d.kind === 'audioinput' && d.label.toLowerCase().includes('wired')
          || d.kind === 'audiooutput' && (d.label.toLowerCase().includes('wired') || d.label.toLowerCase().includes('headphone') || d.label.toLowerCase().includes('auricular'))
        )
        setHeadphoneConnected(hasHeadphone)
      } catch { /* ignore */ }
    }
    checkHeadphones()
    navigator.mediaDevices.addEventListener('devicechange', checkHeadphones)
    return () => navigator.mediaDevices.removeEventListener('devicechange', checkHeadphones)
  }, [])

  // ── Timeout reset estado asking (15s sin respuesta → idle) ───────
  useEffect(() => {
    if (screen !== 'asking') return
    const t = setTimeout(() => {
      // Fix #14: avisar antes de reset silencioso
      addMsg('sistema', 'Sin respuesta — nueva comanda cuando quieras.', 'aviso')
      setScreenSafe('idle')
      setBrain(null); brainRef.current = null; setTranscript('')
      setChipsClarificacion([]); setClarificacionCtx(null)
      setMesaClarificacion(null); setPreguntaBrain('¿Qué mesa?')
    }, 15000)
    return () => clearTimeout(t)
  }, [screen, addMsg])

  // ── Auto-reset sent → idle tras 3s ───────────────────────────────
  // Permite pulsar PTT para la siguiente comanda sin tocar "Nueva comanda".
  useEffect(() => {
    if (screen !== 'sent') return
    const t = setTimeout(() => setScreenSafe('idle'), 3000)
    return () => clearTimeout(t)
  }, [screen])

  // ── Auto-reset error → idle tras 5s ──────────────────────────────
  // Bug-fix: 'error' no tenía auto-reset → PTT bloqueado permanentemente
  // tras cualquier fallo de red/servidor. El camarero pulsaba sin feedback.
  useEffect(() => {
    if (screen !== 'error') return
    const t = setTimeout(() => {
      setScreenSafe('idle')
      setError('')
    }, 5000)
    return () => clearTimeout(t)
  }, [screen])

  // ── Auto-reset confirm → idle tras 20s ───────────────────────────
  // Bug-fix: mismo patrón que error — si el camarero no confirma/cancela
  // la pantalla queda bloqueada permanentemente con voiceConfirm=ON.
  // 20s da tiempo suficiente para leer y decidir antes del reset.
  // Fix #6: no resetear si hay un fetch de confirmación en vuelo.
  useEffect(() => {
    if (screen !== 'confirm') return
    const t = setTimeout(() => {
      if (fetchInFlightRef.current) return
      setScreenSafe('idle')
      setBrain(null); brainRef.current = null; setTranscript('')
    }, 20000)
    return () => clearTimeout(t)
  }, [screen])

  // ── window.resetPTT para el APK nativo ───────────────────────────
  // Permite al APK forzar vuelta a idle si detecta estado colgado
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).resetPTT = () => {
      // Si estamos en confirm, cancelar la comanda recién creada
      if (screenRef.current === 'confirm') {
        const cid = lastComandaId
        if (cid) {
          fetch(`/api/comanda/${cid}/cancelar`, {
            method: 'PATCH',
            headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
          }).catch(() => {})
        }
      }
      // Cancelar fetch en vuelo y todos los timers
      if (abortFetchRef.current) { abortFetchRef.current.abort(); abortFetchRef.current = null }
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
      if (maxRecTimerRef.current) { clearTimeout(maxRecTimerRef.current); maxRecTimerRef.current = null }
      speakingRef.current=false; processingRef.current=false; recordingRef.current=false
      fetchInFlightRef.current=false; cooldownRef.current=false
      setAudioLevel(0)
      setScreenSafe('idle'); setBrain(null); brainRef.current = null; setTranscript('')
    }
    return () => { delete (window as any).resetPTT }
  }, [lastComandaId])

  const logout = () => {
    fetch('/api/auth',{method:'DELETE'}); localStorage.removeItem('ia_rest_session')
    window.location.href='/login'
  }

  // Marchar rápido desde doble-tap en plano
  // ── Mesa Rápida ────────────────────────────────────────────────────────
  const asignarMesaRapida = async () => {
    const { zona, alias, telefono } = mesaRapidaForm
    if (!zona.trim() || !alias.trim()) { setMesaRapidaErr('Zona y nombre son obligatorios'); return }
    setMesaRapidaLoading(true); setMesaRapidaErr('')
    try {
      const r = await fetch('/api/mesa/asignar-rapida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
        body: JSON.stringify({ zona: zona.trim(), alias_cliente: alias.trim(), telefono_cliente: telefono.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) {
        setMesaRapidaErr(d.otras_zonas?.length
          ? `Sin mesas libres en ${zona}. Disponible en: ${d.otras_zonas.join(', ')}`
          : d.error || 'Error al asignar mesa')
        return
      }
      setMesaRapidaModal(false)
      setMesaRapidaForm({ zona: '', alias: '', telefono: '' })
      if (d.mesa) {
        const msg = d.desde_reserva
          ? `Mesa ${d.mesa.codigo} reservada a nombre de ${mesaRapidaForm.alias.trim()}. Abierta.`
          : `Mesa ${d.mesa.codigo} asignada a ${mesaRapidaForm.alias.trim()}.`
        if (!ttsOff) speak(msg)
        if (navigator.vibrate) navigator.vibrate([30, 50, 30])
        setMesaDetalle({ id: d.mesa.id, codigo: d.mesa.codigo, capacidad: 4 })
      }
    } catch { setMesaRapidaErr('Error de red') }
    finally { setMesaRapidaLoading(false) }
  }

  // Fix #11: debounce anti-doble-tap — Set de comanda_ids en vuelo
  const marcharEnVueloRef = useRef<Set<string>>(new Set())
  const marcharRapido = async (mesa: MesaPlano) => {
    const comanda = mesasOcupadas[mesa.id]
    if (!comanda || !['en_cocina','nueva','lista','cuenta_pedida'].includes(comanda.estado ?? '')) return
    if (marcharEnVueloRef.current.has(comanda.id)) return
    const items = (comanda.items ?? []).map((it: {nombre:string;cantidad:number}) => ({
      nombre: it.nombre, cantidad: it.cantidad,
    }))
    if (!items.length) return
    marcharEnVueloRef.current.add(comanda.id)
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    try {
      await fetch('/api/marchar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ comanda_id: comanda.id, mesa_codigo: mesa.codigo, items }),
      })
      addMsg('sistema', `✓ Marchado · ${mesa.codigo}`, 'ok')
    } finally {
      setTimeout(() => marcharEnVueloRef.current.delete(comanda.id), 3000)
    }
  }
  const seleccionarChip = useCallback(async (chip: {nombre:string;precio?:number|null;cantidad:number}) => {
    // Buscar mesa_id a partir del codigo guardado
    const mesa = mesasPlanoRef.current.find(m => m.codigo === mesaClarificacion)
    if (!mesa) {
      addMsg('sistema', `Mesa ${mesaClarificacion} no encontrada`, 'error')
      return
    }
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    try {
      // Fix #4: respetar voiceConfirm — igual que el flujo PTT normal
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({
          mesa_id: mesa.id,
          items: [{ nombre: chip.nombre, cantidad: chip.cantidad }],
          ...(voiceConfirm ? { require_confirm: true } : {}),
        }),
      })
      const d = await r.json()
      if (r.ok) {
        const comandaId = d.comanda_id ?? d.id ?? null
        setChipsClarificacion([])
        setClarificacionCtx(null)
        setMesaClarificacion(null)
        setPreguntaBrain('¿Qué mesa?')
        setBrain({ mesa: mesa.codigo, tipo: 'comanda', items: [chip], confianza: 1, raw: chip.nombre })
        brainRef.current = { mesa: mesa.codigo, tipo: 'comanda', items: [chip], confianza: 1, raw: chip.nombre }
        setLastComandaId(comandaId)
        if (navigator.vibrate) navigator.vibrate([30,50,30])
        if (voiceConfirm && comandaId) {
          setScreenSafe('confirm')
        } else {
          addMsg('brain', `✓ ${chip.cantidad}× ${chip.nombre} · ${mesa.codigo}`, 'ok')
          setScreenSafe('sent')
        }
      } else {
        addMsg('sistema', d.error ?? 'Error al crear comanda', 'error')
      }
    } catch {
      addMsg('sistema', 'Sin conexión', 'error')
    }
  }, [mesaClarificacion, addMsg, voiceConfirm])

  const reset = () => {
    // Bug-fix: si el camarero cancela en la pantalla confirm, la comanda ya existe en BD.
    // Hay que marcarla como cancelada para que no llegue al KDS de cocina.
    if (screenRef.current === 'confirm' && lastComandaId) {
      fetch(`/api/comanda/${lastComandaId}/cancelar`, {
        method: 'PATCH',
        headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
      }).catch(() => {}) // fire and forget — no bloquear la UI
    }
    stopVox()
    speakingRef.current=false; processingRef.current=false; recordingRef.current=false
    setScreenSafe('idle'); setBrain(null); brainRef.current = null; setTranscript('')
    setError(''); setPedidoCuenta({loading:false,error:'',factura:null})
    setAlertas86([]); setAlertasAlerg([]); setPendingItems([]); setAvisoRuido(false); ruidoRetryRef.current = 0
    setNimActivo(false); setNimHistorial([]); setNimTextoOriginal(""); setClarificacionCtx(null); setPreguntaBrain('¿Qué mesa?')
    setChipsClarificacion([]); setMesaClarificacion(null)
  }
  const pedirCuenta = async () => {
    if (!lastComandaId) return
    setPedidoCuenta({loading:true,error:'',factura:null})
    try {
      const r = await fetch('/api/factura/cerrar',{method:'POST',headers:{'Content-Type':'application/json','x-ia-session':localStorage.getItem('ia_rest_session')??''},body:JSON.stringify({comanda_id:lastComandaId,mesa_label:brain?.mesa??'Mesa'})})
      const d = await r.json()
      if (r.ok) { setPedidoCuenta({loading:false,error:'',factura:d.factura}); addMsg('sistema',`Factura ${d.factura?.numero_factura} · ${d.factura?.importe_total?.toFixed(2)} €`,'ok') }
      else setPedidoCuenta({loading:false,error:d.error??'Error',factura:null})
    } catch { setPedidoCuenta({loading:false,error:'Error de red',factura:null}) }
  }

  const isListening  = screen==='recording'
  // Bug-fix: 'speaking' ya no bloquea el botón — el camarero puede interrumpir el TTS
  // para grabar la siguiente comanda directamente (startRecording maneja la interrupción)
  const isProcessing = screen==='processing'

  return (
    <div className="edge-root" style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN,position:'relative',color:C.ink,zoom:fontBig?'110%':'100%'}}>
      <style>{`
        @keyframes ldot{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes hout{0%{transform:scale(1);opacity:.4}100%{transform:scale(2);opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes sttPulse{from{opacity:.6}to{opacity:1}}
        @keyframes urgPulse{0%,100%{border-color:${C.verm}}50%{border-color:${C.vermD}}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pushIn{from{transform:translateY(-100%)}to{transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes a86{0%{opacity:0;transform:translateY(-100%)}10%{opacity:1;transform:translateY(0)}85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-100%)}}
        * { -webkit-tap-highlight-color: transparent; }
        button, a { touch-action: manipulation; }
        input, select, textarea { font-size: 16px; } /* evita zoom en iOS */

        /* ── Desktop: nav lateral ─────────────────────────── */
        @media (min-width:1024px) {
          .edge-root { flex-direction:row !important; }
          .edge-main { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; }
          .edge-nav {
            flex-direction:column !important;
            width:72px;
            flex-shrink:0;
            border-top:none !important;
            border-right:1px solid ${C.rule};
            padding:12px 6px !important;
            gap:4px;
            justify-content:flex-start !important;
            order:-1;
            overflow-y:auto;
            scrollbar-width:none;
          }
          .edge-nav::-webkit-scrollbar { display:none; }
          .edge-nav-btn {
            border-bottom:none !important;
            padding:10px 6px !important;
            border-radius:8px;
            gap:4px !important;
          }
          .edge-nav-btn.edge-nav-on { background:${C.bg2}; }
          .edge-nav-indicator {
            top:6px !important; left:0 !important; right:0 !important; bottom:auto !important;
            height:auto !important; width:2px !important; border-radius:0 3px 3px 0 !important;
          }
          .edge-nav-lbl { display:block !important; font-size:8px !important; }
          .edge-nav-badge { right:6px !important; top:4px !important; }
        }
        @media (min-width:1280px) {
          .edge-nav { width:88px; }
          .edge-nav-lbl { font-size:9px !important; }
        }
      `}</style>

      {/* ALERTAS — banner audio + notificación */}
      <AlertaBanner alertas={alertas} onMarcarLeida={marcarLeida} />
      <SmartScanFAB session={session} bottom={96} right={16} />

      {/* BANNER ACTUALIZACIÓN DISPONIBLE */}
      {updateAvailable && (
        <div style={{
          position:'absolute', top:0, left:0, right:0, zIndex:80,
          background:'#1A1714', borderBottom:'2px solid #D9442B',
          padding:'10px 16px', display:'flex', alignItems:'center', gap:12,
          boxShadow:'0 4px 16px rgba(217,68,43,.25)',
        }}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#D9442B',flexShrink:0,animation:'ldot 1s infinite'}}/>
          <span style={{fontFamily:"'Inter Tight',system-ui,sans-serif",fontSize:13,color:'#F6F1E7',flex:1,fontWeight:500}}>
            Nueva versión disponible
          </span>
          <button onClick={applyUpdate} style={{
            background:'#D9442B', border:'none', borderRadius:8,
            padding:'7px 16px', fontFamily:"'Inter Tight',system-ui,sans-serif",
            fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer',
          }}>
            Actualizar ahora
          </button>
        </div>
      )}

      {/* BANNER OFFLINE — sin conexión o comandas pendientes */}
      {(offline || offlineQueue.length > 0) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 65,
          background: offline ? '#D9442B' : '#3F7D44',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#fff' }}>
            {offline
              ? `⚠ Sin WiFi${offlineQueue.length > 0 ? ` — ${offlineQueue.length} comanda${offlineQueue.length > 1 ? 's' : ''} en cola` : ''}`
              : `↑ Reconectado — sincronizando ${offlineQueue.length} comanda${offlineQueue.length > 1 ? 's' : ''}…`
            }
          </span>
          {!offline && offlineQueue.length > 0 && (
            <button
              onClick={() => sincronizarOffline()}
              style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 11, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
            >
              Enviar ahora
            </button>
          )}
        </div>
      )}

      {/* PUSH */}
      {showPush && (
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:60,background:C.grS,borderBottom:`2px solid ${C.gr}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,animation:'pushIn .3s ease'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:C.gr,flexShrink:0}}/>
          <span style={{fontFamily:SC,fontSize:14,flex:1,color:C.ink}}>{pushMsg}</span>
          <span onClick={()=>setShowPush(false)} style={{fontSize:11,color:C.ink3,cursor:'pointer'}}>✕</span>
        </div>
      )}

      {/* 86 BANNER */}
      {alert86.length>0 && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:C.verm,padding:'10px 16px',fontFamily:SM,fontSize:12,color:'#fff',display:'flex',alignItems:'center',gap:10,animation:'a86 8s ease forwards'}}>
          <span style={{fontWeight:700,letterSpacing:'.1em'}}>86</span><span style={{opacity:.6}}>·</span>
          <span>{alert86.join(' · ')}</span>
          <button onClick={()=>setAlert86([])} style={{marginLeft:'auto',background:'none',border:'none',color:'#fff',cursor:'pointer',fontSize:15}}>×</button>
        </div>
      )}


      {/* ALÉRGENOS MODAL */}
      {mostrarAlerg && (
        <div style={{position:'fixed',inset:0,background:'rgba(26,23,20,.7)',zIndex:200,display:'flex',flexDirection:'column',padding:20,gap:12}}>
          <div style={{fontFamily:SM,fontSize:10,color:C.amb,letterSpacing:'.12em',fontWeight:700,textTransform:'uppercase'}}>ALÉRGENOS DE MESA · EU 1169/2011</div>
          <div style={{fontFamily:SN,fontSize:12,color:C.bg,lineHeight:1.4}}>El cliente ha indicado intolerancia / alergia a:</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))',gap:8,flex:1}}>
            {['Gluten','Crustáceos','Huevos','Pescado','Cacahuetes','Soja','Lactosa','Frutos secos','Apio','Mostaza','Sésamo','Sulfitos','Altramuces','Moluscos'].map(al=>{
              const on = alergenosMesa.includes(al)
              return (
                <button key={al} onPointerDown={()=>setAlergenosMesa(p=>on?p.filter(a=>a!==al):[...p,al])}
                  style={{background:on?C.ambS:C.bg1,border:`1px solid ${on?C.amb:C.rule}`,borderRadius:8,padding:'10px 8px',fontFamily:SN,fontSize:13,fontWeight:on?700:400,color:on?'#7A5A1A':C.ink2,cursor:'pointer',textAlign:'left',transition:'all .12s'}}>
                  {al}
                </button>
              )
            })}
          </div>
          <button onPointerDown={()=>setMostrarAlerg(false)}
            style={{background:C.verm,border:'none',color:'#fff',padding:14,borderRadius:10,fontFamily:SN,fontSize:14,fontWeight:700,cursor:'pointer'}}>
            Confirmar — {alergenosMesa.length>0?alergenosMesa.join(', '):'sin alérgenos declarados'}
          </button>
        </div>
      )}

      {/* ── AREA PRINCIPAL: header + contenido ─────────────────── */}
      <div className="edge-main" style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* ── HEADER ─── oculto en tab Manual (tiene su propio header) ── */}
      {tab !== 'manual' && <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.rule}`,background:C.bg1,flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 0 rgba(26,23,20,.06)'}}>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:21,color:C.verm,letterSpacing:'-.4px',lineHeight:1}}>ia.rest</div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {(isListening||isProcessing||screen==='speaking') && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:isListening?`${C.teal}18`:`${C.amb}22`,border:`1px solid ${isListening?C.teal:C.amb}44`,borderRadius:12,padding:'3px 9px'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:isListening?C.teal:C.amb,animation:'ldot 1s infinite'}}/>
              <span style={{fontFamily:SM,fontSize:9,color:isListening?C.teal:C.amb}}>{isListening?'EAR':'BRAIN'}</span>
            </div>
          )}
          {alergenosMesa.length>0 && (
            <div style={{background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:12,padding:'3px 8px',fontFamily:SM,fontSize:9,color:'#7A5A1A',fontWeight:700}}>
              ⚠ {alergenosMesa.length}
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:5,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:16,padding:'5px 11px 5px 7px',cursor:'pointer'}} onClick={logout}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.gr,animation:'ldot 2s infinite'}}/>
            <span style={{fontSize:12,fontWeight:600,color:C.ink}}>{session.nombre.split(' ')[0]}</span>
          </div>
          <SugerenciaButton session={session} tema="light" variant="inline" />
          <a href="/manuals/manual_camarero.pdf" download title="Manual del camarero"
            style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:16,cursor:'pointer',flexShrink:0,textDecoration:'none',color:C.ink3}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-8M9 13l3 3 3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </a>
        </div>
      </div>}

      {/* FUERA DE CARTA — pill visible solo cuando hay especiales */}
      <FueraCartaPill restauranteId={session.restaurante_id} />
      <RecomendacionesPill restauranteId={session.restaurante_id} />

      {/* ══ TAB: HABLAR — chat limpio, sin plano ═══════════════ */}
      {tab==='hablar' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>


          {/* ── Chat ─────────────────────────────────────────── */}
          <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 14px',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:8}}>

            {chatMsgs.length===0 && screen==='idle' && (
              <div style={{textAlign:'center',padding:'20px 20px 10px'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:19,color:C.ink3,lineHeight:1.4,marginBottom:6}}>Mantén pulsado y habla.</div>
                {mesaFijada && (
                  <div style={{fontFamily:SM,fontSize:10,color:C.verm,background:C.vermS,display:'inline-block',padding:'3px 10px',borderRadius:8}}>
                    → siguiente comanda va a {(ultimasComandas as {mesa_id:string;mesa?:{codigo:string}}[]).find(c=>c.mesa_id===mesaFijada)?.mesa?.codigo||'mesa fijada'}
                  </div>
                )}
              </div>
            )}

            {screen==='asking' && (
              <div style={{background:`${C.teal}14`,border:`1px solid ${C.teal}44`,borderRadius:12,padding:'12px 14px',animation:'msgIn .2s ease'}}>
                <div style={{fontFamily:SM,fontSize:8,color:C.teal,letterSpacing:'1px',marginBottom:5,textTransform:'uppercase'}}>BRAIN · pregunta</div>
                <div style={{fontSize:15,fontWeight:600,color:C.ink,marginBottom: chipsClarificacion.length ? 12 : 0}}>{preguntaBrain}</div>
                {/* Chips tocables cuando hay opciones concretas de carta */}
                {chipsClarificacion.length > 0 && (
                  <div style={{display:'flex',flexDirection:'column',gap:7}}>
                    {chipsClarificacion.map((chip,i) => (
                      <button key={i} onPointerDown={()=>seleccionarChip(chip)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                          background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:10,
                          padding:'10px 14px',cursor:'pointer',textAlign:'left',
                          boxShadow:'0 1px 4px rgba(26,23,20,.07)',transition:'all .1s',
                          fontFamily:SN,gap:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:5,height:5,borderRadius:'50%',background:C.verm,flexShrink:0}}/>
                          <span style={{fontSize:14,fontWeight:600,color:C.ink}}>
                            {chip.cantidad > 1 && <span style={{fontFamily:SE,fontStyle:'italic',color:C.verm,marginRight:5}}>{chip.cantidad}×</span>}
                            {chip.nombre}
                          </span>
                        </div>
                        {chip.precio != null && (
                          <span style={{fontFamily:SE,fontStyle:'italic',fontSize:15,color:C.ink3,flexShrink:0}}>
                            {chip.precio.toFixed(2).replace('.',',')} €
                          </span>
                        )}
                      </button>
                    ))}
                    <button onClick={reset} style={{background:'none',border:`1px solid ${C.rule}`,color:C.ink4,borderRadius:8,padding:'7px 12px',fontFamily:SN,fontSize:11,cursor:'pointer',marginTop:2}}>
                      Cancelar
                    </button>
                  </div>
                )}
                {pendingItems.length>0 && chipsClarificacion.length===0 && (
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                    {pendingItems.map((it,i)=>(
                      <div key={i} style={{display:'flex',gap:8,fontSize:12,color:C.ink2}}>
                        <span style={{fontFamily:SM,color:C.verm,fontWeight:700}}>{it.cantidad}×</span>{it.nombre}
                      </div>
                    ))}
                    <button onClick={reset} style={{marginTop:6,background:'none',border:`1px solid ${C.rule}`,color:C.ink3,borderRadius:6,padding:'4px 10px',fontFamily:SN,fontSize:11,cursor:'pointer',alignSelf:'flex-start'}}>Cancelar</button>
                  </div>
                )}
                {/* B2 FIX: en iOS mostrar botón explícito para que el gesto active getUserMedia */}
                {isIOS && chipsClarificacion.length === 0 && (
                  <button
                    onTouchEnd={e => { e.preventDefault(); startRecording() }}
                    onClick={() => startRecording()}
                    style={{marginTop:10,width:'100%',padding:'11px',borderRadius:10,
                      background:C.teal,color:C.bg,border:'none',
                      fontFamily:SM,fontSize:11,fontWeight:700,letterSpacing:'.08em',
                      textTransform:'uppercase',cursor:'pointer'}}>
                    🎙 Toca para responder
                  </button>
                )}
              </div>
            )}

            {chatMsgs.map(msg=>{
              const isCam = msg.from==='camarero'
              const isSis = msg.from==='sistema'
              const bCol  = msg.tipo==='error'?C.verm:msg.tipo==='aviso'?C.amb:msg.tipo==='pregunta'?C.teal:msg.tipo==='ok'?C.gr:C.rule
              const bBg   = msg.tipo==='error'?C.vermS:msg.tipo==='aviso'?C.ambS:msg.tipo==='ok'?C.grS:C.bg2
              return (
                <div key={msg.id} style={{alignSelf:isCam?'flex-end':'flex-start',maxWidth:'88%',background:isCam?C.bg2:bBg,border:`1px solid ${isCam?C.rule:bCol+'55'}`,borderRadius:isCam?'12px 3px 12px 12px':'3px 12px 12px 12px',padding:'8px 12px',animation:'msgIn .2s ease',boxShadow:'0 1px 3px rgba(26,23,20,.06)'}}>
                  {!isCam&&(
                    <div style={{fontFamily:SM,fontSize:8,color:isSis?C.ink3:C.teal,letterSpacing:'1px',marginBottom:3,textTransform:'uppercase'}}>
                      {isSis?'sistema':msg.tipo==='pregunta'?'brain · pregunta':'brain'}
                    </div>
                  )}
                  <div style={{fontSize:13,color:msg.tipo==='error'?C.verm:C.ink,lineHeight:1.4,fontFamily:isCam?SC:SN,fontStyle:isCam?'italic':'normal'}}>
                    {msg.texto}
                  </div>
                  <div style={{fontSize:9,color:C.ink4,marginTop:3,textAlign:'right',fontFamily:SM}}>
                    {msg.ts.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              )
            })}

            {/* ── Confirm inline — dentro del chat ────────────── */}
            {screen==='confirm' && brain && (
              <div style={{alignSelf:'flex-start',width:'96%',background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:12,overflow:'hidden',boxShadow:'0 2px 8px rgba(26,23,20,.08)',animation:'msgIn .2s ease'}}>
                <div style={{padding:'9px 14px 7px',borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:SM,fontSize:8,background:C.ambS,color:'#7A5614',border:`1px solid ${C.amb}44`,padding:'2px 6px',borderRadius:4}}>BRAIN</span>
                  <span style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:C.ink,flex:1}}>{brain.mesa}</span>
                  <span style={{fontFamily:SM,fontSize:9,color:C.gr}}>{Math.round((brain.confianza||.9)*100)}%</span>
                </div>
                {avisoRuido&&(
                  <div style={{margin:'6px 14px 0',background:'#FFF3CD',border:'1px solid #E8A33B',borderRadius:6,padding:'7px 10px',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:14}}>🎙️</span>
                    <span style={{fontFamily:SM,fontSize:10,color:'#7A5A1A',flex:1}}>RUIDO DETECTADO — revisa la comanda antes de confirmar</span>
                  </div>
                )}
                {alertas86.length>0&&(
                  <div style={{margin:'6px 14px 0',background:C.vermS,border:`1px solid ${C.verm}44`,borderRadius:6,padding:'5px 10px',fontFamily:SM,fontSize:10,color:C.verm}}>
                    ⚠ 86 · {alertas86.join(', ')}
                  </div>
                )}
                {alertasAlerg.length>0&&(
                  <div style={{margin:'6px 14px 0',background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:6,padding:'5px 10px',fontFamily:SM,fontSize:10,color:'#7A5A1A'}}>
                    ⚠ Alérgeno: {alertasAlerg.map(a=>a.producto).join(', ')}
                  </div>
                )}
                <div style={{padding:'6px 14px 8px'}}>
                  {brain.items.map((it,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'baseline',gap:8,padding:'3px 0'}}>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.verm,lineHeight:1,minWidth:20,textAlign:'center'}}>{it.cantidad}</span>
                      <span style={{fontSize:13,fontWeight:500,color:C.ink}}>{it.nombre}</span>
                      {it.notas&&<span style={{fontSize:11,color:C.ink4,fontStyle:'italic'}}>· {it.notas}</span>}
                    </div>
                  ))}
                </div>
                {transcript&&(
                  <div style={{padding:'4px 14px 6px',borderTop:`1px solid ${C.rule}`,fontFamily:SC,fontSize:13,color:C.teal}}>
                    💬 {transcript}
                  </div>
                )}
                {brain.nota_general&&(
                  <div style={{padding:'6px 14px',borderTop:`1px solid ${C.rule}`,background:C.ambS,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontFamily:SM,fontSize:9,color:'#7A5A1A',letterSpacing:'.08em',fontWeight:700,textTransform:'uppercase' as const}}>NOTA</span>
                    <span style={{fontFamily:SC,fontSize:13,color:'#7A5A1A',fontStyle:'italic'}}>{brain.nota_general}</span>
                  </div>
                )}
                <div style={{display:'flex',borderTop:`1px solid ${C.rule}`}}>
                  {/* FIX-04: onPointerDown evita doble-disparo en móvil (no hay delay de click sintético) */}
                  <button onPointerDown={reset} style={{flex:1,padding:12,background:'none',border:'none',borderRight:`1px solid ${C.rule}`,color:C.ink3,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>✗ Cancelar</button>
                  <button onPointerDown={()=>{
                    // Confirmar en backend — crea print_jobs y activa la comanda
                    if (lastComandaId) {
                      fetch(`/api/comanda/${lastComandaId}/confirmar`, {
                        method: 'PATCH',
                        headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
                      }).catch(err => console.error('[CONFIRMAR]', err))
                    }
                    setScreenSafe('sent')
                    addMsg('brain',`✓ Enviado · ${brain?.mesa ?? '?'}`,'ok')
                    setPushMsg(`🍳 Cocina recibió · ${brain?.mesa ?? '?'}`); setShowPush(true); setTimeout(()=>setShowPush(false),4000)
                  }} style={{flex:2,padding:12,background:C.verm,border:'none',color:'#fff',fontFamily:SN,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    ✓ Confirmar
                  </button>
                </div>
              </div>
            )}

            {screen==='sent' && brain && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'10px 0'}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:C.grS,display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${C.gr}`}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
                </div>
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.rule}`,color:C.ink3,padding:'8px 20px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>Nueva comanda</button>
              </div>
            )}

            {screen==='error' && (
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontFamily:SM,fontSize:12,color:C.verm,marginBottom:10}}>{error}</div>
                <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.rule}`,color:C.ink3,padding:'8px 18px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Reintentar</button>
              </div>
            )}
          </div>

          {/* ── Respuestas rápidas (solo con confirm activo) ──── */}
          {screen==='confirm' && (
            <div style={{padding:'4px 14px 6px',display:'flex',gap:6,flexShrink:0,overflowX:'auto',scrollbarWidth:'none' as const,background:C.bg1,borderTop:`1px solid ${C.rule}`}}>
              {['✓ Sí','✗ No','Repite'].map(r=>(
                // FIX-04: onPointerDown evita doble-disparo en móvil
                <button key={r} onPointerDown={r==='✓ Sí'?()=>{
                  if (lastComandaId) {
                    fetch(`/api/comanda/${lastComandaId}/confirmar`, {
                      method: 'PATCH',
                      headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
                    }).catch(err => console.error('[CONFIRMAR quick]', err))
                  }
                  setScreenSafe('sent'); addMsg('brain',`✓ Enviado · ${brain?.mesa ?? '?'}`,'ok')
                }:r==='✗ No'?reset:()=>{reset();setScreenSafe('idle')}}
                  style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:`1px solid ${C.rule}`,background:C.bg2,fontSize:12,fontWeight:600,color:r==='✓ Sí'?C.gr:r==='✗ No'?C.verm:C.ink3,cursor:'pointer',fontFamily:SN}}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {/* ── PTT ─────────────────────────────────────────── */}
          <div style={{padding:'8px 20px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:7,flexShrink:0,borderTop:`1px solid ${C.rule}`,background:C.bg1}}>

            {/* Banner "Iniciar turno" — visible cuando no hay turno activo */}
            {!turnoId && (
              <div style={{width:'100%',marginBottom:4}}>
                <button
                  onClick={activarTurno}
                  disabled={iniciandoTurno}
                  style={{width:'100%',padding:'12px 0',background:iniciandoTurno?C.bg2:`${C.gr}18`,border:`1.5px solid ${C.gr}55`,borderRadius:12,fontFamily:SN,fontSize:13,fontWeight:700,color:iniciandoTurno?C.ink4:C.gr,cursor:iniciandoTurno?'default':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'all .15s'}}
                >
                  {iniciandoTurno ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                      Iniciando turno…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                      Iniciar turno
                    </>
                  )}
                </button>
                <div style={{fontFamily:SM,fontSize:9,color:C.ink4,textAlign:'center',marginTop:5,letterSpacing:'.5px'}}>
                  Ficha tu entrada · el dueño puede ver y modificar tu turno
                </div>
              </div>
            )}
            <div style={{position:'relative',width:88,height:88,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out infinite'}}/>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out .7s infinite'}}/>
              {/* Anillo de nivel de audio — crece con la voz */}
              {isListening && audioLevel > 10 && (
                <div style={{
                  position:'absolute',
                  width: 76 + audioLevel * 0.5,
                  height: 76 + audioLevel * 0.5,
                  borderRadius:'50%',
                  background:`radial-gradient(circle, ${C.verm}${Math.round(audioLevel * 0.8).toString(16).padStart(2,'0')} 0%, transparent 70%)`,
                  transition:'width .08s,height .08s',
                  pointerEvents:'none', zIndex:1,
                }}/>
              )}
              <button
                onPointerDown={e=>{e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); if(!isProcessing){pttManualRef.current=true; activateMediaSession(); startRecording()}}}
                onPointerUp={e=>{e.preventDefault(); pttManualRef.current=false; stopRecording()}}
                onPointerLeave={e=>{e.preventDefault(); if(recordingRef.current){pttManualRef.current=false; stopRecording()}}}
                disabled={isProcessing}
                style={{width:76,height:76,borderRadius:'50%',
                  background:isListening?C.verm:`linear-gradient(145deg,#E85540,${C.verm})`,
                  border:'none',cursor:isProcessing?'default':'pointer',position:'relative',zIndex:2,
                  boxShadow:isListening?`0 2px 12px ${C.verm}55, 0 0 0 ${Math.round(audioLevel*0.3)}px ${C.verm}33`:`0 4px 20px ${C.verm}44`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transform:isListening?`scale(${0.91 + audioLevel*0.001})`:'scale(1)',
                  transition:'all .08s cubic-bezier(.34,1.56,.64,1)',
                  opacity:isProcessing?.5:1,touchAction:'none',userSelect:'none'}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" fill={isListening?'rgba(255,255,255,.95)':'none'}/>
                  <path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
              </button>
            </div>
            <span style={{fontFamily:SM,fontSize:10,fontWeight:600,color:isListening?C.verm:C.ink3,textTransform:'uppercase',letterSpacing:'1.5px',animation:isListening?'sttPulse .8s infinite alternate':'none'}}>
              {isListening?'escuchando…':isProcessing?'procesando…':'mantén para hablar'}
            </span>
            {headphoneConnected && !isListening && !isProcessing && (
              <span style={{fontFamily:SM,fontSize:9,fontWeight:500,color:C.gr,letterSpacing:'1px',display:'flex',alignItems:'center',gap:4}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
                botón auricular activo
              </span>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB: MANUAL ══════════════════════════════════════════ */}
      {tab==='manual' && (
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div style={{overflowY:'auto',scrollbarWidth:'none' as const}}>
            <ChuleteVoz rol="camarero" />
          </div>
          <ManualComanda
            session={session}
            onSent={()=>{}}
            onVoiceMode={()=>setTab('hablar')}
            mesasPlano={mesasPlano}
            zonasPlano={zonasPlano}
            zonasAsignadas={zonasAsignadas}
          />
        </div>
      )}

      {/* ══ TAB: PEDIDOS — mis tickets activos ══════════════════ */}
      {tab==='sala' && (() => {
        // Mis comandas del turno ordenadas por estado (lista primero, luego cocina, luego resto)
        const misCmds = comandas
          .filter(c => c.camarero_id === session.id && ['nueva','en_cocina','lista','cuenta_pedida'].includes(c.estado))
          .sort((a,b) => {
            const ord = {lista:0, en_cocina:1, nueva:2}
            const diff = (ord[a.estado as keyof typeof ord]??9) - (ord[b.estado as keyof typeof ord]??9)
            if (diff !== 0) return diff
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime() // más antigua primero dentro del mismo estado
          })
        const nCocina   = misCmds.filter(c=>c.estado==='en_cocina').length
        const nLista    = misCmds.filter(c=>c.estado==='lista').length
        const nCuentaPed= misCmds.filter(c=>c.estado==='cuenta_pedida').length

        return (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header con KPIs */}
            <div style={{padding:'8px 14px',flexShrink:0,background:C.bg1,borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:16,color:C.ink}}>Mis pedidos</div>
              <div style={{display:'flex',gap:8,marginLeft:'auto',alignItems:'center'}}>
                {nLista>0 && (
                  <div style={{display:'flex',alignItems:'center',gap:4,background:C.grS,border:`1px solid ${C.gr}55`,borderRadius:8,padding:'3px 8px'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:C.gr}}/>
                    <span style={{fontFamily:SM,fontSize:9,color:C.gr,fontWeight:700}}>{nLista} LISTA{nLista>1?'S':''}</span>
                  </div>
                )}
                {nCocina>0 && (
                  <div style={{display:'flex',alignItems:'center',gap:4,background:C.ambS,border:`1px solid ${C.amb}55`,borderRadius:8,padding:'3px 8px'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:C.amb}}/>
                    <span style={{fontFamily:SM,fontSize:9,color:'#8A6010',fontWeight:700}}>{nCocina} COCINA</span>
                  </div>
                )}
                {nCuentaPed>0 && (
                  <div style={{display:'flex',alignItems:'center',gap:4,background:C.vermS,border:`1px solid ${C.verm}55`,borderRadius:8,padding:'3px 8px'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:C.verm,animation:'ldot 1.2s infinite'}}/>
                    <span style={{fontFamily:SM,fontSize:9,color:C.verm,fontWeight:700}}>{nCuentaPed} CUENTA{nCuentaPed>1?'S':''}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de comandas */}
            <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 14px',display:'flex',flexDirection:'column',gap:10,background:C.bg3}}>
              {misCmds.length === 0 && (
                <div style={{textAlign:'center',padding:'40px 20px'}}>
                  <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink4,marginBottom:6}}>Sin pedidos activos</div>
                  <div style={{fontFamily:SN,fontSize:12,color:C.ink4}}>Las comandas del turno aparecerán aquí</div>
                </div>
              )}
              {misCmds.map(c => {
                const items  = (c.items || []) as {nombre:string;cantidad:number;notas?:string}[]
                const mesa   = c.mesa?.codigo || '?'
                const min    = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
                const isLista      = c.estado === 'lista'
                const isCocina     = c.estado === 'en_cocina'
                const isCuentaPed  = c.estado === 'cuenta_pedida'
                const col    = isLista ? C.gr : isCocina ? C.amb : isCuentaPed ? C.verm : C.ink4
                const bg     = isLista ? C.grS : isCocina ? C.ambS : isCuentaPed ? C.vermS : C.bg2
                const label  = isLista ? '✓ Lista para servir' : isCocina ? 'En cocina…' : isCuentaPed ? '⏳ Cuenta pedida' : 'Nueva'
                return (
                  <div key={c.id}
                    onTouchStart={e=>{mesaTouchRef.current={startY:e.touches[0].clientY,moved:false}}}
                    onTouchMove={e=>{if(Math.abs(e.touches[0].clientY-mesaTouchRef.current.startY)>8)mesaTouchRef.current.moved=true}}
                    onTouchEnd={e=>{if(!mesaTouchRef.current.moved){e.preventDefault();setMesaDetalle({id:c.mesa_id,codigo:mesa,capacidad:(c.mesa as {capacidad?:number})?.capacidad})}}}
                    style={{background:bg,border:`1px solid ${col}99`,borderLeft:`4px solid ${col}`,borderRadius:10,overflow:'hidden',cursor:'pointer',boxShadow:'0 2px 6px rgba(26,23,20,.12)'}}>
                    {/* Cabecera comanda */}
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px 7px',borderBottom:`1px solid ${C.rule}`}}>
                      <div style={{fontFamily:SE,fontStyle:'italic',fontSize:22,fontWeight:500,color:col,lineHeight:1,minWidth:28}}>{mesa}</div>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:SM,fontSize:9,color:col,textTransform:'uppercase',letterSpacing:'.07em',fontWeight:700}}>{label}</div>
                        <div style={{fontFamily:SM,fontSize:9,color:C.ink4,marginTop:1}}>{min}m · {items.length} {items.length===1?'producto':'productos'}</div>
                      </div>
                      {isLista && (
                        <div style={{background:C.gr,borderRadius:6,padding:'4px 8px',fontFamily:SM,fontSize:9,color:'#fff',fontWeight:700,animation:'urgPulse 1.5s ease-in-out infinite'}}>
                          SERVIR
                        </div>
                      )}
                      {isCocina && min >= 20 && (
                        <div style={{background:C.ambS,border:`1px solid ${C.amb}66`,borderRadius:6,padding:'4px 8px',fontFamily:SM,fontSize:9,color:'#8A6010',fontWeight:700}}>
                          {min}m ⏱
                        </div>
                      )}
                    </div>
                    {/* Items */}
                    <div style={{padding:'6px 12px 8px',display:'flex',flexDirection:'column',gap:4}}>
                      {items.map((it,i) => (
                        <div key={i} style={{display:'flex',alignItems:'baseline',gap:8}}>
                          <span style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:col,lineHeight:1,minWidth:18,textAlign:'center'}}>{it.cantidad}</span>
                          <span style={{fontSize:13,color:C.ink,flex:1}}>{it.nombre}</span>
                          {it.notas && <span style={{fontSize:11,color:C.ink4,fontStyle:'italic'}}>· {it.notas}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}


      {/* ══ TAB: CUENTAS — pedir cuenta y cobrar ════════════════ */}
      {tab==='cuentas' && (
        <CuentasTab
          comandas={comandas}
          mesasPlano={mesasPlano}
          session={session}
          onCobrado={()=>setTab('hablar')}
        />
      )}

      {/* ══ TAB: CHAT — mensajes entre roles del turno ══════════ */}
      {tab==='chat' && (
        <EdgeChatTab
          session={session}
          mensajes={mensajes}
          marcarMensajeLeido={marcarMensajeLeido}
          chatTexto={chatTexto}
          setChatTexto={setChatTexto}
          chatDestino={chatDestino}
          setChatDestino={setChatDestino}
          chatEndRef={chatEndRef}
          enviarMensaje={enviarMensaje}
          mesaFijada={mesaFijada}
          restauranteId={session.restaurante_id}
        />
      )}

      {/* ══ TAB: CARTA — consulta de carta para camarero ════════ */}
      {tab==='carta' && (() => {
        const MARIDAJE_CHIPS = [
          { tag: 'carne_roja',   emoji: '🥩', label: 'Carne roja'   },
          { tag: 'carne_blanca', emoji: '🍗', label: 'Aves'          },
          { tag: 'pescado',      emoji: '🐟', label: 'Pescado'       },
          { tag: 'marisco',      emoji: '🦞', label: 'Marisco'       },
          { tag: 'pasta',        emoji: '🍝', label: 'Pasta'         },
          { tag: 'queso',        emoji: '🧀', label: 'Queso'         },
          { tag: 'verduras',     emoji: '🥗', label: 'Verduras'      },
          { tag: 'postre',       emoji: '🎂', label: 'Postre'        },
          { tag: 'aperitivo',    emoji: '🥂', label: 'Aperitivo'     },
        ]
        const nombres86 = new Set(productos86.map(p => p.nombre.toLowerCase()))
        const filtro    = cartaBusqueda.trim().toLowerCase()
        // ¿Hay vinos con maridaje_tags en la carta?
        const hayVinosConTags = productosCarta.some(p =>
          p.familia?.startsWith('vino') &&
          Array.isArray((p.metadata?.maridaje_tags as string[]) ?? []) &&
          ((p.metadata?.maridaje_tags as string[]) ?? []).length > 0
        )
        // Aplicar filtros: texto + maridaje
        let todos = filtro
          ? productosCarta.filter(p =>
              p.nombre.toLowerCase().includes(filtro) ||
              (p.descripcion ?? '').toLowerCase().includes(filtro) ||
              p.categoria.toLowerCase().includes(filtro)
            )
          : productosCarta
        if (cartaFiltroMaridaje) {
          todos = todos.filter(p => {
            const tags = (p.metadata?.maridaje_tags as string[]) ?? []
            return tags.includes(cartaFiltroMaridaje)
          })
        }
        // Agrupar por categoría manteniendo el orden original
        const cats: string[] = []
        const porCat: Record<string, ProductoCarta[]> = {}
        todos.forEach(p => {
          if (!porCat[p.categoria]) { porCat[p.categoria] = []; cats.push(p.categoria) }
          porCat[p.categoria].push(p)
        })
        return (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Buscador sticky */}
            <div style={{padding:'8px 14px',flexShrink:0,background:C.bg1,borderBottom:`1px solid ${C.rule}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,padding:'7px 12px'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  value={cartaBusqueda}
                  onChange={e => { setCartaBusqueda(e.target.value); setCartaFiltroMaridaje(null) }}
                  placeholder="Buscar en carta…"
                  style={{border:'none',background:'transparent',outline:'none',flex:1,fontFamily:SN,fontSize:13,color:C.ink}}
                />
                {cartaBusqueda && (
                  <span onClick={()=>setCartaBusqueda('')} style={{color:C.ink4,cursor:'pointer',fontSize:15,lineHeight:1}}>×</span>
                )}
              </div>
              {/* Chips maridaje — solo si hay vinos con tags */}
              {hayVinosConTags && !cartaBusqueda && (
                <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
                  <span style={{fontFamily:SM,fontSize:9,color:C.ink4,letterSpacing:'.06em',textTransform:'uppercase' as const,flexShrink:0}}>Maridaje:</span>
                  {MARIDAJE_CHIPS.map(chip => {
                    const active = cartaFiltroMaridaje === chip.tag
                    return (
                      <button key={chip.tag} type="button"
                        onClick={() => setCartaFiltroMaridaje(active ? null : chip.tag)}
                        style={{ fontFamily:SM, fontSize:10, padding:'3px 10px', borderRadius:999, cursor:'pointer', transition:'all .12s',
                          background: active ? C.amb : C.bg1,
                          color:      active ? '#7A5A1A' : C.ink3,
                          border:     `1px solid ${active ? C.amb : C.rule}`,
                          fontWeight: active ? 700 : 400 }}>
                        {chip.emoji} {chip.label}
                      </button>
                    )
                  })}
                  {cartaFiltroMaridaje && (
                    <button type="button" onClick={() => setCartaFiltroMaridaje(null)}
                      style={{fontFamily:SM,fontSize:9,color:C.ink4,background:'none',border:'none',cursor:'pointer',padding:'2px 4px'}}>
                      ✕ limpiar
                    </button>
                  )}
                </div>
              )}
              {productos86.length > 0 && (
                <div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap' as const}}>
                  {productos86.slice(0,5).map(p => (
                    <span key={p.id} style={{fontFamily:SM,fontSize:9,color:C.verm,background:C.vermS,border:`1px solid ${C.verm}44`,padding:'2px 7px',borderRadius:4,fontWeight:700,letterSpacing:'.06em'}}>
                      86 · {p.nombre}
                    </span>
                  ))}
                  {productos86.length > 5 && (
                    <span style={{fontFamily:SM,fontSize:9,color:C.ink4}}>+{productos86.length-5} más</span>
                  )}
                </div>
              )}
            </div>

            {/* Lista de productos */}
            <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>
              {productosCarta.length === 0 ? (
                <div style={{textAlign:'center',padding:'48px 20px'}}>
                  <div style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:C.ink4,marginBottom:6}}>Cargando carta…</div>
                </div>
              ) : cats.length === 0 ? (
                <div style={{textAlign:'center',padding:'48px 20px'}}>
                  {cartaFiltroMaridaje ? (
                    <>
                      <div style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:C.ink4}}>Sin vinos para este maridaje</div>
                      <button onClick={()=>setCartaFiltroMaridaje(null)} style={{marginTop:12,background:'none',border:`1px solid ${C.rule}`,color:C.ink3,padding:'6px 14px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Ver todos los vinos</button>
                    </>
                  ) : (
                    <>
                      <div style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:C.ink4}}>Sin resultados para "{cartaBusqueda}"</div>
                      <button onClick={()=>setCartaBusqueda('')} style={{marginTop:12,background:'none',border:`1px solid ${C.rule}`,color:C.ink3,padding:'6px 14px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Limpiar búsqueda</button>
                    </>
                  )}
                </div>
              ) : (
                cats.map(cat => (
                  <div key={cat}>
                    {/* Cabecera de categoría */}
                    <div style={{padding:'8px 16px 5px',background:C.bg2,borderBottom:`1px solid ${C.rule}`,borderTop:`1px solid ${C.rule}`,position:'sticky',top:0,zIndex:2}}>
                      <span style={{fontFamily:SM,fontSize:9,fontWeight:700,color:C.ink3,textTransform:'uppercase',letterSpacing:'.1em'}}>{cat}</span>
                      <span style={{fontFamily:SM,fontSize:9,color:C.ink4,marginLeft:6}}>{porCat[cat].length} productos</span>
                    </div>
                    {/* Productos */}
                    {porCat[cat].map((p, i) => {
                      const es86 = nombres86.has(p.nombre.toLowerCase())
                      const alerg = Array.isArray(p.alergenos) ? p.alergenos : []
                      const tags = (p.metadata?.maridaje_tags as string[]) ?? []
                      const TAG_EMOJI: Record<string,string> = { carne_roja:'🥩', carne_blanca:'🍗', pescado:'🐟', marisco:'🦞', pasta:'🍝', arroz:'🍚', queso:'🧀', verduras:'🥗', postre:'🎂', aperitivo:'🥂', cualquier_plato:'🍽' }
                      return (
                        <div key={p.id} style={{
                          display:'flex',alignItems:'flex-start',gap:10,
                          padding:'11px 16px',
                          borderBottom: i < porCat[cat].length-1 ? `1px solid ${C.rule}` : 'none',
                          background: es86 ? `${C.verm}08` : C.bg,
                          opacity: es86 ? 0.65 : 1,
                        }}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                              <span style={{
                                fontFamily:SN,fontSize:14,fontWeight:600,color:es86?C.ink3:C.ink,
                                textDecoration:es86?'line-through':'none',lineHeight:1.3
                              }}>{p.nombre}</span>
                              {es86 && (
                                <span style={{fontFamily:SM,fontSize:8,fontWeight:700,color:C.verm,background:C.vermS,border:`1px solid ${C.verm}44`,padding:'1px 6px',borderRadius:3,letterSpacing:'.06em',flexShrink:0}}>
                                  86
                                </span>
                              )}
                            </div>
                            {p.descripcion && (
                              <div style={{fontFamily:SN,fontSize:11,color:C.ink4,marginTop:2,lineHeight:1.4,fontStyle:'italic'}}>{p.descripcion}</div>
                            )}
                            {alerg.length > 0 && (
                              <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap' as const}}>
                                {alerg.map((a:string) => (
                                  <span key={a} style={{fontFamily:SM,fontSize:8,color:'#7A5A1A',background:C.ambS,border:`1px solid ${C.amb}44`,padding:'1px 6px',borderRadius:3}}>
                                    ⚠ {a}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Maridaje chips — solo en vinos */}
                            {tags.length > 0 && (
                              <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap' as const}}>
                                {tags.map(tag => (
                                  <span key={tag} style={{fontFamily:SM,fontSize:9,color:C.ink4,background:C.bg2,border:`1px solid ${C.rule}`,padding:'1px 6px',borderRadius:3}}>
                                    {TAG_EMOJI[tag] ?? '•'} {tag.replace('_',' ')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{fontFamily:SE,fontStyle:'italic',fontSize:17,fontWeight:500,color:es86?C.ink4:C.verm,flexShrink:0,lineHeight:1.2,paddingTop:1}}>
                            {p.precio != null ? `${p.precio.toFixed(2).replace('.',',')} €` : '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
              <div style={{height:16}}/>
            </div>
          </div>
        )
      })()}

      {/* ══ TAB: CONFIG ══════════════════════════════════════════ */}
      {tab==='config' && (
        <ConfigScreen
          session={session}
          tabsVisibles={tabsVisibles}
          onTabsVisibles={v=>{
            // Si el tab activo queda oculto, volver a hablar
            if (!v.includes(tab)) setTab('hablar')
            setTabsVisibles(v); saveCfg({tabsVisibles:v})
          }}
          voiceConfirm={voiceConfirm}    onVoiceConfirm={v=>{setVoiceConfirm(v);saveCfg({voiceConfirm:v})}}
          zonasAsignadas={zonasAsignadas} onZonasAsignadas={v=>{setZonasAsignadas(v);saveCfg({zonasAsignadas:v})}}
          zonasDisponibles={zonasPlano}
          fontBig={fontBig}              onFontBig={v=>{setFontBig(v);saveCfg({fontBig:v})}}
          alergenosMesa={alergenosMesa}  onAlergenosMesa={()=>setMostrarAlerg(true)}
          subscribed={subscribed}        onSubscribe={subscribe}
          hasInstall={!!installPrompt}   onInstall={install}
          autoConfirm={autoConfirm}      onAutoConfirm={v=>{setAutoConfirm(v);saveCfg({autoConfirm:v})}}
          autoThreshold={autoThreshold}  onAutoThreshold={v=>{setAutoThreshold(v);saveCfg({autoThreshold:v})}}
          ttsOff={ttsOff}               onTtsOff={v=>{setTtsOff(v);saveCfg({ttsOff:v})}}
          onLogout={logout}
        />
      )}

      {/* ── MODAL: Mesa Rápida ─────────────────────────────────────── */}
      {mesaRapidaModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:60,
          background:'rgba(26,23,20,.72)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'flex-end', justifyContent:'center',
        }}
          onClick={e=>{ if(e.target===e.currentTarget) setMesaRapidaModal(false) }}
        >
          <div style={{
            background:C.bg1, borderRadius:'18px 18px 0 0',
            padding:'20px 18px 36px', width:'100%', maxWidth:480,
            display:'flex', flexDirection:'column', gap:14,
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,fontWeight:500,color:C.ink}}>Mesa rápida</div>
              <button onClick={()=>setMesaRapidaModal(false)}
                style={{background:'transparent',border:'none',cursor:'pointer',color:C.ink3,padding:4}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{fontFamily:SN,fontSize:12,color:C.ink3,marginTop:-6}}>
              Asigna la primera mesa libre a nombre de un cliente.
            </div>

            {/* Zona */}
            <div>
              <div style={{fontFamily:SM,fontSize:9,color:C.ink4,letterSpacing:'.08em',marginBottom:6,textTransform:'uppercase' as const}}>Zona</div>
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
                {zonasPlano.map(z => (
                  <button key={z.id}
                    onClick={() => setMesaRapidaForm(f=>({...f, zona: z.tipo}))}
                    style={{
                      padding:'6px 14px', borderRadius:20,
                      background: mesaRapidaForm.zona===z.tipo ? C.verm : C.bg2,
                      color: mesaRapidaForm.zona===z.tipo ? '#fff' : C.ink3,
                      border: mesaRapidaForm.zona===z.tipo ? 'none' : `1px solid ${C.rule}`,
                      fontFamily:SN, fontSize:13, cursor:'pointer',
                    }}>
                    {z.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre */}
            <div>
              <div style={{fontFamily:SM,fontSize:9,color:C.ink4,letterSpacing:'.08em',marginBottom:6,textTransform:'uppercase' as const}}>Nombre del cliente</div>
              <input type="text" placeholder="Ej: Alberto Suárez"
                value={mesaRapidaForm.alias}
                onChange={e=>setMesaRapidaForm(f=>({...f,alias:e.target.value}))}
                style={{width:'100%',padding:'11px 13px',borderRadius:10,border:`1px solid ${C.rule}`,background:C.bg2,fontFamily:SN,fontSize:14,color:C.ink,outline:'none',boxSizing:'border-box' as const}}
              />
            </div>

            {/* Teléfono */}
            <div>
              <div style={{fontFamily:SM,fontSize:9,color:C.ink4,letterSpacing:'.08em',marginBottom:6,textTransform:'uppercase' as const}}>
                Teléfono <span style={{fontWeight:400,opacity:.7}}>(opcional)</span>
              </div>
              <input type="tel" placeholder="+34 600 000 000"
                value={mesaRapidaForm.telefono}
                onChange={e=>setMesaRapidaForm(f=>({...f,telefono:e.target.value}))}
                style={{width:'100%',padding:'11px 13px',borderRadius:10,border:`1px solid ${C.rule}`,background:C.bg2,fontFamily:SN,fontSize:14,color:C.ink,outline:'none',boxSizing:'border-box' as const}}
              />
            </div>

            {mesaRapidaErr && (
              <div style={{fontFamily:SN,fontSize:12,color:C.verm,background:C.vermS,borderRadius:8,padding:'8px 12px'}}>
                {mesaRapidaErr}
              </div>
            )}

            <button
              onClick={asignarMesaRapida}
              disabled={mesaRapidaLoading || !mesaRapidaForm.zona || !mesaRapidaForm.alias.trim()}
              style={{
                padding:'14px', borderRadius:12, border:'none',
                background: (!mesaRapidaForm.zona || !mesaRapidaForm.alias.trim()) ? C.rule : C.verm,
                color: (!mesaRapidaForm.zona || !mesaRapidaForm.alias.trim()) ? C.ink4 : '#fff',
                fontFamily:SN, fontSize:15, fontWeight:600,
                cursor: mesaRapidaLoading || !mesaRapidaForm.zona || !mesaRapidaForm.alias.trim() ? 'not-allowed' : 'pointer',
                opacity: mesaRapidaLoading ? .7 : 1,
              }}>
              {mesaRapidaLoading ? 'Asignando…' : 'Asignar mesa'}
            </button>
          </div>
        </div>
      )}

      {/* ── MESA DETALLE SHEET ─────────────────────────────────── */}
      {mesaDetalle && (
        <MesaDetalleSheet
          mesaId={mesaDetalle.id}
          mesaCodigo={mesaDetalle.codigo}
          capacidad={mesaDetalle.capacidad}
          session={session}
          onClose={()=>setMesaDetalle(null)}
          onPedirCuenta={(comandaId, mesa)=>{
            setLastComandaId(comandaId)
            setBrain({mesa, tipo:'cuenta', items:[], confianza:1, raw:''})
            setScreenSafe('sent'); pedirCuenta()
          }}
          onAnadirPorVoz={(id, codigo, _comandaId)=>{
            setMesaDetalle(null); setMesaFijada(id); setTab('hablar')
            addMsg('sistema', `Añadiendo a ${codigo}. Mantén PTT.`, 'pregunta')
          }}
          onAbrirMesa={(mesaId, mesaCodigo, cap) => {
            setMesaDetalle(null)
            setComensalesModal({ mesaId, mesaCodigo, capacidad: cap })
          }}
        />
      )}

      {/* ── COMENSALES MODAL ───────────────────────────────────── */}
      {comensalesModal && (
        <ComensalesModal
          mesaCodigo={comensalesModal.mesaCodigo}
          capacidad={comensalesModal.capacidad}
          servicio={servicioConfig}
          onConfirmar={(pax, incluirServicio) => {
            setMesasPaxMap(prev => ({ ...prev, [comensalesModal.mesaId]: pax }))
            setComensalesModal(null)
            // Abrir la mesa con el detalle ya conociendo los comensales
            setMesaDetalle({ id: comensalesModal.mesaId, codigo: comensalesModal.mesaCodigo })
            // Guardar en sessionStorage para que la próxima comanda lo sepa
            sessionStorage.setItem(`pax_${comensalesModal.mesaId}`, JSON.stringify({ pax, incluirServicio }))
          }}
          onSaltarse={() => {
            setComensalesModal(null)
            setMesaDetalle({ id: comensalesModal.mesaId, codigo: comensalesModal.mesaCodigo })
          }}
          onClose={() => setComensalesModal(null)}
        />
      )}

      {/* ── COMENSALES VOZ (post-PTT, comanda ya creada) ─────── */}
      {pendingVozComanda && (
        <ComensalesModal
          mesaCodigo={pendingVozComanda.mesaCodigo}
          servicio={servicioConfig}
          initialPax={pendingVozComanda.paxYaConocido ?? 0}
          comandaId="pending"
          onConfirmar={async (pax, _incl) => {
            // Actualizar num_comensales de la comanda recién creada via API
            const ses = localStorage.getItem('ia_rest_session') ?? ''
            if (lastComandaId) {
              await fetch(`/api/comanda/${lastComandaId}/pax`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
                body: JSON.stringify({ num_comensales: pax }),
              })
            }
            setMesasPaxMap(prev => ({ ...prev, [pendingVozComanda.mesaId]: pax }))
            setPendingVozComanda(null)
            setScreenSafe('confirm')
          }}
          onSaltarse={() => { setPendingVozComanda(null); setScreenSafe('confirm') }}
          onClose={() => { setPendingVozComanda(null); setScreenSafe('confirm') }}
        />
      )}

      {/* fin edge-main */}
      </div>

      {/* ── BOTTOM NAV ─────────────────────────────────────────── */}
      <nav className="edge-nav" style={{display:'flex',background:C.bg1,borderTop:`1px solid ${C.rule}`,flexShrink:0}}>
        {ALL_TABS.filter(t=>tabsVisibles.includes(t.id)).map(t => {
          const on = tab===t.id
          return (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`edge-nav-btn${on?' edge-nav-on':''}`}
              style={{flex:1,padding:'9px 4px 13px',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,position:'relative',color:on?C.verm:C.ink3,transition:'color .15s'}}>
              {on && <div className="edge-nav-indicator" style={{position:'absolute',top:0,left:'22%',right:'22%',height:2,background:C.verm,borderRadius:'0 0 3px 3px'}}/>}
              {t.id==='chat' && noLeidos>0 && !on && (
                <div className="edge-nav-badge" style={{position:'absolute',top:5,right:'18%',minWidth:16,height:16,borderRadius:8,background:C.verm,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                  <span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:'#fff'}}>{noLeidos>9?'9+':noLeidos}</span>
                </div>
              )}
              {t.id==='cuentas' && cuentasCount>0 && !on && (
                <div className="edge-nav-badge" style={{position:'absolute',top:5,right:'18%',minWidth:16,height:16,borderRadius:8,background:C.verm,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                  <span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:'#fff'}}>{cuentasCount>9?'9+':cuentasCount}</span>
                </div>
              )}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t.path.split('M').filter(Boolean).map((seg,i) => <path key={i} d={`M${seg}`}/>)}
              </svg>
              <span className="edge-nav-lbl" style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px'}}>{t.lbl}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/* ─── VOICE PROFILE ─────────────────────────────────────────── */
// Frases que el camarero lee durante la calibración (WAV 16kHz, ~5s c/u)
const FRASES_CALIBRACION = [
  'Mesa cuatro, dos cañas y una tónica por favor',
  'Marchar los segundos de la mesa seis, venga',
  'Cuenta para la mesa tres, pago con tarjeta',
  '86 la paella, sin existencias para hoy',
  'Una ración de patatas bravas para la barra uno',
]

/** Captura audio del micrófono como WAV PCM 16kHz mono (formato requerido por Azure) */
async function capturarWAV(duracionMs: number): Promise<Blob> {
  // Pequeño delay para que Android libere el micrófono entre frases consecutivas
  await new Promise(r => setTimeout(r, 350))
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
  })
  const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const audioCtx = new AudioCtx({ sampleRate: 16000 })
  const source   = audioCtx.createMediaStreamSource(stream)
  const proc     = audioCtx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []

  proc.onaudioprocess = (e: AudioProcessingEvent) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  source.connect(proc)
  proc.connect(audioCtx.destination)

  await new Promise(r => setTimeout(r, duracionMs))

  proc.disconnect(); source.disconnect()
  stream.getTracks().forEach(t => t.stop())
  await audioCtx.close()

  // Concatenar PCM
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const all   = new Float32Array(total)
  let off = 0
  for (const c of chunks) { all.set(c, off); off += c.length }

  // Construir WAV
  const buf  = new ArrayBuffer(44 + all.length * 2)
  const view = new DataView(buf)
  const ws   = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); view.setUint32(4, 36 + all.length * 2, true); ws(8, 'WAVE')
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ws(36, 'data'); view.setUint32(40, all.length * 2, true)
  let o2 = 44
  for (let i = 0; i < all.length; i++) {
    const s = Math.max(-1, Math.min(1, all[i]))
    view.setInt16(o2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o2 += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}

type VPEstado = 'cargando'|'sin_calibrar'|'calibrando'|'activo'|'error'

function VoiceProfileSection({ session }: { session: { id: string; restaurante_id: string } }) {
  const [estado,    setEstado]    = React.useState<VPEstado>('cargando')
  const [frases,    setFrases]    = React.useState(0)
  const [modal,     setModal]     = React.useState(false)
  const [paso,      setPaso]      = React.useState(0)       // 0-4 frase actual
  const [grabando,  setGrabando]  = React.useState(false)
  const [procesando,setProcesando]= React.useState(false)
  const [msgError,  setMsgError]  = React.useState('')
  const grabRef = React.useRef(false)

  // Cargar estado inicial
  React.useEffect(() => {
    fetch(`/api/voice-profile/status?camarero_id=${session.id}`)
      .then(r => r.json())
      .then(d => {
        setEstado(d.estado ?? 'sin_calibrar')
        setFrases(d.frases_completadas ?? 0)
      })
      .catch(() => setEstado('sin_calibrar'))
  }, [session.id])

  const grabarFrase = async () => {
    if (grabRef.current || procesando) return
    grabRef.current = true
    setGrabando(true)
    setMsgError('')
    try {
      const wav = await capturarWAV(6000) // 6 segundos por frase
      setGrabando(false)
      setProcesando(true)

      const fd = new FormData()
      fd.append('audio', wav, 'frase.wav')
      fd.append('camarero_id', session.id)

      const r = await fetch('/api/voice-profile/enroll', {
        method: 'POST',
        headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
        body: fd,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al procesar')

      setEstado(d.estado)
      if (d.estado === 'activo') {
        // Forzar todos los pasos a verde y mostrar pantalla de éxito
        // El usuario cerrará con el botón "Perfecto"
        setFrases(FRASES_CALIBRACION.length)
        setPaso(FRASES_CALIBRACION.length)
      } else {
        setFrases(d.frases_completadas)
        // Sincronizar paso con BD (no sólo incrementar) para que badge y modal coincidan
        setPaso(d.frases_completadas)
      }
    } catch (err) {
      // No cambiar el estado global del perfil — solo mostrar el error de esta frase
      // para que el usuario pueda reintentar sin romper el progreso ya acumulado
      setMsgError(err instanceof Error ? err.message : 'Error al grabar. Inténtalo de nuevo')
    } finally {
      grabRef.current = false
      setGrabando(false)
      setProcesando(false)
    }
  }

  const resetPerfil = async () => {
    await fetch(`/api/voice-profile/reset?camarero_id=${session.id}`, {
      method: 'DELETE',
      headers: { 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' },
    })
    setEstado('sin_calibrar')
    setFrases(0)
    setPaso(0)
    setMsgError('')
  }

  const abrirModal = () => { setPaso(frases); setModal(true); setMsgError('') }

  // Badge de estado
  const badge = estado === 'activo'
    ? { color: C.gr,   bg: C.gr + '22',  txt: '✓ Perfil activo' }
    : estado === 'calibrando'
    ? { color: C.amb,  bg: C.amb + '22', txt: `Calibrando ${frases}/5` }
    : estado === 'error'
    ? { color: C.verm, bg: C.verm + '22',txt: 'Error' }
    : estado === 'cargando'
    ? { color: C.ink4, bg: C.bg2,         txt: '...' }
    : { color: C.ink4, bg: C.bg2,         txt: 'Sin calibrar' }

  return (
    <>
      {/* ── Fila en Config ── */}
      <div style={{ padding: '13px 0', borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>Perfil de voz</div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>
              {estado === 'activo'
                ? 'Filtro activo en comandas · no bloqueante'
                : 'Calibra para que el sistema reconozca tu voz'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: badge.color, background: badge.bg,
            }}>
              {badge.txt}
            </div>
            {estado !== 'cargando' && (
              <button
                onClick={estado === 'activo' ? resetPerfil : abrirModal}
                style={{
                  background: C.bg2, border: `1px solid ${C.rule}`,
                  borderRadius: 8, padding: '6px 12px', fontSize: 12,
                  fontWeight: 600, color: estado === 'activo' ? C.verm : C.ink3, cursor: 'pointer',
                }}
              >
                {estado === 'activo' ? 'Eliminar' : estado === 'calibrando' ? 'Continuar' : 'Calibrar'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal de calibración ── */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,17,14,.92)',
          zIndex: 9999, display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            width: '100%', background: C.bg2, borderRadius: '20px 20px 0 0',
            padding: '24px 24px 40px', maxHeight: '85vh', overflowY: 'auto',
          }}>
            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Calibración de voz</div>
                <div style={{ fontSize: 12, color: C.ink4, marginTop: 2 }}>
                  Pulsa el botón y lee la frase en voz alta — grabará 6 segundos automáticamente
                </div>
              </div>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: 'none', fontSize: 22, color: C.ink4, cursor: 'pointer', padding: 4,
              }}>✕</button>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {FRASES_CALIBRACION.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 5, borderRadius: 3,
                  background: i < frases ? C.gr : i === paso ? C.amb : C.bg3,
                  transition: 'background .3s',
                }} />
              ))}
            </div>
            {/* Contador explícito para que no haya confusión */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i < frases ? C.gr : i === paso ? C.amb : C.bg3,
                  border: `1.5px solid ${i < frases ? C.gr : i === paso ? C.amb : C.rule}`,
                  transition: 'all .3s',
                }}>
                  {i < frases
                    ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="4 12 10 18 20 6"/></svg>
                    : <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: i === paso ? '#7A5A1A' : C.ink4 }}>{i+1}</span>
                  }
                </div>
              ))}
            </div>

            {/* Frase actual */}
            {paso < FRASES_CALIBRACION.length ? (
              <>
                <div style={{
                  background: C.bg, borderRadius: 12, padding: '20px 16px',
                  marginBottom: 24, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, color: C.ink4, marginBottom: 8, letterSpacing: '.08em' }}>
                    FRASE {paso + 1} DE {FRASES_CALIBRACION.length}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.4, fontStyle: 'italic' }}>
                    &ldquo;{FRASES_CALIBRACION[paso]}&rdquo;
                  </div>
                </div>

                {/* Botón PTT calibración */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  {msgError && (
                    <div style={{ fontSize: 12, color: C.verm, textAlign: 'center' }}>{msgError}</div>
                  )}
                  {procesando ? (
                    <div style={{ fontSize: 13, color: C.ink4, letterSpacing: '.1em' }}>
                      Procesando…
                    </div>
                  ) : (
                    <button
                      onPointerDown={e => { e.preventDefault(); grabarFrase() }}
                      disabled={grabando || procesando}
                      style={{
                        width: grabando ? 90 : 72, height: grabando ? 90 : 72,
                        borderRadius: '50%',
                        background: grabando ? C.teal : C.verm,
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: grabando
                          ? `0 0 0 16px ${C.teal}33, 0 0 0 32px ${C.teal}11`
                          : 'none',
                        transition: 'all .2s cubic-bezier(0.34,1.56,0.64,1)',
                        touchAction: 'none',
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                        stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="3" width="6" height="12" rx="3" fill={grabando ? '#fff' : 'none'}/>
                        <path d="M5 11a7 7 0 0 0 14 0"/>
                        <line x1="12" y1="18" x2="12" y2="22"/>
                      </svg>
                    </button>
                  )}
                  <div style={{ fontSize: 11, color: grabando ? C.teal : C.ink4, letterSpacing: '.08em' }}>
                    {grabando ? '● GRABANDO…' : procesando ? 'Enviando…' : 'PULSA Y HABLA (6s)'}
                  </div>
                </div>
              </>
            ) : (
              /* Completado */
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.gr, marginBottom: 8 }}>
                  ¡Perfil activado!
                </div>
                <div style={{ fontSize: 13, color: C.ink4 }}>
                  El sistema ya reconoce tu voz en las comandas
                </div>
                <button onClick={() => setModal(false)} style={{
                  marginTop: 24, padding: '12px 32px', background: C.gr,
                  border: 'none', borderRadius: 10, fontSize: 14,
                  fontWeight: 700, color: '#fff', cursor: 'pointer',
                }}>
                  Perfecto
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ─── CONFIG ─────────────────────────────────────────────────── */
// ── ForceUpdateRow: comprueba SW + versión y fuerza recarga ──────
function ForceUpdateRow() {
  const [state, setState] = React.useState<'idle'|'checking'|'updating'|'latest'>('idle')

  const handleUpdate = async () => {
    setState('checking')
    try {
      // 1. Activar SW en espera si existe
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          setState('updating')
          setTimeout(() => {
            const url = new URL(window.location.href)
            url.searchParams.set('v', Date.now().toString())
            window.location.replace(url.toString())
          }, 800)
          return
        }
        // 2. Forzar comprobación de actualización del SW
        await reg?.update()
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          setState('updating')
          setTimeout(() => {
            const url = new URL(window.location.href)
            url.searchParams.set('v', Date.now().toString())
            window.location.replace(url.toString())
          }, 800)
          return
        }
      }
      // 3. Comprobar version.json para APK nativa
      const r = await fetch('/app/version.json?t=' + Date.now(), { cache: 'no-store' })
      if (r.ok) {
        const { version } = await r.json()
        const current = (window as any).__APP_VERSION__ ?? null
        if (current && version !== current) {
          setState('updating')
          setTimeout(() => {
            const url = new URL(window.location.href)
            url.searchParams.set('v', Date.now().toString())
            window.location.replace(url.toString())
          }, 500)
          return
        }
      }
      // 4. Hard reload con cache-bust como fallback
      setState('updating')
      setTimeout(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('v', Date.now().toString())
        window.location.replace(url.toString())
      }, 300)
    } catch {
      setState('updating')
      setTimeout(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('v', Date.now().toString())
        window.location.replace(url.toString())
      }, 300)
    }
  }

  return (
    <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:C.ink}}>Versión de la app</div>
          <div style={{fontSize:11,color:C.ink4,marginTop:2}}>
            {state==='checking'?'Comprobando…':state==='updating'?'Actualizando…':state==='latest'?'Ya tienes la última versión':'Fuerza la descarga de cambios'}
          </div>
        </div>
        <button
          onClick={handleUpdate}
          disabled={state==='checking'||state==='updating'}
          style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:state==='updating'?C.gr:C.ink3,cursor:'pointer',minWidth:80,opacity:state==='checking'||state==='updating'?0.6:1}}>
          {state==='updating'?'↻ …':state==='checking'?'…':'↻ Actualizar'}
        </button>
      </div>
    </div>
  )
}

function ConfigScreen({session,tabsVisibles,onTabsVisibles,voiceConfirm,onVoiceConfirm,zonasAsignadas,onZonasAsignadas,zonasDisponibles,fontBig,onFontBig,alergenosMesa,onAlergenosMesa,subscribed,onSubscribe,hasInstall,onInstall,autoConfirm,onAutoConfirm,autoThreshold,onAutoThreshold,ttsOff,onTtsOff,onLogout}:{
  session:{id:string;restaurante_id:string;nombre:string;rol:string}
  tabsVisibles:Tab[];    onTabsVisibles:(v:Tab[])=>void
  voiceConfirm:boolean; onVoiceConfirm:(v:boolean)=>void
  zonasAsignadas:string[]; onZonasAsignadas:(v:string[])=>void; zonasDisponibles?:ZonaInfo[]
  fontBig:boolean;      onFontBig:(v:boolean)=>void
  alergenosMesa:string[];onAlergenosMesa:()=>void
  subscribed:boolean;   onSubscribe:()=>void
  hasInstall:boolean;   onInstall:()=>void
  autoConfirm:boolean;  onAutoConfirm:(v:boolean)=>void
  autoThreshold:number; onAutoThreshold:(v:number)=>void
  ttsOff:boolean;       onTtsOff:(v:boolean)=>void
  onLogout:()=>void
}) {
  const [tabsOpen, setTabsOpen] = React.useState(false)
  const Toggle = ({on,onT}:{on:boolean;onT:()=>void}) => (
    <div onClick={onT} style={{width:44,height:26,borderRadius:13,background:on?C.verm:C.bg3,border:`1px solid ${on?C.vermD:C.rule}`,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
      <div style={{position:'absolute',top:3,left:on?20:3,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(26,23,20,.2)',transition:'left .2s'}}/>
    </div>
  )
  const Chip = ({label,on,onClick}:{label:string;on:boolean;onClick:()=>void;key?:string}) => (
    <div onClick={onClick} style={{padding:'6px 14px',borderRadius:20,background:on?C.vermS:C.bg2,border:`1px solid ${on?C.verm+'55':C.rule}`,fontSize:12,fontWeight:on?700:400,color:on?C.verm:C.ink2,cursor:'pointer',transition:'all .12s'}}>
      {label}
    </div>
  )
  const Row = ({label,sub,right}:{label:string;sub?:string;right:React.ReactElement}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
      <div>
        <div style={{fontSize:13,fontWeight:500,color:C.ink}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:C.ink4,marginTop:2}}>{sub}</div>}
      </div>
      <div>{right}</div>
    </div>
  )
  return (
    <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,background:C.bg}}>
      <div style={{padding:'16px 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,paddingBottom:14,borderBottom:`1px solid ${C.rule}`}}>
          <div style={{width:46,height:46,borderRadius:'50%',background:C.verm,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'#fff',flexShrink:0}}>
            {session.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:C.ink}}>{session.nombre}</div>
            <div style={{fontSize:11,color:C.ink4,marginTop:1,textTransform:'capitalize'}}>{session.rol}</div>
          </div>
        </div>
      </div>
      <div style={{padding:'0 20px'}}>
        {/* ── MIS TABS ── */}
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div onClick={()=>setTabsOpen(o=>!o)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:C.ink}}>Mis tabs</div>
              {!tabsOpen && <div style={{fontSize:11,color:C.ink4,marginTop:1}}>{tabsVisibles.filter(t=>!ALL_TABS.find(a=>a.id===t)?.fijo).length} activas</div>}
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{transition:'transform .2s',transform:tabsOpen?'rotate(180deg)':'rotate(0deg)',flexShrink:0}}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          {tabsOpen && (
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,color:C.ink4,marginBottom:10}}>Personaliza qué botones ves en la barra inferior</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {ALL_TABS.filter(t=>!t.fijo).map(t => {
                  const on = tabsVisibles.includes(t.id)
                  const fijo = !!t.fijo
                  return (
                    <div key={t.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={on?C.verm:C.ink4} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          {t.path.split('M').filter(Boolean).map((seg,i) => <path key={i} d={`M${seg}`}/>)}
                        </svg>
                        <span style={{fontSize:13,fontWeight:500,color:on?C.ink:C.ink3}}>{t.lbl}</span>
                        {fijo && <span style={{fontSize:10,color:C.ink4,background:C.bg2,padding:'2px 6px',borderRadius:10}}>siempre</span>}
                      </div>
                      <div
                        onClick={()=>{
                          if (fijo) return
                          const next = on ? tabsVisibles.filter(x=>x!==t.id) : [...tabsVisibles, t.id]
                          onTabsVisibles(next)
                        }}
                        style={{width:44,height:26,borderRadius:13,background:on?C.verm:C.bg3,border:`1px solid ${on?C.vermD:C.rule}`,position:'relative',cursor:fijo?'default':'pointer',transition:'background .2s',flexShrink:0,opacity:fijo?.5:1}}>
                        <div style={{position:'absolute',top:3,left:on?20:3,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(26,23,20,.2)',transition:'left .2s'}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:4}}>Zona asignada</div>
          <div style={{fontSize:11,color:C.ink4,marginBottom:9}}>
            {zonasAsignadas.length===0
              ? 'Todas las zonas — sin filtro activo'
              : zonasAsignadas.length===1
                ? '1 zona · filtro activo en Manual'
                : `${zonasAsignadas.length} zonas · filtro activo en Manual`}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
            {(zonasDisponibles && zonasDisponibles.length > 0
              ? zonasDisponibles.map(z=>({key:z.tipo, label:z.nombre}))
              : [{key:'salon',label:'Salón'},{key:'terraza',label:'Terraza'},{key:'barra',label:'Barra'}]
            ).map(z=>{
              const on = zonasAsignadas.includes(z.key)
              return <Chip key={z.key} label={z.label} on={on} onClick={()=>onZonasAsignadas(on?zonasAsignadas.filter(x=>x!==z.key):[...zonasAsignadas,z.key])}/>
            })}
          </div>
        </div>
        <Row label="Confirmación por voz" sub="BRAIN lee la comanda antes de confirmar"
          right={<Toggle on={voiceConfirm} onT={()=>onVoiceConfirm(!voiceConfirm)}/>}/>
        {/* ── PERFIL DE VOZ ── */}
        <VoiceProfileSection session={session}/>
        {/* ── AUTO-CONFIRMAR ── */}
        <Row label="Auto-confirmar" sub={`BRAIN envía sin preguntar si confianza ≥ ${autoThreshold}%`}
          right={<Toggle on={autoConfirm} onT={()=>onAutoConfirm(!autoConfirm)}/>}/>
        {autoConfirm && (
          <div style={{padding:'10px 0',borderBottom:`1px solid ${C.rule}`}}>
            <div style={{fontSize:12,color:C.ink3,marginBottom:8}}>Umbral de confianza: <strong style={{color:C.ink}}>{autoThreshold}%</strong></div>
            <input type="range" min={70} max={99} step={5} value={autoThreshold}
              onChange={e=>onAutoThreshold(Number(e.target.value))}
              style={{width:'100%',accentColor:C.verm}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.ink4,marginTop:3}}>
              <span>70% · más automático</span><span>99% · más seguro</span>
            </div>
          </div>
        )}
        {/* ── SILENCIO TTS ── */}
        <Row label="Modo silencio" sub="BRAIN no habla, solo escribe en el chat"
          right={<Toggle on={ttsOff} onT={()=>onTtsOff(!ttsOff)}/>}/>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:C.ink}}>Alérgenos de mesa</div>
              <div style={{fontSize:11,color:alergenosMesa.length>0?C.amb:C.ink4,marginTop:2}}>
                {alergenosMesa.length>0?alergenosMesa.join(', '):'Sin alérgenos declarados'}
              </div>
            </div>
            <button onClick={onAlergenosMesa} style={{background:alergenosMesa.length>0?C.ambS:C.bg2,border:`1px solid ${alergenosMesa.length>0?C.amb+'66':C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:alergenosMesa.length>0?'#7A5A1A':C.ink3,cursor:'pointer'}}>
              {alergenosMesa.length>0?'Editar':'Declarar'}
            </button>
          </div>
        </div>
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:9}}>Tamaño de texto</div>
          <div style={{display:'flex',gap:6}}>
            <Chip label="Normal" on={!fontBig} onClick={()=>onFontBig(false)}/>
            <Chip label="Grande" on={fontBig}  onClick={()=>onFontBig(true)}/>
          </div>
        </div>
        {!subscribed && (
          <Row label="Notificaciones push" sub="Alertas cuando cocina marca listo"
            right={<button onClick={onSubscribe} style={{background:C.ambS,border:`1px solid ${C.amb}44`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:'#7A5A1A',cursor:'pointer'}}>Activar</button>}/>
        )}
        {subscribed && (
          <Row label="Notificaciones" sub="Activas — recibirás alertas de cocina"
            right={<div style={{width:10,height:10,borderRadius:'50%',background:C.gr}}/>}/>
        )}
        {hasInstall && (
          <Row label="Instalar app" sub="Añadir a pantalla de inicio"
            right={<button onClick={onInstall} style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:600,color:C.ink3,cursor:'pointer'}}>Instalar</button>}/>
        )}
        {/* ── Actualizar app ── */}
        <ForceUpdateRow />
        {/* ── Manual de Voz ── */}
        <div style={{padding:'13px 0',borderBottom:`1px solid ${C.rule}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:C.ink}}>Manual de Voz</div>
              <div style={{fontSize:11,color:C.ink4,marginTop:2}}>Protocolo, novedades y sugerencias</div>
            </div>
            <a href="/owner?tab=manual" style={{
              background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:8,
              padding:'6px 12px',fontSize:12,fontWeight:600,color:C.ink3,
              cursor:'pointer',textDecoration:'none',display:'inline-block',
            }}>Ver manual</a>
          </div>
        </div>
        <div style={{paddingTop:20,paddingBottom:32}}>
          {/* Fichaje */}
          <FicharSalidaBtn session={session} />
          <div style={{marginTop:10}}>
            <button onClick={onLogout} style={{width:'100%',padding:13,background:'transparent',border:`1px solid ${C.verm}44`,borderRadius:10,fontFamily:SN,fontSize:13,fontWeight:600,color:C.verm,cursor:'pointer'}}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
