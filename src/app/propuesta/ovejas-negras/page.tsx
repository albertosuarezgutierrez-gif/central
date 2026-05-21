'use client'
import PropuestaBase, {
  ClienteConfig,
  MODULO_ASISTENTE_COCINA,
  MODULO_ANALISIS_CARTA,
  MODULO_RECEPCION,
  MODULO_VINOS,
  MODULO_EVENTOS,
  MODULO_RRHH,
  ModuloCustom,
} from '@/components/propuesta/PropuestaBase'

const C = { red:'#D9442B', gold:'#C9A84C', green:'#3F7D44', teal:'#2B6A6E', amber:'#E8A33B' }

const config: ClienteConfig = {
  nombre: 'Ovejas Negras',
  grupo: 'Ovejas Negras · Batuta · Serendipia · Eslava',
  emailContacto: 'alberto.suarez.gutierrez@gmail.com',
  contactoNombre: 'Ricardo Fernández',
  fechaReunion: '20 de mayo de 2026',
  lugarReunion: 'Espacio Eslava',
  tagsIntro: ['50 restaurantes', '8M€ en mercadería', '1.000 albaranes/mes', 'Alta rotación de personal'],
  citas: [
    { cita: '"No sabemos dónde va el solomillo de cerdo."', modulo: 'Asistente IA cocina', color: C.teal },
    { cita: '"Una desviación del 1% en 8 millones. La dejancia pura."', modulo: 'Recepción mercancía', color: C.green },
    { cita: '"Compramos y compramos sin saber qué sale."', modulo: 'Análisis de carta', color: C.gold },
    { cita: '"Eslava tiene una bodega que nadie vende."', modulo: 'Bodega inteligente', color: '#8B4E9E' },
    { cita: '"Me cuesta creer que un sistema lo haga todo bien."', modulo: 'La integración', color: C.red },
  ],
  headline: '50 mesas · 5 zonas · 3 partidas · 14 camareros',
  partidas: [
    { nombre:'Cocina caliente', secciones:['Principales','Entrantes calientes'], color:'#D9442B', icon:'🔥' },
    { nombre:'Cocina fría', secciones:['Ensaladas','Entrantes fríos','Postres'], color:C.teal, icon:'❄️' },
    { nombre:'Barra', secciones:['Bebidas','Cafés','Copas'], color:C.gold, icon:'🍺' },
  ],
  pasosFlujo: [
    { actor:'Camarero', accion:'Dice la comanda por voz en sala', icon:'🎙️', color:'#F6F1E7' },
    { actor:'ia.rest', accion:'Detecta qué va a cada partida automáticamente', icon:'✦', color:C.red },
    { actor:'Cocina caliente', accion:'Ve solo sus platos en su pantalla (vista Producción)', icon:'🔥', color:'#D9442B' },
    { actor:'Barra', accion:'Ve solo sus bebidas simultáneamente', icon:'🍺', color:C.gold },
    { actor:'Jefe de cocina', accion:'Pregunta al asistente IA: "¿Cuántos solomillos pendientes?"', icon:'✦', color:C.teal },
    { actor:'Marcha', accion:'Todo listo → imprime ticket de pase automático', icon:'🖨️', color:C.green },
  ],
  sinKDSMensaje: 'Para los locales que todavía van a papel: una impresora térmica por partida (desde 80€) recibe el ticket automáticamente. El papel desaparece solo.',
  slideStockLabel: 'Los 8M€',
  mercaderiaAnual: '8.000.000 €',
  desviacion1pct: '80.000 €',
  citaStock: 'La dejancia pura.',
  hoyVsIaRest: {
    hoy: ['Recepción manual sin cruce vs pedido', 'Caducidades a ojo o en papel', '€0,30 por albarán digitalizar', 'Sin historial de precios', 'Mermas no registradas', 'Sin alerta de retirada de mercado'],
    iaRest: ['📷 Foto del albarán → lista completa en 10s', 'Caducidad escaneada + alerta push automática', '€0 por albarán incluido en el plan', 'Detecta subidas de precio vs media 90 días', 'Mermas registradas por proveedor y lote', '🔍 Link RASFF UE por cada producto recibido'],
  },
  datosEstrategicos: [
    { titulo:"Central de compras", desc:"2% sobre 8M€ en volumen = 160.000€/año para el grupo." },
    { titulo:"Inteligencia de precios", desc:"Detección temprana de subidas. \"Tu restaurante paga 23% más de jamón que la media del grupo.\" Con historial 90 días por artículo y proveedor." },
    { titulo:"Trazabilidad FEFO + RASFF", desc:"Cada lote registrado. Alerta push cuando caduca. Link directo al portal alertas UE (RASFF) por producto." },
    { titulo:"Benchmarking sectorial", desc:"Datos agregados de todos tus locales. Nadie en el sector tiene esto." },
  ],
  modulos: [
    MODULO_ASISTENTE_COCINA({ roi:'Con 3 partidas y 14 camareros, el jefe no puede estar en todos lados. La IA coordina.' }),
    MODULO_ANALISIS_CARTA(),
    MODULO_RECEPCION({
      sub: '1 foto. Lista completa. Stock actualizado.',
      desc: 'El recepcionista hace una foto del albarán y la IA extrae todos los artículos, cantidades y precios automáticamente. Stock actualizado en 30 segundos. Trazabilidad de lote y caducidad incluida.',
      ejemplos: [
        '📷 Foto albarán → pre-carga todos los ítems con cantidades y precios',
        '🏷️ EAN del producto → nombre e ingredientes desde base de datos global (4M productos)',
        '📊 Comparador de precios: "Este jamón subió un 12% vs media 90 días"',
        '🗓 Panel FEFO: lotes ordenados por caducidad + push automático cuando quedan 3 días',
        '🔍 Link RASFF (alertas UE) por cada producto recibido — trazabilidad legal',
      ],
      roi: '1.000 albaranes/mes × 3 min = 50h/mes. En 50 locales: más de 2.500h al año. Y un 1% de desviación en 8M€ son 80.000€.',
    }),
    {
      emoji: '🔄',
      titulo: 'Ciclo de compras cerrado',
      sub: 'Del stock al proveedor. Del proveedor al stock. Sin fricción.',
      desc: 'Flujo completo adaptable a cualquier forma de trabajar: pedido automático por stock, confirmación por IA con eventos, portal ASN para que el proveedor pre-notifique el envío, y notificación automática vía WhatsApp cuando hay incidencias.',
      ejemplos: [
        '✦ IA sugiere cantidades cruzando stock actual + eventos próximos (Feria, Semana Santa…)',
        '🔗 Portal ASN: el proveedor sube su albarán antes de llegar → recepción pre-cargada',
        '📱 WhatsApp automático al proveedor si hay merma o precio diferente al acordado',
        '📊 Ficha por proveedor: fiabilidad %, incidencias por tipo, desviación de precio media',
        '📄 Informe para reunión mensual con 1 clic — sin Excel, sin copiar y pegar',
        '👤 "Jefe de compras" configurable: owner, contable, jefe sala, gestor externo',
      ],
      ruta: '/owner → Proveedores',
      color: '#2B6A6E',
      roi: 'La incidencia que no se registra, no se resuelve. Con 8M€ en mercadería, 1 incidencia detectada al mes ya cubre el coste anual del sistema.',
      activo: true,
    } as ModuloCustom,
    {
      emoji: '📷',
      titulo: 'Scanner inteligente',
      sub: 'Un botón. Todo tipo de documentos.',
      desc: 'La misma cámara lee albaranes, etiquetas de producto, facturas y CVs. Si la confianza es baja, muestra la imagen original al lado para comparar.',
      ejemplos: [
        'Foto albarán → extrae productos, precios y caducidades por línea',
        'Foto etiqueta → nombre, código barras, lote, fecha caducidad automática',
        '🟢 alta · 🟡 revisar · 🔴 baja — semáforo visual por cada campo',
        'La foto siempre guardada — auditoría completa para el contable',
      ],
      ruta: '📷 en cualquier pantalla',
      color: '#6366F1',
      roi: 'Elimina el €0,30 por albarán. Trazabilidad total para inspecciones.',
      activo: true,
    } as ModuloCustom,
    {
      emoji: '🏷️',
      titulo: 'Elaboraciones propias APPCC',
      sub: 'Etiqueta en 30 segundos. Sanidad cubierta.',
      desc: 'El cocinero registra la elaboración, imprime la etiqueta APPCC al instante y el sistema avisa automáticamente a los camareros cuando está a punto de caducar.',
      ejemplos: [
        'Registro: nombre, lote auto, raciones, temperatura, 14 alérgenos',
        'Menos de 24h: push a jefe de sala + owner → "planifica la venta"',
        'Menos de 4h: push a TODOS los camareros → "¡Recomiéndalo ahora!"',
        'Historial completo para inspecciones de sanidad — sin papeles',
      ],
      ruta: '/kds → botón 🏷️',
      color: '#F59E0B',
      roi: 'APPCC automático. Sin multas por inspección. Caducados recomendados antes de tirarse.',
      activo: true,
    } as ModuloCustom,
    MODULO_VINOS({ sub:'La bodega de Eslava que nadie vende, vendida.', roi:'El camarero no necesita saber de vinos. ia.rest sabe por él.' }),
    MODULO_EVENTOS({ ejemplos:['Feria de Abril en 4 días — vendisteis 40% más cerveza','Semana Santa — refuerza toda la terraza','Calor extremo mañana — prepara bebidas frías'] }),
    MODULO_RRHH({ roi:'50 restaurantes. Un panel. Criterios homogéneos para todo el grupo.' }),
  ],
  objecionPrincipal: '"Me cuesta creer que un sistema aúne todo Y que todo esté bien hecho."',
  respuestaObjecion: 'No somos mejor que cada especialista. Somos lo que ninguno puede darte solo: la integración.',
  fasePiloto: [
    { fase:'Semana 1-2', color:C.red, items:['Configuración local piloto','Comandas por voz + KDS vistas','OCR albarán + recepción con EAN y lote','Ciclo de compras: pedido → ASN → recepción'] },
    { fase:'Semana 2-4', color:C.amber, items:['Análisis de carta real','Asistente IA cocina','Ficha proveedor + alertas WhatsApp incidencias','Elaboraciones APPCC + etiquetas 1169/2011'] },
    { fase:'Mes 2+', color:C.green, items:['RRHH grupo centralizado','Previsión por eventos → pedido automático IA','Central de compras + benchmarking locales','Informe mensual proveedores con 1 clic'] },
  ],
}

export default function PropuestaOvejasNegras() {
  return <PropuestaBase config={config} />
}
