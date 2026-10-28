// Voltar do app de mapas não pode desaplicar o roteiro do globo.
//
// O BUG QUE ISTO PEGA
//
// Aplicar um roteiro, tocar num pino, tocar no ícone de rota (que abre o Google
// Maps / Apple Maps) e voltar para o Journi: o roteiro sumia do globo.
//
// A cadeia era esta, e nenhum elo dela é sobre mapa:
//
//   1. sair do app deixa a aba/o app oculto; voltar dispara
//      `visibilitychange → visible` no auth-js;
//   2. o auth-js recupera a sessão e emite `SIGNED_IN` — o MESMO evento de um
//      login de verdade, embora ninguém tenha entrado em conta nenhuma;
//   3. o ActivePlanContext tratava isso como troca de conta e relia os roteiros;
//   4. a releitura acontece no pior instante possível (rede voltando do
//      background), e qualquer imperfeição nela virava "nenhum roteiro
//      aplicado" — o globo limpava sozinho.
//
// O teste exercita o passo 4, que é onde mora a regra: a decisão entre ADOTAR a
// resposta e MANTER o que está na tela. Por isso ela vive numa função pura.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');

// O módulo fala com o Supabase só para gravar; a decisão que interessa aqui é
// pura, e o cliente falso existe só para o import resolver.
const activePlanService = loadEsm('src/services/activePlanService.js', {
  './supabase': { supabase: { auth: { getUser: async () => ({ data: {} }) }, rpc: async () => ({}) } },
});
const { nextActivePlan, resolveActivePlan } = activePlanService;

const PARIS = { id: 'trip-paris', title: 'Paris', is_active_on_map: true };
const ROMA = { id: 'trip-roma', title: 'Roma', is_active_on_map: false };

test('a releitura que falha mantém o roteiro que já estava no globo', () => {
  // É literalmente o passo 4 do bug: voltar do app de mapas com a rede ainda
  // acordando. "Não consegui ler" não é "não há roteiro aplicado".
  const resultado = { success: false, error: 'Network request failed', activeUnknown: true };

  assert.equal(nextActivePlan(PARIS, resultado), PARIS);
});

test('a releitura parcial também mantém — "não sei" nunca vira "nenhum"', () => {
  // A lista veio pelo caminho degradado (sem saber qual está no globo). Antes,
  // isso entregava todas as viagens com is_active_on_map indefinido, e o globo
  // desaplicava o roteiro sozinho mesmo com a consulta "funcionando".
  const resultado = {
    success: true,
    activeUnknown: true,
    data: [{ ...PARIS, is_active_on_map: undefined }, ROMA],
  };

  assert.equal(nextActivePlan(PARIS, resultado), PARIS);
});

test('a releitura boa manda, inclusive quando ela diz que não há mais nenhum', () => {
  // Quem removeu o roteiro do mapa em outro aparelho precisa ver isso aqui — a
  // correção não pode transformar o estado local em algo que nunca mais muda.
  const removido = { success: true, data: [{ ...PARIS, is_active_on_map: false }, ROMA] };
  assert.equal(nextActivePlan(PARIS, removido), null);

  // E uma troca feita em outro aparelho é adotada.
  const trocado = {
    success: true,
    data: [{ ...PARIS, is_active_on_map: false }, { ...ROMA, is_active_on_map: true }],
  };
  assert.equal(nextActivePlan(PARIS, trocado)?.id, 'trip-roma');
});

test('sem nada aplicado antes, uma leitura ruim continua sem nada', () => {
  assert.equal(nextActivePlan(null, { success: false }), null);
  assert.equal(nextActivePlan(undefined, { success: false }), null);
  assert.equal(nextActivePlan(null, undefined), null);
});

test('resolveActivePlan continua lendo a marcação do servidor', () => {
  assert.equal(resolveActivePlan([ROMA, PARIS])?.id, 'trip-paris');
  assert.equal(resolveActivePlan([ROMA]), null);
  assert.equal(resolveActivePlan([]), null);
});

// ── Os dois elos anteriores da cadeia, cobrados no código ────────────────────

test('voltar do background não é tratado como troca de conta', () => {
  const context = fs.readFileSync(path.join(root, 'src/context/ActivePlanContext.js'), 'utf8');

  // O `SIGNED_IN` de recuperação de sessão traz o MESMO usuário. Sem esta
  // comparação, toda volta do app de mapas dispara uma releitura — a releitura
  // que o resto deste arquivo existe para tornar inofensiva.
  assert.match(context, /currentUserIdRef/);
  assert.match(context, /if \(userId && userId === currentUserIdRef\.current\) return;/);

  // E a decisão do que fazer com a resposta não mora mais aqui.
  assert.match(context, /setActivePlan\(\(current\) => nextActivePlan\(current, result\)\)/);
  assert.doesNotMatch(context, /setActivePlan\(result\.success \?/);
});

test('o caminho degradado da lista não perde a marcação do globo', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  // A marcação saiu de travel_plans na Fase 0: sem buscar trip_members, o
  // fallback devolveria todas as viagens como "não aplicada".
  assert.match(service, /from\('trip_members'\)\s*\.select\('trip_id, role, status, is_active_on_map'\)/);
  assert.match(service, /activeUnknown = Boolean\(membership\.error\)/);
  // E a falha total avisa que não sabe, em vez de deixar quem lê concluir "nenhum".
  assert.match(service, /success: false,[\s\S]{0,200}activeUnknown: true/);
});
