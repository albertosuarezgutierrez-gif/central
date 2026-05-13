'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ManualComanda from '@/components/ManualComanda'
import MesaDetalleSheet from '@/components/edge/MesaDetalleSheet'
import { useProductos86, useComandas, useServicioPendiente } from '@/hooks/useRealtime'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAlertas } from '@/hooks/useAlertas'
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import FueraCartaPill from '@/components/edge/FueraCartaPill'
import AlertaBanner from '@/components/AlertaBanner'
import SugerenciaButton from '@/components/SugerenciaButton'
import ComandaModModal, { ItemMod } from '@/components/ComandaModModal'
import ComensalesModal from '@/components/edge/ComensalesModal'
import PlanoSala, { MesaPlano, ZonaInfo } from '@/components/PlanoSala'
import { useMensajes } from '@/hooks/useMensajes'

/* ─── PALETA CREMA (light) ──────────────────────────────────── */
const C = {
  bg:   '#F6F1E7',  // crema base
  bg1:  '#FBF8F1',  // crema elevación 1
  bg2:  '#EFE7D6',  // crema elevación 2
  bg3:  '#E5DAC2',  // crema elevación 3
  ink:  '#1A1714',  // tinta principal
  ink2: '#3A332C',  // tinta media
  ink3: '#6B5F52',  // tinta gris
  ink4: '#9A8D7C',  // tinta muy suave
  rule: '#D8CDB6',  // bordes
  verm: '#D9442B',  // vermilion (acento marca)
  vermD:'#A8311E',  // vermilion deep
  vermS:'#F4D8CF',  // vermilion suave (bg)
  amb:  '#E8A33B',  // ámbar
  ambS: '#F7E3B6',  // ámbar suave
  gr:   '#3F7D44',  // verde ok
  grS:  '#D4E4D2',  // verde suave
  teal: '#2B6A6E',  // teal (EAR/VOX)
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

type Screen = 'idle'|'recording'|'processing'|'speaking'|'asking'|'confirm'|'sent'|'error'
type Tab    = 'hablar'|'manual'|'sala'|'cuentas'|'carta'|'chat'|'config'

const ALL_TABS: {id:Tab;lbl:string;path:string;fijo?:boolean}[] = [
  {id:'hablar',  lbl:'Hablar',   fijo:true, path:'M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v4'},
  {id:'manual',  lbl:'Manual',              path:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7M17.5 14v7'},
  {id:'sala',    lbl:'Pedidos',             path:'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4'},
  {id:'cuentas', lbl:'Cuentas',             path:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19 8v6M22 11h-6'},
  {id:'carta',   lbl:'Carta',               path:'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 9h6M9 13h4'},
  {id:'chat',    lbl:'Chat',                path:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'},
  {id:'config',  lbl:'Config',  fijo:true,  path:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'},
]

type CuentaNominal = {
  nombre: string
  comandas: { id: string; created_at: string; items: { nombre: string; cantidad: number; precio_unitario: number | null; notas: string | null }[] }[]
  total: number
  ultima_actividad: string
  num_items: number
}

interface ProductoCarta {
  id: string; nombre: string; precio: number | null
  categoria: string; descripcion?: string | null
  alergenos?: string[] | null; activo: boolean
}

interface BrainResult {
  mesa: string; tipo: string
  items: { nombre: string; cantidad: number; notas?: string }[]
  confianza: number; raw: string
}
interface ChatMsg {
  id: string; from: 'brain'|'camarero'|'sistema'
  texto: string; ts: Date; tipo?: 'ok'|'error'|'aviso'|'pregunta'
}

function buildTTS(b: BrainResult, a86: string[] = [], aAlerg: {producto:string;alergenos:string[]}[] = []): string {
  const s86 = a86.length ? `Atención, ochenta y seis: ${a86.join(' y ')}. ` : ''
  const sAl = aAlerg.length ? `Alérgeno detectado: ${aAlerg.map(a=>`${a.producto} contiene ${a.alergenos.join(' y ')}`).join('. ')}. ` : ''
  const items = b.items ?? []
  if (!items.length) return `${s86}${sAl}${b.tipo} para ${b.mesa}. ¿Confirmamos?`
  return `${s86}${sAl}${b.mesa}: ${items.map(it=>`${it.cantidad===1?'una de':it.cantidad} ${it.nombre}`).join(', ')}. ¿Confirmamos?`
}

function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof window==='undefined'||!window.speechSynthesis){resolve();return}
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang='es-ES'; utt.rate=1.05; utt.pitch=1; utt.volume=1
    const v = window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('es')&&v.name.toLowerCase().includes('female'))
           ?? window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('es'))
    if (v) utt.voice = v
    utt.onend=()=>resolve(); utt.onerror=()=>resolve()
    window.speechSynthesis.speak(utt)
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
function EdgeChatTab({ session, mensajes, marcarMensajeLeido, chatTexto, setChatTexto, chatDestino, setChatDestino, chatEndRef, enviarMensaje }: {
  session: { id: string; nombre: string; rol: string }
  mensajes: { id: string; camarero_id: string|null; rol_origen: string; nombre_origen: string; rol_destino: string; mesa_ref: string|null; leido_por: string[]; texto: string; created_at: string }[]
  marcarMensajeLeido: (id: string) => void
  chatTexto: string
  setChatTexto: (v: string) => void
  chatDestino: 'todos'|'cocina'|'camarero'|'jefe_sala'
  setChatDestino: (v: 'todos'|'cocina'|'camarero'|'jefe_sala') => void
  chatEndRef: React.RefObject<HTMLDivElement | null>
  enviarMensaje: (texto: string, opts?: { rol_destino?: string }) => Promise<void>
}) {
  const rolLabel = (r: string) => ({ camarero: 'Sala', cocina: 'Cocina', jefe_sala: 'Jefe', running: 'Running', super_admin: 'Admin' }[r] ?? r)
  const rolColor = (r: string) => ({ camarero: C.teal, cocina: C.verm, jefe_sala: C.amb, running: C.gr }[r] ?? C.ink3)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    mensajes
      .filter(m => !m.leido_por?.includes(session.id) && m.camarero_id !== session.id)
      .forEach(m => marcarMensajeLeido(m.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.length])

  const handleEnviar = async () => {
    const t = chatTexto.trim()
    if (!t) return
    setChatTexto('')
    await enviarMensaje(t, { rol_destino: chatDestino })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header destino */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.rule}`, background: C.bg1, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, letterSpacing: '.08em' }}>PARA:</span>
        {(['todos','cocina','jefe_sala'] as const).map(d => (
          <button key={d} onClick={() => setChatDestino(d)} style={{
            padding: '4px 10px', borderRadius: 20, border: `1px solid ${chatDestino===d ? rolColor(d==='todos'?'jefe_sala':d) : C.rule}`,
            background: chatDestino===d ? rolColor(d==='todos'?'jefe_sala':d) : 'transparent',
            color: chatDestino===d ? '#fff' : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer',
          }}>
            {d==='todos' ? 'Todos' : d==='cocina' ? 'Cocina' : 'Jefe sala'}
          </button>
        ))}
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mensajes.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink4 }}>Sin mensajes en el turno</span>
            <span style={{ fontFamily: SC, fontSize: 14, color: C.ink4 }}>empieza tú la conversación</span>
          </div>
        )}
        {mensajes.map(m => {
          const esMio = m.camarero_id === session.id
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: esMio ? 'flex-end' : 'flex-start' }}>
              {!esMio && (
                <span style={{ fontFamily: SN, fontSize: 10, color: rolColor(m.rol_origen), marginBottom: 2, paddingLeft: 4 }}>
                  {m.nombre_origen} · {rolLabel(m.rol_origen)}
                  {m.mesa_ref && <span style={{ color: C.ink3 }}> · {m.mesa_ref}</span>}
                </span>
              )}
              <div style={{
                maxWidth: '80%', padding: '8px 12px', borderRadius: esMio ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: esMio ? C.verm : C.bg1,
                border: esMio ? 'none' : `1px solid ${C.rule}`,
                color: esMio ? '#fff' : C.ink,
                fontFamily: SN, fontSize: 14, lineHeight: 1.4,
              }}>
                {m.texto}
              </div>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2, paddingRight: esMio ? 4 : 0, paddingLeft: esMio ? 0 : 4 }}>
                {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {esMio && m.rol_destino !== 'todos' && <span style={{ color: C.ink4 }}> · para {rolLabel(m.rol_destino)}</span>}
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

      {/* Plantillas rápidas */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid ${C.rule}`, background: C.bg, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
        {['La mesa tiene prisa', '86 un producto', 'Alérgeno detectado tarde', '¿Cuánto falta?'].map(t => (
          <button key={t} onClick={() => setChatTexto(t)} style={{
            whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: 20,
            border: `1px solid ${C.rule}`, background: C.bg1,
            fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer', flexShrink: 0,
          }}>{t}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.rule}`, background: C.bg1, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={chatTexto}
          onChange={e => setChatTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
          placeholder="Escribe un mensaje..."
          rows={1}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 20,
            border: `1px solid ${C.rule}`, background: C.bg,
            fontFamily: SN, fontSize: 14, color: C.ink, resize: 'none',
            outline: 'none', lineHeight: 1.4,
          }}
        />
        <button
          onClick={handleEnviar}
          disabled={!chatTexto.trim()}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: chatTexto.trim() ? C.verm : C.rule, cursor: chatTexto.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={chatTexto.trim() ? '#fff' : C.ink4} strokeWidth={2}>
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
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
  const [tab, setTab]     = useState<Tab>('hablar')
  const [screen, setScreen] = useState<Screen>('idle')
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
  const [alergenosMesa, setAlergenosMesa]   = useState<string[]>([])
  const [zonasAsignadas, setZonasAsignadas] = useState<string[]>([])   // [] = todas
  const [fontBig, setFontBig]               = useState(false)
  const [productosCarta, setProductosCarta] = useState<ProductoCarta[]>([])
  const [cartaBusqueda, setCartaBusqueda]   = useState('')
  const [cuentasNominales, setCuentasNominales] = useState<CuentaNominal[]>([])
  const [cuentaDetalle, setCuentaDetalle] = useState<CuentaNominal|null>(null)
  const [nuevaCuentaNombre, setNuevaCuentaNombre] = useState('')
  const [nuevaCuentaOpen, setNuevaCuentaOpen] = useState(false)

  const addMsg = useCallback((from:ChatMsg['from'], texto:string, tipo?:ChatMsg['tipo']) => {
    setChatMsgs(prev => [...prev.slice(-4), {id:Date.now().toString(), from, texto, ts:new Date(), tipo}])
  }, [])

  const { prompt: installPrompt, install } = useInstallPrompt()
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate()
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
    speak(`Mensaje de ${quien}: ${m.texto}`)
  }, [ttsOff])

  const { mensajes, noLeidos, enviar: enviarMensaje, marcarLeido: marcarMensajeLeido } =
    useMensajes(session.restaurante_id, session.id, session.rol, turnoId, handleMensajeNuevo)
  const [chatTexto, setChatTexto]          = useState('')
  const [chatDestino, setChatDestino]      = useState<'todos'|'cocina'|'camarero'|'jefe_sala'>('todos')
  const chatEndRef                         = useRef<HTMLDivElement>(null)
  const prev86 = useRef(0)

  const ultimasComandas = Object.values(
    comandas
      .filter(c => c.camarero_id === session.id && ['nueva','en_cocina'].includes(c.estado))
      .reduce((acc, c) => {
        // Quedarse con la comanda más reciente por mesa
        if (!acc[c.mesa_id] || c.created_at > acc[c.mesa_id].created_at) acc[c.mesa_id] = c
        return acc
      }, {} as Record<string, typeof comandas[0]>)
  ).slice(-4) // máximo 4 mesas activas visibles

  // Todas las mesas ocupadas del turno (de cualquier camarero) para el grid
  const mesasOcupadas = comandas
    .filter(c => ['nueva','en_cocina'].includes(c.estado))
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
    fetch('/api/turno').then(r=>r.json()).then(d => { if (d.turno) setTurnoId(d.turno.id) })
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
        setTabsVisibles([...new Set([...fijos, ...saved])])
      }
    } catch {}
    const ses = localStorage.getItem('ia_rest_session') ?? ''
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
      if (dm.mesas) setMesasPlano(dm.mesas.map((m: {
        id:string;codigo:string;capacidad:number;zona:string;
        pos_x:number|null;pos_y:number|null;forma:string|null;estado:string;
      }) => ({
        ...m,
        estado: (m.estado ?? 'libre') as MesaPlano['estado'],
        es_mia: false,
      })))
      if (Array.isArray(dz)) setZonasPlano(dz.map((z: {id:string;tipo:string;nombre:string}) => ({
        id: z.id, tipo: z.tipo, nombre: z.nombre,
      })))
    }).catch(() => {})
  }, [])

  // Recargar cuentas nominales al entrar en la tab
  const loadCuentasNominales = useCallback(() => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    fetch('/api/cuenta-nominal', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => { if (d.cuentas) setCuentasNominales(d.cuentas) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'cuentas') loadCuentasNominales()
  }, [tab, loadCuentasNominales])

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
    setMesasPlano(prev => prev.map(m => {
      const comanda = mesasOcupadas[m.id]
      if (!comanda) return {
        ...m, estado: 'libre' as const,
        num_comensales: null, es_mia: false,
        minutos_abierta: null, servicio_pendiente: false,
      }
      const min = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000)
      const estado: MesaPlano['estado'] = comanda.tipo === 'cuenta' ? 'cuenta'
        : comanda.estado === 'en_cocina' ? 'en_cocina'
        : min > 60 ? 'urgente' : 'activa'
      return {
        ...m,
        estado,
        num_comensales: comanda.num_comensales ?? null,
        es_mia: comanda.camarero_id === session.id,
        minutos_abierta: min,
        servicio_pendiente: servicioPendiente.has(m.id),
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandas, session.id, servicioPendiente])

  useEffect(() => {
    if (screen !== 'speaking' || !brain) return
    speakingRef.current = true
    speak(buildTTS(brain, alertas86, alertasAlerg)).then(() => {
      if (speakingRef.current) { speakingRef.current=false; setScreen('confirm') }
    })
    return () => { speakingRef.current = false }
  }, [screen, brain]) // eslint-disable-line react-hooks/exhaustive-deps

  const mediaRef    = useRef<MediaRecorder|null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const recordingRef = useRef(false)

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
    // Permitir grabar desde idle O desde asking (responder pregunta de BRAIN)
    if (screen !== 'idle' && screen !== 'asking') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      chunksRef.current = []
      const mr = new MediaRecorder(stream, {mimeType:'audio/webm;codecs=opus'})
      mr.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100); mediaRef.current=mr; recordingRef.current=true
      setScreen('recording')
      if (navigator.vibrate) navigator.vibrate(50)
    } catch { setError('Sin acceso al micrófono'); setScreen('error') }
  }, [screen])

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || !mediaRef.current) return
    recordingRef.current = false; setScreen('processing')
    const mr = mediaRef.current
    await new Promise<void>(resolve => { mr.onstop=()=>resolve(); mr.stop() })
    mr.stream.getTracks().forEach(t=>t.stop())
    if (!chunksRef.current.length) { setScreen('idle'); return }

    const blob = new Blob(chunksRef.current, {type:'audio/webm'})
    const fd   = new FormData()
    fd.append('audio', blob, 'audio.webm')
    fd.append('camarero_id', session.id)
    fd.append('turno_id', turnoId||'demo')
    if (pendingItems.length > 0) fd.append('pending_items', JSON.stringify(pendingItems))
    if (clarificacionCtx)        fd.append('pending_context', clarificacionCtx)

    try {
      const r = await fetch('/api/transcribe', {method:'POST', body:fd})
      const d = await r.json()
      if (d.ok) {
        setTranscript(d.texto); setBrain(d.brain); setLatencia(d.latencia_ms)
        setLastComandaId(d.comanda_id??null); setAlertas86(d.alertas_86??[]); setAlertasAlerg(d.alertas_alergenos??[])
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
            setScreen('asking')
          } else {
            // Pocas opciones → flujo de voz (blanco/tinto/rosado)
            setChipsClarificacion([])
            setScreen('asking')
            speak(pregunta).then(() => startRecording())
          }
          return
        }
        // Limpiar contexto de clarificación si se resolvió con éxito
        setClarificacionCtx(null); setPreguntaBrain('¿Qué mesa?')
        setChipsClarificacion([]); setMesaClarificacion(null)

        // Si BRAIN no encontró mesa o no creó comanda → preguntar
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
          setScreen('asking')
          speak('¿Qué mesa?').then(() => startRecording())
          return
        }

        // Cuenta nominal creada → refrescar lista y notificar
        if (esNominal) {
          loadCuentasNominales()
          const bItemsN: BrainResult['items'] = d.brain?.items || []
          const msgN = `★ ${d.nombre_cuenta}: ${bItemsN.map((it: BrainResult['items'][0]) => `${it.cantidad}× ${it.nombre}`).join(', ')}`
          addMsg('brain', msgN, 'ok')
          setLastComandaId(d.comanda_id)
          if (!ttsOff) speak(`${d.nombre_cuenta}: ${bItemsN.map((it: BrainResult['items'][0]) => `${it.cantidad===1?'una de':it.cantidad} ${it.nombre}`).join(', ')}. Anotado.`)
          setScreen('sent')
          return
        }

        // ── Detectar productos fuera de carta ─────────────────────────────
        // BRAIN devolvió comanda pero con items vacíos (producto no reconocido)
        const bItems: BrainResult['items'] = d.brain?.items || []
        const esFueraCarta = bItems.length === 0 &&
          d.brain?.tipo === 'comanda' &&
          d.brain?.confianza < 0.5
        if (esFueraCarta) {
          const aviso = `"${d.texto}" — producto no encontrado en carta. Repítelo o avisa al dueño para añadirlo`
          addMsg('sistema', aviso, 'aviso')
          setScreen('idle')
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

        if (necesitaPax && mesaIdRes) {
          setPendingVozComanda({ mesaId: mesaIdRes, mesaCodigo: d.brain?.mesa||'?', paxYaConocido: null })
          // Mostramos confirm sheet igual pero con el modal de comensales encima
        }

        const hasTTS = typeof window!=='undefined' && 'speechSynthesis' in window
        const conf   = d.brain?.confianza ?? 0

        // Auto-confirmar si confianza suficiente y opción activada
        if (autoConfirm && conf * 100 >= autoThreshold && d.comanda_id) {
          setScreen('sent')
          addMsg('brain', `✓ Auto-enviado · ${d.brain?.mesa||'?'}`, 'ok')
        } else if (!ttsOff && voiceConfirm && hasTTS) {
          setScreen('speaking')
        } else {
          setScreen('confirm')
        }
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        const msg = d.code==='API_KEY_INVALID'?'API key no configurada':d.error||'Error al procesar la voz'
        setError(msg); addMsg('sistema', msg, 'error'); setScreen('error')
      }
    } catch { 
      setError('Sin conexión')
      addMsg('sistema','Sin conexión con el servidor — comanda guardada, se enviará al recuperar WiFi','error')
      setScreen('error')
      // Circuit breaker: si BRAIN ya procesó una comanda, guardarla para reintento offline
      // brain tiene: mesa, items, mesa_id (seteado antes del fetch)
    }
  }, [session.id, turnoId, pendingItems, voiceConfirm, startRecording, addMsg])

  useEffect(() => {
    const dn = (e:KeyboardEvent) => { if(e.code==='Space'&&!e.repeat&&screen==='idle'){e.preventDefault();startRecording()} }
    const up = (e:KeyboardEvent) => { if(e.code==='Space'&&screen==='recording') stopRecording() }
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
      if (screen === 'idle')      { activateMediaSession(); startRecording() }
      else if (screen === 'recording') stopRecording()
    }
    const stop = () => { if (screen === 'recording') stopRecording() }
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
  }, [screen, startRecording, stopRecording, activateMediaSession])

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
    ;(window as any).startPTT = () => { activateMediaSession(); startRecording() }
    ;(window as any).stopPTT  = () => stopRecording()
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
    const t = setTimeout(() => { setScreen('idle'); setBrain(null); setTranscript('') }, 15000)
    return () => clearTimeout(t)
  }, [screen])

  // ── window.resetPTT para el APK nativo ───────────────────────────
  // Permite al APK forzar vuelta a idle si detecta estado colgado
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).resetPTT = () => {
      setScreen('idle'); setBrain(null); setTranscript('')
    }
    return () => { delete (window as any).resetPTT }
  }, [])

  const logout = () => {
    fetch('/api/auth',{method:'DELETE'}); localStorage.removeItem('ia_rest_session')
    window.location.href='/login'
  }

  // Marchar rápido desde doble-tap en plano
  const marcharRapido = async (mesa: MesaPlano) => {
    const comanda = mesasOcupadas[mesa.id]
    if (!comanda || !['en_cocina','activa'].includes(comanda.estado ?? '')) return
    const items = (comanda.items ?? []).map((it: {nombre:string;cantidad:number}) => ({
      nombre: it.nombre, cantidad: it.cantidad,
    }))
    if (!items.length) return
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    await fetch('/api/marchar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ comanda_id: comanda.id, mesa_codigo: mesa.codigo, items }),
    })
    addMsg('sistema', `✓ Marchado · ${mesa.codigo}`, 'ok')
  }
  const seleccionarChip = useCallback(async (chip: {nombre:string;precio?:number|null;cantidad:number}) => {
    // Buscar mesa_id a partir del codigo guardado
    const mesa = mesasPlano.find(m => m.codigo === mesaClarificacion)
    if (!mesa) {
      addMsg('sistema', `Mesa ${mesaClarificacion} no encontrada`, 'error')
      return
    }
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    try {
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ mesa_id: mesa.id, items: [{ nombre: chip.nombre, cantidad: chip.cantidad }] }),
      })
      const d = await r.json()
      if (r.ok) {
        addMsg('brain', `✓ ${chip.cantidad}× ${chip.nombre} · ${mesa.codigo}`, 'ok')
        setChipsClarificacion([])
        setClarificacionCtx(null)
        setMesaClarificacion(null)
        setPreguntaBrain('¿Qué mesa?')
        setScreen('sent')
        setBrain({ mesa: mesa.codigo, tipo: 'comanda', items: [chip], confianza: 1, raw: chip.nombre })
        setLastComandaId(d.comanda_id ?? d.id ?? null)
        if (navigator.vibrate) navigator.vibrate([30,50,30])
      } else {
        addMsg('sistema', d.error ?? 'Error al crear comanda', 'error')
      }
    } catch {
      addMsg('sistema', 'Sin conexión', 'error')
    }
  }, [mesasPlano, mesaClarificacion, addMsg])

  const reset = () => {
    if (typeof window!=='undefined') window.speechSynthesis?.cancel()
    speakingRef.current=false; setScreen('idle'); setBrain(null); setTranscript('')
    setError(''); setPedidoCuenta({loading:false,error:'',factura:null})
    setAlertas86([]); setAlertasAlerg([]); setPendingItems([])
    setClarificacionCtx(null); setPreguntaBrain('¿Qué mesa?')
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
  const isProcessing = screen==='processing'||screen==='speaking'

  return (
    <div style={{height:'100dvh',background:C.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SN,position:'relative',fontSize:fontBig?'1.1rem':'1rem',color:C.ink}}>
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
      `}</style>

      {/* ALERTAS — banner audio + notificación */}
      <AlertaBanner alertas={alertas} onMarcarLeida={marcarLeida} />

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
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,flex:1}}>
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

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.rule}`,background:C.bg1,flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 0 rgba(26,23,20,.06)'}}>
        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:21,color:C.verm,letterSpacing:'-.4px',lineHeight:1}}>ia.rest</div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {(isListening||isProcessing) && (
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
          {updateAvailable && (
            <button onClick={applyUpdate} title="Actualizar app"
              style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',background:C.vermS,border:`1px solid ${C.verm}55`,borderRadius:8,cursor:'pointer',fontSize:15,flexShrink:0}}>
              ↺
            </button>
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
      </div>

      {/* FUERA DE CARTA — pill visible solo cuando hay especiales */}
      <FueraCartaPill restauranteId={session.restaurante_id} />

      {/* ══ TAB: HABLAR — chat limpio, sin plano ═══════════════ */}
      {tab==='hablar' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* ── Mis comandas activas ─────────────────────────── */}
          <div style={{
            height:44,flexShrink:0,background:C.bg1,
            borderBottom:`1px solid ${C.rule}`,
            display:'flex',alignItems:'center',gap:6,
            padding:'0 12px',overflowX:'auto',scrollbarWidth:'none' as const,
          }}>
            <span style={{fontFamily:SM,fontSize:8,color:C.ink4,flexShrink:0,letterSpacing:'.06em'}}>MIS MESAS</span>
            {ultimasComandas.length === 0 && (
              <span style={{fontFamily:SN,fontSize:11,color:C.ink4,fontStyle:'italic'}}>sin mesas activas</span>
            )}
            {ultimasComandas.map(c => {
              const mesa  = c.mesa?.codigo || '?'
              const min   = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
              const col   = min >= 45 ? C.verm : min >= 30 ? '#D26414' : min >= 15 ? C.amb : C.gr
              const esFijada = mesaFijada === c.mesa_id
              return (
                <div key={c.id}
                  onClick={()=>setMesaDetalle({id:c.mesa_id, codigo:mesa, capacidad:(c.mesa as {capacidad?:number})?.capacidad})}
                  onContextMenu={e=>{e.preventDefault();setMesaFijada(mesaFijada===c.mesa_id?null:c.mesa_id)}}
                  style={{
                    flexShrink:0,display:'flex',alignItems:'center',gap:5,
                    padding:'4px 9px',borderRadius:8,cursor:'pointer',
                    background: esFijada ? `${col}22` : `${col}10`,
                    border:`${esFijada?2:1}px solid ${col}${esFijada?'':' 55'}`,
                    animation: min>=45 ? 'urgPulse 1.8s ease-in-out infinite' : 'none',
                  }}>
                  {esFijada && <span style={{fontSize:9,color:col}}>→</span>}
                  <div style={{width:5,height:5,borderRadius:'50%',background:col,flexShrink:0}}/>
                  <div>
                    <div style={{fontFamily:SE,fontStyle:'italic',fontSize:14,fontWeight:500,color:col,lineHeight:1}}>{mesa}</div>
                    <div style={{fontFamily:SM,fontSize:7,color:col,textTransform:'uppercase',lineHeight:1,marginTop:1}}>
                      {c.estado==='en_cocina'?'cocina':c.estado==='lista'?'lista ✓':'activa'} · {min}m
                    </div>
                  </div>
                </div>
              )
            })}
            {mesaFijada && (
              <div style={{marginLeft:'auto',flexShrink:0,fontFamily:SM,fontSize:8,color:C.verm,letterSpacing:'.05em'}}>
                → fijada · mantén para soltar
              </div>
            )}
          </div>

          {/* ── Chat ─────────────────────────────────────────── */}
          <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 14px',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:8}}>

            {chatMsgs.length===0 && screen==='idle' && (
              <div style={{textAlign:'center',padding:'20px 20px 10px'}}>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:19,color:C.ink3,lineHeight:1.4,marginBottom:6}}>Mantén pulsado y habla.</div>
                {mesaFijada && (
                  <div style={{fontFamily:SM,fontSize:10,color:C.verm,background:C.vermS,display:'inline-block',padding:'3px 10px',borderRadius:8}}>
                    → siguiente comanda va a {ultimasComandas.find(c=>c.mesa_id===mesaFijada)?.mesa?.codigo||'mesa fijada'}
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
                <div style={{display:'flex',borderTop:`1px solid ${C.rule}`}}>
                  <button onClick={reset} style={{flex:1,padding:12,background:'none',border:'none',borderRight:`1px solid ${C.rule}`,color:C.ink3,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>✗ Cancelar</button>
                  <button onClick={()=>{; setScreen('sent')
                    addMsg('brain',`✓ Enviado · ${brain.mesa}`,'ok')
                    setPushMsg(`🍳 Cocina recibió · ${brain.mesa}`); setShowPush(true); setTimeout(()=>setShowPush(false),4000)
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
                {lastComandaId && !pedidoCuenta.factura && (
                  <button onClick={pedirCuenta} disabled={pedidoCuenta.loading}
                    style={{background:C.bg2,border:`1px solid ${C.rule}`,color:C.ink,padding:'9px 18px',borderRadius:8,fontFamily:SN,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    {pedidoCuenta.loading?'Generando…':'Generar cuenta · Verifactu'}
                  </button>
                )}
                {pedidoCuenta.factura && (
                  <div style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,padding:12,textAlign:'center'}}>
                    <div style={{fontFamily:SM,fontSize:8,color:C.ink3,marginBottom:3}}>FACTURA VERIFACTU</div>
                    <div style={{fontFamily:SE,fontSize:22,fontWeight:600,color:C.ink}}>{pedidoCuenta.factura.importe_total.toFixed(2).replace('.',',')} €</div>
                  </div>
                )}
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
                <button key={r} onClick={r==='✓ Sí'?()=>{;setScreen('sent');addMsg('brain',`✓ Enviado · ${brain?.mesa}`,'ok')}:r==='✗ No'?reset:()=>{reset();setScreen('idle')}}
                  style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:`1px solid ${C.rule}`,background:C.bg2,fontSize:12,fontWeight:600,color:r==='✓ Sí'?C.gr:r==='✗ No'?C.verm:C.ink3,cursor:'pointer',fontFamily:SN}}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {/* ── PTT ─────────────────────────────────────────── */}
          <div style={{padding:'8px 20px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:7,flexShrink:0,borderTop:`1px solid ${C.rule}`,background:C.bg1}}>
            <div style={{position:'relative',width:88,height:88,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out infinite'}}/>
              <div style={{position:'absolute',width:80,height:80,borderRadius:'50%',border:`1.5px solid ${isListening?C.verm+'60':'#D9442B22'}`,animation:'hout 2s ease-out .7s infinite'}}/>
              <button
                onPointerDown={e=>{e.preventDefault();activateMediaSession();startRecording()}}
                onPointerUp={e=>{e.preventDefault();stopRecording()}}
                onPointerLeave={e=>{e.preventDefault();if(recordingRef.current)stopRecording()}}
                disabled={isProcessing}
                style={{width:76,height:76,borderRadius:'50%',
                  background:isListening?C.verm:`linear-gradient(145deg,#E85540,${C.verm})`,
                  border:'none',cursor:isProcessing?'default':'pointer',position:'relative',zIndex:2,
                  boxShadow:isListening?`0 2px 12px ${C.verm}55`:`0 4px 20px ${C.verm}44`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transform:isListening?'scale(.91)':'scale(1)',
                  transition:'all .15s cubic-bezier(.34,1.56,.64,1)',
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
          .filter(c => c.camarero_id === session.id && ['nueva','en_cocina','lista'].includes(c.estado))
          .sort((a,b) => {
            const ord = {lista:0, en_cocina:1, nueva:2}
            return (ord[a.estado as keyof typeof ord]??9) - (ord[b.estado as keyof typeof ord]??9)
          })
        const nCocina = misCmds.filter(c=>c.estado==='en_cocina').length
        const nLista  = misCmds.filter(c=>c.estado==='lista').length

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
              </div>
            </div>

            {/* Lista de comandas */}
            <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 14px',display:'flex',flexDirection:'column',gap:10}}>
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
                const isLista   = c.estado === 'lista'
                const isCocina  = c.estado === 'en_cocina'
                const col    = isLista ? C.gr : isCocina ? C.amb : C.ink4
                const bg     = isLista ? C.grS : isCocina ? C.ambS : C.bg2
                const label  = isLista ? '✓ Lista para servir' : isCocina ? 'En cocina…' : 'Nueva'
                return (
                  <div key={c.id}
                    onClick={()=>setMesaDetalle({id:c.mesa_id,codigo:mesa,capacidad:(c.mesa as {capacidad?:number})?.capacidad})}
                    style={{background:C.bg1,border:`1px solid ${col}44`,borderLeft:`3px solid ${col}`,borderRadius:10,overflow:'hidden',cursor:'pointer',boxShadow:'0 1px 4px rgba(26,23,20,.06)'}}>
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

      {/* ══ TAB: CUENTAS POR NOMBRE ══════════════════════════════ */}
      {tab==='cuentas' && (() => {
        // Si hay una cuenta en detalle, mostrar su contenido
        if (cuentaDetalle) {
          const mins = Math.floor((Date.now() - new Date(cuentaDetalle.ultima_actividad).getTime()) / 60000)
          const allItems = cuentaDetalle.comandas.flatMap(c => c.items)
          // Agrupar items por nombre
          const itemMap: Record<string, {cantidad:number; precio:number|null; notas:string[]}> = {}
          for (const it of allItems) {
            if (!itemMap[it.nombre]) itemMap[it.nombre] = {cantidad:0, precio:it.precio_unitario, notas:[]}
            itemMap[it.nombre].cantidad += it.cantidad
            if (it.notas) itemMap[it.nombre].notas.push(it.notas)
          }
          return (
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'10px 14px',flexShrink:0,background:C.bg1,borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setCuentaDetalle(null)} style={{background:'none',border:'none',cursor:'pointer',color:C.ink3,display:'flex',alignItems:'center',gap:4,fontFamily:SN,fontSize:13,padding:0}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  Cuentas
                </button>
                <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink,marginLeft:4}}>★ {cuentaDetalle.nombre}</div>
                <div style={{marginLeft:'auto',fontFamily:SM,fontSize:11,color:C.ink3}}>{mins}m · {cuentaDetalle.num_items} ítems</div>
              </div>
              <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'12px 14px',display:'flex',flexDirection:'column',gap:8}}>
                {/* Items agrupados */}
                <div style={{background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:10,overflow:'hidden'}}>
                  <div style={{padding:'8px 12px',borderBottom:`1px solid ${C.rule}`,fontFamily:SM,fontSize:10,color:C.ink4,textTransform:'uppercase',letterSpacing:'.06em'}}>Consumo</div>
                  {Object.entries(itemMap).map(([nombre, data], i) => (
                    <div key={i} style={{display:'flex',alignItems:'baseline',gap:8,padding:'8px 12px',borderBottom:i<Object.keys(itemMap).length-1?`1px solid ${C.rule}`:'none'}}>
                      <span style={{fontFamily:SE,fontStyle:'italic',fontSize:19,color:C.verm,minWidth:22,textAlign:'center'}}>{data.cantidad}</span>
                      <span style={{fontSize:14,color:C.ink,flex:1}}>{nombre}</span>
                      {data.precio && <span style={{fontFamily:SM,fontSize:11,color:C.ink3}}>{(data.precio*data.cantidad).toFixed(2)}€</span>}
                    </div>
                  ))}
                </div>
                {/* Total */}
                <div style={{background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontFamily:SN,fontSize:14,color:C.ink2,fontWeight:600}}>Total</span>
                  <span style={{fontFamily:SE,fontStyle:'italic',fontSize:26,color:C.ink,fontWeight:500}}>{cuentaDetalle.total.toFixed(2)} €</span>
                </div>
              </div>
              {/* Footer acciones */}
              <div style={{padding:'12px 14px',borderTop:`1px solid ${C.rule}`,display:'flex',gap:10,flexShrink:0}}>
                <button
                  onClick={async () => {
                    const ses = localStorage.getItem('ia_rest_session') ?? ''
                    await fetch('/api/cuenta-nominal', { method:'DELETE', headers:{'Content-Type':'application/json','x-ia-session':ses}, body:JSON.stringify({nombre_cuenta:cuentaDetalle.nombre}) })
                    setCuentaDetalle(null); loadCuentasNominales()
                  }}
                  style={{flex:1,background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:10,padding:'12px',fontFamily:SN,fontSize:14,fontWeight:600,cursor:'pointer',color:C.ink3}}>
                  Cerrar cuenta
                </button>
                <button
                  onClick={()=>{setCuentaDetalle(null); setTab('hablar')}}
                  style={{flex:1,background:C.verm,border:'none',borderRadius:10,padding:'12px',fontFamily:SN,fontSize:14,fontWeight:600,cursor:'pointer',color:'#fff'}}>
                  + Añadir pedido
                </button>
              </div>
            </div>
          )
        }

        return (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header */}
            <div style={{padding:'8px 14px',flexShrink:0,background:C.bg1,borderBottom:`1px solid ${C.rule}`,display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:16,color:C.ink}}>Cuentas por nombre</div>
              <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
                {cuentasNominales.length>0 && (
                  <div style={{background:C.vermS,border:`1px solid ${C.verm}44`,borderRadius:8,padding:'3px 8px',fontFamily:SM,fontSize:9,color:C.verm,fontWeight:700}}>
                    {cuentasNominales.length} ABIERTAS
                  </div>
                )}
                <button onClick={()=>setNuevaCuentaOpen(v=>!v)}
                  style={{background:C.verm,border:'none',borderRadius:8,padding:'5px 10px',fontFamily:SN,fontSize:11,fontWeight:700,cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',gap:5}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Nueva
                </button>
              </div>
            </div>

            {/* Formulario nueva cuenta */}
            {nuevaCuentaOpen && (
              <div style={{padding:'12px 14px',background:C.bg2,borderBottom:`1px solid ${C.rule}`,display:'flex',gap:8}}>
                <input
                  autoFocus
                  value={nuevaCuentaNombre}
                  onChange={e=>setNuevaCuentaNombre(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key==='Enter' && nuevaCuentaNombre.trim()) {
                      const ses = localStorage.getItem('ia_rest_session') ?? ''
                      // Crear una comanda nominal vacía (solo para registrar la apertura)
                      // El camarero añadirá items por voz diciendo "X para [nombre]"
                      setNuevaCuentaOpen(false); setNuevaCuentaNombre('')
                      // Redirigir a hablar con el nombre como contexto
                      addMsg('sistema', `Cuenta abierta para ${nuevaCuentaNombre.trim()} — di "dos cañas para ${nuevaCuentaNombre.trim()}" para añadir`, 'ok')
                      setTab('hablar')
                    }
                    if (e.key==='Escape') { setNuevaCuentaOpen(false); setNuevaCuentaNombre('') }
                  }}
                  placeholder="Nombre del cliente…"
                  style={{flex:1,background:C.bg1,border:`1px solid ${C.rule}`,borderRadius:8,padding:'9px 12px',fontFamily:SN,fontSize:14,color:C.ink,outline:'none'}}
                />
                <button onClick={()=>{setNuevaCuentaOpen(false);setNuevaCuentaNombre('')}}
                  style={{background:'none',border:`1px solid ${C.rule}`,borderRadius:8,padding:'9px 12px',fontFamily:SN,fontSize:13,cursor:'pointer',color:C.ink3}}>
                  ✕
                </button>
              </div>
            )}

            {/* Lista de cuentas */}
            <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const,padding:'10px 14px',display:'flex',flexDirection:'column',gap:10}}>
              {cuentasNominales.length === 0 && (
                <div style={{textAlign:'center',padding:'40px 20px'}}>
                  <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.ink4,marginBottom:6}}>Sin cuentas abiertas</div>
                  <div style={{fontFamily:SN,fontSize:12,color:C.ink4,lineHeight:1.5}}>
                    Di <span style={{fontFamily:SM,color:C.teal}}>"dos cañas para Alberto"</span><br/>
                    y la cuenta se abre automáticamente
                  </div>
                </div>
              )}
              {cuentasNominales.map(c => {
                const mins = Math.floor((Date.now() - new Date(c.ultima_actividad).getTime()) / 60000)
                return (
                  <div key={c.nombre} onClick={()=>setCuentaDetalle(c)}
                    style={{background:C.bg1,border:`1px solid ${C.rule}`,borderLeft:`3px solid ${C.verm}`,borderRadius:10,overflow:'hidden',cursor:'pointer',boxShadow:'0 1px 4px rgba(26,23,20,.06)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px'}}>
                      {/* Icono persona */}
                      <div style={{width:36,height:36,borderRadius:'50%',background:C.vermS,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.verm} strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink,lineHeight:1,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>★ {c.nombre}</div>
                        <div style={{fontFamily:SM,fontSize:10,color:C.ink4}}>{c.num_items} ítem{c.num_items!==1?'s':''} · hace {mins}m</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.ink,fontWeight:500}}>{c.total.toFixed(2)}€</div>
                        <div style={{fontFamily:SM,fontSize:9,color:C.verm,textTransform:'uppercase',letterSpacing:'.06em'}}>{c.comandas.length} ronda{c.comandas.length!==1?'s':''}</div>
                      </div>
                    </div>
                    {/* Preview últimos items */}
                    <div style={{padding:'6px 14px 10px',borderTop:`1px solid ${C.rule}`,display:'flex',gap:6,flexWrap:'wrap' as const}}>
                      {c.comandas[0]?.items.slice(0,4).map((it,i) => (
                        <span key={i} style={{fontFamily:SM,fontSize:10,color:C.ink3,background:C.bg2,borderRadius:6,padding:'2px 7px'}}>
                          {it.cantidad}× {it.nombre}
                        </span>
                      ))}
                      {(c.comandas[0]?.items.length??0) > 4 && (
                        <span style={{fontFamily:SM,fontSize:10,color:C.ink4}}>+{(c.comandas[0]?.items.length??0)-4} más</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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
        />
      )}

      {/* ══ TAB: CARTA — consulta de carta para camarero ════════ */}
      {tab==='carta' && (() => {
        const nombres86 = new Set(productos86.map(p => p.nombre.toLowerCase()))
        const filtro    = cartaBusqueda.trim().toLowerCase()
        const todos     = filtro
          ? productosCarta.filter(p =>
              p.nombre.toLowerCase().includes(filtro) ||
              (p.descripcion ?? '').toLowerCase().includes(filtro) ||
              p.categoria.toLowerCase().includes(filtro)
            )
          : productosCarta
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
                  onChange={e => setCartaBusqueda(e.target.value)}
                  placeholder="Buscar en carta…"
                  style={{border:'none',background:'transparent',outline:'none',flex:1,fontFamily:SN,fontSize:13,color:C.ink}}
                />
                {cartaBusqueda && (
                  <span onClick={()=>setCartaBusqueda('')} style={{color:C.ink4,cursor:'pointer',fontSize:15,lineHeight:1}}>×</span>
                )}
              </div>
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
                  <div style={{fontFamily:SE,fontStyle:'italic',fontSize:17,color:C.ink4}}>Sin resultados para "{cartaBusqueda}"</div>
                  <button onClick={()=>setCartaBusqueda('')} style={{marginTop:12,background:'none',border:`1px solid ${C.rule}`,color:C.ink3,padding:'6px 14px',borderRadius:8,fontFamily:SN,fontSize:12,cursor:'pointer'}}>Limpiar búsqueda</button>
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
            setScreen('sent'); pedirCuenta()
          }}
          onAnadirPorVoz={(id, codigo, _comandaId)=>{
            setMesaDetalle(null); setTab('hablar')
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
            setScreen('confirm')
          }}
          onSaltarse={() => { setPendingVozComanda(null); setScreen('confirm') }}
          onClose={() => { setPendingVozComanda(null); setScreen('confirm') }}
        />
      )}

      {/* ── BOTTOM NAV ─────────────────────────────────────────── */}
      <nav style={{display:'flex',background:C.bg1,borderTop:`1px solid ${C.rule}`,flexShrink:0}}>
        {ALL_TABS.filter(t=>tabsVisibles.includes(t.id)).map(t => {
          const on = tab===t.id
          return (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:'9px 4px 13px',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,position:'relative',color:on?C.verm:C.ink3,transition:'color .15s'}}>
              {on && <div style={{position:'absolute',top:0,left:'22%',right:'22%',height:2,background:C.verm,borderRadius:'0 0 3px 3px'}}/>}
              {t.id==='cuentas' && cuentasNominales.length>0 && !on && (
                <div style={{position:'absolute',top:6,right:'20%',width:8,height:8,borderRadius:'50%',background:C.verm}}/>
              )}
              {t.id==='chat' && noLeidos>0 && !on && (
                <div style={{position:'absolute',top:5,right:'18%',minWidth:16,height:16,borderRadius:8,background:C.verm,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                  <span style={{fontFamily:SN,fontSize:9,fontWeight:700,color:'#fff'}}>{noLeidos>9?'9+':noLeidos}</span>
                </div>
              )}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t.path.split('M').filter(Boolean).map((seg,i) => <path key={i} d={`M${seg}`}/>)}
              </svg>
              <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px'}}>{t.lbl}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/* ─── CONFIG ─────────────────────────────────────────────────── */
function ConfigScreen({session,tabsVisibles,onTabsVisibles,voiceConfirm,onVoiceConfirm,zonasAsignadas,onZonasAsignadas,zonasDisponibles,fontBig,onFontBig,alergenosMesa,onAlergenosMesa,subscribed,onSubscribe,hasInstall,onInstall,autoConfirm,onAutoConfirm,autoThreshold,onAutoThreshold,ttsOff,onTtsOff,onLogout}:{
  session:{id:string;nombre:string;rol:string}
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
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:3}}>Mis tabs</div>
          <div style={{fontSize:11,color:C.ink4,marginBottom:10}}>Personaliza qué botones ves en la barra inferior</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {ALL_TABS.map(t => {
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
        <div style={{paddingTop:20,paddingBottom:32}}>
          <button onClick={onLogout} style={{width:'100%',padding:13,background:'transparent',border:`1px solid ${C.verm}44`,borderRadius:10,fontFamily:SN,fontSize:13,fontWeight:600,color:C.verm,cursor:'pointer'}}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
