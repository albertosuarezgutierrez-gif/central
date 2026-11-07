-- 2026-11-07a — RETENCIÓN DE CARTERA F1: calendario automático de renovación (Alberto, 07/11/2026).
-- Diseño: docs/superpowers/specs/2026-11-07-retencion-cartera.md. Código: apps/asegura/lib/retencion-cartera.ts (BD) +
-- retencion-cartera-reglas.ts (PURO, con test) + app/api/cron/retencion-cartera/route.ts.
--
-- ✅ APLICADA en producción (07/11/2026). Sin ella el cron NO actúa: manda a Alberto el Telegram de ENSAYO («falta la migración») y no crea nada; las
--    preferencias se toman por defecto (40 días, 10 %). Va después de 2026-11-05b/c/d (presupuesto de renovación y solicitud de datos).
--
-- Dos tablas nuevas (no columnas en `presupuesto`/`solicitud_datos`: el ciclo existe ANTES de que haya presupuesto o solicitud,
-- y recuerda también «comprobado, no faltaba nada» o «bots lanzados», que no tienen fila en ninguna de las dos):
--   · `renovacion_ciclo`: una fila por póliza y ANUALIDAD (vencimiento). Cada paso (datos · bots · propuesta · aviso de subida)
--     tiene su sello: se hace UNA vez por anualidad. `bloqueo_hasta` = reserva de 15 min por póliza (dos pasadas a la vez no
--     procesan la misma). El código trata vencimientos a ±45 días como la MISMA anualidad (CIMA corrige fechas).
--   · `renovacion_preferencias`: lo que el CLIENTE (tomador) elige desde su app. NULL = defecto global (no «0»). Límites:
--     antelación 35-90 días (por debajo no da tiempo al art. 22 LCS: oposición ≥1 mes antes) y umbral de subida 0-50 %.
-- Sin datos personales en ninguna (ids y sellos; los resultados son estados cortos).
-- Portal (`prisma_asegura_portal`): GRANT de `renovacion_preferencias` queda para F2 (la pantalla); hoy solo la lee asegura.
-- Transaccional e idempotente. Se deshace con el bloque ROLLBACK del final.

BEGIN;
SET LOCAL lock_timeout = '5s';

create table if not exists seguros.renovacion_ciclo (
  id uuid primary key default gen_random_uuid(),
  correduria_id uuid not null references seguros.corredurias(id),
  poliza_id uuid not null references seguros.polizas(id),
  cliente_id uuid not null references seguros.clientes(id),
  ramo text not null,
  vencimiento date not null,
  datos_at timestamptz,
  datos_resultado text,
  bots_at timestamptz,
  bots_resultado text,
  propuesta_at timestamptz,
  propuesta_resultado text,
  presupuesto_id uuid,
  subida_avisada_at timestamptz,
  subida_pct numeric(6,1),
  bloqueo_hasta timestamptz,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (correduria_id, poliza_id, vencimiento)
);

create index if not exists renovacion_ciclo_poliza_idx on seguros.renovacion_ciclo (correduria_id, poliza_id);

create table if not exists seguros.renovacion_preferencias (
  correduria_id uuid not null references seguros.corredurias(id),
  cliente_id uuid not null references seguros.clientes(id),
  umbral_subida_pct numeric(4,1) check (umbral_subida_pct is null or (umbral_subida_pct >= 0 and umbral_subida_pct <= 50)),
  dias_antelacion integer check (dias_antelacion is null or (dias_antelacion >= 35 and dias_antelacion <= 90)),
  actualizado_at timestamptz not null default now(),
  actualizado_por text,
  primary key (correduria_id, cliente_id)
);

-- RLS activada sin políticas: solo los roles con BYPASSRLS (prisma_seguros) la ven. El portal entra en F2 con GRANT y política.
alter table seguros.renovacion_ciclo enable row level security;
alter table seguros.renovacion_preferencias enable row level security;
grant select, insert, update on seguros.renovacion_ciclo to prisma_seguros;
grant select, insert, update on seguros.renovacion_preferencias to prisma_seguros;

COMMIT;

-- ROLLBACK (solo si hace falta deshacerla; borra la memoria del calendario y las preferencias):
-- BEGIN;
-- drop table if exists seguros.renovacion_ciclo;
-- drop table if exists seguros.renovacion_preferencias;
-- COMMIT;
