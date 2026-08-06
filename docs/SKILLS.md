# Índice de skills y comandos — `central`

> Registro vivo de las herramientas de este repo y **cuándo usar cada una**. Existe para no
> volver a olvidar lo que ya tenemos. Lo mantiene `/auditoria-diaria` (reconcilia contra
> `.claude/skills/` y `.claude/commands/`); si añades o quitas una, actualiza aquí también.
>
> **📐 Patrón router + references (ahorro de contexto, 30/07/2026):** las skills grandes
> (maestros, agentes con mucho contexto) llevan un `SKILL.md` corto (qué es + "🚨 no romper"
> + índice) y el detalle VERBATIM en `references/*.md`, que se leen SOLO si la tarea lo pide.
> Al crear o engordar una skill: si el `SKILL.md` pasa de ~5 KB, muévele el cuerpo a
> `references/` y deja el router. Las `description:` del frontmatter, ≤350 caracteres
> (se cargan TODAS en TODAS las sesiones).

## Auditoría y memoria
| Skill / comando | Cuándo usarla |
|---|---|
| **`auditoria-central`** (skill) | Auditoría CON CONTEXTO del monorepo (estructura, typecheck, tests, seguridad multi-tenant, infra MCP). Tras renames, migraciones BD, reestructuras, o antes de un corte de infra. La "máquina de auditar". |
| **`/auditoria-diaria`** (comando) | Pasada rutinaria (ligera diaria / `--profunda` semanal): invoca `auditoria-central` y reconcilia memoria/skills/docs. **Dos carriles:** los arreglos de texto se **auto-aplican a `main`** (bitácora en `docs/AUTO-APLICADOS.md`); lo "raro" (código/infra/crons mudos) → **PR draft + aviso Telegram** con link al PR. Apóyate en `docs/FUENTES-DE-VERDAD.md` (mapa doc→código) para la frescura. Lo dispara una rutina programada (ver `RUTINAS-PROGRAMADAS.md`). |

## Routers de contexto (maestros)
| Skill | Cuándo usarla |
|---|---|
| **`central-maestro`** | Al empezar cualquier trabajo transversal o cuando no está claro qué vertical/módulo toca. Enruta al maestro correcto. |
| **`ia-rest-maestro`** | Cualquier cosa de ia.rest (Voice POS hostelería): código, Edge Functions, SQL, UI, módulos, despliegue. |
| **`sivra-maestro`** | Cualquier cosa de SIVRA (intranet pisos turísticos Sevilla). |
| **`ialimp-maestro`** | Cualquier cosa de IALIMP (SaaS limpiezas multi-tenant). |
| **`plataforma-maestro`** | Cualquier cosa de Plataforma (cuadro de mando consolidado + god-panel). |
| **`transporte-maestro`** | Cualquier cosa de la vertical Transporte (flota/camiones como negocio: vehículos, conductores, portes, rutas, servicios a terceros, intercompany flota→catering). Compone `module-flota` + `module-transporte`. |
| **`alquiler-maestro`** | Cualquier cosa de la vertical Alquiler de materiales/menaje (catálogo/stock, tarifas/día, fianzas, disponibilidad por fechas, reserva→devolución, intercompany materiales→eventos). Compone `module-alquiler`. |
| **`perfil-fiscal`** | Contexto FISCAL/patrimonial de Alberto + sociedad Punto y Coma SL: qué piso tributa dónde (Socorro/Villasís = IRPF personal), asesoría Asecon, reglas de gasto, IBKR + Modelo 720, caveats del motor `/finanzas`. Úsala en cualquier tema de renta/IRPF/deducciones o al trabajar con `facturas-correo`/`fiscal-novedades`. Datos sensibles → BD, no en la skill. |

