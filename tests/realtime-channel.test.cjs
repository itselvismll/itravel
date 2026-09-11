// A tela em branco ao voltar para o Feed vindo do perfil de outra pessoa.
//
// O erro era:
//   "cannot add `postgres_changes` callbacks for
//    realtime:feed-header-counts-{id} after `subscribe()`"
//
// O cliente falso abaixo reproduz as DUAS regras do @supabase/realtime-js que,
// juntas, produziam o bug — e sem as quais o teste não provaria nada:
//
//   1. `channel(topic)` devolve o canal EXISTENTE quando já há um com aquele
//      tópico na lista (RealtimeClient.channel).
//   2. `removeChannel` é assíncrono e o canal só sai da lista quando o servidor
//      confirma a saída (o `_remove` roda no `_onClose`).
//
// A limpeza de um useEffect é síncrona, então numa remontagem rápida o efeito
// novo encontrava o canal velho, ainda inscrito, e o `.on()` lançava.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

/**
 * Cliente Realtime falso com a semântica descrita acima.
 *
 * `flushLeaves()` é o ack do servidor: enquanto não for chamado, os canais em
 * saída continuam na lista — que é exatamente a janela onde o bug vivia.
 */
const createFakeSupabase = () => {
  let channels = [];
  const pendingLeaves = [];
  const log = [];

  const makeChannel = (topic) => ({
    topic: `realtime:${topic}`,
    subscribed: false,
    bindings: [],

    on(event, filter, handler) {
      // A regra do realtime-js que dava a tela em branco.
      if (this.subscribed) {
        throw new Error(
          `cannot add \`${event}\` callbacks for ${this.topic} after \`subscribe()\``
        );
      }
      this.bindings.push({ event, filter, handler });
      return this;
    },

    subscribe(onStatus) {
      this.subscribed = true;
      log.push(`subscribe:${this.topic}`);
      onStatus?.('SUBSCRIBED');
      return this;
    },
  });

  return {
    getChannels: () => [...channels],

    channel(topic) {
      const realtimeTopic = `realtime:${topic}`;
      const existing = channels.find((c) => c.topic === realtimeTopic);
      if (existing) {
        log.push(`reused:${realtimeTopic}`);
        return existing;
      }
      const channel = makeChannel(topic);
      channels.push(channel);
      log.push(`created:${realtimeTopic}`);
      return channel;
    },

    removeChannel(channel) {
      log.push(`remove:${channel.topic}`);
      // Sai da lista só no ack — nunca de forma síncrona.
      return new Promise((resolve) => {
        pendingLeaves.push(() => {
          channels = channels.filter((c) => c !== channel);
          resolve('ok');
        });
      });
    },

    /** O ack do servidor para todas as saídas pendentes. */
    flushLeaves() {
      while (pendingLeaves.length) pendingLeaves.shift()();
    },

    log,
    get liveChannels() {
      return channels;
    },
  };
};

const loadModule = (supabaseStub) =>
  loadEsm('src/services/realtimeChannel.js', { './supabase': { supabase: supabaseStub } });

const listeners = [
  {
    filter: { event: 'INSERT', schema: 'public', table: 'notifications' },
    handler: () => {},
  },
];

test('a ordem é sempre criar -> on -> subscribe', () => {
  const supabase = createFakeSupabase();
  const { openPostgresChangesChannel } = loadModule(supabase);

  openPostgresChangesChannel({ topic: 'feed-header-counts-abc', listeners });

  const [channel] = supabase.liveChannels;
  assert.equal(channel.bindings.length, 1, 'a escuta não foi registrada');
  assert.equal(channel.subscribed, true, 'o canal não foi inscrito');
  // O binding tem de ter sido feito ANTES do subscribe, senão o realtime-js lança.
  assert.deepEqual(supabase.log, [
    `created:${channel.topic}`,
    `subscribe:${channel.topic}`,
  ]);
});

