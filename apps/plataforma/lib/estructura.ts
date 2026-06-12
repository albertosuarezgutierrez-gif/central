// Mapa de la casa de marcas para el panel de operador (apartado "Estructura").
// Dos fuentes:
//  - CURADO a mano (abajo): descripciones legibles de verticales/módulos/agentes.
//  - GENERADO por auditoría (estructura.generated.json): la radiografía real del repo
//    (qué packages usa cada app + matriz de capacidades). Se regenera con `npm run auditar`
//    en la raíz (scripts/auditar-estructura.mjs). NO editar el JSON a mano.

import radiografiaJson from './estructura.generated.json'

export type EstadoModulo = 'usado' | 'declarado' | 'no'
export interface CeldaModulo { estado: EstadoModulo; evidencias: number }
export interface CeldaCapacidad { presente: boolean; evidencias: number }
export interface PackageRadiografia { id: string; tipo: 'core' | 'module'; npm: string }
export interface CapacidadRadiografia { id: string; grupo: string; label: string; modulo?: string }
export interface SkillRadiografia { id: string; name: string; description: string }
export interface NovedadRadiografia { titulo: string; fecha: string }
export interface Radiografia {
  generadoEn: string
  verticales: string[]
  matriz: string
  packages: PackageRadiografia[]
  capacidades: CapacidadRadiografia[]
  matrizModulos: Record<string, Record<string, CeldaModulo>>
  matrizCapacidades: Record<string, Record<string, CeldaCapacidad>>
  depsModulos: Record<string, string[]>
  apisPorVertical: Record<string, string[]>
  tablasPorVertical: Record<string, string[]>
  skills: SkillRadiografia[]
  novedades: NovedadRadiografia[]
  saludRepo: { packagesSinDescripcion: string[]; appsSinClaudeMd: string[] }
  gaps: {
    modulosInfrautilizados: { package: string; app: string }[]
    oportunidadesPortar: { capacidad: string; label: string; tiene: string[]; falta: string[] }[]
    reimplementaciones: { capacidad: string; label: string; modulo: string; conModulo: string[]; duplicada: string[] }[]
  }
  resumen: { verticales: number; packages: number; capacidades: number; skills: number; apis: number; modulosInfrautilizados: number; oportunidadesPortar: number; reimplementaciones: number }
}

/** Radiografía del repo (auditoría automática). Generada por `npm run auditar`. */
export const RADIOGRAFIA = radiografiaJson as Radiografia

export interface VerticalInfo { app: string; nombre: string; sector: string; desc: string; url?: string }
export interface ModuloInfo { id: string; tipo: 'core' | 'module'; desc: string; deps?: boolean }
export interface AgenteInfo { nombre: string; ambito: string; desc: string }

/** Verticales (apps/*): cada una su proyecto Vercel y su sector. */
export const VERTICALES: VerticalInfo[] = [
  { app: 'plataforma', nombre: 'Plataforma (matriz)', sector: 'Casa de marcas', desc: 'Cuadro de mando consolidado + este panel de operador. Nivel Cuenta → Sociedad → Negocio.' },
  { app: 'ia-rest', nombre: 'ia.rest', sector: 'Hostelería', desc: 'Voice POS / TPV para restaurantes, catering y eventos.', url: 'iarest.es' },
  { app: 'ialimp', nombre: 'ialimp', sector: 'Limpieza', desc: 'SaaS multi-tenant de limpieza de pisos turísticos.', url: 'app.ialimp.es' },
  { app: 'sivra', nombre: 'SIVRA', sector: 'Inmobiliario', desc: 'Intranet de gestión de pisos turísticos (instancia propia, Sevilla).' },
]

