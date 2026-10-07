'use client'
import { useCallback, useEffect, useState } from 'react'
import { Link2, Link2Off, RefreshCw, TriangleAlert, CheckCircle2 } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { resumenError, textoMotivoGoogle } from '@/lib/google-contactos-conexion'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

/**
 * Conexión con Google Contacts desde el panel (05/10/2026). Antes había que abrir a mano
 * `central-asegura.vercel.app/api/google-contactos/conectar` CON sesión de asegura.
 *
 *   · «Conectar Google» / «Reconectar»: el SERVIDOR de plataforma pide a asegura un ticket de un solo
 *     uso (2 min) y devuelve la URL de `conectar`; el navegador va allí en la MISMA pestaña. El
 *     callback vuelve a `/correduria/google-contactos?google=ok|error&motivo=…`.
 *   · «Desconectar»: revoca en Google y borra token y vínculos. Borrar los contactos que CREÓ el CRM
 *     es opcional y va DESMARCADO por defecto.
 *
 * Ningún secreto llega al navegador: solo la URL con el ticket, que no lleva ninguno.
 * 🚨 Sin lectura buena no se dice «no conectada»: un fallo es un error visible.
 */

type Estado = {
  conectada: boolean
  estado?: string
  cuentaGoogle?: string | null
  conectadoEn?: string
  ultimaSyncEn?: string | null
  ultimoError?: string | null
  simuladaEn?: string | null
  syncActivadaEn?: string | null
  revisionesPendientes?: number
}
type Fase = 'cargando' | 'ok' | 'sin_configurar' | 'error'

const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const ETIQUETA_ESTADO: Record<string, { texto: string; tono: 'positivo' | 'negativo' | 'neutral' }> = {
  conectada: { texto: 'Conectada', tono: 'positivo' },
  revocada: { texto: 'Revocada', tono: 'negativo' },
  error: { texto: 'Con error', tono: 'negativo' },
}

