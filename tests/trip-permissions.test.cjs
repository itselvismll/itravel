// Quem pode o quê na viagem compartilhada, e o link de convite.
//
// Os dois módulos são puros de propósito: a regra de permissão espalhada em `if`
// por tela divergiu em algum lugar, e divergência aqui aparece como botão que
// falha na mão do usuário. Com a regra numa tabela, o teste consegue varrer a
// matriz inteira — os três papéis contra todas as ações — em vez de conferir
// caso por caso conforme alguém lembra.
//
// O QUE ESTES TESTES NÃO SÃO: seguranca. Quem recusa a escrita de um viewer é a
// RLS do Postgres (`can_edit_trip`). Isto cobre a HONESTIDADE DA INTERFACE — que
// a tela não ofereça o que o banco vai recusar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const permissions = loadEsm('src/utils/tripPermissions.js');
const inviteLink = loadEsm('src/utils/inviteLink.js');

const {
  can,
  canLeaveTrip,
  countOwners,
  memberRole,
  tripAbilities,
  ROLE_LABEL,
  TRIP_ROLES,
} = permissions;

const aceito = (id, role) => ({ id, role, status: 'accepted' });

// ---------------------------------------------------------------------------
// A MATRIZ
// ---------------------------------------------------------------------------

test('owner pode tudo', () => {
  for (const acao of [
    'view', 'editItinerary', 'editChecklist', 'editBudget',
    'invite', 'removeMember', 'changeRole', 'deleteTrip', 'toggleOnMap',
  ]) {
    assert.equal(can('owner', acao), true, `owner deveria poder ${acao}`);
  }
});

test('editor edita o roteiro, mas NAO mexe em gente', () => {
  for (const acao of ['view', 'editItinerary', 'editChecklist', 'editBudget', 'toggleOnMap']) {
    assert.equal(can('editor', acao), true, `editor deveria poder ${acao}`);
  }
  // A regra de produto: editor e viewer nao convidam.
  for (const acao of ['invite', 'removeMember', 'changeRole', 'deleteTrip']) {
    assert.equal(can('editor', acao), false, `editor NAO deveria poder ${acao}`);
  }
});

test('viewer so le', () => {
  assert.equal(can('viewer', 'view'), true);
  for (const acao of [
    'editItinerary', 'editChecklist', 'editBudget',
    'invite', 'removeMember', 'changeRole', 'deleteTrip',
  ]) {
    assert.equal(can('viewer', acao), false, `viewer NAO deveria poder ${acao}`);
  }
});

test('QUALQUER papel aplica a viagem no proprio globo', () => {
  // A regra 2 final do pedido: aplicar no mapa e acao individual, nao permissao
  // sobre a viagem. A Fase 0 moveu esse estado para a linha do participante.
  for (const papel of TRIP_ROLES) {
    assert.equal(can(papel, 'toggleOnMap'), true, `${papel} deveria poder aplicar no globo`);
  }
});

test('papel desconhecido nao pode nada', () => {
  // O lado seguro do erro: esconder um botao e incomodo, mostrar um que falha e
  // um erro na cara do usuario.
  for (const papel of [null, undefined, '', 'admin', 'OWNER', 42]) {
    assert.equal(can(papel, 'editItinerary'), false, `${papel} nao deveria editar`);
    assert.equal(can(papel, 'invite'), false, `${papel} nao deveria convidar`);
  }
});

test('acao desconhecida nao e permitida por omissao', () => {
  // Se alguem escrever `can(role, 'excluirTudo')` com erro de digitacao, a
  // resposta e nao — e nao um `undefined` que o JSX trata como falso por sorte.
  assert.equal(can('owner', 'excluirTudo'), false);
  assert.equal(can('owner', undefined), false);
});

test('convite PENDENTE enxerga e aplica no globo, e nada mais', () => {
  // Um convidado que ainda nao respondeu precisa VER a viagem para decidir. Mas
  // `can_edit_trip` exige status 'accepted', entao oferecer edicao a ele seria
  // oferecer um botao que a RLS recusa.
  const pendente = { status: 'pending' };

  assert.equal(can('editor', 'view', pendente), true);
  assert.equal(can('editor', 'toggleOnMap', pendente), true);
  assert.equal(can('editor', 'editItinerary', pendente), false);
  assert.equal(can('owner', 'invite', pendente), false);
  assert.equal(can('owner', 'editItinerary', pendente), false);
});

test('cada papel tem nome de tela', () => {
  for (const papel of TRIP_ROLES) {
    assert.ok(ROLE_LABEL[papel], `${papel} precisa de rotulo`);
  }
});