/** Módulos compartidos (packages/*): núcleos (core-*) + módulos de dominio (module-*). */
export const MODULOS: ModuloInfo[] = [
  { id: 'core-ai', tipo: 'core', desc: 'IA: proveedores (NVIDIA NIM, Gemini), visión, completion.' },
  { id: 'core-fiscal', tipo: 'core', desc: 'Fiscalidad España (VeriFactu).' },
  { id: 'core-push', tipo: 'core', desc: 'Web Push (notificaciones).', deps: true },
  { id: 'core-storage', tipo: 'core', desc: 'Supabase Storage (signed URLs, vía REST).' },
  { id: 'core-email', tipo: 'core', desc: 'Email saliente multi-proveedor (Resend/SMTP/Gmail).', deps: true },
  { id: 'core-identity', tipo: 'core', desc: 'Contrato de sesión/inquilino (puertos & adaptadores).' },
  { id: 'module-contabilidad', tipo: 'module', desc: 'Dominio: IVA, PyG, tesorería, rentabilidad, recurrentes (lógica pura).' },
  { id: 'module-concursos', tipo: 'module', desc: 'Dominio: agente de concursos públicos / licitaciones LCSP (lógica pura).' },
  { id: 'module-agenda', tipo: 'module', desc: 'Dominio: disponibilidad y reserva de un recurso (sala, vehículo, kit, persona) con solapes.' },
  { id: 'module-crm', tipo: 'module', desc: 'Dominio: pipeline comercial genérico (oportunidades/leads) anclado a un Encargo.' },
  { id: 'module-presupuestos', tipo: 'module', desc: 'Dominio: líneas, costes, descuentos y cálculo de margen/rentabilidad.' },
  { id: 'module-proveedores', tipo: 'module', desc: 'Dominio: catálogo de proveedores + servicios con comisiones.' },
  { id: 'module-inventario', tipo: 'module', desc: 'Dominio: catálogo de artículos + asignación de activos a un Encargo.' },
  { id: 'module-asn', tipo: 'module', desc: 'Dominio: aviso de envío/recepción de mercancía con líneas (lote, caducidad).' },
  { id: 'module-feedback', tipo: 'module', desc: 'Dominio: reseñas/valoraciones + propinas por Encargo o token público.' },
]

