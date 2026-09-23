'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Phone } from 'lucide-react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import WhatsappLead from '../WhatsappLead'
import { eur } from '@/lib/dinero'
import {
  MOTIVOS_PERDIDA_UI,
  RESULTADOS_LLAMADA_UI,
  colaLlamadas,
  guionLlamada,
  rotuloCanal,
  type LeadVencimiento,
  type LeadsVencimientos,
  type ResultadoLlamadaUI,
} from '@/lib/seguimiento-asegura'

type Envio = { estado: 'idle' } | { estado: 'enviando' } | { estado: 'error'; motivo: string } | { estado: 'hecho'; resultado: ResultadoLlamadaUI }

const AMBIGUO = 'No se ha podido confirmar si se guardó: abre su seguimiento para verlo antes de repetirlo.'

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}
function masDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
}

export default function LlamadaClient() {
  const [datos, setDatos] = useState<LeadsVencimientos | null>(null)
  // La cola se congela al cargar: registrar una llamada no puede reordenar la lista bajo el dedo.
  const [cola, setCola] = useState<LeadVencimiento[] | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    fetch('/api/correduria/leads-competencia?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((d: LeadsVencimientos) => {
        setDatos(d)
        if (d.estado === 'ok') setCola(colaLlamadas(d.leads))
      })
      .catch(() => setDatos({ estado: 'error', motivo: 'red' }))
  }, [])

  const volver = <Link href="/correduria/vencimientos?c=leads" aria-label="Volver a Vencimientos" style={{ ...btnStyle('secundario'), width: 44, padding: 0 }}><ArrowLeft size={18} strokeWidth={1.75} /></Link>
  const marco = (cabecera: string, cuerpo: React.ReactNode) => (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 560, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {volver}
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>{cabecera}</span>
      </header>
      {cuerpo}
    </div>
  )

  if (datos === null) return marco('Modo llamada', <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cargando la lista de hoy…</p>)
  if (datos.estado === 'sin_configurar') return marco('Modo llamada', <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No se puede leer la lista: falta conectar el puerto con central-asegura. No significa que no haya a quién llamar.</p>)
  if (datos.estado === 'error') return marco('Modo llamada', <p style={{ fontSize: 13, color: 'var(--negative)', margin: 0 }}>No se ha podido leer la lista ({datos.motivo}). No significa que no haya a quién llamar.</p>)
  if (!cola || cola.length === 0) {
    return marco('Modo llamada', <p style={{ fontSize: 14, margin: 0 }}>Hoy no toca llamar a nadie: ningún lead con teléfono tiene una llamada pendiente para hoy. <Link href="/correduria/vencimientos?c=leads">Ver todos los leads</Link></p>)
  }
  if (i >= cola.length) {
    return marco(`Lista de hoy · ${cola.length} de ${cola.length}`, (
      <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Lista de hoy terminada.</p>
        <Link href="/correduria/vencimientos?c=leads" style={{ ...btnStyle('primario'), justifySelf: 'start' }}>Volver a Vencimientos</Link>
      </section>
    ))
  }
  return marco(`Llamada ${i + 1} de ${cola.length} · lista de hoy`, <Ficha key={cola[i].oportunidadId} l={cola[i]} onSiguiente={() => setI(n => n + 1)} />)
}

