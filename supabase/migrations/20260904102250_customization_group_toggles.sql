-- Preserve each group's choices while letting admins independently show or
-- hide Size, Temperature, Sugar, Ice, and Milk for a product.
update public.products
set customization_config =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(customization_config, '{size,enabled}', 'true'::jsonb, true),
          '{temperature,enabled}', 'true'::jsonb, true
        ),
        '{sugar,enabled}', 'true'::jsonb, true
      ),
      '{ice,enabled}', 'true'::jsonb, true
    ),
    '{milk,enabled}', 'true'::jsonb, true
  ) || jsonb_build_object('extrasEnabled', true);

alter table public.products alter column customization_config set default $json$
{
  "enabled": true,
  "size": {"enabled":true,"defaultValue":"Regular","options":[{"name":"Small","price":-3000},{"name":"Regular","price":0},{"name":"Large","price":5000}]},
  "temperature": {"enabled":true,"defaultValue":"Iced","options":[{"name":"Hot","price":0},{"name":"Iced","price":0}]},
  "sugar": {"enabled":true,"defaultValue":"50%","options":[{"name":"0%","price":0},{"name":"25%","price":0},{"name":"50%","price":0},{"name":"75%","price":0},{"name":"100%","price":0}]},
  "ice": {"enabled":true,"defaultValue":"Normal ice","options":[{"name":"No ice","price":0},{"name":"Less ice","price":0},{"name":"Normal ice","price":0},{"name":"Extra ice","price":0}]},
  "milk": {"enabled":true,"defaultValue":"Fresh milk","options":[{"name":"Fresh milk","price":0},{"name":"Oat milk","price":7000},{"name":"Soy milk","price":5000},{"name":"Almond milk","price":7000}]},
  "extrasEnabled": true,
  "extras": [{"name":"Extra espresso shot","price":7000},{"name":"Syrup","price":5000},{"name":"Whipped cream","price":6000},{"name":"Caramel","price":5000},{"name":"Additional topping","price":6000}]
}
$json$::jsonb;

alter table public.products
  drop constraint if exists products_customization_config_valid;

alter table public.products
  add constraint products_customization_config_valid check (
    jsonb_typeof(customization_config) = 'object'
    and jsonb_typeof(customization_config->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'size'->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'temperature'->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'sugar'->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'ice'->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'milk'->'enabled') = 'boolean'
    and jsonb_typeof(customization_config->'extrasEnabled') = 'boolean'
    and octet_length(customization_config::text) <= 20000
  );

create or replace function public.calculate_catalog_price(
  p_product_id bigint,
  p_customization jsonb
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.products%rowtype;
  v_config jsonb;
  v_group text;
  v_options jsonb;
  v_selection text;
  v_option jsonb;
  v_extra text;
  v_adjustment integer;
  v_extra_count integer;
  v_distinct_extra_count integer;
  v_total integer;
begin
  select * into v_product
  from public.products
  where id = p_product_id and active = true;

  if not found then
    raise exception 'Product % is not available', p_product_id;
  end if;

  v_config := v_product.customization_config;
  if jsonb_typeof(v_config) <> 'object'
    or jsonb_typeof(v_config->'enabled') <> 'boolean' then
    raise exception 'The product customization configuration is invalid';
  end if;

  if not (v_config->>'enabled')::boolean then
    return v_product.base_price;
  end if;
  if p_customization is null or jsonb_typeof(p_customization) <> 'object' then
    raise exception 'A valid customization is required';
  end if;

  v_total := v_product.base_price;
  foreach v_group in array array['size', 'temperature', 'sugar', 'ice', 'milk']
  loop
    if not coalesce((v_config->v_group->>'enabled')::boolean, true) then
      continue;
    end if;

    v_options := v_config->v_group->'options';
    if v_options is null or jsonb_typeof(v_options) <> 'array'
      or jsonb_array_length(v_options) = 0 then
      raise exception 'The % customization configuration is invalid', v_group;
    end if;

    v_selection := nullif(btrim(coalesce(p_customization->>v_group, '')), '');
    if v_selection is null then
      raise exception 'Choose a % option', v_group;
    end if;

    v_option := null;
    select option.value into v_option
    from jsonb_array_elements(v_options) as option(value)
    where option.value->>'name' = v_selection
    limit 1;
    if v_option is null then
      raise exception 'Unsupported % option: %', v_group, v_selection;
    end if;

    v_adjustment := coalesce((v_option->>'price')::integer, 0);
    if abs(v_adjustment) > 1000000 then
      raise exception 'The % price adjustment is invalid', v_group;
    end if;
    v_total := v_total + v_adjustment;
  end loop;

  if coalesce((v_config->>'extrasEnabled')::boolean, true) then
    if jsonb_typeof(v_config->'extras') <> 'array' then
      raise exception 'The extras customization configuration is invalid';
    end if;
    if p_customization->'extras' is null
      or jsonb_typeof(p_customization->'extras') <> 'array' then
      raise exception 'Extras must be an array';
    end if;

    select count(*), count(distinct value)
    into v_extra_count, v_distinct_extra_count
    from jsonb_array_elements_text(p_customization->'extras');
    if v_extra_count <> v_distinct_extra_count then
      raise exception 'An extra cannot be selected more than once';
    end if;

    for v_extra in select value from jsonb_array_elements_text(p_customization->'extras')
    loop
      v_option := null;
      select option.value into v_option
      from jsonb_array_elements(v_config->'extras') as option(value)
      where option.value->>'name' = v_extra
      limit 1;
      if v_option is null then
        raise exception 'Unsupported extra: %', v_extra;
      end if;

      v_adjustment := coalesce((v_option->>'price')::integer, 0);
      if abs(v_adjustment) > 1000000 then
        raise exception 'The extra price adjustment is invalid';
      end if;
      v_total := v_total + v_adjustment;
    end loop;
  end if;

  return greatest(0, v_total);
end;
$$;

revoke all on function public.calculate_catalog_price(bigint, jsonb) from public, anon, authenticated;