/** Agentes IA por ámbito (transversal = vive en un módulo y lo usan varias verticales). */
export const AGENTES: AgenteInfo[] = [
  // Transversal
  { nombre: 'Agente de concursos públicos', ambito: 'transversal · module-concursos', desc: 'Lee el pliego → ficha + checklist por sobre + Go/No-Go + garantías + baja temeraria.' },

  // ia-rest (hostelería)
  { nombre: 'BRAIN (voz → comanda)', ambito: 'ia-rest', desc: 'ASR (Whisper) + NIM contextual → comanda estructurada, correcciones fuzzy, routeo a cocina.' },
  { nombre: 'Asistente / copiloto (owner)', ambito: 'ia-rest', desc: 'Chat sobre datos del restaurante (ventas, stock, márgenes).' },
  { nombre: 'Asistente de cocina (KDS)', ambito: 'ia-rest', desc: 'Chat operacional en la pantalla de cocina.' },
  { nombre: 'Help chat contextual', ambito: 'ia-rest', desc: 'Ayuda según la página/turno/comanda activa.' },
  { nombre: 'Recomendación de carta', ambito: 'ia-rest', desc: 'Cross-sell/upsell/producto del día (camarero y QR).' },
  { nombre: 'Smart Scan (OCR multi-doc)', ambito: 'ia-rest', desc: 'Clasifica y extrae: albarán, factura, carta, etiqueta (GS1/EAN), CV.' },
  { nombre: 'Scoring de eventos', ambito: 'ia-rest', desc: 'Post-evento: comanda + financiero + APPCC → nota + mejoras.' },
  { nombre: 'Forecaster', ambito: 'ia-rest', desc: 'Predicción a 7 días + eventos del entorno (clima, ferias).' },
  { nombre: 'Agente CRM (leads)', ambito: 'ia-rest', desc: 'Analiza eventos de lead (WhatsApp/IG/email) → estado + siguiente acción.' },
  { nombre: 'Lead hunter', ambito: 'ia-rest', desc: 'Prospección con Apify + enriquecimiento NIM.' },
  { nombre: 'Generador de Instagram', ambito: 'ia-rest', desc: '6 plantillas, 2×/semana, aprobación por Telegram.' },
  { nombre: 'Generador de blog SEO', ambito: 'ia-rest', desc: 'Artículos SEO de hostelería.' },
  { nombre: 'Traductor de carta', ambito: 'ia-rest', desc: 'Traducción automática de la carta a los idiomas del QR.' },
  { nombre: 'Auto-healer', ambito: 'ia-rest', desc: 'Detecta patrones de incidencias (bridge, fichaje, comanda) y propone curas.' },
  { nombre: 'QA runner', ambito: 'ia-rest', desc: 'Suites de test automatizadas sobre clientes.' },
  { nombre: 'Agente arquitecto', ambito: 'ia-rest · operador', desc: 'Analiza la estructura del proyecto y propone refactors/ahorro de tokens.' },
  { nombre: 'Agentes de operador', ambito: 'ia-rest · operador', desc: 'SEO, ventas, legal, competencia, contenido y onboarding (6 especializados).' },

  // ialimp (limpieza)
  { nombre: 'Auto-asignación', ambito: 'ialimp', desc: 'Asigna limpiadoras por turnos, carga semanal y ventana de entrada.' },
  { nombre: 'Cotizador IA', ambito: 'ialimp', desc: 'Argumentario + propuesta HTML para leads.' },
  { nombre: 'Calidad de fotos', ambito: 'ialimp', desc: 'Visión: detecta incidencias en foto post-limpieza.' },
  { nombre: 'Comparar fotos (referencia)', ambito: 'ialimp', desc: 'Visión: compara antes/después contra foto de referencia.' },
  { nombre: 'Escáner de documentos (OCR)', ambito: 'ialimp', desc: 'Factura/albarán/ticket → clasifica + mapea PGC + propone apunte.' },
  { nombre: 'Análisis de kits (visión)', ambito: 'ialimp', desc: 'Estima nivel de productos desde foto del kit.' },
  { nombre: 'Clasificador de quejas', ambito: 'ialimp', desc: 'Categoriza, prioriza y genera expediente RRHH si hay patrón.' },
  { nombre: 'Detección de patrones', ambito: 'ialimp', desc: 'Anomalías sobre quejas + carga + rendimiento.' },
  { nombre: 'Briefing diario', ambito: 'ialimp', desc: 'Resumen operativo del día (email + push).' },
  { nombre: 'Análisis RRHH', ambito: 'ialimp', desc: 'Desempeño por limpiadora (rating, quejas, asistencia).' },
  { nombre: 'Asistente / copiloto', ambito: 'ialimp', desc: 'Consultas operativas (quién trabaja hoy, sin asignar, por cobrar…).' },
  { nombre: 'Mailing en frío', ambito: 'ialimp', desc: 'Captación: recolector Google/Apify/IA + drip de emails.' },

  // sivra (inmobiliario)
  { nombre: 'Pricing automático', ambito: 'sivra', desc: 'Motor de precios anclado al mercado, con salvaguardas.' },
  { nombre: 'Chat financiero', ambito: 'sivra', desc: 'Consultas en lenguaje natural sobre propiedades/ingresos/gastos.' },
  { nombre: 'Análisis de inversión', ambito: 'sivra', desc: 'Evalúa oportunidades de inversión en pisos.' },
  { nombre: 'Escáner de facturas (visión)', ambito: 'sivra', desc: 'OCR de facturas de gasto → apuntes.' },
]

/** Resumen explicativo de la casa de marcas (lo primero que se lee en el mapa). */
export const RESUMEN_EXPLICATIVO = `La **casa de marcas** es un monorepo: la RAÍZ (\`central\`) es la matriz y no tiene producto. Las **verticales** (productos SaaS) viven en \`apps/*\`, cada una con su proyecto Vercel y su sector. Los **módulos compartidos** viven en \`packages/*\` con scope \`@central/*\`: **núcleos** (\`core-*\`, infraestructura: IA, fiscal, push, email, storage, identidad) y **módulos de dominio** (\`module-*\`, lógica de negocio pura y agnóstica de BD que cualquier vertical enchufa con su adaptador). El operador (esta plataforma) modela los clientes como **Cuenta → Sociedad (CIF) → Negocio (sector → app)**. Este mapa se regenera solo del repo en cada push: refleja qué módulo usa cada app, qué tablas/APIs tiene, las dependencias y los huecos.`

