-- Keep public reads independent from private role checks; add separate admin policies.

drop policy if exists "Public can read active branches" on public.branches;
create policy "Public can read active branches"
on public.branches for select to anon, authenticated
using (active = true);

drop policy if exists "Admins can read every branch" on public.branches;
create policy "Admins can read every branch"
on public.branches for select to authenticated
using ((select private.current_user_role()) = 'admin');
drop policy if exists "Customers can read active promotions" on public.promotions;
create policy "Customers can read active promotions"
on public.promotions for select to anon, authenticated
using (active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

drop policy if exists "Admins can read every promotion" on public.promotions;
create policy "Admins can read every promotion"
on public.promotions for select to authenticated
using ((select private.current_user_role()) = 'admin');
