import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { NominaDesglose } from '@central/module-nominas'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sub: { fontSize: 10, color: '#555', marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 3, marginBottom: 4, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', fontFamily: 'Helvetica-Bold', paddingTop: 4, borderTopWidth: 1, borderTopColor: '#333', marginTop: 4 },
  netBox: { backgroundColor: '#f0f0f0', padding: 8, marginTop: 12 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', fontFamily: 'Helvetica-Bold', fontSize: 12 },
  footer: { marginTop: 28, fontSize: 8, color: '#aaa' },
})

const fmt = (n: number) => n.toFixed(2) + ' €'

interface NominaPdfProps {
  empresa: { nombre: string }
  empleado: { nombre: string; dni?: string | null; nss?: string | null }
  periodo: string
  desglose: NominaDesglose
}

function NominaPdf({ empresa, empleado, periodo, desglose }: NominaPdfProps) {
  const { devengos, deducciones, netoAPagar, baseCotizacion, cuotaPatronal } = desglose

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{empresa.nombre}</Text>
        <Text style={s.sub}>Nómina — {periodo}</Text>

        <Text style={s.sectionTitle}>Datos del trabajador</Text>
        <View style={s.row}><Text>Nombre</Text><Text>{empleado.nombre}</Text></View>
        {empleado.dni ? <View style={s.row}><Text>DNI / NIE</Text><Text>{empleado.dni}</Text></View> : null}
        {empleado.nss ? <View style={s.row}><Text>N.º Seg. Social</Text><Text>{empleado.nss}</Text></View> : null}

        <Text style={s.sectionTitle}>Devengos</Text>
        <View style={s.row}><Text>Salario base</Text><Text>{fmt(devengos.salarioBase)}</Text></View>
        {devengos.complementosFijos.map((c, i) => (
          <View key={i} style={s.row}><Text>{c.concepto}</Text><Text>{fmt(c.importe)}</Text></View>
        ))}
        {devengos.horasExtra > 0
          ? <View style={s.row}><Text>Horas extra</Text><Text>{fmt(devengos.horasExtra)}</Text></View>
          : null}
        {devengos.pluses.map((p, i) => (
          <View key={i} style={s.row}><Text>{p.concepto}</Text><Text>{fmt(p.importe)}</Text></View>
        ))}
        {devengos.descuentos > 0
          ? <View style={s.row}><Text>Descuentos</Text><Text>-{fmt(devengos.descuentos)}</Text></View>
          : null}
        <View style={s.totalRow}><Text>TOTAL DEVENGADO</Text><Text>{fmt(devengos.total)}</Text></View>

        <Text style={s.sectionTitle}>Deducciones (trabajador)</Text>
        <View style={s.row}><Text>Seg. Social — CC</Text><Text>{fmt(deducciones.contingencias_comunes)}</Text></View>
        <View style={s.row}><Text>Desempleo</Text><Text>{fmt(deducciones.desempleo)}</Text></View>
        <View style={s.row}><Text>Formación Profesional</Text><Text>{fmt(deducciones.fp)}</Text></View>
        <View style={s.row}><Text>IRPF</Text><Text>{fmt(deducciones.irpf)}</Text></View>
        <View style={s.totalRow}><Text>TOTAL DEDUCCIONES</Text><Text>{fmt(deducciones.total)}</Text></View>

        <View style={s.netBox}>
          <View style={s.netRow}><Text>LÍQUIDO A PERCIBIR</Text><Text>{fmt(netoAPagar)}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Cuota empresarial (informativa)</Text>
        <View style={s.row}><Text>Base de cotización</Text><Text>{fmt(baseCotizacion)}</Text></View>
        <View style={s.row}><Text>Contingencias comunes</Text><Text>{fmt(cuotaPatronal.contingencias_comunes)}</Text></View>
        <View style={s.row}><Text>Desempleo</Text><Text>{fmt(cuotaPatronal.desempleo)}</Text></View>
        <View style={s.row}><Text>FOGASA</Text><Text>{fmt(cuotaPatronal.fogasa)}</Text></View>
        <View style={s.row}><Text>Formación Profesional</Text><Text>{fmt(cuotaPatronal.fp)}</Text></View>
        <View style={s.row}><Text>AT / EP</Text><Text>{fmt(cuotaPatronal.at_ep)}</Text></View>
        <View style={s.totalRow}><Text>TOTAL CUOTA EMPRESA</Text><Text>{fmt(cuotaPatronal.total)}</Text></View>

        <Text style={s.footer}>Documento generado automáticamente · iarrhh · {periodo}</Text>
      </Page>
    </Document>
  )
}

export async function generarNominaPdf(params: NominaPdfProps): Promise<Buffer> {
  return renderToBuffer(<NominaPdf {...params} />) as Promise<Buffer>
}
