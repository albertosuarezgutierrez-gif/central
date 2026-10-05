'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Contact, TriangleAlert } from 'lucide-react'
import {
  accionesPermitidas, ETIQUETA_ACCION_REVISION, ETIQUETA_TIPO_REVISION,
  type AccionRevision, type TipoRevisionGoogle,
} from '@central/module-seguros/google-contactos-revision'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { ConIcono } from './iconos'
import { anadirPagina, hayMas, primeraPagina, quitarResuelta, type ListaRevision } from './google-revision-lista'

/**
 * Cola de revisión de la sincronización CRM ↔ Google Contacts (05/10/2026). El CRM manda: lo que
 * se editó en Google ya se pisó y aquí queda lo que había; un contacto nuevo en el grupo es una
 * propuesta de lead. Ningún botón toca Google: «Mantener CRM» sobre un contacto sacado del grupo
 * solo cierra la revisión (no lo vuelve a meter).
 *
 * 🚨 Sin lectura buena no se dice «nada pendiente»: un fallo es un error visible.
 */

type Campos = { nombre: string; apellidos: string; telefono: string | null; email: string | null; grupo: 'cliente' | 'lead' | null }
type Revision = {
  id: string
  tipo: TipoRevisionGoogle
  campos: string[]
  clienteId: string | null
  clienteNombre: string | null
  propuesta: Campos | null
  propuestaIlegible: boolean
  creadoEn: string
}
type Pagina = { revisiones: Revision[]; siguiente: string | null; pendientes: number }

const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
const ETIQUETA_CAMPO: Record<string, string> = { nombre: 'nombre', apellidos: 'apellidos', telefono: 'teléfono', email: 'correo', grupo: 'cliente/lead' }

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function pagina(j: unknown): Pagina | null {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (o.estado !== 'ok' || !Array.isArray(o.revisiones)) return null
  return {
    revisiones: o.revisiones as Revision[],
    siguiente: typeof o.siguiente === 'string' ? o.siguiente : null,
    pendientes: typeof o.pendientes === 'number' ? o.pendientes : o.revisiones.length,
  }
}

