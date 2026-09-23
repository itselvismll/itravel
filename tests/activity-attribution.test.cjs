// "Editado por X" no roteiro, e o salvamento vazio que não é edição.
//
// POR QUE ISTO MERECE TESTE
//
// O bug que abriu esta frente: a Vero abriu o editor, não mudou nada, e os
// outros participantes receberam "Vero editou a viagem". A causa estava no banco
// (`sync_trip_itinerary` regravava toda parada a cada salvamento), e a tag
// "editado por" sairia da MESMA coluna que o bug sujava. Então os testes cobram
// as duas pontas: a regra da tag no app, e as amarras da migração que fazem
// "editou" significar que o conteúdo mudou.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const { activityEditTag } = loadEsm('src/utils/activityAttribution.js');
const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const { backToTopThreshold } = planDayStrip;
const { itineraryFromRows } = loadEsm('src/utils/tripItinerary.js', {
  '../components/map/planDayStrip': planDayStrip,
});

const DONO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VERO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const members = [
  { id: DONO, role: 'owner', profile: { username: 'elvis', display_name: 'Elvis Lima' } },
  { id: VERO, role: 'editor', profile: { username: 'vero', display_name: 'Verônica Souza' } },
];

// ---------------------------------------------------------------------------
// A TAG
// ---------------------------------------------------------------------------

test('parada nunca editada não tem tag', () => {
  assert.equal(activityEditTag({ createdBy: DONO }, members, DONO), null);
  assert.equal(activityEditTag({}, members, DONO), null);
});

test('em viagem compartilhada, quem edita a própria parada TAMBÉM ganha tag', () => {
  // O caso de 23/09: o organizador editou uma parada gerada na conta dele, os
  // outros receberam o aviso, e a tag não aparecia para ninguém — a primeira
  // versão só mostrava edição de outra pessoa.
  assert.equal(activityEditTag({ createdBy: DONO, lastEditedBy: DONO }, members, DONO).label, 'editado por você');
  assert.equal(activityEditTag({ createdBy: DONO, lastEditedBy: DONO }, members, VERO).label, 'editado por Elvis');
});

test('viagem de uma pessoa só não tem tag', () => {
  assert.equal(activityEditTag({ createdBy: DONO, lastEditedBy: DONO }, [members[0]], DONO), null);
});

test('convite pendente não conta como participante', () => {
  const comPendente = [members[0], { ...members[1], status: 'pending' }];
  assert.equal(activityEditTag({ lastEditedBy: DONO }, comPendente, DONO), null);
  const aceito = [{ ...members[0], status: 'accepted' }, { ...members[1], status: 'accepted' }];
  assert.equal(activityEditTag({ lastEditedBy: DONO }, aceito, DONO).label, 'editado por você');
});

test('edição de outra pessoa mostra o primeiro nome dela', () => {
  const tag = activityEditTag(
    { createdBy: DONO, lastEditedBy: VERO, lastEditedAt: '2026-09-23T10:00:00Z' },
    members,
    DONO
  );
  assert.equal(tag.label, 'editado por Verônica');
  assert.equal(tag.person.id, VERO);
  assert.equal(tag.editedAt, '2026-09-23T10:00:00Z');
});

test('para quem editou, a tag diz "você"', () => {
  const tag = activityEditTag({ createdBy: DONO, lastEditedBy: VERO }, members, VERO);
  assert.equal(tag.label, 'editado por você');
});

test('o papel vai junto, para o avatar do organizador sair com a cor dele', () => {
  const tag = activityEditTag({ createdBy: VERO, lastEditedBy: DONO }, members, VERO);
  assert.equal(tag.person.role, 'owner');
});

test('sem nome de exibição, vale o username', () => {
  const semNome = [members[0], { id: VERO, role: 'editor', profile: { username: 'vero', display_name: '' } }];
  assert.equal(activityEditTag({ createdBy: DONO, lastEditedBy: VERO }, semNome, DONO).label, 'editado por vero');
});

test('quem editou e saiu da viagem não vira "editado por alguém"', () => {
  const outro = { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', role: 'viewer', profile: { username: 'dan' } };
  assert.equal(activityEditTag({ createdBy: DONO, lastEditedBy: VERO }, [members[0], outro], DONO), null);
});

test('a autoria chega do banco até a parada', () => {
  const [dia] = itineraryFromRows([{
    id: '11111111-1111-1111-1111-111111111111',
    day_number: 1,
    trip_activities: [{
      id: '22222222-2222-2222-2222-222222222222',
      position: 1,
      title: 'Coliseu',
      created_by: DONO,
      last_edited_by: VERO,
      last_edited_at: '2026-09-23T10:00:00Z',
      // Um `extra` antigo com autoria não pode falsificar a do banco.
      extra: { createdBy: VERO },
    }],
  }]);
  const [parada] = dia.activities;
  assert.equal(parada.createdBy, DONO);
  assert.equal(parada.lastEditedBy, VERO);
  assert.equal(parada.lastEditedAt, '2026-09-23T10:00:00Z');
});

test('o serviço pede as colunas de autoria na leitura', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');
  assert.match(service, /last_edited_at, created_by/);
});

// ---------------------------------------------------------------------------
// VOLTAR AO TOPO
// ---------------------------------------------------------------------------

test('o botão aparece quando o terceiro dia chega ao topo', () => {
  const offsets = { 1: 800, 2: 1500, 3: 2300, 4: 3100 };
  assert.equal(backToTopThreshold(offsets, [1, 2, 3, 4]), 2300);
});

