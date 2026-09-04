-- Give every product its own editable customization catalogue. The same JSON
-- drives the customer UI and the trusted checkout price calculation.
alter table public.products
  add column if not exists customization_config jsonb not null default $json$
  {
    "enabled": true,
    "size": {"defaultValue":"Regular","options":[{"name":"Small","price":-3000},{"name":"Regular","price":0},{"name":"Large","price":5000}]},
    "temperature": {"defaultValue":"Iced","options":[{"name":"Hot","price":0},{"name":"Iced","price":0}]},
    "sugar": {"defaultValue":"50%","options":[{"name":"0%","price":0},{"name":"25%","price":0},{"name":"50%","price":0},{"name":"75%","price":0},{"name":"100%","price":0}]},
    "ice": {"defaultValue":"Normal ice","options":[{"name":"No ice","price":0},{"name":"Less ice","price":0},{"name":"Normal ice","price":0},{"name":"Extra ice","price":0}]},
    "milk": {"defaultValue":"Fresh milk","options":[{"name":"Fresh milk","price":0},{"name":"Oat milk","price":7000},{"name":"Soy milk","price":5000},{"name":"Almond milk","price":7000}]},
    "extras": [{"name":"Extra espresso shot","price":7000},{"name":"Syrup","price":5000},{"name":"Whipped cream","price":6000},{"name":"Caramel","price":5000},{"name":"Additional topping","price":6000}]
  }
  $json$::jsonb;

update public.products
set customization_config = jsonb_set(customization_config, '{enabled}', 'false'::jsonb)
where category = 'Snacks';

alter table public.products
  drop constraint if exists products_customization_config_valid;

alter table public.products
  add constraint products_customization_config_valid check (
    jsonb_typeof(customization_config) = 'object'
    and jsonb_typeof(customization_config->'enabled') = 'boolean'
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
    v_options := v_config->v_group->'options';
    if v_options is null or jsonb_typeof(v_options) <> 'array' then
      raise exception 'The % customization configuration is invalid', v_group;
    end if;

    -- An empty group is intentionally hidden for this product.
    if jsonb_array_length(v_options) = 0 then
      continue;
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

  for v_extra in
    select value from jsonb_array_elements_text(p_customization->'extras')
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

  return greatest(0, v_total);
end;
$$;

create or replace function public.replace_my_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_line_id text;
  v_quantity integer;
  v_note text;
  v_customization jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart items must be an array';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'The cart cannot contain more than 50 lines';
  end if;

  delete from public.cart_items where user_id = v_user_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_id := coalesce(v_item->>'lineId', '');
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    v_note := coalesce(v_item->>'note', '');
    v_customization := v_item->'customization';

    if char_length(v_line_id) not between 1 and 128 then
      raise exception 'A cart line identifier is invalid';
    end if;
    if v_quantity not between 1 and 20 then
      raise exception 'Cart quantities must be between 1 and 20';
    end if;
    if char_length(v_note) > 120 then
      raise exception 'Cart notes cannot exceed 120 characters';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'productId')::bigint and active = true;

    if not found then
      raise exception 'A cart product is not available';
    end if;

    if not coalesce((v_product.customization_config->>'enabled')::boolean, false) then
      v_customization := null;
    end if;

    insert into public.cart_items (
      user_id, line_id, product_id, name, category, accent, coffee_color,
      unit_price, quantity, note, customization
    ) values (
      v_user_id, v_line_id, v_product.id, v_product.name, v_product.category,
      v_product.accent, v_product.coffee_color,
      public.calculate_catalog_price(v_product.id, v_customization),
      v_quantity, v_note, v_customization
    );
  end loop;
end;
$$;

revoke all on function public.calculate_catalog_price(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.replace_my_cart(jsonb) from public, anon;
grant execute on function public.replace_my_cart(jsonb) to authenticated;
