'use client'

// Cascada marca → modelo → combustible → versión del catálogo de Codeoscopic (GRATIS) dentro de «Datos del vehículo»
// (07/10/2026). Coche y moto con el sufijo `-moto` según ramo. Al elegir la VERSIÓN devuelve los 7 campos con los nombres
// del catálogo (`SeleccionVersion`); no escribe ni cotiza: lo guarda quien la monta. Nunca dispara una cotización de pago.
//
// La precarga es la del riesgo (`planPrecargaVehiculo`): ids hasta donde lleguen y el texto sin id como PISTA del buscador.
// Si el catálogo falla se DICE (con reintento): nunca una lista vacía muda.

import { useEffect, useRef, useState } from 'react'
import type { DatosVehiculoRiesgo } from '@central/module-seguros'
import type { Opcion } from '@/lib/auto-nuevo-asegura'
import { planPrecargaVehiculo } from '@/lib/correduria/precarga-vehiculo'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import { SelectorBuscable } from '../../SelectorBuscable'
import {
  MOTORES_MOTO, paramsModelos, paramsVersiones, seleccionDeVersion, tiposCatalogo,
  type RamoCatalogo, type SeleccionVersion,
} from './catalogo-vehiculo'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%',
}
const etiquetaCss: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

async function catalogo(params: Record<string, string>): Promise<Opcion[]> {
  const r = await pedirCatalogo(params)
  if (r.estado !== 'ok') throw new Error(r.mensaje)
  return r.opciones
}

