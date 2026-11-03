'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ETIQUETA_USO, type UsoInmueble } from '@/lib/patrimonio/usos'

type Unidad = { id: string; alias: string; uso: string; superficieM2: number | null; repartoPorcentaje: number | null }
type Criterio = '' | 'm2' | 'porcentaje'

const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

const MOTIVO: Record<string, string> = {
  sin_criterio: 'Todavía no has elegido cómo repartir: los gastos del edificio se quedan en el edificio y no cuentan en ningún piso.',
  sin_unidades: 'El edificio no tiene unidades todavía.',
  falta_superficie: 'Falta la superficie de alguna unidad: hasta que la pongas, los gastos del edificio no se reparten.',
  falta_porcentaje: 'Falta el porcentaje de alguna unidad: hasta que lo pongas, los gastos del edificio no se reparten.',
  porcentajes_no_suman: 'Los porcentajes tienen que sumar exactamente 100: hasta entonces, los gastos del edificio no se reparten.',
}

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para cambiar este edificio.',
  ya_existe: 'Ya hay una unidad con ese nombre en este edificio.',
  demasiadas_unidades: 'Este edificio ya tiene el máximo de unidades.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
}

const numeroEs = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

/**
 * Unidades de un EDIFICIO sin división horizontal (27/10/2026): lista, «Añadir unidad» y el reparto de los gastos del
 * edificio (m² o %). El servidor busca el edificio y cada unidad DENTRO de lo autorizado (404 si no).
 */
