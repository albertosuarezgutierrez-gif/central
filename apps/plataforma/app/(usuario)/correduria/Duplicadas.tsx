'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CopyX } from 'lucide-react'
import { Badge } from '@/components/ui'
import Bloque from './Bloque'
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
 *   ok con grupos    → bloque destacado con el detalle plegado.
 *   sin_configurar / error → bloque discreto «no se ha podido comprobar».
 *
 * El contador que sube a la cabecera son las pólizas SOBRANTES; `null` cuando
 * no se ha podido mirar, jamás 0 (un 0 ahí diría «comprobado, no hay»).
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; r: RespuestaDuplicados }

export default function Duplicadas({ onContador }: {
  /** Pólizas sobrantes para la cabecera. `null` = no se ha podido saber. */
  onContador?: (n: number | null) => void
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  // Por ref: un handler inline del padre no puede reiniciar la lectura, y el
  // aviso NUNCA sale del cuerpo del render (sería un bucle infinito).
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/duplicados')
      .then(async (res) => interpretarDuplicados(res.status, await res.json().catch(() => null)))
      .catch((): RespuestaDuplicados => ({ estado: 'error', motivo: 'red' }))
      .then((r) => {
        if (!vivo) return
        setEstado({ fase: 'hecho', r })
        // Una lectura → un contador. Cualquier «no se ha podido» sube como null.
        avisar.current?.(r.estado === 'ok' ? polizasSobrantes(r.grupos) : null)
      })
    return () => { vivo = false }
  }, [])

  if (estado.fase === 'cargando') return null
  const r = estado.r

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto'
      : textoMotivoDuplicados(r.motivo)
    // No es «no hay duplicados»: es que no se ha podido mirar. Sin fondo
    // tintado —no consta ninguna alarma— pero dicho en voz alta.
    return (
      <Bloque
        Icono={CopyX}
        titulo="Pólizas duplicadas"
        accion={<Badge tono="aviso">Sin comprobar</Badge>}
        sub={`No se ha podido comprobar (${motivo}). No significa que no haya ninguna duplicada.`}
      >
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, overflowWrap: 'anywhere' }}>
          Hasta que el puerto con asegura responda, la conciliación entre lo emitido y lo que trae
          CIMA hay que mirarla allí.
        </p>
      </Bloque>
    )
  }

  // La única ausencia COMPROBADA de esta pantalla: se ha mirado y no hay.
  if (r.grupos.length === 0) return null

  const n = polizasSobrantes(r.grupos)
  const cruzadas = r.grupos.filter((g) => g.emitidaYCima).length
  return (
    <Bloque
      destacado
      tono="aviso"
      Icono={CopyX}
      titulo={`${n} póliza${n === 1 ? '' : 's'} duplicada${n === 1 ? '' : 's'} en la cartera viva`}
      accion={cruzadas > 0 ? <Badge tono="aviso">{cruzadas} sin casar entre emisión y CIMA</Badge> : undefined}
      sub="Mismo número de póliza en la misma compañía, dos veces vivas. «Sin casar» = emitida por nosotros y traída por CIMA sin unir: hay que unirlas antes de que el cliente reciba dos avisos."
    >
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Ver cuáles
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {r.grupos.map((g) => (
            <li key={`${g.numero}|${g.compania}`} style={{ overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.5 }}>
              <strong>nº {g.numero}</strong> · {g.compania}
              {g.emitidaYCima && (
                <>
                  {' '}
                  <Badge tono="aviso" title="Emitida por nosotros y traída por CIMA sin casar">Sin casar</Badge>
                </>
              )}
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
    </Bloque>
  )
}
