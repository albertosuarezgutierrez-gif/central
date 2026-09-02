'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { interpretarDuplicados, polizasSobrantes, textoMotivoDuplicados, type RespuestaDuplicados } from '@/lib/duplicados-asegura'

/**
 * Aviso de pólizas DUPLICADAS en la cartera viva: dos filas vivas con el mismo
 * número en la misma compañía. Es el guardián de la conciliación
 * Codeoscopic↔CIMA (docs/CORREDURIA-CRM-VISION.md §5): el día que emitamos por
 * Codeoscopic y CIMA traiga la misma póliza sin casarla, se ve aquí antes de
 * que la ficha pinte dos pólizas y el cliente cobre dos avisos.
 *
 * 🚨 Vive FUERA de `CarteraViva` a propósito, como el buscador: ese bloque hace
 * `return` temprano cuando el puerto falla, y anidado dentro este aviso
 * desaparecería justo cuando más falta hace saber si se ha podido comprobar.
 *
 * Tres pintados, nunca silencio salvo en uno:
 *   ok con 0 grupos  → nada (es la única ausencia COMPROBADA).
 *   ok con grupos    → aviso con el detalle plegado.
 *   sin_configurar / error → una línea discreta «no se ha podido comprobar».
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; r: RespuestaDuplicados }

export default function Duplicadas() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/duplicados')
      .then(async (res) => interpretarDuplicados(res.status, await res.json().catch(() => null)))
      .catch((): RespuestaDuplicados => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setEstado({ fase: 'hecho', r }) })
    return () => { vivo = false }
  }, [])

  if (estado.fase === 'cargando') return null
  const r = estado.r

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto'
      : textoMotivoDuplicados(r.motivo)
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 20px' }} title="No es «no hay duplicados»: es que no se ha podido mirar.">
        duplicados: no se ha podido comprobar ({motivo})
      </div>
    )
  }

  if (r.grupos.length === 0) return null

  const n = polizasSobrantes(r.grupos)
  const cruzadas = r.grupos.filter((g) => g.emitidaYCima).length
  return (
    <div
      style={{
        margin: '8px 0 20px', padding: '10px 14px', borderRadius: 10, fontSize: 13,
        border: '1px solid var(--warning)', background: 'var(--warning-bg)', color: 'var(--text)',
      }}
    >
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 24 }}>
          ⚠️ {n} póliza{n === 1 ? '' : 's'} duplicada{n === 1 ? '' : 's'} en la cartera viva
          {cruzadas > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {cruzadas} sin casar entre emisión y CIMA</span>
          )}
        </summary>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>
          Mismo número de póliza en la misma compañía, dos veces vivas. 🔀 = emitida por nosotros y
          traída por CIMA sin casar: hay que unirlas antes de que el cliente reciba dos avisos.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {r.grupos.map((g) => (
            <li key={`${g.numero}|${g.compania}`} style={{ overflowWrap: 'anywhere' }}>
              {g.emitidaYCima && <span title="Emitida por nosotros y traída por CIMA sin casar">🔀 </span>}
              <strong>nº {g.numero}</strong> · {g.compania}
              <span style={{ color: 'var(--muted)' }}> · {g.polizas.length} pólizas: </span>
              {g.polizas.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link href={`/correduria/cliente/${p.clienteId}`} title={`póliza ${p.id} · ${p.estado.replace(/_/g, ' ')}`}>
                    ficha {p.clienteId.slice(0, 8)}
                  </Link>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({p.confirmadaCima ? 'CIMA' : 'emitida, sin CIMA'})</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
