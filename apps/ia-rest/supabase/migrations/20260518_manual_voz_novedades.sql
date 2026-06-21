-- ─────────────────────────────────────────────────────────────
-- manual_voz_novedades
-- Changelog del protocolo de voz para mostrar en /owner y /edge
-- Entradas globales (restaurante_id NULL) = publicadas por ia.rest
-- Entradas locales (restaurante_id UUID) = publicadas por el dueño
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS manual_voz_novedades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL,                    -- '2.1', '2.0'…
  titulo          TEXT NOT NULL,                    -- Título corto
  descripcion     TEXT,                             -- Detalle
  ejemplo_antes   TEXT,                             -- Ejemplo anterior (opcional)
  ejemplo_despues TEXT,                             -- Ejemplo nuevo (opcional)
  rol_afectado    TEXT NOT NULL DEFAULT 'todos',    -- 'camarero' | 'cocina' | 'jefe' | 'todos'
  restaurante_id  UUID REFERENCES restaurantes(id) ON DELETE CASCADE, -- NULL = global
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_manual_voz_novedades_restaurante
  ON manual_voz_novedades(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_manual_voz_novedades_created
  ON manual_voz_novedades(created_at DESC);

-- RLS
ALTER TABLE manual_voz_novedades ENABLE ROW LEVEL SECURITY;

-- Lectura: camareros y owners del restaurante ven sus entradas + las globales
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='manual_voz_novedades' AND policyname='manual_voz_novedades_select'
  ) THEN
    CREATE POLICY manual_voz_novedades_select ON manual_voz_novedades
      FOR SELECT USING (
        restaurante_id IS NULL OR
        restaurante_id = (current_setting('app.restaurante_id', true))::uuid
      );
  END IF;
END $$;

-- Inserción: solo service_role (owners usan la API con service_role)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='manual_voz_novedades' AND policyname='manual_voz_novedades_insert'
  ) THEN
    CREATE POLICY manual_voz_novedades_insert ON manual_voz_novedades
      FOR INSERT WITH CHECK (true); -- service_role bypasses RLS
  END IF;
END $$;

-- ── Seed: novedades globales del protocolo v2.0 ─────────────────────────────

INSERT INTO manual_voz_novedades (version, titulo, descripcion, ejemplo_antes, ejemplo_despues, rol_afectado)
VALUES
  ('2.0', 'Protocolo posicional: DESTINO siempre primero',
   'El código de mesa, rol de equipo o nombre del compañero va siempre en la primera posición. Así BRAIN interpreta el destino sin ambigüedad.',
   '"Dos cañas para la cuatro"',
   '"T3 dos cañas"',
   'camarero'),

  ('2.0', 'Mensajes al equipo por voz desde Hablar',
   'Desde el tab Hablar ya se pueden enviar mensajes directos a cocina, barra, jefe de sala o a un camarero por nombre sin cambiar de tab.',
   NULL,
   '"cocina la T3 va a pedir postre" · "Pablo ven a la B1"',
   'camarero'),

  ('2.0', 'KDS por número de ticket, no por mesa',
   'En cocina se usa el número de ticket en lugar del código de mesa. Más rápido, sin confusión entre zonas.',
   '"la cuatro está lista"',
   '"listo 47" · "47 entrecot marcha"',
   'cocina'),

  ('2.0', 'Alias de vinos y variantes en Carta',
   'El dueño puede añadir aliases a cada producto (ej: "Ribera", "Verónica", "el de la casa") para que BRAIN los resuelva sin necesidad de clarificación.',
   NULL,
   'Editar en /owner → Carta → producto → Aliases de voz',
   'camarero'),

  ('2.0', 'Nota explícita con palabra clave',
   'Las notas de comanda se añaden al final con la palabra "nota". Pueden ser para un ítem, una sección o toda la comanda.',
   NULL,
   '"T3 entrecot nota muy hecho" · "B1 cañas nota en copa"',
   'camarero'),

  ('2.0', 'Cuenta nominal sin mesa',
   'Para barra o pedidos sin mesa asignada se puede abrir una cuenta a nombre de una persona.',
   NULL,
   '"dos cañas para Pedro" · "cuenta de María"',
   'camarero')

ON CONFLICT DO NOTHING;
