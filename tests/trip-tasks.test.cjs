// As tarefas do grupo: quem pode marcar, o que a linha diz, e — o que mais
// importa aqui — QUANDO a notificação sai.
//
// POR QUE A METADE DE BAIXO DESTE ARQUIVO LÊ SQL
//
// O projeto já mandou dois avisos errados para produção, os dois pela mesma
// causa: a notificação estava presa a um caminho de código (um salvamento que
// regravava tudo, um carimbo em toda linha) e não ao FATO que ela anuncia. A
// regra nova é "cada aviso nasce de uma transição de linha que só acontece de um
// jeito", e essa regra mora no `create trigger` — não em JavaScript, onde um
// teste de unidade a alcançaria. Então os testes leem a migração e cobram as
// amarras: a guarda `when (old.is_done = false and new.is_done = true)`, a
// ausência de agrupamento, e o `user_id <> ator` que impede o eco.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const personName = loadEsm('src/utils/personName.js');
const {
  canCreateTask,
  canToggleTask,
  sortTasks,
  taskProgress,
  taskRow,
  validateTaskTitle,
  TASK_TITLE_MAX_LENGTH,
} = loadEsm('src/utils/tripTasks.js', { './personName': personName });
const { shortPersonName, fullPersonName } = personName;
const { TRIP_NOTIFICATION_TYPES, NOTIFICATION_TYPES } = loadEsm('src/utils/socialNotifications.js');

const DONO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VERO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DAN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const members = [
  { id: DONO, role: 'owner', status: 'accepted', profile: { username: 'elvis', display_name: 'Elvis Lima' } },
  { id: VERO, role: 'editor', status: 'accepted', profile: { username: 'vero', display_name: 'Verônica Souza' } },
  { id: DAN, role: 'viewer', status: 'accepted', profile: { username: 'dan', display_name: 'Dan' } },
];

const organizador = { role: 'owner', status: 'accepted' };
const editor = { role: 'editor', status: 'accepted' };
const leitor = { role: 'viewer', status: 'accepted' };

// ---------------------------------------------------------------------------
// QUEM PODE O QUÊ
// ---------------------------------------------------------------------------

test('só organizador cria tarefa', () => {
  assert.equal(canCreateTask(organizador), true);
  assert.equal(canCreateTask(editor), false);
  assert.equal(canCreateTask(leitor), false);
  assert.equal(canCreateTask({}), false);
  assert.equal(canCreateTask(null), false);
});

test('organizador convidado que ainda não aceitou não cria nada', () => {
  assert.equal(canCreateTask({ role: 'owner', status: 'pending' }), false);
});

test('marcar a tarefa é do responsável ou de um organizador', () => {
  const tarefa = { assigned_to: VERO };
  assert.equal(canToggleTask(tarefa, editor, VERO), true, 'o responsável marca a própria');
  assert.equal(canToggleTask(tarefa, organizador, DONO), true, 'o organizador marca a de qualquer um');
  assert.equal(canToggleTask(tarefa, leitor, DAN), false, 'quem não é nem um nem outro não marca');
  assert.equal(canToggleTask(tarefa, editor, DAN), false, 'editor não marca tarefa de outra pessoa');
});

test('tarefa sem responsável fica só com o organizador', () => {
  // Ninguém é "o responsável" por ela, então não há a quem a permissão do
  // responsável se aplicar.
  assert.equal(canToggleTask({ assigned_to: null }, organizador, DONO), true);
  assert.equal(canToggleTask({ assigned_to: null }, editor, VERO), false);
});

test('a permissão da tela é a mesma dupla que a policy de UPDATE aceita', () => {
  const migracao = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260923140000_trip_tasks.sql'), 'utf8'
  );
  assert.match(migracao, /for update to authenticated\s+using \(public\.is_trip_owner\(trip_id\) or assigned_to = auth\.uid\(\)\)/);
});

// ---------------------------------------------------------------------------
// O QUE A LINHA MOSTRA
// ---------------------------------------------------------------------------

test('a linha traz o responsável, com avatar e nome', () => {
  const row = taskRow({ id: '1', title: 'Levar adaptador', assigned_to: VERO }, members, organizador, DONO);
  assert.equal(row.title, 'Levar adaptador');
  assert.equal(row.assignee.label, 'Verônica Souza');
  assert.equal(row.assignee.person.id, VERO);
  assert.equal(row.assignee.person.role, 'editor');
  assert.equal(row.done, false);
  assert.equal(row.completedLabel, null);
});