// ---------------------------------------------------------------------------
// A TRAVA DO ULTIMO ORGANIZADOR
// ---------------------------------------------------------------------------

test('o unico organizador NAO sai da viagem, e sabe por que', () => {
  // Sem esta trava, a viagem fica viva e ninguem pode editar nem excluir:
  // invisivel para o app e impossivel de limpar. O banco recusa (trigger
  // prevent_last_trip_owner_removal); aqui a pessoa descobre antes de tentar.
  const membros = [aceito('a', 'owner'), aceito('b', 'editor'), aceito('c', 'viewer')];

  const resultado = canLeaveTrip(membros, 'a');
  assert.equal(resultado.allowed, false);
  assert.match(resultado.reason, /organizador/i);
  // A mensagem precisa dizer O QUE FAZER, nao so que nao pode.
  assert.match(resultado.reason, /promova/i);
});

test('com dois organizadores, qualquer um dos dois sai', () => {
  const membros = [aceito('a', 'owner'), aceito('b', 'owner'), aceito('c', 'viewer')];
  assert.equal(canLeaveTrip(membros, 'a').allowed, true);
  assert.equal(canLeaveTrip(membros, 'b').allowed, true);
});

test('editor e viewer saem sempre', () => {
  const membros = [aceito('a', 'owner'), aceito('b', 'editor'), aceito('c', 'viewer')];
  assert.equal(canLeaveTrip(membros, 'b').allowed, true);
  assert.equal(canLeaveTrip(membros, 'c').allowed, true);
});

test('organizador PENDENTE nao conta como organizador da viagem', () => {
  // Um dono com convite pendente nao consegue administrar nada, entao ele nao
  // pode ser a razao de o dono aceitado conseguir sair — a viagem ficaria sem
  // ninguem no comando. O banco conta igual: `status = 'accepted'`.
  const membros = [aceito('a', 'owner'), { id: 'b', role: 'owner', status: 'pending' }];

  assert.equal(countOwners(membros), 1);
  assert.equal(canLeaveTrip(membros, 'a').allowed, false);
});

test('quem nao participa nao sai', () => {
  assert.equal(canLeaveTrip([aceito('a', 'owner')], 'z').allowed, false);
  assert.equal(canLeaveTrip([], 'a').allowed, false);
  assert.equal(canLeaveTrip(null, 'a').allowed, false);
});

test('countOwners ignora lista vazia e papel errado', () => {
  assert.equal(countOwners([]), 0);
  assert.equal(countOwners(null), 0);
  assert.equal(countOwners([aceito('a', 'editor'), aceito('b', 'viewer')]), 0);
});

// ---------------------------------------------------------------------------
// O ATALHO QUE A TELA USA
// ---------------------------------------------------------------------------

test('memberRole acha o papel de quem esta olhando', () => {
  const membros = [aceito('a', 'owner'), aceito('b', 'viewer')];
  assert.deepEqual(memberRole(membros, 'b'), { role: 'viewer', status: 'accepted' });
  assert.deepEqual(memberRole(membros, 'z'), { role: null, status: null });
  assert.deepEqual(memberRole(null, 'a'), { role: null, status: null });
});

test('tripAbilities responde tudo de uma vez, por papel', () => {
  const membros = [aceito('a', 'owner'), aceito('b', 'editor'), aceito('c', 'viewer')];

  const dono = tripAbilities(membros, 'a');
  assert.equal(dono.canEdit, true);
  assert.equal(dono.canInvite, true);
  assert.equal(dono.canManageMembers, true);
  assert.equal(dono.canDeleteTrip, true);
  assert.equal(dono.leave.allowed, false, 'unico organizador nao sai');

  const editor = tripAbilities(membros, 'b');
  assert.equal(editor.canEdit, true);
  assert.equal(editor.canInvite, false);
  assert.equal(editor.canManageMembers, false);
  assert.equal(editor.canDeleteTrip, false);
  assert.equal(editor.leave.allowed, true);

  const viewer = tripAbilities(membros, 'c');
  assert.equal(viewer.canEdit, false);
  assert.equal(viewer.canEditChecklist, false);
  assert.equal(viewer.canEditBudget, false);
  assert.equal(viewer.canInvite, false);
  // Mesmo so lendo, ele aplica a viagem no globo dele.
  assert.equal(viewer.canToggleOnMap, true);
});