## Agentes programados
| Skill | Cuándo usarla |
|---|---|
| **`facturas-correo`** | Revisar Gmail → clasificar facturas → archivar en Drive → conciliar con banca. A mano o por rutina diaria (08:00 CEST). |
| **`correo-triaje`** | Router de contexto del triaje de correo. **Corre como CRON de Vercel** (`apps/plataforma`, cada ~10 min), no como sesión Claude: clasifica lo nuevo del Gmail y actúa (ruido→archivar, contabilidad→buzón puente de `facturas-correo`, personal/huéspedes/leads→Telegram, phishing→marcar). Úsala para entender/extender el sistema: añadir categoría = `lib/correo/rutas.ts`; forzar remitente = fila en `correo_reglas`. Flag `TRIAJE_DRY_RUN` = modo sombra. |
| **`pricing-agente`** | Correr el agente de precios de SIVRA (estudia mercado y tarifica por los raíles del Paso 4). A mano o por rutina semanal (lunes 06:00 CEST). |
| **`mercado-booking`** | Medir el precio REAL por fecha y aforo con el conector de Booking y escribirlo en `market_rates` (`fuente='booking_mcp'`) — la única fuente de SIVRA que distingue temporada (el barrido por búsqueda web da precios de anuncio sin fecha). Rutina diaria (05:00 CEST) o a mano si Alberto pide refrescar comparables. |
| **`fiscal-novedades`** | Vigilar cambios en las deducciones del IRPF (BOE estatal + BOJA Andalucía) y sincronizar `IMPORTES_POR_ANIO` de `/finanzas` por PR + avisar en pantalla si beneficia. A mano o por rutina mensual (día 1, 07:00 CEST; y antes de la renta). |
| **`psd2-health-check`** | Guardián de la sincronización bancaria (Enable Banking). Verifica que `movimientos_bancarios` tiene datos frescos (<48h). Alerta si el cron Vercel `psd2-sync` lleva demasiado tiempo sin traer datos. Rutina semanal (miércoles 09:00 CEST) o a mano si se sospecha sync roto. |
| **`ialimp-client-health`** | Monitorización semanal de Sique Brilla (único cliente ialimp en producción): PMS sync, programaciones sin asignar, impagos. Solo lectura. Rutina semanal (viernes 17:00 CEST). |
| **`rrhh-compliance-calendar`** | Recordatorio mensual de obligaciones legales pendientes de RRHH (🔴 ítems: fichaje RD 8/2019, RGPD art.28, canal denuncias, etc.). Lee el roadmap y genera informe de plazos. Rutina mensual (día 1, 08:00 CEST). |
| **`github-vigia`** | Vigía del ecosistema GitHub/OSS (hacia FUERA, no hacia dentro): releases de los repos vigilados en `docs/VIGIA-OSS.md`, descubrimiento de herramientas nuevas por vertical, y npm outdated/CVEs. Telegram si algo merece ojo; PR draft solo para bumps pequeños y seguros. Rutina mensual (día 15, 07:00 CEST) o a mano ("revisa las novedades de GitHub"). |
| **`buscador-ia`** | Vigía de LLMs de la cadena `@central/core-ai` (`docs/BUSCADOR-IA.md`), criterio **calidad/precio** (no exige gratis desde 27/07/2026 — decisión de Alberto): (1) watch de DEPRECACIÓN de los modelos cableados (NIM/Groq/Gemini/Kimi) para cazar retiradas de catálogo antes de que rompan producción (nació por el 405B retirado que dejó "IA no disponible" a un huésped), (2) descubrimiento de candidatos nuevos (gratis o de pago barato) que meter, (3) mini-eval de candidatos. Telegram si algo merece ojo (swap gratis→pago SIEMPRE por Telegram con precio explícito, nunca PR mecánico); PR draft solo para swaps seguros (id muerto→vigente) o plumbing de proveedor nuevo. Rutina semanal (lunes 07:00 CEST) o a mano ("revisa si hay una IA mejor que meter"). |
| **`agente-huésped` (SIVRA)** | Agente de mensajería con huéspedes de Smoobu. **Corre como cron+webhook de Vercel** (`apps/plataforma`, `/api/sivra/mensajes/*`), no como sesión Claude. Su **prompt vive en CÓDIGO**, no en una skill: system prompt en `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` + reglas en `reglas.ts`/`sensibilidad.ts`/`graduacion.ts`; el contexto está en el router `sivra-maestro`. El `agentes-entrenador` lo evalúa por feedback/PRs y propone mejoras de prompt por **PR draft tocando `decidir.ts`** (no una skill). |
| **`agentes-entrenador`** | El "agente de agentes": mejora los prompts de los agentes programados por RENDIMIENTO (bitácora `docs/AGENTES-BITACORA.md` + feedback `docs/FEEDBACK-AGENTES.md` + PRs + BD) y por calidad transversal entre skills. NO toca frescura factual (eso es de `/auditoria-diaria`). Cambios de comportamiento SIEMPRE por PR draft + Telegram; nunca se auto-modifica. Rutina semanal (domingo ~07:30 CEST) o a mano (`/agentes-entrenador`). |
| **`trading-analista`** | Pasada diaria del agente de inversión asistida sobre Interactive Brokers (Fase 1 técnica cerrada, Fase B por SELECCIÓN en marcha — SOLO paper trading, cero ejecución real). Lee cartera + watchlist, tira precios (IBKR MCP) y fundamentales (FMP/EDGAR/Dataroma) por MCP, llama a `/api/trading/*` de plataforma (analizar/puntuar/factores/gurus/fundamentales/insiders/seleccion/validar-oos/paper/saldo) y resume por Telegram. Compone el paquete puro `@central/module-trading`. **✅ RESUELTO (19/07/2026):** el bloqueo de infra (egress 403 + `ALERTA_TOKEN` desincronizado) se arregló — verificado end-to-end (`POST /api/trading/saldo` 200, NAV refrescado). Trigger corriendo de punta a punta (ver `docs/RUTINAS-PROGRAMADAS.md`). |