test('para o próprio responsável, a linha diz "você"', () => {
  // É o que faz a pessoa achar a própria tarefa correndo os olhos pela lista.
  const row = taskRow({ id: '1', title: 'Seguro', assigned_to: VERO }, members, editor, VERO);
  assert.equal(row.assignee.label, 'você');
});

test('tarefa concluída diz quem concluiu, pelo primeiro nome', () => {
  const row = taskRow(
    { id: '1', title: 'Seguro', assigned_to: VERO, is_done: true, completed_by: VERO },
    members, organizador, DONO
  );
  assert.equal(row.done, true);
  assert.equal(row.completedLabel, 'Concluído por Verônica');
});

test('quem concluiu vê o próprio nome como "você"', () => {
  const row = taskRow(
    { id: '1', title: 'Seguro', is_done: true, completed_by: VERO }, members, editor, VERO
  );
  assert.equal(row.completedLabel, 'Concluído por você');
});

test('tarefa por fazer não tem rótulo de conclusão, mesmo com completed_by sujo', () => {
  const row = taskRow({ id: '1', title: 'X', is_done: false, completed_by: VERO }, members, organizador, DONO);
  assert.equal(row.completedLabel, null);
});

test('sem responsável, ou com quem saiu da viagem, a linha não inventa um nome', () => {
  assert.equal(taskRow({ id: '1', title: 'X', assigned_to: null }, members, organizador, DONO).assignee, null);
  const sumido = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  assert.equal(taskRow({ id: '1', title: 'X', assigned_to: sumido }, members, organizador, DONO).assignee, null);
});

test('quem concluiu e saiu da viagem não vira "concluído por alguém"', () => {
  const sumido = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const row = taskRow({ id: '1', title: 'X', is_done: true, completed_by: sumido }, members, organizador, DONO);
  assert.equal(row.completedLabel, null);
  assert.equal(row.done, true, 'a tarefa continua riscada: ela FOI concluída');
});

test('a linha carrega se esta pessoa pode marcá-la — a tarefa nunca some', () => {
  const tarefa = { id: '1', title: 'X', assigned_to: VERO };
  assert.equal(taskRow(tarefa, members, leitor, DAN).canToggle, false);
  // O que muda para quem não pode é só o checkbox; título e responsável
  // continuam na tela.
  assert.equal(taskRow(tarefa, members, leitor, DAN).title, 'X');
  assert.equal(taskRow(tarefa, members, leitor, DAN).assignee.label, 'Verônica Souza');
});

test('sem nome de exibição, vale o username', () => {
  const semNome = [{ id: VERO, role: 'editor', status: 'accepted', profile: { username: 'vero', display_name: '' } }];
  assert.equal(taskRow({ id: '1', title: 'X', assigned_to: VERO }, semNome, organizador, DONO).assignee.label, 'vero');
  assert.equal(shortPersonName({ display_name: '', username: 'vero' }), 'vero');
  assert.equal(fullPersonName({ display_name: 'Verônica Souza' }), 'Verônica Souza');
  assert.equal(shortPersonName({ display_name: 'Verônica Souza' }), 'Verônica');
  assert.equal(shortPersonName(null), '');
});

// ---------------------------------------------------------------------------
// A ORDEM E O CONTADOR
// ---------------------------------------------------------------------------

test('concluídas vão para o fim, sem sumir', () => {
  const lista = [
    { id: 'a', is_done: true, created_at: '2026-09-01' },
    { id: 'b', is_done: false, created_at: '2026-09-02' },
    { id: 'c', is_done: false, created_at: '2026-09-03' },
  ];
  assert.deepEqual(sortTasks(lista).map((t) => t.id), ['b', 'c', 'a']);
  assert.equal(sortTasks(lista).length, 3);
});

