/**
 * PORT central (fase 3) — schema Drizzle de la ingesta CIMA, copiado TAL CUAL de
 * `asegura/src/db/schema.ts` (CRM, main del 02/11/2026), RECORTADO a las 18 tablas que
 * lee/escribe la ingesta y a su cierre de dependencias (enums y tablas a las que
 * apuntan sus FK: corredurias, usuarios, cotizaciones, oportunidades).
 *
 * 🚨 NO es una fuente de migraciones: la BD (schema `seguros`) YA EXISTE. Aquí no se
 * genera ni se aplica DDL (sin drizzle-kit). Nombres SIN schema: resuelven por el
 * `search_path=seguros` del rol (igual que el CRM).
 *
 * Por qué Drizzle y no Prisma (decisión validada, spec 2026-11-02 §3): al Prisma de
 * central le faltan 9 tablas, 18 columnas, 3 enums y los índices únicos PARCIALES
 * que la ingesta usa con `onConflictDoUpdate({ targetWhere })`.
 *
 * Hasta el corte, un cambio de columnas en el CRM se replica AQUÍ a mano.
 * Columnas fuera del schema a propósito (se escriben por SQL crudo vía
 * `columna-opcional.ts`): `siniestros.cima_extra`, `cima_cobertura_campos.excluido_motivo`.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  numeric,
  pgEnum,
  jsonb,
  boolean,
  integer,
  bigint,
  index,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "corredor",
  "usuario",
]);

export const tipoSeguroEnum = pgEnum("tipo_seguro", [
  "auto",
  "moto",
  "hogar",
  "vida",
  "salud",
  "decesos",
  "responsabilidad_civil",
  "comercio",
  // LOO-857 (Epic LOO-849, Ola 2) — ramo COMUNIDADES de primera clase. `comercio`
  // ya existía; `comunidades` se AÑADE aquí + `ALTER TYPE ... ADD VALUE IF NOT
  // EXISTS 'comunidades' AFTER 'comercio'` (mig 0087). El ORDEN de este array debe
  // coincidir con POLIZA_TIPOS / OPORTUNIDAD_TIPOS (tests anti-drift `deepEqual`).
  "comunidades",
  "otros",
  // BIDV004566 (Occident, ramo DGS 211) — `ALTER TYPE ... ADD VALUE IF NOT
  // EXISTS 'accidentes'` sin AFTER (mig 2026-09-09_tipo_seguro_accidentes.sql):
  // el valor quedó AL FINAL del enum de Postgres, no junto a los demás.
  "accidentes",
]);

// LOO-689 (épica CRM F3) — ampliación aditiva 4→10. Los 4 valores legacy
// (`activa`/`vencida`/`cancelada`/`en_renovacion`) se conservan SIN reescribir
// filas; los 6 nuevos replican los estados que Alberto usa en la intranet.
// Mapeo conceptual legacy→destino (NO se aplica data rewrite en esta PR; se
// hará en un backfill posterior si el operador lo decide):
//   activa        → en_vigor
//   en_renovacion → (sin equivalente directo; se mantiene)
//   vencida       → fin_riesgo / anula_al_vencimiento (según motivo)
//   cancelada     → (se mantiene)
// Nuevos: en_vigor, fin_riesgo, recibo_devuelto, cambio_clave,
//   anula_al_vencimiento, competencia.
export const estadoPolizaEnum = pgEnum("estado_poliza", [
  "activa",
  "vencida",
  "cancelada",
  "en_renovacion",
  "en_vigor",
  "fin_riesgo",
  "recibo_devuelto",
  "cambio_clave",
  "anula_al_vencimiento",
  "competencia",
]);

/** Canal/origen comercial de una oportunidad (intranet legacy: Venta Directa,
 * Tarifas Blancas, AhorroSeguro…). varchar-libre evitado a propósito: el set
 * está estable y validado en campo. */
export const fuenteOrigenEnum = pgEnum("fuente_origen", [
  "venta_directa",
  "tarifas_blancas",
  "ahorro_seguro",
  "recomendacion",
  "renovacion",
  "otros",
]);

/** FSM comercial de una oportunidad (deal CRM). */
export const estadoComercialEnum = pgEnum("estado_comercial", [
  "en_negociacion",
  "competencia",
  "pendiente_cliente",
  "ganada",
  "perdida",
]);

/** Periodicidad de fraccionamiento de la prima. */
export const fraccionamientoEnum = pgEnum("fraccionamiento", [
  "anual",
  "semestral",
  "trimestral",
  "mensual",
]);

/** FSM de un siniestro. */
export const estadoSiniestroEnum = pgEnum("estado_siniestro", [
  "abierto",
  "en_tramitacion",
  "cerrado",
  "rechazado",
]);

/** LOO-750 — origen del siniestro (espejo de `poliza_origen`).
 * `gestionado_correduria` — el corredor lo dio de alta a mano en el portal.
 * `cima` — ingestado del EIAC SIN del feed CIMA (pipeline LOO-750). */
export const siniestroOrigenEnum = pgEnum("siniestro_origen", [
  "gestionado_correduria",
  "cima",
]);

/** LOO-771 — gravedad operativa del siniestro (triaje manual del corredor).
 * NO la provee CIMA: la fija el corredor en la ficha. Escala creciente
 * leve < moderado < grave < muy_grave; el badge la pinta por color. */
export const siniestroGravedadEnum = pgEnum("siniestro_gravedad", [
  "leve",
  "moderado",
  "grave",
  "muy_grave",
]);

/** LOO-753 — situación de un recibo CIMA (EIAC SituacionRecibo). Best-effort:
 * `CO`=cobrado verificado en prod; resto del dict es defensivo (CONFIRMAR codes
 * TIREA). El mapper usa default `pendiente` + manda a review un código desconocido. */
export const reciboEstadoEnum = pgEnum("recibo_estado", [
  "cobrado",
  "pendiente",
  "devuelto",
  "anulado",
  "emitido",
]);

/** LOO-753 — origen de un recibo (espejo de `siniestro_origen`).
 * `manual` — reservado (no hay UI de alta hoy). `cima` — ingestado del EIAC REC. */
export const reciboOrigenEnum = pgEnum("recibo_origen", ["manual", "cima"]);

/** LOO-757 — estado de una liquidación CIMA (EIAC EstadoLiquidacion). Best-effort:
 * `LI`=liquidada visto en prod; resto del dict es defensivo (CONFIRMAR codes TIREA).
 * El mapper usa default `pendiente`; un código desconocido NO rompe la ingesta. */
export const liquidacionEstadoEnum = pgEnum("liquidacion_estado", [
  "liquidada",
  "pendiente",
  "parcial",
  "anulada",
]);

/** LOO-757 — origen de un registro de cuenta de efectivo (espejo de `recibo_origen`).
 * `manual` — reservado (no hay UI de alta hoy). `cima` — ingestado del EIAC CEF. */
export const cefOrigenEnum = pgEnum("cef_origen", ["manual", "cima"]);

/** Rol de un interviniente en una póliza (propietario / conductor / etc.). */
export const intervinienteRolEnum = pgEnum("interviniente_rol", [
  "propietario",
  "conductor_habitual",
  "conductor_ocasional",
  "contacto",
  "beneficiario",
  // LOO-752 — asegurado a nivel póliza (figura distinta del Tomador, Art.14).
  // Lo añade la mig 0077 vía ALTER TYPE ... ADD VALUE.
  "asegurado",
  // 28/09/2026 — pagador (EIAC `ClaseFigura=PA`). Antes caía en `contacto`.
  // Lo añade la mig 0103 vía ALTER TYPE ... ADD VALUE IF NOT EXISTS.
  "pagador",
]);

/** LOO-752 — origen de un interviniente: manual (corredor, LOO-714) | cima (EIAC POL). */
export const intervinienteOrigenEnum = pgEnum("interviniente_origen", [
  "manual",
  "cima",
]);

// LOO-171 (ADR-008): origen de una póliza.
// `gestionada_correduria` — emitida vía Codeoscopic, Submit firmado por el corredor. Datos completos.
// `declarada_usuario` — el usuario la metió a mano desde el portal. Datos parciales, no toca Codeoscopic.
//   Sirve para tracking + lead generation por vencimiento.
export const polizaOrigenEnum = pgEnum("poliza_origen", [
  "gestionada_correduria",
  "declarada_usuario",
]);

export const estadoCotizacionEnum = pgEnum("estado_cotizacion", [
  "pendiente",
  "enviada",
  "aceptada",
  "rechazada",
  "expirada",
  // LOO-447 — estado terminal "póliza emitida/ganada" (distinto de 'aceptada').
  "emitida",
]);

export const canalRecordatorioEnum = pgEnum("canal_recordatorio", [
  "email",
  "whatsapp",
  "ambos",
]);

export const planSuscripcionEnum = pgEnum("plan_suscripcion", [
  "trial",
  "basico",
  "profesional",
  "enterprise",
]);

