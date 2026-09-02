alter table public.orders
  drop constraint if exists orders_user_id_fkey;

alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_user_id_fkey;

alter table public.payment_attempts
  add constraint payment_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
