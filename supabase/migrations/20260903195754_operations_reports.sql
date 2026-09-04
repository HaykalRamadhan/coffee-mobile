-- Server-calculated operations reports. The function is SECURITY INVOKER so
-- existing order and branch RLS continues to scope staff/admin results.

create index if not exists order_items_order_id_idx
on public.order_items (order_id);

create index if not exists orders_created_at_idx
on public.orders (created_at desc);

create or replace function public.get_operations_report(p_period text default 'today')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with settings as (
    select
      case when p_period in ('today', '7d', '30d') then p_period else 'today' end as period,
      timezone('Asia/Jakarta', now()) as local_now
  ),
  local_bounds as (
    select
      period,
      local_now,
      case period
        when '7d' then date_trunc('day', local_now) - interval '6 days'
        when '30d' then date_trunc('day', local_now) - interval '29 days'
        else date_trunc('day', local_now)
      end as local_start
    from settings
  ),
  bounds as (
    select
      period,
      local_now,
      local_start,
      local_start at time zone 'Asia/Jakarta' as start_at,
      now() as end_at,
      (local_start at time zone 'Asia/Jakarta') - (now() - (local_start at time zone 'Asia/Jakarta')) as previous_start_at,
      local_start at time zone 'Asia/Jakarta' as previous_end_at
    from local_bounds
  ),
  scoped_orders as (
    select orders.*
    from public.orders as orders
    where (select private.current_user_role()) in ('staff', 'admin')
  ),
  paid_orders as (
    select orders.*
    from scoped_orders as orders
    cross join bounds
    where orders.payment_status = 'paid'
      and orders.paid_at >= bounds.start_at
      and orders.paid_at < bounds.end_at
  ),
  previous_paid_orders as (
    select orders.*
    from scoped_orders as orders
    cross join bounds
    where orders.payment_status = 'paid'
      and orders.paid_at >= bounds.previous_start_at
      and orders.paid_at < bounds.previous_end_at
  ),
  current_summary as (
    select
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::bigint as transactions,
      coalesce(round(avg(total)), 0)::numeric as average_order
    from paid_orders
  ),
  previous_summary as (
    select
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::bigint as transactions
    from previous_paid_orders
  ),
  paid_items as (
    select
      items.product_id,
      items.product_name,
      coalesce(products.category, 'Other') as category,
      items.quantity,
      (items.unit_price * items.quantity)::numeric as revenue
    from paid_orders as orders
    join public.order_items as items on items.order_id = orders.id
    left join public.products as products on products.id = items.product_id
  ),
  top_product as (
    select product_name, sum(quantity)::bigint as units
    from paid_items
    group by product_id, product_name
    order by units desc, product_name
    limit 1
  ),
  category_rows as (
    select
      category,
      sum(quantity)::bigint as items,
      coalesce(sum(revenue), 0)::numeric as revenue
    from paid_items
    group by category
    order by revenue desc, category
  ),
  hourly_buckets as (
    select generate_series(
      date_trunc('hour', bounds.local_start),
      date_trunc('hour', bounds.local_now),
      interval '1 hour'
    ) as bucket_local
    from bounds
    where bounds.period = 'today'
  ),
  daily_buckets as (
    select generate_series(
      date_trunc('day', bounds.local_start),
      date_trunc('day', bounds.local_now),
      interval '1 day'
    ) as bucket_local
    from bounds
    where bounds.period <> 'today'
  ),
  all_buckets as (
    select bucket_local, interval '1 hour' as bucket_size, 'HH24:MI' as label_format from hourly_buckets
    union all
    select bucket_local, interval '1 day' as bucket_size, 'DD Mon' as label_format from daily_buckets
  ),
  trend_rows as (
    select
      buckets.bucket_local,
      to_char(buckets.bucket_local, buckets.label_format) as label,
      coalesce(sum(orders.total), 0)::numeric as revenue,
      count(orders.id)::bigint as transactions
    from all_buckets as buckets
    left join paid_orders as orders
      on timezone('Asia/Jakarta', orders.paid_at) >= buckets.bucket_local
      and timezone('Asia/Jakarta', orders.paid_at) < buckets.bucket_local + buckets.bucket_size
    group by buckets.bucket_local, buckets.label_format
    order by buckets.bucket_local
  ),
  transaction_rows as (
    select
      orders.id,
      orders.created_at,
      orders.paid_at,
      orders.payment_method,
      orders.payment_status,
      orders.status,
      orders.total
    from scoped_orders as orders
    cross join bounds
    where orders.created_at >= bounds.start_at
      and orders.created_at < bounds.end_at
    order by orders.created_at desc
    limit 12
  )
  select jsonb_build_object(
    'period', bounds.period,
    'timezone', 'Asia/Jakarta',
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'revenue', current_summary.revenue,
      'transactions', current_summary.transactions,
      'averageOrder', current_summary.average_order,
      'itemsSold', coalesce((select sum(quantity) from paid_items), 0),
      'topProduct', coalesce((select product_name from top_product), 'No paid sales yet'),
      'topProductUnits', coalesce((select units from top_product), 0),
      'revenueChangePercent', case
        when previous_summary.revenue = 0 then null
        else round(((current_summary.revenue - previous_summary.revenue) / previous_summary.revenue) * 100, 1)
      end,
      'transactionChangePercent', case
        when previous_summary.transactions = 0 then null
        else round(((current_summary.transactions - previous_summary.transactions)::numeric / previous_summary.transactions) * 100, 1)
      end
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', label,
        'revenue', revenue,
        'transactions', transactions
      ) order by bucket_local)
      from trend_rows
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', category,
        'items', items,
        'revenue', revenue
      ) order by revenue desc, category)
      from category_rows
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'createdAt', created_at,
        'paidAt', paid_at,
        'paymentMethod', payment_method,
        'paymentStatus', payment_status,
        'status', status,
        'total', total
      ) order by created_at desc)
      from transaction_rows
    ), '[]'::jsonb)
  )
  from bounds
  cross join current_summary
  cross join previous_summary;
$$;

revoke all on function public.get_operations_report(text) from public, anon;
grant execute on function public.get_operations_report(text) to authenticated;

comment on function public.get_operations_report(text) is
  'RLS-scoped revenue, sales trend, category distribution, and transaction report in Asia/Jakarta time.';
