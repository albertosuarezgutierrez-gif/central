'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  admiteAsignar, admiteMarca, conAsignado, conRevisado, interpretarCorreosCompania, interpretarDocumentosSinAsignar, pideMirar, ROTULO_COMPANIA,
  ROTULO_ESTADO_CORREO, ROTULO_TIPO_CORREO, textoElementoCorreo,
  type LecturaCorreosCompania, type LecturaDocumentosSinAsignar,
} from '@/lib/correduria/correos-compania'
import AsignarCorreo from './AsignarCorreo'
import DocumentosSinAsignar from './DocumentosSinAsignar'
import HistorialSolicitud from './HistorialSolicitud'

const PAGINA = 50
const TITULO: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 }
const AVISO_LECTURA: React.CSSProperties = { ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', display: 'grid', gap: 6, fontSize: 14 }

const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * «Correos de compañía» (14/10/2026): los avisos que el triaje leyó en los correos de las compañías
 * (siniestros, pre-anulaciones, impagos, anulaciones, suplementos) en los últimos 30 días y qué se hizo con
 * cada uno. Los SIN RESOLVER van primero y destacados: la póliza no casó y NO se escribió nada en la cartera.
 * La banda de avisos enlaza aquí (`#correos-compania`). ≤50 + «Ver más»; recarga sin desmontar.
 */
export type CuentaCorreos = { n: number; truncado: boolean; pendientes: number }

/** `sinCabecera`: la pantalla ya pone el título (plegable). `onCuenta`: el contador para ese título (`null` = no leído). */
export default function CorreosCompania({ sinCabecera, onCuenta }: { sinCabecera?: boolean; onCuenta?: (c: CuentaCorreos | null) => void } = {}) {
  const [lectura, setLectura] = useState<LecturaCorreosCompania | null>(null)
  const [cargando, setCargando] = useState(true)
  const [limite, setLimite] = useState(PAGINA)
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set())
  const [falloMarca, setFalloMarca] = useState<string | null>(null)
  // F1 (21/10/2026): adjuntos sin asignar, el panel «Asignar» abierto (uno a la vez) y los historiales desplegados.
  const [documentos, setDocumentos] = useState<LecturaDocumentosSinAsignar | null>(null)
  const [versionDocs, setVersionDocs] = useState(0)
  const [asignando, setAsignando] = useState<string | null>(null)
  const [historiales, setHistoriales] = useState<ReadonlySet<string>>(new Set())
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const r = await fetch('/api/correduria/correos-compania', { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (mia === peticion.current) {
        setLectura(interpretarCorreosCompania(r.status, j))
        const docs = (j as Record<string, unknown> | null)?.documentos
        setDocumentos(docs === undefined ? { estado: 'error', motivo: 'la respuesta no trae los documentos' } : interpretarDocumentosSinAsignar(200, docs))
        setVersionDocs(v => v + 1)
      }
    } catch {
      if (mia === peticion.current) {
        setLectura({ estado: 'error', motivo: 'no se ha podido conectar' })
        setDocumentos({ estado: 'error', motivo: 'no se ha podido conectar' })
      }
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // «Marcar como mirado» / «Deshacer»: PATCH y, si el puerto confirma, se actualiza SOLO esa fila en local
  // (sin recargar ni desmontar la lista). Si falla, la fila queda como estaba y se dice.
  const marcar = useCallback(async (id: string, revisado: boolean) => {
    setFalloMarca(null)
    setEnCurso(p => new Set(p).add(id))
    try {
      const r = await fetch('/api/correduria/correos-compania', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, revisado }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      if (r.status === 200 && j?.estado === 'ok') {
        setLectura(l => (l && l.estado === 'ok' ? { ...l, filas: conRevisado(l.filas, id, revisado) } : l))
        window.dispatchEvent(new Event('correduria:avisos-cambiaron'))
      } else {
        setFalloMarca(r.status === 404 ? 'Ese aviso ya no existe: recarga la lista.' : `No se ha podido guardar (respuesta ${r.status}). Sigue como estaba.`)
      }
    } catch {
      setFalloMarca('No se ha podido guardar (sin conexión). Sigue como estaba.')
    } finally {
      setEnCurso(p => { const n = new Set(p); n.delete(id); return n })
    }
  }, [])

  useEffect(() => {
    onCuenta?.(lectura && lectura.estado === 'ok' ? { n: lectura.filas.length, truncado: lectura.truncado, pendientes: lectura.filas.filter(pideMirar).length } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectura])

  const cabecera = (n: string | null) => (sinCabecera ? null : <h2 style={TITULO}>Correos de compañía{n ? ` · ${n}` : ''}</h2>)

  if (lectura === null) {
    return (
      <section id="correos-compania" aria-label="Correos de compañía" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {cabecera(null)}
        <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{cargando ? 'Cargando…' : ''}</p>
      </section>
    )
  }

  if (lectura.estado !== 'ok') {
    return (
      <section id="correos-compania" aria-label="Correos de compañía" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {cabecera(null)}
        <div role="alert" style={AVISO_LECTURA}>
          <strong>{lectura.estado === 'sin_migracion' ? 'La bandeja aún no está activa: falta aplicar su migración en la BD.' : `No se han podido leer los correos de compañía (${lectura.motivo}).`}</strong>
          <span>Esto no significa que no haya: los avisos siguen llegando por Telegram.</span>
          <div>
            <button type="button" disabled={cargando} onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              {cargando ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const filas = lectura.filas
  const pendientes = filas.filter(pideMirar).length
  return (
    <section id="correos-compania" aria-label="Correos de compañía" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {cabecera(`${filas.length}${lectura.truncado ? '+' : ''}`)}
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        Avisos de las compañías leídos del correo (últimos 30 días).{' '}
        {pendientes > 0
          ? <strong style={{ color: 'var(--negative)' }}>{pendientes} sin resolver: no se ha escrito nada en la cartera.</strong>
          : filas.length > 0 ? 'Nada pendiente de mirar.' : 'No ha llegado ninguno.'}
      </p>
      {lectura.truncado && <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>La lista está recortada: hay más de los que se muestran.</p>}
      {lectura.descartadas > 0 && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          {lectura.descartadas} fila{lectura.descartadas === 1 ? '' : 's'} no se ha podido leer y no aparece{lectura.descartadas === 1 ? '' : 'n'}.
        </p>
      )}
      {falloMarca && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{falloMarca}</p>}
      {cargando && <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Actualizando…</p>}
      {filas.slice(0, limite).map(e => {
        const mirar = pideMirar(e)
        const marcable = admiteMarca(e)
        const ocupado = enCurso.has(e.id)
        const est = ROTULO_ESTADO_CORREO[e.estado]
        return (
          <article key={e.id} style={{
            ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: 14,
            ...(mirar ? { borderColor: 'var(--negative)', background: 'var(--negative-bg)' } : {}),
            ...(marcable && e.revisado ? { opacity: 0.6 } : {}),
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Badge tono={est.tono}>{est.texto}</Badge>
              <Badge tono="neutral">{ROTULO_TIPO_CORREO[e.tipo] ?? e.tipo}</Badge>
              <span style={{ fontWeight: 600 }}>{ROTULO_COMPANIA[e.compania] ?? e.compania}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fechaEs(e.creado)}</span>
            </div>
            <div style={{ fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', minWidth: 0 }}>
              {e.clienteId
                ? <Link href={`/correduria/cliente/${e.clienteId}`} style={{ fontWeight: 700, color: 'var(--primary)', overflowWrap: 'anywhere' }}>{e.cliente ?? 'Cliente sin nombre'}</Link>
                : <span style={{ color: 'var(--muted)' }}>Sin cliente</span>}
              <span style={{ overflowWrap: 'anywhere' }}>{textoElementoCorreo(e)}</span>
              {e.importe !== null && <span>{eur(e.importe)}</span>}
              {e.fechaLimite && <span style={{ fontWeight: 600 }}>vence {fechaEs(e.fechaLimite)}</span>}
            </div>
            <div style={{ fontSize: 13, color: mirar ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>
              {e.resumen ?? (mirar ? 'Sin desenlace: míralo en el correo.' : '')}
              {e.motivo && e.motivo !== e.resumen ? ` — ${e.motivo}` : ''}
            </div>
            {e.tipo === 'solicitud' && (
              <div>
                <button type="button" aria-expanded={historiales.has(e.id)} onClick={() => setHistoriales(p => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n })}
                  style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                  {historiales.has(e.id) ? 'Ocultar historial' : 'Ver historial de la solicitud'}
                </button>
                {historiales.has(e.id) && <HistorialSolicitud id={e.id} />}
              </div>
            )}
            {admiteAsignar(e) && asignando === e.id && (
              <AsignarCorreo
                fila={e}
                onCancelar={() => setAsignando(null)}
                onHecho={(cliente, resumen) => {
                  setAsignando(null)
                  setLectura(l => (l && l.estado === 'ok' ? { ...l, filas: conAsignado(l.filas, e.id, cliente, resumen) } : l))
                  window.dispatchEvent(new Event('correduria:avisos-cambiaron'))
                  // Los adjuntos de ese correo pueden haber pasado a la ficha: se relee la bandeja sin desmontarla.
                  void cargar()
                }}
              />
            )}
            {marcable && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {admiteAsignar(e) && asignando !== e.id && (
                  <button type="button" onClick={() => setAsignando(e.id)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
                    Asignar a cliente / oportunidad
                  </button>
                )}
                {e.revisado ? (
                  <>
                    <strong style={{ fontSize: 13 }}>Mirado</strong>
                    <button type="button" disabled={ocupado} onClick={() => void marcar(e.id, false)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                      {ocupado ? 'Guardando…' : 'Deshacer'}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={ocupado} onClick={() => void marcar(e.id, true)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                    {ocupado ? 'Guardando…' : 'Marcar como mirado'}
                  </button>
                )}
              </div>
            )}
          </article>
        )
      })}
      {filas.length > limite && (
        <div>
          <button type="button" onClick={() => setLimite(l => l + PAGINA)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
            Ver más ({filas.length - limite})
          </button>
        </div>
      )}
      {documentos && <DocumentosSinAsignar key={versionDocs} lectura={documentos} />}
    </section>
  )
}
