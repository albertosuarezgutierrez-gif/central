// Inventario de credenciales de la casa de marcas — "el apartado para todo el proyecto".
//
// REGLA DE ORO: esto es un MAPA, no un BAÚL. Aquí viven solo los METADATOS de cada
// credencial (nombre, para qué, qué verticales la usan, DÓNDE vive el valor). NUNCA
// un valor real: los valores siguen en Vercel (env), Bitwarden (logins humanos) o en
// la BD como hash (contraseñas de usuario). Si esta lista se filtra, no entrega nada.
//
// Se mantiene a mano: al añadir una env nueva de auth/servicio, añade su fila aquí.

export type SecretTipo =
  | 'firma-sesion'   // firma/valida sesiones o tokens (el literal sería credencial usable)
  | 'token-inter-app'// secreto compartido entre apps del monorepo
  | 'cron'           // protege endpoints de cron / acceso de operador
  | 'api-externa'    // clave de un servicio de terceros (Stripe, Smoobu, IA…)
  | 'login-humano'   // contraseña que TECLEA Alberto para entrar a un servicio
  | 'hash-usuario'   // contraseñas de usuarios finales (guardadas como hash, no se ven)

export type DondeVive =
  | 'vercel-equipo'   // Variable Compartida a nivel de equipo de Vercel (una vez, heredan todos)
  | 'vercel-proyecto' // env del proyecto Vercel concreto (campo `proyecto`)
  | 'bitwarden'       // gestor de contraseñas (login humano) — NO en el repo ni en Vercel
  | 'bd-hash'         // columna de la BD como hash (bcrypt/SHA-256)

export type SecretEntry = {
  /** Nombre de la env var, o de la credencial si es login humano. */
  name: string
  tipo: SecretTipo
  /** Una línea: para qué sirve. */
  proposito: string
  /** Verticales/proyectos que la usan. */
  verticales: string[]
  dondeVive: DondeVive
  /** Proyecto Vercel concreto (cuando dondeVive='vercel-proyecto'). */
  proyecto?: string
  /** True = la app FALLA en producción si falta (guarda de prod / requireSecret). */
  obligatoria?: boolean
  /** Aviso o matiz relevante. */
  nota?: string
  /** FASE 2 (write-through blindado): editable desde el panel. Solo claves NO
   *  críticas (api-externa) de UN proyecto Vercel concreto. NUNCA firma-sesion. */
  editable?: boolean
  /** Proyecto Vercel PRIMARIO al editar (cuando editable=true). */
  vercelProject?: 'ia-rest' | 'ialimp' | 'sivra' | 'plataforma' | 'rrhh'
  /** Proyectos Vercel ADICIONALES que reciben la misma env al editar (ej: una key
   *  que vive en dos apps). El endpoint escribe en vercelProject + todos estos. */
  vercelProjects?: Array<'ia-rest' | 'ialimp' | 'sivra' | 'plataforma' | 'rrhh'>
}

