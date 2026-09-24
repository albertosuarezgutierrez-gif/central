'use client'
import { useEffect, useRef, useState } from 'react'
import { provinciaPorCp } from '@central/module-seguros'
import { conPiso, etiquetaPlanta, TIENE_NUMERO } from '@/lib/correduria/piso-catastro'

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
  onReferencia,
}: {
  value: string
  onChange: (v: string) => void
  codigoPostal: string
  ciudad: string
  placeholder?: string
  style: React.CSSProperties
  mal?: boolean
  /**
   * Si se pasa, al elegir el piso en el Catastro se entrega su referencia de
   * 20 (y `null` si la persona vuelve a teclear: la dirección ya no es la
   * comprobada). Sin él, el Catastro solo verifica.
   */
  onReferencia?: (referencia: string | null) => void
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })
  const [pisos, setPisos] = useState<Pisos>({ fase: 'quieto' })
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
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          if (pisos.fase !== 'quieto') setPisos({ fase: 'quieto' })
          onReferencia?.(null)
        }}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
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
              fontSize: 12, fontWeight: 600, padding: '10px 14px', minHeight: 44, borderRadius: 999,
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
      <ComprobarPisos
        direccion={value}
        codigoPostal={codigoPostal}
        ciudad={ciudad}
        pisos={pisos}
        setPisos={setPisos}
        elegir={(texto, referencia) => {
          onChange(texto)
          onReferencia?.(referencia)
        }}
      />
      {mal && <div style={{ fontSize: 11, color: 'var(--negative)', marginTop: 4 }}>revisa este campo</div>}
    </div>
  )
}

// ─── Calle + número → los pisos que el Catastro tiene en ese portal ─────────
//
// Alberto (23/09/2026): «una vez el cliente meta calle y número, consultar el
// Catastro y proponer qué piso es; así se verifica que la dirección es
// correcta». A diferencia de la confirmación de la calle de arriba, esta va
// con BOTÓN y no mientras se teclea: son varias consultas encadenadas a un
// servicio que corta si se le pregunta seguido. Nunca bloquea el guardado: un
// número que el Catastro no tiene se AVISA (obra nueva, rural, error suyo).

type Inmueble = { refCompleta: string; planta: string | null; puerta: string | null }
type Pisos =
  | { fase: 'quieto' }
  | { fase: 'preguntando' }
  | { fase: 'elegir'; via: string; inmuebles: Inmueble[] }
  | { fase: 'confirmado'; texto: string }
  | { fase: 'aviso'; texto: string }

function ComprobarPisos({
  direccion,
  codigoPostal,
  ciudad,
  pisos,
  setPisos,
  elegir,
}: {
  direccion: string
  codigoPostal: string
  ciudad: string
  pisos: Pisos
  setPisos: (p: Pisos) => void
  elegir: (texto: string, referencia: string) => void
}) {
  const provincia = provinciaPorCp(codigoPostal.trim())
  const listo = TIENE_NUMERO.test(direccion) && ciudad.trim() !== '' && provincia !== null

  async function consultar() {
    setPisos({ fase: 'preguntando' })
    try {
      const res = await fetch('/api/correduria/catastro', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direccion: direccion.trim(), municipio: ciudad.trim(), provincia }),
      })
      const r = (await res.json().catch(() => null)) as
        | { estado: 'elegir'; via: string; inmuebles: Inmueble[] }
        | { estado: 'ok'; referencia: string; precalificacion?: { datos?: { direccion?: string | null } } }
        | { estado: 'ambigua' | 'no_encontrado' | 'direccion_ilegible' }
        | { estado: 'error'; motivo: string }
        | null
      if (r === null || !res.ok) return setPisos({ fase: 'aviso', texto: 'No se ha podido consultar el Catastro. Puedes guardar igual.' })
      switch (r.estado) {
        case 'elegir':
          return setPisos({ fase: 'elegir', via: r.via, inmuebles: r.inmuebles })
        case 'ok': {
          const oficial = r.precalificacion?.datos?.direccion ?? null
          elegir(direccion, r.referencia)
          return setPisos({ fase: 'confirmado', texto: oficial ? `El Catastro la tiene: ${oficial}.` : 'El Catastro tiene esta dirección.' })
        }
        case 'no_encontrado':
          return setPisos({ fase: 'aviso', texto: 'El Catastro no tiene ese número en esa calle. Revísalo (o es obra nueva): se puede guardar igual.' })
        case 'ambigua':
          return setPisos({ fase: 'aviso', texto: 'Hay varias calles parecidas en ese municipio: escribe el nombre completo de la vía.' })
        case 'direccion_ilegible':
          return setPisos({ fase: 'aviso', texto: 'Hace falta tipo de vía, nombre y número («Calle San Vicente 40»).' })
        case 'error':
          return setPisos({ fase: 'aviso', texto: `No se ha podido consultar el Catastro (${r.motivo}). No significa que la dirección esté mal.` })
      }
    } catch {
      setPisos({ fase: 'aviso', texto: 'No se ha podido consultar el Catastro. Puedes guardar igual.' })
    }
  }

  if (!listo && pisos.fase === 'quieto') return null
  return (
    <div style={{ marginTop: 6 }}>
      {pisos.fase === 'quieto' && (
        <button
          type="button"
          onClick={() => void consultar()}
          style={{ fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
        >
          Comprobar en el Catastro y elegir el piso
        </button>
      )}
      {pisos.fase === 'preguntando' && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Consultando el Catastro…</div>}
      {pisos.fase === 'confirmado' && <div style={{ fontSize: 12, color: 'var(--positive)' }}>✅ {pisos.texto}</div>}
      {pisos.fase === 'aviso' && <div style={{ fontSize: 12, color: 'var(--muted)' }}>⚠️ {pisos.texto}</div>}
      {pisos.fase === 'elegir' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            ✅ El portal existe: {pisos.inmuebles.length} inmuebles en {pisos.via}. ¿Cuál es?
          </div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {pisos.inmuebles.map((i) => (
              <button
                key={i.refCompleta}
                type="button"
                onClick={() => {
                  elegir(conPiso(direccion, i.planta, i.puerta), i.refCompleta)
                  setPisos({ fase: 'confirmado', texto: `Piso comprobado en el Catastro (ref. ${i.refCompleta}).` })
                }}
                style={{ fontSize: 12, minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
              >
                {etiquetaPlanta(i.planta)} · Pta. {i.puerta ?? '?'}
              </button>
            ))}
          </div>
        </div>
      )}
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
