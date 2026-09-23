// A viagem aberta SÓ PELO ID, por quem não é dono.
//
// O QUE ACONTECEU EM PRODUÇÃO
//
// A convidada abriu o link, entrou na viagem — e a viagem apareceu vazia: sem
// capa, sem nome, "0 dias". Parecia RLS, e não era. A convidada estava em
// `trip_members` como editor/accepted, a viagem tinha 21 dias e 63 atividades
// gravados, e as policies de leitura são por participante desde a migração
// 20260915120000.
//
// O que faltava era a LEITURA. A tela da viagem sempre foi aberta pela lista,
// que já traz o roteiro inteiro em `route.params`; os caminhos novos (o convite
// resgatado e a notificação) mandam só `{ planId }`. Sem ninguém buscar nada, a
// tela renderizava `plan = {}` — que é exatamente o que "viagem vazia" quer
// dizer.
//
// Por isso os testes abaixo afirmam o CONTRÁRIO de um filtro por dono: a
// consulta não pode restringir por `user_id`, porque é a policy que decide, e
// filtrar por dono esconderia justamente a viagem compartilhada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const tripItinerary = loadEsm('src/utils/tripItinerary.js', {
  '../components/map/planDayStrip': planDayStrip,
});

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const DONO = '22222222-2222-4222-8222-222222222222';
const CONVIDADA = '33333333-3333-4333-8333-333333333333';

/** A viagem como o PostgREST devolve, com o roteiro normalizado embutido. */
const viagemComEmbed = () => ({
  id: TRIP_ID,
  user_id: DONO,
  title: '21 dias em Itália',
  plan_data: { title: '21 dias em Itália', days: [] },
  request_data: { destination: 'Itália', travelers: 2 },
  trip_members: [{ user_id: CONVIDADA, role: 'editor', status: 'accepted', is_active_on_map: false }],
  trip_days: [
    {
      id: 'd1',
      day_number: 1,
      date: '2026-10-01',
      theme: 'Chegada',
      trip_activities: [
        { id: 'a1', position: 0, period: 'manha', title: 'Coliseu', location: 'Roma' },
      ],
    },
    {
      id: 'd2',
      day_number: 2,
      date: '2026-10-02',
      theme: 'Vaticano',
      trip_activities: [
        { id: 'a2', position: 0, period: 'manha', title: 'Museus', location: 'Roma' },
      ],
    },
  ],
});

/**
 * Um supabase de mentira que REGISTRA os filtros aplicados.
 *
 * É o registro que permite afirmar a ausência do filtro por dono — a ausência é
 * o conserto, e ausência não se vê renderizando a tela.
 */
/**
 * @param {{ embed?: any, simples?: any, membro?: any, usuario?: { id: string } | null }} [opcoes]
 */
const makeSupabase = ({ embed, simples, membro, usuario = { id: CONVIDADA } } = {}) => {
  const consultas = [];

  const criarChain = (tabela) => {
    const registro = { tabela, filtros: [], select: null };
    consultas.push(registro);

    const resolver = () => {
      if (tabela === 'trip_members') return membro ?? { data: null, error: null };
      if (registro.select === '*') return simples ?? { data: null, error: null };
      return embed ?? { data: null, error: null };
    };

    const chain = {
      select: (cols) => { registro.select = String(cols).trim(); return chain; },
      eq: (coluna, valor) => { registro.filtros.push([coluna, valor]); return chain; },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(resolver()),
      then: (resolve) => resolve(resolver()),
    };
    return chain;
  };

  return {
    consultas,
    supabase: {
      from: (tabela) => criarChain(tabela),
      auth: { getUser: async () => ({ data: { user: usuario }, error: null }) },
    },
  };
};

const carregar = (opcoes) => {
  const { supabase, consultas } = makeSupabase(opcoes);
  const servico = loadEsm('src/services/tripPlanService.js', {
    './supabase': { supabase },
    // `ensurePlanCoordinates` faz rede; aqui o plano volta como veio.
    '../utils/planGeography': { ensurePlanCoordinates: async (plano) => plano },
    '../utils/tripItinerary': tripItinerary,
  });
  return { getTripPlan: servico.getTripPlan, consultas };
};

test('a convidada abre a viagem pelo id e recebe o roteiro', async () => {
  const { getTripPlan } = carregar({ embed: { data: viagemComEmbed(), error: null } });

  const resultado = await getTripPlan(TRIP_ID);

  assert.equal(resultado.success, true);
  assert.equal(resultado.data.title, '21 dias em Itália');
  assert.equal(
    resultado.data.plan_data.days.length,
    2,
    'os dias vêm das linhas de trip_days — "0 dias" era o sintoma do bug',
  );
  assert.equal(resultado.data.request_data.destination, 'Itália');
  assert.equal(resultado.data.member_role, 'editor');
  assert.equal(resultado.data.member_status, 'accepted');
});