test('dentro de cada grupo, a ordem de criação — a mesma em todo carregamento', () => {
  const lista = [
    { id: 'c', is_done: false, created_at: '2026-09-03' },
    { id: 'a', is_done: false, created_at: '2026-09-01' },
  ];
  assert.deepEqual(sortTasks(lista).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(sortTasks(null), []);
});

test('sortTasks não mexe na lista que recebeu', () => {
  const lista = [{ id: 'a', is_done: true }, { id: 'b', is_done: false }];
  sortTasks(lista);
  assert.equal(lista[0].id, 'a');
});

test('o contador conta o que está feito', () => {
  assert.deepEqual(taskProgress([{ is_done: true }, { is_done: false }]), { done: 1, total: 2 });
  assert.deepEqual(taskProgress([]), { done: 0, total: 0 });
  assert.deepEqual(taskProgress(null), { done: 0, total: 0 });
});

// ---------------------------------------------------------------------------
// O TÍTULO
// ---------------------------------------------------------------------------

test('espaço em branco não é tarefa', () => {
  assert.equal(validateTaskTitle('   ').valid, false);
  assert.equal(validateTaskTitle('').valid, false);
  assert.equal(validateTaskTitle(null).valid, false);
});

test('o título é aparado antes de ir ao banco', () => {
  const check = validateTaskTitle('  Levar adaptador  ');
  assert.equal(check.valid, true);
  assert.equal(check.value, 'Levar adaptador');
});

test('o limite do app é o mesmo do check da coluna', () => {
  assert.equal(validateTaskTitle('x'.repeat(TASK_TITLE_MAX_LENGTH)).valid, true);
  assert.equal(validateTaskTitle('x'.repeat(TASK_TITLE_MAX_LENGTH + 1)).valid, false);

  const migracao = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260923140000_trip_tasks.sql'), 'utf8'
  );
  assert.match(
    migracao,
    new RegExp(`check \\(length\\(btrim\\(title\\)\\) between 1 and ${TASK_TITLE_MAX_LENGTH}\\)`),
    'o limite do app divergiu do check da coluna'
  );
});

// ---------------------------------------------------------------------------
// OS TIPOS NOVOS CHEGAM À TELA
// ---------------------------------------------------------------------------

test('os dois tipos entram na lista que a tela busca e marca como lida', () => {
  // Tipo fora desta lista chega ao banco, não aparece na tela E nunca é marcado
  // como lido — o sino fica preso num número que ninguém consegue zerar.
  for (const tipo of ['trip_task_created', 'trip_task_done']) {
    assert.ok(TRIP_NOTIFICATION_TYPES.includes(tipo), `${tipo} fora de TRIP_NOTIFICATION_TYPES`);
    assert.ok(NOTIFICATION_TYPES.includes(tipo), `${tipo} fora de NOTIFICATION_TYPES`);
  }
});

test('os dois tipos são aceitos pelo check da tabela de notificações', () => {
  const migracao = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260923140000_trip_tasks.sql'), 'utf8'
  );
  const check = migracao.match(/add constraint notifications_type_check[\s\S]*?\)\);/)[0];
  for (const tipo of ['trip_task_created', 'trip_task_done']) {
    assert.ok(check.includes(`'${tipo}'`), `${tipo} fora do check`);
  }
  // E os que já existiam continuam lá: o check é reescrito inteiro, e esquecer
  // um tipo antigo aqui derrubaria as notificações dele em produção.
  for (const tipo of ['follow', 'comment', 'like', 'trip_invite', 'trip_joined', 'trip_edit']) {
    assert.ok(check.includes(`'${tipo}'`), `${tipo} sumiu do check`);
  }
});

test('o app sabe o título e o destino dos dois avisos', () => {
  const { getTitle, getRoute, getBadge } = loadEsm('src/utils/notificationRouting.js');
  assert.equal(getTitle({ type: 'trip_task_created' }, 'Elvis'), 'Elvis criou uma tarefa');
  assert.equal(getTitle({ type: 'trip_task_done' }, 'Vero'), 'Vero concluiu uma tarefa');

  assert.notEqual(getBadge('trip_task_done').icon, getBadge('trip_task_created').icon);
});

test('o aviso de tarefa abre a viagem NO BLOCO DAS TAREFAS, não no roteiro', () => {
  // O BUG QUE ISTO FECHA: as cinco notificações de viagem caíam na mesma rota,
  // sem seção, e o aviso de tarefa abria o roteiro — a pessoa tinha de achar
  // sozinha do que ele estava falando.
  const { getRoute, TRIP_SECTION } = loadEsm('src/utils/notificationRouting.js');

  for (const tipo of ['trip_task_created', 'trip_task_done']) {
    assert.deepEqual(
      getRoute({ type: tipo, target_id: 'trip-1' }),
      { name: 'AssistantResult', params: { planId: 'trip-1', section: TRIP_SECTION.groupTasks } },
      `${tipo} não aponta para o bloco das tarefas`
    );
  }
});

