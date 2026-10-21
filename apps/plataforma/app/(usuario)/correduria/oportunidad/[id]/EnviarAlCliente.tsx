'use client'

// «Enviar al cliente» (21/10/2026): junto al presupuesto generado. Tres salidas, NINGUNA sale sola:
//   1. Copiar enlace: pide a asegura el enlace con su código (anota `enlace_generado`) y copia el MENSAJE (enlace + código)
//      al portapapeles; si el navegador no deja, se enseña para copiarlo a mano.
//   2. WhatsApp: abre el chat del tomador (`wa.me/<móvil>` si hay uno válido; si no, sin número) con el texto de marca.
//      Lo manda Alberto; luego «Ya lo he mandado» lo sella como enviado.
//   3. Correo: el envío de siempre (`avisar` por email, con confirmación); solo si el tomador tiene correo.
//   4. (21/10/2026) Sin correo del tomador: a una PERSONA DE CONTACTO que Alberto elige entre las elegibles (dueño,
//      administrador o representante, o autorizada a ver sus pólizas, con correo). Los no elegibles se listan con su
//      porqué. asegura vuelve a comprobar la regla al enviar: este selector no autoriza nada.
// Botones ≥44 px, en rejilla que baja a una columna en 320 px.

import { useCallback, useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { avisoRotacion, leerPresupuestoEnLista, textoAviso, type PresupuestoEnLista } from '@/lib/presupuesto-asegura'
import { CONFIRMAR_CORREO, cabeceraDestinatarios, confirmarCorreoContacto, etiquetaContacto, etiquetaDescartado, leerDestinatarios, leerEnlaceAviso, type LecturaDestinatarios } from './enviar-cliente'

type Patch = { status: number; json: unknown }
async function patch(id: string, cuerpo: Record<string, unknown>): Promise<Patch> {
  try {
    const r = await fetch('/api/correduria/presupuesto', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...cuerpo }) })
    return { status: r.status, json: await r.json().catch(() => null) }
  } catch {
    return { status: 0, json: null }
  }
}