// -- Corredurías (tenants) --
export const corredurias = pgTable("corredurias", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  cif: varchar("cif", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  telefono: varchar("telefono", { length: 20 }),
  direccion: text("direccion"),
  codigoPostal: varchar("codigo_postal", { length: 10 }),
  ciudad: varchar("ciudad", { length: 100 }),
  provincia: varchar("provincia", { length: 100 }),
  logoUrl: text("logo_url"),
  web: varchar("web", { length: 255 }),
  // WhatsApp config
  waPhoneNumberId: varchar("wa_phone_number_id", { length: 100 }),
  waBusinessAccountId: varchar("wa_business_account_id", { length: 100 }),
  waAccessToken: text("wa_access_token"),
  // Suscripción
  plan: planSuscripcionEnum("plan").default("trial").notNull(),
  planExpiresAt: timestamp("plan_expires_at"),
  maxPolizas: integer("max_polizas").default(500).notNull(),
  // Config
  recordatoriosDias: jsonb("recordatorios_dias")
    .$type<number[]>()
    .default([30, 15, 7]),
  recordatoriosCanal: canalRecordatorioEnum("recordatorios_canal").default(
    "email"
  ),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// -- Usuarios (auth via Supabase Auth) --
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: uuid("auth_user_id").notNull().unique(), // references auth.users(id)
    email: varchar("email", { length: 255 }).notNull().unique(), // LOO-181: previene duplicados via trigger handle_new_user
    nombre: varchar("nombre", { length: 255 }).notNull(),
    apellidos: varchar("apellidos", { length: 255 }),
    telefono: varchar("telefono", { length: 20 }),
    rol: userRoleEnum("rol").default("usuario").notNull(),
    correduriaId: uuid("correduria_id").references(() => corredurias.id),
    activo: boolean("activo").default(true).notNull(),
    lastAcceptedLegalVersion: text("last_accepted_legal_version")
      .notNull()
      .default("2026-XX-v0-pre-governance"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_usuarios_auth").on(table.authUserId),
    index("idx_usuarios_correduria").on(table.correduriaId),
    index("idx_usuarios_legal_version").on(table.lastAcceptedLegalVersion),
  ]
);

// -- Clientes (asegurados) --
/** LOO-420 — segmento de ciclo de vida del cliente (derivado del historial de
 * pólizas; ver `recomputeSegmentosForCorreduria`). Independiente de `activo`. */
export const segmentoClienteEnum = pgEnum("segmento_cliente", [
  "cliente",
  "ex_cliente",
  "prospecto",
]);

/** LOO-420 — clasificación del origen de la entrada en `clientes`. Ortogonal
 * al `segmento` (que es el estado del funnel). Importante: los registros
 * `beneficiario` representan a la persona beneficiaria de una póliza
 * (vida/decesos) — NO deben recibir comunicaciones comerciales. Los `lead`
 * son posibles clientes sin convertir. Default `cliente`. */
export const tipoClienteEnum = pgEnum("tipo_cliente", [
  "cliente",
  "lead",
  "beneficiario",
]);

/** LOO-635 — etapa del pipeline comercial de un lead (tipo='lead'). Ortogonal
 * a `tipo`/`segmento`. Default `nuevo`; el operador la avanza manualmente.
 * `ganado` = convertido (obtuvo póliza); `perdido` = descartado. */
export const leadEstadoEnum = pgEnum("lead_estado", [
  "nuevo",
  "contactado",
  "cualificado",
  "propuesta",
  "ganado",
  "perdido",
]);

/** LOO-518 (épica CIMA LOO-515) — naturaleza jurídica del Tomador en EIAC.
 * Nullable en `clientes` (legacy desconocido); el mapper EIAC lo fija al ingerir. */
export const tipoPersonaEnum = pgEnum("tipo_persona", ["fisica", "juridica"]);

/** LOO-518 — FSM de cada fichero EIAC descargado de CIMA (ver `cimaFicheros`).
 * `pending` recién descargado → `persisted` upsert OK (pre-confirmarDescarga) →
 * `confirmed` ack TIREA OK. `review`/`review_salud` requieren acción manual;
 * `deferred` = tipo no-POL no procesado (SIN/REC/LIQ); `error` = fallo de parseo/persist. */
export const cimaFicheroEstadoEnum = pgEnum("cima_fichero_estado", [
  "pending",
  "persisted",
  "confirmed",
  "review",
  "review_salud",
  "deferred",
  "error",
]);

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id), // nullable: linked when client registers
    // Datos personales
    nombre: varchar("nombre", { length: 255 }).notNull(),
    apellidos: varchar("apellidos", { length: 255 }).notNull(),
    /** LOO-236 Phase 1 — cipher AES-256-GCM via `encryptFieldNullable`. Read via `decryptClientePiiFields` o helpers en `src/lib/clientes/pii.ts`. */
    dni: text("dni"),
    /** LOO-246 Phase 2 — cipher AES-256-GCM. Type `text` (era `varchar(20)`). Lookup vía `telefonoLookupHash`. */
    telefono: text("telefono"),
    /** LOO-246 Phase 2 — cipher AES-256-GCM. Type `text` (era `varchar(255)`). Lookup vía `emailLookupHash`. */
    email: text("email"),
    /** LOO-246 Phase 2 — HMAC-SHA256 hex de `lower(trim(email))` con `PII_LOOKUP_KEY`. Equality lookup en sign-in portal y dedup imports. ADR-016. */
    emailLookupHash: text("email_lookup_hash"),
    /** LOO-246 Phase 2 — HMAC-SHA256 hex de `digits(telefono)` con `PII_LOOKUP_KEY`. */
    telefonoLookupHash: text("telefono_lookup_hash"),
    /** LOO-236 Phase 1 — cipher AES-256-GCM. Type `text` (era `date`). Decrypt para obtener ISO "YYYY-MM-DD". */
    fechaNacimiento: text("fecha_nacimiento"),
    /** LOO-236 Phase 1 — cipher AES-256-GCM. */
    direccion: text("direccion"),
    codigoPostal: varchar("codigo_postal", { length: 10 }),
    ciudad: varchar("ciudad", { length: 100 }),
    provincia: varchar("provincia", { length: 100 }),
    // WhatsApp
    waOptIn: boolean("wa_opt_in").default(false).notNull(),
    waPhoneNumber: varchar("wa_phone_number", { length: 20 }),
    /**
     * LOO-243 — timestamp de revocación de consentimiento comunicaciones
     * automatizadas (LOPD-GDD Art. 21 LSSI). Distinto del boolean `waOptIn`:
     * éste es señal LOPD de baja explícita y `sendWhatsAppTextMessage` lo
     * consulta antes de despachar.
     */
    waOptOutAt: timestamp("wa_opt_out_at"),
    /** Origen del opt-out: "whatsapp" | "email" | "portal". */
    waOptOutSource: varchar("wa_opt_out_source", { length: 30 }),
    /**
     * LOO-258 — timestamp de revocación de consentimiento comunicaciones
     * automatizadas por email (LOPD-GDD Art. 21 LSSI + Gmail/Yahoo RFC 8058).
     * Pre-send `send-due` y `ofertas-automaticas/notify` lo consultan antes
     * de despachar email. Distinto del WA opt-out: un cliente puede revocar
     * un canal sin el otro (canal_preferido fallback).
     */
    emailOptOutAt: timestamp("email_opt_out_at"),
    /** Origen del opt-out: "one_click" | "mailto_manual" | "dpo_request". */
    emailOptOutSource: varchar("email_opt_out_source", { length: 30 }),
    // Preferencias
    canalPreferido: canalRecordatorioEnum("canal_preferido").default("email"),
    notas: text("notas"),
    /** Clave estable por correduría para import CSV / idempotencia (ej. legacy id). */
    importRef: varchar("import_ref", { length: 100 }),
    /**
     * LOO-378 — soft-delete flag. Default true; `false` cuando el corredor
     * desactiva el cliente (acción reversible) o cuando se procesa el derecho
     * al olvido RGPD Art. 17 (acción irreversible que también anonimiza PII).
     * `searchClientesInCorreduria` filtra `activo = true` por defecto.
     */
    activo: boolean("activo").default(true).notNull(),
    /** LOO-420 — segmento ciclo de vida (cliente/ex_cliente/prospecto). Default
     * prospecto; lo promueve `recomputeSegmentosForCorreduria` según pólizas. */
    segmento: segmentoClienteEnum("segmento").default("prospecto").notNull(),
    /** LOO-420 — origen del registro (cliente/lead/beneficiario). Default
     * cliente; lead/beneficiario marcan entradas legacy del intranet de Alberto
     * que NO son clientes comerciales y NO deben recibir campañas. */
    tipo: tipoClienteEnum("tipo").default("cliente").notNull(),
    /** LOO-518 (épica CIMA LOO-515) — blind-index HMAC-SHA256 hex del DNI/NIF
     * normalizado con `PII_LOOKUP_KEY` (ADR-016). Equality-lookup para reconciliar
     * el Tomador de un EIAC con la ficha legacy. Backfill PR-6/LOO-520. */
    dniLookupHash: text("dni_lookup_hash"),
    /** LOO-518 — naturaleza jurídica del Tomador (fisica/juridica). Nullable:
     * el legacy no lo distingue; lo fija el mapper EIAC al ingerir. */
    tipoPersona: tipoPersonaEnum("tipo_persona"),
    /** LOO-635 — etapa del pipeline comercial (solo significativa para leads).
     * Default `nuevo`; el operador la avanza desde la sección /leads. */
    leadEstado: leadEstadoEnum("lead_estado").default("nuevo").notNull(),
    /** LOO-582 — pertenencia al cohort piloto PATH A (beta cerrada). NOT NULL =
     * invitado al portal; NULL = sin acceso bajo `PORTAL_INVITE_ONLY`. El operador
     * lo setea/limpia vía Supabase MCP sin deploy (allowlist gestionable). El gate
     * autoritativo vive en `loadPortalSession` (auth.ts); la captura de leads del
     * cotizador anónimo NO depende de esto (sigue abierta). */
    cohortInvitedAt: timestamp("cohort_invited_at"),
    // -- LOO-689 (épica CRM F3) — campos CRM del corredor. Todos aditivos
    //    seguros (nullable). Ver diseño §3. --
    /** Comercial asignado al cliente (FK usuarios). Nullable. */
    comercialId: uuid("comercial_id").references(() => usuarios.id),
    /** Canal/origen comercial del cliente. */
    fuente: fuenteOrigenEnum("fuente"),
    estadoCivil: varchar("estado_civil", { length: 40 }),
    ocupacion: varchar("ocupacion", { length: 120 }),
    sector: varchar("sector", { length: 120 }),
    /** LOO-689 — PII Tier-1 cipher AES-256-GCM (IBAN). Sin LookupHash (no se
     * busca por cuenta). Misma convención que `dni`/`direccion`. */
    cuentaBancaria: text("cuenta_bancaria"),
    saludo: varchar("saludo", { length: 10 }),
    /** LOO-689 — PII Tier-1 cipher AES-256-GCM (dirección fiscal). */
    direccionFiscal: text("direccion_fiscal"),
    cpFiscal: varchar("cp_fiscal", { length: 10 }),
    ciudadFiscal: varchar("ciudad_fiscal", { length: 100 }),
    provinciaFiscal: varchar("provincia_fiscal", { length: 100 }),
    /** LOO-887 Slice 3 — Tombstone de fusión de fichas de cliente gemelas: la
     * ficha absorbida apunta a la superviviente. El merge repunta las FKs y
     * hereda los datos de contacto que la superviviente no tenga. NULL = ficha
     * viva; los read-paths filtran `merged_into_cliente_id IS NULL` (Slice 3c).
     * Nullable. Espejo de `polizas.merged_into_poliza_id`. */
    mergedIntoClienteId: uuid("merged_into_cliente_id").references(
      (): AnyPgColumn => clientes.id,
    ),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_clientes_correduria").on(table.correduriaId),
    // LOO-689 — filtro de cartera por comercial asignado.
    index("idx_clientes_comercial")
      .on(table.comercialId)
      .where(sql`${table.comercialId} is not null`),
    // LOO-491 — agregaciones mensuales del dashboard (correduria + rango created_at).
    index("idx_clientes_correduria_created").on(
      table.correduriaId,
      table.createdAt,
    ),
    // LOO-420 — filtro de campañas por segmento dentro del tenant.
    index("idx_clientes_segmento").on(table.correduriaId, table.segmento),
    // LOO-420 — filtro UI por tipo (excluir beneficiarios/leads sin convertir).
    index("idx_clientes_tipo").on(table.correduriaId, table.tipo),
    // LOO-635 — filtro del pipeline de leads por etapa dentro del tenant.
    index("idx_clientes_lead_estado").on(table.correduriaId, table.leadEstado),
    // LOO-236 Phase 1: idx_clientes_dni eliminado — cipher AES-GCM no-determinístico
    // rompe lookup exacto. Si Phase 2 incorpora blind-index dni, recrear sobre el hash.
    // LOO-246 Phase 2: idx_clientes_email eliminado — cipher rompe lookup `lower(email)=$1`.
    // Reemplazado por `uq_clientes_email_lookup_hash` (HMAC determinístico) abajo.
    uniqueIndex("uq_clientes_email_lookup_hash")
      .on(table.emailLookupHash)
      .where(sql`${table.emailLookupHash} is not null`),
    // LOO-518 — reconciliación CIMA↔legacy por DNI del Tomador. Parcial:
    // colisiones legacy (2 fichas mismo DNI) quedan null tras el backfill (PR-6) y
    // no rompen el índice.
    // LOO-894 — el predicado incluye `tipo='cliente'`: los leads/beneficiarios están
    // fuera del matching por política v2 (LOO-528) y no deben ocupar el slot del DNI
    // de un titular real (2.270 lo hacían → 23505 en el backfill, y `resolveCliente`
    // podía resolver un POL de CIMA a un lead). Mig 0090.
    uniqueIndex("uq_clientes_dni_lookup_hash")
      .on(table.dniLookupHash)
      .where(
        sql`${table.dniLookupHash} is not null and ${table.tipo} = 'cliente'::tipo_cliente`,
      ),
    index("idx_clientes_telefono_lookup_hash")
      .on(table.telefonoLookupHash)
      .where(sql`${table.telefonoLookupHash} is not null`),
    index("idx_clientes_correduria_import_ref").on(
      table.correduriaId,
      table.importRef
    ),
    uniqueIndex("uq_clientes_correduria_import_ref")
      .on(table.correduriaId, table.importRef)
      .where(sql`${table.importRef} is not null`),
    // LOO-258 — partial index para acelerar queries pre-send que filtran clientes opted-out por email.
    index("idx_clientes_email_opt_out")
      .on(table.emailOptOutAt)
      .where(sql`${table.emailOptOutAt} is not null`),
    // LOO-243 — partial index para lookups WA opt-out por teléfono (sendWhatsAppTextMessage guard).
    index("idx_clientes_wa_phone_opt_out")
      .on(table.waPhoneNumber)
      .where(sql`${table.waOptOutAt} is not null`),
    // LOO-582 — partial index para listar el cohort piloto invitado dentro del tenant.
    index("idx_clientes_cohort_invited")
      .on(table.correduriaId, table.cohortInvitedAt)
      .where(sql`${table.cohortInvitedAt} is not null`),
    // LOO-887 Slice 3 — FK index hygiene: filtro de tombstones de fusión de fichas.
    index("idx_clientes_merged_into")
      .on(table.mergedIntoClienteId)
      .where(sql`${table.mergedIntoClienteId} is not null`),
  ]
);

