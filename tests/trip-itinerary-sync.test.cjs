// A ida e volta do roteiro entre o banco e o app, com a IDENTIDADE preservada.
//
// POR QUE ISTO MERECE TESTE PRÓPRIO
//
// O salvamento do roteiro apagava tudo e reinseria (`replace_trip_itinerary`), e a
// causa não estava na RPC: estava AQUI. `activityFromRow` descartava o `id` da
// linha, então o app nunca sabia qual parada ele estava salvando — e sem saber,
// apagar tudo era a única escrita possível.
//
// O efeito disso numa viagem compartilhada é a segunda pessoa a salvar apagando o
// trabalho da primeira. E, com a Fase 2, também: histórico virando "apagou/criou"
// para toda parada em todo save, e `last_edited_by` apontando para quem salvou por
// último em TODAS as linhas.
//
// Então o que estes testes cobram é uma coisa só, em várias formas: o `id` e o
// `updatedAt` sobrevivem à viagem completa banco → app → banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const tripItinerary = loadEsm('src/utils/tripItinerary.js', {
  '../components/map/planDayStrip': planDayStrip,
});
const { itineraryFromRows, itineraryToRowsPayload } = tripItinerary;

/** Uma linha de trip_days como o PostgREST devolve. */
const dayRow = (overrides = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  day_number: 1,
  date: '2026-10-02',
  theme: 'Chegada',
  updated_at: '2026-09-17T10:00:00Z',
  last_edited_by: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  trip_activities: [],
  ...overrides,
});

/** Uma linha de trip_activities como o PostgREST devolve. */
const activityRow = (overrides = {}) => ({
  id: '22222222-2222-2222-2222-222222222222',
  position: 1,
  title: 'Coliseu',
  description: 'Visita guiada',
  location: 'Roma, Itália',
  updated_at: '2026-09-17T11:00:00Z',
  last_edited_by: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  category: 'atracao',
  ...overrides,
});

// ---------------------------------------------------------------------------
// BANCO → APP
// ---------------------------------------------------------------------------

