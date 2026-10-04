'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CopyX } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import {
  interpretarDuplicados,
  interpretarNoDuplicado,
  polizasSobrantes,
  textoErrorNoDuplicado,
  textoMotivoDuplicados,
  textoOrigenFicha,
  type GrupoDuplicadoPantalla,
  type RespuestaDuplicados,
} from '@/lib/duplicados-asegura'

/**
 * Aviso de pólizas DUPLICADAS: dos fichas sin fusionar con el mismo número (sin
 * separadores ni ceros a la izquierda) en la misma compañía (DGS). Es el MISMO
 * criterio que la señal 🔁 del vigía de la ingesta (`agruparDuplicadas` de
 * `@central/module-seguros`): lo que el vigía cuenta, aquí se puede abrir.
 * Cada ficha dice de dónde viene (CIMA / volcado / emitida…) para decidir, y
 * «No es duplicado» marca el grupo entero con un motivo obligatorio. Es el guardián de la conciliación
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

  return <ListaDuplicadas grupos={r.grupos} onContador={(n) => avisar.current?.(n)} />
}

const clave = (g: GrupoDuplicadoPantalla) => `${g.compania}|${g.numero}`
const TANDA = 50

function ListaDuplicadas({ grupos: iniciales, onContador }: {
  grupos: GrupoDuplicadoPantalla[]
  onContador: (n: number) => void
}) {
  const [grupos, setGrupos] = useState(iniciales)
  const [visibles, setVisibles] = useState(TANDA)

  // Un grupo marcado «no duplicado» sale de la lista SOLO tras el OK del puerto.
  // Actualización funcional: dos marcas a la vez no se pisan.
  const quitar = (k: string) => setGrupos((gs) => gs.filter((g) => clave(g) !== k))

  // El contador de la cabecera sigue a la lista (fuera del updater: sin efectos en render).
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    avisar.current(polizasSobrantes(grupos))
  }, [grupos])

  if (grupos.length === 0) return null
  const n = polizasSobrantes(grupos)
  const cruzadas = grupos.filter((g) => g.emitidaYCima).length
  return (
    <Bloque
      destacado
      tono="aviso"
      Icono={CopyX}
      titulo={`${n} póliza${n === 1 ? '' : 's'} duplicada${n === 1 ? '' : 's'} en la cartera`}
      accion={cruzadas > 0 ? <Badge tono="aviso">{cruzadas} sin casar entre emisión y CIMA</Badge> : undefined}
      sub="Mismo número de póliza (sin separadores ni ceros a la izquierda) en la misma compañía, en fichas sin fusionar. «Sin casar» = emitida por nosotros y traída por CIMA sin unir. Si son pólizas distintas de verdad, márcalo con «No es duplicado»."
    >
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Ver cuáles ({grupos.length} grupo{grupos.length === 1 ? '' : 's'})
        </summary>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          {grupos.slice(0, visibles).map((g) => (
            <GrupoFila key={clave(g)} g={g} onMarcado={() => quitar(clave(g))} />
          ))}
        </ul>
        {grupos.length > visibles && (
          <button type="button" style={{ ...btnStyle('sutil'), marginTop: 8 }} onClick={() => setVisibles((v) => v + TANDA)}>
            Ver más ({grupos.length - visibles})
          </button>
        )}
      </details>
    </Bloque>
  )
}

type Envio = { fase: 'cerrado' } | { fase: 'abierto'; error: string | null } | { fase: 'enviando' }

function GrupoFila({ g, onMarcado }: { g: GrupoDuplicadoPantalla; onMarcado: () => void }) {
  const [envio, setEnvio] = useState<Envio>({ fase: 'cerrado' })
  const [motivo, setMotivo] = useState('')
  const motivoLimpio = motivo.trim()

  const enviar = async () => {
    if (motivoLimpio === '') return
    setEnvio({ fase: 'enviando' })
    const r = await fetch('/api/correduria/duplicados/no-duplicado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: g.polizas.map((p) => p.id), motivo: motivoLimpio }),
    })
      .then(async (res) => interpretarNoDuplicado(res.status, await res.json().catch(() => null)))
      .catch(() => interpretarNoDuplicado(502, { estado: 'error', motivo: 'red' }))
    // Solo un OK del puerto quita el grupo: un error lo deja y lo dice.
    if (r.estado === 'ok') onMarcado()
    else setEnvio({ fase: 'abierto', error: textoErrorNoDuplicado(r.motivo) })
  }

  return (
    <li style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.5 }}>
      <div>
        <strong>nº {g.numero}</strong> · {g.compania}{g.aseguradora ? ` (${g.aseguradora})` : ''}
        {g.emitidaYCima && (
          <>
            {' '}
            <Badge tono="aviso" title="Emitida por nosotros y traída por CIMA sin casar">Sin casar</Badge>
          </>
        )}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
        {g.polizas.map((p) => (
          <li key={p.id}>
            <Link href={`/correduria/cliente/${p.clienteId}`} title={`póliza ${p.id}`} style={{ display: 'inline-block', minHeight: 24 }}>
              ficha {p.clienteId.slice(0, 8)}
            </Link>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {' · '}<strong style={{ color: 'var(--text)', fontWeight: 600 }}>{textoOrigenFicha(p.origen)}</strong>
              {' · '}{p.estado.replace(/_/g, ' ')}
            </span>
          </li>
        ))}
      </ul>
      {envio.fase === 'cerrado' ? (
        <div>
          <button type="button" style={btnStyle('secundario')} onClick={() => setEnvio({ fase: 'abierto', error: null })}>
            No es duplicado
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
            Por qué no es un duplicado (obligatorio)
            <textarea
              value={motivo}
              rows={2}
              maxLength={500}
              disabled={envio.fase === 'enviando'}
              onChange={(ev) => setMotivo(ev.target.value)}
              placeholder="p. ej. clientes distintos, pólizas distintas con el mismo número"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          {envio.fase === 'abierto' && envio.error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{envio.error}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              style={{ ...btnStyle('primario'), opacity: motivoLimpio === '' || envio.fase === 'enviando' ? 0.6 : 1 }}
              disabled={motivoLimpio === '' || envio.fase === 'enviando'}
              onClick={enviar}
            >
              {envio.fase === 'enviando' ? 'Guardando…' : `Marcar las ${g.polizas.length} como distintas`}
            </button>
            <button type="button" style={btnStyle('sutil')} disabled={envio.fase === 'enviando'} onClick={() => setEnvio({ fase: 'cerrado' })}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
