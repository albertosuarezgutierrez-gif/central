'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * El campo de dirección del alta/edición de cliente, con confirmación contra
 * el callejero oficial del Catastro mientras se teclea (Alberto, 21/09/2026:
 * «hay buscadores donde empiezas a poner calle y número y confirmas»).
 *
 * NO autocompleta letra a letra: el Catastro es un servicio público frágil
 * que corta la conexión si se le pregunta demasiado seguido (ver
 * `@central/core-catastro`), así que se espera una PAUSA de escritura antes
 * de preguntar — no cada tecla. Y solo se pregunta con CP + ciudad puestos:
 * sin dónde acotar la calle, el callejero no sabe a qué "Sierpes" te refieres.
 *
 * El candidato SIEMPRE se ofrece para confirmar con un clic, nunca se
 * escribe solo: el Catastro puede tener la calle con otro nombre oficial, y
 * quien decide si eso es lo que quería escribir es la persona.
 */
const DEBOUNCE_MS = 600
const MIN_CALLE = 4

type Estado =
  | { fase: 'quieto' }
  | { fase: 'preguntando' }
  | { fase: 'candidato'; texto: string }
  | { fase: 'sin_confirmar'; motivo: string }

export default function DireccionConfirmable({
  value,
  onChange,
  codigoPostal,
  ciudad,
  placeholder,
  style,
  mal,
}: {
  value: string
  onChange: (v: string) => void
  codigoPostal: string
  ciudad: string
  placeholder?: string
  style: React.CSSProperties
  mal?: boolean
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })
  const consultaRef = useRef(0)

  useEffect(() => {
    const calle = value.trim()
    const municipio = ciudad.trim()
    if (calle.length < MIN_CALLE || codigoPostal.trim() === '' || municipio === '') {
      setEstado({ fase: 'quieto' })
      return
    }
    setEstado({ fase: 'preguntando' })
    const miTurno = ++consultaRef.current
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ direccion: calle, codigoPostal: codigoPostal.trim(), municipio })
      fetch(`/api/correduria/direccion-confirmar?${qs.toString()}`)
        .then((r) => r.json())
        .then((r: { estado?: string; candidato?: { texto?: string } }) => {
          if (consultaRef.current !== miTurno) return // llegó tarde: ya hay otra pregunta en curso
          if (r.estado === 'candidato' && typeof r.candidato?.texto === 'string') {
            // No ofrecer «confirmar» algo idéntico a lo ya escrito.
            if (normalizar(r.candidato.texto) === normalizar(calle)) {
              setEstado({ fase: 'quieto' })
            } else {
              setEstado({ fase: 'candidato', texto: r.candidato.texto })
            }
          } else if (r.estado === 'ambigua') {
            setEstado({ fase: 'sin_confirmar', motivo: 'El Catastro tiene varias calles con ese nombre en tu municipio: no se puede elegir sola.' })
          } else if (r.estado === 'no_encontrada') {
            setEstado({ fase: 'quieto' }) // silencioso: no toda calle está en el callejero, y no es un error
          } else {
            setEstado({ fase: 'quieto' })
          }
        })
        .catch(() => {
          if (consultaRef.current === miTurno) setEstado({ fase: 'quieto' })
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, codigoPostal, ciudad])

  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} autoComplete="off" />
      {estado.fase === 'preguntando' && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Comprobando con el Catastro…</div>
      )}
      {estado.fase === 'candidato' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>El Catastro dice:</span>
          <button
            type="button"
            onClick={() => {
              onChange(estado.texto)
              setEstado({ fase: 'quieto' })
            }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
              border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--primary)', cursor: 'pointer',
            }}
          >
            {estado.texto} · confirmar
          </button>
        </div>
      )}
      {estado.fase === 'sin_confirmar' && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{estado.motivo}</div>
      )}
      {mal && <div style={{ fontSize: 11, color: 'var(--negative)', marginTop: 4 }}>revisa este campo</div>}
    </div>
  )
}

function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
