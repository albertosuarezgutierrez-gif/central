'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Phone, Search, TriangleAlert } from 'lucide-react'
import { textoPasoLead } from '@central/module-seguros'
import { Badge, PageHeader, btnStyle, type Tono } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  DIAS_SIN_RESPUESTA_LLAMAR,
  ROTULO_ESTADO,
  ROTULO_VENTANA,
  colaLlamadas,
  diasSinRespuesta,
  leadCoincide,
  rotuloCanal,
  tramoLead,
  whatsappDeLead,
  type LeadVencimiento,
  type LeadsVencimientos,
  type RespuestaWhatsappUI,
  type TramoLead,
  type VentanaLead,
} from '@/lib/seguimiento-asegura'
import Renovaciones, { type RespVencimientos } from '../Renovaciones'
import { Ico } from '../iconos'
import RespuestaLead from './RespuestaLead'
import WhatsappLead from './WhatsappLead'

type Carril = 'clientes' | 'leads'
const POR_PAGINA = 50
const VENTANAS_FILTRO: readonly VentanaLead[] = ['menos_30', '30_60', '60_90']
const TRAMOS: readonly { valor: TramoLead; rotulo: string }[] = [
  { valor: 'por_enviar', rotulo: 'Por enviar' },
  { valor: 'esperando', rotulo: 'Esperando respuesta' },
  { valor: 'respondio', rotulo: 'Respondieron' },
]
/** Tras estas respuestas asegura aparca la oportunidad: sale de la lista. */
const RESPUESTAS_QUE_APARCAN: readonly RespuestaWhatsappUI[] = ['no_interesa', 'numero_equivocado', 'baja']

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
  const [tramo, setTramo] = useState<TramoLead>('por_enviar')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const [busqueda, setBusqueda] = useState('')
  // Copia local: al registrar un WhatsApp o una respuesta, el lead cambia de pestaña al momento
  // sin volver a pedir la lista entera al puerto.
  const [leads, setLeads] = useState<LeadVencimiento[]>([])
  useEffect(() => { setLeads(datos?.estado === 'ok' ? datos.leads : []) }, [datos])

  // Con algo en el buscador, los contadores de las pestañas cuentan solo lo que coincide: así se ve
  // en qué pestaña está la persona buscada sin tener que ir mirando una a una.
  const coinciden = useMemo(() => leads.filter(l => leadCoincide(l, busqueda)), [leads, busqueda])
  const porTramo = useMemo(() => {
    const n: Record<TramoLead, number> = { por_enviar: 0, esperando: 0, respondio: 0 }
    for (const l of coinciden) n[tramoLead(l)]++
    return n
  }, [coinciden])

  // Ordenadas por fecha de vencimiento (Alberto, 30/09/2026): primero lo que vence antes.
  const filtrados = useMemo(
    () => coinciden
      .filter(l => tramoLead(l) === tramo && (ventana === null || l.ventana === ventana))
      .sort((a, b) => a.dias - b.dias || b.puntuacion - a.puntuacion),
    [coinciden, tramo, ventana],
  )

  const hoyPorTelefono = useMemo(() => colaLlamadas(leads).length, [leads])

  function trasWhatsapp(id: string) {
    setLeads(ls => ls.map(l => (l.oportunidadId === id
      ? { ...l, intentos: l.intentos + 1, ultimoContactoEn: new Date().toISOString() }
      : l)))
  }

  function trasRespuesta(id: string, r: RespuestaWhatsappUI) {
    setLeads(ls => (RESPUESTAS_QUE_APARCAN.includes(r)
      ? ls.filter(l => l.oportunidadId !== id)
      : ls.map(l => (l.oportunidadId === id
        ? { ...l, respondioAntes: true, estado: r === 'quiere_precio' && l.estado === 'competencia' ? 'en_negociacion' : l.estado }
        : l))))
  }

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
        Personas con su seguro en <b>otra compañía</b>. La fecha es <b>estimada</b> (aniversario de esa póliza): confírmala al
        hablar con ellas. WhatsApp a todos los que tienen teléfono; correo solo a quien fue cliente nuestro (LSSI 21.2).
        {datos.sinCanalPermitido !== null && datos.sinCanalPermitido > 0 && (
          <> Fuera de la lista: <b>{datos.sinCanalPermitido}</b> con solo correo que nunca fueron clientes (no se les puede escribir).</>
        )}
        {datos.truncado && <> <Ico i={TriangleAlert} /> La lista llegó recortada: hay más de los que se ven.</>}
        {datos.descartadas > 0 && <> {datos.descartadas} fila(s) del puerto no se han podido leer.</>}
      </div>

      {hoyPorTelefono > 0 && (
        <Link href="/correduria/vencimientos/llamada" style={{ ...btnStyle('secundario'), justifySelf: 'start', gap: 8 }}>
          <Phone size={18} strokeWidth={1.75} /> Modo llamada · {hoyPorTelefono} para hoy
        </Link>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', maxWidth: 480 }}>
        <Search size={18} strokeWidth={1.75} aria-hidden style={{ color: 'var(--muted)', flex: '0 0 auto' }} />
        <input
          type="search"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setMostrar(POR_PAGINA) }}
          placeholder="Buscar por nombre, teléfono, correo o compañía"
          aria-label="Buscar lead"
          style={{ flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', minHeight: 42 }}
        />
      </label>

      <div role="tablist" aria-label="En qué punto está" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TRAMOS.map(t => (
          <Chip key={t.valor} activo={tramo === t.valor} onClick={() => { setTramo(t.valor); setMostrar(POR_PAGINA) }}>
            {t.rotulo} · {porTramo[t.valor]}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Vence en</span>
        <Chip activo={ventana === null} onClick={() => { setVentana(null); setMostrar(POR_PAGINA) }}>Todos</Chip>
        {VENTANAS_FILTRO.map(v => (
          <Chip key={v} activo={ventana === v} onClick={() => { setVentana(v); setMostrar(POR_PAGINA) }}>
            {ROTULO_VENTANA[v]}
          </Chip>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          {busqueda.trim() !== ''
            ? `Nadie coincide con «${busqueda.trim()}» en esta pestaña y ventana${coinciden.length > 0 ? ': mira las otras pestañas (el número dice cuántos hay en cada una).' : '.'}`
            : tramo === 'por_enviar' ? 'No queda nadie por enviar en esta ventana.' : tramo === 'esperando' ? 'Nadie esperando respuesta en esta ventana.' : 'Nadie ha respondido todavía en esta ventana.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {filtrados.slice(0, mostrar).map(l => (
            <FilaLead key={l.oportunidadId} l={l} onWhatsapp={() => trasWhatsapp(l.oportunidadId)} onRespuesta={r => trasRespuesta(l.oportunidadId, r)} />
          ))}
        </ul>
      )}
      {filtrados.length > mostrar && (
        <button type="button" style={{ ...btnStyle('secundario'), justifySelf: 'start' }} onClick={() => setMostrar(m => m + POR_PAGINA)}>
          Ver más ({filtrados.length - mostrar})
        </button>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Orden: por fecha de vencimiento, lo más cercano primero. Al mandar el WhatsApp el lead pasa a «Esperando respuesta»;
        cuando conteste, apunta qué dijo en «¿Qué respondió?». Si en {DIAS_SIN_RESPUESTA_LLAMAR} días no contesta, se marca para llamarle.
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
        minHeight: 44, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
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

function FilaLead({ l, onWhatsapp, onRespuesta }: { l: LeadVencimiento; onWhatsapp: () => void; onRespuesta: (r: RespuestaWhatsappUI) => void }) {
  const paso = l.canal ? textoPasoLead(l.paso, l.canal, whatsappDeLead(l) !== null) : l.paso.motivo
  const puedeLlamar = l.telefono !== null && l.canal !== 'solo_correo' && l.canal !== 'sin_canal_permitido'
  const tramo = tramoLead(l)
  const sinRespuesta = tramo === 'esperando' ? diasSinRespuesta(l.ultimoContactoEn) : null
  const tocaLlamar = sinRespuesta !== null && sinRespuesta >= DIAS_SIN_RESPUESTA_LLAMAR
  return (
    <li style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center' }}>
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
        {l.estado !== 'competencia' && <Badge tono="info">{ROTULO_ESTADO[l.estado]}</Badge>}
        {tocaLlamar && <Badge tono="aviso">Sin respuesta {sinRespuesta} d · llámale</Badge>}
        {sinRespuesta !== null && !tocaLlamar && <Badge>Enviado hace {sinRespuesta} d</Badge>}
      </div>
      {tramo === 'por_enviar' && (
        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ fontWeight: 500, fontSize: 14 }}>{paso}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{l.paso.motivo}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {puedeLlamar && (
          <a href={`tel:${l.telefono}`} aria-label={`Llamar a ${l.cliente ?? 'este lead'}`} title="Llamar" style={{ ...btnStyle(tocaLlamar ? 'primario' : 'secundario'), width: 44, padding: 0 }}>
            <Phone size={18} strokeWidth={1.75} />
          </a>
        )}
        <WhatsappLead lead={l} onRegistrado={onWhatsapp} />
        <Link href={`/correduria/oportunidad/${l.oportunidadId}`} style={btnStyle('secundario')}>Abrir</Link>
      </div>
      {tramo !== 'por_enviar' && <RespuestaLead oportunidadId={l.oportunidadId} onHecho={onRespuesta} />}
    </li>
  )
}