test('as chaves das posições chegam como string', () => {
  assert.equal(backToTopThreshold({ 1: 800, 2: 1500, 3: 2300 }, [1, 2, 3]), 2300);
  assert.equal(backToTopThreshold({ '1': 800, '2': 1500, '3': 2300 }, [1, 2, 3]), 2300);
});

test('roteiro curto usa o último dia que existe', () => {
  assert.equal(backToTopThreshold({ 1: 800, 2: 1500 }, [1, 2]), 1500);
});

test('sem medida nenhuma, uma altura fixa — e nunca "sempre visível"', () => {
  assert.equal(backToTopThreshold({}, [1, 2, 3]), 1400);
  assert.equal(backToTopThreshold(null, []), 1400);
  // Posição 0 é medida que não aconteceu, não "o dia 3 está no topo".
  assert.equal(backToTopThreshold({ 3: 0 }, [1, 2, 3]), 1400);
});

// ---------------------------------------------------------------------------
// AS AMARRAS NO BANCO
// ---------------------------------------------------------------------------

const MIGRATION = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260923120000_trip_activity_authorship_and_noop_saves.sql'),
  'utf8'
);
const semComentarios = MIGRATION
  .split(/\r?\n/)
  .filter((linha) => !/^\s*--/.test(linha))
  .join('\n');

test('update idêntico é descartado antes de qualquer outro trigger', () => {
  // Triggers do mesmo momento disparam em ordem alfabética. O skip precisa vir
  // antes do stamp e do touch — se o touch rodasse antes, updated_at mudaria e a
  // linha nunca mais seria "idêntica".
  for (const tabela of ['trip_activities', 'trip_days']) {
    const nome = `skip_unchanged_${tabela}`;
    assert.match(semComentarios, new RegExp(`create trigger ${nome}\\s+before update on public\\.${tabela}`));
    assert.match(semComentarios, new RegExp(`${nome}[\\s\\S]*?suppress_redundant_updates_trigger\\(\\)`));
    assert.ok(nome < `stamp_${tabela}_editor` && nome < `touch_${tabela}_updated_at`);
  }
});

test('"mudou algo?" é decidido num lugar só, pelo carimbo e pelo log', () => {
  const usos = semComentarios.match(/public\.trip_activity_content_changed\(old, new\)/g) || [];
  // Um no stamp_trip_activity_authorship, um no log_trip_activity_edit.
  assert.equal(usos.length, 2);
  assert.match(semComentarios, /create or replace function public\.stamp_trip_activity_authorship[\s\S]*?trip_activity_content_changed\(old, new\)/);
  assert.match(semComentarios, /create or replace function public\.log_trip_activity_edit[\s\S]*?trip_activity_content_changed\(old, new\)/);
});

test('posição e dia não contam como editar a parada', () => {
  const funcao = semComentarios.match(
    /create or replace function public\.trip_activity_content_changed[\s\S]*?\$\$;/
  )[0];
  assert.doesNotMatch(funcao, /\.position\b/);
  assert.doesNotMatch(funcao, /\.day_id\b/);
  assert.doesNotMatch(funcao, /\.updated_at\b/);
  assert.match(funcao, /\.title\b/);
});

test('a autoria é do servidor: o que o cliente manda é descartado', () => {
  const stamp = semComentarios.match(
    /create or replace function public\.stamp_trip_activity_authorship[\s\S]*?\$\$;/
  )[0];
  assert.match(stamp, /new\.created_by := auth\.uid\(\)/);
  assert.match(stamp, /new\.created_by := old\.created_by/);
  assert.match(stamp, /new\.last_edited_by := auth\.uid\(\)/);
  assert.match(stamp, /new\.last_edited_by := old\.last_edited_by/);
});

test('o sync não transforma custo e indoor ausentes em 0 e false', () => {
  // O app lê ausente como 0/false; gravar isso de volta fazia a linha MUDAR a
  // cada salvamento, e o skip de update idêntico nunca pegaria.
  assert.match(semComentarios, /when estimated_cost is null and \(atividade ->> 'estimatedCost'\)::numeric = 0 then null/);
  assert.match(semComentarios, /when indoor is null and not \(atividade ->> 'indoor'\)::boolean then null/);
});

test('o backfill não mexe em updated_at', () => {
  // Com o touch ligado, toda viagem aberta tomaria conflito em todas as paradas
  // no próximo salvamento.
  const desliga = semComentarios.indexOf('alter table public.trip_activities disable trigger user');
  const backfill = semComentarios.indexOf('update public.trip_activities a');
  const religa = semComentarios.indexOf('alter table public.trip_activities enable trigger user');
  assert.ok(desliga > -1 && desliga < backfill && backfill < religa);
});

// ---------------------------------------------------------------------------
// "APLICAR" GRAVA
// ---------------------------------------------------------------------------

test('o "Aplicar" da parada grava no banco, não só na tela', () => {
  // O relato de 23/09: "Aplicar" só mudava a tela, gravar exigia descer até
  // "Atualizar roteiro" no fim de 21 dias, e as edições sumiam — sem tag e sem
  // aviso, porque nada chegava ao banco.
  const tela = fs.readFileSync(path.join(root, 'src/screens/assistant/AssistantResultScreen.js'), 'utf8');
  const aplicar = tela.match(/const saveActivityEdit = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(aplicar, 'saveActivityEdit precisa ser assíncrono: ele grava');
  assert.match(aplicar[0], /await handleSave\(nextPlan/);
  // O botão de baixo não pode passar o evento de toque como se fosse o roteiro.
  assert.doesNotMatch(tela, /onPress=\{handleSave\}/);
});
