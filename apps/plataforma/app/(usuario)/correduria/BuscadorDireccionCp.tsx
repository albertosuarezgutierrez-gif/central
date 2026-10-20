'use client'

// Buscador por DIRECCIÓN con el código postal PRIMERO (20/10/2026): el CP da la provincia sola y el municipio sale de una lista.
// Compartido por `hogar-nuevo` y por cualquier pantalla que busque una vivienda en el Catastro. GET puro: al enviar viaja
// `direccion`, `cp`, `municipio` y `provincia` (y `oportunidad` si la hay), como el formulario que sustituye.
//
// 🚨 Nunca un municipio inventado: sin CP, provincia y municipio quedan VACÍOS. Un CP que la tabla no conoce (`municipios: null`)
// NO es «sin municipios»: se escribe a mano. Un fallo de red al consultar el CP tampoco inventa nada.
import { useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%', minWidth: 0,
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

type Cp = { estado: 'vacio' } | { estado: 'consultando' } | { estado: 'ok'; municipios: string[] | null; provincia: string | null } | { estado: 'error' }

export default function BuscadorDireccionCp({ accion, oportunidad, direccion, cp: cpInicial, municipio: municipioInicial, provincia: provinciaInicial }: {
  accion: string
  oportunidad: string | null
  direccion: string
  cp: string
  municipio: string
  provincia: string
}) {
  const [cp, setCp] = useState(cpInicial)
  const [municipio, setMunicipio] = useState(municipioInicial)
  const [provincia, setProvincia] = useState(provinciaInicial)
  const [lectura, setLectura] = useState<Cp>({ estado: 'vacio' })
  const cpValido = /^\d{5}$/.test(cp.trim())

  useEffect(() => {
    if (!cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/correduria/codigo-postal?cp=${cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios, provincia: j.provincia })
        // La provincia es la del CP (siempre que el CP la dé); el municipio solo se fija solo si el CP tiene uno.
        if (j.provincia) setProvincia(j.provincia)
        if (j.municipios && j.municipios.length === 1) setMunicipio(j.municipios[0])
        else if (j.municipios && !j.municipios.includes(municipioInicial)) setMunicipio((m) => (j.municipios!.includes(m) ? m : ''))
      })
      .catch(() => { if (vivo) setLectura({ estado: 'error' }) })
    return () => { vivo = false }
    // `municipioInicial` solo es el valor de partida: no debe relanzar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp, cpValido])

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const eligeDeLista = lista !== null && lista.length > 1
  const listo = municipio.trim() !== '' && provincia.trim() !== ''
  return (
    <form method="get" action={accion} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
      {oportunidad && <input type="hidden" name="oportunidad" value={oportunidad} />}
      <label style={etiqueta}>Código postal (primero)
        <input style={input} name="cp" inputMode="numeric" maxLength={5} placeholder="41003" value={cp} autoFocus onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label style={etiqueta}>Provincia
        <input style={input} name="provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} />
      </label>
      <label style={etiqueta}>Municipio
        {eligeDeLista ? (
          <select style={input} name="municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} required>
            <option value="">Elige el municipio</option>
            {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input style={input} name="municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} required placeholder={cpValido ? '' : 'Sale del código postal'} />
        )}
      </label>
      <label style={{ ...etiqueta, gridColumn: '1 / -1' }}>Calle y número
        <input style={input} name="direccion" placeholder="Calle San Vicente 40, 2º 14" defaultValue={direccion} required />
      </label>
      <div role="status" style={{ gridColumn: '1 / -1', fontSize: 12, color: lectura.estado === 'error' ? 'var(--warning)' : 'var(--muted)' }}>
        {lectura.estado === 'consultando' ? 'Consultando el código postal…'
          : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe la provincia y el municipio a mano.'
          : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
          : !cpValido ? 'Con el código postal salen la provincia y el municipio; sin él, hay que escribirlos.'
          : ''}
      </div>
      <button type="submit" disabled={!listo} style={{ ...btnStyle('primario'), gridColumn: '1 / -1', minHeight: 44 }}>Consultar Catastro</button>
    </form>
  )
}
