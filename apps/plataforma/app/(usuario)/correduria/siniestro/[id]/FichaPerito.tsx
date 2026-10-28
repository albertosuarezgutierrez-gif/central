import Bloque from '../../Bloque'
import { eur } from '@/lib/dinero'
import type { FichaPerito } from '@/lib/correduria/siniestro-hilo'
import { NOTA } from './estilos'

const euros = (n: number | null): string => (n === null ? '—' : eur(n))

/** Ficha del informe previo del perito. Campo sin dato = «—» (nunca 0,00€). */
export function FichaPeritoVista({ ficha, titulo = 'Ficha del perito' }: { ficha: FichaPerito; titulo?: string }) {
  const celda = (etiqueta: string, valor: string, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={NOTA}>{etiqueta}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: color ?? 'var(--text)', overflowWrap: 'anywhere' }}>{valor}</div>
    </div>
  )
  return (
    <section aria-label={titulo} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
      <strong style={{ fontSize: 14 }}>{titulo}{ficha.numeroInforme !== null ? ` · informe ${ficha.numeroInforme}` : ''}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 6 }}>
        {celda('Daños cubiertos', euros(ficha.importeCubierto), 'var(--positive)')}
        {celda('Daños NO cubiertos', euros(ficha.importeNoCubierto), 'var(--negative)')}
        {celda('Última gestión', ficha.fechaGestion ?? '—')}
        {celda('Próxima gestión', ficha.fechaProxGestion ?? '—')}
        {celda('Afectados', ficha.afectados === null ? '—' : String(ficha.afectados))}
      </div>
      {ficha.origenCausas && <p style={{ ...NOTA, marginTop: 6, overflowWrap: 'anywhere' }}>Origen y causas: {ficha.origenCausas}</p>}
    </section>
  )
}

/** Bloque de expediente: ficha del último informe del perito que trae el hilo. */
export default function FichaPerito({ ficha }: { ficha: FichaPerito }) {
  return <Bloque titulo="Informe del perito"><FichaPeritoVista ficha={ficha} titulo="Último informe" /></Bloque>
}