## Diseño
| Skill | Cuándo usarla |
|---|---|
| **`adobe-diseno`** | Antes de crear o mejorar cualquier activo visual: logos, banners, iconos, mockups de UI, material de marca, presentaciones. Activa el MCP de Adobe Creative Cloud (Firefly, vectorizar, ajustar, recortar, quitar fondo, exportar); llama primero a `adobe_mandatory_init`. Enrutada desde `central-maestro`. |
| **`marca-cliente`** | Alta/intake de la identidad corporativa de un cliente o tenant y aplicación **100% a su app**: cuando entra un cliente nuevo (Joaquín Jaén, Rico González, Global…) o hay un rebrand y hay que dejar la UI IDÉNTICA a SU marca (logo real, colores exactos del propio logo, tipografía), o cuando Alberto pide "adáptalo a la imagen corporativa de X" / "corporativo 100%". Convierte el material crudo (logo + web + fotos) en un objeto `Marca` de **`@central/brand`** (`packages/brand`) y lo enchufa vía `emitirRootCss` en el `<head>`. Trae el método probado (extracción de paleta con Node+zlib, logo embebido en base64, Adobe Fonts para tipografía exacta, verificación con Playwright). Complementa a `adobe-diseno` (vectorizar/limpiar el logo). |

## Metodología (superpowers)
| Skill | Cuándo usarla |
|---|---|
| **`using-superpowers`** | Meta-skill; se inyecta al arrancar la sesión. Cómo encontrar y usar skills. |
| **`brainstorming`** | Antes de cualquier trabajo creativo (features, componentes, cambios de comportamiento). |
| **`writing-plans`** | Cuando hay un spec/requisitos para una tarea multi-paso, antes de tocar código. |
| **`systematic-debugging`** | Ante un bug, fallo de test o comportamiento inesperado, antes de proponer fix. |
| **`verification-before-completion`** | Antes de afirmar que algo está hecho/arreglado/pasa; exige evidencia. |
| **`requesting-code-review`** | Al completar tareas o features grandes, antes de mergear. |
| **`receiving-code-review`** | Al recibir feedback de revisión, antes de implementar las sugerencias. |

## Desarrollo (ahorro de tokens)
| Skill | Cuándo usarla |
|---|---|
| **`code-map`** | Al empezar una tarea de CÓDIGO donde hay que localizar qué archivo/función maneja algo, ANTES de Grep/Read a ciegas. Consulta la tabla `mapa_arquitectura` (índice de firmas, ~0 tokens) por `word_similarity`/GIN para acotar archivos candidatos y leer solo esos. Gemelo lado-sesión del endpoint `/api/ai/codigo`. Degrada al método clásico si el mapa no está. Ver `docs/DIRECTOR-CODIGO.md`. |
| **`delegar-codigo`** | Cuando una tarea de código sea MECÁNICA o VOLUMINOSA (renames masivos, mismo patrón en N archivos, boilerplate, migraciones planas) y quieras ahorrar tokens de Claude. Esquema "caro planifica / barato ejecuta": tú organizas y decides, un modelo barato de OpenRouter escribe cada archivo vía `scripts/ai-ejecutar.mjs` → `/api/ai/ejecutar` (endpoint `codigo`); tú planificas, delegas y REVISAS/verificas, no generas los diffs. NO usarla para lógica sutil ni sin volumen. Gemela del endpoint `/api/ai/ejecutar`; complementa a `code-map` (que acota QUÉ archivos). Ver `docs/DIRECTOR-CODIGO.md`. |

## Hooks (automatización, no se invocan a mano)
| Hook | Qué hace |
|---|---|
| `Stop` → `persist-memoria.sh` | Guardián de cierre (obliga a anotar memoria si hubo trabajo) + commitea/pushea `CONTEXTO-SESIONES.md`. |
| `SessionStart` → `memoria-record-base.sh` | Graba el SHA base de la sesión (para el guardián). |
| `SessionStart` → `superpowers-session-start.sh` | Inyecta `using-superpowers`. |
| `PreCompact` → `memoria-precompact.sh` | Recuerda volcar memoria antes de compactar sesiones largas. |
