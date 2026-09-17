// Fundação da viagem colaborativa: o que as migrações precisam garantir, e a
// tradução entre o roteiro em linhas e o formato que as telas leem.
//
// Estes testes não sobem banco. Eles leem o SQL versionado e cobram os
// invariantes que, se quebrarem, quebram em PRODUÇÃO e em silêncio: RLS que
// deixa de olhar a participação, exclusão de conta que apaga a viagem dos
// outros, a flag do globo voltando a ser da viagem em vez de ser de quem olha.
// É o mesmo espírito de profile-schema.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

const migration = (name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8');

const MEMBERS = migration('20260915120000_trip_members.sql');
const ITINERARY = migration('20260915130000_trip_itinerary_tables.sql');
const DELETION = migration('20260915140000_trip_collaboration_account_deletion.sql');

// ── Participantes ────────────────────────────────────────────────────────────

test('trip_members tem chave composta e os papéis previstos', () => {
  assert.match(MEMBERS, /create table if not exists public\.trip_members/);
  assert.match(MEMBERS, /primary key \(trip_id, user_id\)/);
  assert.match(MEMBERS, /check \(role in \('owner', 'editor', 'viewer'\)\)/);
  assert.match(MEMBERS, /check \(status in \('pending', 'accepted'\)\)/);
  assert.match(MEMBERS, /invited_by uuid references public\.profiles/);
  assert.match(MEMBERS, /joined_at timestamptz/);
});

test('nenhuma viagem existe sem dono', () => {
  // O trigger cobre as viagens novas...
  assert.match(MEMBERS, /create trigger add_trip_owner_member\s+after insert on public\.travel_plans/);
  // ...e o insert de backfill cobre as que já existiam.
  assert.match(MEMBERS, /insert into public\.trip_members[\s\S]*from public\.travel_plans tp/);

  // O trigger precisa ser security definer: no instante em que ele roda, a
  // policy de INSERT ("é dono?") não teria dono nenhum para encontrar.
  const trigger = MEMBERS.slice(MEMBERS.indexOf('function public.add_trip_owner_member'));
  assert.match(trigger.slice(0, 400), /security definer/);
});

test('as funções de permissão seguem o padrão de conversations (sem recursão de RLS)', () => {
  for (const fn of ['is_trip_member', 'can_edit_trip', 'is_trip_owner']) {
    const corpo = MEMBERS.slice(MEMBERS.indexOf(`function public.${fn}(`));
    assert.match(corpo.slice(0, 300), /stable/, `${fn} deveria ser stable`);
    assert.match(corpo.slice(0, 300), /security definer/, `${fn} deveria ser security definer`);
    assert.match(MEMBERS, new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to authenticated`));
  }

  // Edição exige convite aceito; leitura não (o convidado precisa ver a viagem
  // para decidir se aceita).
  const editar = MEMBERS.slice(MEMBERS.indexOf('function public.can_edit_trip('));
  assert.match(editar.slice(0, 400), /status = 'accepted'/);
  assert.match(editar.slice(0, 400), /role in \('owner', 'editor'\)/);
});

test('a RLS da viagem passou a olhar a participação, não o dono', () => {
  // As quatro policies antigas (user_id = auth.uid()) saem de cena.
  for (const antiga of [
    'Users read own travel plans',
    'Users update own travel plans',
    'Users delete own travel plans',
  ]) {
    assert.match(MEMBERS, new RegExp(`drop policy if exists "${antiga}"`));
  }

  assert.match(MEMBERS, /create policy "Members read trips"[\s\S]{0,200}using \(public\.is_trip_member\(id\)\)/);
  assert.match(MEMBERS, /create policy "Editors update trips"[\s\S]{0,260}public\.can_edit_trip\(id\)/);
  // Excluir continua exclusivo do dono — decisão de produto: apaga para todos.
  assert.match(MEMBERS, /create policy "Owners delete trips"[\s\S]{0,200}using \(public\.is_trip_owner\(id\)\)/);
});

test('um membro não consegue se promover a dono', () => {
  // A policy de UPDATE de trip_members é só do dono. O que o membro faz na
  // própria linha passa por RPC, que escreve um campo e nada mais.
  assert.match(MEMBERS, /create policy "Owners update members"[\s\S]{0,260}public\.is_trip_owner\(trip_id\)/);
  assert.match(MEMBERS, /function public\.accept_trip_invite\(/);
  assert.match(MEMBERS, /function public\.leave_trip\(/);

  const aceitar = MEMBERS.slice(MEMBERS.indexOf('function public.accept_trip_invite('));
  // A RPC só mexe em status/joined_at da PRÓPRIA linha: nada de role.
  assert.match(aceitar.slice(0, 500), /set status = 'accepted'/);
  assert.doesNotMatch(aceitar.slice(0, 500), /set role|role =/);
  assert.match(aceitar.slice(0, 500), /user_id = auth\.uid\(\)/);
});

test('bloqueio impede o convite, nos dois sentidos', () => {
  assert.match(
    MEMBERS,
    /create policy "Owners invite members"[\s\S]{0,300}not public\.is_blocked_either_way\(auth\.uid\(\), user_id\)/
  );
});

test('a viagem nunca fica sem dono, nem por saída nem por troca de papel', () => {
  assert.match(MEMBERS, /create trigger prevent_last_trip_owner_removal\s+before update or delete on public\.trip_members/);
  const guarda = MEMBERS.slice(MEMBERS.indexOf('function public.prevent_last_trip_owner_removal'));
  assert.match(guarda.slice(0, 1800), /A viagem ficaria sem dono/);
  // O retorno é por ramo, não coalesce(new, old): num BEFORE DELETE o `new` é
  // nulo e coalesce não aceita RECORD — a trava quebraria no caminho que ela
  // existe para proteger.
  assert.doesNotMatch(guarda.slice(0, 1800), /return coalesce\(new, old\)/);
  assert.match(guarda.slice(0, 1800), /if tg_op = 'DELETE' then return old; end if;/);
});

// ── A viagem no globo ────────────────────────────────────────────────────────

test('is_active_on_map deixou de ser da viagem e passou a ser de quem olha', () => {
  // Estado novo, no participante, com o mesmo invariante de "uma por pessoa".
  assert.match(MEMBERS, /is_active_on_map boolean not null default false/);
  assert.match(
    MEMBERS,
    /create unique index if not exists trip_members_one_active_on_map_idx\s+on public\.trip_members \(user_id\)\s+where is_active_on_map/
  );

  // Migração de DADO, e não só de schema: quem tinha uma viagem aplicada
  // continua com ela aplicada.
  assert.match(MEMBERS, /update public\.trip_members m\s+set is_active_on_map = true[\s\S]{0,260}and t\.is_active_on_map/);

  // E a coluna antiga sai, para não existirem duas fontes da verdade.
  assert.match(MEMBERS, /drop index if exists public\.travel_plans_one_active_on_map_idx/);
  assert.match(MEMBERS, /alter table public\.travel_plans\s+drop column if exists is_active_on_map/);
});

test('set_active_plan_on_map mantém a assinatura que o app já chama', () => {
  // O app chama supabase.rpc('set_active_plan_on_map', { p_plan_id }). Mudar a
  // assinatura quebraria a tela de roteiros salvos sem erro de compilação.
  assert.match(MEMBERS, /function public\.set_active_plan_on_map\(p_plan_id uuid\)/);
  assert.match(MEMBERS, /grant execute on function public\.set_active_plan_on_map\(uuid\) to authenticated/);

  const rpc = MEMBERS.slice(MEMBERS.indexOf('function public.set_active_plan_on_map('));
  // Agora escreve no participante, não na viagem.
  assert.match(rpc.slice(0, 900), /update public\.trip_members/);
  assert.doesNotMatch(rpc.slice(0, 900), /update public\.travel_plans/);
});

// ── Roteiro normalizado ──────────────────────────────────────────────────────

test('o roteiro virou linhas, com a atividade presa ao dia da MESMA viagem', () => {
  assert.match(ITINERARY, /create table if not exists public\.trip_days/);
  assert.match(ITINERARY, /create table if not exists public\.trip_activities/);
  assert.match(ITINERARY, /unique \(trip_id, day_number\)/);

  // FK composto: sem ele, uma atividade poderia apontar para um dia de outra
  // viagem e furar a RLS pelo trip_id denormalizado.
  assert.match(
    ITINERARY,
    /foreign key \(day_id, trip_id\) references public\.trip_days \(id, trip_id\)/
  );
  assert.match(ITINERARY, /unique \(id, trip_id\)/);
});

test('a RLS do roteiro faz a mesma pergunta da viagem', () => {
  assert.match(ITINERARY, /create policy "Members read trip days"[\s\S]{0,200}public\.is_trip_member\(trip_id\)/);
  assert.match(ITINERARY, /create policy "Editors write trip days"[\s\S]{0,220}public\.can_edit_trip\(trip_id\)/);
  assert.match(ITINERARY, /create policy "Members read trip activities"[\s\S]{0,200}public\.is_trip_member\(trip_id\)/);
  assert.match(ITINERARY, /create policy "Editors write trip activities"[\s\S]{0,220}public\.can_edit_trip\(trip_id\)/);
});

test('a migração do plan_data é idempotente e não perde campo', () => {
  // Rodar duas vezes não pode duplicar o roteiro de ninguém.
  assert.match(ITINERARY, /if exists \(select 1 from public\.trip_days where trip_id = viagem\.id\) then\s+continue;/);

  // O que não tem coluna vai para `extra` em vez de sumir.
  assert.match(ITINERARY, /extra jsonb not null default '\{\}'::jsonb/);
  assert.match(ITINERARY, /atividade - 'period' - 'title'/);

  // Coordenada inválida vira null em vez de virar um pino no golfo da Guiné.
  assert.match(ITINERARY, /if coordenada_lat = 0 and coordenada_lng = 0 then/);

  // `plan_data` continua de pé como fallback de rollback desta fase.
  assert.doesNotMatch(ITINERARY, /drop column if exists plan_data/);
});

test('replace_trip_itinerary respeita a permissão de quem chamou', () => {
  const rpc = ITINERARY.slice(ITINERARY.indexOf('function public.replace_trip_itinerary('));
  // security INVOKER: as policies continuam valendo dentro da função. Com
  // definer, qualquer pessoa logada reescreveria o roteiro de qualquer viagem.
  assert.match(rpc.slice(0, 400), /security invoker/);
  assert.match(ITINERARY, /grant execute on function public\.replace_trip_itinerary\(uuid, jsonb\) to authenticated/);
});

// ── Exclusão de conta ────────────────────────────────────────────────────────

test('excluir a conta transfere a viagem em vez de apagá-la para os outros', () => {
  assert.match(DELETION, /function public\.transfer_trips_before_purge\(target uuid\)/);

  // Herdeiro = participante aceito mais antigo.
  assert.match(DELETION, /status = 'accepted'[\s\S]{0,200}order by coalesce\(m\.joined_at, m\.created_at\) asc/);

  // O user_id da viagem PRECISA mudar: o FK dele é on delete cascade, então
  // apagar o perfil do dono antigo levaria a viagem junto.
  assert.match(DELETION, /update public\.travel_plans\s+set user_id = herdeiro/);

  // E a transferência acontece ANTES do delete das viagens.
  const purge = DELETION.slice(DELETION.indexOf('function public.purge_account('));
  const ordemTransferencia = purge.indexOf('transfer_trips_before_purge(target)');
  const ordemDelete = purge.indexOf('delete from public.travel_plans');
  assert.ok(ordemTransferencia > 0 && ordemTransferencia < ordemDelete);
});

test('a varredura defensiva de purge_account conhece as tabelas novas', () => {
  // Sem isto, purge_account abortaria para TODA conta: ela levanta exceção
  // diante de qualquer tabela com FK para profiles/auth.users fora da lista.
  for (const tabela of ['trip_members', 'trip_days', 'trip_activities']) {
    assert.match(DELETION, new RegExp(`'${tabela}'`), `${tabela} fora da lista da varredura`);
  }
  // E o que a versão anterior já apagava continua sendo apagado.
  assert.match(DELETION, /delete from public\.blocked_users\s+where blocker_id = target/);
  assert.match(DELETION, /delete from public\.trip_members\s+where user_id = target/);
});

// ── Tradução linhas ↔ telas ──────────────────────────────────────────────────

const tripItinerary = loadEsm('src/utils/tripItinerary.js');
const { itineraryFromRows, itineraryToRowsPayload } = tripItinerary;

const dayRow = (dayNumber, activities = []) => ({
  id: `day-${dayNumber}`,
  day_number: dayNumber,
  date: '2026-10-01',
  theme: `Dia ${dayNumber}`,
  trip_activities: activities,
});

const activityRow = (position, overrides = {}) => ({
  id: `act-${position}`,
  position,
  title: `Parada ${position}`,
  category: 'atracao',
  estimated_cost: 120,
  latitude: 41.89,
  longitude: 12.49,
  map_query: 'Coliseu, Roma',
  opening_hours: ['09:00-19:00'],
  extra: {},
  ...overrides,
});

test('as linhas viram days[] na ordem certa, mesmo chegando embaralhadas', () => {
  // O PostgREST não garante a ordem de uma relação aninhada.
  const days = itineraryFromRows([
    dayRow(2, [activityRow(2), activityRow(1)]),
    dayRow(1, [activityRow(1)]),
  ]);

  assert.deepEqual(days.map((day) => day.day), [1, 2]);
  assert.deepEqual(days[1].activities.map((activity) => activity.order), [1, 2]);
});

test('a tradução devolve o formato que as telas já leem', () => {
  const [day] = itineraryFromRows([dayRow(1, [activityRow(1)])]);
  const [activity] = day.activities;

  assert.equal(day.theme, 'Dia 1');
  assert.equal(activity.title, 'Parada 1');
  assert.equal(activity.estimatedCost, 120);
  assert.equal(activity.mapQuery, 'Coliseu, Roma');
  assert.equal(activity.category, 'atracao');
  assert.deepEqual(activity.openingHours, ['09:00-19:00']);
});

test('o que a IA mandou e o schema não modela sobrevive, sem atropelar coluna', () => {
  const [day] = itineraryFromRows([
    dayRow(1, [activityRow(1, { extra: { tipoDeIngresso: 'timed', title: 'antigo' } })]),
  ]);

  assert.equal(day.activities[0].tipoDeIngresso, 'timed');
  // `extra` nunca sobrescreve um campo que tem coluna.
  assert.equal(day.activities[0].title, 'antigo');
});

test('sem roteiro normalizado, a resposta é null — o sinal de "leia o plan_data"', () => {
  // Viagem antiga, ainda sem linha em trip_days, continua aparecendo pelo jsonb.
  assert.equal(itineraryFromRows([]), null);
  assert.equal(itineraryFromRows(null), null);
  assert.equal(itineraryFromRows(undefined), null);
});

test('o caminho de volta numera dia e parada quando o roteiro não numerou', () => {
  const payload = itineraryToRowsPayload({
    days: [
      { activities: [{ title: 'A' }, { title: 'B' }] },
      { day: 7, activities: [] },
    ],
  });

  assert.deepEqual(payload.map((day) => day.day), [1, 7]);
  assert.deepEqual(payload[0].activities.map((activity) => activity.order), [1, 2]);
  // A RPC recusa qualquer coisa que não seja array.
  assert.deepEqual(itineraryToRowsPayload(null), []);
  assert.deepEqual(itineraryToRowsPayload({ days: 'nada disso' }), []);
});

// ── O que o app manda para o banco ───────────────────────────────────────────

test('salvar não transfere a viagem para quem editou', () => {
  // `user_id` é o dono denormalizado. Mandá-lo num UPDATE faria um editor
  // convidado virar dono só por salvar — e a policy deixaria passar, porque ela
  // pergunta se a pessoa pode EDITAR, não de quem é a viagem.
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  assert.match(service, /\.insert\(\{ \.\.\.payload, user_id: user\.id \}\)/);
  assert.doesNotMatch(service, /const payload = \{\s*\n\s*user_id/);
  assert.match(service, /\.update\(payload\)\.eq\('id', planId\)/);
});

test('uma viagem do servidor nunca cai para o localStorage', () => {
  // Uma cópia local de viagem compartilhada não teria como sincronizar: as
  // edições dos outros sumiriam da tela de quem caiu no fallback, e as dele
  // nunca chegariam a eles.
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  assert.match(service, /const isRemotePlan = Boolean\(planId\) && !planId\.startsWith\('local-'\)/);
  assert.match(service, /if \(isRemotePlan\) \{[\s\S]{0,200}success: false/);
});

test('a lista de viagens deixou de ser filtrada por dono', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  // Filtrar por dono esconderia as viagens compartilhadas comigo; quem recorta a
  // lista agora é a policy "Members read trips".
  assert.doesNotMatch(service, /from\('travel_plans'\)\s*\n?\s*\.select\([^)]*\)\s*\n?\s*\.eq\('user_id'/);
  assert.match(service, /\.eq\('trip_members\.user_id', user\.id\)/);
  // E a flag do globo agora vem da minha linha de participante.
  assert.match(service, /is_active_on_map: Boolean\(membership\?\.is_active_on_map\)/);
});

// ── A regressão que esvaziou "Minhas viagens" ────────────────────────────────

test('existe UMA relação entre trip_activities e trip_days, não duas', () => {
  // O BUG QUE ISTO PEGA: a Fase 0 declarou a mesma ligação duas vezes — a FK
  // inline em `day_id` e a composta (day_id, trip_id). Para o Postgres são dois
  // relacionamentos válidos; para o PostgREST é ambiguidade, e ele recusa a
  // consulta inteira com PGRST201 em vez de escolher um. A tela de roteiros
  // salvos, que trata erro como "nenhum roteiro", ficou vazia para todo mundo.
  const fix = migration('20260916120000_fix_trip_activities_duplicate_fk.sql');

  // A composta fica (é ela que amarra a atividade ao dia da MESMA viagem)...
  assert.match(
    ITINERARY,
    /foreign key \(day_id, trip_id\) references public\.trip_days \(id, trip_id\)/
  );
  // ...e a redundante sai.
  assert.match(fix, /drop constraint if exists trip_activities_day_id_fkey/);

  // O cache de relacionamentos do PostgREST precisa ser avisado, senão ele
  // continua recusando a consulta depois do fix.
  assert.match(fix, /notify pgrst, 'reload schema'/);
});

test('lista vazia nunca pode ser o disfarce de uma consulta que falhou', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  // Consulta rica falhou: tenta a pobre, que depende só da RLS.
  assert.match(service, /if \(error\) \{[\s\S]{0,400}\.select\('\*'\)/);
  // Falhou das duas formas: é erro na tela, não um vazio que mente.
  assert.match(service, /if \(!remoteRecords\) \{[\s\S]{0,200}success: false/);
});
