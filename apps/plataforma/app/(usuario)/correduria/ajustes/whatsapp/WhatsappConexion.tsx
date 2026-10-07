'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, MessageCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { faltanParaConectar, leerEventoSignup, opcionesLogin, textoMotivoWhatsapp, VERSION_SDK_META } from '@/lib/correduria/whatsapp-embedded-signup'
import Bloque from '../../Bloque'
import { ConIcono } from '../../iconos'

/**
 * «Conectar mi WhatsApp Business» (05/10/2026): Embedded Signup de Meta en modo Coexistence (el número
 * sigue en la app del móvil). Alberto es Tech Provider: sin BSP.
 *
 *   1. Se carga el SDK JS de Facebook (NEXT_PUBLIC_META_APP_ID) y `FB.login` abre el popup de Meta con la
 *      configuración NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID.
 *   2. El popup devuelve un `code` (callback de FB.login) y, por `postMessage` desde facebook.com, los ids
 *      (waba_id, phone_number_id, business_id). Llegan en cualquier orden: se juntan.
 *   3. Se mandan a /api/correduria/whatsapp-conexion → asegura canjea el code (el App Secret solo vive allí),
 *      suscribe la app, pide las syncs y verifica. Aquí no se envía ningún mensaje.
 * Sin variables, la pantalla dice cuáles faltan y no carga nada. Sin lectura buena no se dice «desconectado».
 */

type Paso = { estado: 'ok' | 'fallo' | 'sin_pedir'; motivo?: string; error?: { mensaje?: string; codigo?: number | null } }
type Conexion = {
  estado: 'conectada' | 'desconectada' | 'baja' | null
  motivo: string | null
  eventoAt: string | null
  wabaId: string | null
  phoneNumberId: string | null
  token: 'sin_token' | 'cifrado' | 'en_claro_heredado'
  conectadaAt: string | null
  suscritaAt: string | null
  verificacion: { isOnBizApp: boolean | null; platformType: string | null; at: string | null }
  sync: {
    contactos: { pedidaAt: string | null; recibidos: number | null }
    historial: { pedidaAt: string | null; resultado: string | null; hilosDescartados: number | null; mensajesDescartados: number | null }
  }
}
type Respuesta = { estado?: string; causa?: string; conexion?: Conexion | null; configuracion?: Record<string, unknown> }
type Fase = 'cargando' | 'ok' | 'sin_puerto' | 'error'

declare global {
  interface Window {
    FB?: { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, o: Record<string, unknown>) => void }
    fbAsyncInit?: () => void
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID
const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
const fila = { display: 'grid', gridTemplateColumns: 'minmax(0, 9rem) minmax(0, 1fr)', gap: 8, fontSize: 13, alignItems: 'baseline' } as const

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const ESTADO: Record<string, { texto: string; tono: 'positivo' | 'negativo' | 'neutral' }> = {
  conectada: { texto: 'Conectada', tono: 'positivo' },
  desconectada: { texto: 'Desconectada', tono: 'negativo' },
  baja: { texto: 'De baja', tono: 'negativo' },
}

const HISTORIAL: Record<string, string> = {
  no_compartido: 'No compartido (lo elegido: «No compartir chats»)',
  descartado: 'Llegó y se DESCARTÓ sin guardar texto',
  guardado_crudo: 'Guardado en crudo, sin importar (WHATSAPP_IMPORTAR_HISTORIAL=1)',
  error_meta: 'Meta devolvió un error',
}

function cargarSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve()
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSION_SDK_META })
      resolve()
    }
    if (document.getElementById('facebook-jssdk')) return
    const s = document.createElement('script')
    s.id = 'facebook-jssdk'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.src = 'https://connect.facebook.net/es_ES/sdk.js'
    s.onerror = () => reject(new Error('sdk'))
    document.body.appendChild(s)
  })
}

