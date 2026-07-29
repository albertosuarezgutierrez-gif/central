/**
 * Plantillas PDF para documentos PRL y RGPD.
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

// ─── Recibo de Entrega de EPIs ────────────────────────────────────────────────

export type EpiId =
  | 'casco'
  | 'calzado'
  | 'gafas'
  | 'guantes'
  | 'alta_visibilidad'
  | 'auditiva'
  | 'mascarilla'
  | 'arnes'

export type CamposEntregaEpis = {
  empresa_nombre: string
  empresa_color: string
  empresa_logo_b64: string | null
  empleado_nombre: string
  empleado_dni: string
  empleado_puesto: string
  obra_centro: string
  fecha_emision: string
  epis: EpiId[]
}

const EPIS_LISTA: { id: EpiId; label: string; norma: string; cantidad: string }[] = [
  { id: 'casco', label: 'Casco de protección para industria', norma: 'EN 397', cantidad: '1 ud.' },
  { id: 'calzado', label: 'Calzado de seguridad con puntera y plantilla', norma: 'EN ISO 20345', cantidad: '1 par' },
  { id: 'gafas', label: 'Gafas de protección contra impactos', norma: 'EN 166', cantidad: '1 ud.' },
  { id: 'guantes', label: 'Guantes de protección mecánica', norma: 'EN 388', cantidad: '1 par' },
  { id: 'alta_visibilidad', label: 'Ropa de alta visibilidad', norma: 'EN ISO 20471', cantidad: '—' },
  { id: 'auditiva', label: 'Protección auditiva (Tapones / Orejeras)', norma: 'EN 352', cantidad: '—' },
  { id: 'mascarilla', label: 'Mascarilla de protección respiratoria (FFP2/FFP3)', norma: 'EN 149', cantidad: '—' },
  { id: 'arnes', label: 'Arnés de seguridad anticaídas (*si procede)', norma: 'EN 361', cantidad: '—' },
]

export function EntregaEpisPdf(campos: CamposEntregaEpis) {
  const s = makeStyles(campos.empresa_color || '#1a56db')
  const tblHead = StyleSheet.create({
    thEpi: { flex: 2.2, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    thNorma: { width: 68, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    thCe: { width: 40, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    thCant: { width: 38, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    thFirma: { width: 52, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    tdEpi: { flex: 2.2, fontSize: 7.5 },
    tdNorma: { width: 68, fontSize: 7.5, color: '#444' },
    tdCe: { width: 40, fontSize: 7.5 },
    tdCant: { width: 38, fontSize: 7.5 },
    tdFirma: { width: 52, fontSize: 7.5 },
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          {campos.empresa_logo_b64 && <Image src={campos.empresa_logo_b64} style={s.logo} />}
          <Text style={s.empresaNombre}>{campos.empresa_nombre}</Text>
        </View>

        <Text style={s.title}>RECIBO DE ENTREGA E INFORMACIÓN DE EQUIPOS DE PROTECCIÓN INDIVIDUAL (EPIs)</Text>
        <Text style={s.subtitle}>Cumplimiento del Real Decreto 773/1997 y la Ley 31/1995 de Prevención de Riesgos Laborales.</Text>

        <View style={s.dataBox}>
          <Text style={s.dataBoxTitle}>Datos de la empresa y trabajador</Text>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Empresa:</Text><Text style={s.dataValue}>{campos.empresa_nombre}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>Obra / Centro:</Text><Text style={s.dataValue}>{campos.obra_centro}</Text></View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Trabajador:</Text><Text style={s.dataValue}>{campos.empleado_nombre}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>DNI / NIE:</Text><Text style={s.dataValue}>{campos.empleado_dni}</Text></View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Puesto / Oficio:</Text><Text style={s.dataValue}>{campos.empleado_puesto}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>Fecha:</Text><Text style={s.dataValue}>{campos.fecha_emision}</Text></View>
          </View>
        </View>

        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>1. Relación de Equipos de Protección Individual (EPIs) Entregados</Text>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={tblHead.thEpi}>Equipo de Protección / Descripción</Text>
            <Text style={tblHead.thNorma}>Norma</Text>
            <Text style={tblHead.thCe}>Marcado CE</Text>
            <Text style={tblHead.thCant}>Cantidad</Text>
            <Text style={tblHead.thFirma}>Firma Recibí</Text>
          </View>
          {EPIS_LISTA.map((epi, i) => {
            const entregado = campos.epis.includes(epi.id)
            return (
              <View key={epi.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={tblHead.tdEpi}>{entregado ? '[X] ' : '[ ] '}{epi.label}</Text>
                <Text style={tblHead.tdNorma}>{epi.norma}</Text>
                <Text style={tblHead.tdCe}>Sí [ ]</Text>
                <Text style={tblHead.tdCant}>{entregado ? epi.cantidad : '—'}</Text>
                <Text style={tblHead.tdFirma}> </Text>
              </View>
            )
          })}
        </View>

        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>2. Compromiso y Declaración del Trabajador</Text>
        </View>

        <Text style={{ fontSize: 8, marginBottom: 6, color: '#333' }}>
          El trabajador abajo firmante declara haber recibido los Equipos de Protección Individual arriba indicados, así como las instrucciones de uso, mantenimiento y conservación correspondientes. Asimismo, se compromete a:
        </Text>

        <View style={s.bulletList}>
          {[
            ['Utilizar obligatoriamente', ' los EPIs en el desempeño de sus funciones y conforme a las instrucciones recibidas.'],
            ['Velar por el buen estado', ' de conservación, limpieza e higiene de los equipos que le han sido asignados.'],
            ['Informar de inmediato', ' a su superior o al recurso preventivo en caso de deterioro, pérdida o mal funcionamiento para proceder a su sustitución.'],
            ['No realizar alteraciones', ' ni modificaciones de ningún tipo en los equipos de protección entregados.'],
          ].map(([bold, rest], i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}><Text style={s.bulletBold}>{bold}</Text>{rest}</Text>
            </View>
          ))}
        </View>

        <View style={s.signatureSection}>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Firma del Trabajador</Text>
            <Text style={s.signatureSubLabel}>DNI: {campos.empleado_dni}</Text>
          </View>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Por la Empresa / Responsable de PRL</Text>
            <Text style={s.signatureSubLabel}>Firma y Sello</Text>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}

// ─── Ficha Información Riesgos Art. 18 ───────────────────────────────────────

export type CamposInformacionRiesgos = {
  empresa_nombre: string
  empresa_color: string
  empresa_logo_b64: string | null
  empleado_nombre: string
  empleado_dni: string
  empleado_puesto: string
  obra_centro: string
  fecha_emision: string
}

const RIESGOS_GENERALES = [
  'Caídas de personas a distinto nivel (huecos, andamios, cubiertas, bordes de forjado).',
  'Caídas de objetos por desplome, desprendimiento o manipulación.',
  'Atropellos, golpes y choques con vehículos o maquinaria de obra en movimiento.',
  'Pisadas sobre objetos punzantes (clavos, ferralla, maderas).',
  'Contactos eléctricos directos e indirectos (cuadros provisionales, líneas aéreas/subterráneas).',
]

const RIESGOS_ESPECIFICOS: { riesgo: string; medida: string }[] = [
  {
    riesgo: 'Caídas a distinto nivel en bordes de forjado o excavaciones.',
    medida: 'Verificar que las barandillas perimetrales, redes o redes de protección están correctamente colocadas. No retirar protecciones colectivas.',
  },
  {
    riesgo: 'Cortes y proyecciones de partículas por el uso de herramientas de corte.',
    medida: 'Uso obligatorio de gafas de seguridad, pantallas faciales y guantes de protección mecánica. Comprobar que la herramienta dispone de carcasa de protección.',
  },
  {
    riesgo: 'Exposición a ruido y polvo ambiental en fases de picado, perforación o corte.',
    medida: 'Uso obligatorio de protección auditiva y mascarillas de filtración (mínimo FFP2). Utilizar sistemas de captación o humectación si es posible.',
  },
  {
    riesgo: 'Sobreesfuerzos y trastornos musculoesqueléticos en la manipulación manual de cargas.',
    medida: 'No levantar cargas superiores a 25 kg de forma manual de manera individual. Doblar las rodillas manteniendo la espalda recta o solicitar ayuda mecánica/compañeros.',
  },
]

export function InformacionRiesgosPdf(campos: CamposInformacionRiesgos) {
  const s = makeStyles(campos.empresa_color || '#1a56db')
  const rCol = StyleSheet.create({
    thRiesgo: { flex: 1.2, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    thMedida: { flex: 1.8, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff' },
    tdRiesgo: { flex: 1.2, fontSize: 7.5 },
    tdMedida: { flex: 1.8, fontSize: 7.5, color: '#333' },
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          {campos.empresa_logo_b64 && <Image src={campos.empresa_logo_b64} style={s.logo} />}
          <Text style={s.empresaNombre}>{campos.empresa_nombre}</Text>
        </View>

        <Text style={s.title}>FICHA DE INFORMACIÓN DE RIESGOS LABORALES Y MEDIDAS PREVENTIVAS</Text>
        <Text style={s.subtitle}>En cumplimiento del Artículo 18 de la Ley 31/1995 de Prevención de Riesgos Laborales.</Text>

        <View style={s.dataBox}>
          <Text style={s.dataBoxTitle}>Datos del puesto de trabajo informativo</Text>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Empresa:</Text><Text style={s.dataValue}>{campos.empresa_nombre}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>Obra / Centro:</Text><Text style={s.dataValue}>{campos.obra_centro}</Text></View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Trabajador:</Text><Text style={s.dataValue}>{campos.empleado_nombre}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>DNI / NIE:</Text><Text style={s.dataValue}>{campos.empleado_dni}</Text></View>
          </View>
          <View style={s.dataRow}>
            <View style={s.dataField}><Text style={s.dataLabel}>Puesto / Oficio:</Text><Text style={s.dataValue}>{campos.empleado_puesto}</Text></View>
            <View style={s.dataField}><Text style={s.dataLabel}>Fecha de entrega:</Text><Text style={s.dataValue}>{campos.fecha_emision}</Text></View>
          </View>
        </View>

        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>1. Riesgos Generales de la Obra de Construcción</Text>
        </View>
        <View style={s.bulletList}>
          {RIESGOS_GENERALES.map((r, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{r}</Text>
            </View>
          ))}
        </View>

        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>2. Riesgos Específicos del Puesto de Trabajo y Medidas Preventivas</Text>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={rCol.thRiesgo}>Riesgo Identificado</Text>
            <Text style={rCol.thMedida}>Medida Preventiva Obligatoria</Text>
          </View>
          {RIESGOS_ESPECIFICOS.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={rCol.tdRiesgo}>{r.riesgo}</Text>
              <Text style={rCol.tdMedida}>{r.medida}</Text>
            </View>
          ))}
        </View>

        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>3. Medidas de Emergencia y Primeros Auxilios</Text>
        </View>

        <Text style={{ fontSize: 8, marginBottom: 6, color: '#333' }}>
          En caso de emergencia en la obra, todo trabajador deberá seguir las pautas de actuación generales establecidas (Protocolo PAS: Proteger, Avisar, Socorrer):
        </Text>
        <View style={s.bulletList}>
          {[
            '1. Mantener la calma y avisar inmediatamente al Encargado de Obra o al Recurso Preventivo.',
            '2. Si suena la alarma de evacuación, dirigirse de forma ordenada hacia el Punto de Encuentro establecido, sin correr ni detenerse a recoger enseres personales.',
            '3. No realizar intervenciones sanitarias si no se dispone de formación en primeros auxilios.',
          ].map((t, i) => (
            <View key={i} style={s.bullet}>
              <Text style={{ ...s.bulletText, marginLeft: 4 }}>{t}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 8, padding: '6 8', border: '0.5 solid #aaa', borderRadius: 3 }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Declaración de conformidad:</Text>
          <Text style={{ fontSize: 7.5, textAlign: 'justify' }}>
            El trabajador abajo firmante reconoce haber recibido información verbal y escrita detallada acerca de los riesgos inherentes a su puesto de trabajo en la obra, así como las medidas preventivas, normas de seguridad y pautas de emergencia que debe adoptar para evitarlos, de conformidad con lo establecido en el Artículo 18 de la Ley de Prevención de Riesgos Laborales.
          </Text>
        </View>

        <View style={s.signatureSection}>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Firma del Trabajador</Text>
            <Text style={s.signatureSubLabel}>DNI y Fecha: {campos.empleado_dni} · {campos.fecha_emision}</Text>
          </View>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Por la Empresa / Técnico de Prevención</Text>
            <Text style={s.signatureSubLabel}>Firma y Sello</Text>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}

// ─── Acuerdo de Confidencialidad RGPD ────────────────────────────────────────

export type CamposAcuerdoConfidencialidad = {
  empresa_nombre: string
  empresa_nif: string
  empresa_representante: string
  empresa_representante_nif: string
  empresa_domicilio: string
  empresa_localidad: string
  empresa_email: string
  empresa_color: string
  empresa_logo_b64: string | null
  empleado_nombre: string
  empleado_dni: string
  fecha_emision: string   // 'DD/MM/YYYY'
  tipo: 'con_acceso' | 'sin_acceso'
}

const legalStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: '28 42', color: '#1a1a1a', lineHeight: 1.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  logo: { maxHeight: 44, maxWidth: 110, objectFit: 'contain' },
  empresaNombreH: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  titleMain: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  titleSub: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase' },
  locationDate: { textAlign: 'right', fontSize: 8.5, marginBottom: 14 },
  body: { fontSize: 8.5, marginBottom: 8, textAlign: 'justify' },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 10, marginBottom: 6 },
  clauseTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 4 },
  clauseText: { fontSize: 8.5, marginBottom: 6, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  signatureSection: { marginTop: 28, flexDirection: 'row', gap: 20 },
  signatureBox: { flex: 1, alignItems: 'center' },
  signatureLine: { borderTop: '0.5 solid #333', width: '100%', marginBottom: 4 },
  signatureLabel: { fontSize: 7.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  signatureSubLabel: { fontSize: 7, textAlign: 'center', color: '#555' },
  pageNumber: { position: 'absolute', bottom: 16, right: 42, fontSize: 7, color: '#999' },
})

const CLAUSULAS_COMUNES = [
  ['1.- Información confidencial',
    'Se entenderá por «información confidencial» toda información relativa a una persona física identificada o identificable por la cual pueda determinarse, directa o indirectamente su identidad, sea mediante identificador, nombre, número, localización o elementos propios de la identidad física, fisiológica, genética, psíquica, económica, cultural o social de dicha persona.\n\nLa información antes referida incluye los secretos comerciales establecidos en la Ley 1/2019, de 20 de febrero, de Secretos Empresariales, abarcando técnicas, programas de formación, investigación y desarrollo, ideas, invenciones, conceptos, diseños, procesos, know-how, fórmulas, datos, programas informáticos, descubrimientos, materiales de marketing, nombres de clientes, canales de comercialización, secretos comerciales, listas de precios, políticas de precios, información financiera, presupuestos y métodos de gestión y contabilidad.'],
  ['2.- Compromiso de confidencialidad y secreto profesional',
    'La PERSONA se compromete a cumplir con las instrucciones determinadas por el RESPONSABLE para garantizar la confidencialidad y el secreto profesional de toda la «información confidencial», por lo que se obliga explícitamente a no divulgarla, publicarla, cederla, venderla, ni de otra forma, directa o indirecta, ponerla a disposición de terceros, ni total ni parcialmente, y a cumplir esta obligación incluso con sus propios familiares u otros miembros de la organización que no estén autorizados a acceder a dicha información, cualquiera que sea el soporte en el que la contenga.'],
  ['3.- Propiedad de la «información confidencial»',
    'La PERSONA reconoce la propiedad del RESPONSABLE respecto de todos los datos considerados «información confidencial» y se compromete a devolver todas las copias de dicha información y cualquier soporte físico que estén bajo su control al RESPONSABLE si este lo solicita.'],
  ['4.- Tratamiento de datos',
    'La PERSONA declara conocer las políticas de información y de seguridad establecidas por el RESPONSABLE para garantizar la protección de datos y se compromete a seguir las instrucciones en ellas reflejadas y, en caso de percibir que están siendo violadas, a notificarlo sin demora injustificada al RESPONSABLE para su conocimiento y aplicación de medidas correctivas.'],
  ['5.- Responsabilidad de la PERSONA',
    'La PERSONA será responsable frente al RESPONSABLE y terceros de cualquier perjuicio que pudiera derivarse para unos y otros del incumplimiento de los compromisos de este acuerdo, pudiendo suponer el inicio de acciones legales, así como la reclamación de las indemnizaciones, sanciones y daños o perjuicios que el RESPONSABLE se vea obligado a atender.'],
  ['7.- Fin de la prestación de servicio',
    'El cumplimiento de las obligaciones contenidas en este acuerdo es de carácter indefinido y se mantendrá en vigor con posterioridad a la finalización de la relación entre la PERSONA y el RESPONSABLE. Por ello, la PERSONA garantiza que, tras terminar la relación, guardará el mismo secreto profesional respecto de la «información confidencial» a que haya tenido acceso durante el desempeño de sus funciones.'],
]

export function AcuerdoConfidencialidadPdf(campos: CamposAcuerdoConfidencialidad) {
  const s = legalStyles
  const esCon = campos.tipo === 'con_acceso'
  const subtitulo = esCon
    ? 'PERSONA AUTORIZADA PARA EL TRATAMIENTO DE DATOS'
    : 'PERSONA SIN PERMISO DE ACCESO A DATOS'

  const manifiesto2 = esCon
    ? `Que en virtud de la prestación de servicios laborales o profesionales que D/DÑA. ${campos.empleado_nombre} viene realizando a favor del RESPONSABLE, tendrá acceso al tratamiento de datos personales y a información confidencial.`
    : `Que en virtud de la prestación de servicios laborales o profesionales que ${campos.empleado_nombre} viene realizando a favor del RESPONSABLE, no le resulta necesario el acceso ni el tratamiento de datos personales ni de información confidencial, por lo que no está autorizado a utilizar los recursos que contienen dicha información.`

  const clausulaAcceso2 = esCon
    ? 'La PERSONA accederá a la «información confidencial» solo si es necesario para la prestación de los servicios para los que ha sido contratado y exclusivamente para los fines autorizados por el RESPONSABLE.\n\nLos medios de trabajo proporcionados por el RESPONSABLE (ordenadores, internet, correo electrónico, etc.) serán utilizados única y exclusivamente para el desarrollo eficiente del propio trabajo, por lo que queda informado que el RESPONSABLE podrá realizar tareas de verificación, vigilancia y control sobre dichos medios en base al artículo 20.3 del Estatuto de los Trabajadores.'
    : ''

  const clausula6 = esCon
    ? `Conforme al GDPR, el RESPONSABLE informa a la PERSONA de que sus datos personales obtenidos en el momento de la contratación, los comunicados a lo largo de la duración del contrato y aquellos que le comunique en el futuro para el cumplimiento de sus obligaciones legales se tratarán con el fin de gestionar la relación profesional que les une, se conservarán mientras existan prescripciones legales que dictaminen su custodia y no se comunicarán a terceros, salvo obligación legal.\n\nEl RESPONSABLE informa de que la PERSONA puede ejercer en cualquier momento los derechos de acceso, rectificación y supresión de sus datos, y los de limitación y oposición a su tratamiento dirigiéndose a ${campos.empresa_domicilio}. E-mail: ${campos.empresa_email}. Si considera que el tratamiento no se ajusta a la normativa vigente, podrá presentar una reclamación ante la autoridad de control en www.aepd.es.`
    : `Conforme al GDPR, el RESPONSABLE informa a la PERSONA de que sus datos personales obtenidos en el momento de su contratación se tratarán con el fin de gestionar la relación laboral que les une, se conservarán mientras existan prescripciones legales que dictaminen su custodia y no se comunicarán a terceros, salvo obligación legal.\n\nEl RESPONSABLE informa de que la PERSONA puede ejercer en cualquier momento los derechos de acceso, rectificación y supresión de sus datos y los de limitación y oposición a su tratamiento dirigiéndose a ${campos.empresa_domicilio}. E-mail: ${campos.empresa_email}. Si considera que el tratamiento no se ajusta a la normativa vigente, podrá presentar una reclamación ante la autoridad de control en www.aepd.es.`

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Cabecera */}
        <View style={s.headerRow}>
          {campos.empresa_logo_b64 && <Image src={campos.empresa_logo_b64} style={s.logo} />}
          <Text style={s.empresaNombreH}>{campos.empresa_nombre}</Text>
        </View>

        <Text style={s.titleMain}>ACUERDO DE CONFIDENCIALIDAD Y SECRETO PROFESIONAL</Text>
        <Text style={s.titleSub}>{subtitulo}</Text>

        <Text style={s.locationDate}>{campos.empresa_localidad}, {campos.fecha_emision}</Text>

        {/* Reunidos */}
        <Text style={s.body}>
          Reunidos de una parte, <Text style={s.bold}>{campos.empresa_representante}</Text>, con NIF <Text style={s.bold}>{campos.empresa_representante_nif}</Text>, en nombre y representación de <Text style={s.bold}>{campos.empresa_nombre}</Text>, con NIF <Text style={s.bold}>{campos.empresa_nif}</Text> y domicilio social situado en {campos.empresa_domicilio}, en adelante, <Text style={s.bold}>RESPONSABLE</Text>.
        </Text>
        <Text style={s.body}>
          Y de la otra, D/DÑA <Text style={s.bold}>{campos.empleado_nombre}</Text>, con NIF <Text style={s.bold}>{campos.empleado_dni}</Text>, mayor de edad y en su propio nombre y representación, en adelante, <Text style={s.bold}>PERSONA</Text>.
        </Text>
        <Text style={s.body}>
          Ambas partes se reconocen recíprocamente la capacidad legal necesaria para suscribir el presente contrato de prestación de servicios {esCon ? 'con acceso a datos personales' : 'sin acceso a datos personales'} y
        </Text>

        {/* Manifiestan */}
        <Text style={s.sectionTitle}>MANIFIESTAN</Text>

        <Text style={s.body}>
          1. Que <Text style={s.bold}>{campos.empresa_nombre}</Text> es Responsable del tratamiento de datos personales objeto de este acuerdo en conformidad con lo dispuesto en el Reglamento (UE) 2016/679, de 27 de abril (GDPR), y la Ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD).
        </Text>
        <Text style={s.body}>2. {manifiesto2}</Text>
        <Text style={s.body}>
          3. Que la PERSONA conoce y acepta que mantener la confidencialidad de dicha información es esencial en el sector en que desarrolla sus actividades y que, por ello, no respetar dicha confidencialidad causa un perjuicio gravísimo al RESPONSABLE.
        </Text>
        <Text style={s.body}>
          4. Que, en cumplimiento de lo dispuesto en el artículo 29 del GDPR y en el 5 de la LOPDGDD, la PERSONA es consciente de que {esCon ? 'está obligada al secreto profesional respecto de los datos personales que trate y al deber de protegerlos' : 'si tuviese acceso a datos personales de manera accidental o fortuita estará obligada al secreto profesional respecto de los datos que trate y al deber de protegerlos'}, obligaciones que subsistirán aún después de finalizar sus relaciones con el RESPONSABLE, por lo cual ambas partes convienen suscribir el presente acuerdo con sujeción a las siguientes
        </Text>

        {/* Instrucciones */}
        <Text style={s.sectionTitle}>INSTRUCCIONES PARA EL TRATAMIENTO DE DATOS</Text>

        {CLAUSULAS_COMUNES.map(([titulo, texto], i) => (
          <View key={i}>
            <Text style={s.clauseTitle}>{titulo}</Text>
            <Text style={s.clauseText}>{texto}</Text>
            {titulo.startsWith('2.-') && clausulaAcceso2 ? (
              <Text style={s.clauseText}>{clausulaAcceso2}</Text>
            ) : null}
          </View>
        ))}

        <Text style={s.clauseTitle}>6.- Protección de datos</Text>
        <Text style={s.clauseText}>{clausula6}</Text>

        {/* Cierre */}
        <Text style={s.body}>
          Y para que conste a los efectos oportunos, en prueba de conformidad de las partes, firman el presente acuerdo, por duplicado, en el lugar y la fecha indicados en el encabezamiento.
        </Text>

        {/* Firmas */}
        <View style={s.signatureSection}>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>{campos.empresa_nombre}</Text>
            <Text style={s.signatureSubLabel}>{campos.empresa_representante} · {campos.empresa_representante_nif}</Text>
          </View>
          <View style={s.signatureBox}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>D/DÑA.: {campos.empleado_nombre}</Text>
            <Text style={s.signatureSubLabel}>DNI: {campos.empleado_dni}</Text>
          </View>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
