-- Registro de cancelaciones de Smoobu (12/08/2026).
--
-- El sync (`lib/sivra/smoobu-sync.ts`) ya pedía `showCancellation=1` y borraba la reserva de
-- `incomes` al verla cancelada. Eso es CORRECTO para el ingreso —una reserva cancelada no se
-- cobra— pero destruía el hecho: el contador moría en el texto del latido y en BD no quedaba
-- nada. Con 67 cancelaciones / 269 noches entre mayo y noviembre de 2026 (contra 79 reservas /
-- 241 noches consumidas), el negocio pierde más noche de la que duerme y ningún panel lo veía.
--
-- Esta tabla NO sustituye al DELETE: convive con él. `incomes` sigue siendo «lo que se cobra»
-- y esta tabla es «lo que se perdió». Separadas a propósito, para que nadie pueda sumar una
-- cancelación al ingreso por descuido.
--
-- Nombres deliberados (regla «dato que no hay ≠ dato que no se ha mirado» del CLAUDE.md):
--   · `cancelacion_vista_at` = cuándo la vio NUESTRO sync, no cuándo canceló el huésped. El
--     listado de Smoobu marca `type:'cancellation'` pero no publica la fecha del acto, así que
--     llamarla `cancelada_at` inventaría una precisión que no tenemos. El payload entero queda
--     en `datos` por si algún día se confirma que la API la trae y se puede extraer hacia atrás.
--   · `nights` y `amount_gross` admiten NULL: sin fechas o sin precio NO se escribe 0, que en un
--     agregado se leería como «cero noches perdidas» / «no costó nada».
--   · `estaba_en_incomes` separa la cancelación de una reserva que llegamos a contar como ingreso
--     de la de una que se hizo y deshizo entre dos pasadas y nunca existió para nosotros.
--
-- ⚠️ La tabla nace VACÍA y solo se llena desde la próxima pasada del sync. Las cancelaciones
-- anteriores están borradas y no se pueden reconstruir desde aquí; Smoobu las devolvería con un
-- `modifiedFrom` suficientemente atrás, pero eso es un backfill aparte y consciente, no algo que
-- deba hacer el cron diario. Hasta que se haga, «0 cancelaciones» en un periodo antiguo significa
-- «no lo sabemos», no «no hubo».

CREATE TABLE IF NOT EXISTS reservas_canceladas (
  reservation_id       text PRIMARY KEY,
  property_id          text,          -- NULL si el nombre de Smoobu no casó con `properties`
  property_name        text,          -- lo que dijo Smoobu; se conserva aunque property_id sea NULL
  portal               text,
  guest_name           text,
  check_in             timestamptz,
  check_out            timestamptz,
  nights               integer,       -- NULL = no se pudo calcular (≠ 0 noches)
  amount_gross         double precision, -- BRUTO de Smoobu tal cual; aquí no hay trigger de neto
  reserved_at          timestamptz,   -- cuándo se hizo la reserva (`created-at` de Smoobu)
  estaba_en_incomes    boolean NOT NULL DEFAULT false,
  cancelacion_vista_at timestamptz NOT NULL DEFAULT now(),
  datos                jsonb          -- payload íntegro, para no tener que volver a pedirlo
);

CREATE INDEX IF NOT EXISTS ix_reservas_canceladas_checkin  ON reservas_canceladas (check_in);
CREATE INDEX IF NOT EXISTS ix_reservas_canceladas_property ON reservas_canceladas (property_id);

-- Mismo criterio que el resto del esquema (12/08/2026): RLS activada y sin políticas; el acceso
-- va por los roles de servicio, que llevan BYPASSRLS. `anon`/`authenticated` sin privilegio.
ALTER TABLE reservas_canceladas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reservas_canceladas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reservas_canceladas TO prisma_plataforma;
GRANT SELECT ON reservas_canceladas TO prisma_sivra;
