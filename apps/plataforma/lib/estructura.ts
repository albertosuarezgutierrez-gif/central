// Mapa de la casa de marcas para el panel de operador (apartado "Estructura").
// Curado a mano (la arquitectura no cambia a menudo); fuente: MATRIZ.md + CLAUDE.md
// de cada app. Al añadir una vertical/módulo/agente nuevo, actualízalo aquí.

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
]

/** Agentes IA por ámbito (transversal = vive en un módulo y lo usan varias verticales). */
export const AGENTES: AgenteInfo[] = [
  { nombre: 'Agente de concursos públicos', ambito: 'transversal · module-concursos', desc: 'Lee el pliego → ficha + checklist por sobre + Go/No-Go + garantías + baja temeraria.' },
  { nombre: 'Auto-asignación', ambito: 'ialimp', desc: 'Asigna limpiadoras por turnos, carga semanal y ventana de entrada.' },
  { nombre: 'Cotizador IA', ambito: 'ialimp', desc: 'Genera presupuestos de limpieza.' },
  { nombre: 'Escáner de documentos', ambito: 'ialimp', desc: 'Extrae datos de facturas/justificantes (visión) → contabilidad.' },
  { nombre: 'Calidad de fotos', ambito: 'ialimp', desc: 'Evalúa fotos de limpieza (visión) y compara antes/después.' },
  { nombre: 'Clasificador de quejas', ambito: 'ialimp', desc: 'Clasifica y prioriza incidencias de clientes.' },
  { nombre: 'Briefing diario', ambito: 'ialimp', desc: 'Resumen operativo del día (email + push).' },
  { nombre: 'Selección de CVs (RRHH)', ambito: 'ialimp', desc: 'Analiza candidaturas de limpiadoras.' },
  { nombre: 'Mailing en frío', ambito: 'ialimp', desc: 'Captación: recolector Google/Apify/IA + drip de emails.' },
  { nombre: 'BRAIN (voz)', ambito: 'ia-rest', desc: 'Cerebro de comandas por voz: transcripción + interpretación.' },
  { nombre: 'Asistente / copiloto', ambito: 'ia-rest', desc: 'Consultas en lenguaje natural sobre el restaurante.' },
  { nombre: 'Lead research', ambito: 'ia-rest', desc: 'Investigación de leads para captación.' },
  { nombre: 'Pricing automático', ambito: 'sivra', desc: 'Motor de precios anclado al mercado, con salvaguardas.' },
]