// -- Pólizas --
export const polizas = pgTable(
  "polizas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    clienteId: uuid("cliente_id")
      .references(() => clientes.id)
      .notNull(),
    // Datos de la póliza
    tipo: tipoSeguroEnum("tipo").notNull(),
    /** LOO-171: distingue gestionadas (Codeoscopic Submit firmado) de declaradas (input usuario). */
    origen: polizaOrigenEnum("origen")
      .default("gestionada_correduria")
      .notNull(),
    aseguradora: varchar("aseguradora", { length: 255 }).notNull(),
    /** LOO-171: nombre libre de la compañía cuando origen=declarada_usuario y no está en catálogo. */
    companiaDeclarada: varchar("compania_declarada", { length: 255 }),
    numeroPoliza: varchar("numero_poliza", { length: 100 }),
    /**
     * LOO-691: nullable en BD para admitir el backfill de la cartera legacy de
     * Alberto (casi nunca tiene fecha de inicio, solo vencimiento). La
     * obligatoriedad para entradas NUEVAS se mantiene en la capa de validación
     * (Zod required en poliza-declarada.ts + acciones de crear póliza).
     */
    fechaInicio: date("fecha_inicio"),
    /**
     * LOO-697: nullable en BD para admitir la re-migración de la cartera VIVA
     * legacy (importación fiel, sin imputar fechas sintéticas — algunas pólizas
     * carecen de vencimiento). La obligatoriedad para entradas NUEVAS se mantiene
     * en la capa de validación (Zod `fechaSchema` en poliza-declarada.ts + alta
     * dashboard/portal + gate review CIMA `falta_fecha_vencimiento`). La BD solo
     * se relaja para el backfill histórico.
     */
    fechaVencimiento: date("fecha_vencimiento"),
    primaAnual: numeric("prima_anual", { precision: 10, scale: 2 }),
    primaMensual: numeric("prima_mensual", { precision: 10, scale: 2 }),
    estado: estadoPolizaEnum("estado").default("activa").notNull(),
    /** LOO-171: el corredor validó manualmente los datos de una póliza declarada. */
    verificadoPorCorreduria: boolean("verificado_por_correduria")
      .default(false)
      .notNull(),
    // Datos específicos del tipo (matrícula, dirección inmueble, etc.)
    datosEspecificos: jsonb("datos_especificos").$type<Record<string, unknown>>(),
    // Coberturas
    coberturas: jsonb("coberturas").$type<string[]>(),
    // Documentos
    documentoUrl: text("documento_url"),
    /** Clave estable por correduría para import CSV / idempotencia. */
    importRef: varchar("import_ref", { length: 100 }),
    // -- Campos EIAC (LOO-518, épica CIMA LOO-515). Todos nullable: aditivos sobre
    //    cartera existente; los rellena el pipeline de ingesta (PR-7/LOO-524). --
    /** Identificador de póliza en la entidad aseguradora (EIAC `IdPolizaEntidad`).
     * Clave de negocio para idempotencia del upsert junto a `codigoEntidadDgs`. */
    idPolizaEntidad: varchar("id_poliza_entidad", { length: 50 }),
    /** Código DGS de la entidad aseguradora (EIAC `CodigoEntidad`, p. ej. C0058). */
    codigoEntidadDgs: varchar("codigo_entidad_dgs", { length: 16 }),
    /** Ramo DGS del EIAC (`RamoDGS`, p. ej. 241 Autos). Distinto del enum `tipo`. */
    ramoDgs: varchar("ramo_dgs", { length: 8 }),
    /** Código de situación TIREA de la póliza en el EIAC. */
    situacion: varchar("situacion", { length: 4 }),
    /** Fecha de efecto inicial del EIAC (`FechaEfectoInicial`). */
    fechaEfectoInicial: date("fecha_efecto_inicial"),
    /** SHA-256 hex del XML EIAC que originó/actualizó esta póliza (trazabilidad). */
    eiacXmlHash: varchar("eiac_xml_hash", { length: 64 }),
    /** 28/09/2026 (mig 0103) — EIAC `Fechas/FechaEmision`. Nullable: solo CIMA. */
    fechaEmision: date("fecha_emision"),
    /** 28/09/2026 (mig 0103) — EIAC `Fechas/FechaEfectoActual` (efecto del
     * periodo/suplemento en curso). `fechaInicio` sigue siendo FechaEfectoInicial. */
    fechaEfectoActual: date("fecha_efecto_actual"),
    /** 28/09/2026 (mig 0103) — EIAC `Fechas/FechaSituacion` (desde cuándo rige `situacion`). */
    fechaSituacion: date("fecha_situacion"),
    /** 28/09/2026 (mig 0103) — EIAC `Fechas/FechaSolicitud`. */
    fechaSolicitud: date("fecha_solicitud"),
    // -- LOO-689 (épica CRM F3) — campos CRM. Aditivos seguros (nullable / default).
    //    DIFERIDOS a P2: `colaboradorId` (red/usuarios) y `aseguradoraId`
    //    (companias_catalogo) — se conserva `aseguradora varchar` libre. --
    /** Prima bruta (con impuestos). `primaAnual` sigue siendo la neta legacy. */
    primaBruta: numeric("prima_bruta", { precision: 10, scale: 2 }),
    fraccionamiento: fraccionamientoEnum("fraccionamiento"),
    /** LOO-689 — PII Tier-1 cipher AES-256-GCM (IBAN de domiciliación). */
    cuentaBancaria: text("cuenta_bancaria"),
    /** Comercial asignado (FK usuarios). Nullable. */
    comercialId: uuid("comercial_id").references(() => usuarios.id),
    /** Self-FK: cadena de renovaciones / suplementos. La póliza "padre" es la
     * anterior de la cadena. Nullable. */
    polizaPadreId: uuid("poliza_padre_id").references(
      (): AnyPgColumn => polizas.id,
    ),
    /** Flag QA: marcar la póliza para seguimiento auditado. */
    auditarSeguimiento: boolean("auditar_seguimiento")
      .default(false)
      .notNull(),
    /** Oportunidad (deal CRM) que originó esta póliza. FK forward a
     * `oportunidades` (definida más abajo). Nullable. */
    oportunidadOrigenId: uuid("oportunidad_origen_id").references(
      (): AnyPgColumn => oportunidades.id,
    ),
    /** Snapshot de la oferta de la competencia (no-PII): {aseguradora, nPoliza,
     * prima, fechaVenc}. */
    polizaCompetencia: jsonb("poliza_competencia").$type<Record<string, unknown>>(),
    /** LOO-718 — Snapshot no-PII de la póliza anterior sustituida (paridad
     * intranet "póliza actual/sustituida"): {aseguradora, numeroPoliza, prima,
     * fechaVencimiento}. Sin PII (no IBAN, no datos de persona). */
    polizaSustituida: jsonb("poliza_sustituida").$type<Record<string, unknown>>(),
    /** LOO-887 — Tombstone de fusión de gemelas CIMA↔legacy: la fila legacy
     * absorbida apunta a la CIMA superviviente (autoritativa). El merge hereda
     * solo los datos_especificos que la CIMA no tenga. NULL = fila viva; los
     * read-paths filtran `merged_into_poliza_id IS NULL`. Nullable. */
    mergedIntoPolizaId: uuid("merged_into_poliza_id").references(
      (): AnyPgColumn => polizas.id,
    ),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_polizas_correduria").on(table.correduriaId),
    // LOO-689 — FK index hygiene + filtro por comercial / cadena de renovaciones.
    index("idx_polizas_comercial")
      .on(table.comercialId)
      .where(sql`${table.comercialId} is not null`),
    index("idx_polizas_padre")
      .on(table.polizaPadreId)
      .where(sql`${table.polizaPadreId} is not null`),
    index("idx_polizas_oportunidad_origen")
      .on(table.oportunidadOrigenId)
      .where(sql`${table.oportunidadOrigenId} is not null`),
    // LOO-491 — agregaciones mensuales del dashboard (correduria + rango created_at).
    index("idx_polizas_correduria_created").on(
      table.correduriaId,
      table.createdAt,
    ),
    index("idx_polizas_cliente").on(table.clienteId),
    index("idx_polizas_vencimiento").on(table.fechaVencimiento),
    index("idx_polizas_estado").on(table.estado),
    index("idx_polizas_origen").on(table.origen),
    index("idx_polizas_correduria_import_ref").on(
      table.correduriaId,
      table.importRef
    ),
    uniqueIndex("uq_polizas_correduria_import_ref")
      .on(table.correduriaId, table.importRef)
      .where(sql`${table.importRef} is not null`),
    // LOO-518 — clave de negocio EIAC: idempotencia del upsert del pipeline de ingesta.
    uniqueIndex("uq_polizas_correduria_id_poliza_entidad")
      .on(table.correduriaId, table.idPolizaEntidad, table.codigoEntidadDgs)
      .where(sql`${table.idPolizaEntidad} is not null`),
    // LOO-887 — FK index hygiene: filtro de tombstones de fusión.
    index("idx_polizas_merged_into")
      .on(table.mergedIntoPolizaId)
      .where(sql`${table.mergedIntoPolizaId} is not null`),
  ]
);

