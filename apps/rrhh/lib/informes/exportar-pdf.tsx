// Exportación de un informe a PDF con @react-pdf/renderer (ya en rrhh, serverExternalPackages).
// Cabecera (título, empresa, filtros, agrupación, fecha), cuadro de totales (por grupo + general)
// y tabla de detalle con filas de grupo y subtotal. Apaisado si hay más de 6 columnas.
// El detalle se limita a LIMITE_DETALLE_PDF filas (un PDF de 50.000 filas no lo lee nadie y
// tarda demasiado en serverless); los TOTALES son siempre de todo el informe.

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { CabeceraInforme } from './cabecera'
import { formatearMetrica, formatearValor, numeroEs } from './formato'
import type { ResultadoInforme, ResultadoMetrica } from './motor'

export const LIMITE_DETALLE_PDF = 3_000

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontSize: 8, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  meta: { fontSize: 8.5, color: '#444', marginBottom: 1.5 },
  aviso: { fontSize: 8.5, color: '#9a3412', marginTop: 3 },
  seccion: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2.5 },
  filaCab: { flexDirection: 'row', backgroundColor: '#eef2f2', borderBottomWidth: 1, borderBottomColor: '#999', paddingVertical: 3 },
  filaGrupo: { flexDirection: 'row', backgroundColor: '#f5f5f4', paddingVertical: 3, marginTop: 4 },
  filaSub: { flexDirection: 'row', borderTopWidth: 0.8, borderTopColor: '#666', paddingVertical: 2.5, fontFamily: 'Helvetica-Bold' },
  filaTotal: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: '#111', paddingVertical: 3.5, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  celda: { flex: 1, paddingHorizontal: 3 },
  num: { textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  pie: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7, color: '#888', flexDirection: 'row', justifyContent: 'space-between' },
})

const ES_NUM = new Set(['dinero', 'horas', 'numero'])

function CuadroTotales({ r }: { r: ResultadoInforme }) {
  const ms = r.total.metricas
  const fila = (rotulo: string, metricas: ResultadoMetrica[], estilo: (typeof s)[keyof typeof s], key: string) => (
    <View style={estilo} key={key} wrap={false}>
      <Text style={[s.celda, { flex: 2 }]}>{rotulo}</Text>
      {metricas.map(m => <Text key={m.clave} style={[s.celda, s.num]}>{formatearMetrica(m.formato, m.valor)}</Text>)}
    </View>
  )
  return (
    <View>
      <View style={s.filaCab} fixed>
        <Text style={[s.celda, s.bold, { flex: 2 }]}>{r.agrupacion ? r.agrupacion.etiqueta.replace(/^Por /, '') : ''}</Text>
        {ms.map(m => <Text key={m.clave} style={[s.celda, s.bold, s.num]}>{m.etiqueta}</Text>)}
      </View>
      {(r.grupos ?? []).map((g, i) => fila(g.etiqueta, g.metricas, s.fila, `g${i}`))}
      {fila('TOTAL', ms, s.filaTotal, 'total')}
    </View>
  )
}

function Detalle({ r }: { r: ResultadoInforme }) {
  const cols = r.columnas
  const limite = Math.min(r.filas.length, LIMITE_DETALLE_PDF)
  const filaDato = (i: number) => (
    <View style={s.fila} key={`f${i}`} wrap={false}>
      {cols.map(c => (
        <Text key={c.clave} style={[s.celda, ES_NUM.has(c.tipo) ? s.num : {}]}>{formatearValor(c.tipo, r.filas[i][c.clave] ?? null)}</Text>
      ))}
    </View>
  )
  const filaSuma = (rotulo: string, metricas: ResultadoMetrica[], estilo: (typeof s)[keyof typeof s], key: string) => (
    <View style={estilo} key={key} wrap={false}>
      {cols.map((c, i) => {
        const m = metricas.find(x => x.tipo === 'suma' && x.campo === c.clave)
        return <Text key={c.clave} style={[s.celda, m ? s.num : {}]}>{m ? formatearMetrica(m.formato, m.valor) : i === 0 ? rotulo : ''}</Text>
      })}
    </View>
  )
  const cuerpo: React.ReactNode[] = []
  if (r.grupos) {
    for (const [gi, g] of r.grupos.entries()) {
      if (g.desde >= limite) break
      cuerpo.push(
        <View style={s.filaGrupo} key={`gh${gi}`} wrap={false}>
          <Text style={[s.celda, s.bold]}>{g.etiqueta} ({numeroEs(g.n, 0)})</Text>
        </View>,
      )
      for (let i = g.desde; i < Math.min(g.hasta, limite); i++) cuerpo.push(filaDato(i))
      if (g.hasta <= limite) cuerpo.push(filaSuma(`Subtotal ${g.etiqueta}`, g.metricas, s.filaSub, `gs${gi}`))
    }
  } else {
    for (let i = 0; i < limite; i++) cuerpo.push(filaDato(i))
  }
  return (
    <View>
      <View style={s.filaCab} fixed>
        {cols.map(c => <Text key={c.clave} style={[s.celda, s.bold, ES_NUM.has(c.tipo) ? s.num : {}]}>{c.etiqueta}</Text>)}
      </View>
      {cuerpo}
      {limite < r.filas.length && (
        <Text style={s.aviso}>Detalle recortado a {numeroEs(limite, 0)} de {numeroEs(r.filas.length, 0)} filas. Descarga el Excel para verlo completo. Los totales son de todas las filas.</Text>
      )}
      {filaSuma(`TOTAL (${numeroEs(r.total.n, 0)} filas)`, r.total.metricas, s.filaTotal, 'tot')}
    </View>
  )
}

function InformePdf({ r, cab }: { r: ResultadoInforme; cab: CabeceraInforme }) {
  const apaisado = r.columnas.length > 6 || r.total.metricas.length > 5
  return (
    <Document title={cab.titulo} author={cab.empresa}>
      <Page size="A4" orientation={apaisado ? 'landscape' : 'portrait'} style={s.page}>
        <Text style={s.h1}>{cab.titulo}</Text>
        <Text style={s.meta}>Empresa: {cab.empresa}</Text>
        <Text style={s.meta}>Filtros: {cab.filtros.length ? cab.filtros.join(' · ') : 'ninguno'}</Text>
        {cab.agrupacion && <Text style={s.meta}>Agrupado: {cab.agrupacion}</Text>}
        <Text style={s.meta}>Generado el {cab.generado}</Text>
        {r.truncado && <Text style={s.aviso}>Informe limitado a las primeras {numeroEs(r.limite, 0)} filas: filtra más para verlo completo.</Text>}
        {r.total.metricas.filter(m => m.sinDato > 0).map(m => (
          <Text key={m.clave} style={s.aviso}>{numeroEs(m.sinDato, 0)} fila(s) sin dato no cuentan en «{m.etiqueta}».</Text>
        ))}

        <Text style={s.seccion}>Totales</Text>
        <CuadroTotales r={r} />

        <Text style={s.seccion} break={r.grupos !== null && r.grupos.length > 25}>Detalle</Text>
        <Detalle r={r} />

        <View style={s.pie} fixed>
          <Text>{cab.empresa} · {cab.titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function generarPdf(r: ResultadoInforme, cab: CabeceraInforme): Promise<Buffer> {
  return renderToBuffer(<InformePdf r={r} cab={cab} />) as Promise<Buffer>
}