function Ficha({ l, onSiguiente }: { l: LeadVencimiento; onSiguiente: () => void }) {
  const hoy = hoyMadrid()
  const [elegido, setElegido] = useState<ResultadoLlamadaUI | null>(null)
  const [nota, setNota] = useState('')
  const [volverEl, setVolverEl] = useState(masDias(hoy, 3))
  const [motivo, setMotivo] = useState('')
  const [envio, setEnvio] = useState<Envio>({ estado: 'idle' })
  const guion = useMemo(() => guionLlamada(l), [l])

  const valido = elegido !== null
    && (elegido !== 'otro_dia' || volverEl > hoy)
    && (elegido !== 'no_interesa' || (motivo !== '' && (motivo !== 'otro' || nota.trim() !== '')))

  async function guardar() {
    if (!elegido || !valido) return
    setEnvio({ estado: 'enviando' })
    try {
      const r = await fetch('/api/correduria/oportunidad/llamada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oportunidadId: l.oportunidadId,
          resultado: elegido,
          nota: nota.trim() || null,
          volverEl: elegido === 'otro_dia' ? volverEl : undefined,
          motivo: elegido === 'no_interesa' ? motivo : undefined,
        }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; causa?: string } | null
      if (r.ok && j?.estado === 'ok') {
        if (elegido === 'quiere_precio') return setEnvio({ estado: 'hecho', resultado: elegido })
        return onSiguiente()
      }
      if (r.status === 502 || j?.motivo === 'red') return setEnvio({ estado: 'error', motivo: AMBIGUO })
      setEnvio({ estado: 'error', motivo: j?.motivo ?? j?.causa ?? `No se ha podido guardar (HTTP ${r.status}).` })
    } catch {
      setEnvio({ estado: 'error', motivo: AMBIGUO })
    }
  }

  const contexto = [
    l.fueCliente === true ? 'Fue cliente nuestro' : l.fueCliente === false ? 'Nunca fue cliente' : null,
    l.respondioAntes ? 'respondió a un contacto anterior' : null,
    `${l.intentos} de 3 intentos`,
  ].filter(Boolean).join(' · ')

  if (envio.estado === 'hecho') {
    return (
      <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Anotado: {l.cliente ?? 'el lead'} quiere precio.</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Pasa a «Interesado» y tienes una tarea para preparar la comparativa en 2 días.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/correduria/oportunidad/${l.oportunidadId}`} style={btnStyle('secundario')}>Abrir su seguimiento</Link>
          <button type="button" style={btnStyle('primario')} onClick={onSiguiente}>Siguiente llamada</button>
        </div>
      </section>
    )
  }

  return (
    <>
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{l.cliente ?? '(ficha sin nombre)'}</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{contexto}</span>
      </div>

      {l.telefono && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={`tel:${l.telefono.replace(/\s+/g, '')}`} style={{ ...btnStyle('primario'), minHeight: 52, fontSize: 16, gap: 8, flex: '1 1 auto' }}>
            <Phone size={20} strokeWidth={1.75} /> Llamar · {l.telefono}
          </a>
          {/* Si no coge, el WhatsApp con el mensaje ya escrito (solo a quien fue cliente). */}
          <WhatsappLead lead={l} />
        </div>
      )}

      <section style={{ ...cardStyle, display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Lo que le vence</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {l.ramo ?? 'Ramo sin dato'} · {l.aseguradora ?? 'compañía sin dato'} (otra compañía)
          </span>
          <Badge tono="aviso">fecha estimada</Badge>
        </div>
        <span style={{ fontSize: 14 }}>Aniversario ~{fechaLarga(l.vencimientoEstimado)} · en {l.dias} d · {l.prima === null ? 'prima sin dato' : eur(l.prima)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sale de una póliza antigua: confírmala en la llamada. Canal: {rotuloCanal(l.canal)}.</span>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Guion</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 14 }}>
          {guion.map((g, k) => <li key={k}>{g}</li>)}
        </ol>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <h2 style={TITULO}>¿Cómo ha ido?</h2>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {RESULTADOS_LLAMADA_UI.map(r => (
            <button key={r.valor} type="button" aria-pressed={elegido === r.valor} onClick={() => setElegido(r.valor)}
              style={{ ...btnStyle(elegido === r.valor ? 'primario' : 'secundario'), minHeight: 48 }}>
              {r.rotulo}
            </button>
          ))}
        </div>

        {elegido === 'otro_dia' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Volver a llamarle el</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 3, 7].map(n => (
                <button key={n} type="button" aria-pressed={volverEl === masDias(hoy, n)} onClick={() => setVolverEl(masDias(hoy, n))}
                  style={btnStyle(volverEl === masDias(hoy, n) ? 'primario' : 'secundario')}>
                  {n === 1 ? 'Mañana' : n === 7 ? 'En una semana' : `En ${n} días`}
                </button>
              ))}
              <input type="date" value={volverEl} min={masDias(hoy, 1)} max={masDias(hoy, 60)} onChange={e => setVolverEl(e.target.value)}
                style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px', fontSize: 14 }} />
            </div>
          </div>
        )}

        {elegido === 'no_interesa' && (
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            <legend style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>¿Por qué? Se aparca hasta el año que viene y vuelve sola.</legend>
            {MOTIVOS_PERDIDA_UI.map(m => (
              <label key={m.valor} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 10, border: `1px solid ${motivo === m.valor ? 'var(--primary)' : 'var(--border)'}`, fontSize: 14 }}>
                <input type="radio" name="motivo" value={m.valor} checked={motivo === m.valor} onChange={() => setMotivo(m.valor)} />
                {m.rotulo}
              </label>
            ))}
          </fieldset>
        )}

        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          Nota {elegido === 'no_interesa' && motivo === 'otro' ? '(obligatoria con «Otro»)' : '(opcional)'}
          <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)} maxLength={500}
            style={{ borderRadius: 10, border: '1px solid var(--border)', padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={!valido || envio.estado === 'enviando'} onClick={() => void guardar()} style={{ ...btnStyle('primario'), flex: '1 1 200px' }}>
            {envio.estado === 'enviando' ? 'Guardando…' : 'Guardar y siguiente'}
          </button>
          <button type="button" disabled={envio.estado === 'enviando'} onClick={onSiguiente} style={btnStyle('secundario')}>Saltar</button>
        </div>
        {envio.estado === 'error' && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{envio.motivo}</p>}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Cada resultado deja escrito el siguiente paso: «Quiere precio» lo pasa a interesado con una tarea para la comparativa;
          «Llamar otro día» agenda la rellamada; «No contesta» suma un intento; «No le interesa» lo aparca un año con su motivo.
        </span>
      </section>
    </>
  )
}

const TITULO: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }
