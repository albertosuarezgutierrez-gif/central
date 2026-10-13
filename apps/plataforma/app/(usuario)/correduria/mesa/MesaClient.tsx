'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PERDIDA_UI } from '@/lib/seguimiento-asegura'
import type { Expediente, Expedientes } from '@/lib/correduria/expedientes'
import {
  atajosAparcar, BLOQUES_MESA, cuandoRelativo, fechaCorta, masDias, repartirMesaCompleta, soloDia, TITULO_BLOQUE, VACIO_BLOQUE,
  type BloqueMesa,
} from '@/lib/correduria/mesa'
import Secciones from '../Secciones'
import BuscadorCartera from '../BuscadorCartera'
import BandaAvisos from './BandaAvisos'
import { PerdidasPorRevisar, TareasSueltas } from './BloquesSueltos'

const PAGINA = 50
const AMBIGUO = 'No se ha podido confirmar si se guardó: recarga para verlo antes de repetirlo.'
const ROTULO_CLASE: Record<Expediente['clase'], string> = {
  venta_nueva: 'Venta nueva', mejora_renovacion: 'Mejora de renovación', rescate: 'Rescate',
}
const TONO_CLASE: Record<Expediente['clase'], 'info' | 'aviso' | 'negativo'> = {
  venta_nueva: 'info', mejora_renovacion: 'aviso', rescate: 'negativo',
}

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/** Causa legible de un fallo de lectura (nunca una lista vacía). */
function causaLectura(d: Exclude<Expedientes, { estado: 'ok' }>): string {
  if (d.estado === 'sin_configurar') return 'asegura no está configurada en esta instalación (falta el secreto del puerto).'
  if (d.motivo === 'secreto_rechazado') return 'asegura ha rechazado el secreto del puerto.'
  return d.motivo
}

/** Envía una acción por el proxy de la ficha. Devuelve el texto del error, o `null` si se guardó. */
async function enviar(body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch('/api/correduria/oportunidad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; causa?: string } | null
    if (r.ok && j?.estado === 'ok') return null
    if (r.status === 503 && j?.estado === 'sin_migracion') return 'Falta aplicar la migración de notas: todavía no se pueden guardar.'
    // 502/red: el puerto pudo guardar y cortarse la respuesta. No se invita a repetir a ciegas.
    if (r.status === 502 || j?.motivo === 'red') return AMBIGUO
    return j?.motivo ?? j?.causa ?? `No se ha podido guardar (HTTP ${r.status}).`
  } catch {
    return AMBIGUO
  }
}

export default function MesaClient() {
  const [datos, setDatos] = useState<Expedientes | null>(null)
  const [recargando, setRecargando] = useState(false)
  const [errorRecarga, setErrorRecarga] = useState<string | null>(null)
  const peticion = useRef(0)
  const router = useRouter()

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setRecargando(true)
    try {
      const r = await fetch('/api/correduria/expedientes', { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as Expedientes | null
      if (mia !== peticion.current) return
      if (j && typeof j === 'object' && 'estado' in j) {
        // Una recarga que falla NO borra lo que ya se ve: se avisa aparte.
        if (j.estado !== 'ok' && datos?.estado === 'ok') setErrorRecarga(causaLectura(j))
        else { setDatos(j); setErrorRecarga(null) }
      } else if (datos?.estado === 'ok') setErrorRecarga(`HTTP ${r.status}`)
      else setDatos({ estado: 'error', motivo: `HTTP ${r.status}` })
    } catch {
      if (mia !== peticion.current) return
      if (datos?.estado === 'ok') setErrorRecarga('no se ha podido conectar')
      else setDatos({ estado: 'error', motivo: 'no se ha podido conectar' })
    } finally {
      if (mia === peticion.current) setRecargando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos?.estado])

  useEffect(() => { void cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hoy = datos?.estado === 'ok' && datos.hoy !== '' ? datos.hoy : hoyMadrid()
  const mesa = useMemo(() => (datos?.estado === 'ok' ? repartirMesaCompleta(datos, hoy) : null), [datos, hoy])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <h1 className="solo-lectores">Mi mesa</h1>
      <BuscadorCartera />
      {/* La misma barra que `/correduria`: «Mi mesa» y «Prospección» son pantallas propias, el resto son secciones. */}
      <Secciones activa="mesa" contadores={{}} onCambiar={s => router.push(`/correduria?s=${s}`)} />
      <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Lo que traes entre manos, de todos los clientes.</p>

      {/* Avisos con plazo: arriba y sin esperar a los expedientes (un plazo legal no espera a que cargue la lista). */}
      <BandaAvisos />

      {datos === null && <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Cargando tu mesa…</p>}

      {datos !== null && datos.estado !== 'ok' && (
        <div role="alert" style={{ ...cardStyle, borderColor: 'var(--negative)', display: 'grid', gap: 10 }}>
          <strong style={{ color: 'var(--negative)' }}>No se ha podido leer tu mesa.</strong>
          <span style={{ fontSize: 14 }}>Causa: {causaLectura(datos)} Esto no significa que no tengas nada abierto.</span>
          <div><button type="button" style={btnStyle('secundario')} onClick={() => void cargar()} disabled={recargando}>{recargando ? 'Reintentando…' : 'Reintentar'}</button></div>
        </div>
      )}

      {datos?.estado === 'ok' && mesa && (
        <>
          {errorRecarga && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>
              No se ha podido actualizar ({errorRecarga}); lo que ves puede estar desfasado.{' '}
              <button type="button" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }} onClick={() => void cargar()}>Reintentar</button>
            </p>
          )}
          {(datos.truncado || datos.descartadas > 0) && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
              {datos.truncado ? 'La lista está recortada: hay más expedientes de los que se muestran. ' : ''}
              {datos.descartadas > 0 ? `${datos.descartadas} expediente${datos.descartadas === 1 ? '' : 's'} no se ha podido leer y no aparece${datos.descartadas === 1 ? '' : 'n'}.` : ''}
            </p>
          )}
          {recargando && <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Actualizando…</p>}
          {BLOQUES_MESA.map(b => (
            <Fragment key={b}>
              {/* Lo que no es expediente va antes de «Aparcadas» (que es lo único que va plegado). */}
              {b === 'aparcadas' && <TareasSueltas lectura={mesa.sueltas} truncado={mesa.sueltasTruncado} hoy={hoy} />}
              {b === 'aparcadas' && <PerdidasPorRevisar lectura={mesa.perdidas} conExpediente={mesa.perdidasConExpediente} onCambio={cargar} />}
              <Bloque bloque={b} filas={mesa.bloques[b]} hoy={hoy} onCambio={cargar} />
            </Fragment>
          ))}
        </>
      )}
    </div>
  )
}