test('a parada chega no app com id, versão e autoria', () => {
  const [dia] = itineraryFromRows([dayRow({ trip_activities: [activityRow()] })]);
  const parada = dia.activities[0];

  assert.equal(parada.id, '22222222-2222-2222-2222-222222222222');
  assert.equal(parada.updatedAt, '2026-09-17T11:00:00Z');
  assert.equal(parada.lastEditedBy, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

  // E o resto continua chegando como antes — a mudança não podia custar os campos
  // que as telas já leem.
  assert.equal(parada.title, 'Coliseu');
  assert.equal(parada.location, 'Roma, Itália');
  assert.equal(parada.order, 1);
});

test('o dia também chega com id, versão e autoria', () => {
  const [dia] = itineraryFromRows([dayRow()]);

  assert.equal(dia.id, '11111111-1111-1111-1111-111111111111');
  assert.equal(dia.updatedAt, '2026-09-17T10:00:00Z');
  assert.equal(dia.lastEditedBy, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(dia.day, 1);
  assert.equal(dia.theme, 'Chegada');
});

test('linha sem os campos novos não inventa valor', () => {
  // Viagem gravada antes desta migração não tem `last_edited_by`. `undefined` é a
  // resposta honesta; um id falso apareceria na tela como "editado por" alguém.
  const [dia] = itineraryFromRows([{ day_number: 1, trip_activities: [{ position: 1, title: 'X' }] }]);

  assert.equal(dia.id, undefined);
  assert.equal(dia.updatedAt, undefined);
  assert.equal(dia.lastEditedBy, undefined);
  assert.equal(dia.activities[0].id, undefined);
  assert.equal(dia.activities[0].updatedAt, undefined);
});

test('`extra` não consegue sobrescrever o id da linha', () => {
  // `extra` é espalhado por último para um campo novo da IA não se perder. Mas o
  // id é da LINHA: se `extra` trouxesse um `id`, o save passaria a apontar para
  // outra parada — o pior tipo de erro que esta camada pode produzir.
  const [dia] = itineraryFromRows([dayRow({
    trip_activities: [activityRow({ extra: { id: 'id-falso-da-ia', title: 'titulo antigo' } })],
  })]);

  assert.equal(
    dia.activities[0].id,
    '22222222-2222-2222-2222-222222222222',
    'o id de `extra` não pode vencer o id da linha'
  );
});

// ---------------------------------------------------------------------------
// APP → BANCO
// ---------------------------------------------------------------------------

test('o payload devolve id e versão, que é o que permite sincronizar', () => {
  const rows = [dayRow({ trip_activities: [activityRow()] })];
  const plano = { days: itineraryFromRows(rows) };
  const [dia] = itineraryToRowsPayload(plano);

  assert.equal(dia.id, '11111111-1111-1111-1111-111111111111');
  assert.equal(dia.updatedAt, '2026-09-17T10:00:00Z');
  assert.equal(dia.activities[0].id, '22222222-2222-2222-2222-222222222222');
  assert.equal(dia.activities[0].updatedAt, '2026-09-17T11:00:00Z');
});

test('A IDA E VOLTA COMPLETA preserva a identidade de cada item', () => {
  // É a invariante que o conserto inteiro depende: banco → app → banco sem perder
  // quem é quem. Se isto quebrar, o salvamento volta a recriar tudo.
  const rows = [
    dayRow({
      id: 'd1111111-1111-1111-1111-111111111111',
      day_number: 1,
      trip_activities: [
        activityRow({ id: 'a1111111-1111-1111-1111-111111111111', position: 1, title: 'A' }),
        activityRow({ id: 'a2222222-2222-2222-2222-222222222222', position: 2, title: 'B' }),
      ],
    }),
    dayRow({
      id: 'd2222222-2222-2222-2222-222222222222',
      day_number: 2,
      trip_activities: [
        activityRow({ id: 'a3333333-3333-3333-3333-333333333333', position: 1, title: 'C' }),
      ],
    }),
  ];

  const volta = itineraryToRowsPayload({ days: itineraryFromRows(rows) });

  assert.deepEqual(
    volta.map((d) => d.id),
    ['d1111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222']
  );
  assert.deepEqual(
    volta.flatMap((d) => d.activities.map((a) => a.id)),
    [
      'a1111111-1111-1111-1111-111111111111',
      'a2222222-2222-2222-2222-222222222222',
      'a3333333-3333-3333-3333-333333333333',
    ]
  );
});

test('roteiro recém-gerado pela IA vai sem id — e é isso que o marca como novo', () => {
  // A IA não conhece id nenhum. Nesse caso `sync_trip_itinerary` insere tudo, que
  // é o comportamento certo para o primeiro salvamento.
  const plano = {
    days: [{ day: 1, theme: 'Chegada', activities: [{ title: 'Coliseu', order: 1 }] }],
  };
  const [dia] = itineraryToRowsPayload(plano);

  assert.equal(dia.id, undefined);
  assert.equal(dia.updatedAt, undefined);
  assert.equal(dia.activities[0].id, undefined);
  // E o conteúdo vai inteiro.
  assert.equal(dia.activities[0].title, 'Coliseu');
});

test('a parada editada na tela mantém o id, então ela é ATUALIZADA e não recriada', () => {
  // O caminho real: a pessoa abre a viagem, muda o título de uma parada e salva.
  const rows = [dayRow({ trip_activities: [activityRow()] })];
  const plano = { days: itineraryFromRows(rows) };

  plano.days[0].activities[0].title = 'Coliseu — visita noturna';

  const [dia] = itineraryToRowsPayload(plano);
  assert.equal(dia.activities[0].id, '22222222-2222-2222-2222-222222222222');
  assert.equal(dia.activities[0].title, 'Coliseu — visita noturna');
  // A versão de que a edição partiu viaja junto: é ela que faz o banco recusar
  // sobrescrever, caso outra pessoa tenha mexido nesta parada no meio.
  assert.equal(dia.activities[0].updatedAt, '2026-09-17T11:00:00Z');
});

test('parada acrescentada no meio de um roteiro existente vai sem id', () => {
  const rows = [dayRow({ trip_activities: [activityRow()] })];
  const plano = { days: itineraryFromRows(rows) };

  plano.days[0].activities.push({ title: 'Parada nova', order: 2 });

  const [dia] = itineraryToRowsPayload(plano);
  assert.equal(dia.activities[0].id, '22222222-2222-2222-2222-222222222222', 'a antiga mantém o id');
  assert.equal(dia.activities[1].id, undefined, 'a nova não tem id: será inserida');
  assert.equal(dia.activities[1].order, 2);
});

test('a numeração do dia no payload usa a conta única do projeto', () => {
  // Era a sexta cópia de `Number(day?.day) || index + 1` no projeto, e numeração
  // duplicada é a raiz da família de bugs de "dia errado".
  const payload = itineraryToRowsPayload({
    days: [{ day: 3 }, {}, { day: null }, { day: '7' }],
  });

  assert.deepEqual(payload.map((d) => d.day), [3, 2, 3, 7]);

  // E a fórmula do DIA não está copiada dentro deste módulo.
  //
  // A busca é pelo `day`: a ordem da ATIVIDADE (`Number(position) || index + 1`)
  // também cai para a posição na lista, e legitimamente — é outra contagem, de
  // outra coisa, e não tem relação com o número do dia da viagem.
  const fonte = fs.readFileSync(path.join(root, 'src/utils/tripItinerary.js'), 'utf8');
  const copias = fonte
    .split(/\r?\n/)
    .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha))
    .filter((linha) => /day\w*\)?\s*\|\|\s*\w*[Ii]ndex \+ 1/.test(linha));
  assert.deepEqual(copias, [], `tripItinerary voltou a copiar a conta do dia:\n${copias.join('\n')}`);
});

