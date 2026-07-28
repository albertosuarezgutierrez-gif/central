// Catálogo ÚNICO en código de los agentes del monorepo `central`, para el panel de operador
// (/operador/agentes). Espeja docs/AGENTES-MAPA.md + docs/RUTINAS-PROGRAMADAS.md + los crons de
// cada vercel.json. Puro (sin `@/` ni prisma) → testeable con `node --test`. La SALUD en vivo
// (última ejecución vs cadencia) se calcula aparte en lib/agentes-salud.ts, cruzando por `id`.

export type TipoAgente = 'rutina-claude' | 'router-ia' | 'cron-vercel'
export type EntregaAgente = 'pr-draft' | 'auto-main' | 'accion-directa' | 'lectura' | 'mixto'

export type AgenteInfo = {
  /** Clave estable (para cruzar con la salud en vivo). */
  id: string
  nombre: string
  tipo: TipoAgente
  /** Qué hace, en una línea. */
  funcion: string
  /** Cadencia legible (p.ej. "Diaria 08:00", "Lunes 05:00", "cada 10 min"). */
  cadencia: string
  /** Cómo se dispara (trigger Claude, cron Vercel, por petición…). */
  disparo: string
  entrega: EntregaAgente
  telegram: boolean
  /** Archivo o ruta principal que lo implementa. */
  archivo: string
  /** Vertical/módulo que toca. */
  vertical: string
  /** Estado operativo declarado. */
  estado: 'activo' | 'pendiente-trigger' | 'sombra'
}