export default function GoogleContactosConexion({ onCambio }: { onCambio?: () => void }) {
  const [fase, setFase] = useState<Fase>('cargando')
  const [estado, setEstado] = useState<Estado | null>(null)
  const [ocupado, setOcupado] = useState<'conectar' | 'desconectar' | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [borrarContactos, setBorrarContactos] = useState(false)

  const cargar = useCallback(async () => {
    setFase('cargando')
    try {
      const r = await fetch('/api/correduria/google-contactos-sync', { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as (Estado & { estado?: string }) | null
      if (r.status === 503 && j?.estado === 'sin_configurar') return setFase('sin_configurar')
      if (!r.ok || !j || typeof j.conectada !== 'boolean') return setFase('error')
      setEstado(j)
      setFase('ok')
    } catch {
      setFase('error')
    }
  }, [])

  // Vuelta del callback: `?google=ok|error&motivo=…`. Se enseña y se limpia de la URL (un F5 no
  // debe repetir el aviso).
  useEffect(() => {
    const url = new URL(window.location.href)
    const g = url.searchParams.get('google')
    if (g === 'ok') setAviso({ texto: 'Google Contacts conectado. Ahora simula y, si el informe cuadra, activa.', bien: true })
    else if (g === 'error') setAviso({ texto: textoMotivoGoogle(url.searchParams.get('motivo')), bien: false })
    if (g !== null) {
      url.searchParams.delete('google')
      url.searchParams.delete('motivo')
      window.history.replaceState(null, '', url)
    }
    void cargar()
  }, [cargar])

  async function conectar() {
    setOcupado('conectar')
    setAviso(null)
    try {
      const r = await fetch('/api/correduria/google-contactos-sync', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'conectar' }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; url?: string } | null
      if (r.ok && j?.estado === 'ok' && typeof j.url === 'string') {
        window.location.assign(j.url)
        return // se queda «ocupado» mientras el navegador sale hacia Google
      }
      setAviso({
        texto: j?.estado === 'sin_configurar_google' ? 'Faltan las variables GOOGLE_CONTACTOS_* en asegura.'
          : j?.estado === 'actor_no_humano' ? 'No se reconoció tu sesión al pedir el enlace. Recarga e inténtalo de nuevo.'
          : `No se ha podido preparar la conexión (HTTP ${r.status}).`,
        bien: false,
      })
    } catch {
      setAviso({ texto: 'No se ha podido preparar la conexión. Inténtalo de nuevo.', bien: false })
    }
    setOcupado(null)
  }

  async function desconectar() {
    setOcupado('desconectar')
    setAviso(null)
    try {
      const r = await fetch('/api/correduria/google-contactos-sync', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'desconectar', borrarContactos }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; contactosBorrados?: number | null; aviso?: string | null; revocado?: boolean } | null
      if (r.ok && j?.estado === 'ok') {
        const partes = ['Desconectado.']
        if (j.revocado === false) partes.push('Google no confirmó la revocación: quítale el acceso también desde tu cuenta de Google.')
        if (typeof j.contactosBorrados === 'number') partes.push(`Contactos creados por el CRM borrados: ${j.contactosBorrados.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)}.`)
        if (j.aviso) partes.push(j.aviso)
        setAviso({ texto: partes.join(' '), bien: j.revocado !== false && !j.aviso })
        setConfirmando(false)
        setBorrarContactos(false)
        await cargar()
        onCambio?.()
      } else if (j?.estado === 'sin_conexion') {
        setAviso({ texto: 'No había ninguna conexión que desconectar.', bien: false })
        await cargar()
        onCambio?.()
      } else {
        setAviso({ texto: `No se ha podido desconectar (HTTP ${r.status}). No se ha cambiado nada que sepamos; vuelve a mirar el estado.`, bien: false })
      }
    } catch {
      setAviso({ texto: 'No se ha podido desconectar. Vuelve a mirar el estado antes de reintentar.', bien: false })
    } finally {
      setOcupado(null)
    }
  }

  const titulo = 'Conexión con Google'
  const avisoNodo = aviso && (
    <p role={aviso.bien ? 'status' : 'alert'} style={{ ...pMuted, color: aviso.bien ? 'var(--positive)' : 'var(--negative)' }}>
      <ConIcono i={aviso.bien ? CheckCircle2 : TriangleAlert}>{aviso.texto}</ConIcono>
    </p>
  )

  if (fase === 'cargando') return <Bloque primero titulo={titulo} Icono={Link2}>{avisoNodo}<p style={pMuted}>Cargando…</p></Bloque>
  if (fase === 'sin_configurar') {
    return <Bloque primero titulo={titulo} Icono={Link2} tono="aviso">{avisoNodo}<p style={pMuted}>El puerto con asegura no está conectado.</p></Bloque>
  }
  if (fase === 'error' || !estado) {
    return (
      <Bloque primero titulo={titulo} Icono={Link2} tono="malo"
        accion={<button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario'), minHeight: 44 }}><RefreshCw size={14} aria-hidden /> Reintentar</button>}>
        {avisoNodo}
        <p style={{ ...pMuted, color: 'var(--negative)' }}><ConIcono i={TriangleAlert}>No se ha podido leer el estado de la conexión (no significa que no esté conectada).</ConIcono></p>
      </Bloque>
    )
  }

  const e = estado.estado ?? ''
  const conProblema = estado.conectada && (e === 'revocada' || e === 'error')
  const etiqueta = ETIQUETA_ESTADO[e] ?? { texto: e || 'Desconocido', tono: 'neutral' as const }
  const error = resumenError(estado.ultimoError)
  const fila = { display: 'grid', gridTemplateColumns: 'minmax(0, 9rem) minmax(0, 1fr)', gap: 8, fontSize: 13, alignItems: 'baseline' } as const

  return (
    <Bloque primero titulo={titulo} Icono={Link2} tono={conProblema ? 'malo' : 'neutral'}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {avisoNodo}
        {!estado.conectada ? (
          <p style={pMuted}>No hay ninguna cuenta de Google conectada. Al conectar, Google te pedirá permiso para tus contactos; después vuelves aquí.</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, background: 'var(--surface)', minWidth: 0 }}>
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Cuenta</span><strong style={{ overflowWrap: 'anywhere' }}>{estado.cuentaGoogle ?? '(sin email)'}</strong></div>
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Estado</span><span><Badge tono={etiqueta.tono}>{etiqueta.texto}</Badge></span></div>
            {error && (
              <div style={fila}><span style={{ color: 'var(--muted)' }}>Último error</span>
                <span title={estado.ultimoError ?? undefined} style={{ color: conProblema ? 'var(--negative)' : 'var(--text)', overflowWrap: 'anywhere' }}>{error}</span></div>
            )}
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Última sincronización</span><span>{estado.ultimaSyncEn ? fecha(estado.ultimaSyncEn) : 'Todavía ninguna'}</span></div>
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Simulación</span><span>{estado.simuladaEn ? `Hecha el ${fecha(estado.simuladaEn)}` : 'Sin hacer'}</span></div>
            <div style={fila}><span style={{ color: 'var(--muted)' }}>Sincronización</span>
              <span>{estado.syncActivadaEn ? `Activa desde el ${fecha(estado.syncActivadaEn)}` : 'Sin activar (el cron no escribe nada)'}</span></div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(!estado.conectada || conProblema) && (
            <button type="button" disabled={ocupado !== null} onClick={() => void conectar()} style={{ ...btnStyle('primario'), minHeight: 44 }}>
              <Link2 size={15} strokeWidth={1.75} aria-hidden /> {ocupado === 'conectar' ? 'Abriendo Google…' : estado.conectada ? 'Reconectar Google' : 'Conectar Google'}
            </button>
          )}
          {estado.conectada && !confirmando && (
            <button type="button" disabled={ocupado !== null} onClick={() => setConfirmando(true)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
              <Link2Off size={15} strokeWidth={1.75} aria-hidden /> Desconectar
            </button>
          )}
        </div>

        {estado.conectada && confirmando && (
          <div role="group" aria-label="Confirmar desconexión"
            style={{ border: '1px solid var(--negative)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, background: 'var(--negative-bg)', minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Se revoca el acceso en Google y se borran la conexión y los vínculos. Tu agenda NO se toca salvo que marques la casilla.
              La cola de revisión se conserva.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={borrarContactos} onChange={(ev) => setBorrarContactos(ev.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 auto' }} />
              <span>Borrar también de Google los contactos que CREÓ el CRM (nunca los tuyos ni los adoptados o vinculados).</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={ocupado !== null} onClick={() => void desconectar()}
                style={{ ...btnStyle('primario'), minHeight: 44, background: 'var(--negative)', borderColor: 'var(--negative)' }}>
                {ocupado === 'desconectar' ? 'Desconectando…' : borrarContactos ? 'Desconectar y borrar' : 'Desconectar'}
              </button>
              <button type="button" disabled={ocupado !== null} onClick={() => { setConfirmando(false); setBorrarContactos(false) }} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </Bloque>
  )
}
