-- Desde cuándo el histórico de un piso habla del MISMO producto.
--
-- POR QUÉ (01/08/2026, dato de Alberto). House Sevillana estuvo alquilada como DOS pisos turísticos
-- independientes hasta que se decidió alquilarla entera: 6 habitaciones, 12 personas. Ese cambio no
-- es una subida de precio, es OTRO producto — y el histórico anterior no describe el negocio actual:
--
--     año   reservas   ticket medio   ADR    antelación mediana
--     2020      25          471€      112€          6 días
--     2021      84          276€       99€         16
--     2022      75          386€      129€         30
--     2023      62          519€      166€         32
--     2024      56        1.171€      473€         24     <- casa entera
--     2025      47        1.082€      418€         29
--     2026      41        1.169€      446€         40
--
-- Ese salto de 166€ a 473€ de ADR ya provocó un error caro: promediando las dos etapas salía un
-- "ADR de agosto de 102€" y se llegó a proponer bajar House a 285€ y a tocarle el suelo — cuando la
-- casa factura 1.400€ de ticket medio. Lo cazó Alberto («Socorro está dando 1.500/2.000€ por un fin
-- de semana»). El mismo veneno estaba entrando en la antelación por mes que alimenta la palanca de
-- last-minute: la mediana de octubre de House salía de 51 reservas de las que 30 eran de cuando la
-- casa era dos pisos pequeños.
--
-- La lección general, que es lo que esta columna fija: **un piso puede cambiar de producto, y el
-- histórico anterior a ese cambio no es comparable ni para el precio, ni para la antelación, ni para
-- la ocupación.** Sin una marca explícita, cada análisis nuevo vuelve a tropezar con lo mismo — y el
-- número que sale es plausible, así que nada delata el fallo.
--
-- NULL = todo el histórico vale (el caso normal). No es "no se sabe": es "este piso no ha cambiado".
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS historico_desde date;

COMMENT ON COLUMN pricing_settings.historico_desde IS
  'Fecha desde la que el histórico de este piso describe el producto ACTUAL. Toda métrica histórica (antelación, ADR, ocupación) debe ignorar lo anterior. NULL = el piso no ha cambiado de producto y vale todo. House Sevillana: 2024-01-01, cuando pasó de dos pisos independientes a casa entera de 12 plazas.';

UPDATE pricing_settings
SET historico_desde = '2024-01-01'
WHERE property_id = 'prop_house_sevillana' AND historico_desde IS NULL;