// -- Cotizaciones --
export const cotizaciones = pgTable(
  "cotizaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    clienteId: uuid("cliente_id").references(() => clientes.id), // nullable: public quotes
    polizaOrigenId: uuid("poliza_origen_id").references(() => polizas.id), // nullable: linked if renewal
    /** LOO-302 — ownership self-service B2C (flipped funnel). Null en cotizaciones de cartera gestionada (ownership vía clienteId). */
    userId: uuid("user_id").references(() => usuarios.id),
    // Datos de la cotización
    tipoSeguro: tipoSeguroEnum("tipo_seguro").notNull(),
    datosCotizacion: jsonb("datos_cotizacion")
      .$type<Record<string, unknown>>()
      .notNull(),
    // Resultados de la API
    resultadosApi: jsonb("resultados_api").$type<
      Array<{
        aseguradora: string;
        primaAnual: number;
        primaMensual: number;
        coberturas: string[];
        detalles: Record<string, unknown>;
      }>
    >(),
    mejorOferta: jsonb("mejor_oferta").$type<{
      aseguradora: string;
      primaAnual: number;
      ahorro: number;
    }>(),
    estado: estadoCotizacionEnum("estado").default("pendiente").notNull(),
    // Lead data (for public quotes)
    leadNombre: varchar("lead_nombre", { length: 255 }),
    leadEmail: varchar("lead_email", { length: 255 }),
    leadTelefono: varchar("lead_telefono", { length: 255 }),
    /** Origen del lead (p.ej. web, whatsapp) */
    leadOrigen: varchar("lead_origen", { length: 30 }).default("web").notNull(),
    /** Momento en que el usuario aceptó contacto explícito (consentimiento) */
    leadConsentAt: timestamp("lead_consent_at"),
    /**
     * Cabecera `Idempotency-Key` (o `X-Idempotency-Key`) en POST público.
     * Única por correduría cuando no es null; ver docs/ops/public-cotizador-lead-web.md.
     */
    webLeadIdempotencyKey: varchar("web_lead_idempotency_key", { length: 128 }),
    /**
     * LOO-837 — clave idempotente del alta de cotización **iniciada por el
     * corredor** (broker-desde-cero). Client-minted (useRef) una vez por intento;
     * única por correduría cuando no es null → un doble-submit reutiliza la MISMA
     * cotización (no crea una 2ª que derivaría en un 2º project facturable).
     */
    brokerInitKey: varchar("broker_init_key", { length: 128 }),
    /** LOO-450 — póliza creada a partir de esta cotización (flujo "crear póliza
     * desde cotización"). Enlaza + evita duplicar. */
    polizaResultanteId: uuid("poliza_resultante_id").references(() => polizas.id),
    /** LOO-363 Fase 1 — Precio exacto Codeoscopic (post-registro flipped funnel).
     * `amount_cents` integer (céntimos para evitar floats); `solicitado_at` =
     * timestamp del request al vendor; `recibido_at` = respuesta OK persistida
     * (banner /mis-cotizaciones); `response_hash` sha256 hex 64 chars del cuerpo
     * respuesta (forensic dedup). */
    precioExactoAmountCents: integer("precio_exacto_amount_cents"),
    precioExactoSolicitadoAt: timestamp("precio_exacto_solicitado_at"),
    precioExactoRecibidoAt: timestamp("precio_exacto_recibido_at"),
    codeoscopicResponseHash: varchar("codeoscopic_response_hash", { length: 64 }),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cotizaciones_correduria").on(table.correduriaId),
    // LOO-491 — agregaciones mensuales del dashboard (correduria + rango created_at).
    index("idx_cotizaciones_correduria_created").on(
      table.correduriaId,
      table.createdAt,
    ),
    index("idx_cotizaciones_cliente").on(table.clienteId),
    index("idx_cotizaciones_estado").on(table.estado),
    // LOO-450 — FK index hygiene para poliza_resultante_id.
    index("idx_cotizaciones_poliza_resultante")
      .on(table.polizaResultanteId)
      .where(sql`${table.polizaResultanteId} is not null`),
    // LOO-353 (audit-full 2026-05-21 P1-3) — índice FK cascade-delete hygiene.
    index("idx_cotizaciones_poliza_origen")
      .on(table.polizaOrigenId)
      .where(sql`${table.polizaOrigenId} is not null`),
    uniqueIndex("uq_cotizaciones_correduria_web_lead_idem")
      .on(table.correduriaId, table.webLeadIdempotencyKey)
      .where(sql`${table.webLeadIdempotencyKey} is not null`),
    // LOO-837 — idempotencia del alta broker-desde-cero (mismo patrón web-lead).
    uniqueIndex("uq_cotizaciones_correduria_broker_init")
      .on(table.correduriaId, table.brokerInitKey)
      .where(sql`${table.brokerInitKey} is not null`),
    // LOO-302 — índice FK + soporta la RLS "Users view their own self-service cotizaciones".
    index("idx_cotizaciones_user_id")
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    // LOO-363 — banner /mis-cotizaciones filtra por user_id + recibido_at IS NOT NULL.
    index("idx_cotizaciones_precio_exacto_recibido")
      .on(table.userId, table.precioExactoRecibidoAt)
      .where(sql`${table.precioExactoRecibidoAt} is not null`),
  ]
);

// -- Eventos operativos (KPIs / trazabilidad) --
export const operationalEvents = pgTable(
  "operational_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventName: varchar("event_name", { length: 80 }).notNull(),
    leadPhone: varchar("lead_phone", { length: 30 }),
    cotizacionId: uuid("cotizacion_id").references(() => cotizaciones.id),
    correduriaId: uuid("correduria_id").references(() => corredurias.id),
    sourceEventId: varchar("source_event_id", { length: 255 }),
    source: varchar("source", { length: 80 }).notNull(),
    stateFrom: varchar("state_from", { length: 50 }),
    stateTo: varchar("state_to", { length: 50 }),
    missingFieldsCount: integer("missing_fields_count"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ops_event_name").on(table.eventName, table.occurredAt),
    index("idx_ops_cotizacion").on(table.cotizacionId, table.occurredAt),
    index("idx_ops_lead_phone").on(table.leadPhone, table.occurredAt),
    uniqueIndex("uq_ops_source_event").on(table.eventName, table.sourceEventId),
    index("idx_ops_correduria")
      .on(table.correduriaId, table.occurredAt)
      .where(sql`${table.correduriaId} is not null`),
  ]
);

export type Cliente = typeof clientes.$inferSelect;

export type NewCliente = typeof clientes.$inferInsert;

export type Poliza = typeof polizas.$inferSelect;

export type NewPoliza = typeof polizas.$inferInsert;

// -- CIMA ficheros — ledger + FSM de la ingesta EIAC (LOO-518, épica LOO-515) --
//
// Una fila por fichero EIAC descargado de CIMA/TIREA. NUNCA persiste `raw_xml`
// (minimización LOPD): solo metadata + `xml_hash` para idempotencia de contenido.
// `nombre_fichero` es UNIQUE (dedup de descargas); `xml_hash` es UNIQUE parcial
// (nullable cuando el ZIP es multi-entry o falla el parseo → no se computa hash).
//
// Server-side only (cron de ingesta + pull-persist). FORCE RLS + cero policies =
// deny-all para anon/authenticated; service_role conserva BYPASSRLS. Mismo patrón
// que `cotizaciones_anonimas` (LOO-302). Migración 0051.
export const cimaFicheros = pgTable(
  "cima_ficheros",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** Nombre del fichero en CIMA. UNIQUE — dedup de descargas. */
    nombreFichero: varchar("nombre_fichero", { length: 255 }).notNull(),
    /** tipoObjeto EIAC: POL/SIN/REC/CEF/LIQ. Solo POL se procesa en el MVP. */
    tipoObjeto: varchar("tipo_objeto", { length: 8 }).notNull(),
    /** Versión EIAC declarada (p. ej. "6.0"). */
    versionEiac: varchar("version_eiac", { length: 16 }),
    /** Código DGS de la entidad emisora (p. ej. C0058). */
    codigoEntidad: varchar("codigo_entidad", { length: 16 }),
    /** SHA-256 hex del XML interno. Nullable: multi-entry/error sin hash computable.
     * UNIQUE parcial → idempotencia de contenido. */
    xmlHash: varchar("xml_hash", { length: 64 }),
    /** Nº de entradas .xml del ZIP. >1 → guard a `error` (el adapter solo expone la 1ª). */
    zipEntryCount: integer("zip_entry_count"),
    estado: cimaFicheroEstadoEnum("estado").default("pending").notNull(),
    /** Detalle cuando `estado='error'` (sin PII). */
    errorDetalle: text("error_detalle"),
    /** Póliza creada/actualizada cuando `estado='persisted'|'confirmed'`.
     * LOO-558 — `ON DELETE SET NULL` (RGPD Art. 17): el ledger CIMA sobrevive
     * al hard-delete de la póliza (audit trail Art. 30), pero el linkage se
     * anonimiza. Paralelo al anonymize-and-detach de clientes. */
    polizaId: uuid("poliza_id").references(() => polizas.id, {
      onDelete: "set null",
    }),
    /** LOO-748 — multi-póliza: nº de <Poliza> en el EIAC del fichero (cartera 132 = N). */
    polizasCount: integer("polizas_count"),
    /** LOO-748 — nº de pólizas del fichero efectivamente persistidas (resto review/error). */
    polizasPersisted: integer("polizas_persisted"),
    descargadoAt: timestamp("descargado_at").defaultNow().notNull(),
    /** Timestamp del ack `confirmarDescarga` OK. Null hasta confirmar. */
    confirmadoAt: timestamp("confirmado_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_cima_ficheros_nombre").on(table.nombreFichero),
    uniqueIndex("uq_cima_ficheros_xml_hash")
      .on(table.xmlHash)
      .where(sql`${table.xmlHash} is not null`),
    index("idx_cima_ficheros_correduria_estado").on(
      table.correduriaId,
      table.estado,
    ),
    index("idx_cima_ficheros_poliza")
      .on(table.polizaId)
      .where(sql`${table.polizaId} is not null`),
  ],
);