function Bloque({ bloque, filas, hoy, onCambio }: { bloque: BloqueMesa; filas: Expediente[]; hoy: string; onCambio: () => Promise<void> }) {
  const plegable = bloque === 'aparcadas'
  const [abierto, setAbierto] = useState(!plegable)
  const [limite, setLimite] = useState(PAGINA)
  const visibles = filas.slice(0, limite)
  return (
    <section aria-label={TITULO_BLOQUE[bloque]} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {plegable ? (
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}
          style={{ ...btnStyle('sutil'), justifyContent: 'flex-start', padding: '0 4px', fontFamily: 'var(--font-titulos, inherit)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          {abierto ? '▾' : '▸'} {TITULO_BLOQUE[bloque]} · {filas.length}
        </button>
      ) : (
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{TITULO_BLOQUE[bloque]} · {filas.length}</h2>
      )}
      {abierto && filas.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{VACIO_BLOQUE[bloque]}</p>}
      {abierto && visibles.map(e => <Fila key={e.id} e={e} bloque={bloque} hoy={hoy} onCambio={onCambio} />)}
      {abierto && filas.length > limite && (
        <div><button type="button" style={btnStyle('secundario')} onClick={() => setLimite(l => l + PAGINA)}>Ver {Math.min(PAGINA, filas.length - limite)} más (quedan {filas.length - limite})</button></div>
      )}
    </section>
  )
}

type Panel = null | 'perder' | 'aparcar' | 'notas'

function Fila({ e, bloque, hoy, onCambio }: { e: Expediente; bloque: BloqueMesa; hoy: string; onCambio: () => Promise<void> }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aparcada = bloque === 'aparcadas'
  const vencida = bloque === 'hoy'
  const puedeGanar = !aparcada && (e.estado === 'en_negociacion' || e.estado === 'pendiente_cliente')

  const ejecutar = async (body: Record<string, unknown>) => {
    setEnviando(true)
    setError(null)
    const err = await enviar({ id: e.id, ...body })
    if (err) { setError(err); setEnviando(false); return }
    setPanel(null)
    await onCambio() // recarga sin desmontar: la fila se queda hasta que llega la lista nueva
    setEnviando(false)
  }

  const pa = e.proximaAccion
  const fechaAccion = soloDia(pa?.fecha ?? null)

  return (
    <article style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, padding: 14, opacity: enviando ? 0.7 : 1 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Link href={`/correduria/cliente/${e.clienteId}`} style={{ fontWeight: 700, color: 'var(--primary)', overflowWrap: 'anywhere' }}>
          {e.cliente ?? 'Cliente sin nombre'}
        </Link>
        {e.ramo && <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {e.ramo}</span>}
        <Badge tono={TONO_CLASE[e.clase]}>{ROTULO_CLASE[e.clase]}</Badge>
        {e.delVolcado && <span title="Viene del volcado del CRM anterior" style={{ fontSize: 11, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 999, padding: '1px 8px' }}>del CRM anterior</span>}
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>{e.prima === null ? '—' : eur(e.prima)}</span>
      </div>

      <div style={{ fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', minWidth: 0 }}>
        {aparcada ? (
          <span style={{ color: 'var(--muted)' }}>
            Vuelve el {fechaCorta(e.aparcadaHasta, hoy)}{e.aparcadaMotivo ? ` · ${e.aparcadaMotivo}` : ''}
          </span>
        ) : pa ? (
          <>
            <span style={{ overflowWrap: 'anywhere' }}>{pa.texto.trim() !== '' ? pa.texto : pa.tipo}</span>
            <span style={{ fontWeight: 600, color: vencida ? 'var(--negative)' : 'var(--muted)' }}>
              {fechaAccion ? `${cuandoRelativo(fechaAccion, hoy)} · ${fechaCorta(fechaAccion, hoy)}` : 'sin fecha'}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Sin próxima acción: nadie la va a mirar si no le pones una</span>
        )}
      </div>

      {e.rescate && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {e.rescate.recibo ? (
            <>
              Recibo {e.rescate.recibo.importe === null ? 'sin importe' : eur(e.rescate.recibo.importe)}
              {e.rescate.recibo.efecto ? ` · efecto ${fechaCorta(e.rescate.recibo.efecto, hoy)}` : ''}
              {e.rescate.recibo.suspensionDesde ? ` · cobertura suspendida desde ${fechaCorta(e.rescate.recibo.suspensionDesde, hoy)}` : ''}
              {e.rescate.recibo.hito ? ` · ${e.rescate.recibo.hito}` : ''}
              {e.rescate.recibo.situacion ? ` · ${e.rescate.recibo.situacion}` : ''}
            </>
          ) : (
            <>No se ha podido localizar el recibo ({e.rescate.tipo === 'anulacion' ? 'anulación' : 'recibo devuelto'}).</>
          )}
        </div>
      )}

      {e.notas && <div title={e.notas} style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notas}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {puedeGanar && <button type="button" disabled={enviando} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }} onClick={() => void ejecutar({ accion: 'ganar' })}>Ganada</button>}
        {!aparcada && <button type="button" disabled={enviando} aria-expanded={panel === 'perder'} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, color: 'var(--negative)' }} onClick={() => setPanel(panel === 'perder' ? null : 'perder')}>Perdida…</button>}
        {!aparcada && <button type="button" disabled={enviando} aria-expanded={panel === 'aparcar'} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} onClick={() => setPanel(panel === 'aparcar' ? null : 'aparcar')}>Aparcar hasta…</button>}
        {aparcada && <button type="button" disabled={enviando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} onClick={() => void ejecutar({ accion: 'reabrir' })}>Traer ya</button>}
        {!aparcada && [3, 7].map(n => (
          <button key={n} type="button" disabled={enviando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} onClick={() => void ejecutar({ accion: 'posponer', dias: n })}>Posponer {n} días</button>
        ))}
        <button type="button" disabled={enviando} aria-expanded={panel === 'notas'} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }} onClick={() => setPanel(panel === 'notas' ? null : 'notas')}>{e.notas ? 'Notas' : 'Añadir nota'}</button>
      </div>

      {panel === 'perder' && <PanelPerder enviando={enviando} onEnviar={ejecutar} />}
      {panel === 'aparcar' && <PanelAparcar enviando={enviando} hoy={hoy} onEnviar={ejecutar} />}
      {panel === 'notas' && <PanelNotas inicial={e.notas ?? ''} enviando={enviando} onEnviar={ejecutar} />}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
    </article>
  )
}

