/**
 * Plantillas PDF para documentos de Prevención de Riesgos Laborales.
 * Generadas con @react-pdf/renderer (puro JS, compatible con Vercel serverless).
 */
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EquipoMaquinaria =
  | 'pemp'
  | 'dumper'
  | 'carretilla'
  | 'telescopica'
  | 'herramientas_electricas'
  | 'otros'

export type CamposAutorizacionMaquinaria = {
  empresa_nombre: string
  empresa_color: string        // hex, e.g. '#1a56db'
  empresa_logo_b64: string | null  // 'data:image/...;base64,...' o null
  empleado_nombre: string
  empleado_dni: string
  empleado_puesto: string
  obra_centro: string
  fecha_emision: string        // 'DD/MM/YYYY'
  equipos: EquipoMaquinaria[]
  otros_descripcion?: string
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function makeStyles(color: string) {
  return StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9, padding: '28 36', color: '#1a1a1a', lineHeight: 1.4 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
    logo: { maxHeight: 48, maxWidth: 120, objectFit: 'contain' },
    empresaNombre: { fontSize: 11, fontFamily: 'Helvetica-Bold', color },
    title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
    subtitle: { fontSize: 8, fontStyle: 'italic', textAlign: 'center', color: '#555', marginBottom: 14 },
    dataBox: { border: '1 solid #ccc', borderRadius: 4, padding: '8 10', marginBottom: 14 },
    dataBoxTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    dataRow: { flexDirection: 'row', gap: 16, marginBottom: 5 },
    dataField: { flex: 1 },
    dataLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
    dataValue: { fontSize: 8.5, borderBottom: '0.5 solid #aaa', paddingBottom: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 },
    sectionBar: { width: 3, height: 14, backgroundColor: color, marginRight: 6, borderRadius: 1 },
    sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
    table: { border: '1 solid #ccc', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
    tableHead: { flexDirection: 'row', backgroundColor: color, padding: '5 8' },
    tableHeadCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    tableRow: { flexDirection: 'row', borderTop: '0.5 solid #ddd', padding: '4 8', alignItems: 'center' },
    tableRowAlt: { backgroundColor: '#f8f8f8' },
    checkCell: { width: 20, fontSize: 9 },
    equipoCell: { flex: 1.4, fontSize: 8 },
    requisitosCell: { flex: 1.6, fontSize: 7.5, color: '#444' },
    bulletList: { marginBottom: 8 },
    bullet: { flexDirection: 'row', marginBottom: 3, gap: 4 },
    bulletDot: { fontSize: 8, marginTop: 1 },
    bulletText: { flex: 1, fontSize: 8 },
    bulletBold: { fontFamily: 'Helvetica-Bold' },
    signatureSection: { marginTop: 30, flexDirection: 'row', gap: 20 },
    signatureBox: { flex: 1, alignItems: 'center' },
    signatureLine: { borderTop: '0.5 solid #333', width: '100%', marginBottom: 4 },
    signatureLabel: { fontSize: 7.5, textAlign: 'center', color: '#444' },
    signatureSubLabel: { fontSize: 7, textAlign: 'center', color: '#666' },
    pageNumber: { position: 'absolute', bottom: 16, right: 36, fontSize: 7, color: '#999' },
  })
}

const EQUIPOS: Record<EquipoMaquinaria, { label: string; requisitos: string }> = {
  pemp: { label: 'Plataforma Elevadora Móvil de Personal (PEMP)', requisitos: 'Formación teórica-práctica según UNE 58923 / RD 1215' },
  dumper: { label: 'Dúmper / Maquinaria de Movimiento de Tierras', requisitos: 'Formación específica Convenio de la Construcción' },
  carretilla: { label: 'Carretilla Elevadora', requisitos: 'Formación específica según RD 1215/97' },
  telescopica: { label: 'Manipuladora Telescópica', requisitos: 'Formación teórica-práctica acreditada' },
  herramientas_electricas: { label: 'Herramientas Eléctricas Portátiles (Radial, Taladro, etc.)', requisitos: 'Instrucciones de seguridad y manual del fabricante' },
  otros: { label: 'Otros', requisitos: '' },
}

const TODOS_EQUIPOS: EquipoMaquinaria[] = ['pemp', 'dumper', 'carretilla', 'telescopica', 'herramientas_electricas', 'otros']

// ─── Componente PDF ───────────────────────────────────────────────────────────

