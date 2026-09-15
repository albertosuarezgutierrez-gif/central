-- Sello de los avisos de la intranet YA ENVIADOS por correo (15/09/2026).
--
-- Por qué hace falta: el emisor genérico (`apps/asegura/lib/avisos-intranet.ts`)
-- no tiene una cola propia — deriva lo que hay que avisar del MISMO catálogo que
-- pinta la campana del portal (`avisosDe()` de `@central/module-seguros-portal`).
-- Eso es lo que lo hace genérico: el día que la campana aprenda a avisar de algo
-- nuevo, sale por correo sin tocar el emisor ni acordarse de encolar nada. Pero
-- un catálogo derivado no recuerda nada, así que sin este sello el cron mandaría
-- el mismo aviso en cada pasada hasta que el cliente lo resolviera.
--
-- 🚨 La clave es `${tipo}:${id_de_la_fila_de_origen}`, exactamente la misma que
-- la campana usa como `key` de React. No se guarda el TÍTULO del aviso: los
-- títulos llevan matrícula, número de póliza o el nombre de un tercero, y esta
-- tabla no necesita ninguna de las tres cosas para hacer su trabajo.
--
-- 📌 Un aviso se manda UNA vez. No hay recordatorio a los N días en la Fase 1:
-- para eso haría falta decidir cada cuánto se insiste por tipo, y repetir por
-- defecto es cómo un canal útil se convierte en uno que nadie abre. Cuando se
-- quiera insistir, la columna que falta es `veces` + `ultimo_en`, no borrar filas.
--
-- 📌 Las OBLIGACIONES tienen además su propio sello histórico en
-- `portal_obligacion.avisada_at` (correo) y `avisada_push_at` (Web Push), de
-- cuando cada canal tenía su emisor. El emisor genérico respeta los dos: una
-- obligación con `avisada_at` no se vuelve a avisar aunque no esté aquí.
SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_aviso_enviado (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL,
  cliente_id    uuid NOT NULL REFERENCES seguros.clientes(id) ON DELETE CASCADE,
  -- `${tipo}:${id}` — el tipo es del catálogo (`TIPOS_AVISO`) y el id, el de la
  -- fila que lo origina (autorización, obligación, petición…).
  clave         text NOT NULL,
  -- El tipo suelto, para poder contar por clase sin parsear la clave.
  tipo          text NOT NULL,
  enviado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_aviso_enviado_unico UNIQUE (cliente_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_portal_aviso_enviado_cliente
  ON seguros.portal_aviso_enviado (cliente_id);

-- Solo lo escribe el emisor, que corre en `apps/asegura` con `prisma_seguros`
-- (BYPASSRLS): es el único rol que puede leer `cliente_emails` cifrado y por
-- tanto el único que puede mandar un correo. El portal NO necesita esta tabla:
-- allí el aviso se ve en pantalla, no se envía.
GRANT SELECT, INSERT ON seguros.portal_aviso_enviado TO prisma_seguros;