/**
 * Cuarentena temporal (TTL) del crudo EIAC (`datos`/`rawXml`, cifrados) de
 * ficheros con ≥1 registro en review/review_salud/error. Ver migración
 * 0096_loo_cima_cuarentena_crudo.sql para el porqué (incidente 16/09/2026,
 * Occident C0468: 4/44 pólizas perdidas tras confirmar el fichero a TIREA).
 */
export const cimaCuarentenaCrudo = pgTable(
  "cima_cuarentena_crudo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    nombreFichero: text("nombre_fichero").notNull(),
    tipoObjeto: text("tipo_objeto").notNull(),
    codigoEntidad: text("codigo_entidad"),
    xmlHash: text("xml_hash").notNull(),
    /** Resumen de motivos SIN PII (reviewReasons unidos). Diagnóstico sin descifrar. */
    motivo: text("motivo"),
    /** JSON.stringify(datos) cifrado — PII completa del EIAC. */
    datosCifrado: text("datos_cifrado").notNull(),
    /** rawXml cifrado — lo exige `computeXmlHash` al reprocesar. */
    rawXmlCifrado: text("raw_xml_cifrado").notNull(),
    reprocesadoAt: timestamp("reprocesado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    purgarEn: timestamp("purgar_en", { withTimezone: true }).notNull(),
    /**
     * Mig 0097 — true = el fichero tuvo ≥1 registro en review/review_salud/error
     * (TTL 90d; entra en el reproceso y en la alarma de purga inminente).
     * false = fichero SANO, guardado sólo como amortiguador por si un campo que
     * el mapper no lee resulta hacer falta (TTL 30d; NO se reprocesa).
     * DEFAULT true: todas las filas anteriores a 0097 son de incidencia.
     */
    conIncidencia: boolean("con_incidencia").notNull().default(true),
  },
  (table) => [
    uniqueIndex("uq_cima_cuarentena_crudo_xml_hash").on(table.xmlHash),
    index("idx_cima_cuarentena_crudo_correduria").on(table.correduriaId),
    index("idx_cima_cuarentena_crudo_pendiente")
      .on(table.correduriaId)
      .where(sql`${table.reprocesadoAt} is null`),
    index("idx_cima_cuarentena_crudo_purgar").on(table.purgarEn),
    index("idx_cima_cuarentena_crudo_pendiente_incidencia")
      .on(table.correduriaId)
      .where(sql`${table.reprocesadoAt} is null and ${table.conIncidencia}`),
  ],
);

/**
 * Mig 0097 — cobertura de campos EIAC: qué rutas manda CIMA y cuáles LEE el
 * mapper. Agregada por (correduría, tipo de objeto, compañía, ruta).
 *
 * 🚨 SÓLO nombres de ruta y contadores, NUNCA valores (los valores son PII y
 * viven cifrados en `cimaCuarentenaCrudo`).
 *
 * `ultimaVezLeido = null` es el estado caro: la ruta se ha visto N veces y no se
 * ha leído NINGUNA — el campo que CIMA manda y nosotros tiramos sin enterarnos.
 * Es NULLABLE a propósito: un 0 con fecha diría «revisado, no hay» donde la
 * verdad es «visto y nunca aprovechado».
 */