export function AutorizacionMaquinariaPdf(campos: CamposAutorizacionMaquinaria) {
  const s = makeStyles(campos.empresa_color || '#1a56db')

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Cabecera empresa */}
        <View style={s.headerRow}>
          {campos.empresa_logo_b64 && (
            <Image src={campos.empresa_logo_b64} style={s.logo} />
          )}
          <Text style={s.empresaNombre}>{campos.empresa_nombre}</Text>
        </View>

        {/* Título */}
        <Text style={s.title}>AUTORIZACIÓN PARA EL USO DE MAQUINARIA, EQUIPOS DE TRABAJO Y HERRAMIENTAS</Text>
        <Text style={s.subtitle}>En cumplimiento del artículo 17 de la Ley de Prevención de Riesgos Laborales y el Real Decreto 1215/1997.</Text>

        {/* Datos empresa y trabajador */}
        <View style={s.dataBox}>
          <Text style={s.dataBoxTitle}>Datos de la empresa y trabajador autorizado</Text>
          <View style={s.dataRow}>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>Empresa:</Text>
              <Text style={s.dataValue}>{campos.empresa_nombre}</Text>
            </View>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>Obra / Centro:</Text>
              <Text style={s.dataValue}>{campos.obra_centro}</Text>
            </View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>Trabajador:</Text>
              <Text style={s.dataValue}>{campos.empleado_nombre}</Text>
            </View>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>DNI / NIE:</Text>
              <Text style={s.dataValue}>{campos.empleado_dni}</Text>
            </View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>Puesto / Oficio:</Text>
              <Text style={s.dataValue}>{campos.empleado_puesto}</Text>
            </View>
            <View style={s.dataField}>
              <Text style={s.dataLabel}>Fecha de emisión:</Text>
              <Text style={s.dataValue}>{campos.fecha_emision}</Text>
            </View>
          </View>
        </View>

        {/* Sección 1: Equipos */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>1. Equipos de Trabajo / Maquinaria Objeto de la Autorización</Text>
        </View>
        <Text style={{ fontSize: 8, marginBottom: 6, color: '#444' }}>
          Se autoriza expresamente al trabajador indicado a la operación, manejo y uso de los siguientes equipos:
        </Text>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, s.checkCell]}>[X]</Text>
            <Text style={[s.tableHeadCell, s.equipoCell]}>Tipo de Maquinaria / Equipo / Herramienta</Text>
            <Text style={[s.tableHeadCell, s.requisitosCell]}>Requisitos específicos verificados (Formación / Carnet)</Text>
          </View>
          {TODOS_EQUIPOS.map((eq, i) => {
            const info = EQUIPOS[eq]
            const autorizado = campos.equipos.includes(eq)
            const label = eq === 'otros' && campos.otros_descripcion
              ? `Otros: ${campos.otros_descripcion}`
              : info.label
            return (
              <View key={eq} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={s.checkCell}>{autorizado ? '[X]' : '[ ]'}</Text>
                <Text style={s.equipoCell}>{label}</Text>
                <Text style={s.requisitosCell}>{info.requisitos}</Text>
              </View>
            )
          })}
        </View>

        {/* Sección 2: Condiciones */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>2. Condiciones y Obligaciones del Operador Autorizado</Text>
        </View>

        <View style={s.bulletList}>
          {[
            ['Inspección previa:', 'Antes de comenzar la jornada, revisará los elementos de seguridad del equipo (frenos, luces, alarmas, mandos, protecciones).'],
            ['Uso exclusivo:', 'Queda terminantemente prohibido ceder o permitir el uso de la máquina a personal no autorizado.'],
            ['Respetar capacidades:', 'No se sobrepasará bajo ningún concepto la carga máxima de utilización ni los límites especificados por el fabricante.'],
            ['Notificación de averías:', 'Si detecta anomalías o fallos estructurales/mecánicos, parará el equipo inmediatamente, lo señalizará y avisará al encargado.'],
            ['Medidas de seguridad de la obra:', 'Se respetarán las velocidades máximas de circulación en la obra y se mantendrá la distancia de seguridad con zanjas, taludes y líneas eléctricas.'],
          ].map(([bold, rest], i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>
                <Text style={s.bulletBold}>{bold} </Text>
                {rest}
              </Text>
            </View>
          ))}
        </View>

        {/* Firmas */}
        <View style={s.signatureSection}>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Firma del Trabajador Autorizado</Text>
            <Text style={s.signatureSubLabel}>(Recibe y acepta las condiciones)</Text>
          </View>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Firma del Representante Legal / Dirección de Obra</Text>
            <Text style={s.signatureSubLabel}>(Otorga la autorización)</Text>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