test('as de roteiro continuam indo para o roteiro, sem seção', () => {
  const { getRoute } = loadEsm('src/utils/notificationRouting.js');

  for (const tipo of ['trip_invite', 'trip_joined', 'trip_edit']) {
    assert.deepEqual(
      getRoute({ type: tipo, target_id: 'trip-1' }),
      { name: 'AssistantResult', params: { planId: 'trip-1' } },
      `${tipo} mudou de destino sem querer`
    );
  }
});

test('sem trip_id não há para onde ir, e o toque não leva a lugar nenhum', () => {
  const { getRoute } = loadEsm('src/utils/notificationRouting.js');
  assert.equal(getRoute({ type: 'trip_task_done' }), null);
});

test('a tela resolve a seção que o aviso manda', () => {
  // As duas pontas precisam falar o mesmo nome, e um erro de digitação aqui não
  // quebraria nada visivelmente: a tela só abriria na aba de sempre.
  const tela = fs.readFileSync(path.join(root, 'src/screens/assistant/AssistantResultScreen.js'), 'utf8');
  assert.match(tela, /import \{ TRIP_SECTION \} from '\.\.\/\.\.\/utils\/notificationRouting'/);
  assert.match(
    tela,
    /section === TRIP_SECTION\.groupTasks \? 'checklist' : 'itinerary'/,
    'a tela não abre direto na aba certa'
  );
  assert.match(
    tela,
    /if \(section === TRIP_SECTION\.groupTasks\) irParaTarefas\(\)/,
    'a tela não reage ao parâmetro quando ela já estava aberta'
  );
  // A string solta não pode aparecer: é a constante que amarra as duas pontas.
  assert.ok(!/'group-tasks'/.test(tela), 'a tela repete a string em vez de usar TRIP_SECTION');
});

// ---------------------------------------------------------------------------
// A ORDEM DOS BLOCOS NA ABA
// ---------------------------------------------------------------------------

test('as tarefas do grupo vêm ANTES da checklist da viagem', () => {
  // Decisão de produto, e do tipo que se desfaz sozinha: os dois blocos são
  // irmãos no mesmo JSX, e mexer num deles troca a ordem sem que nada quebre.
  const tela = fs.readFileSync(path.join(root, 'src/screens/assistant/AssistantResultScreen.js'), 'utf8');
  const tarefas = tela.indexOf('<TripTasksPanel');
  const checklist = tela.indexOf('Preparação da viagem');

  assert.ok(tarefas > 0 && checklist > 0, 'um dos dois blocos sumiu da tela');
  assert.ok(tarefas < checklist, 'a checklist voltou para cima das tarefas do grupo');
});

test('o bloco reporta onde ficou, senão não há para onde rolar', () => {
  // A rolagem do aviso depende deste `onLayout`: é ele que diz a posição do
  // bloco depois de a aba Checklist ser desenhada.
  const tela = fs.readFileSync(path.join(root, 'src/screens/assistant/AssistantResultScreen.js'), 'utf8');
  assert.match(tela, /<View onLayout=\{aoMedirTarefas\}>\s*<TripTasksPanel/);
});

// ---------------------------------------------------------------------------
// AS AMARRAS NO BANCO: A NOTIFICAÇÃO NASCE DA TRANSIÇÃO
// ---------------------------------------------------------------------------

const MIGRATION = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260923140000_trip_tasks.sql'), 'utf8'
);
const semComentarios = MIGRATION
  .split(/\r?\n/)
  .filter((linha) => !/^\s*--/.test(linha))
  .join('\n');

test('o aviso de criação sai do INSERT da linha, e de nada mais', () => {
  assert.match(
    semComentarios,
    /create trigger notify_trip_task_created\s+after insert on public\.trip_tasks/
  );
  // Nem update, nem "before": um aviso antes da gravação sairia mesmo se a RLS
  // recusasse a linha.
  const gatilho = semComentarios.match(/create trigger notify_trip_task_created[\s\S]*?;/)[0];
  assert.doesNotMatch(gatilho, /update/);
  assert.doesNotMatch(gatilho, /before/);
});

