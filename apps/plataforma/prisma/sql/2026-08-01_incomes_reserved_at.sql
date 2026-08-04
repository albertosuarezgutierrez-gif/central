-- Fecha REAL en que se hizo la reserva, para poder medir la antelación de verdad.
--
-- POR QUÉ (01/08/2026). `incomes.createdAt` NO sirve para esto: en la mayoría de las filas es la
-- fecha de la IMPORTACIÓN MASIVA del histórico, no la de la reserva. Por eso el análisis de octubre
-- del 31/07 dijo «no se puede reconstruir la curva de anticipación desde incomes» — y era cierto de
-- esa columna, pero se dio por cerrado el asunto entero.
--
-- Resulta que la API de Smoobu SÍ lo publica: el campo `created-at` de /api/reservations, y lo trae
-- también para el histórico (verificado el 01/08/2026 contra octubre de 2024 y 2025, 108 reservas,
-- el 100% con fecha real; la más antigua de octubre-2024 se creó en mayo de 2024).
--
-- LO QUE ESTE DATO CAMBIA. La antelación reconstruida desde `rate_snapshots` es una mediana GLOBAL
-- por piso, sobre todas las fechas del calendario, y las fechas de Semana Santa y Feria —que se
-- reservan con muchísima antelación— la tiran hacia arriba. Medido contra el histórico real de
-- OCTUBRE, la diferencia es enorme:
--
--     piso            snapshots (global)   octubre 2024   octubre 2025
--     Busto Reform          108 días            13              3
--     Luxury Busto           57                 17             11
--     House Sevillana        32                 24             39
--     Duplex Center           7                 11             11
--
-- O sea: **la antelación depende del MES tanto como del piso**. Con la mediana global, la palanca de
-- last-minute empezaría a descontar el precio de Busto tres meses antes de que en octubre empiece
-- siquiera a venderse. Y el diagnóstico «Busto va tarde en octubre» que salió de esos 108 días era
-- falso: 7 de 31 noches a dos meses vista es su comportamiento NORMAL en ese mes.
--
-- `reserved_at` queda NULL en las filas históricas hasta que pase el backfill, y eso es correcto:
-- NULL aquí significa «todavía no lo hemos traído de Smoobu», no «se reservó el mismo día». Todo lo
-- que consuma esta columna debe distinguir las dos cosas.
--
-- Cobertura REAL tras el backfill del 01/08/2026: **1.852 de 1.984 (93,3%)**. Las 130 que faltan son
-- de mayo-noviembre de 2022 y NO se pueden recuperar: pedidas a Smoobu por su id directo responden
-- **404 Entity not found**, o sea que su lado ya las purgó (cancelaciones antiguas, previsiblemente).
-- Así que el NULL de esta columna tiene dos causas y no conviene mezclarlas: «aún no traída» se
-- arregla relanzando el backfill; «Smoobu ya no la tiene» no se arregla nunca. 93% es el techo.
ALTER TABLE incomes
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz;

COMMENT ON COLUMN incomes.reserved_at IS
  'Fecha REAL de creación de la reserva (campo created-at de la API de Smoobu). NULL = aún no traída de Smoobu, NO "reservada el mismo día". NO confundir con createdAt, que en el histórico es la fecha de importación masiva.';

-- La consulta natural es «antelación por piso y mes de entrada», que ordena por checkIn.
CREATE INDEX IF NOT EXISTS incomes_reserved_at_idx
  ON incomes ("propertyId", "checkIn") WHERE reserved_at IS NOT NULL;