export function UnidadesEdificio({ edificioId, unidades, criterio: criterioInicial, puedeEditar }: { edificioId: string; unidades: Unidad[]; criterio: 'm2' | 'porcentaje' | null; puedeEditar: boolean }) {
  const router = useRouter()
  const [alias, setAlias] = useState('')
  const [m2Nueva, setM2Nueva] = useState('')
  const [criterio, setCriterio] = useState<Criterio>(criterioInicial ?? '')
  const [valores, setValores] = useState<Record<string, { m2: string; pct: string }>>(() =>
    Object.fromEntries(unidades.map((u) => [u.id, { m2: u.superficieM2 === null ? '' : String(u.superficieM2).replace('.', ','), pct: u.repartoPorcentaje === null ? '' : String(u.repartoPorcentaje).replace('.', ',') }])),
  )
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const sumaPct = unidades.reduce((a, u) => a + (numeroEs(valores[u.id]?.pct ?? '') ?? 0), 0)

  async function anadir(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setMensaje(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${edificioId}/unidades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, superficieM2: m2Nueva.trim() === '' ? null : m2Nueva }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; campo?: string }
      if (res.ok) {
        setAlias('')
        setM2Nueva('')
        router.refresh()
        return
      }
      setMensaje({ tipo: 'error', texto: j.error === 'datos_invalidos' ? `Revisa el campo «${j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.') })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No hemos podido conectar. Vuelve a intentarlo.' })
    } finally {
      setEnviando(false)
    }
  }

  async function guardarReparto(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setMensaje(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${edificioId}/reparto`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterio: criterio === '' ? null : criterio,
          // Solo viaja el dato del criterio elegido: guardar «%» no borra los m² (ni al revés).
          unidades:
            criterio === 'm2' ? unidades.map((u) => ({ id: u.id, superficieM2: valores[u.id]?.m2 ?? '' }))
            : criterio === 'porcentaje' ? unidades.map((u) => ({ id: u.id, porcentaje: valores[u.id]?.pct ?? '' }))
            : [],
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; campo?: string; reparte?: boolean; motivo?: string }
      if (res.ok) {
        setMensaje(j.reparte ? { tipo: 'ok', texto: 'Guardado. Los gastos del edificio ya se reparten entre las unidades.' } : { tipo: 'ok', texto: `Guardado. ${MOTIVO[j.motivo ?? ''] ?? ''}` })
        router.refresh()
        return
      }
      setMensaje({ tipo: 'error', texto: j.error === 'datos_invalidos' ? `Revisa el campo «${j.campo === 'porcentaje' ? 'porcentaje' : j.campo === 'superficieM2' ? 'm²' : (j.campo ?? '')}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.') })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No hemos podido conectar. Vuelve a intentarlo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {unidades.length === 0 ? (
        <p style={{ margin: 0 }}>Este edificio todavía no tiene unidades.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {unidades.map((u) => (
            <li key={u.id} style={{ minWidth: 0 }}>
              <Link className="boton-tenue" style={{ width: '100%', minHeight: 44, justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }} href={`/patrimonio/inmueble/${u.id}`}>
                <span style={{ overflowWrap: 'anywhere', textAlign: 'left', minWidth: 0 }}>
                  <strong>{u.alias}</strong>
                  <span className="suave" style={{ display: 'block', fontSize: 13 }}>
                    {u.superficieM2 === null ? 'Superficie: no consta' : `${u.superficieM2.toLocaleString('es-ES')} m²`}
                    {u.repartoPorcentaje !== null ? ` · ${u.repartoPorcentaje.toLocaleString('es-ES')} % del edificio` : ''}
                  </span>
                </span>
                <span className="chip">{ETIQUETA_USO[u.uso as UsoInmueble] ?? u.uso}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && unidades.length > 0 && (
        <form onSubmit={guardarReparto} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <h3 style={{ margin: 0 }}>Reparto de los gastos del edificio</h3>
          <p className="suave" style={{ margin: 0, fontSize: 13 }}>
            El IBI, el seguro y los gastos comunes que anotes en el edificio se imputan a cada unidad con este criterio, para ver la rentabilidad real de cada piso.
          </p>
          <label style={etiqueta}>Criterio
            <select className="campo" value={criterio} disabled={enviando} onChange={(e) => setCriterio(e.target.value as Criterio)}>
              <option value="">Sin elegir (no se reparten)</option>
              <option value="m2">Por los m² de cada unidad</option>
              <option value="porcentaje">Por un porcentaje que fijo yo</option>
            </select>
          </label>
          {criterio !== '' && unidades.map((u) => (
            <label key={u.id} style={etiqueta}>{u.alias} — {criterio === 'm2' ? 'm²' : '%'}
              <input
                className="campo"
                inputMode="decimal"
                value={criterio === 'm2' ? (valores[u.id]?.m2 ?? '') : (valores[u.id]?.pct ?? '')}
                disabled={enviando}
                onChange={(e) => setValores((v) => ({ ...v, [u.id]: { ...(v[u.id] ?? { m2: '', pct: '' }), [criterio === 'm2' ? 'm2' : 'pct']: e.target.value } }))}
              />
            </label>
          ))}
          {criterio === 'porcentaje' && (
            <p className={Math.abs(sumaPct - 100) < 0.005 ? 'suave' : 'aviso-linea'} style={{ margin: 0, fontSize: 13 }}>
              Suman {sumaPct.toLocaleString('es-ES', { maximumFractionDigits: 2 })} % (tienen que sumar 100).
            </p>
          )}
          <div className="acciones">
            <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar reparto'}</button>
          </div>
        </form>
      )}

      {puedeEditar && (
        <form onSubmit={anadir} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <h3 style={{ margin: 0 }}>Añadir unidad</h3>
          <label style={etiqueta}>Nombre (por ejemplo «2º B»)
            <input className="campo" value={alias} maxLength={80} required disabled={enviando} onChange={(e) => setAlias(e.target.value)} />
          </label>
          <label style={etiqueta}>Superficie en m² (opcional)
            <input className="campo" inputMode="decimal" value={m2Nueva} disabled={enviando} onChange={(e) => setM2Nueva(e.target.value)} />
          </label>
          <div className="acciones">
            <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Añadir unidad'}</button>
          </div>
        </form>
      )}
      {mensaje && <p className={mensaje.tipo === 'error' ? 'error-linea' : 'suave'} role={mensaje.tipo === 'error' ? 'alert' : 'status'} style={{ margin: 0 }}>{mensaje.texto}</p>}
    </div>
  )
}