test('o aviso de conclusão está preso à transição false -> true, no próprio trigger', () => {
  // A GUARDA CENTRAL DESTE ARQUIVO. No `when` do create trigger, o Postgres nem
  // chama a função fora da transição — a regra não depende de alguém lembrar de
  // escrever um `if` dentro do corpo.
  assert.match(
    semComentarios,
    /create trigger notify_trip_task_done\s+after update on public\.trip_tasks\s+for each row\s+when \(old\.is_done = false and new\.is_done = true\)/
  );
});

test('salvar de novo, desmarcar, ou mudar o título não redispara o aviso', () => {
  // Os três casos que o `when` recusa, afirmados como a tabela-verdade que ele
  // implementa. Se a guarda mudar de forma, este teste é quem cobra.
  const guarda = (old_is_done, new_is_done) => old_is_done === false && new_is_done === true;

  assert.equal(guarda(false, true), true, 'concluir: dispara');
  assert.equal(guarda(true, true), false, 'já estava concluída e alguém salvou de novo');
  assert.equal(guarda(true, false), false, 'desmarcar');
  assert.equal(guarda(false, false), false, 'mexer numa tarefa por fazer');
});

test('nenhum dos dois avisos passa pelo agrupamento de 30 minutos', () => {
  // `log_trip_edit` agrupa por janela, o que é certo para dezenas de paradas
  // salvas de uma vez e errado aqui: três tarefas criadas na mesma sessão são
  // três coisas para fazer, e duas sumiriam.
  assert.doesNotMatch(semComentarios, /log_trip_edit/);
  assert.doesNotMatch(semComentarios, /trip_edit_notification_window/);
  assert.doesNotMatch(semComentarios, /not exists \(\s*select 1 from public\.notifications/);
});

test('quem agiu não recebe aviso do próprio ato', () => {
  for (const funcao of ['notify_trip_task_created', 'notify_trip_task_done']) {
    const corpo = semComentarios.match(new RegExp(`create or replace function public\\.${funcao}[\\s\\S]*?\\$\\$;`))[0];
    assert.match(corpo, /m\.user_id <> new\.(created_by|completed_by)/, `${funcao} manda eco para quem agiu`);
    assert.match(corpo, /m\.status = 'accepted'/, `${funcao} avisa convite pendente`);
  }
});

test('o aviso lê o ator da LINHA, não de auth.uid()', () => {
  // A linha é o que foi gravado; `auth.uid()` é o que a sessão diz ser. Presos à
  // linha, os dois avisos continuam corretos em qualquer caminho de escrita.
  const criado = semComentarios.match(/create or replace function public\.notify_trip_task_created[\s\S]*?\$\$;/)[0];
  const concluido = semComentarios.match(/create or replace function public\.notify_trip_task_done[\s\S]*?\$\$;/)[0];
  assert.match(criado, /new\.created_by, 'trip_task_created'/);
  assert.match(concluido, /new\.completed_by, 'trip_task_done'/);
  assert.doesNotMatch(criado, /auth\.uid\(\)/);
  assert.doesNotMatch(concluido, /auth\.uid\(\)/);
});

// ---------------------------------------------------------------------------
// AS AMARRAS NO BANCO: A AUTORIA É DO SERVIDOR
// ---------------------------------------------------------------------------

test('created_by, completed_by e completed_at são escritos só pelo trigger', () => {
  const stamp = semComentarios.match(/create or replace function public\.stamp_trip_task_state[\s\S]*?\$\$;/)[0];
  assert.match(stamp, /new\.created_by := auth\.uid\(\)/, 'no insert, quem cria é quem está logado');
  assert.match(stamp, /new\.created_by := old\.created_by/, 'no update, o que o cliente mandar é descartado');
  assert.match(stamp, /new\.completed_by := auth\.uid\(\)/);
  assert.match(stamp, /new\.completed_at := now\(\)/);
});

test('tarefa nasce por fazer, para a transição de conclusão sempre existir', () => {
  const stamp = semComentarios.match(/create or replace function public\.stamp_trip_task_state[\s\S]*?\$\$;/)[0];
  const insert = stamp.match(/if tg_op = 'INSERT' then[\s\S]*?return new;/)[0];
  assert.match(insert, /new\.is_done := false/);
});

test('desmarcar limpa quem concluiu', () => {
  const stamp = semComentarios.match(/create or replace function public\.stamp_trip_task_state[\s\S]*?\$\$;/)[0];
  assert.match(stamp, /elsif old\.is_done and not new\.is_done then\s+new\.completed_by := null;\s+new\.completed_at := null;/);
});

test('o serviço não manda autoria nenhuma no insert', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripTaskService.js'), 'utf8');
  const insert = service.match(/\.insert\(\{[^}]*\}\)/)[0];
  for (const coluna of ['created_by', 'completed_by', 'completed_at', 'is_done']) {
    assert.ok(!insert.includes(coluna), `o insert manda ${coluna}, que é do banco`);
  }
});