// ── A. Rutinas Claude Code web (sesiones por trigger; skills en .claude/skills/*) ──────────────
export const RUTINAS_CLAUDE: AgenteInfo[] = [
  { id: 'auditoria-diaria', nombre: 'Auditoría nocturna ligera', tipo: 'rutina-claude',
    funcion: 'Reconcilia memoria+skills+docs contra el código/infra real y vigila los crons',
    cadencia: 'Diaria 04:00', disparo: 'Trigger Claude', entrega: 'mixto', telegram: true,
    archivo: '.claude/skills/auditoria-central + /auditoria-diaria', vertical: 'Transversal', estado: 'activo' },
  { id: 'auditoria-profunda', nombre: 'Auditoría semanal profunda', tipo: 'rutina-claude',
    funcion: 'Typecheck 4 apps + tests + seguridad multi-tenant + infra MCP',
    cadencia: 'Domingo 04:00', disparo: 'Trigger Claude', entrega: 'mixto', telegram: true,
    archivo: 'auditoria-central --profunda', vertical: 'Transversal', estado: 'activo' },
  { id: 'facturas-correo', nombre: 'Facturas correo', tipo: 'rutina-claude',
    funcion: 'Revisa Gmail → clasifica facturas (personal vs deducible) → Drive → concilia con banca',
    cadencia: 'Diaria 08:00', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/facturas-correo', vertical: 'Plataforma /finanzas', estado: 'activo' },
  { id: 'pricing-agente', nombre: 'Pricing agente (SIVRA)', tipo: 'rutina-claude',
    funcion: 'Estudia mercado → decide precio → aplica por los raíles del Paso 4 → aprende en BD',
    cadencia: 'Lunes 06:00', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/pricing-agente', vertical: 'SIVRA', estado: 'activo' },
  { id: 'fiscal-novedades', nombre: 'Vigilante fiscal IRPF', tipo: 'rutina-claude',
    funcion: 'Contrasta IMPORTES_POR_ANIO con BOE/BOJA; si cambia, actualiza constante + fiscal_novedades',
    cadencia: 'Día 1 mes 07:00', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/fiscal-novedades → lib/fiscal-deducciones.ts', vertical: 'Plataforma /finanzas', estado: 'activo' },
  { id: 'psd2-health-check', nombre: 'Guardián PSD2 / Enable Banking', tipo: 'rutina-claude',
    funcion: 'Verifica que movimientos_bancarios llega fresco (<48h); alerta si el sync está roto',
    cadencia: 'Miércoles 09:00', disparo: 'Trigger Claude', entrega: 'lectura', telegram: true,
    archivo: '.claude/skills/psd2-health-check', vertical: 'Plataforma (banca)', estado: 'activo' },
  { id: 'ialimp-client-health', nombre: 'ialimp client health', tipo: 'rutina-claude',
    funcion: 'Pulso semanal de Sique Brilla: PMS sync, programaciones sin asignar, impagos',
    cadencia: 'Viernes 17:00', disparo: 'Trigger Claude', entrega: 'lectura', telegram: true,
    archivo: '.claude/skills/ialimp-client-health', vertical: 'IALIMP', estado: 'activo' },
  { id: 'rrhh-compliance-calendar', nombre: 'RRHH compliance calendar', tipo: 'rutina-claude',
    funcion: 'Filtra ítems 🔴 obligatorios del roadmap RRHH e informa de plazos legales',
    cadencia: 'Día 1 mes 08:00', disparo: 'Trigger Claude', entrega: 'lectura', telegram: false,
    archivo: '.claude/skills/rrhh-compliance-calendar', vertical: 'RRHH', estado: 'activo' },
  { id: 'github-vigia', nombre: 'Vigía GitHub/OSS', tipo: 'rutina-claude',
    funcion: 'Releases de repos vigilados + descubrimiento + npm outdated/CVE',
    cadencia: 'Día 15 mes 07:00', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/github-vigia → docs/VIGIA-OSS.md', vertical: 'Transversal', estado: 'pendiente-trigger' },
  { id: 'agentes-entrenador', nombre: 'Agentes-entrenador', tipo: 'rutina-claude',
    funcion: 'Mejora los prompts de los agentes por rendimiento y calidad transversal',
    cadencia: 'Domingo 07:30', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/agentes-entrenador + /agentes-entrenador', vertical: 'Meta (los demás agentes)', estado: 'activo' },
  { id: 'buscador-ia', nombre: 'Buscador de IA (LLMs gratis)', tipo: 'rutina-claude',
    funcion: 'Watch de deprecación de modelos cableados + descubrimiento + mini-eval de la cadena core-ai',
    cadencia: 'Lunes 07:00', disparo: 'Trigger Claude', entrega: 'pr-draft', telegram: true,
    archivo: '.claude/skills/buscador-ia → docs/BUSCADOR-IA.md', vertical: 'Plataforma (core-ai)', estado: 'pendiente-trigger' },
  { id: 'trading-analista', nombre: 'Trading-analista (IBKR, paper)', tipo: 'rutina-claude',
    funcion: 'Analiza técnico+fundamental, torneo de estrategias y opera SOLO en paper; aprende por track record',
    cadencia: 'Diaria ~22:15 (cierre US)', disparo: 'Trigger Claude', entrega: 'lectura', telegram: true,
    archivo: '.claude/skills/trading-analista + /api/trading/*', vertical: 'Transversal (finanzas)', estado: 'pendiente-trigger' },
]

// ── B. Agente Director + su meta-agente (router de modelos de la pasarela IA) ──────────────────
export const ROUTER_IA: AgenteInfo[] = [
  { id: 'ia-director', nombre: 'Agente Director', tipo: 'router-ia',
    funcion: 'Un LLM barato elige el modelo ideal por petición del catálogo (presupuesto/contexto/RGPD)',
    cadencia: 'En cada petición /api/ai/*', disparo: 'Pasarela IA', entrega: 'accion-directa', telegram: false,
    archivo: 'lib/ia-director.ts', vertical: 'Plataforma — pasarela IA', estado: 'sombra' },
  { id: 'ia-director-refresh', nombre: 'Meta-agente investigador', tipo: 'cron-vercel',
    funcion: 'Regenera el catálogo del Director desde OpenRouter + bucle de aprendizaje por rendimiento',
    cadencia: 'Lunes 05:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: 'app/api/cron/ia-director-refresh/route.ts', vertical: 'Plataforma — pasarela IA', estado: 'activo' },
]

// ── C. Crons agénticos de Vercel (código, no sesiones Claude) — los más relevantes ─────────────
export const CRONS_VERCEL: AgenteInfo[] = [
  { id: 'correo-triaje', nombre: 'Triaje de correo', tipo: 'cron-vercel',
    funcion: 'Lee el Gmail por IMAP, clasifica (reglas→OTP→IA) y actúa: ruido, contabilidad, avisos',
    cadencia: 'Cada 10 min', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: 'lib/correo/ (triaje.ts, rutas.ts, clasificador.ts)', vertical: 'Plataforma (Gmail)', estado: 'sombra' },
  { id: 'agente-huesped', nombre: 'Agente huésped (SIVRA)', tipo: 'cron-vercel',
    funcion: 'Conversa con huéspedes de Smoobu; solo REDACTA borradores, no ejecuta acciones',
    cadencia: 'Cada 3 min + webhook', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: 'lib/sivra/agente-huesped/decidir.ts', vertical: 'SIVRA', estado: 'activo' },
  { id: 'contable-proactivo', nombre: 'Agente contable proactivo', tipo: 'cron-vercel',
    funcion: 'Chat financiero + avisos de movimientos dudosos por Telegram (enruta por el Director)',
    cadencia: 'Lunes 09:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: 'lib/contable/ + /api/cron/contable-proactivo', vertical: 'Plataforma', estado: 'activo' },
  { id: 'concursos', nombre: 'Agente de concursos/licitaciones', tipo: 'cron-vercel',
    funcion: 'Ingesta corpus PLACSP, radar por CPV, avisos y recordatorio de cierre',
    cadencia: 'cada 6 h + 07:30/09:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: '@central/module-concursos + /api/concursos', vertical: 'Plataforma (cuenta)', estado: 'activo' },
  { id: 'subastas', nombre: 'Radar de subastas de inmuebles', tipo: 'cron-vercel',
    funcion: 'Ingiere las alertas del BOE y los comparables de Idealista, enriquece con ficha y Catastro, calcula el coste real, detecta chollos de venta directa por zona, sigue las bajadas de precio y avisa',
    cadencia: 'Diaria 06:00/06:15/06:20/06:30/08:00/09:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: '@central/module-subastas + /api/cron/subastas-*', vertical: 'Plataforma (cuenta)', estado: 'activo' },
  { id: 'facturas-proveedor', nombre: 'Agente de pago de facturas', tipo: 'cron-vercel',
    funcion: 'Escanea facturas de proveedor → OCR → aprueba/paga (PIS/SEPA) → concilia',
    cadencia: 'Diaria 06:15 + lun 09:15', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: 'lib/agente-facturas/pagos.ts', vertical: 'Plataforma', estado: 'activo' },
  { id: 'gastos-sivra', nombre: 'Agente de gastos SIVRA', tipo: 'cron-vercel',
    funcion: 'Escaneo de gastos de pisos + resumen mensual',
    cadencia: 'Diaria 06:00 + día 1', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: true,
    archivo: '/api/sivra/expenses/agent/*', vertical: 'SIVRA', estado: 'activo' },
  { id: 'seo-agent-iarest', nombre: 'Agente SEO (ia-rest)', tipo: 'cron-vercel',
    funcion: 'Genera y publica contenido SEO/blog de forma autónoma',
    cadencia: 'Mar/Vie 07:00 + lun 08:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: 'apps/ia-rest /api/cron/seo-agent', vertical: 'ia-rest', estado: 'activo' },
  { id: 'instagram-iarest', nombre: 'Agente de Instagram (ia-rest)', tipo: 'cron-vercel',
    funcion: 'Ideas, publicación y métricas de Instagram',
    cadencia: 'Lun/Mié/Vie 08:00', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: 'apps/ia-rest /api/cron/instagram*', vertical: 'ia-rest', estado: 'activo' },
  { id: 'crm-iarest', nombre: 'Agentes de prospección/CRM (ia-rest)', tipo: 'cron-vercel',
    funcion: 'Lead hunter, WhatsApp/emails comerciales, follow-up y pipeline en Sevilla',
    cadencia: 'Varias (cada 30 min…)', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: 'apps/ia-rest /api/cron/crm-*', vertical: 'ia-rest', estado: 'activo' },
  { id: 'mailing-ialimp', nombre: 'Agente de mailing en frío (ialimp)', tipo: 'cron-vercel',
    funcion: 'Genera openers con IA, drip y tracking de captación',
    cadencia: 'Cada 3 min', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: 'apps/ialimp /api/superadmin/mailing/cron', vertical: 'IALIMP', estado: 'activo' },
  { id: 'impagos-ialimp', nombre: 'Agente de impagos (ialimp)', tipo: 'cron-vercel',
    funcion: 'Recordatorios escalonados de impago (+3/+10/+21)',
    cadencia: 'Diaria 08:30', disparo: 'Cron Vercel', entrega: 'accion-directa', telegram: false,
    archivo: 'apps/ialimp /api/cron/impagos', vertical: 'IALIMP', estado: 'activo' },
]

/** Todos los agentes, en orden de familia. */
export const AGENTES: AgenteInfo[] = [...RUTINAS_CLAUDE, ...ROUTER_IA, ...CRONS_VERCEL]

export const FAMILIAS: { tipo: TipoAgente; titulo: string; agentes: AgenteInfo[] }[] = [
  { tipo: 'rutina-claude', titulo: '🤖 Rutinas Claude Code (por trigger)', agentes: RUTINAS_CLAUDE },
  { tipo: 'router-ia', titulo: '🧠 Agente Director (router de modelos IA)', agentes: ROUTER_IA },
  { tipo: 'cron-vercel', titulo: '⚙️ Crons agénticos de Vercel', agentes: CRONS_VERCEL },
]
