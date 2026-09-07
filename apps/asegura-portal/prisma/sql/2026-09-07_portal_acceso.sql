-- Registro de ACCESOS al portal del cliente (07/09/2026).
--
-- ── Por qué existe, y por qué era urgente ───────────────────────────────────
--
-- Hasta hoy la única huella de que alguien entraba era
-- `portal_identidad.ultimo_acceso_en`: UN timestamp que se pisa en cada login.
-- O sea, no había historial y no se podía reconstruir. Cada día sin esta tabla
-- era un día irrecuperable — por eso entra antes que la pantalla que la va a
-- leer, y no después.
--
-- Alberto, 07/09/2026: «quiero controlar quién se registra y entra». La
-- respuesta medida fue que el pestillo de aprobar registros protege poco
-- (registrarse no abre nada: lo que abre es el vínculo, y el portal ya filtra
-- por `WHERE_CARTERA_VIVA`, así que un lead entra a un portal vacío). Lo que sí
-- no se puede recuperar después es esto.
--
-- ── Qué se guarda y qué NO ──────────────────────────────────────────────────
--
-- NO se guarda el correo: el portal no lo tiene en claro en ninguna tabla, solo
-- su hash con pimienta (`portal_canal.valor_hash`). Quien quiera saber con qué
-- dirección entró alguien, lo mira en la ficha con la que está casado.
--
-- SÍ se guardan IP y user-agent, que son datos personales: es un registro de
-- seguridad (art. 32 RGPD) y es el mismo perfil que ya guarda
-- `portal_consentimiento`. ⚠️ Retención pretendida: 12 meses. **El borrado
-- automático NO existe todavía** — se dice aquí en vez de dejar creer que sí,
-- que es la diferencia entre una política y una intención.
--
-- 🚨 GRANT por columna ANTES de declarar el modelo en Prisma: declararlo sin
-- conceder rompe TODAS las lecturas del modelo con 42501 (lo documenta el
-- CLAUDE.md de la app).

create table if not exists seguros.portal_acceso (
  id          uuid primary key default gen_random_uuid(),
  identidad_id uuid not null references seguros.portal_identidad(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  ip          inet,
  user_agent  text
);

-- Por identidad y por fecha: las dos consultas que va a hacer la pantalla
-- («las últimas entradas» y «el historial de esta persona»).
create index if not exists portal_acceso_identidad_idx on seguros.portal_acceso (identidad_id, creado_en desc);
create index if not exists portal_acceso_creado_idx    on seguros.portal_acceso (creado_en desc);

-- El PORTAL escribe. `select` además del `insert` porque Prisma hace
-- `INSERT ... RETURNING` en su `create()`: sin él, la escritura falla con 42501
-- aunque el insert esté concedido.
grant insert, select on seguros.portal_acceso to prisma_asegura_portal;

-- El CORREDOR lee (la pantalla de `/correduria` vive en plataforma y llega por
-- el puerto de asegura, que corre con este rol). Solo lectura: el panel del
-- corredor no inventa accesos.
grant select on seguros.portal_acceso to prisma_seguros;

-- 🚨 Y el REVOKE no es decorativo: al aplicar esto el 07/09/2026, `prisma_seguros`
-- salió con INSERT, SELECT y UPDATE sobre las 5 columnas — más de lo concedido
-- aquí arriba. Hay privilegios POR DEFECTO en el schema `seguros` que se los da
-- solos a cada tabla nueva. Sin esta línea, el comentario de arriba («solo
-- lectura») sería falso y nadie se enteraría: un registro de accesos que el
-- lector puede reescribir no prueba nada.
revoke insert, update, delete, truncate, references on seguros.portal_acceso from prisma_seguros;