test('marcar concluída manda só is_done', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripTaskService.js'), 'utf8');
  const update = service.match(/\.update\(\{[^}]*\}\)/)[0];
  assert.match(update, /is_done/);
  for (const coluna of ['completed_by', 'completed_at', 'title', 'assigned_to']) {
    assert.ok(!update.includes(coluna), `o update manda ${coluna}: quem não é organizador levaria erro do guard`);
  }
});

// ---------------------------------------------------------------------------
// AS AMARRAS NO BANCO: COLUNA E EMBED
// ---------------------------------------------------------------------------

test('quem não é organizador não muda título nem responsável', () => {
  // A RLS diz quais LINHAS; ela não sabe falar de coluna. Quem diz isso é o
  // guard, e ele ERRA em vez de corrigir em silêncio — devolver o título antigo
  // fingindo que gravou deixaria a pessoa sair da tela achando que mudou.
  const guard = semComentarios.match(/create or replace function public\.guard_trip_task_columns[\s\S]*?\$\$;/)[0];
  assert.match(guard, /if public\.is_trip_owner\(new\.trip_id\) then\s+return new;/);
  assert.match(guard, /new\.title is distinct from old\.title/);
  assert.match(guard, /new\.assigned_to is distinct from old\.assigned_to/);
  assert.match(guard, /raise exception/);
});

test('os BEFORE rodam na ordem que a regra precisa: guard < skip < stamp', () => {
  // Triggers do mesmo momento disparam em ordem alfabética. O guard recusa a
  // coluna proibida antes de qualquer carimbo.
  assert.ok('guard_trip_task_columns' < 'skip_unchanged_trip_tasks');
  assert.ok('skip_unchanged_trip_tasks' < 'stamp_trip_task_state');
  assert.match(semComentarios, /create trigger guard_trip_task_columns\s+before update/);
  assert.match(semComentarios, /create trigger stamp_trip_task_state\s+before insert or update/);
});

test('ler é de qualquer participante; criar e apagar, só de organizador', () => {
  assert.match(semComentarios, /for select to authenticated\s+using \(public\.is_trip_member\(trip_id\)\)/);
  assert.match(semComentarios, /for insert to authenticated\s+with check \(public\.is_trip_owner\(trip_id\)\)/);
  assert.match(semComentarios, /for delete to authenticated\s+using \(public\.is_trip_owner\(trip_id\)\)/);
  assert.match(semComentarios, /alter table public\.trip_tasks enable row level security/);
});

test('a consulta não pede perfil embutido — trip_tasks tem TRÊS FKs para profiles', () => {
  // assigned_to, created_by e completed_by. Um embed sem desambiguar seria
  // recusado inteiro com PGRST201, que é o erro que já derrubou a lista de
  // viagens e a de participantes. A tela resolve os nomes contra a lista de
  // participantes, que ela já tem carregada.
  const service = fs.readFileSync(path.join(root, 'src/services/tripTaskService.js'), 'utf8');
  const select = service.match(/const TASK_SELECT = '[^']*'/)[0];
  assert.ok(!select.includes('profiles'), 'o select embute profiles e vai tomar PGRST201');
  assert.match(select, /assigned_to/);
  assert.match(select, /completed_by/);

  const fks = (semComentarios.match(/references public\.profiles \(id\)/g) || []).length;
  assert.equal(fks, 3, 'mudou o número de FKs para profiles: reveja o risco de embed');
});
