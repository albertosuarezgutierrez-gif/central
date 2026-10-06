'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Badge, CardHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  ROTULO_ESTADO,
  agruparRenovaciones,
  diferenciaPrima,
  duracion,
  leerRespuestaPanel,
  porcentaje,
  type AlertaTarifa,
  type MetricasPeriodo,
  type PanelTarificador as Panel,
  type Renovacion,
} from '@/lib/tarificador-panel'

const PASO = 20

const fecha = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
}
const importe = (n: number | null) => (n === null ? '—' : eur(n))

const rejilla: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }
const fila: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 4, minWidth: 0 }

export default function PanelTarificador() {
  const [estado, setEstado] = useState<{ cargando: boolean; panel: Panel | null; error: string | null }>({ cargando: true, panel: null, error: null })

  // Recarga sin desmontar: el panel viejo se queda a la vista mientras llega el nuevo.
  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true }))
    try {
      const res = await fetch('/api/correduria/tarificador/panel', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      const r = leerRespuestaPanel(res.status, json)
      setEstado((e) => (r.ok ? { cargando: false, panel: r.panel, error: null } : { cargando: false, panel: e.panel, error: r.mensaje }))
    } catch {
      setEstado((e) => ({ cargando: false, panel: e.panel, error: 'No se ha podido cargar el panel (red).' }))
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const { panel, cargando, error } = estado
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* Alta de compañías/ramos nuevos en el bot: grabar el portal a mano y las fichas de producto. */}
      <nav aria-label="Alta de compañías en el bot" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/correduria/tarificador/grabaciones" style={{ ...btnStyle('secundario'), minHeight: 44, textDecoration: 'none' }}>Grabaciones de portales</Link>
        <Link href="/correduria/tarificador/fichas" style={{ ...btnStyle('secundario'), minHeight: 44, textDecoration: 'none' }}>Fichas de producto</Link>
      </nav>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
          <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        {panel && (
          <>
            <Badge tono={panel.interruptores.rpa ? 'positivo' : 'neutral'}>Bot {panel.interruptores.rpa ? 'encendido' : 'apagado'}</Badge>
            <Badge tono={panel.interruptores.renovaciones ? 'positivo' : 'neutral'}>
              Renovaciones automáticas {panel.interruptores.renovaciones ? `encendidas (máx. ${panel.interruptores.topeDia}/día)` : 'apagadas'}
            </Badge>
          </>
        )}
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, padding: 12, borderRadius: 10, border: '1px solid var(--warning)', color: 'var(--warning)', background: 'var(--warning-bg)' }}>
          {error}{panel ? ' Lo de abajo es la última lectura buena.' : ''}
        </p>
      )}
      {!panel && !error && <p className="muted" style={{ margin: 0 }}>Cargando el panel…</p>}
      {panel && (
        <>
          <Salud d7={panel.metricas.d7} d30={panel.metricas.d30} intervenciones={panel.intervenciones} />
          <Fallos fallos={panel.metricas.fallos} />
          <Renovaciones lista={panel.renovaciones.lista} activas={panel.interruptores.renovaciones} />
          <Alertas alertas={panel.alertasTarifa} />
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Leído el {new Date(panel.generadoEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.</p>
        </>
      )}
    </div>
  )
}

function Periodo({ m }: { m: MetricasPeriodo }) {
  return (
    <div style={fila}>
      <span className="muted" style={{ fontSize: 12 }}>Últimos {m.dias} días</span>
      <strong style={{ fontSize: 22 }}>{porcentaje(m.tasaExito)}</strong>
      <span style={{ fontSize: 12 }}>
        {m.ok} con precio · {m.fallidos} fallidos{m.enCurso ? ` · ${m.enCurso} en curso` : ''}{m.cancelados ? ` · ${m.cancelados} cancelados` : ''}
      </span>
      <span className="muted" style={{ fontSize: 12 }}>Tiempo medio: {duracion(m.tiempoMedioSeg)}</span>
    </div>
  )
}

