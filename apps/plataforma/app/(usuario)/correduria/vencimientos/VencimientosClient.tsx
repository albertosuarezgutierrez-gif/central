'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Phone } from 'lucide-react'
import { textoPasoLead } from '@central/module-seguros'
import { Badge, PageHeader, btnStyle, type Tono } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  ROTULO_ESTADO,
  ROTULO_VENTANA,
  rotuloCanal,
  type LeadVencimiento,
  type LeadsVencimientos,
  type VentanaLead,
} from '@/lib/seguimiento-asegura'
import Renovaciones, { type RespVencimientos } from '../Renovaciones'

type Carril = 'clientes' | 'leads'
const POR_PAGINA = 50
const VENTANAS_FILTRO: readonly VentanaLead[] = ['menos_30', '30_60', '60_90']

function carrilDeUrl(): Carril {
  if (typeof window === 'undefined') return 'clientes'
  return new URLSearchParams(window.location.search).get('c') === 'leads' ? 'leads' : 'clientes'
}

export default function VencimientosClient() {
  const [carril, setCarril] = useState<Carril>('clientes')
  const [clientes, setClientes] = useState<RespVencimientos | null>(null)
  const [leads, setLeads] = useState<LeadsVencimientos | null>(null)

  useEffect(() => {
    setCarril(carrilDeUrl())
    fetch('/api/correduria/vencimientos?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setClientes)
      .catch(() => setClientes({ estado: 'error' } as RespVencimientos))
    fetch('/api/correduria/leads-competencia?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then(setLeads)
      .catch(() => setLeads({ estado: 'error', motivo: 'red' }))
  }, [])

  function elegir(c: Carril) {
    setCarril(c)
    // Sin navegar: remontar volvería a pedir las dos listas al puerto.
    const url = new URL(window.location.href)
    url.searchParams.set('c', c)
    window.history.replaceState(null, '', url)
  }

  const nLeads = leads?.estado === 'ok' ? leads.leads.length : null

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Vencimientos"
          icono={<CalendarClock size={20} strokeWidth={1.75} />}
          sub="Lo que renueva en los próximos 90 días: tus clientes y los leads con su seguro en otra compañía. Nada sale a nadie sin tu OK."
        />
      </div>

      <div role="tablist" aria-label="Carril" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--surface-2, var(--primary-light))', justifySelf: 'start' }}>
        {(['clientes', 'leads'] as const).map(c => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={carril === c}
            onClick={() => elegir(c)}
            style={{
              minHeight: 40, padding: '0 16px', borderRadius: 9, border: 0, cursor: 'pointer',
              fontSize: 14, fontWeight: carril === c ? 600 : 500,
              background: carril === c ? 'var(--surface)' : 'transparent',
              color: carril === c ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {c === 'clientes' ? 'Clientes' : `Leads${nLeads === null ? '' : ` · ${nLeads}`}`}
          </button>
        ))}
      </div>

      {carril === 'clientes' ? <Renovaciones datos={clientes} filtro="todas" /> : <CarrilLeads datos={leads} />}
    </div>
  )
}

function CarrilLeads({ datos }: { datos: LeadsVencimientos | null }) {
  const [ventana, setVentana] = useState<VentanaLead | null>(null)
  const [mostrar, setMostrar] = useState(POR_PAGINA)

  const filtrados = useMemo(
    () => (datos?.estado === 'ok' ? datos.leads.filter(l => ventana === null || l.ventana === ventana) : []),
    [datos, ventana],
  )

  if (datos === null) return <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cargando leads…</p>
  if (datos.estado === 'sin_configurar') {
    return <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Los leads no se pueden leer: falta conectar el puerto con central-asegura. No significa que no haya.</p>
  }
  if (datos.estado === 'error') {
    return <p style={{ fontSize: 13, color: 'var(--negative)', margin: 0 }}>No se han podido leer los leads ({datos.motivo}). No significa que no haya.</p>
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 13, lineHeight: 1.5 }}>
        Personas con su seguro en <b>otra compañía</b>. La fecha es <b>estimada</b> (aniversario de esa póliza): confírmala en la
        primera llamada. Por correo solo a quien fue cliente nuestro (LSSI 21.2); al resto, teléfono.
        {datos.sinCanalPermitido !== null && datos.sinCanalPermitido > 0 && (
          <> Fuera de la lista: <b>{datos.sinCanalPermitido}</b> con solo correo que nunca fueron clientes (no se les puede escribir).</>
        )}
        {datos.truncado && <> ⚠️ La lista llegó recortada: hay más de los que se ven.</>}
        {datos.descartadas > 0 && <> {datos.descartadas} fila(s) del puerto no se han podido leer.</>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Aniversario en</span>
        <Chip activo={ventana === null} onClick={() => { setVentana(null); setMostrar(POR_PAGINA) }}>Todos</Chip>
        {VENTANAS_FILTRO.map(v => (
          <Chip key={v} activo={ventana === v} onClick={() => { setVentana(v); setMostrar(POR_PAGINA) }}>
            {ROTULO_VENTANA[v]} · {datos.porVentana[v]}
          </Chip>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Ningún lead en esta ventana.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {filtrados.slice(0, mostrar).map(l => <FilaLead key={l.oportunidadId} l={l} />)}
        </ul>
      )}
      {filtrados.length > mostrar && (
        <button type="button" style={{ ...btnStyle('secundario'), justifySelf: 'start' }} onClick={() => setMostrar(m => m + POR_PAGINA)}>
          Ver más ({filtrados.length - mostrar})
        </button>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Secuencia: primer contacto a 60 días del aniversario → recordatorio a los 7 → llamada a los 14 → tras 3 intentos,
        se propone aparcar. Solo cuentan los intentos hechos desde aquí. Orden: probabilidad de venta × prima.
      </p>
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      style={{
        minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
        border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
        background: activo ? 'var(--primary-light)' : 'var(--surface)',
        color: activo ? 'var(--primary)' : 'var(--text)', fontWeight: activo ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
}

function tonoCanal(l: LeadVencimiento): Tono {
  if (l.canal === null) return 'neutral'
  if (l.canal === 'solo_telefono') return 'aviso'
  if (l.canal === 'sin_canal_permitido') return 'negativo'
  return 'info'
}

function FilaLead({ l }: { l: LeadVencimiento }) {
  const paso = l.canal ? textoPasoLead(l.paso, l.canal) : l.paso.motivo
  const puedeLlamar = l.telefono !== null && l.canal !== 'solo_correo' && l.canal !== 'sin_canal_permitido'
  return (
    <li style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center' }}>
      <span aria-label={`Prioridad ${l.puntuacion}`} style={{ minWidth: 36, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, background: l.puntuacion >= 70 ? 'var(--primary-light)' : 'var(--surface-2, var(--primary-light))', color: l.puntuacion >= 70 ? 'var(--primary)' : 'var(--muted)' }}>
        {l.puntuacion}
      </span>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 2 }}>
        <Link href={`/correduria/oportunidad/${l.oportunidadId}`} style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', textDecoration: 'none' }}>{l.cliente ?? '(ficha sin nombre)'}</Link>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {l.ramo ?? 'ramo sin dato'}{l.aseguradora ? ` · ${l.aseguradora}` : ''} · {l.prima === null ? 'prima sin dato' : eur(l.prima)}
          {l.fueCliente === true ? ' · fue cliente' : l.fueCliente === false ? ' · nunca fue cliente' : ''}
        </span>
      </div>
      <div style={{ flex: '0 1 150px', display: 'grid', gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: l.dias < 30 ? 'var(--negative)' : 'var(--text)' }}>~{fechaCorta(l.vencimientoEstimado)} · en {l.dias} d</span>
        <span style={{ fontSize: 12, color: 'var(--warning)' }}>estimada</span>
      </div>
      <div style={{ flex: '0 1 170px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge tono={tonoCanal(l)}>{rotuloCanal(l.canal)}</Badge>
        <Badge>{l.intentos} de 3</Badge>
        {l.estado !== 'competencia' && <Badge tono="info">{ROTULO_ESTADO[l.estado]}</Badge>}
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{paso}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{l.paso.motivo}{l.respondioAntes ? ' · respondió antes' : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {puedeLlamar && (
          <a href={`tel:${l.telefono}`} aria-label={`Llamar a ${l.cliente ?? 'este lead'}`} title="Llamar" style={{ ...btnStyle('secundario'), width: 44, padding: 0 }}>
            <Phone size={18} strokeWidth={1.75} />
          </a>
        )}
        <Link href={`/correduria/oportunidad/${l.oportunidadId}`} style={btnStyle(l.paso.accion === 'llamada' ? 'primario' : 'secundario')}>Abrir</Link>
      </div>
    </li>
  )
}