export const cimaCoberturaCampos = pgTable(
  "cima_cobertura_campos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    tipoObjeto: text("tipo_objeto").notNull(),
    /** NULL = el fichero no trae compañía. Sin centinela: un 'desconocido' se
     *  colaría por toda guarda basada en NULL. */
    codigoEntidad: text("codigo_entidad"),
    /** `DatosRiesgos.Riesgo.RiesgoComunidades.NumeroViviendas`. Índices elididos. */
    ruta: text("ruta").notNull(),
    /** true = hoja (campo con valor); false = contenedor. El ratio cuenta hojas. */
    hoja: boolean("hoja").notNull(),
    vecesVisto: bigint("veces_visto", { mode: "number" }).notNull().default(0),
    vecesLeido: bigint("veces_leido", { mode: "number" }).notNull().default(0),
    primeraVez: timestamp("primera_vez", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ultimaVez: timestamp("ultima_vez", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** NULL = NUNCA leído. */
    ultimaVezLeido: timestamp("ultima_vez_leido", { withTimezone: true }),
  },
  (table) => [
    // NULLS NOT DISTINCT (PG15+): sin eso, cada fichero sin `codigo_entidad`
    // insertaría filas nuevas en vez de agregar sobre la existente.
    unique("uq_cima_cobertura_campos")
      .on(table.correduriaId, table.tipoObjeto, table.codigoEntidad, table.ruta)
      .nullsNotDistinct(),
    index("idx_cima_cobertura_campos_no_leidos")
      .on(table.correduriaId, table.tipoObjeto)
      .where(sql`${table.ultimaVezLeido} is null`),
  ],
);

// -- Oportunidades (deal CRM) --
// El deal comercial del corredor (≠ `cotizaciones`, que es el lead web B2C).
// Dispara Tarificar → Codeoscopic (`codeoscopic_projects.oportunidad_id`) y,
// al ganarse, convierte en una `polizas` (`poliza_ganada_id`).
// ⚠️ P1: `aseguradoraGanadora` queda `varchar` libre (sin FK a
// companias_catalogo — diferido a P2). RLS: solo admin/corredor; el rol
// `usuario` (cliente) NO ve oportunidades.
export const oportunidades = pgTable(
  "oportunidades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    clienteId: uuid("cliente_id")
      .references(() => clientes.id)
      .notNull(),
    /** Comercial asignado (FK usuarios). Nullable. */
    comercialId: uuid("comercial_id").references(() => usuarios.id),
    /** Ramo — reutiliza el enum existente. */
    tipo: tipoSeguroEnum("tipo"),
    fuente: fuenteOrigenEnum("fuente"),
    estado: estadoComercialEnum("estado").default("en_negociacion").notNull(),
    fechaVigencia: date("fecha_vigencia"),
    fechaFinVigencia: date("fecha_fin_vigencia"),
    auditarSeguimiento: boolean("auditar_seguimiento")
      .default(false)
      .notNull(),
    /** ⚠️ P1 sin FK — varchar libre hasta que exista companias_catalogo (P2). */
    aseguradoraGanadora: varchar("aseguradora_ganadora", { length: 255 }),
    numeroPoliza: varchar("numero_poliza", { length: 100 }),
    primaBruta: numeric("prima_bruta", { precision: 10, scale: 2 }),
    fraccionamiento: fraccionamientoEnum("fraccionamiento"),
    /** LOO-689 — PII Tier-1 cipher AES-256-GCM (IBAN). */
    cuentaBancaria: text("cuenta_bancaria"),
    /** Snapshot oferta competencia (no-PII): {aseguradora, nPoliza, prima, fechaVenc}. */
    polizaCompetencia: jsonb("poliza_competencia").$type<Record<string, unknown>>(),
    /** Mismo contenedor de info de riesgo que `polizas.datosEspecificos`. */
    infoRiesgo: jsonb("info_riesgo").$type<Record<string, unknown>>(),
    /** Póliza creada al ganar la oportunidad. Nullable. */
    polizaGanadaId: uuid("poliza_ganada_id").references(() => polizas.id),
    /** Clave estable por correduría para import / idempotencia. */
    importRef: varchar("import_ref", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_oportunidades_correduria").on(table.correduriaId),
    index("idx_oportunidades_correduria_estado").on(
      table.correduriaId,
      table.estado,
    ),
    index("idx_oportunidades_cliente").on(table.clienteId),
    index("idx_oportunidades_comercial")
      .on(table.comercialId)
      .where(sql`${table.comercialId} is not null`),
    index("idx_oportunidades_poliza_ganada")
      .on(table.polizaGanadaId)
      .where(sql`${table.polizaGanadaId} is not null`),
    uniqueIndex("uq_oportunidades_correduria_import_ref")
      .on(table.correduriaId, table.importRef)
      .where(sql`${table.importRef} is not null`),
  ],
);

// -- Siniestros (parte) — cabecera + 3 subtablas --
// Cuelga de póliza + cliente. ⚠️ NO se crea `siniestro_colaboradores` (red,
// diferido a P2). Tramitador/perito = datos profesionales de la compañía
// (Tier-2, en claro). PII Tier-1: `lugarDireccion`. RLS: solo admin/corredor.
export const siniestros = pgTable(
  "siniestros",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    clienteId: uuid("cliente_id")
      .references(() => clientes.id)
      .notNull(),
    polizaId: uuid("poliza_id")
      .references(() => polizas.id)
      .notNull(),
    comercialId: uuid("comercial_id").references(() => usuarios.id),
    estado: estadoSiniestroEnum("estado").default("abierto").notNull(),
    /** Catálogo en claro (Colisión, Robo, Daños por agua…). */
    tipo: varchar("tipo", { length: 60 }),
    /** Referencia alfanumérica de la compañía. */
    referencia: varchar("referencia", { length: 100 }),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }),
    /** LOO-689 — PII Tier-1 cipher AES-256-GCM (lugar exacto del siniestro). */
    lugarDireccion: text("lugar_direccion"),
    lugarCp: varchar("lugar_cp", { length: 10 }),
    lugarCiudad: varchar("lugar_ciudad", { length: 100 }),
    lugarProvincia: varchar("lugar_provincia", { length: 100 }),
    seConsideraCulpable: boolean("se_considera_culpable"),
    /** Rich text — puede arrastrar PII; NO se cifra (campo libre operativo). */
    comentario: text("comentario"),
    // -- LOO-771 — Triaje + importes (MANUAL del corredor; CIMA NO los provee). --
    /** Gravedad operativa (triaje del corredor). Nullable: puede no constar al alta. */
    gravedad: siniestroGravedadEnum("gravedad"),
    /** Reserva técnica estimada (€). Tier-2 económico, NO PII → en claro. */
    reservaImporte: numeric("reserva_importe", { precision: 12, scale: 2 }),
    /** Indemnización pactada/abonada (€). Tier-2 económico, NO PII → en claro. */
    indemnizacionImporte: numeric("indemnizacion_importe", {
      precision: 12,
      scale: 2,
    }),
    // -- Campos EIAC SIN (LOO-750, épica CIMA LOO-515). Aditivos sobre la tabla
    //    existente; los rellena el pipeline de ingesta de siniestros. Todos
    //    nullable salvo `origen` (default 'gestionado_correduria'). --
    /** Origen: `gestionado_correduria` (manual) | `cima` (ingestado del EIAC SIN). */
    origen: siniestroOrigenEnum("origen")
      .default("gestionado_correduria")
      .notNull(),
    /** SHA-256 hex del XML EIAC SIN que originó/actualizó este siniestro (trazabilidad). */
    eiacXmlHash: varchar("eiac_xml_hash", { length: 64 }),
    /** IdSiniestroEntidad del EIAC. Clave de negocio para idempotencia del upsert
     * junto a `codigoEntidadDgs`. */
    idSiniestroEntidad: varchar("id_siniestro_entidad", { length: 50 }),
    /** Código DGS de la entidad aseguradora (EIAC `CodigoEntidad/CodigoDGS`, p. ej. C0109). */
    codigoEntidadDgs: varchar("codigo_entidad_dgs", { length: 16 }),
    // Datos profesionales (Tier-2, NO cifrados).
    tramitadorNombre: varchar("tramitador_nombre", { length: 255 }),
    tramitadorTelefono: varchar("tramitador_telefono", { length: 30 }),
    tramitadorEmail: varchar("tramitador_email", { length: 255 }),
    peritoNombre: varchar("perito_nombre", { length: 255 }),
    peritoTelefono: varchar("perito_telefono", { length: 30 }),
    peritoEmail: varchar("perito_email", { length: 255 }),
    /** Desglose de daños EIAC (`ImplicadoDiversos/DanosSiniestro/DanoSiniestro[]`),
     * `[{descripcion,valor}]`. NO es PII. EXCLUSIVO de `origen='cima'` — el
     * gestionado_correduria no tiene este dato (CIMA no lo manda para esos). */
    danosCima: jsonb("danos_cima"),
    // -- Tramitación que manda la COMPAÑÍA por CIMA (24/09/2026). Columnas propias
    //    `*_cima` y no `reserva_importe`/`indemnizacion_importe`/
    //    `se_considera_culpable`: esas las rellena el corredor a mano y un pull no
    //    puede pisarlas. Los tres jsonb son HISTÓRICOS que se FUSIONAN (norma EIAC
    //    §6.1.3: cada fichero trae solo lo nuevo del periodo). --
    /** `[{codigo,fecha,descripcion}]` — claves_situacionsiniestro (AP/CE/RA/RC). */
    situacionesCima: jsonb("situaciones_cima"),
    /** `[{accion,fecha,descripcion,situacion,figuras[]}]` — claves_accionsiniestro. */
    accionesCima: jsonb("acciones_cima"),
    /** `[{fecha,importe,descripcion,receptor}]`. */
    pagosCima: jsonb("pagos_cima"),
    reservaCima: numeric("reserva_cima", { precision: 12, scale: 2 }),
    indemnizacionCima: numeric("indemnizacion_cima", { precision: 12, scale: 2 }),
    totalPagosCima: numeric("total_pagos_cima", { precision: 12, scale: 2 }),
    /** claves_posicionsiniestro crudo: CU Culpa · RE Reclamación · IN Indeterminado · NA No aplica. */
    posicionCima: varchar("posicion_cima", { length: 2 }),
    // -- 28/09/2026 (mig 0102) — huecos de la auditoría de cobertura del SIN.
    //    Códigos TIREA CRUDOS. Foto actual → `coalesce` en el UPDATE; históricos
    //    (convenios/expedientes/asistencias) → se FUSIONAN (EIAC §6.1.3). --
    /** `FechaDeclaracion` (≠ `fecha_hora`, que es la ocurrencia). */
    fechaDeclaracion: date("fecha_declaracion", { mode: "string" }),
    /** `DAA`. */
    daaCima: boolean("daa_cima"),
    /** `Asegurado/Responsabilidad` cruda (CAUSANTE/PERJUDICADO…). ≠ `posicion_cima`. */
    responsabilidadCima: varchar("responsabilidad_cima", { length: 30 }),
    totalRecobrosCima: numeric("total_recobros_cima", { precision: 12, scale: 2 }),
    /** `{descripcion, coberturas:[{cobertura,importe}]}` (de `DescripcionReserva`). */
    reservaDesgloseCima: jsonb("reserva_desglose_cima"),
    /** `string[]` — `ConvenioSiniestro` crudos. */
    conveniosCima: jsonb("convenios_cima"),
    /** `[{numero,clase,estado,fechaInicio,fechaFin,importeReserva,totalPagos,totalRecobros,coberturas[]}]`. */
    expedientesCima: jsonb("expedientes_cima"),
    /** `{id,descripcion,coberturas:[{id,descripcion,capital}]}` — el riesgo afectado. */
    riesgoCima: jsonb("riesgo_cima"),
    /** PII — cipher AES-256-GCM (`Asegurado/PersonaContacto`). */
    contactoNombreCima: text("contacto_nombre_cima"),
    /** PII — cipher AES-256-GCM. */
    contactoTelefonoCima: text("contacto_telefono_cima"),
    /** `{matricula,marca,modelo,conductorNombre(cipher)}` — vehículo del ASEGURADO. */
    vehiculoCima: jsonb("vehiculo_cima"),
    /** `{matricula(cipher),marcaModelo,conductorNombre(cipher),otros:[{idDato,descripcion,valor(cipher)}]}` — `OtrosDatos` CONT_*. */
    vehiculoContrarioCima: jsonb("vehiculo_contrario_cima"),
    /** `[{clase,descripcion,razonSocial,nombre(cipher, solo persona física)}]`. */
    asistenciasCima: jsonb("asistencias_cima"),
    /** `IdSiniestroMediador` (sin caer a `IdSolicitudMediador`, que es de la póliza). */
    refMediadorCima: varchar("ref_mediador_cima", { length: 50 }),
    /** `Asegurado/ImplicadoDiversos/Descripcion` con números largos tapados. */
    descripcionCima: text("descripcion_cima"),
    /** PII — cipher AES-256-GCM (`Asegurado/PersonaContacto/Observaciones`, texto libre). */
    contactoObservacionesCima: text("contacto_observaciones_cima"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_siniestros_correduria").on(table.correduriaId),
    index("idx_siniestros_correduria_estado").on(
      table.correduriaId,
      table.estado,
    ),
    index("idx_siniestros_poliza").on(table.polizaId),
    index("idx_siniestros_cliente").on(table.clienteId),
    // LOO-750 — idempotencia del upsert CIMA: único por entidad+id de siniestro.
    // Parcial: solo filas CIMA (id_siniestro_entidad IS NOT NULL).
    uniqueIndex("uq_siniestros_correduria_id_siniestro_entidad")
      .on(table.correduriaId, table.idSiniestroEntidad, table.codigoEntidadDgs)
      .where(sql`${table.idSiniestroEntidad} is not null`),
  ],
);