export default function SelectorCatalogoVehiculo({ ramo, datos, deshabilitado, onElegida }: {
  ramo: RamoCatalogo
  datos: DatosVehiculoRiesgo
  deshabilitado: boolean
  onElegida: (s: SeleccionVersion) => void
}) {
  const tipos = tiposCatalogo(ramo)
  const plan = planPrecargaVehiculo(datos, false)
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [motores, setMotores] = useState<Opcion[]>(ramo === 'moto' ? [...MOTORES_MOTO] : [])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [motorId, setMotorId] = useState('')
  const [codigoVehiculo, setCodigoVehiculo] = useState('')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const arrancado = useRef(false)
  // Cambiar de marca/modelo/combustible deprisa lanza varias lecturas: solo vale la ÚLTIMA. Si llegara tarde la de otro
  // combustible, se elegiría una versión de una lista que no es la del combustible que se ve en pantalla.
  const peticionModelos = useRef(0)
  const peticionVersiones = useRef(0)

  // Carga inicial (y reintento): marcas + motores (coche) y, si el riesgo trae ids, la cascada precargada hasta donde llegue.
  useEffect(() => {
    let vivo = true
    setFallo(null)
    setCargando('marcas')
    void (async () => {
      try {
        const [ms, mt] = await Promise.all([
          catalogo({ tipo: tipos.marcas }),
          ramo === 'moto' ? Promise.resolve([...MOTORES_MOTO]) : catalogo({ tipo: 'motores' }),
        ])
        if (!vivo) return
        setMarcas(ms)
        setMotores(mt)
        const c = !arrancado.current ? plan.cascada : null
        arrancado.current = true
        if (!c || !ms.some((m) => m.id === c.marcaId)) return
        setMarcaId(c.marcaId)
        setCargando('modelos')
        const mo = await catalogo(paramsModelos(ramo, c.marcaId))
        if (!vivo) return
        setModelos(mo)
        if (c.motorId && mt.some((m) => m.id === c.motorId)) setMotorId(c.motorId)
        if (!c.modeloId || !mo.some((m) => m.id === c.modeloId)) return
        setModeloId(c.modeloId)
        if (!c.motorId || !mt.some((m) => m.id === c.motorId)) return
        setCargando('versiones')
        const n = ++peticionVersiones.current
        const vs = await catalogo(paramsVersiones(ramo, c.marcaId, c.modeloId, c.motorId))
        if (!vivo || n !== peticionVersiones.current) return
        setVersiones(vs)
        if (c.codigoVehiculo && vs.some((x) => x.id === c.codigoVehiculo)) setCodigoVehiculo(c.codigoVehiculo)
      } catch (e) {
        if (vivo) setFallo((e as Error).message || 'sin respuesta')
      } finally {
        if (vivo) setCargando(null)
      }
    })()
    return () => { vivo = false }
    // Una vez al abrir (y en cada reintento).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento])

  async function cargarModelos(id: string) {
    const n = ++peticionModelos.current
    setCargando('modelos')
    setFallo(null)
    try {
      const mo = await catalogo(paramsModelos(ramo, id))
      if (n !== peticionModelos.current) return
      setModelos(mo)
    } catch (e) {
      if (n === peticionModelos.current) setFallo((e as Error).message || 'sin respuesta')
    } finally {
      if (n === peticionModelos.current) setCargando(null)
    }
  }

  async function cargarVersiones(marca: string, modelo: string, motor: string) {
    const n = ++peticionVersiones.current
    setCargando('versiones')
    setFallo(null)
    try {
      const vs = await catalogo(paramsVersiones(ramo, marca, modelo, motor))
      if (n !== peticionVersiones.current) return
      setVersiones(vs)
    } catch (e) {
      if (n === peticionVersiones.current) setFallo((e as Error).message || 'sin respuesta')
    } finally {
      if (n === peticionVersiones.current) setCargando(null)
    }
  }

  function alElegirMarca(id: string) {
    peticionVersiones.current++
    setMarcaId(id); setModeloId(''); setCodigoVehiculo(''); setModelos([]); setVersiones([])
    if (id) void cargarModelos(id)
  }
  function alElegirModelo(id: string) {
    peticionVersiones.current++
    setModeloId(id); setCodigoVehiculo(''); setVersiones([])
    if (id && motorId) void cargarVersiones(marcaId, id, motorId)
  }
  function alElegirMotor(id: string) {
    peticionVersiones.current++
    setMotorId(id); setCodigoVehiculo(''); setVersiones([])
    if (id && modeloId) void cargarVersiones(marcaId, modeloId, id)
  }
  function alElegirVersion(id: string) {
    setCodigoVehiculo(id)
    if (!id) return
    const s = seleccionDeVersion({ marcas, modelos, versiones, marcaId, modeloId, motorId, codigoVehiculo: id })
    if (s) onElegida(s)
  }

  const fuera = deshabilitado
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      {fallo && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--negative)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ minWidth: 0 }}>No se ha podido leer el catálogo de Codeoscopic: {fallo}. La lista de abajo puede estar incompleta.</span>
          <button type="button" onClick={() => setIntento((n) => n + 1)} style={{ minHeight: 44, padding: '0 12px' }}>Reintentar</button>
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <div style={etiquetaCss}>Marca
          <SelectorBuscable
            valor={marcaId}
            pista={marcaId ? null : plan.pistaMarca}
            onCambiar={alElegirMarca}
            opciones={marcas}
            deshabilitado={fuera || cargando === 'marcas'}
            textoVacio={cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}
            nombre="marca" plural="marcas" style={input}
          />
        </div>
        <div style={etiquetaCss}>Modelo
          <SelectorBuscable
            valor={modeloId}
            pista={modeloId ? null : plan.pistaModelo}
            onCambiar={alElegirModelo}
            opciones={modelos}
            deshabilitado={fuera || !marcaId || cargando === 'modelos'}
            textoVacio={cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}
            nombre="modelo" plural="modelos" style={input}
          />
        </div>
        <div style={etiquetaCss}>Combustible
          <SelectorBuscable
            valor={motorId}
            onCambiar={alElegirMotor}
            opciones={motores}
            deshabilitado={fuera || cargando === 'marcas'}
            textoVacio="Elige combustible"
            nombre="combustible" plural="combustibles" style={input}
          />
        </div>
        <div style={etiquetaCss}>Versión
          <SelectorBuscable
            valor={codigoVehiculo}
            pista={codigoVehiculo ? null : plan.pistaVersion}
            onCambiar={alElegirVersion}
            opciones={versiones}
            deshabilitado={fuera || !modeloId || !motorId || cargando === 'versiones'}
            textoVacio={cargando === 'versiones' ? 'Cargando…' : !motorId ? 'Elige antes el combustible' : 'Elige versión'}
            nombre="versión" plural="versiones" marcador="Buscar: TECNO, 48V, 4X2…" style={input}
          />
        </div>
      </div>
    </div>
  )
}
