-- Execute with `supabase db push` after reviewing against the production schema.
-- The app uses only authenticated users for these resources.

alter table public.profiles enable row level security;
alter table public.visited_countries enable row level security;
alter table public.country_photos enable row level security;
alter table public.favorite_photos enable row level security;
alter table public.comments enable row level security;
alter table public.followers enable row level security;
alter table public.wishlist enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Authenticated users can read profiles" on public.profiles for select to authenticated using (true);
create policy "Users create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Authenticated users can read visited countries" on public.visited_countries;
drop policy if exists "Users manage own visited countries" on public.visited_countries;
create policy "Authenticated users can read visited countries" on public.visited_countries for select to authenticated using (true);
create policy "Users manage own visited countries" on public.visited_countries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can read public or own photos" on public.country_photos;
drop policy if exists "Users manage own photos" on public.country_photos;
create policy "Users can read public or own photos" on public.country_photos for select to authenticated using (is_public = true or user_id = auth.uid());
create policy "Users manage own photos" on public.country_photos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own favorites" on public.favorite_photos;
create policy "Users manage own favorites" on public.favorite_photos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Authenticated users can read comments" on public.comments;
drop policy if exists "Users create own comments" on public.comments;
drop policy if exists "Users delete own comments" on public.comments;
create policy "Authenticated users can read comments" on public.comments for select to authenticated using (true);
create policy "Users create own comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "Users delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Authenticated users can read follows" on public.followers;
drop policy if exists "Users manage own follows" on public.followers;
create policy "Authenticated users can read follows" on public.followers for select to authenticated using (true);
create policy "Users manage own follows" on public.followers for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid() and follower_id <> following_id);

drop policy if exists "Users manage own wishlist" on public.wishlist;
create policy "Users manage own wishlist" on public.wishlist for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own notifications" on public.notifications;
create policy "Users manage own notifications" on public.notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage writes are scoped to the authenticated user's directory. The buckets
-- remain public today because photo URLs are persisted as public URLs; convert
-- them to private only together with a signed-URL data migration.
drop policy if exists "Users upload country photos to own folder" on storage.objects;
drop policy if exists "Users delete own country photos" on storage.objects;
drop policy if exists "Users upload own avatars" on storage.objects;
drop policy if exists "Users update own avatars" on storage.objects;
drop policy if exists "Users delete own avatars" on storage.objects;
create policy "Users upload country photos to own folder" on storage.objects for insert to authenticated with check (bucket_id = 'country-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own country photos" on storage.objects for delete to authenticated using (bucket_id = 'country-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload own avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and name like auth.uid()::text || '_%');
create policy "Users update own avatars" on storage.objects for update to authenticated using (bucket_id = 'avatars' and name like auth.uid()::text || '_%') with check (bucket_id = 'avatars' and name like auth.uid()::text || '_%');
create policy "Users delete own avatars" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and name like auth.uid()::text || '_%');
