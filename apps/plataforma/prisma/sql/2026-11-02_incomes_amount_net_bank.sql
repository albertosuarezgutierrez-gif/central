-- `incomes.amount_net_bank`: el NETO CONFIRMADO POR EL BANCO manda sobre la comisión teórica.
--
-- QUÉ PASABA (02/11/2026). `incomes` tiene el trigger BEFORE INSERT/UPDATE `incomes_compute_net`
-- (función `compute_income_net()`, ver 2026-08-01_incomes_amount_doble_comision.sql), que SIEMPRE
-- recalcula `amount := round(amount_gross × (1 − portal_rates.commission_pct/100), 2)` y, si en un
-- UPDATE cambia `amount` sin cambiar `amount_gross`, toma `amount` como bruto. Se fijó con bypass
-- (`app.skip_income_net_trigger = 'on'`) el neto REAL cobrado en banco en 151 reservas Booking 2026
-- (Σ amount = 82.413,08€), pero cualquier UPDATE posterior sin bypass —sync diario de Smoobu
-- (`lib/sivra/smoobu-sync.ts`), rutas sivra updates/sync, import-smoobu-bulk, import-csv— o un cambio
-- de `portal_rates` (`recompute_incomes_for_portal()`) volvía a pisarlo con la tasa teórica.
--
-- QUÉ HACE:
--   1. Columna `amount_net_bank numeric(12,2) NULL`. NULL = «no hay cobro bancario confirmado»
--      (NO «cero»): se sigue aplicando la comisión de `portal_rates` como hasta ahora.
--   2. `compute_income_net()`: si `NEW.amount_net_bank IS NOT NULL`, `amount := amount_net_bank` y NO
--      se aplica comisión. `amount_gross` se sigue actualizando igual (el sync puede refrescar el bruto).
--   3. `recompute_incomes_for_portal()`: se salta las filas con `amount_net_bank` no NULL.
--   4. Relleno `amount_net_bank = amount` en EXACTAMENTE las 151 filas (ids del backup del 02/11),
--      con bypass y guarda: aborta si no están las 151, si alguna no es BOOKING o si Σ amount ya no
--      es 82.413,08€ (señal de que algo las pisó antes de aplicar esto: re-fija el neto primero).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, y el relleno solo toca filas con
-- `amount_net_bank IS NULL` (si ya están rellenas, la guarda de suma se salta).
-- REVERSIBLE: volver a las funciones de 2026-08-01 y `ALTER TABLE incomes DROP COLUMN amount_net_bank`.
-- Prueba posterior: verificacion-migracion.sql (UPDATE de `adults` en la reserva 119000401 →
-- amount debe seguir en 4.281,37 dentro de una transacción con ROLLBACK).

ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS amount_net_bank numeric(12,2) NULL;

COMMENT ON COLUMN public.incomes.amount_net_bank IS
  'NETO CONFIRMADO POR COBRO BANCARIO. Si no es NULL, el trigger incomes_compute_net copia este valor a amount y NO aplica la comision de portal_rates. NULL = sin cobro confirmado (no significa cero). Ver 2026-11-02_incomes_amount_net_bank.sql.';

