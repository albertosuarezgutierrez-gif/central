// PDF del certificado de retenciones e ingresos a cuenta del IRPF (rendimientos del trabajo) para el empleado. Solo pinta: las cifras
// llegan calculadas por `certificadoDeNominas` (mismas que el 190).
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { CertificadoRetenciones } from '@central/module-contabilidad'
import { MARCA_ASEGURA } from '@central/brand'
import { eurosEs } from '@/lib/hechos-contabilidad-certificado'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sub: { fontSize: 10, color: '#555', marginBottom: 16 },
  titulo: { fontSize: 11, fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 3, marginBottom: 4, marginTop: 14 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  total: { flexDirection: 'row', justifyContent: 'space-between', fontFamily: 'Helvetica-Bold', paddingTop: 4, borderTopWidth: 1, borderTopColor: '#333', marginTop: 4 },
  aviso: { fontSize: 9, color: MARCA_ASEGURA.paleta.warn, marginTop: 4 }, // semántico de @central/brand (cepo lib/marca-asegura.test.ts)
  pie: { marginTop: 28, fontSize: 8, color: '#777' },
})

export type PropsCertificado = {
  certificado: CertificadoRetenciones
  empresa: { nombre: string; nif: string | null }
  fechaEmision: string
}

const Fila = ({ k, v }: { k: string; v: string }) => <View style={s.fila}><Text>{k}</Text><Text>{v}</Text></View>

function CertificadoPdf({ certificado: c, empresa, fechaEmision }: PropsCertificado) {
  const gastos = c.totales.gastosDeducibles
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Certificado de retenciones e ingresos a cuenta del IRPF</Text>
        <Text style={s.sub}>Rendimientos del trabajo · Ejercicio {c.anio}</Text>

        <Text style={s.titulo}>Pagador</Text>
        <Fila k="Nombre o razón social" v={empresa.nombre} />
        <Fila k="NIF" v={empresa.nif ?? 'Pendiente de completar por la empresa'} />

        <Text style={s.titulo}>Perceptor</Text>
        <Fila k="Nombre" v={c.perceptor.nombre} />
        <Fila k="NIF" v={c.perceptor.nif} />

        {c.lineas.map((l) => (
          <View key={`${l.clave}|${l.subclave ?? ''}`}>
            <Text style={s.titulo}>Clave {l.clave}{l.subclave ? ` · subclave ${l.subclave}` : ''}</Text>
            <Fila k="Percepciones íntegras dinerarias" v={eurosEs(l.percepcionDineraria)} />
            <Fila k="Retenciones practicadas" v={eurosEs(l.retencionDineraria)} />
            {(l.percepcionEspecie > 0 || l.ingresoACuentaEspecie > 0) && <>
              <Fila k="Retribuciones en especie (valoración)" v={eurosEs(l.percepcionEspecie)} />
              <Fila k="Ingresos a cuenta" v={eurosEs(l.ingresoACuentaEspecie)} />
            </>}
            <Fila k="Gastos deducibles (cotizaciones a la Seguridad Social)" v={l.gastosDeducibles === null ? 'Sin calcular' : eurosEs(l.gastosDeducibles)} />
          </View>
        ))}

        <View style={s.total}><Text>Total percepciones íntegras</Text><Text>{eurosEs(c.totales.percepciones)}</Text></View>
        <View style={s.fila}><Text>Total retenciones e ingresos a cuenta</Text><Text>{eurosEs(c.totales.retenciones)}</Text></View>
        <View style={s.fila}><Text>Total gastos deducibles</Text><Text>{gastos === null ? 'Sin calcular' : eurosEs(gastos)}</Text></View>

        {c.avisos.map((a) => <Text key={a} style={s.aviso}>{a}</Text>)}

        <Text style={s.pie}>
          Certificado emitido el {fechaEmision} a efectos del art. 108.3 del Reglamento del IRPF, con los datos de las nóminas confirmadas
          del ejercicio. Las cifras coinciden con las declaradas por el pagador en el resumen anual (modelo 190). Ante cualquier
          discrepancia, consulta con RR.HH. de tu empresa.
        </Text>
      </Page>
    </Document>
  )
}

export async function generarCertificadoPdf(p: PropsCertificado): Promise<Buffer> {
  return renderToBuffer(<CertificadoPdf {...p} />) as Promise<Buffer>
}