// ---------------------------------------------------------------------------
// AS AMARRAS NO BANCO E NO SERVIÇO
// ---------------------------------------------------------------------------

test('o serviço chama a sincronização por diferença, não o replace que apagava tudo', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/tripPlanService.js'), 'utf8');

  assert.match(service, /sync_trip_itinerary/);

  // O BUG QUE ISTO PEGA: `replace_trip_itinerary` começa apagando o roteiro
  // inteiro. Numa viagem compartilhada, quem salva por último apaga o trabalho de
  // quem salvou antes.
  //
  // A busca ignora comentários — o serviço cita a função antiga de propósito, para
  // explicar por que ela deixou de ser usada.
  const chamadasAoReplace = service
    .split(/\r?\n/)
    .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha))
    .filter((linha) => /replace_trip_itinerary/.test(linha));
  assert.deepEqual(chamadasAoReplace, [], 'o serviço ainda chama o replace que apaga tudo');

  // E o conflito precisa chegar ao usuário: a guarda existe para ninguém perder
  // trabalho em silêncio, e avisar é metade do valor dela.
  assert.match(service, /conflicts/);

  // A leitura traz a versão e a autoria, senão o payload não tem o que devolver.
  assert.match(service, /updated_at, last_edited_by/);
});

test('a RPC nova sincroniza por id e guarda conflito por item', () => {
  const sql = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260917140000_sync_trip_itinerary.sql'),
    'utf8'
  );

  // Não começa apagando.
  assert.doesNotMatch(sql, /delete from public\.trip_days where trip_id = p_trip_id;/);

  // Casa pelo id, e só dentro da MESMA viagem — sem isso, um payload com o id de
  // um dia de outra viagem faria a função escrever lá.
  assert.match(sql, /and trip_id = p_trip_id/);

  // A guarda de conflito compara a versão lida com a do banco.
  assert.match(sql, /atual > base/);
  assert.match(sql, /conflicts/);

  // E devolve o resumo, que é o que o serviço usa para avisar.
  assert.match(sql, /jsonb_build_object/);
});
