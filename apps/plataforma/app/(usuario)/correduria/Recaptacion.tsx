'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Target } from 'lucide-react'
import Bloque from './Bloque'
import { Badge, btnStyle } from '@/components/ui'
import { enlaceWhatsappConMensaje } from '@/lib/invitacion-whatsapp'
import { textoMotivoCola, type Cola, type EscrituraRecaptacion, type LeadRecaptacion } from '@/lib/recaptacion-asegura'

/**
 * 🎯 Cola de recaptación: leads del volcado sin fecha de vencimiento, con
 * teléfono o email, que NO son ya cliente vivo por CIMA (esos se trabajan
 * desde su ficha, no aquí). WhatsApp es un enlace manual (sin WABA: solo se
 * registra que Alberto lo abrió, nunca que el cliente lo leyó); el email SÍ
 * lo manda el servidor por Resend, con tracking de apertura/clic.
 * Ver docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
 *
 * Mismo patrón que `Duplicadas.tsx`/`Retencion.tsx`: el contador que sube a
 * la sección es SIEMPRE `null` cuando no se ha podido leer la cola, jamás 0
 * — un 0 aquí diría «no queda nadie a quien recaptar».
 */
export default function Recaptacion({ onContador }: {
  onContador?: (n: number | null) => void
}) {
  const [cola, setCola] = useState<Cola | { estado: 'cargando' }>({ estado: 'cargando' })
  const [ocultarCooldown, setOcultarCooldown] = useState(true)

  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/recaptacion')
      .then((r) => r.json())
      .then((j: Cola) => {
        if (!vivo) return
        setCola(j)
        avisar.current?.(j.estado === 'ok' ? j.leads.filter((l) => !l.enCooldown).length : null)
      })
      .catch(() => {
        if (!vivo) return
        setCola({ estado: 'error', motivo: 'red', causa: null })
        avisar.current?.(null)
      })
    return () => { vivo = false }
  }, [])

  if (cola.estado === 'cargando') {
    return (
      <Bloque titulo="Recaptación" Icono={Target}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</span>
      </Bloque>
    )
  }

  if (cola.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Recaptación" Icono={Target}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. <strong>No lo leas como «no hay leads»</strong>:
          es que desde aquí no se puede mirar.
        </p>
      </Bloque>
    )
  }

  if (cola.estado === 'error') {
    return (
      <Bloque titulo="Recaptación" Icono={Target} tono="malo">
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer la cola: {textoMotivoCola(cola.motivo, cola.causa)}{' '}
          <strong>No significa que no haya leads.</strong>
        </p>
      </Bloque>
    )
  }

  const visibles = ocultarCooldown ? cola.leads.filter((l) => !l.enCooldown) : cola.leads
  const hayTrabajo = visibles.length > 0

  return (
    <Bloque
      titulo={`Recaptación · ${cola.contadores.totalCandidatos} lead(s) sin vencimiento`}
      Icono={Target}
      sub="Leads del volcado histórico, sin fecha de vencimiento y con contacto, que hoy NO son cliente vivo por CIMA en ningún ramo."
      accion={
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {cola.contadores.contactadosSemana} contactado(s) esta semana
          {' · '}
          {cola.contadores.conAperturaORespuestaSemana} con apertura o respuesta
        </span>
      }
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={ocultarCooldown}
          onChange={(e) => setOcultarCooldown(e.target.checked)}
        />
        Ocultar los contactados en los últimos 14 días
      </label>

      {!hayTrabajo ? (
        <p style={pMuted}>
          {cola.leads.length === 0
            ? 'No hay ningún lead sin vencimiento con contacto pendiente de recaptar.'
            : 'Todos los leads con contacto están en cooldown (contactados en los últimos 14 días).'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px' }}>Cliente</th>
                <th style={{ padding: '6px 8px' }}>Ramo</th>
                <th style={{ padding: '6px 8px' }}>Antes con</th>
                <th style={{ padding: '6px 8px' }}>Contacto</th>
                <th style={{ padding: '6px 8px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => <FilaLead key={l.polizaId} l={l} />)}
            </tbody>
          </table>
        </div>
      )}
    </Bloque>
  )
}

function FilaLead({ l }: { l: LeadRecaptacion }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '6px 8px' }}>
        <Link href={`/correduria/cliente/${l.clienteId}`}>{l.cliente}</Link>
        {l.enCooldown && (
          <>
            {' '}
            <Badge tono="neutral">contactado {l.ultimoContactoEn ?? ''}</Badge>
          </>
        )}
      </td>
      <td style={{ padding: '6px 8px' }}>{l.ramoLegible}</td>
      <td style={{ padding: '6px 8px' }}>{l.aseguradoraAnterior ?? '—'}</td>
      <td style={{ padding: '6px 8px' }}>
        {l.telefono && <span>📞 {l.telefono}</span>}
        {l.email && <span style={{ marginLeft: l.telefono ? 8 : 0 }}>✉️ {l.email}</span>}
        {!l.telefono && !l.email && '—'}
      </td>
      <td style={{ padding: '6px 8px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {l.telefono && <BotonWhatsappRecaptacion lead={l} />}
          {l.email && <BotonEmailRecaptacion lead={l} />}
          <Link href={`/correduria/cliente/${l.clienteId}`} style={btnStyle('sutil', 'sm')}>
            Ficha
          </Link>
        </div>
      </td>
    </tr>
  )
}

function mensajeSugerido(l: LeadRecaptacion): string {
  const conQuien = l.aseguradoraAnterior ? ` que tuviste con ${l.aseguradoraAnterior}` : ''
  return `Hola ${l.cliente.split(' ')[0]}, ¿sigues con tu seguro de ${l.ramoLegible}${conQuien}? Si quieres te paso un precio actualizado sin compromiso.`
}

function textoEscritura(r: EscrituraRecaptacion): string {
  switch (r.estado) {
    case 'ok': return 'Enviado ✓'
    case 'invalido': return `Error: ${r.motivo}`
    case 'no_encontrado': return 'Error: ficha no encontrada'
    case 'sin_configurar': return 'Error: sin configurar'
    case 'error': return `Error: ${r.motivo}`
  }
}

/**
 * Abre WhatsApp con el mensaje sugerido — texto DETERMINISTA, sin pasar por
 * IA: pulirlo significaría esperar una llamada a un modelo antes de poder
 * pulsar el enlace, que rompe el "un clic, se abre WhatsApp". El pulido por
 * IA solo aplica al email, donde el servidor puede tardar 1-2 s sin que se
 * note. El enlace sigue abriendo en pestaña nueva aunque el registro tarde o
 * falle (sin `preventDefault`).
 */
function BotonWhatsappRecaptacion({ lead }: { lead: LeadRecaptacion }) {
  const mensaje = mensajeSugerido(lead)
  const url = enlaceWhatsappConMensaje(lead.telefono!, mensaje)
  if (url === null) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={btnStyle('primario', 'sm')}
      onClick={() => {
        fetch('/api/correduria/recaptacion/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clienteId: lead.clienteId, polizaId: lead.polizaId, mensaje }),
        }).catch(() => {})
      }}
    >
      WhatsApp
    </a>
  )
}

