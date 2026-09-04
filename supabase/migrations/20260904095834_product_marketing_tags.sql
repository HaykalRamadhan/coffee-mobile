alter table public.products
  add column if not exists tag text not null default 'FEATURED';

update public.products
set tag = case id
  when 1 then 'BESTSELLER'
  when 2 then 'NEW'
  when 3 then 'SIGNATURE'
  when 4 then 'FRESH'
  when 5 then 'CLASSIC'
  when 6 then 'STRONG'
  when 7 then 'CRISPY'
  when 8 then 'BAKED'
  else tag
end
where id between 1 and 8;

alter table public.products drop constraint if exists products_tag_length;
alter table public.products add constraint products_tag_length
  check (char_length(trim(tag)) <= 24);

comment on column public.products.tag is
  'Customer-facing marketing label such as BESTSELLER, NEW, or SIGNATURE. SKU remains internal.';
