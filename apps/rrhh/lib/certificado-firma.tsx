import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { marginBottom: 24, borderBottom: '2 solid #1a56db', paddingBottom: 12 },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1a56db', marginBottom: 4 },
  subtitulo: { fontSize: 9, color: '#555' },
  seccion: { marginBottom: 16 },
  seccionTitulo: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1a56db', marginBottom: 6, borderBottom: '1 solid #dde3f0', paddingBottom: 3 },
  fila: { flexDirection: 'row', marginBottom: 4 },
  etiqueta: { width: 140, fontFamily: 'Helvetica-Bold', color: '#444' },
  valor: { flex: 1, color: '#111' },
  hash: { flex: 1, color: '#111', fontSize: 8, fontFamily: 'Courier' },
  pie: { marginTop: 24, paddingTop: 10, borderTop: '1 solid #dde3f0', fontSize: 8, color: '#888' },
  badge: { marginTop: 16, padding: 8, backgroundColor: '#f0f4ff', borderRadius: 4 },
  badgeText: { fontSize: 8, color: '#333', textAlign: 'center' as const },
})

export type DatosCertificado = {
  documento_nombre: string
  empresa_nombre: string
  firmante_empresa_nombre: string
  firma_empresa_fecha: string
  firma_empresa_hash: string
  firmante_empleado_nombre: string
  firmante_empleado_dni: string | null
  firma_empleado_fecha: string
  firma_empleado_metodo: string
  firma_empleado_hash: string
}

function formatFecha(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} UTC`
}

function formatMetodo(m: string) {
  if (m === 'sesion_token') return 'Acceso por token de sesión único'
  if (m === 'otp_email') return 'Código OTP por email'
  return m
}

export function CertificadoFirmaPdf({ datos }: { datos: DatosCertificado }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.titulo}>CERTIFICADO DE FIRMA ELECTRÓNICA</Text>
          <Text style={s.subtitulo}>Firma electrónica avanzada · eIDAS art. 26 · LSSI-CE</Text>
        </View>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>DOCUMENTO</Text>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Nombre</Text>
            <Text style={s.valor}>{datos.documento_nombre}</Text>
          </View>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Empresa</Text>
            <Text style={s.valor}>{datos.empresa_nombre}</Text>
          </View>
        </View>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>FIRMA 1 · EMPRESA (representante legal)</Text>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Firmante</Text>
            <Text style={s.valor}>{datos.firmante_empresa_nombre}</Text>
          </View>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Fecha y hora</Text>
            <Text style={s.valor}>{formatFecha(datos.firma_empresa_fecha)}</Text>
          </View>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Hash SHA-256 (doc)</Text>
            <Text style={s.hash}>{datos.firma_empresa_hash}</Text>
          </View>
        </View>

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>FIRMA 2 · EMPLEADO</Text>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Firmante</Text>
            <Text style={s.valor}>{datos.firmante_empleado_nombre}</Text>
          </View>
          {datos.firmante_empleado_dni && (
            <View style={s.fila}>
              <Text style={s.etiqueta}>DNI/NIE</Text>
              <Text style={s.valor}>{datos.firmante_empleado_dni}</Text>
            </View>
          )}
          <View style={s.fila}>
            <Text style={s.etiqueta}>Fecha y hora</Text>
            <Text style={s.valor}>{formatFecha(datos.firma_empleado_fecha)}</Text>
          </View>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Método de autenticación</Text>
            <Text style={s.valor}>{formatMetodo(datos.firma_empleado_metodo)}</Text>
          </View>
          <View style={s.fila}>
            <Text style={s.etiqueta}>Hash SHA-256 (doc)</Text>
            <Text style={s.hash}>{datos.firma_empleado_hash}</Text>
          </View>
        </View>

        <View style={s.badge}>
          <Text style={s.badgeText}>
            Este certificado acredita que el documento adjunto ha sido firmado electrónicamente por las partes indicadas.
            {'\n'}La integridad del documento puede verificarse comparando el hash SHA-256 del archivo con el registrado en este certificado.
            {'\n'}Firma electrónica avanzada conforme al art. 26 del Reglamento (UE) Nº 910/2014 (eIDAS).
          </Text>
        </View>

        <View style={s.pie}>
          <Text>Generado automáticamente por el sistema de RR.HH. · Este documento tiene validez legal como evidencia de firma electrónica.</Text>
        </View>
      </Page>
    </Document>
  )
}
