'use client'
import { useState } from 'react'
import { claveVehiculo, type SubclaveVehiculo } from '@central/module-seguros'

type Opcion = { id: string; nombre: string }
type Paso = 'marcas' | 'modelos' | 'motores' | 'versiones'

/**
 * Buscador de la versión exacta (26/10/2026, fase 2): marca → modelo → combustible → versión del catálogo GRATIS de
 * Codeoscopic, por `/api/datos/vehiculo` (token vivo de auto/moto). Es una AYUDA: lo que manda es la marca y el modelo en
 * texto; si encuentra su versión, guarda los ids (subclaves de `claveVehiculo`) y asegura los comprueba al escribir.
 * Elegir marca o modelo del catálogo rellena también el texto (mismo nombre que el catálogo). A 320 px: una columna,
 * desplegables a todo el ancho y botones de 44 px.
 */
export default function BuscadorVersion({ token, clave, valores, poner, quitar, deshabilitado, ayuda }: {
  token: string
  clave: string
  valores: Record<string, string | boolean>
  poner: (cambios: Record<string, string>) => void
  quitar: (claves: string[]) => void
  deshabilitado: boolean
  ayuda?: string
}) {
  const k = (sub: SubclaveVehiculo) => claveVehiculo(clave, sub)
  const v = (sub: SubclaveVehiculo) => (typeof valores[k(sub)] === 'string' ? (valores[k(sub)] as string) : '')
  const [abierto, setAbierto] = useState(() => v('Codigo') !== '')
  const [listas, setListas] = useState<Partial<Record<Paso, Opcion[]>>>({})
  const [cargando, setCargando] = useState<Paso | null>(null)
  const [fallo, setFallo] = useState(false)

  async function cargar(paso: Paso, extra: Record<string, string> = {}) {
    setCargando(paso)
    setFallo(false)
    try {
      const r = await fetch(`/api/datos/vehiculo?${new URLSearchParams({ token, paso, ...extra }).toString()}`)
      const j = (await r.json().catch(() => null)) as { opciones?: Opcion[] | null } | null
      if (!r.ok || !Array.isArray(j?.opciones)) throw new Error('sin catálogo')
      setListas((l) => ({ ...l, [paso]: j.opciones as Opcion[] }))
    } catch {
      setFallo(true)
    } finally {
      setCargando(null)
    }
  }

  const DESPUES: Record<Paso, SubclaveVehiculo[]> = {
    marcas: ['MarcaId', 'ModeloId', 'MotorId', 'Codigo', 'Version'],
    modelos: ['ModeloId', 'MotorId', 'Codigo', 'Version'],
    motores: ['MotorId', 'Codigo', 'Version'],
    versiones: ['Codigo', 'Version'],
  }
  const vaciarDesde = (paso: Paso) => {
    quitar(DESPUES[paso].map(k))
    setListas((l) => {
      const orden: Paso[] = ['marcas', 'modelos', 'motores', 'versiones']
      return Object.fromEntries(Object.entries(l).filter(([p]) => orden.indexOf(p as Paso) <= orden.indexOf(paso)))
    })
  }

  const elegir = async (paso: Paso, id: string) => {
    const nombre = listas[paso]?.find((o) => o.id === id)?.nombre ?? ''
    vaciarDesde(paso)
    if (!id) return
    if (paso === 'marcas') { poner({ [k('MarcaId')]: id, marca: nombre }); await cargar('modelos', { marcaId: id }) }
    else if (paso === 'modelos') { poner({ [k('ModeloId')]: id, modelo: nombre }); await cargar('motores') }
    else if (paso === 'motores') { poner({ [k('MotorId')]: id }); await cargar('versiones', { marcaId: v('MarcaId'), modeloId: v('ModeloId'), motor: id }) }
    else poner({ [k('Codigo')]: id, [k('Version')]: nombre })
  }

  const ETIQUETA: Record<Paso, string> = { marcas: 'Marca', modelos: 'Modelo', motores: 'Combustible', versiones: 'Versión' }
  const VALOR: Record<Paso, SubclaveVehiculo> = { marcas: 'MarcaId', modelos: 'ModeloId', motores: 'MotorId', versiones: 'Codigo' }

  if (!abierto) {
    return (
      <div className="editor-campo" style={{ minWidth: 0 }}>
        <button type="button" className="boton-tenue" style={{ minHeight: 44, width: 'auto', justifySelf: 'start' }} disabled={deshabilitado}
          onClick={() => { setAbierto(true); if (!listas.marcas) void cargar('marcas') }}>
          🔎 Buscar mi versión exacta (opcional)
        </button>
        {ayuda && <span className="editor-ayuda">{ayuda}</span>}
      </div>
    )
  }
  return (
    <fieldset className="editor-campo" style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <legend style={{ fontWeight: 600, marginBottom: 6 }}>Tu versión exacta <span className="suave">(opcional)</span></legend>
      {(['marcas', 'modelos', 'motores', 'versiones'] as const).map((paso) => {
        const lista = listas[paso]
        if (!lista) return cargando === paso ? <span key={paso} className="editor-ayuda">Cargando {ETIQUETA[paso].toLowerCase()}…</span> : null
        return (
          <label key={paso} style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
            <span>{ETIQUETA[paso]}</span>
            <select className="campo" style={{ width: '100%', minHeight: 44 }} value={v(VALOR[paso])} disabled={deshabilitado || cargando !== null}
              onChange={(e) => void elegir(paso, e.target.value)}>
              <option value="">Elige…</option>
              {lista.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
        )
      })}
      {v('Codigo') !== '' && <span className="editor-ayuda">✅ Versión elegida. Ya no hace falta nada más del coche.</span>}
      {fallo && <span className="editor-ayuda">Ahora no podemos mostrar el catálogo. No pasa nada: con la marca y el modelo de arriba nos basta.</span>}
      <button type="button" className="boton-tenue" style={{ minHeight: 44, width: 'auto', justifySelf: 'start' }} disabled={deshabilitado}
        onClick={() => { vaciarDesde('marcas'); setAbierto(false) }}>
        No la encuentro / quitar
      </button>
    </fieldset>
  )
}