test('remontar antes do ack do servidor não lança — era a tela em branco', () => {
  const supabase = createFakeSupabase();
  const { openPostgresChangesChannel } = loadModule(supabase);
  const topic = 'feed-header-counts-abc';

  // Monta, desmonta (sair do Feed para o perfil) e monta de novo (ícone de casa)
  // SEM o servidor confirmar a saída no meio — a janela exata do bug.
  const cleanup = openPostgresChangesChannel({ topic, listeners });
  cleanup();

  assert.doesNotThrow(() => {
    openPostgresChangesChannel({ topic, listeners });
  }, 'a remontagem voltou a reaproveitar um canal já inscrito');

  // E o canal novo é OUTRO objeto, não o que já tinha passado por subscribe().
  assert.ok(
    !supabase.log.some((entry) => entry.startsWith('reused:')),
    'um canal já inscrito foi reaproveitado'
  );
});

test('entrar e voltar muitas vezes não deixa canais vazando', () => {
  const supabase = createFakeSupabase();
  const { openPostgresChangesChannel } = loadModule(supabase);
  const topic = 'feed-header-counts-abc';

  // Dez idas e voltas, com o servidor confirmando as saídas só de vez em quando —
  // é assim que acontece de verdade, com a rede no meio.
  for (let i = 0; i < 10; i += 1) {
    const cleanup = openPostgresChangesChannel({ topic, listeners });
    cleanup();
    if (i % 3 === 0) supabase.flushLeaves();
  }

  supabase.flushLeaves();

  assert.equal(
    supabase.liveChannels.length,
    0,
    `sobraram canais inscritos: ${supabase.liveChannels.map((c) => c.topic).join(', ')}`
  );
});

test('a varredura de órfãos não derruba canais de outro tópico', () => {
  const supabase = createFakeSupabase();
  const { openPostgresChangesChannel } = loadModule(supabase);

  // Duas telas com canais diferentes, vivas ao mesmo tempo.
  openPostgresChangesChannel({ topic: 'conversation-42', listeners });
  openPostgresChangesChannel({ topic: 'feed-header-counts-abc', listeners });

  // Uma terceira inscrição no tópico do feed varre os órfãos DELE, e só dele.
  openPostgresChangesChannel({ topic: 'feed-header-counts-abc', listeners });
  supabase.flushLeaves();

  const topics = supabase.liveChannels.map((c) => c.topic);
  assert.ok(
    topics.some((t) => t.startsWith('realtime:conversation-42#')),
    'a varredura removeu o canal de outra tela'
  );
});

test('nenhuma tela abre canal Realtime por fora do helper', () => {
  // O bug do Feed nasceu de `supabase.channel(...).on(...).subscribe()` escrito à
  // mão, e o mesmo padrão estava em outros dois lugares. Depois da migração, o
  // ÚNICO arquivo com direito de chamar `supabase.channel` é o helper — é ele
  // que garante a ordem e o tópico único. Esta trava é o que impede o padrão
  // antigo de voltar por um copiar-e-colar.
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(absolute);
    }
  };
  visit(path.join(root, 'src'));

  // Sem comentários: vários arquivos MENCIONAM `supabase.channel()` justamente
  // para explicar por que não o usam, e essas menções não podem reprovar.
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const offenders = files
    .filter((file) => /supabase\s*\n?\s*\.channel\s*\(/.test(stripComments(fs.readFileSync(file, 'utf8'))))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));

  assert.deepEqual(offenders, ['src/services/realtimeChannel.js']);
});

test('um tópico que é prefixo de outro não é varrido junto', () => {
  const supabase = createFakeSupabase();
  const { openPostgresChangesChannel } = loadModule(supabase);

  // 'feed' é prefixo literal de 'feed-header-counts-abc'. Sem o separador na
  // comparação, abrir um levaria o outro embora.
  openPostgresChangesChannel({ topic: 'feed', listeners });
  openPostgresChangesChannel({ topic: 'feed-header-counts-abc', listeners });
  supabase.flushLeaves();

  const topics = supabase.liveChannels.map((c) => c.topic);
  assert.equal(topics.length, 2, `esperava os dois canais vivos, veio: ${topics.join(', ')}`);
});