export default function WhatsappConexion() {
  const [fase, setFase] = useState<Fase>('cargando')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [sdk, setSdk] = useState<'no' | 'cargando' | 'listo' | 'fallo'>('no')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null)
  const [resultado, setResultado] = useState<{ pasos: Record<string, Paso>; avisos: string[] } | null>(null)
  const code = useRef<string | null>(null)
  const ids = useRef<{ wabaId: string; phoneNumberId: string; businessId: string | null } | null>(null)

  const cargar = useCallback(async () => {
    setFase('cargando')
    try {
      const r = await fetch('/api/correduria/whatsapp-conexion', { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as Respuesta | null
      if (r.status === 503 && j?.estado === 'sin_configurar' && !j.configuracion) return setFase('sin_puerto')
      setDatos(j)
      setFase(r.ok && j?.estado === 'ok' ? 'ok' : 'error')
    } catch {
      setFase('error')
    }
  }, [])

  const faltan = faltanParaConectar({ appId: APP_ID, configId: CONFIG_ID, config: datos?.configuracion ?? null })

  const enviar = useCallback(async () => {
    if (!code.current || !ids.current) return
    const cuerpo = { code: code.current, waba_id: ids.current.wabaId, phone_number_id: ids.current.phoneNumberId, business_id: ids.current.businessId }
    code.current = null
    ids.current = null
    try {
      const r = await fetch('/api/correduria/whatsapp-conexion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = (await r.json().catch(() => null)) as { estado?: string; pasos?: Record<string, Paso>; avisos?: string[]; faltan?: string[]; motivo?: string } | null
      if (r.ok && (j?.estado === 'ok' || j?.estado === 'parcial')) {
        setResultado({ pasos: j.pasos ?? {}, avisos: j.avisos ?? [] })
        setAviso({ texto: j.estado === 'ok' ? 'WhatsApp Business conectado.' : 'Conectado a medias: mira qué paso falló.', bien: j.estado === 'ok' })
      } else {
        setAviso({
          texto: j?.estado === 'sin_configurar' ? `Faltan variables en asegura: ${(j.faltan ?? []).join(', ') || 'ver docs/WHATSAPP.md'}.`
            : j?.estado === 'sin_clave_pii' ? 'asegura no puede cifrar el token (PII_ENCRYPTION_KEY): no se ha guardado nada.'
            : j?.estado === 'canje_fallido' ? 'Meta no aceptó el código (caduca en minutos y es de un solo uso). Vuelve a pulsar «Conectar».'
            : `No se ha podido completar la conexión (HTTP ${r.status}).${j?.motivo ? ` ${j.motivo}` : ''}`,
          bien: false,
        })
      }
    } catch {
      setAviso({ texto: 'No se ha podido completar la conexión. Mira el estado antes de reintentar.', bien: false })
    } finally {
      setOcupado(false)
      void cargar()
    }
  }, [cargar])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // El SDK se carga ANTES del clic: si no, el popup de FB.login lo bloquea el navegador.
  useEffect(() => {
    if (!APP_ID || !CONFIG_ID || sdk !== 'no') return
    setSdk('cargando')
    cargarSdk(APP_ID).then(() => setSdk('listo'), () => setSdk('fallo'))
  }, [sdk])

  useEffect(() => {
    function alMensaje(ev: MessageEvent) {
      const e = leerEventoSignup(ev.origin, ev.data)
      if (!e) return
      if (e.tipo === 'fin') {
        ids.current = { wabaId: e.wabaId, phoneNumberId: e.phoneNumberId, businessId: e.businessId }
        void enviar()
      } else if (e.tipo === 'cancelado') {
        setOcupado(false)
        setAviso({ texto: `Conexión cancelada${e.paso ? ` en el paso ${e.paso}` : ''}. No se ha cambiado nada.`, bien: false })
      } else {
        setOcupado(false)
        setAviso({ texto: e.mensaje, bien: false })
      }
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [enviar])

  function conectar() {
    if (!window.FB || !CONFIG_ID) return
    setOcupado(true)
    setAviso(null)
    setResultado(null)
    code.current = null
    ids.current = null
    window.FB.login((r) => {
      const c = r.authResponse?.code
      if (typeof c === 'string' && c.length > 0) {
        code.current = c
        void enviar()
      } else {
        setOcupado(false)
        setAviso((a) => a ?? { texto: 'Meta no devolvió el código de alta (ventana cerrada o permiso denegado).', bien: false })
      }
    }, opcionesLogin(CONFIG_ID))
  }

  const titulo = 'Conexión con WhatsApp Business'
  const avisoNodo = aviso && (
    <p role={aviso.bien ? 'status' : 'alert'} style={{ ...pMuted, color: aviso.bien ? 'var(--positive)' : 'var(--negative)' }}>
      <ConIcono i={aviso.bien ? CheckCircle2 : TriangleAlert}>{aviso.texto}</ConIcono>
    </p>
  )

  if (fase === 'cargando') return <Bloque primero titulo={titulo} Icono={MessageCircle}>{avisoNodo}<p style={pMuted}>Cargando…</p></Bloque>
  if (fase === 'sin_puerto') {
    return <Bloque primero titulo={titulo} Icono={MessageCircle} tono="aviso">{avisoNodo}<p style={pMuted}>El puerto con asegura no está conectado (ASEGURA_OPERADOR_SECRET).</p></Bloque>
  }

  const c = fase === 'ok' ? datos?.conexion ?? null : null
  const cfg = datos?.configuracion ?? {}
  const etiqueta = c?.estado ? ESTADO[c.estado] : { texto: 'Sin conectar', tono: 'neutral' as const }
  const caido = c?.estado === 'desconectada' || c?.estado === 'baja'

  return (
    <Bloque primero titulo={titulo} Icono={MessageCircle} tono={fase === 'error' || caido ? 'malo' : 'neutral'}
      accion={<button type="button" onClick={() => void cargar()} style={{ ...btnStyle('sutil'), minHeight: 44 }}><RefreshCw size={14} aria-hidden /> Actualizar</button>}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {avisoNodo}
        {fase === 'error' && (
          <p style={{ ...pMuted, color: 'var(--negative)' }}>
            <ConIcono i={TriangleAlert}>
              No se ha podido leer el estado (no significa que esté desconectado).
              {datos?.causa === 'esquema' ? ' Falta aplicar el SQL 2026-10-05f_whatsapp_conexion.sql en asegura.' : datos?.causa ? ` Causa: ${datos.causa}.` : ''}
            </ConIcono>
          </p>
        )}

        {c && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, background: 'var(--surface)', minWidth: 0 }}>
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Estado</span><span><Badge tono={etiqueta.tono}>{etiqueta.texto}</Badge>{c.motivo && <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{textoMotivoWhatsapp(c.motivo)}</span>}</span></div>
            {c.eventoAt && <div style={fila}><span style={{ color: 'var(--muted)' }}>Desde</span><span>{fecha(c.eventoAt)}</span></div>}
            {c.phoneNumberId && <div style={fila}><span style={{ color: 'var(--muted)' }}>Número (id Meta)</span><span style={{ overflowWrap: 'anywhere' }}>{c.phoneNumberId}</span></div>}
            {c.estado && (
              <>
                <div style={fila}><span style={{ color: 'var(--muted)' }}>App del móvil</span>
                  <span>{c.verificacion.isOnBizApp === true ? 'Sí, el número sigue en WhatsApp Business (Coexistence)' : c.verificacion.isOnBizApp === false ? <span style={{ color: 'var(--negative)' }}>Meta dice que NO</span> : 'Sin comprobar'}</span></div>
                <div style={fila}><span style={{ color: 'var(--muted)' }}>Contactos de la app</span>
                  <span>{c.sync.contactos.pedidaAt ? `Pedidos el ${fecha(c.sync.contactos.pedidaAt)}` : 'Sin pedir'}{c.sync.contactos.recibidos !== null ? ` · recibidos ${c.sync.contactos.recibidos.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)} (no se importan)` : ''}</span></div>
                <div style={fila}><span style={{ color: 'var(--muted)' }}>Historial de chats</span>
                  <span>{c.sync.historial.resultado ? HISTORIAL[c.sync.historial.resultado] ?? c.sync.historial.resultado : c.sync.historial.pedidaAt ? 'Pedido; Meta aún no ha contestado' : 'Sin pedir'}
                    {c.sync.historial.hilosDescartados ? ` · ${c.sync.historial.hilosDescartados} chats descartados` : ''}</span></div>
              </>
            )}
            {c.token === 'en_claro_heredado' && <div style={{ fontSize: 13, color: 'var(--negative)' }}>Hay un token antiguo SIN cifrar del CRM anterior: conecta de nuevo para sustituirlo.</div>}
          </div>
        )}

        {cfg.canalActivo === false && c?.estado === 'conectada' && (
          <p style={pMuted}>El canal está APAGADO en asegura (ASEGURA_WHATSAPP_ACTIVO): la conexión está hecha, pero los mensajes aún no se guardan en el CRM.</p>
        )}
        {cfg.numeroCoincide === false && <p style={{ ...pMuted, color: 'var(--negative)' }}>WHATSAPP_PHONE_NUMBER_ID de asegura no es el número conectado: los mensajes se ignorarán hasta corregirlo.</p>}

        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Antes de conectar</strong>
          <p style={{ ...pMuted, color: 'var(--text)' }}>
            Se abrirá una ventana de Meta. Elige tu cuenta de WhatsApp Business y el número de la app del móvil (sigue funcionando en el móvil).
            En el móvil, WhatsApp Business te preguntará si compartes el historial: elige <strong>«No compartir chats»</strong>.
          </p>
          <p style={pMuted}>Los contactos de la app no se importan (la agenda manda desde Google Contactos). Abre WhatsApp Business en el móvil al menos cada 14 días: si no, Meta desconecta el CRM y te llega un aviso por Telegram.</p>
        </div>

        {faltan.length > 0 ? (
          <p style={{ ...pMuted, color: 'var(--warning)' }}><ConIcono i={TriangleAlert}>Para poder conectar falta: {faltan.join(' · ')}.</ConIcono></p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={ocupado || sdk !== 'listo'} onClick={conectar} style={{ ...btnStyle('primario'), minHeight: 44 }}>
              <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
              {ocupado ? 'Conectando…' : sdk === 'cargando' ? 'Preparando…' : c?.estado ? 'Volver a conectar mi WhatsApp Business' : 'Conectar mi WhatsApp Business'}
            </button>
            {sdk === 'fallo' && <span style={{ ...pMuted, color: 'var(--negative)', alignSelf: 'center' }}>No se pudo cargar el SDK de Facebook (bloqueador o red).</span>}
          </div>
        )}

        {resultado && (
          <div style={{ display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
            {Object.entries(resultado.pasos).map(([k, p]) => (
              <div key={k} style={fila}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ color: p.estado === 'ok' ? 'var(--positive)' : 'var(--negative)', overflowWrap: 'anywhere' }}>
                  {p.estado === 'ok' ? 'ok' : p.estado === 'sin_pedir' ? `sin pedir: ${p.motivo ?? ''}` : `falló${p.error?.mensaje ? `: ${p.error.mensaje}` : p.motivo ? `: ${p.motivo}` : ''}`}
                </span>
              </div>
            ))}
            {resultado.avisos.map((a) => <p key={a} style={{ ...pMuted, color: 'var(--warning)' }}>{a}</p>)}
          </div>
        )}
      </div>
    </Bloque>
  )
}