export default function EnviarAlCliente({ presupuestoId, clienteId, correo }: { presupuestoId: string; clienteId: string; correo: 'con_email' | 'sin_email' | 'no_se_sabe' }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [manual, setManual] = useState<string | null>(null)
  const [enlaces, setEnlaces] = useState(0)
  // Lo que dice el SERVIDOR de este presupuesto (¿ya tiene enlace?, ¿resumen IA sin revisar?). `null` = no se ha podido leer.
  const [fila, setFila] = useState<PresupuestoEnLista | null>(null)
  const releer = useCallback(async () => {
    try {
      const r = await fetch(`/api/correduria/presupuesto?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as { estado?: string; presupuestos?: unknown[] } | null
      const f = r.ok && j?.estado === 'ok' && Array.isArray(j.presupuestos) ? j.presupuestos.map(leerPresupuestoEnLista).find((x) => x?.id === presupuestoId) ?? null : null
      setFila(f)
    } catch { setFila(null) }
  }, [clienteId, presupuestoId])
  useEffect(() => { void releer() }, [releer])

  // Personas de contacto: solo se miran si el tomador NO tiene correo. `undefined` = leyendo; `null` = no se pudo leer.
  const [destinos, setDestinos] = useState<LecturaDestinatarios | null | undefined>(undefined)
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  useEffect(() => {
    if (correo !== 'sin_email') return
    let vivo = true
    void (async () => {
      try {
        const r = await fetch(`/api/correduria/presupuesto/destinatarios?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
        const l = leerDestinatarios(r.status, await r.json().catch(() => null))
        if (!vivo) return
        setDestinos(l)
        // Con uno solo se deja marcado; con varios, que elija Alberto.
        setElegidoId(l?.estado === 'contactos' && l.elegibles.length === 1 ? l.elegibles[0]!.clienteId : null)
      } catch { if (vivo) setDestinos(null) }
    })()
    return () => { vivo = false }
  }, [correo, clienteId])
  const elegibles = destinos?.estado === 'contactos' ? destinos.elegibles : []
  const descartados = destinos && (destinos.estado === 'contactos' || destinos.estado === 'nadie') ? destinos.noElegibles : []

  async function pedirEnlace(): Promise<ReturnType<typeof leerEnlaceAviso>> {
    // Rotar mata el enlace que ya tenga: lo decide el SERVIDOR (se relee justo antes), no esta sesión.
    await releer()
    const pregunta = avisoRotacionActual()
    if (pregunta && !window.confirm(pregunta)) return null
    const r = await patch(presupuestoId, { accion: 'avisar', canal: 'whatsapp_enlace' })
    const e = leerEnlaceAviso(r.status, r.json)
    if (!e) { setAviso(textoAviso(r.status, r.json)); return null }
    setEnlaces((n) => n + 1)
    void releer()
    return e
  }

  function avisoRotacionActual(): string | null {
    return avisoRotacion(fila)
  }

  async function revisarResumen() {
    if (!window.confirm('¿Has leído el resumen que redactó la IA y das por bueno lo que dice? Desde ahora el cliente verá «revisado por tu corredor».')) return
    setOcupado(true)
    const r = await patch(presupuestoId, { accion: 'revisar_resumen' })
    setOcupado(false)
    const ok = r.status === 200
    setAviso({ ok, texto: ok ? 'Resumen marcado como revisado.' : 'NO se ha podido marcar el resumen como revisado.' })
    void releer()
  }

  async function copiar() {
    setOcupado(true); setAviso(null); setCopiado(false); setManual(null)
    try {
      const e = await pedirEnlace()
      if (!e) return
      try {
        await navigator.clipboard.writeText(e.mensaje)
        setCopiado(true)
        setAviso({ ok: true, texto: 'Mensaje con el enlace y el código copiado. Pégalo donde quieras; cuando lo mandes, pulsa «Ya lo he mandado».' })
      } catch {
        setManual(e.mensaje)
        setAviso({ ok: true, texto: 'El navegador no deja copiar solo: selecciona el texto de abajo y cópialo.' })
      }
    } finally { setOcupado(false) }
  }

  async function whatsapp() {
    // La ventana se abre EN el clic (tras el await, el navegador la bloquea).
    const ventana = window.open('', '_blank')
    setOcupado(true); setAviso(null)
    try {
      const e = await pedirEnlace()
      if (!e) { ventana?.close(); return }
      if (ventana) ventana.location.href = e.whatsapp
      else window.location.href = e.whatsapp
      setAviso({ ok: true, texto: e.conTelefono ? 'Se ha abierto WhatsApp con su chat y el mensaje: revísalo y envíalo tú. Luego pulsa «Ya lo he mandado».' : 'No tiene un móvil válido en la ficha: WhatsApp se abre sin número para que elijas el chat. Luego pulsa «Ya lo he mandado».' })
    } finally { setOcupado(false) }
  }

  async function porCorreo() {
    if (!window.confirm(CONFIRMAR_CORREO)) return
    setOcupado(true); setAviso(null)
    const r = await patch(presupuestoId, { accion: 'avisar', canal: 'email' })
    setOcupado(false)
    setAviso(textoAviso(r.status, r.json))
  }

  async function porCorreoAContacto() {
    const elegido = elegibles.find((e) => e.clienteId === elegidoId)
    if (!elegido) { setAviso({ ok: false, texto: 'Elige primero a qué persona de contacto se le manda.' }); return }
    if (!window.confirm(confirmarCorreoContacto(elegido))) return
    setOcupado(true); setAviso(null)
    const r = await patch(presupuestoId, { accion: 'avisar', canal: 'email', destinatarioClienteId: elegido.clienteId })
    setOcupado(false)
    setAviso(textoAviso(r.status, r.json))
    void releer()
  }

  async function yaMandado() {
    if (!window.confirm('¿Le has mandado ya el mensaje desde tu móvil?')) return
    setOcupado(true)
    const r = await patch(presupuestoId, { accion: 'confirmar_whatsapp' })
    setOcupado(false)
    setAviso(textoAviso(r.status, r.json))
  }

  const boton = { ...btnStyle('secundario'), minHeight: 44, width: '100%' }
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <strong style={{ fontSize: 14 }}>Enviar al cliente</strong>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
        <button type="button" disabled={ocupado} onClick={() => void copiar()} style={boton}>{copiado ? 'Copiado ✓' : 'Copiar enlace'}</button>
        <button type="button" disabled={ocupado} onClick={() => void whatsapp()} style={boton}>WhatsApp</button>
        {correo === 'con_email' && <button type="button" disabled={ocupado} onClick={() => void porCorreo()} style={{ ...btnStyle('primario'), minHeight: 44, width: '100%' }}>Correo…</button>}
      </div>
      {correo === 'sin_email' && (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
            {destinos === undefined ? 'Sin correo en su ficha. Mirando sus personas de contacto…' : cabeceraDestinatarios(destinos)}
          </span>
          {elegibles.length > 0 && (
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 6, minWidth: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Mandárselo por correo a:</legend>
              {elegibles.map((e) => (
                <label key={e.clienteId} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14, overflowWrap: 'anywhere', cursor: 'pointer' }}>
                  <input type="radio" name={`destino-${presupuestoId}`} checked={elegidoId === e.clienteId} onChange={() => setElegidoId(e.clienteId)} style={{ width: 20, height: 20, flex: '0 0 auto' }} />
                  <span style={{ minWidth: 0 }}>{etiquetaContacto(e)} · {e.email}</span>
                </label>
              ))}
              <button type="button" disabled={ocupado || elegidoId === null} onClick={() => void porCorreoAContacto()} style={{ ...btnStyle('primario'), minHeight: 44, width: '100%' }}>
                Correo a la persona de contacto…
              </button>
            </fieldset>
          )}
          {descartados.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 0 }}>
              <span>No pueden recibirlo:</span>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {descartados.map((d) => <li key={d.clienteId} style={{ overflowWrap: 'anywhere' }}>{etiquetaDescartado(d)}</li>)}
              </ul>
            </div>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Al tomador también por WhatsApp o copiando el enlace.</span>
        </div>
      )}
      {correo === 'no_se_sabe' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No se ha podido comprobar su correo: el envío por correo no se ofrece hasta poder leerlo.</span>}
      {fila?.resumenIa === 'sin_revisar' && (
        <button type="button" disabled={ocupado} onClick={() => void revisarResumen()} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>
          He revisado el resumen IA
        </button>
      )}
      {(enlaces > 0 || fila?.estado === 'enlazado') && (
        <button type="button" disabled={ocupado} onClick={() => void yaMandado()} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>Ya lo he mandado</button>
      )}
      {manual && <textarea readOnly value={manual} rows={5} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} onFocus={(e) => e.currentTarget.select()} />}
      {aviso && <span role="status" style={{ fontSize: 13, color: aviso.ok ? 'var(--text)' : 'var(--negative)', overflowWrap: 'anywhere' }}>{aviso.texto}</span>}
    </div>
  )
}