export const SECRETS_REGISTRY: SecretEntry[] = [
  // ── Firma de sesión / tokens (los críticos: nunca fallback a literal) ──────────
  { name: 'JWT_SECRET', tipo: 'firma-sesion', proposito: 'Firma las cookies de sesión (JWT HS256).', verticales: ['plataforma', 'ialimp', 'rrhh'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo', obligatoria: true, nota: 'Rotarlo desloguea a todos los usuarios de esa app.' },
  { name: 'JWT_SECRET_CRM', tipo: 'firma-sesion', proposito: 'Firma los tokens de baja/seguimiento del CRM de leads.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', obligatoria: true, nota: 'lib/crm-secret.ts → crmSecret().' },
  { name: 'SESSION_SECRET', tipo: 'firma-sesion', proposito: 'HMAC que firma las sesiones x-ia-session.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', obligatoria: true, nota: 'Sin ella getSession() rechaza TODAS las sesiones (fail-safe).' },
  { name: 'NEXTAUTH_SECRET', tipo: 'firma-sesion', proposito: 'Secreto de NextAuth (auth de la intranet sivra).', verticales: ['sivra'], dondeVive: 'vercel-proyecto', proyecto: 'sivra', obligatoria: true },

  // ── Tokens inter-app (puertos HTTP entre verticales) ──────────────────────────
  { name: 'OPERADOR_SHARED_SECRET', tipo: 'token-inter-app', proposito: 'Puerto god-panel ↔ ia-rest (plataforma lee restaurantes/financiero).', verticales: ['plataforma', 'ia-rest'], dondeVive: 'vercel-equipo', obligatoria: true, nota: 'MISMO valor en ambos proyectos.' },
  { name: 'RRHH_OPERADOR_SECRET', tipo: 'token-inter-app', proposito: 'Puerto god-panel ↔ iarrhh (alta de empresa, lectura de personas).', verticales: ['plataforma', 'rrhh'], dondeVive: 'vercel-equipo', obligatoria: true, nota: 'PROPIO de iarrhh; distinto de OPERADOR_SHARED_SECRET — no reutilizar.' },
  { name: 'ASEGURA_OPERADOR_SECRET', tipo: 'token-inter-app', proposito: 'Puerto /correduria ↔ central-asegura (cartera en vivo, read-only).', verticales: ['plataforma', 'asegura'], dondeVive: 'vercel-equipo', nota: 'MISMO valor en plataforma y central-asegura; PROPIO — no reutilizar otros. Sin él, la cartera sale como «pendiente de conectar».' },
  { name: 'AI_GATEWAY_SECRET', tipo: 'token-inter-app', proposito: 'Las verticales llaman a la pasarela de IA de plataforma.', verticales: ['plataforma', 'ia-rest', 'ialimp', 'sivra', 'rrhh'], dondeVive: 'vercel-equipo', nota: 'Sin él (+ AI_GATEWAY_URL) cae a NIM directo (NVIDIA_API_KEY).' },

  // ── Cron / acceso de operador ─────────────────────────────────────────────────
  { name: 'CRON_SECRET', tipo: 'cron', proposito: 'Bearer que valida los crons de Vercel y llamadas servidor→servidor.', verticales: ['plataforma', 'ia-rest', 'ialimp', 'sivra'], dondeVive: 'vercel-equipo', obligatoria: true, nota: 'Llave MAESTRA — NO ponerla en prompts de rutinas. Para el aviso Telegram de las rutinas usar ALERTA_TOKEN.' },
  { name: 'ALERTA_TOKEN', tipo: 'cron', proposito: 'Token DEDICADO de bajo privilegio: SOLO abre /api/internal/alerta (aviso Telegram de las rutinas de Claude Code) y las rutas de RUTAS_RUTINA.', verticales: ['plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma', nota: 'Es el que va en el entorno de las rutinas (buscador-ia, agentes-entrenador, psd2-health-check, ialimp-client-health, pricing…). Si se filtra, su alcance es RUTAS_RUTINA — nunca la llave maestra. EDITABLE desde el panel A PROPÓSITO (excepción a "solo api-externa"): está duplicado a mano en Vercel Y en el campo de variables de CADA entorno de Claude Code, y una rotación a medias deja MUDOS los avisos de todos los agentes (incidentes 19/07 y 26-27/07/2026). Al escribirlo aquí, el panel redespliega plataforma solo — que era justo el paso que se olvidaba. Pega el MISMO valor en los entornos de las rutinas. Si no está definido, el endpoint sigue aceptando CRON_SECRET (compat).' },
  { name: 'SUPER_ACCESS_KEY', tipo: 'cron', proposito: 'Shield del super-admin de ia-rest.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest' },
  { name: 'DEMO_SEED_SECRET', tipo: 'cron', proposito: 'Protege el endpoint de seed de demo.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', nota: 'Solo test/demo.' },

  // ── Base de datos ─────────────────────────────────────────────────────────────
  { name: 'DATABASE_URL', tipo: 'api-externa', proposito: 'Conexión pooled a Supabase.', verticales: ['plataforma', 'ialimp', 'sivra', 'rrhh', 'ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo', obligatoria: true },
  { name: 'DIRECT_URL', tipo: 'api-externa', proposito: 'Conexión directa a Supabase (migraciones Prisma).', verticales: ['plataforma', 'ialimp', 'sivra', 'rrhh'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', tipo: 'api-externa', proposito: 'Acceso server-side a Supabase (bypassa RLS).', verticales: ['ia-rest', 'ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo', obligatoria: true, nota: 'Nunca al cliente.' },

  // ── IA ────────────────────────────────────────────────────────────────────────
  { name: 'NVIDIA_API_KEY', tipo: 'api-externa', proposito: 'LLM primario (NVIDIA NIM) de la pasarela de IA y concursos.', verticales: ['plataforma', 'ia-rest', 'ialimp', 'sivra'], dondeVive: 'vercel-equipo' },
  { name: 'GEMINI_API_KEY', tipo: 'api-externa', proposito: 'Gemini (búsqueda web + texto + embeddings de la caché). APAGADO por defecto desde el 02/08/2026 (key sin cuota, 429 permanente): la búsqueda requiere GEMINI_WEBSEARCH=1 y el texto GEMINI_TEXTO=1 para reactivarse.', verticales: ['plataforma', 'sivra'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma' },
  { name: 'GROQ_API_KEY', tipo: 'api-externa', proposito: 'Fallback de texto/ASR (Llama 3.3 70B).', verticales: ['plataforma', 'ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma' },
  { name: 'OPENROUTER_API_KEY', tipo: 'api-externa', proposito: 'Camino PRIMARIO de la pasarela: agregador OpenRouter + Agente Director (elige modelo por petición) con fallback nativo entre modelos.', verticales: ['plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma', nota: 'Sin ella la pasarela cae a la cadena gratis NIM→Groq→Kimi. Opcionales (no secretas, en Vercel): OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS.' },

  // ── Pagos ─────────────────────────────────────────────────────────────────────
  { name: 'STRIPE_SECRET_KEY', tipo: 'api-externa', proposito: 'Cobros y suscripciones (Stripe).', verticales: ['ia-rest', 'ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo' },
  { name: 'STRIPE_WEBHOOK_SECRET_*', tipo: 'api-externa', proposito: 'Verifica la firma de los webhooks de Stripe (QR/storefront/propinas).', verticales: ['ia-rest', 'ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo' },

  // ── PMS / reservas ────────────────────────────────────────────────────────────
  { name: 'SMOOBU_API_KEY', tipo: 'api-externa', proposito: 'PMS de pisos turísticos (reservas, mensajes, rates).', verticales: ['sivra', 'ialimp', 'plataforma'], dondeVive: 'bd-hash', nota: 'Fuente única = BD pms_connections.smoobu_api_key; la env es solo respaldo.' },

  // ── Email saliente ────────────────────────────────────────────────────────────
  { name: 'RESEND_API_KEY', tipo: 'api-externa', proposito: 'Email transaccional/aviso (Resend).', verticales: ['ialimp', 'ia-rest', 'ialimp-landing'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo' },
  { name: 'SMTP_PASSWORD', tipo: 'api-externa', proposito: 'SMTP de IONOS (hola@ialimp.es) — proveedor de email activo.', verticales: ['ialimp', 'plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo', nota: 'Acompaña a SMTP_USER. IONOS = 587/STARTTLS.' },
  { name: 'RESEND_WEBHOOK_SECRET', tipo: 'api-externa', proposito: 'Firma Svix del webhook de rebotes/quejas de Resend.', verticales: ['ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'ialimp', editable: true, vercelProject: 'ialimp' },

  // ── Telegram (bot único del monorepo) ─────────────────────────────────────────
  { name: 'TELEGRAM_BOT_TOKEN', tipo: 'api-externa', proposito: 'Bot único de la casa de marcas (avisos, agente huéspedes).', verticales: ['plataforma', 'ia-rest'], dondeVive: 'vercel-equipo' },
  { name: 'TELEGRAM_WEBHOOK_SECRET', tipo: 'api-externa', proposito: 'Valida los callbacks de Telegram.', verticales: ['plataforma', 'ia-rest'], dondeVive: 'vercel-equipo' },

  // ── Web Push ──────────────────────────────────────────────────────────────────
  { name: 'VAPID_PRIVATE_KEY', tipo: 'api-externa', proposito: 'Firma las notificaciones Web Push (clave privada VAPID).', verticales: ['ia-rest', 'ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo', nota: 'Estuvo hardcodeada en ia-rest (PR #492) → ROTAR el par VAPID.' },

  // ── Otros servicios ───────────────────────────────────────────────────────────
  { name: 'APIFY_TOKEN', tipo: 'api-externa', proposito: 'Scraping de Google Maps para prospección de leads.', verticales: ['ia-rest', 'ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'cada proyecto el suyo' },
  { name: 'GOOGLE_PLACES_API_KEY', tipo: 'api-externa', proposito: 'Recolector de leads (Google Places New).', verticales: ['ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'ialimp', editable: true, vercelProject: 'ialimp' },
  { name: 'GOOGLE_CLIENT_SECRET', tipo: 'api-externa', proposito: 'OAuth Google (backup Drive / blog SEO).', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', nota: 'Con GOOGLE_CLIENT_ID y GOOGLE_DRIVE_REFRESH_TOKEN.', editable: true, vercelProject: 'ia-rest' },
  { name: 'CLOUDINARY_API_SECRET', tipo: 'api-externa', proposito: 'Imágenes/reels de Instagram.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', editable: true, vercelProject: 'ia-rest' },
  { name: 'TURNSTILE_SECRET_KEY', tipo: 'api-externa', proposito: 'Anti-bot Cloudflare Turnstile (login propietario).', verticales: ['ialimp'], dondeVive: 'vercel-proyecto', proyecto: 'ialimp', nota: 'Sin secret, NO bloquea (modo preview).', editable: true, vercelProject: 'ialimp' },
  { name: 'VERCEL_TOKEN', tipo: 'api-externa', proposito: 'Crons internos / deploy de la landing por GitHub Actions.', verticales: ['ia-rest', 'ialimp-landing'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest / secreto de repo', nota: 'Token de admin de Vercel — alto valor.' },
  { name: 'GH_PAT', tipo: 'api-externa', proposito: 'Acceso a GitHub para blog/agente arquitecto.', verticales: ['ia-rest'], dondeVive: 'vercel-proyecto', proyecto: 'ia-rest', nota: 'Usar siempre GH_PAT, nunca GITHUB_TOKEN, en el CÓDIGO PROPIO de ia-rest.', editable: true, vercelProject: 'ia-rest' },
  { name: 'GITHUB_TOKEN', tipo: 'api-externa', proposito: 'Lee y commitea la landing de housesevillana (apps/housesevillana del repo central) para el agente SEO.', verticales: ['sivra', 'plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'sivra + plataforma', editable: true, vercelProject: 'sivra', vercelProjects: ['plataforma'], nota: 'Runtime env que leen seo-landing.ts de sivra Y plataforma (mismo valor en ambos). 🚨 PAT fine-grained con Repository access = albertosuarezgutierrez-gif/central y Contents: Read and write — la landing vive en el MONOREPO desde el 12/08/2026, no en el antiguo repo externo house-sevillana-landing; con el scope viejo el GET cuela (repo público) pero el commit da 403. Compruébalo sin esperar al lunes con el botón "Probar acceso a GitHub" de /sivra/seo. NO confundir con el GITHUB_TOKEN auto-inyectado en GitHub Actions. La regla "usar GH_PAT" aplica al código de ia-rest, no a estas dos rutas SEO ya estandarizadas.' },
  { name: 'SERPER_API_KEY', tipo: 'api-externa', proposito: 'Búsqueda web (RETIRADA del cron el 24/08/2026 — créditos agotados; solo la usarían llamadas manuales a mercado/search·sweep·cron).', verticales: ['sivra', 'plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'sivra + plataforma', editable: true, vercelProject: 'sivra', vercelProjects: ['plataforma'] },
  { name: 'IDEALISTA_API_KEY', tipo: 'api-externa', proposito: 'API oficial de Idealista (Search): comparables de mercado para subastas/chollos.', verticales: ['plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma', nota: 'Par con IDEALISTA_API_SECRET. Tramo gratuito ~100 llamadas/mes (ledger idealista_api_usos). Sin ellas la ingesta API queda inerte y el corpus sigue con las alertas de correo.' },
  { name: 'IDEALISTA_API_SECRET', tipo: 'api-externa', proposito: 'Secret OAuth2 del par IDEALISTA_API_KEY (client_credentials).', verticales: ['plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', editable: true, vercelProject: 'plataforma' },

  // ── Correduría / seguros ──────────────────────────────────────────────────────
  { name: 'CIMA_WSE_PASSWORD', tipo: 'api-externa', proposito: 'Contraseña del web service de CIMA (Codeoscopic) para la correduría de seguros.', verticales: ['plataforma'], dondeVive: 'vercel-proyecto', proyecto: 'plataforma', nota: 'Credencial de SALIDA a un tercero: un valor malo solo rompe la llamada a CIMA, no firma sesiones nuestras.', editable: true, vercelProject: 'plataforma' },

  // ── Logins humanos (Bitwarden — NO en el repo ni en Vercel) ───────────────────
  { name: 'Login Vercel', tipo: 'login-humano', proposito: 'Panel de Vercel (deploys, envs de todos los proyectos).', verticales: ['todas'], dondeVive: 'bitwarden' },
  { name: 'Login Supabase', tipo: 'login-humano', proposito: 'Consola de la BD compartida + proyecto propio de ia-rest.', verticales: ['todas'], dondeVive: 'bitwarden' },
  { name: 'Login Smoobu', tipo: 'login-humano', proposito: 'PMS (donde se rota la API key).', verticales: ['sivra', 'ialimp'], dondeVive: 'bitwarden' },
  { name: 'Login IONOS', tipo: 'login-humano', proposito: 'Buzón hola@ialimp.es (SMTP).', verticales: ['ialimp'], dondeVive: 'bitwarden' },
  { name: 'Login Stripe', tipo: 'login-humano', proposito: 'Dashboard de cobros.', verticales: ['ia-rest', 'ialimp'], dondeVive: 'bitwarden' },
  { name: 'Login Google Cloud', tipo: 'login-humano', proposito: 'Places API, OAuth, Drive.', verticales: ['ia-rest', 'ialimp'], dondeVive: 'bitwarden' },
  { name: 'Login banca (BBVA/Kutxa)', tipo: 'login-humano', proposito: 'Banca personal/sociedad (conciliación PSD2).', verticales: ['plataforma'], dondeVive: 'bitwarden' },

  // ── Contraseñas de usuarios finales (BD, como hash — no se ven) ───────────────
  { name: 'password_hash (usuarios)', tipo: 'hash-usuario', proposito: 'Contraseñas de empresas/usuarios/propietarios — bcrypt.', verticales: ['ialimp', 'plataforma', 'rrhh'], dondeVive: 'bd-hash', nota: 'Nunca en claro; no se muestran ni se "unifican".' },
  { name: 'pin_hash (limpiadoras)', tipo: 'hash-usuario', proposito: 'PIN de acceso de la limpiadora a /l — SHA-256.', verticales: ['ialimp'], dondeVive: 'bd-hash', nota: 'No recuperable tras crearlo.' },
]
