import { selloFijo } from '@/lib/marca'

/** Sello «con Grupo ASegura»: fijo, no editable. Sin acceso a BD (sirve también en componentes de cliente). */
export function Sello() {
  const s = selloFijo()
  return s ? <span className="sello">{s.texto}</span> : null
}