test('a consulta não filtra por dono', async () => {
  // O filtro por `user_id` é a hipótese mais provável de reintrodução do bug:
  // é o que a consulta de viagem fez a vida inteira, antes de existir viagem
  // compartilhada. Quem decide o acesso é a policy "Members read trips".
  const { getTripPlan, consultas } = carregar({ embed: { data: viagemComEmbed(), error: null } });

  await getTripPlan(TRIP_ID);

  const viagem = consultas.find((c) => c.tabela === 'travel_plans');
  const filtros = viagem.filtros.map(([coluna]) => coluna);

  assert.ok(filtros.includes('id'), 'a viagem é buscada pelo id');
  assert.ok(
    !filtros.includes('user_id'),
    'filtrar por dono esconderia a viagem de quem foi convidado',
  );
  // O filtro no embed é outra coisa: escolhe QUAL linha de participante vem —
  // a minha —, e não quem pode ler.
  assert.deepEqual(
    viagem.filtros.find(([coluna]) => coluna === 'trip_members.user_id'),
    ['trip_members.user_id', CONVIDADA],
  );
});

test('embed que falha ainda abre a viagem, com aviso', async () => {
  // PGRST201 e parentes já apagaram a lista de viagens em produção uma vez. Uma
  // viagem vazia na tela lê como "não há nada aqui"; o caminho pobre evita isso.
  const { getTripPlan } = carregar({
    embed: { data: null, error: { message: 'PGRST201: ambiguidade' } },
    simples: {
      data: {
        id: TRIP_ID,
        user_id: DONO,
        title: '21 dias em Itália',
        plan_data: { days: [{ day: 1, activities: [{ title: 'Coliseu' }] }] },
        request_data: { destination: 'Itália' },
      },
      error: null,
    },
    membro: { data: { role: 'editor', status: 'accepted', is_active_on_map: true }, error: null },
  });

  const resultado = await getTripPlan(TRIP_ID);

  assert.equal(resultado.success, true);
  assert.equal(resultado.data.plan_data.days.length, 1, 'o roteiro vem do plan_data');
  assert.equal(resultado.data.member_role, 'editor');
  assert.equal(resultado.data.is_active_on_map, true);
  assert.match(resultado.warning || '', /não carregaram/);
});

test('sem acesso, é erro — e não uma viagem vazia', async () => {
  // A RLS recusando devolve zero linhas, igualzinho a uma viagem inexistente. O
  // que não pode acontecer é isso virar tela montada sem conteúdo, que foi o
  // relato original ("a viagem aparece vazia").
  const { getTripPlan } = carregar({
    embed: { data: null, error: null },
    simples: { data: null, error: null },
    membro: { data: null, error: null },
  });

  const resultado = await getTripPlan(TRIP_ID);

  assert.equal(resultado.success, false);
  assert.match(resultado.error, /não faça mais parte|não foi possível/i);
});

test('sem sessão, pede para entrar em vez de mostrar viagem vazia', async () => {
  const { getTripPlan } = carregar({ usuario: null });

  const resultado = await getTripPlan(TRIP_ID);

  assert.equal(resultado.success, false);
  assert.match(resultado.error, /Entre na sua conta/i);
});

test('sem id não há consulta nenhuma', async () => {
  const { getTripPlan, consultas } = carregar({});

  const resultado = await getTripPlan(null);

  assert.equal(resultado.success, false);
  assert.equal(consultas.length, 0);
});

test('a tela busca a viagem quando chega só com o id', () => {
  // A ligação entre o conserto e o caminho que quebrou. A tela é grande demais
  // para montar aqui, então o que se afirma é a estrutura: existe a chamada,
  // ela depende do id, e ela NÃO acontece quando o roteiro já veio nos params
  // (senão a viagem vinda da lista piscaria a cada abertura).
  const fs = require('fs');
  const path = require('path');
  const tela = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8',
  );

  assert.match(tela, /getTripPlan\(planId\)/, 'a tela precisa buscar a viagem pelo id');
  assert.match(
    tela,
    /if \(!planId \|\| temRoteiro\) return undefined;/,
    'a busca só acontece quando falta roteiro',
  );
  assert.match(
    tela,
    /const temRoteiro = Boolean\(plan\?\.days\?\.length\);/,
    'quem decide é a presença dos dias, não a origem da navegação',
  );
});

test('o convite e a notificação levam ao mesmo destino, só com o id', () => {
  // Os dois caminhos que expuseram o bug. Se algum deles voltar a mandar outra
  // coisa (ou outra rota), a viagem volta a abrir vazia.
  const fs = require('fs');
  const path = require('path');
  const raiz = path.resolve(__dirname, '..');

  const convite = fs.readFileSync(path.join(raiz, 'src/screens/trip/TripInviteScreen.js'), 'utf8');
  assert.match(convite, /replace\('AssistantResult', \{ planId: resultado\.data \}\)/);

  const roteamento = loadEsm('src/utils/notificationRouting.js');
  const destino = roteamento.getRoute({ type: 'trip_invite', target_id: TRIP_ID });
  assert.deepEqual(destino, { name: 'AssistantResult', params: { planId: TRIP_ID } });
});