function BotonEmailRecaptacion({ lead }: { lead: LeadRecaptacion }) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | EscrituraRecaptacion>('idle')

  return (
    <button
      type="button"
      style={btnStyle('sutil', 'sm')}
      disabled={estado === 'enviando' || (typeof estado === 'object' && estado.estado === 'ok')}
      title={typeof estado === 'object' && estado.estado !== 'ok' ? textoEscritura(estado) : undefined}
      onClick={async () => {
        setEstado('enviando')
        const asunto = `¿Sigues con tu seguro de ${lead.ramoLegible}?`
        const texto = mensajeSugerido(lead)
        try {
          const res = await fetch('/api/correduria/recaptacion/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clienteId: lead.clienteId, polizaId: lead.polizaId, email: lead.email, asunto, texto }),
          })
          const j = (await res.json().catch(() => null)) as EscrituraRecaptacion | null
          setEstado(j ?? { estado: 'error', motivo: `HTTP ${res.status}` })
        } catch {
          setEstado({ estado: 'error', motivo: 'red' })
        }
      }}
    >
      {estado === 'idle' && 'Email'}
      {estado === 'enviando' && 'Enviando…'}
      {typeof estado === 'object' && (estado.estado === 'ok' ? 'Enviado ✓' : 'Error, reintenta')}
    </button>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