/** Glosario de términos del proyecto (para que cualquiera —o cualquier sesión nueva— lo entienda). */
export const GLOSARIO: { termino: string; def: string }[] = [
  { termino: 'Vertical', def: 'Una app de producto en apps/* (ia-rest, ialimp, sivra). Cada una su proyecto Vercel y su sector.' },
  { termino: 'Matriz', def: 'La raíz del monorepo (y apps/plataforma): no es producto, consolida y orquesta.' },
  { termino: 'Núcleo (core-*)', def: 'Package de infraestructura compartida: IA, fiscal, push, email, storage, identidad.' },
  { termino: 'Módulo de dominio (module-*)', def: 'Lógica de negocio PURA y agnóstica de BD (recibe datos por un puerto). La vertical aporta el adaptador.' },
  { termino: 'Capacidad', def: 'Una función de producto detectada en el código por sus rutas (TPV, KDS, pricing, concursos…).' },
  { termino: 'Encargo', def: 'La unidad de trabajo genérica a la que se anclan módulos (evento, limpieza, porte, cita…).' },
  { termino: 'Cuenta → Sociedad → Negocio', def: 'Jerarquía del operador: un dueño (cuenta) con sociedades (CIF) y negocios (cada uno apunta a una app vertical).' },
  { termino: 'tenant_modulos', def: 'Tabla que registra qué módulos tiene activados cada negocio/empresa (la base del "conectar").' },
  { termino: 'VeriFactu', def: 'Sistema antifraude de facturación de la AEAT (España): huella encadenada + QR. Vive en core-fiscal.' },
  { termino: 'Reimplementación', def: 'Una capacidad presente en una vertical SIN usar el módulo compartido que debería respaldarla (lógica duplicada).' },
]

/** Pasos para dar de alta una vertical nueva (reglas de la matriz, ver MATRIZ.md / CLAUDE.md). */
export const CHECKLIST_NUEVA_VERTICAL: string[] = [
  'Crear apps/<app> con su package.json y vercel.json propios.',
  'Proyecto Vercel con Root Directory = apps/<app> e install `npm install --legacy-peer-deps`.',
  'Declarar los @central/* que consuma en dependencies (workspace:*) Y en transpilePackages del next.config (exportan TS crudo).',
  'NUNCA poner apps/ en el .vercelignore de la raíz (borraría la carpeta del build por-app).',
  'Si comparte la BD: scope multi-tenant por empresa_id / schema en TODA query.',
  'Añadir su CLAUDE.md/AGENTS.md y actualizar MATRIZ.md.',
]

const GH = 'https://github.com/albertosuarezgutierrez-gif/central/tree/main'
const VERCEL_TEAM = 'https://vercel.com/pisos-turisticos-projects'
/** Enlaces profundos por nodo: dónde vive cada cosa (código / Vercel / Supabase). */
export function enlacesApp(app: string): { label: string; url: string }[] {
  const out = [
    { label: 'Código', url: `${GH}/apps/${app}` },
    { label: 'Vercel', url: `${VERCEL_TEAM}/${app}` },
  ]
  // ia-rest tiene BD propia; el resto comparten la BD del operador.
  out.push({ label: 'Supabase', url: app === 'ia-rest' ? 'https://supabase.com/dashboard/project/efncqyvhniaxsirhdxaa' : 'https://supabase.com/dashboard/project/wswbehlcuxqxyinousql' })
  return out
}
export function enlacesModulo(id: string): { label: string; url: string }[] {
  return [{ label: 'Código', url: `${GH}/packages/${id}` }]
}
export function enlacesSkill(id: string): { label: string; url: string }[] {
  return [{ label: 'SKILL.md', url: `${GH}/.claude/skills/${id}/SKILL.md` }]
}