// `siniestro_contrarios` — datos del tercero implicado en el siniestro.
// ⚠️ Datos de tercero → Art. 14 RGPD. PII Tier-1 cifrada: nombre, telefono,
// matricula. `correduriaId` denorm para RLS rápido (patrón bien_documentos).
export const siniestroContrarios = pgTable(
  "siniestro_contrarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siniestroId: uuid("siniestro_id")
      .references(() => siniestros.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    esConductor: boolean("es_conductor"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    nombre: text("nombre"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    telefono: text("telefono"),
    marcaModelo: varchar("marca_modelo", { length: 120 }),
    compania: varchar("compania", { length: 255 }),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM (matrícula). */
    matricula: text("matricula"),
    numeroPoliza: varchar("numero_poliza", { length: 100 }),
    // -- 28/09/2026 (mig 0102) — `Contrarios/Contrario` del EIAC. Claro (no PII). --
    /** `DatosPoliza/CodigoEntidad/CodigoDGS` de la compañía del contrario. */
    codigoEntidadDgs: varchar("codigo_entidad_dgs", { length: 16 }),
    /** `Responsabilidad` cruda (CAUSANTE/PERJUDICADO…). */
    responsabilidad: varchar("responsabilidad", { length: 30 }),
    /** `Lesionados/Numero` del contrario. null = no vino. */
    numeroLesionados: integer("numero_lesionados"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_siniestro_contrarios_siniestro").on(table.siniestroId),
    index("idx_siniestro_contrarios_correduria").on(table.correduriaId),
  ],
);

// `siniestro_testigos` — PII Tier-1 (tercero, Art. 14): nombre, telefono.
export const siniestroTestigos = pgTable(
  "siniestro_testigos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siniestroId: uuid("siniestro_id")
      .references(() => siniestros.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    nombre: text("nombre"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    telefono: text("telefono"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_siniestro_testigos_siniestro").on(table.siniestroId),
    index("idx_siniestro_testigos_correduria").on(table.correduriaId),
  ],
);

// `siniestro_lesionados` — PII Tier-1 (tercero, Art. 14): nombre, telefono.
export const siniestroLesionados = pgTable(
  "siniestro_lesionados",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siniestroId: uuid("siniestro_id")
      .references(() => siniestros.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    nombre: text("nombre"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    telefono: text("telefono"),
    ibaEnCocheCliente: boolean("iba_en_coche_cliente"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_siniestro_lesionados_siniestro").on(table.siniestroId),
    index("idx_siniestro_lesionados_correduria").on(table.correduriaId),
  ],
);

// `poliza_coberturas` (LOO-751) — coberturas/garantías de una póliza (1:N),
// ingestadas del EIAC CIMA (DatosRiesgos/Riesgo[]/DatosCoberturas/Cobertura[]).
// Dato de CONTRATO (qué garantías cubre la póliza), NO PII → SIN cifrado.
// `correduriaId` denorm para RLS rápido (patrón siniestro_contrarios). Sin uq de
// negocio: la idempotencia del re-pull es delete-reinsert por `polizaId` en la tx
// de persist (CIMA es autoritativo del contrato). `datosExtra` recoge la cola
// heterogénea por ramo (Franquicia/Limite/Prima/...) que no tiene columna tipada.
export const polizaCoberturas = pgTable(
  "poliza_coberturas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    polizaId: uuid("poliza_id")
      .references(() => polizas.id, { onDelete: "cascade" })
      .notNull(),
    /** EIAC Cobertura/NumeroOrden. */
    numeroOrden: integer("numero_orden"),
    /** EIAC Cobertura/IdCobertura. `text`: nunca desborda (LOO-751 review S1). */
    codigo: text("codigo"),
    /** EIAC Cobertura/DescripcionCobertura ("BASICO", "RC Obligatoria"...). */
    descripcion: text("descripcion"),
    /** EIAC Cobertura/CapitalAsegurado (string: importe o código). */
    capitalAsegurado: text("capital_asegurado"),
    /** EIAC Cobertura/DescripcionCapitalAsegurado. */
    descripcionCapital: text("descripcion_capital"),
    /** Franquicia (ramos Auto Daños/Hogar). null en Auto RC. */
    franquicia: text("franquicia"),
    /** EIAC Cobertura/FechaInicio. */
    fechaInicio: timestamp("fecha_inicio", { withTimezone: true }),
    /** EIAC Cobertura/FechaFin. */
    fechaFin: timestamp("fecha_fin", { withTimezone: true }),
    /** EIAC Cobertura/ModalidadValoracion. */
    modalidadValoracion: text("modalidad_valoracion"),
    /** Claves de Cobertura no mapeadas a columna (Limite/Prima/Recargo...). Sin PII. */
    datosExtra: jsonb("datos_extra").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_poliza_coberturas_poliza").on(table.polizaId),
    index("idx_poliza_coberturas_correduria").on(table.correduriaId),
  ],
);

// `poliza_recibos` (LOO-753) — recibos de una póliza (1:N), ingestados del EIAC
// CIMA (proceso 211, `Objetos.Recibo`). Estado VIVO: un recibo cambia de situación
// (pendiente→cobrado→devuelto) entre pulls → el persist hace upsert por la clave de
// negocio que ACTUALIZA los campos mutables (patrón siniestros LOO-755).
//
// ⚠️ PII Tier-1: `iban` se persiste CIFRADO (AES-256-GCM); en lectura se descifra
// server-side y solo se devuelve enmascarado. Primas/comisiones/cargos = dato de
// NEGOCIO del recibo (no PII) → claro. `correduriaId` denorm para RLS rápido. Todas
// las columnas de texto = `text` (no varchar) — nunca desborda (lección LOO-751 S1).
export const polizaRecibos = pgTable(
  "poliza_recibos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    polizaId: uuid("poliza_id")
      .references(() => polizas.id, { onDelete: "cascade" })
      .notNull(),
    /** EIAC DatosRecibo/IdRecibo. Clave de negocio para idempotencia del upsert
     * junto a `codigoEntidadDgs`. */
    idRecibo: text("id_recibo"),
    /** EIAC DatosPoliza/CodigoEntidad/CodigoDGS (matching + clave de negocio). */
    codigoEntidadDgs: text("codigo_entidad_dgs"),
    /** SituacionRecibo mapeada al enum (best-effort + default `pendiente`). */
    situacion: reciboEstadoEnum("situacion"),
    /** EIAC ClaseRecibo (NP, ...). */
    claseRecibo: text("clase_recibo"),
    /** EIAC Fechas/FechaEfectoInicial. */
    fechaEfectoInicial: timestamp("fecha_efecto_inicial", { withTimezone: true }),
    /** EIAC Fechas/FechaEfectoActual. */
    fechaEfectoActual: timestamp("fecha_efecto_actual", { withTimezone: true }),
    /** EIAC Fechas/FechaVencimiento. */
    fechaVencimiento: timestamp("fecha_vencimiento", { withTimezone: true }),
    /** EIAC Fechas/FechaEmision. */
    fechaEmision: timestamp("fecha_emision", { withTimezone: true }),
    /** EIAC Fechas/FechaSituacion (cuándo entró en la situación actual). */
    fechaSituacion: timestamp("fecha_situacion", { withTimezone: true }),
    /** EIAC Importes/PrimaTotal. Dato de negocio, NO PII → claro. */
    primaTotal: text("prima_total"),
    /** EIAC Importes/PrimaNeta. Dato de negocio, NO PII → claro. */
    primaNeta: text("prima_neta"),
    /** EIAC GestionCobro/DatosFormaPago/ClaseFormaPago (CC=domiciliación). */
    formaPago: text("forma_pago"),
    /** ⚠️ PII Tier-1 — IBAN del recibo, cipher AES-256-GCM. NUNCA en claro. */
    iban: text("iban"),
    /** EIAC DatosComisiones/Comision[0]/ComisionBruta. Dato de negocio → claro. */
    comisionBruta: text("comision_bruta"),
    /** EIAC DatosComisiones/Comision[0]/ComisionLiquida. Dato de negocio → claro. */
    comisionLiquida: text("comision_liquida"),
    /** EIAC DatosComisiones/Comision[0]/ClaseComision (ME, OT, ...). Crudo. */
    claseComision: varchar("clase_comision", { length: 10 }),
    /** EIAC DatosComisiones/Comision[0]/Base. Dato de negocio → claro. */
    baseComision: numeric("base_comision", { precision: 12, scale: 2 }),
    /** EIAC DatosComisiones/Comision[0]/RetencionIRPF. Dato de negocio → claro. */
    retencionIrpf: numeric("retencion_irpf", { precision: 12, scale: 2 }),
    /** EIAC DatosRecibo/IdRemesa — casa el recibo con la remesa de la liquidación CEF. */
    idRemesa: varchar("id_remesa", { length: 64 }),
    /** EIAC GestionCobro/ClaseGestion, crudo (CO=cobra la compañía, ME=la correduría). */
    gestionCobro: varchar("gestion_cobro", { length: 10 }),
    /** Cola heterogénea no mapeada (cargos/comisiones extra/movimientos/otrosDatos/
     * otrosImportes/mediador/numeroSuplemento/fechaFinSeguro/moneda≠EUR). Sin PII. */
    datosExtra: jsonb("datos_extra").$type<Record<string, unknown>>(),
    /** SHA-256 hex del XML EIAC REC que originó/actualizó este recibo (trazabilidad). */
    eiacXmlHash: text("eiac_xml_hash"),
    /** Origen: `cima` (ingestado del EIAC REC) | `manual` (reservado). */
    origen: reciboOrigenEnum("origen").default("cima").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_poliza_recibos_poliza").on(table.polizaId),
    index("idx_poliza_recibos_correduria").on(table.correduriaId),
    // LOO-753 — idempotencia del upsert / estado vivo: único por
    // (correduria_id, id_recibo, codigo_entidad_dgs). Parcial: solo filas con
    // id_recibo (CIMA).
    uniqueIndex("uq_poliza_recibos_correduria_id_recibo")
      .on(table.correduriaId, table.idRecibo, table.codigoEntidadDgs)
      .where(sql`${table.idRecibo} is not null`),
  ],
);

// `cuenta_efectivo` (LOO-757) — cuenta de comisiones/liquidaciones del corredor con
// UNA aseguradora en UN periodo (EIAC CIMA proceso 502, `Objetos.CuentaEfectivo`). NO
// cuelga de una póliza; es por **entidad + periodo**. Es DATO FINANCIERO PROPIO DEL
// CORREDOR — NO PII de persona física → NINGUNA columna se cifra (a diferencia de
// poliza_recibos.iban). Snapshot por periodo: el persist hace upsert por la uq de
// negocio (correduria, entidad, periodo). `correduriaId` denorm para RLS rápido.
export const cuentaEfectivo = pgTable(
  "cuenta_efectivo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** EIAC CuentaEfectivo/CodigoEntidad/CodigoDGS — la aseguradora (DGS, NO persona). */
    codigoEntidadDgs: text("codigo_entidad_dgs"),
    /** EIAC CuentaEfectivo/Periodo/FechaInicio. */
    periodoInicio: timestamp("periodo_inicio", { withTimezone: true }),
    /** EIAC CuentaEfectivo/Periodo/FechaFin. */
    periodoFin: timestamp("periodo_fin", { withTimezone: true }),
    /** EIAC CuentaEfectivo/Saldos/SaldoInicial. Dato de negocio, NO PII → claro. */
    saldoInicial: text("saldo_inicial"),
    /** EIAC CuentaEfectivo/Saldos/SaldoFinal. */
    saldoFinal: text("saldo_final"),
    /** EIAC CuentaEfectivo/Conceptos/* — agregados financieros del periodo. */
    recibosCobrados: text("recibos_cobrados"),
    comisionesRecibos: text("comisiones_recibos"),
    retencionComisiones: text("retencion_comisiones"),
    siniestrosPagados: text("siniestros_pagados"),
    otrosConceptos: text("otros_conceptos"),
    retencionOtros: text("retencion_otros"),
    remesas: text("remesas"),
    /** Cola no mapeada de la cuenta: `mediador {clase, codigoInterno, nombre}`. Sin PII. */
    datosExtra: jsonb("datos_extra").$type<Record<string, unknown>>(),
    /** SHA-256 hex del XML EIAC CEF que originó/actualizó esta cuenta (trazabilidad). */
    eiacXmlHash: text("eiac_xml_hash"),
    /** Origen: `cima` (ingestado del EIAC CEF) | `manual` (reservado). */
    origen: cefOrigenEnum("origen").default("cima").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cuenta_efectivo_correduria").on(table.correduriaId),
    // Idempotencia del re-pull / snapshot vivo: único por (correduria, entidad, periodo).
    // Parcial: solo filas con codigo_entidad_dgs (CIMA).
    uniqueIndex("uq_cuenta_efectivo_correduria_entidad_periodo")
      .on(
        table.correduriaId,
        table.codigoEntidadDgs,
        table.periodoInicio,
        table.periodoFin,
      )
      .where(sql`${table.codigoEntidadDgs} is not null`),
  ],
);

// `liquidaciones` (LOO-757) — N liquidaciones por cuenta_efectivo (EIAC
// Liquidaciones/Liquidacion[]). CIMA es autoritativo: el persist hace delete-reinsert
// de las liquidaciones de una cuenta en cada pull. Dato financiero, NO PII →
// ninguna columna cifrada; `datosExtra` NUNCA contiene el bloque Titular/IBAN del
// FormaPago de la liquidación.
export const liquidaciones = pgTable(
  "liquidaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    cuentaEfectivoId: uuid("cuenta_efectivo_id")
      .references(() => cuentaEfectivo.id, { onDelete: "cascade" })
      .notNull(),
    /** EIAC DatosLiquidacion/IdLiquidacionEntidad. */
    idLiquidacionEntidad: text("id_liquidacion_entidad"),
    codigoEntidadDgs: text("codigo_entidad_dgs"),
    /** EIAC DatosLiquidacion/EstadoLiquidacion mapeado al enum (best-effort). */
    estadoLiquidacion: liquidacionEstadoEnum("estado_liquidacion"),
    fechaLiquidacion: timestamp("fecha_liquidacion", { withTimezone: true }),
    fechaPago: timestamp("fecha_pago", { withTimezone: true }),
    /** EIAC DatosLiquidacion/ImporteRemesa. Dato de negocio → claro. */
    importeRemesa: text("importe_remesa"),
    /** Cola heterogénea no mapeada (FormaPago.ClaseFormaPago, etc.). SIN PII (sin IBAN/Titular). */
    datosExtra: jsonb("datos_extra").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_liquidaciones_correduria").on(table.correduriaId),
    index("idx_liquidaciones_cuenta").on(table.cuentaEfectivoId),
  ],
);

// `liquidacion_movimientos` (LOO-757) — N movimientos por liquidación (EIAC
// MovimientosLiquidacion/MovimientoLiquidacion[]). Cada movimiento referencia
// best-effort (FK nullable) el recibo/póliza que lo originó: si NO matchea, el
// registro financiero se guarda igual (NO hay cuarentena). Dato financiero, NO PII;
// `datosExtra` NUNCA re-guarda el IBAN del recibo embebido (ya cifrado en poliza_recibos).
export const liquidacionMovimientos = pgTable(
  "liquidacion_movimientos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    liquidacionId: uuid("liquidacion_id")
      .references(() => liquidaciones.id, { onDelete: "cascade" })
      .notNull(),
    /** EIAC MovimientoLiquidacion/NumeroOrden. */
    numeroOrden: integer("numero_orden"),
    fechaMovimiento: timestamp("fecha_movimiento", { withTimezone: true }),
    /** EIAC ImporteMovimiento/ClaseImporte (LI, ...). */
    claseImporte: text("clase_importe"),
    /** EIAC ImporteMovimiento/Importe. Dato de negocio → claro. */
    importe: text("importe"),
    /** Match best-effort: el recibo (poliza_recibos) que originó el movimiento. Nullable. */
    reciboId: uuid("recibo_id").references(() => polizaRecibos.id, {
      onDelete: "set null",
    }),
    /** Match best-effort: la póliza que originó el movimiento. Nullable. */
    polizaId: uuid("poliza_id").references(() => polizas.id, {
      onDelete: "set null",
    }),
    /** EIAC MovimientoRecibo/DatosRecibo/IdRecibo (clave del match best-effort). */
    idReciboEiac: text("id_recibo_eiac"),
    /** Cola heterogénea no mapeada. SIN PII (NUNCA el IBAN del recibo embebido). */
    datosExtra: jsonb("datos_extra").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_liquidacion_movimientos_correduria").on(table.correduriaId),
    index("idx_liquidacion_movimientos_liquidacion").on(table.liquidacionId),
    index("idx_liquidacion_movimientos_recibo").on(table.reciboId),
    index("idx_liquidacion_movimientos_poliza").on(table.polizaId),
  ],
);

// -- Poliza intervinientes (propietario / conductor / contacto / beneficiario) --
// PII Tier-1 abundante de terceros (Art. 14 RGPD): nif (+nifLookupHash),
// fechaNacimiento, telefono, email, fechaCarnet. `correduriaId` denorm para
// RLS rápido. `clienteId` apunta al cliente de cartera vinculado (null solo si
// el interviniente no está en cartera). LOO-713: la cartera viva (LOO-697)
// dejó las columnas inline de PII NULL y la hidrata desde `clientes` vía
// `clienteId` — la lectura hace LEFT JOIN (ver intervinientes.ts).
export const polizaIntervinientes = pgTable(
  "poliza_intervinientes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    polizaId: uuid("poliza_id")
      .references(() => polizas.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    rol: intervinienteRolEnum("rol").notNull(),
    /** Cliente de cartera vinculado al interviniente (si existe). Nullable. */
    clienteId: uuid("cliente_id").references(() => clientes.id),
    tipoRelacion: varchar("tipo_relacion", { length: 60 }),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM (NIF/NIE). */
    nif: text("nif"),
    /** HMAC-SHA256 hex del NIF normalizado con `PII_LOOKUP_KEY` (ADR-016). */
    nifLookupHash: text("nif_lookup_hash"),
    /** LOO-752 — PII Tier-1 (tercero, Art.14) cifrada AES-256-GCM. `text` (no
     * varchar) para que quepa el cipher. Se descifra en `mapIntervinienteRow`. */
    nombre: text("nombre"),
    /** LOO-752 — PII Tier-1 (tercero, Art.14) cifrada AES-256-GCM. `text`. */
    apellidos: text("apellidos"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM (ISO YYYY-MM-DD). */
    fechaNacimiento: text("fecha_nacimiento"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    telefono: text("telefono"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM. */
    email: text("email"),
    /** PII Tier-1 (tercero, Art. 14) — cipher AES-256-GCM (relevante Auto). */
    fechaCarnet: text("fecha_carnet"),
    /** LOO-714 — "Responde a" de la intranet: destinatario de la
     * correspondencia de esta figura. Texto libre, no PII sensible. */
    respondeA: varchar("responde_a", { length: 120 }),
    /** LOO-714 — antigüedad del carnet en años (campo numérico de la intranet,
     * relevante Auto). No PII. */
    antiguedadCarnet: integer("antiguedad_carnet"),
    /** LOO-752 — manual (corredor) | cima (ingestado del EIAC POL). El persist
     * CIMA hace delete-reinsert SOLO de las filas origen='cima'. */
    origen: intervinienteOrigenEnum("origen").default("manual").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_intervinientes_poliza").on(table.polizaId),
    index("idx_intervinientes_correduria").on(table.correduriaId),
    index("idx_intervinientes_cliente")
      .on(table.clienteId)
      .where(sql`${table.clienteId} is not null`),
    index("idx_intervinientes_nif_hash")
      .on(table.nifLookupHash)
      .where(sql`${table.nifLookupHash} is not null`),
    // LOO-752 — idempotencia del re-pull CIMA: una persona (nif_lookup_hash) es
    // única por (correduria, poliza, rol) — un papel por fila (0100, 28/09/2026:
    // antes por persona, y el segundo papel se perdía). Parcial: hash NOT NULL.
    uniqueIndex("uq_intervinientes_correduria_poliza_nif_hash_rol")
      .on(table.correduriaId, table.polizaId, table.nifLookupHash, table.rol)
      .where(sql`${table.nifLookupHash} is not null`),
  ],
);

// -- Multivaluados de cliente (resuelven el "un solo teléfono/email" actual) --
// Los singulares `clientes.telefono`/`email` se conservan como "principal"
// denormalizado (no romper código existente). PII Tier-1 cifrada + LookupHash.
// `correduriaId` denorm para RLS. Siguen el perímetro de su cliente padre.
export const clienteTelefonos = pgTable(
  "cliente_telefonos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clienteId: uuid("cliente_id")
      .references(() => clientes.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** PII Tier-1 — cipher AES-256-GCM. */
    telefono: text("telefono").notNull(),
    /** HMAC-SHA256 hex de `digits(telefono)` con `PII_LOOKUP_KEY` (ADR-016). */
    telefonoLookupHash: text("telefono_lookup_hash"),
    /** móvil / fijo / fax. */
    etiqueta: varchar("etiqueta", { length: 30 }),
    esPrincipal: boolean("es_principal").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cliente_telefonos_cliente").on(table.clienteId),
    index("idx_cliente_telefonos_correduria").on(table.correduriaId),
    index("idx_cliente_telefonos_lookup_hash")
      .on(table.telefonoLookupHash)
      .where(sql`${table.telefonoLookupHash} is not null`),
  ],
);

export const clienteEmails = pgTable(
  "cliente_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clienteId: uuid("cliente_id")
      .references(() => clientes.id, { onDelete: "cascade" })
      .notNull(),
    correduriaId: uuid("correduria_id")
      .references(() => corredurias.id)
      .notNull(),
    /** PII Tier-1 — cipher AES-256-GCM. */
    email: text("email").notNull(),
    /** HMAC-SHA256 hex de `lower(trim(email))` con `PII_LOOKUP_KEY` (ADR-016). */
    emailLookupHash: text("email_lookup_hash"),
    etiqueta: varchar("etiqueta", { length: 30 }),
    esPrincipal: boolean("es_principal").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cliente_emails_cliente").on(table.clienteId),
    index("idx_cliente_emails_correduria").on(table.correduriaId),
    index("idx_cliente_emails_lookup_hash")
      .on(table.emailLookupHash)
      .where(sql`${table.emailLookupHash} is not null`),
  ],
);

// ============================================================
// LOO-689 — Type exports
// ============================================================
export type Oportunidad = typeof oportunidades.$inferSelect;

export type NewSiniestro = typeof siniestros.$inferInsert;

export type NewPolizaCobertura = typeof polizaCoberturas.$inferInsert;

export type NewPolizaRecibo = typeof polizaRecibos.$inferInsert;

export type CuentaEfectivo = typeof cuentaEfectivo.$inferSelect;

export type NewCuentaEfectivo = typeof cuentaEfectivo.$inferInsert;

export type Liquidacion = typeof liquidaciones.$inferSelect;

export type NewLiquidacion = typeof liquidaciones.$inferInsert;

export type NewLiquidacionMovimiento =
  typeof liquidacionMovimientos.$inferInsert;

export type NewPolizaInterviniente = typeof polizaIntervinientes.$inferInsert;