export default function GoogleContactosRevision() {
  const [lista, setLista] = useState<ListaRevision<Revision> | null>(null)
  const [modo, setModo] = useState<'cargando' | 'ok' | 'sin_configurar' | 'error'>('cargando')
  const [masCargando, setMasCargando] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<Record<string, { texto: string; forzable?: boolean }>>({})

  const cargar = useCallback(async () => {
    setModo('cargando')
    try {
      const r = await fetch('/api/correduria/google-contactos-revision', { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (r.status === 503 && (j as { estado?: string } | null)?.estado === 'sin_configurar') return setModo('sin_configurar')
      const p = r.ok ? pagina(j) : null
      if (!p) return setModo('error')
      setLista(primeraPagina(p))
      setModo('ok')
    } catch {
      setModo('error')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function verMas() {
    if (!lista?.siguiente) return
    setMasCargando(true)
    setErrorMas(null)
    try {
      const r = await fetch(`/api/correduria/google-contactos-revision?despuesDe=${encodeURIComponent(lista.siguiente)}`, { cache: 'no-store' })
      const p = r.ok ? pagina(await r.json().catch(() => null)) : null
      // Si falla, la lista y el botón SE QUEDAN: no se recarga ni se desmonta lo ya visto.
      if (!p) setErrorMas(`No se ha podido cargar más (HTTP ${r.status}).`)
      else setLista((l) => (l ? anadirPagina(l, p) : primeraPagina(p)))
    } catch {
      setErrorMas('No se ha podido cargar más.')
    } finally {
      setMasCargando(false)
    }
  }

  async function resolver(rev: Revision, accion: AccionRevision, forzar = false) {
    setOcupada(rev.id)
    setAvisos((a) => { const { [rev.id]: _, ...resto } = a; void _; return resto })
    try {
      const r = await fetch('/api/correduria/google-contactos-revision', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: rev.id, accion, ...(forzar ? { forzar: true } : {}) }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; forzable?: boolean } | null
      if (r.ok || (r.status === 409 && j?.estado === 'ya_resuelta')) {
        setLista((l) => (l ? quitarResuelta(l, rev.id) : l))
        return
      }
      const texto = r.status === 409 && j?.estado === 'conflicto'
        ? 'Ese teléfono o correo ya está en otra ficha del CRM. Búscala antes de crear un duplicado.'
        : (j?.motivo ?? `No se ha podido resolver (HTTP ${r.status}).`)
      setAvisos((a) => ({ ...a, [rev.id]: { texto, forzable: r.status === 409 && j?.estado === 'conflicto' && j.forzable === true } }))
    } catch {
      setAvisos((a) => ({ ...a, [rev.id]: { texto: 'No se ha podido resolver. Inténtalo de nuevo.' } }))
    } finally {
      setOcupada(null)
    }
  }

  const titulo = 'Google Contacts: revisión'
  if (modo === 'cargando' && !lista) return <Bloque titulo={titulo} Icono={Contact}><p style={pMuted}>Cargando…</p></Bloque>
  if (modo === 'sin_configurar') {
    return (
      <Bloque titulo={titulo} Icono={Contact} tono="aviso">
        <p style={pMuted}>El puerto con asegura no está conectado. <strong>No significa que no haya nada pendiente.</strong></p>
      </Bloque>
    )
  }
  if (modo === 'error' || !lista) {
    return (
      <Bloque titulo={titulo} Icono={Contact} tono="malo"
        accion={<button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button>}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se ha podido leer la cola. <strong>No significa que no haya nada pendiente.</strong></ConIcono>
        </p>
      </Bloque>
    )
  }
  if (lista.tarjetas.length === 0 && !hayMas(lista)) {
    return <Bloque titulo={titulo} Icono={Contact}><p style={pMuted}>Nada pendiente de revisar.</p></Bloque>
  }

  return (
    <Bloque titulo={titulo} Icono={Contact}
      sub={<>{lista.pendientes} pendiente{lista.pendientes === 1 ? '' : 's'}. El CRM manda: lo editado en Google ya se ha vuelto a pisar y aquí queda lo que había.</>}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {lista.tarjetas.map((rev) => {
          const aviso = avisos[rev.id]
          const p = rev.propuesta
          return (
            <article key={rev.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Badge tono={rev.tipo === 'propuesta_lead' ? 'info' : 'neutral'}>{ETIQUETA_TIPO_REVISION[rev.tipo] ?? rev.tipo}</Badge>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fecha(rev.creadoEn)}</span>
              </div>
              {rev.clienteId && (
                <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                  Ficha: <Link href={`/correduria/cliente/${rev.clienteId}`}>{rev.clienteNombre ?? 'abrir ficha'}</Link>
                </p>
              )}
              {rev.campos.length > 0 && (
                <p style={pMuted}>Cambiado en Google: {rev.campos.map((c) => ETIQUETA_CAMPO[c] ?? c).join(', ')}</p>
              )}
              {p ? (
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 10px', fontSize: 13 }}>
                  <dt style={{ color: 'var(--muted)' }}>En Google</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{[p.nombre, p.apellidos].filter(Boolean).join(' ') || '—'}</dd>
                  <dt style={{ color: 'var(--muted)' }}>Teléfono</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{p.telefono ?? '—'}</dd>
                  <dt style={{ color: 'var(--muted)' }}>Correo</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{p.email ?? '—'}</dd>
                </dl>
              ) : rev.propuestaIlegible ? (
                <p style={{ ...pMuted, color: 'var(--warning)' }}>No se puede leer lo que había en Google (clave de cifrado).</p>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {accionesPermitidas(rev.tipo).map((accion) => (
                  <button key={accion} type="button" disabled={ocupada !== null}
                    onClick={() => void resolver(rev, accion)}
                    style={{ ...btnStyle(accion === 'descartar' ? 'secundario' : 'primario'), minHeight: 44 }}>
                    {ocupada === rev.id ? 'Guardando…' : ETIQUETA_ACCION_REVISION[accion]}
                  </button>
                ))}
              </div>
              {aviso && (
                <div role="alert" style={{ display: 'grid', gap: 6 }}>
                  <p style={{ ...pMuted, color: 'var(--negative)' }}>{aviso.texto}</p>
                  {aviso.forzable && (
                    <button type="button" disabled={ocupada !== null} onClick={() => void resolver(rev, 'aceptar_lead', true)}
                      style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
                      Crear el lead igualmente
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {hayMas(lista) && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={() => void verMas()} disabled={masCargando}
            style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
            {masCargando ? 'Cargando…' : 'Ver más'}
          </button>
          {errorMas && <p role="alert" style={{ ...pMuted, color: 'var(--negative)' }}>{errorMas}</p>}
        </div>
      )}
    </Bloque>
  )
}