function Salud({ d7, d30, intervenciones }: { d7: MetricasPeriodo; d30: MetricasPeriodo; intervenciones: Panel['intervenciones'] }) {
  return (
    <section style={cardStyle}>
      <CardHeader title="Salud del bot" sub="Éxito = cotizaciones con precio entre las terminadas (sin contar las que siguen en cola)." />
      <div style={rejilla}>
        <Periodo m={d7} />
        <Periodo m={d30} />
        <div style={fila}>
          <span className="muted" style={{ fontSize: 12 }}>IA que ayuda al bot (30 días)</span>
          {intervenciones.disponible ? (
            <>
              <strong style={{ fontSize: 22 }}>{intervenciones.llamadasIA}</strong>
              <span style={{ fontSize: 12 }}>llamadas en {intervenciones.trabajosConIA} cotizaciones · {intervenciones.intervenciones} anotaciones</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Coste estimado: {intervenciones.costeEstimado === null ? 'no consta' : eur(intervenciones.costeEstimado)}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12 }}>
              {intervenciones.motivo === 'tabla_sin_crear' ? 'Aún no se registra (falta aplicar el SQL del formador).' : 'No se ha podido leer.'}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function Fallos({ fallos }: { fallos: Panel['metricas']['fallos'] }) {
  return (
    <section style={cardStyle}>
      <CardHeader title="Dónde se para (30 días)" sub="Agrupado por paso y por la forma del mensaje." />
      {fallos.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Ningún fallo en los últimos 30 días.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {fallos.map((f) => (
            <li key={`${f.paso}|${f.mensaje}`} style={{ ...fila, gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <Badge tono="aviso">{f.paso}</Badge>
                <p style={{ margin: '6px 0 0', fontSize: 13, overflowWrap: 'anywhere' }}>{f.mensaje}</p>
                <span className="muted" style={{ fontSize: 12 }}>Último: {fecha(f.ultimo)}</span>
              </div>
              <strong>{f.veces}×</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaRenovacion({ r }: { r: Renovacion }) {
  const dif = diferenciaPrima(r.primaActual, r.primaAllianz)
  return (
    <li style={fila}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${r.clienteId}`} style={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>{r.cliente}</Link>
        <Badge tono={r.estado === 'cotizada' ? 'positivo' : r.estado === 'fallida' || r.estado === 'faltan_datos' ? 'aviso' : 'info'}>{ROTULO_ESTADO[r.estado]}</Badge>
      </div>
      <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
        {r.compania}{r.numeroPoliza ? ` · ${r.numeroPoliza}` : ''} · vence el {fecha(r.vencimiento)} ({r.dias} días)
      </span>
      <span style={{ fontSize: 13 }}>
        Actual: <strong>{importe(r.primaActual)}</strong> · Allianz: <strong>{importe(r.primaAllianz)}</strong>
        {dif !== null && (
          <span style={{ color: dif < 0 ? 'var(--positive)' : dif > 0 ? 'var(--negative)' : 'var(--muted)' }}>
            {' '}({dif > 0 ? '+' : ''}{eur(dif)})
          </span>
        )}
      </span>
      {r.estado === 'faltan_datos' && r.faltan.length > 0 && (
        <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Falta: {r.faltan.join(' · ')}</span>
      )}
    </li>
  )
}

function GrupoRenovaciones({ titulo, lista, vacio }: { titulo: string; lista: Renovacion[]; vacio: string }) {
  const [ver, setVer] = useState(PASO)
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{titulo} <span className="muted">({lista.length})</span></h3>
      {lista.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{vacio}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {lista.slice(0, ver).map((r) => <TarjetaRenovacion key={r.polizaId} r={r} />)}
        </ul>
      )}
      {lista.length > ver && (
        <button type="button" onClick={() => setVer((v) => v + PASO)} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>
          Ver más ({lista.length - ver})
        </button>
      )}
    </div>
  )
}

function Renovaciones({ lista, activas }: { lista: Renovacion[]; activas: boolean }) {
  const g = agruparRenovaciones(lista)
  return (
    <section style={cardStyle}>
      <CardHeader
        title="Renovaciones de comunidades (vencen en 45–75 días)"
        sub={activas
          ? 'El bot cotiza en Allianz las que tienen un riesgo completo ya cotizado; una por pasada y con tope diario.'
          : 'Las renovaciones automáticas están apagadas: esto es lo que haría.'}
      />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <GrupoRenovaciones titulo="Cotizadas" lista={g.cotizadas} vacio="Ninguna cotizada en los últimos 30 días." />
        <GrupoRenovaciones titulo="Pendientes" lista={g.pendientes} vacio="Nada pendiente." />
        <GrupoRenovaciones titulo="Faltan datos" lista={g.faltanDatos} vacio="Ninguna: todas tienen un riesgo reutilizable." />
      </div>
    </section>
  )
}

function Alertas({ alertas }: { alertas: AlertaTarifa[] }) {
  const [ver, setVer] = useState(PASO)
  return (
    <section style={cardStyle}>
      <CardHeader title="Cambios de tarifa" sub="Mismo riesgo y modalidad, prima anual distinta (más de un 1 % o de 5 €)." />
      {alertas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin cambios detectados.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {alertas.slice(0, ver).map((a) => (
            <li key={`${a.hash}|${a.producto}|${a.despues.trabajoId}`} style={fila}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{a.producto} · {a.modalidad}</strong>
                <Badge tono={a.diferencia > 0 ? 'negativo' : 'positivo'}>
                  {a.diferencia > 0 ? '+' : ''}{eur(a.diferencia)} ({a.porcentaje.toLocaleString('es-ES')} %)
                </Badge>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{a.etiqueta}</span>
              <span style={{ fontSize: 13 }}>
                {eur(a.antes.prima)} ({fecha(a.antes.fecha)}) → {eur(a.despues.prima)} ({fecha(a.despues.fecha)})
              </span>
            </li>
          ))}
        </ul>
      )}
      {alertas.length > ver && (
        <button type="button" onClick={() => setVer((v) => v + PASO)} style={{ ...btnStyle('sutil'), minHeight: 44, marginTop: 8 }}>
          Ver más ({alertas.length - ver})
        </button>
      )}
    </section>
  )
}
