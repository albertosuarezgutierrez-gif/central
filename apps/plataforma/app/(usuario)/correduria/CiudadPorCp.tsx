'use client'
import { useEffect, useRef, useState } from 'react'
import { cpCompleto, decidirCiudad } from '@/lib/codigo-postal-auto'

/**
 * Campo «Ciudad» que se rellena solo con el código postal: un municipio → se
 * pone; varios → desplegable para elegir (con «Otra…» por si la tabla no la
 * trae). La ficha tal como se abrió NO se pisa: solo actúa cuando se cambia el
 * CP. Si la ciudad guardada no casa con el CP, se avisa debajo.
 */
type Resp = { municipios: string[] | null } | null
const cache = new Map<string, Promise<Resp>>()

function buscar(cp: string): Promise<Resp> {
  let p = cache.get(cp)
  if (!p) {
    p = fetch(`/api/correduria/codigo-postal?cp=${cp}`)
      .then((r) => (r.ok ? (r.json() as Promise<Resp>) : null))
      .catch(() => null)
    // Un fallo de red no se queda cacheado: el próximo intento vuelve a preguntar.
    p.then((r) => { if (r === null) cache.delete(cp) })
    cache.set(cp, p)
  }
  return p
}

const OTRA = '__otra__'

export default function CiudadPorCp({ cp, ciudad, onCiudad, style }: {
  cp: string
  ciudad: string
  onCiudad: (v: string) => void
  style?: React.CSSProperties
}) {
  const cpAlAbrir = useRef(cp.trim())
  const tocado = useRef(false)
  const ciudadRef = useRef(ciudad)
  ciudadRef.current = ciudad
  const onCiudadRef = useRef(onCiudad)
  onCiudadRef.current = onCiudad
  const [municipios, setMunicipios] = useState<string[] | null>(null)
  const [libre, setLibre] = useState(false)

  useEffect(() => {
    const c = cp.trim()
    if (c !== cpAlAbrir.current) tocado.current = true
    if (!cpCompleto(c)) { setMunicipios(null); return }
    let vivo = true
    void buscar(c).then((r) => {
      if (!vivo) return
      setMunicipios(r?.municipios ?? null)
      if (!tocado.current || !r) return
      setLibre(false)
      const d = decidirCiudad(r.municipios, ciudadRef.current)
      if (d) onCiudadRef.current(d.ciudad)
    })
    return () => { vivo = false }
  }, [cp])

  const varios = municipios && municipios.length > 1 ? municipios : null
  const casa = municipios ? decidirCiudad(municipios, ciudad) : null
  const encaja = !!casa && !casa.elegir && casa.ciudad !== '' && ciudad.trim() !== ''
  const usarSelect = !!varios && !libre && (ciudad.trim() === '' || encaja)
  const noCasa = municipios && ciudad.trim() !== '' && !encaja

  return (
    <>
      {usarSelect ? (
        <select
          value={encaja ? casa!.ciudad : ''}
          onChange={(e) => {
            if (e.target.value === OTRA) { setLibre(true); onCiudad('') } else onCiudad(e.target.value)
          }}
          style={style}
        >
          <option value="" disabled>Elige localidad ({varios!.length})</option>
          {varios!.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value={OTRA}>Otra…</option>
        </select>
      ) : (
        <input value={ciudad} onChange={(e) => onCiudad(e.target.value)} style={style} />
      )}
      {noCasa && (
        <span style={{ fontSize: 11, color: 'var(--warning)' }}>
          El CP {cp.trim()} es {municipios!.length === 1 ? municipios![0] : municipios!.length <= 4 ? `de ${municipios!.join(', ')}` : `de ${municipios!.length} municipios`}: revisa CP o ciudad.
        </span>
      )}
    </>
  )
}
