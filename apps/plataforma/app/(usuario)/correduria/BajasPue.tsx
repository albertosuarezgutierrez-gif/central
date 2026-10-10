'use client'

// «Hoy» → bajas de ALLIANZ para tramitar a mano en el PUE (30/09/2026). Ver docs/ALLIANZ-PUE.md.
// Allianz no recibe bajas por correo ni contesta por correo: la intranet deja la anulación `firmada` con
// la ficha preparada; Alberto la teclea en el PUE (nueva pestaña) y pulsa «Ya la he tramitado en el PUE».
// La ficha solo se monta al abrir la baja (lista que puede crecer). `error` ≠ «no hay ninguna».

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, FileX } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import type { BajaPue, LecturaBajasPue } from '@/lib/correduria/bajas-pue'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

const MOSTRAR = 10

async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true } catch { return false }
}

export default function BajasPue({ onContador }: { onContador?: (n: number | null) => void }) {
  const [d, setD] = useState<LecturaBajasPue | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [verTodas, setVerTodas] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/correduria/bajas-pue')
      .then(r => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((x: LecturaBajasPue) => { setD(x); onContador?.(x.estado === 'ok' ? x.bajas.filter(b => !b.esperaEmision).length : null) })
      .catch(() => { setD({ estado: 'error', motivo: 'red' }); onContador?.(null) })
  }, [onContador])
  useEffect(() => { cargar() }, [cargar])

  async function copiarDato(clave: string, texto: string) {
    if (await copiar(texto)) { setCopiado(clave); setTimeout(() => setCopiado(c => (c === clave ? null : c)), 1500) }
    else setAviso({ ok: false, texto: 'No se ha podido copiar: selecciona el texto a mano.' })
  }

  async function tramitada(b: BajaPue) {
    const poliza = b.ficha.campos.find(c => c.etiqueta === 'Nº de póliza')?.valor ?? 'sin nº'
    if (!window.confirm(`¿Confirmas que YA has tramitado en el PUE la baja de ${b.cliente ?? 'este cliente'} (póliza ${poliza})?\n\nSe marcará como comunicada a Allianz.`)) return
    setOcupado(b.anulacionId); setAviso(null)
    try {
      const r = await fetch('/api/correduria/bajas-pue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anulacionId: b.anulacionId }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      setAviso(j?.estado === 'hecho'
        ? { ok: true, texto: 'Marcada como tramitada en el PUE.' }
        : { ok: false, texto: `NO se ha marcado: ${j?.motivo ?? 'no se ha podido hablar con asegura'}. Mira la lista antes de repetir.` })
    } catch {
      setAviso({ ok: false, texto: 'NO se sabe si se ha marcado: no se ha podido hablar con asegura. Mira la lista antes de repetir.' })
    } finally {
      setOcupado(null)
      cargar()
    }
  }

  if (d === null) return null
  if (d.estado !== 'ok') {
    return (
      <p role="alert" style={{ ...NOTA, color: 'var(--negative)' }}>
        No se han podido leer las bajas de Allianz para el PUE ({d.estado === 'sin_configurar' ? 'puerto sin configurar' : d.motivo}). No significa que no haya.
      </p>
    )
  }
  if (d.bajas.length === 0 && !aviso) return null

  const lista = verTodas ? d.bajas : d.bajas.slice(0, MOSTRAR)

  return (
    <Bloque
      titulo={`Bajas de Allianz para tramitar en el PUE · ${d.bajas.length}`}
      sub="Allianz no recibe bajas por correo ni contesta por correo: se tramitan a mano en su extranet y responde en su intranet."
      Icono={FileX}
      tono="aviso"
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {aviso && <p role="status" style={{ ...NOTA, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</p>}
        {lista.map(b => {
          const abiertaEsta = abierta === b.anulacionId
          const poliza = b.ficha.campos.find(c => c.etiqueta === 'Nº de póliza')?.valor
          return (
            <div key={b.anulacionId} style={{ display: 'grid', gap: 6, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <button type="button" onClick={() => setAbierta(abiertaEsta ? null : b.anulacionId)} aria-expanded={abiertaEsta}
                style={{ all: 'unset', cursor: 'pointer', minHeight: 44, display: 'grid', gap: 2, boxSizing: 'border-box' }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {b.cliente ?? '(sin nombre)'} · póliza {poliza ?? 'no consta'}
                </span>
                <span style={{ ...NOTA, overflowWrap: 'anywhere' }}>
                  {b.esperaEmision ? 'Espera a que conste emitida la póliza nueva: aún no se tramita. ' : ''}
                  {b.desde ? `Firmada el ${new Date(b.desde).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}. ` : ''}
                  {abiertaEsta ? 'Toca para cerrar.' : 'Toca para ver la ficha.'}
                </span>
              </button>
              {abiertaEsta && (
                <div style={{ display: 'grid', gap: 4 }}>
                  {b.ficha.campos.map(c => {
                    const clave = `${b.anulacionId}:${c.etiqueta}`
                    return (
                      <div key={c.etiqueta} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, overflowWrap: 'anywhere', flex: '1 1 200px' }}>
                          <span style={{ color: 'var(--muted)' }}>{c.etiqueta}: </span>
                          {c.valor ?? <em style={{ color: 'var(--warning)' }}>no consta, míralo en la ficha</em>}
                        </span>
                        {c.valor !== null && (
                          <button type="button" onClick={() => void copiarDato(clave, c.valor!)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                            <ConIcono i={Copy}>{copiado === clave ? 'Copiado' : 'Copiar'}</ConIcono>
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <button type="button" onClick={() => void copiarDato(`${b.anulacionId}:todo`, b.ficha.texto)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>
                    <ConIcono i={Copy}>{copiado === `${b.anulacionId}:todo` ? 'Copiado' : 'Copiar toda la ficha'}</ConIcono>
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <a href={b.ficha.url} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario'), textDecoration: 'none' }}>
                  <ConIcono i={ExternalLink}>Abrir el PUE</ConIcono>
                </a>
                <button type="button" disabled={ocupado !== null || b.esperaEmision} onClick={() => void tramitada(b)} style={btnStyle('primario')}>
                  Ya la he tramitado en el PUE
                </button>
                <Link href={`/correduria/cliente/${b.clienteId}`} style={ENLACE}>Ver ficha</Link>
                {b.documentoId && <a href={`/api/correduria/documentos/${encodeURIComponent(b.documentoId)}`} style={ENLACE}>Carta firmada (PDF)</a>}
              </div>
            </div>
          )
        })}
        {d.bajas.length > MOSTRAR && (
          <button type="button" onClick={() => setVerTodas(v => !v)} style={{ ...btnStyle('sutil'), justifySelf: 'start' }}>
            {verTodas ? 'Ver menos' : `Ver las ${d.bajas.length - MOSTRAR} restantes`}
          </button>
        )}
      </div>
    </Bloque>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
const ENLACE: React.CSSProperties = { fontSize: 13, minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'var(--primary)' }