test('quem nao participa nao recebe habilidade nenhuma', () => {
  const nada = tripAbilities([aceito('a', 'owner')], 'z');
  assert.equal(nada.role, null);
  assert.equal(nada.canEdit, false);
  assert.equal(nada.canInvite, false);
  assert.equal(nada.canToggleOnMap, false);
  assert.equal(nada.leave.allowed, false);
});

// ---------------------------------------------------------------------------
// O LINK DE CONVITE
// ---------------------------------------------------------------------------

const { buildInviteUrl, buildInviteShare, parseInviteLink, isValidInviteToken } = inviteLink;

const TOKEN = 'a'.repeat(32);

test('o link compartilhado e https, com o token no caminho', () => {
  // https e nao `journi://`: um scheme customizado colado numa conversa e texto
  // morto para quem nao tem o app. E o token vai no CAMINHO porque query string
  // se perde em redirecionamento e pre-visualizacao — e o token e a credencial.
  assert.equal(buildInviteUrl(TOKEN), `https://journi.expo.app/trip-invite/${TOKEN}`);
  assert.doesNotMatch(buildInviteUrl(TOKEN), /\?/);
});

test('token invalido nao gera link', () => {
  // Evita um link bonito e inutil circulando por ai.
  for (const ruim of [null, undefined, '', 'abc', 'x'.repeat(32), `${TOKEN}0`, 42]) {
    assert.equal(buildInviteUrl(ruim), null, `${ruim} nao deveria gerar link`);
  }
});

test('a barra sobrando na origem nao vira barra dupla', () => {
  assert.equal(
    buildInviteUrl(TOKEN, { origin: 'https://journi.expo.app/' }),
    `https://journi.expo.app/trip-invite/${TOKEN}`
  );
});

test('a mensagem de compartilhar diz a viagem E que precisa de conta', () => {
  // Quem recebe sem esse aviso abre o link, cai numa tela de login e nao entende
  // por que — a regra de produto e que sem conta nao participa.
  const share = buildInviteShare({ tripTitle: 'Itália em outubro', token: TOKEN });
  assert.match(share.message, /Itália em outubro/);
  assert.match(share.message, /conta/i);
  assert.ok(share.message.includes(share.url));

  // Viagem sem titulo ainda rende mensagem legivel.
  assert.match(buildInviteShare({ token: TOKEN }).message, /uma viagem/);
  assert.equal(buildInviteShare({ token: 'lixo' }), null);
});

test('o token e lido de volta das duas formas do link', () => {
  // https vem do link compartilhado; journi:// vem do retorno depois do login.
  assert.equal(parseInviteLink(`https://journi.expo.app/trip-invite/${TOKEN}`), TOKEN);
  assert.equal(parseInviteLink(`journi://trip-invite/${TOKEN}`), TOKEN);
});

test('o token sobrevive ao que aplicativo de conversa faz com a URL', () => {
  assert.equal(parseInviteLink(`https://journi.expo.app/trip-invite/${TOKEN}/`), TOKEN);
  assert.equal(parseInviteLink(`HTTPS://JOURNI.EXPO.APP/trip-invite/${TOKEN.toUpperCase()}`), TOKEN);
  assert.equal(parseInviteLink(`  https://journi.expo.app/trip-invite/${TOKEN}  `), TOKEN);
  assert.equal(parseInviteLink(`https://journi.expo.app/trip-invite/${TOKEN}?utm=whats`), TOKEN);
});

test('o que nao e convite devolve null em vez de meio token', () => {
  assert.equal(parseInviteLink('https://journi.expo.app/'), null);
  assert.equal(parseInviteLink('https://journi.expo.app/trip-invite/'), null);
  assert.equal(parseInviteLink('https://journi.expo.app/trip-invite/abc'), null);
  assert.equal(parseInviteLink('journi://reset-password'), null);
  assert.equal(parseInviteLink(null), null);
  assert.equal(parseInviteLink(''), null);
  assert.equal(parseInviteLink(42), null);
});

test('o formato do token bate com o que o banco gera', () => {
  // `replace(gen_random_uuid()::text, '-', '')` = 32 hex. Se a migracao mudar o
  // gerador, este teste avisa antes de o link parar de ser reconhecido.
  assert.equal(isValidInviteToken('0123456789abcdef0123456789abcdef'), true);
  assert.equal(isValidInviteToken('0123456789ABCDEF0123456789ABCDEF'), true);
  assert.equal(isValidInviteToken('0123456789abcdef0123456789abcde'), false, '31 nao serve');
  assert.equal(isValidInviteToken('g123456789abcdef0123456789abcdef'), false, 'g nao e hex');
});
