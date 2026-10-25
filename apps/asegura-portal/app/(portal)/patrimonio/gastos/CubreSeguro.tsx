'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { descripcionDeGasto, ETIQUETA_REPARACION, hrefDarParte, type AvisoCubre } from '@/lib/patrimonio/cubre-seguro'

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
const PAGINA = 50

function Aviso({ a }: { a: AvisoCubre }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function descartar() {
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/cubre-seguro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gasto: a.gastoId }) })
      if (res.ok) return router.refresh()
      setError('No hemos podido guardarlo. Inténtalo de nuevo.')
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setOcupado(false)
    }
  }
  const c = a.cobertura
  const seguros = `/patrimonio/inmueble/${a.inmuebleId}#seguros-inmueble`
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ overflowWrap: 'anywhere' }}>
        <strong>{a.concepto}</strong>
        <br />
        <span className="suave" style={{ fontSize: 13 }}>
          {a.inmuebleAlias} · {fechaEs(a.fecha)} · {a.totalCent === null ? 'total sin leer' : eur(a.totalCent / 100)} · {ETIQUETA_REPARACION[a.tipo]}
        </span>
      </span>
      {c.estado === 'cubre' && (
        <p style={{ margin: 0 }}>
          Puede que tu seguro lo cubra{c.compania ? ` (${c.compania})` : ''}. Es un aviso: no sabemos si tu póliza incluye este daño.
        </p>
      )}
      {c.estado === 'sin_seguro' && (
        <p style={{ margin: 0 }}>No vemos seguro de hogar en esta vivienda. <Link href={seguros}>Mirar los seguros del inmueble</Link></p>
      )}
      {c.estado === 'sin_comprobar' && (
        <p className="suave" style={{ margin: 0 }}>No hemos podido comprobar si esta vivienda tiene seguro de hogar en vigor. <Link href={seguros}>Mirar los seguros del inmueble</Link></p>
      )}
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {c.estado === 'cubre' && (
          <Link
            className="boton"
            style={{ minHeight: 44 }}
            href={hrefDarParte({
              polizaValor: c.polizaValor,
              fecha: a.fecha,
              descripcion: descripcionDeGasto({ tipo: a.tipo, concepto: a.concepto, inmuebleAlias: a.inmuebleAlias, fecha: a.fecha }),
            })}
          >
            {c.puedeParte ? 'Dar parte' : 'Ver cómo dar parte'}
          </Link>
        )}
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => void descartar()}>
          {ocupado ? 'Guardando…' : 'No me interesa'}
        </button>
      </div>
    </div>
  )
}

/** «¿Esto lo cubre tu seguro?»: reparaciones confirmadas de los últimos 12 meses sin descartar. ~50 + «Ver más». */
export function CubreSeguro({ avisos }: { avisos: AvisoCubre[] }) {
  const [visibles, setVisibles] = useState(PAGINA)
  const vivos = avisos.filter((a) => !a.descartado)
  if (vivos.length === 0) return null
  return (
    <section className="seccion" id="cubre-seguro" aria-labelledby="cubre-seguro-titulo">
      <h2 id="cubre-seguro-titulo" style={{ margin: 0 }}>¿Esto lo cubre tu seguro?</h2>
      <p className="suave" style={{ marginTop: 4, fontSize: 13 }}>
        Reparaciones que has confirmado y que a veces cubre un seguro de hogar. Un parte enviado no es todavía un siniestro comunicado a la compañía.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {vivos.slice(0, visibles).map((a) => <li key={a.gastoId}><Aviso a={a} /></li>)}
      </ul>
      {vivos.length > visibles && (
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44, marginTop: 8 }} onClick={() => setVisibles((v) => v + PAGINA)}>
          Ver más ({vivos.length - visibles} restantes)
        </button>
      )}
    </section>
  )
}