CREATE OR REPLACE FUNCTION public.compute_income_net()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  rate NUMERIC;
BEGIN
  -- Bypass cuando el recálculo viene desde portal_rates (evita loop) o de un saneo manual
  IF current_setting('app.skip_income_net_trigger', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Si en un UPDATE cambia amount pero no amount_gross, el sync está pasando
  -- el valor bruto a través de la columna amount → reasignar a amount_gross
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       AND NEW.amount_gross IS NOT DISTINCT FROM OLD.amount_gross THEN
      NEW.amount_gross := NEW.amount;
    END IF;
  END IF;

  -- INSERT donde solo viene amount: copiarlo a amount_gross
  IF NEW.amount_gross IS NULL THEN
    NEW.amount_gross := NEW.amount;
  END IF;

  -- Neto confirmado por el banco: manda sobre la comisión teórica (2026-11-02)
  IF NEW.amount_net_bank IS NOT NULL THEN
    NEW.amount := NEW.amount_net_bank::DOUBLE PRECISION;
    RETURN NEW;
  END IF;

  -- Calcular el neto aplicando la tasa del portal
  SELECT commission_pct INTO rate
  FROM portal_rates
  WHERE portal = NEW.portal::TEXT;
  IF rate IS NULL THEN rate := 0; END IF;

  NEW.amount := ROUND(CAST(NEW.amount_gross * (1 - rate / 100) AS NUMERIC), 2)::DOUBLE PRECISION;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_incomes_for_portal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN
    PERFORM set_config('app.skip_income_net_trigger', 'on', true);
    UPDATE incomes
    SET amount = ROUND(CAST(amount_gross * (1 - NEW.commission_pct / 100) AS NUMERIC), 2)::DOUBLE PRECISION
    WHERE portal::TEXT = NEW.portal
      AND amount_net_bank IS NULL;  -- el neto confirmado por banco no se recalcula (2026-11-02)
    PERFORM set_config('app.skip_income_net_trigger', 'off', true);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Relleno de las 151 reservas Booking 2026 con neto bancario fijado el 02/11/2026.
DO $guarda$
DECLARE
  ids        text[] := ARRAY[
    '095c4f92-64ad-4e7e-adb1-dd761b269ffa',
    '0a4e0e2f-781d-4942-bb7c-ed8d4afedd61',
    '0dc3e145-9964-4c3c-b4e0-694d1743e10e',
    '252409ce-d065-4e15-b7be-075d8d9d9a89',
    '25bef0d4-1e08-4f3c-96ed-b9af920e9719',
    '26aebbb3-e3e5-4736-b964-446ff142388c',
    '29930be6-dc65-490a-904b-9f1c0246600c',
    '2b6505fc-68a8-46f6-9701-31d8439488e8',
    '2b954175-83bb-4012-9976-20e3c3fc5959',
    '302bd13d-d3b1-49db-968f-d9ea148aeeac',
    '3401bf1c-2c7a-4a61-8950-1cceefd556cc',
    '366106f7-778d-420a-a46c-15a7537be42b',
    '3c97c7d5-35ef-42b8-8316-48389e9b0d2b',
    '3d614d26-9d8a-478c-9b4d-caa9dec9ae6b',
    '4ab47f40-ce28-44aa-a5f0-29f267034a69',
    '50453487-0857-4263-8f4e-2e030b1aad51',
    '5fb1c816-b43f-41f5-a1b9-912670a4f5d1',
    '643b0519-239e-466f-a1d8-21500963a0e7',
    '647dec01-4d0b-4187-b489-f8a39d494034',
    '66135adb-cb51-489d-906e-8f6a23b24cad',
    '6cf99ac7-f2e2-4a38-a905-74d974b17fff',
    '7f38edde-2b43-47fa-9be3-0656c186e673',
    '7f8b756c-2c35-4e07-a4b0-4dfe66604552',
    '81ed3cdc-b58a-4ebc-aacf-76e0e2cacfdf',
    '839979fd-634e-4f6e-8abf-13a82d96dee5',
    '86f1799d-a75f-40e5-9f97-15bc9ddf8656',
    '8d35e2b3-01c0-4876-aac0-350addea9c91',
    '91209a9c-d73d-43da-a37b-b89d8d998fba',
    '9cce5784-3d7d-4840-aefe-1d8848010b73',
    'a23170bf-0d4c-4e9d-94b3-bbc180b251f6',
    'a6171216-b09a-4edd-b31f-a734d2bcbd08',
    'a8bf1f80-ea53-434a-ab82-2833c4ecde4a',
    'b76d3032-fd9e-4063-a381-6c77ef7e7ab1',
    'bae0213e-6de0-450e-b850-df5dc6689e35',
    'c4d8a07b-8213-4d4a-bfa8-5399b45853cd',
    'cd609ef2-e33f-4048-9f32-a87657051cf1',
    'cmpz10wgv0001r4zjice2dien',
    'cmq4qsaqu00017w0elhrja0cf',
    'cmqgfkjnd002xn9njhebiho5b',
    'cmqgfkk750031n9njy3z1k9a6',
    'cmqgfkn51003hn9njxfuezsw9',
    'cmqgfkoqp003rn9nj8w1nz1hd',
    'cmqgfkp9x003tn9nj0ymvpj70',
    'cmqgfkq2q003xn9njbxcfa1p2',
    'cmqgfkqlz0041n9njxs8i8005',
    'cmqgfkr570043n9njlsmkan9b',
    'cmqgfkroh0047n9njrapvlhgx',
    'cmqgfkshb004dn9njdusz5e5v',
    'cmqgfktjt004ln9njwsh92zex',
    'cmqgfkuem004pn9njdy4yjftl',
    'cmqgfkvqr004xn9nj82sg9tx7',
    'cmqgfkyf7005dn9njmrv437t9',
    'cmqgfkyyh005fn9njmdfh8b4e',
    'cmqgfkzhq005jn9njfqmtmivz',
    'cmqgfl0tu005rn9njq3nz1ech',
    'cmqgfl1wb005tn9njnpbu4cc0',
    'cmqgfl2fj005xn9njce94fo21',
    'cmqgfl3ro0065n9njdrytag54',
    'cmqgfl4u8006bn9njvj7wqkht',
    'cmqgfl5nn006fn9nj1ee966q4',
    'cmqgfl68t006jn9njtx4knj2s',
    'cmqgfl6s2006ln9njqbbt6sh8',
    'cmqgfl7ba006pn9njpx5w4hmm',
    'cmqgfl8nd006tn9nj55tyyt8d',
    'cmqgfl9ge006xn9njurz94k62',
    'cmqgfl9zn006zn9njqv7wunqr',
    'cmqgflash0073n9nj0m9oq5v1',
    'cmqgflbbq0075n9njq12gzy32',
    'cmqgflbuz0077n9njucsq0enb',
    'cmqgflce70079n9njfzz3qtm8',
    'cmqgfld73007bn9nj3ku7321w',
    'cmqgfle9k007dn9nj7v0q2w1a',
    'cmqgflfc2007hn9njm46v49pa',
    'cmqgflfva007jn9njja4jozgc',
    'cmqgflgek007ln9njdwn5nt02',
    'cmqgflibs007nn9njxiry3x8x',
    'cmqgflj4o007pn9njy50a6ywq',
    'cmqgfljnx007rn9njp1c2zll2',
    'cmqgflk7a007tn9njppln1uqx',
    'cmqgflkqi007vn9njv7xn5726',
    'cmqgfllsy007xn9njiz1rolk7',
    'cmqgflmc6007zn9nj73525ewx',
    'cmqgflnep0083n9nj6n2nh2xh',
    'cmqgflnxy0085n9njqk71x9lv',
    'cmqgfloh80087n9nj2nfocgaa',
    'cmqgflp0h0089n9nj3ytz1dnx',
    'cmqgflpjq008bn9nj4vxx1fxu',
    'cmqgflq2y008dn9nj45in5p2u',
    'cmqgflry9008fn9njqyskq1bx',
    'cmqgflshh008hn9njs7fbqomr',
    'cmqgfmh3w00bln9nj6xiqrvyo',
    'cmqgfmhn600bnn9nja21vn5re',
    'cmqgfmi6g00bpn9njghmb17q1',
    'cmqgfmipp00brn9njubmfytyi',
    'cmqgfmj9000btn9njrp7jhmgd',
    'cmqgfmjsa00bvn9nj030tnp80',
    'cmqgfmkbl00bxn9njuoj55rfi',
    'cmqgfmkuv00bzn9njfex44aj7',
    'cmqgfmle500c1n9njhk3fuwk8',
    'cmqgfmlxf00c3n9njvzfw879x',
    'cmqgfmmgq00c5n9nj20gymxkd',
    'cmqgfmnja00c7n9njzxihjc46',
    'cmqgfmp6z00cbn9njplywg0ri',
    'cmqgfmqsu00chn9nj9hqt3khs',
    'cmqgfmrc500cjn9njvxg292u8',
    'cmqgfmt7t00cln9njv6vkh486',
    'cmqgfmtr400cnn9nj6qywd8aj',
    'cmqgfmuae00cpn9njyruecfz0',
    'cmqgfmuto00crn9nj83wm7d13',
    'cmqgfmvcz00ctn9nj4oteyjpe',
    'cmqgfmvw900cvn9nj2a8h3uy4',
    'cmqgfmwfj00cxn9njpfh94bem',
    'cmqgfmxrp00czn9nj7yrpyx39',
    'cmqgfmyu900d1n9nj6uqk7djw',
    'cmqgfn06f00d3n9njn3ejq79s',
    'cmqgfn0rm00d5n9njoz5j2saa',
    'cmqgfn1ax00d7n9nj6wpgvlsg',
    'cmqgfn2n600dbn9njqaqw4caa',
    'cmqgfn4im00dfn9njwqlfpn69',
    'cmqgfn51x00dhn9nj54scgzt1',
    'cmqgfn5ut00djn9njaca48592',
    'cmqgfn6e500dln9njhrqgv4ji',
    'cmqgfn7qd00dpn9njiujqqu1l',
    'cmqgfn89o00drn9njb1akcxzz',
    'cmqgfn8sy00dtn9nja7asbavo',
    'cmqgfn9c800dvn9nj8dg4ll0o',
    'cmqgfna5500dxn9njxfcq9cfm',
    'cmqgfnaof00dzn9njxd2u2blx',
    'cmqgfnb7q00e1n9njlw6hdpe7',
    'cmqgfnclu00e5n9njkwfgjrg0',
    'cmqgfner100ebn9njsaq3rgxd',
    'cmqgfnfjy00edn9njwrn4txid',
    'cmqgfngcu00efn9njziiu2geh',
    'cmqgfngw600ehn9nj12p40h0a',
    'cmqgfni9b00eln9njspbjg9dy',
    'cmqgfnjlj00epn9nja59jwomn',
    'cmqgfnk4u00ern9njuuucnkt0',
    'cmqgfnko400etn9njy8skziwq',
    'cmqgfnlh100evn9njpw0089uj',
    'cmqgfnmt700exn9njnlewymvt',
    'cmqgfnnm500ezn9njruvmidqp',
    'cmqgfno7d00f1n9njltrshxs8',
    'cmqgfnoqo00f3n9njgn6vxy11',
    'cmqgfnq2t00f5n9njzk29jt4g',
    'cmqgfnroo00f9n9njpbwgu4i5',
    'd136eb11-5368-454c-bb4d-f71bcf3628a2',
    'd7a37487-c8eb-480e-a170-9428a3b2db9b',
    'd82a11fc-6360-4a17-8e62-3aabd47b4087',
    'dd704f31-0910-4290-9591-743c742b30ce',
    'edf8d61e-45e5-440a-bf70-7bf10795d7b1',
    'manual_booking_ascott_20260827'
  ]::text[];
  n_ids      int;
  n_filas    int;
  n_booking  int;
  n_vacias   int;
  suma       numeric;
  n_hechas   int;
BEGIN
  n_ids := cardinality(ids);
  SELECT count(i.id),
         count(*) FILTER (WHERE i.portal::text = 'BOOKING'),
         count(*) FILTER (WHERE i.amount_net_bank IS NULL),
         ROUND(SUM(i.amount)::numeric, 2)
    INTO n_filas, n_booking, n_vacias, suma
    FROM unnest(ids) AS t(id) JOIN public.incomes i ON i.id = t.id;

  IF n_ids <> 151 OR (SELECT count(DISTINCT x) FROM unnest(ids) x) <> 151 OR n_filas <> 151 OR n_booking <> 151 THEN
    RAISE EXCEPTION 'amount_net_bank: esperaba 151 ids/filas BOOKING; ids=%, filas=%, booking=%', n_ids, n_filas, n_booking;
  END IF;

  IF n_vacias = 0 THEN
    RAISE NOTICE 'amount_net_bank: las 151 filas ya estaban rellenas; nada que hacer';
    RETURN;
  END IF;

  IF n_vacias = 151 AND suma <> 82413.08 THEN
    RAISE EXCEPTION 'amount_net_bank: Σ amount de las 151 = % (esperado 82413.08). Algo las pisó: re-fija el neto bancario antes de aplicar.', suma;
  END IF;

  PERFORM set_config('app.skip_income_net_trigger', 'on', true);
  UPDATE public.incomes i
     SET amount_net_bank = ROUND(i.amount::numeric, 2)
   WHERE i.id = ANY (ids)
     AND i.amount_net_bank IS NULL;
  GET DIAGNOSTICS n_hechas = ROW_COUNT;
  PERFORM set_config('app.skip_income_net_trigger', 'off', true);

  IF n_hechas <> n_vacias THEN
    RAISE EXCEPTION 'amount_net_bank: rellenadas % filas, esperadas %', n_hechas, n_vacias;
  END IF;
  RAISE NOTICE 'amount_net_bank: rellenadas % filas', n_hechas;
END
$guarda$;

