// «Personas de la póliza» y «Persona asegurada» (vida/decesos): lo que manda la compañía por CIMA
// desde asegura PR 880, ya descifrado por asegura. `null` = no consta y no se pinta; antes de la PR 880 la
// póliza no trae nada de esto y el acceso ni aparece (`hayPersonas`).
import { actividadesVida, textoDuracionPrestamo, type PersonasPoliza as Personas, type PrestamoFicha } from '@central/module-seguros'
import { eur } from '@/lib/dinero'
import { ListaPersonasCima, PersonaCima } from '../../PersonaCima'

const muted: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: 0 }
const titulo: React.CSSProperties = { fontWeight: 600, fontSize: 13, margin: '0 0 6px' }

/** ¿Hay algo que pintar? (decide si el acceso existe). */
export function hayPersonas(p: Personas): boolean {
  return (p.figuras?.length ?? 0) > 0 || p.vida !== null || p.decesos !== null
}

/** Importe del EIAC («120000.00») → `120.000,00€`; si no es número, tal cual. */
function importe(v: string | null): string | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? eur(n) : v
}

function Filas({ filas }: { filas: [string, string | null][] }) {
  const con = filas.filter((f): f is [string, string] => f[1] !== null && f[1] !== '')
  if (con.length === 0) return null
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px', fontSize: 13 }}>
      {con.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--muted)' }}>{k}</dt>
          <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Prestamo({ p }: { p: PrestamoFicha }) {
  return (
    <div>
      <p style={titulo}>Préstamo vinculado</p>
      <Filas
        filas={[
          ['Descripción', p.descripcion],
          ['Número', p.numero],
          ['Clase', p.clase],
          ['Contratación', p.contratacion],
          ['Importe inicial', importe(p.importeInicial)],
          ['Importe nominal', importe(p.importeNominal)],
          ['Cuota inicial', importe(p.cuotaInicial)],
          ['Duración', textoDuracionPrestamo(p)],
        ]}
      />
    </div>
  )
}

export default function PersonasPoliza({ p }: { p: Personas }) {
  const { figuras, vida, decesos } = p
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {figuras !== null && figuras.length > 0 && (
        <div>
          <p style={titulo}>Personas de la póliza</p>
          <ListaPersonasCima lista={figuras} />
        </div>
      )}

      {vida && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <p style={titulo}>Persona asegurada (vida)</p>
          {vida.persona ? <PersonaCima f={vida.persona} /> : <p style={muted}>La compañía no manda la persona asegurada.</p>}
          <Filas
            filas={[
              ['Clase de seguro', vida.claseSeguro],
              ['Edad de jubilación', vida.edadJubilacion],
              ['Convenio', vida.convenio],
              ['Id. de aplicación', vida.idAplicacion],
              ['Id. de empleado', vida.idEmpleado],
              ['Máquinas', vida.maquinas?.join(' · ') ?? null],
              ['Vehículos', vida.vehiculos?.join(' · ') ?? null],
              ...actividadesVida(vida).map((a): [string, string] => [a.etiqueta, a.valor ? 'Sí' : 'No']),
            ]}
          />
          {vida.prestamo && <Prestamo p={vida.prestamo} />}
        </div>
      )}

      {decesos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <p style={titulo}>Persona asegurada (decesos)</p>
          {decesos.persona ? <PersonaCima f={decesos.persona} /> : <p style={muted}>La compañía no manda la persona asegurada.</p>}
          <Filas
            filas={[
              ['Modalidad', decesos.modalidad],
              ['Id. de aplicación', decesos.idAplicacion],
              ['Id. de empleado', decesos.idEmpleado],
            ]}
          />
        </div>
      )}
    </div>
  )
}