/** Motivos de un toque; «otra compañía» y «otro» piden además una palabra (el puerto la exige). */
function PanelPerder({ enviando, onEnviar }: { enviando: boolean; onEnviar: (b: Record<string, unknown>) => Promise<void> }) {
  const [pide, setPide] = useState<'competidor' | 'otro' | null>(null)
  const [texto, setTexto] = useState('')
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>¿Por qué se pierde?</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MOTIVOS_PERDIDA_UI.map(m => (
          <button key={m.valor} type="button" disabled={enviando} aria-pressed={pide === m.valor}
            style={{ ...btnStyle(pide === m.valor ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}
            onClick={() => {
              if (m.valor === 'competidor' || m.valor === 'otro') { setPide(m.valor); return }
              void onEnviar({ accion: 'perder', motivo: m.valor })
            }}>{m.rotulo}</button>
        ))}
      </div>
      {pide && (
        <form onSubmit={ev => {
          ev.preventDefault()
          const t = texto.trim()
          if (t === '') return
          void onEnviar(pide === 'competidor' ? { accion: 'perder', motivo: 'competidor', competidor: t } : { accion: 'perder', motivo: 'otro', detalle: t })
        }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input value={texto} onChange={ev => setTexto(ev.target.value)} maxLength={pide === 'competidor' ? 120 : 500} aria-label={pide === 'competidor' ? 'Compañía' : 'Explica el motivo'}
            placeholder={pide === 'competidor' ? '¿Con qué compañía?' : 'Explica cuál'}
            style={{ flex: '1 1 200px', minWidth: 0, minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
          <button type="submit" disabled={enviando || texto.trim() === ''} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Marcar perdida</button>
        </form>
      )}
    </div>
  )
}

/** Atajos de un toque + fecha libre. El puerto exige un porqué al aparcar: va uno fijo, sin pedírselo a Alberto. */
function PanelAparcar({ enviando, hoy, onEnviar }: { enviando: boolean; hoy: string; onEnviar: (b: Record<string, unknown>) => Promise<void> }) {
  const [fecha, setFecha] = useState('')
  const max = masDias(hoy, 395)
  const aparcar = (hasta: string) => onEnviar({ accion: 'aparcar', aparcadaHasta: hasta, detalle: 'Aparcada desde Mi mesa' })
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Aparcar hasta… (vuelve sola ese día; máximo 13 meses)</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {atajosAparcar(hoy).map(a => (
          <button key={a.clave} type="button" disabled={enviando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} onClick={() => void aparcar(a.fecha)}>
            {a.rotulo} · {fechaCorta(a.fecha, hoy)}
          </button>
        ))}
      </div>
      <form onSubmit={ev => { ev.preventDefault(); if (fecha > hoy && fecha <= max) void aparcar(fecha) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input type="date" value={fecha} min={masDias(hoy, 1)} max={max} onChange={ev => setFecha(ev.target.value)} aria-label="Otra fecha"
          style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
        <button type="submit" disabled={enviando || !(fecha > hoy && fecha <= max)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Aparcar hasta esa fecha</button>
      </form>
    </div>
  )
}

function PanelNotas({ inicial, enviando, onEnviar }: { inicial: string; enviando: boolean; onEnviar: (b: Record<string, unknown>) => Promise<void> }) {
  const [t, setT] = useState(inicial)
  return (
    <form onSubmit={ev => { ev.preventDefault(); void onEnviar({ accion: 'editar', notas: t.trim() }) }} style={{ display: 'grid', gap: 8 }}>
      <textarea value={t} onChange={ev => setT(ev.target.value)} rows={3} aria-label="Notas del expediente" placeholder="Una nota corta para ti"
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid var(--border)', padding: 10, fontSize: 14, fontFamily: 'inherit' }} />
      <div><button type="submit" disabled={enviando || t.trim() === inicial.trim()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Guardar nota</button></div>
    </form>
  )
}
