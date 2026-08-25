-- Consolida as policies de RLS em um conjunto unico por tabela, todas no role
-- {authenticated}, e fecha a brecha de INSERT publico em notifications.
--
-- Ordem defensiva: primeiro CREATE do conjunto final (nomes novos, sem colisao
-- com os atuais), depois DROP das redundantes. Policies permissivas sao OR'd,
-- entao em nenhum instante a tabela fica sem protecao equivalente.
--
-- Nao toca em: messages, conversations, conversation_participants,
-- passport_shares, travel_plans, explore_interactions, support_tickets.

begin;

-- ---------------------------------------------------------------------------
-- 1. Conjunto final
-- ---------------------------------------------------------------------------

-- notifications: sem policy de INSERT. As notificacoes sao criadas apenas por
-- triggers SECURITY DEFINER (follow/comment/photo), que rodam com o owner das
-- migracoes e contornam RLS. Sem policy de INSERT o client nao forja
-- notificacao nem para terceiros nem para si mesmo.
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- comments: leitura liberada entre logados, escrita so do dono.
create policy comments_select on public.comments
  for select to authenticated using (true);
create policy comments_insert on public.comments
  for insert to authenticated with check (user_id = auth.uid());
create policy comments_delete on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- country_photos: foto privada visivel so pelo dono.
create policy country_photos_select on public.country_photos
  for select to authenticated using (is_public = true or user_id = auth.uid());
create policy country_photos_insert on public.country_photos
  for insert to authenticated with check (user_id = auth.uid());
create policy country_photos_update on public.country_photos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy country_photos_delete on public.country_photos
  for delete to authenticated using (user_id = auth.uid());

-- favorite_photos: privado, so o dono le e escreve.
create policy favorite_photos_select on public.favorite_photos
  for select to authenticated using (user_id = auth.uid());
create policy favorite_photos_insert on public.favorite_photos
  for insert to authenticated with check (user_id = auth.uid());
create policy favorite_photos_delete on public.favorite_photos
  for delete to authenticated using (user_id = auth.uid());

-- followers: quem segue quem e visivel para todos os logados.
create policy followers_select on public.followers
  for select to authenticated using (true);
create policy followers_insert on public.followers
  for insert to authenticated with check (follower_id = auth.uid() and follower_id <> following_id);
create policy followers_delete on public.followers
  for delete to authenticated using (follower_id = auth.uid());

-- profiles: perfil publico entre logados, edicao so do proprio.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- visited_countries: passaporte publico entre logados.
create policy visited_countries_select on public.visited_countries
  for select to authenticated using (true);
create policy visited_countries_insert on public.visited_countries
  for insert to authenticated with check (user_id = auth.uid());
create policy visited_countries_update on public.visited_countries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy visited_countries_delete on public.visited_countries
  for delete to authenticated using (user_id = auth.uid());

-- wishlist: publica entre logados.
create policy wishlist_select on public.wishlist
  for select to authenticated using (true);
create policy wishlist_insert on public.wishlist
  for insert to authenticated with check (user_id = auth.uid());
create policy wishlist_update on public.wishlist
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wishlist_delete on public.wishlist
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Drops nominais das policies redundantes
-- ---------------------------------------------------------------------------

-- notifications (inclui a brecha de seguranca).
drop policy if exists "System can insert notifications" on public.notifications;
drop policy if exists "Users manage own notifications" on public.notifications;
drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;

-- comments.
drop policy if exists "Users can delete own comments" on public.comments;
drop policy if exists "Users delete own comments" on public.comments;
drop policy if exists "Users can insert own comments" on public.comments;
drop policy if exists "Users create own comments" on public.comments;
drop policy if exists "Anyone can read comments" on public.comments;
drop policy if exists "Authenticated users can read comments" on public.comments;

-- followers.
drop policy if exists "Users manage own follows" on public.followers;
drop policy if exists "Usuário pode deixar de seguir" on public.followers;
drop policy if exists "Usuário pode seguir" on public.followers;
drop policy if exists "Authenticated users can read follows" on public.followers;
drop policy if exists "Usuário vê seus próprios follows" on public.followers;

-- wishlist.
drop policy if exists "Users manage own wishlist" on public.wishlist;
drop policy if exists "Anyone can see wishlists" on public.wishlist;

-- profiles / country_photos / favorite_photos / visited_countries: nomes
-- conhecidos a partir das migracoes versionadas.
drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users can read public or own photos" on public.country_photos;
drop policy if exists "Users manage own photos" on public.country_photos;
drop policy if exists "Users manage own favorites" on public.favorite_photos;
drop policy if exists "Authenticated users can read visited countries" on public.visited_countries;
drop policy if exists "Users manage own visited countries" on public.visited_countries;

-- ---------------------------------------------------------------------------
-- 3. Varredura das duplicatas criadas fora das migracoes (Dashboard)
-- ---------------------------------------------------------------------------
-- Restrita as tabelas consolidadas acima. Remove o que sobrou fora da
-- keep-list; e no-op se os drops nominais ja deram conta.

do $$
declare
  redundant record;
begin
  for redundant in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'notifications', 'comments', 'country_photos', 'favorite_photos',
        'followers', 'profiles', 'visited_countries', 'wishlist'
      )
      and policyname not in (
        'notifications_select', 'notifications_update', 'notifications_delete',
        'comments_select', 'comments_insert', 'comments_delete',
        'country_photos_select', 'country_photos_insert',
        'country_photos_update', 'country_photos_delete',
        'favorite_photos_select', 'favorite_photos_insert', 'favorite_photos_delete',
        'followers_select', 'followers_insert', 'followers_delete',
        'profiles_select', 'profiles_insert', 'profiles_update',
        'visited_countries_select', 'visited_countries_insert',
        'visited_countries_update', 'visited_countries_delete',
        'wishlist_select', 'wishlist_insert', 'wishlist_update', 'wishlist_delete'
      )
  loop
    raise notice 'dropping redundant policy %.% -> %',
      redundant.schemaname, redundant.tablename, redundant.policyname;
    execute format(
      'drop policy %I on %I.%I',
      redundant.policyname, redundant.schemaname, redundant.tablename
    );
  end loop;
end;
$$;

commit;
