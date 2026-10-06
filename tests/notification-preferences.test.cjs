// Preferências de notificação: o mapa de categorias e o filtro no banco.
//
// O QUE ESTE ARQUIVO PROTEGE
//
// O filtro é UM trigger BEFORE INSERT que vale para os sete caminhos que criam
// aviso. Um `return null` no galho errado não derruba nada, não gera erro e não
// aparece em log: ele simplesmente faz avisos desaparecerem — ou faz o
// interruptor não ter efeito nenhum. Os dois sintomas chegam ao usuário como
// "notificação do Journi não funciona", que é indistinguível do bug antigo de DM.
//
// Por isso a metade do banco roda num Postgres DE VERDADE (PGlite), e não em
// afirmações sobre o texto da migração. Especificamente:
//
//   1. categoria desligada não insere;
//   2. `all_enabled = false` não insere E preserva as colunas de categoria;
//   3. sem linha de preferência, insere (é o estado de toda a base hoje);
//   4. o filtro olha o DESTINATÁRIO, não quem gerou o aviso — este é o que um
//      teste com uma conta só nunca pegaria, e o que um `security definer`
//      esquecido quebraria em produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');
const { createDbWithMigration, insertUsers } = require('./helpers/pglite-db.cjs');

const root = path.resolve(__dirname, '..');
const MIGRATION_FILE = '20260930120000_notification_preferences.sql';
const MIGRATION = fs.readFileSync(path.join(root, 'supabase/migrations', MIGRATION_FILE), 'utf8');

const {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PREFERENCE_SECTIONS,
  NOTIFICATION_TYPE_CATEGORY,
  categoryForNotificationType,
  isNotificationTypeEnabled,
} = loadEsm('src/utils/notificationCategories.js');

const { NOTIFICATION_TYPES } = loadEsm('src/utils/socialNotifications.js');

const ANA = '11111111-1111-1111-1111-111111111111';
const BRUNO = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// O MAPA tipo → categoria
// ---------------------------------------------------------------------------

test('cada tipo mapeado cai numa categoria que existe como coluna', () => {
  for (const [type, category] of Object.entries(NOTIFICATION_TYPE_CATEGORY)) {
    assert.ok(
      NOTIFICATION_CATEGORIES.includes(category),
      `${type} aponta para ${category}, que não é uma categoria`
    );
  }
});

test('tipo desconhecido não tem categoria e PASSA', () => {
  // A regra inteira num caso: um tipo que ninguém mapeou continua chegando. Sem
  // isso, acrescentar um tipo novo no banco e esquecer deste arquivo seria um
  // aviso que nunca chega e que não deixa rastro.
  assert.equal(categoryForNotificationType('tipo_que_nao_existe'), null);
  assert.equal(isNotificationTypeEnabled('tipo_que_nao_existe', { all_enabled: true }), true);

  for (const vazio of [null, undefined, '', 0]) {
    assert.equal(categoryForNotificationType(/** @type {any} */ (vazio)), null);
  }
});

test('curtida tem interruptor próprio', () => {
  // Este teste já esteve invertido: por uma entrega, curtida era um tipo vivo
  // SEM interruptor, e o que se afirmava aqui era que a ausência era deliberada.
  // Agora a categoria existe, e o que precisa ser cobrado é o contrário —
  // inclusive que desligar curtida não desliga comentário.
  assert.ok(NOTIFICATION_TYPES.includes('like'));
  assert.equal(categoryForNotificationType('like'), 'social_likes');
  assert.equal(isNotificationTypeEnabled('like', { all_enabled: true, social_likes: false }), false);
  assert.equal(isNotificationTypeEnabled('like', { all_enabled: true, social_comments: false }), true);
});

test('mensagem direta tem interruptor, e o tipo existe de verdade', () => {
  // O inverso do que este arquivo afirmava antes. A 20260812130000 havia tirado
  // `message` do check de tipo, e um interruptor de DM seria enfeite; a
  // 20260930120000 devolveu o tipo com um trigger que agrupa por conversa.
  assert.equal(categoryForNotificationType('message'), 'social_messages');
  assert.ok(NOTIFICATION_TYPES.includes('message'), 'sem isto o aviso é invisível e nunca é lido');
  assert.ok(MIGRATION.includes('social_messages'));

  // O tipo precisa estar no check da tabela, senão o insert do trigger estoura.
  const check = MIGRATION.slice(MIGRATION.indexOf('add constraint notifications_type_check'));
  assert.match(check, /'message'/);
});

test('all_enabled desligado barra categoria ligada', () => {
  assert.equal(isNotificationTypeEnabled('follow', { all_enabled: false, social_follows: true }), false);
});

test('sem preferência nenhuma, tudo passa', () => {
  for (const type of NOTIFICATION_TYPES) {
    assert.equal(isNotificationTypeEnabled(type, null), true, `${type} barrado sem preferência`);
  }
});

test('as duas de tarefa dividem um interruptor só', () => {
  assert.equal(categoryForNotificationType('trip_task_created'), 'trip_tasks');
  assert.equal(categoryForNotificationType('trip_task_done'), 'trip_tasks');
});

// ---------------------------------------------------------------------------
// O MAPA EM JS E O MAPA EM SQL SÃO O MESMO
// ---------------------------------------------------------------------------

test('o CASE da migração e o mapa em JS concordam, tipo por tipo', () => {
  // A mesma tabela escrita em dois lugares diverge calada: alguém acrescenta a
  // categoria no SQL, esquece o JS, e a tela deixa de mostrar o interruptor de
  // algo que o banco já filtra. Este teste lê o CASE do arquivo e compara.
  // O início primeiro, e o fim contado A PARTIR dele: "else null" também aparece
  // no comentário ACIMA da função, e um `indexOf` solto acharia essa ocorrência,
  // devolvendo um trecho vazio — teste que passa sem comparar nada.
  const inicio = MIGRATION.indexOf('select case p_type');
  assert.notEqual(inicio, -1, 'não achei o CASE na migração');
  const caseBody = MIGRATION.slice(inicio, MIGRATION.indexOf('else null', inicio));
  assert.ok(caseBody.includes("when 'follow'"), 'o trecho do CASE saiu vazio');

  const doSql = Object.fromEntries(
    [...caseBody.matchAll(/when '([a-z_]+)' then '([a-z_]+)'/g)].map((m) => [m[1], m[2]])
  );

  assert.deepEqual(doSql, { ...NOTIFICATION_TYPE_CATEGORY });
});

test('toda categoria do mapa tem coluna na tabela, e vice-versa', () => {
  const corpoTabela = MIGRATION.slice(
    MIGRATION.indexOf('create table if not exists public.notification_preferences'),
    MIGRATION.indexOf('create or replace function public.touch_notification_preferences')
  );

  for (const category of NOTIFICATION_CATEGORIES) {
    assert.ok(
      new RegExp(`^\\s*${category} boolean not null default true`, 'm').test(corpoTabela),
      `${category} não tem coluna com default true`
    );
  }

  // O caminho de volta: coluna booleana na tabela que não é categoria conhecida
  // (nem `all_enabled`) seria um interruptor sem tela.
  const colunas = [...corpoTabela.matchAll(/^\s{2}([a-z_]+) boolean/gm)].map((m) => m[1]);
  assert.deepEqual(colunas.sort(), ['all_enabled', ...NOTIFICATION_CATEGORIES].sort());
});

test('toda linha da tela grava uma categoria que existe', () => {
  const chaves = NOTIFICATION_PREFERENCE_SECTIONS.flatMap((s) => s.rows.map((r) => r.key));

  for (const chave of chaves) {
    assert.ok(NOTIFICATION_CATEGORIES.includes(chave), `${chave} não é categoria`);
  }
  // Sem categoria órfã: categoria sem linha na tela é um filtro que ninguém
  // consegue desligar.
  assert.deepEqual(chaves.sort(), [...NOTIFICATION_CATEGORIES].sort());
  assert.equal(new Set(chaves).size, chaves.length, 'categoria repetida na tela');
});

test('o padrão é tudo ligado', () => {
  assert.equal(DEFAULT_NOTIFICATION_PREFERENCES.all_enabled, true);
  for (const category of NOTIFICATION_CATEGORIES) {
    assert.equal(DEFAULT_NOTIFICATION_PREFERENCES[category], true);
  }
});

// ---------------------------------------------------------------------------
// O TRIGGER, NUM POSTGRES DE VERDADE
// ---------------------------------------------------------------------------

// PGlite leva alguns segundos para subir. Um banco por teste mantém os casos
// independentes — e o custo é aceitável porque são poucos.
const comBanco = async (fn) => {
  const db = await createDbWithMigration(MIGRATION_FILE);
  try {
    await insertUsers(db, [ANA, BRUNO]);
    await fn(db);
  } finally {
    await db.close();
  }
};

const contar = async (db, userId) => {
  const { rows } = await db.query(
    'select count(*)::int as total from public.notifications where user_id = $1',
    [userId]
  );
  return rows[0].total;
};

/** Um aviso para `userId`, gerado por `actorId`. */
const notificar = (db, userId, type, actorId = BRUNO) =>
  db.query(
    'insert into public.notifications (user_id, actor_id, type, message) values ($1, $2, $3, $4)',
    [userId, actorId, type, 'teste']
  );

test('a migração roda num Postgres de verdade', async () => {
  await comBanco(async (db) => {
    const { rows } = await db.query("select public.notification_category('follow') as categoria");
    assert.equal(rows[0].categoria, 'social_follows');

    const { rows: curtida } = await db.query(
      "select public.notification_category('like') as categoria"
    );
    assert.equal(curtida[0].categoria, 'social_likes');

    // O caminho de escape, agora que nenhum tipo vivo depende dele.
    const { rows: semCategoria } = await db.query(
      "select public.notification_category('tipo_que_ninguem_mapeou') as categoria"
    );
    assert.equal(semCategoria[0].categoria, null);
  });
});

test('sem linha de preferência, o aviso entra', async () => {
  await comBanco(async (db) => {
    for (const type of NOTIFICATION_TYPES) {
      await notificar(db, ANA, type);
    }
    assert.equal(await contar(db, ANA), NOTIFICATION_TYPES.length);
  });
});

test('categoria desligada não insere, e as outras continuam entrando', async () => {
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, social_follows) values ($1, false)',
      [ANA]
    );

    await notificar(db, ANA, 'follow');
    assert.equal(await contar(db, ANA), 0, 'seguidor passou com a categoria desligada');

    await notificar(db, ANA, 'comment');
    await notificar(db, ANA, 'trip_invite');
    assert.equal(await contar(db, ANA), 2, 'desligar uma categoria barrou as outras');
  });
});

test('os dois tipos de tarefa obedecem ao mesmo interruptor', async () => {
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, trip_tasks) values ($1, false)',
      [ANA]
    );

    await notificar(db, ANA, 'trip_task_created');
    await notificar(db, ANA, 'trip_task_done');
    assert.equal(await contar(db, ANA), 0);
  });
});

test('tipo sem categoria passa mesmo com as categorias todas desligadas', async () => {
  // Este teste já usou 'like' como o tipo sem categoria. Não dá mais: curtida
  // ganhou interruptor, e hoje NENHUM tipo inserível serve de cobaia — o check da
  // tabela aceita só os oito tipos vivos, e os oito estão mapeados.
  //
  // Então a pergunta vai ao PREDICADO, que é onde a regra mora, em vez de a um
  // insert. É o mesmo caminho que o trigger percorre, uma camada acima.
  await comBanco(async (db) => {
    const desligadas = NOTIFICATION_CATEGORIES.map((c) => `${c} = false`).join(', ');
    await db.query(
      'insert into public.notification_preferences (user_id, all_enabled) values ($1, true)',
      [ANA]
    );
    await db.query(`update public.notification_preferences set ${desligadas} where user_id = $1`, [ANA]);

    const { rows } = await db.query(
      "select public.notification_enabled_for($1, 'tipo_que_ninguem_mapeou') as passa",
      [ANA]
    );
    assert.equal(rows[0].passa, true, 'o else null do CASE quebrou');

    // E o contraste, na mesma linha de preferência: um tipo MAPEADO é barrado.
    const { rows: barrado } = await db.query(
      "select public.notification_enabled_for($1, 'like') as passa",
      [ANA]
    );
    assert.equal(barrado[0].passa, false);
  });
});

test('all_enabled = false não insere e PRESERVA as colunas de categoria', async () => {
  await comBanco(async (db) => {
    // O caso que dá valor à coluna separada: Ana já tinha desligado seguidores e
    // tarefas ANTES de pausar tudo. Pausar não pode mexer nisso, e religar tem de
    // devolver exatamente este estado.
    await db.query(
      `insert into public.notification_preferences (user_id, social_follows, trip_tasks)
       values ($1, false, false)`,
      [ANA]
    );
    await db.query(
      'update public.notification_preferences set all_enabled = false where user_id = $1',
      [ANA]
    );

    for (const type of NOTIFICATION_TYPES) {
      await notificar(db, ANA, type);
    }
    // Zero, e não um: na entrega anterior `like` não tinha categoria e passava
    // mesmo pausado. Agora todo tipo vivo está mapeado, então a pausa geral
    // silencia tudo de verdade. A regra "sem categoria passa" segue valendo — é o
    // teste acima, que a cobra pelo predicado.
    assert.equal(await contar(db, ANA), 0, 'a pausa geral deixou passar aviso com categoria');

    const { rows } = await db.query(
      `select all_enabled, social_follows, social_comments, trip_invites, trip_tasks
         from public.notification_preferences where user_id = $1`,
      [ANA]
    );
    assert.deepEqual(rows[0], {
      all_enabled: false,
      // Preservadas, não zeradas: é isto que faz religar voltar ao que estava.
      social_follows: false,
      trip_tasks: false,
      social_comments: true,
      trip_invites: true,
    });

    // Religar: o que estava desligado continua desligado, o resto volta.
    await db.query(
      'update public.notification_preferences set all_enabled = true where user_id = $1',
      [ANA]
    );
    await db.query('delete from public.notifications where user_id = $1', [ANA]);

    await notificar(db, ANA, 'follow');
    assert.equal(await contar(db, ANA), 0, 'religar ressuscitou uma categoria desligada');

    await notificar(db, ANA, 'comment');
    assert.equal(await contar(db, ANA), 1, 'religar não devolveu as categorias ligadas');
  });
});

test('o filtro olha o DESTINATÁRIO, não quem gerou o aviso', async () => {
  await comBanco(async (db) => {
    // Bruno desligou seguidores; Ana não desligou nada. Bruno seguir Ana tem de
    // gerar aviso PARA ANA — a preferência de quem age não manda no que o outro
    // recebe. Ler a preferência pelo `actor_id` por engano passaria em qualquer
    // teste onde as duas contas têm a mesma configuração.
    await db.query(
      'insert into public.notification_preferences (user_id, social_follows) values ($1, false)',
      [BRUNO]
    );

    await notificar(db, ANA, 'follow', BRUNO);
    assert.equal(await contar(db, ANA), 1, 'a preferência do ator barrou o aviso do destinatário');

    await notificar(db, BRUNO, 'follow', ANA);
    assert.equal(await contar(db, BRUNO), 0, 'quem desligou recebeu');
  });
});

test('insert ... select grava para quem quer e pula quem desligou, na mesma instrução', async () => {
  // É assim que os avisos de viagem nascem (`insert ... select` sobre
  // trip_members): UMA instrução, uma linha por participante. Um trigger de
  // STATEMENT barraria todos ou nenhum; o FOR EACH ROW distingue.
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, trip_edits) values ($1, false)',
      [ANA]
    );

    await db.query(
      `insert into public.notifications (user_id, actor_id, type, message)
       select u.id, $1, 'trip_edit', 'editou a viagem'
         from auth.users u
        where u.id <> $1`,
      [BRUNO]
    );

    assert.equal(await contar(db, ANA), 0, 'Ana recebeu apesar de ter desligado');
  });
});

test('marcar como lida continua funcionando com a categoria desligada', async () => {
  // O trigger é BEFORE INSERT, não BEFORE UPDATE: aviso que já chegou não pode
  // sumir nem travar porque a preferência mudou depois.
  await comBanco(async (db) => {
    await notificar(db, ANA, 'follow');
    await db.query(
      'insert into public.notification_preferences (user_id, social_follows) values ($1, false)',
      [ANA]
    );

    await db.query('update public.notifications set read = true where user_id = $1', [ANA]);

    const { rows } = await db.query(
      'select read from public.notifications where user_id = $1',
      [ANA]
    );
    assert.deepEqual(rows, [{ read: true }]);
  });
});

// ---------------------------------------------------------------------------
// AS AMARRAS DA MIGRAÇÃO
// ---------------------------------------------------------------------------

test('o filtro é security definer com search_path fixo e execute revogado', () => {
  // Sem `security definer` a RLS esconde a preferência do destinatário, o select
  // volta zero linhas, e zero linhas significa "tudo ligado": o filtro nunca
  // barra nada e nenhum teste de uma conta só percebe.
  const corpo = MIGRATION.slice(MIGRATION.indexOf('function public.filter_notification_by_preference()'));
  assert.match(corpo, /security definer/);
  assert.match(corpo, /set search_path = ''/);
  assert.match(MIGRATION, /revoke all on function public\.filter_notification_by_preference\(\) from public/);
});

test('o trigger é BEFORE INSERT FOR EACH ROW em notifications', () => {
  assert.match(
    MIGRATION,
    /create trigger filter_notification_by_preference\s+before insert on public\.notifications\s+for each row/
  );
  // UPDATE de fora: ver o teste de "marcar como lida".
  assert.ok(!/before insert or update on public\.notifications/.test(MIGRATION));
});

test('a RLS deixa cada um só com a própria linha, e sem delete', () => {
  assert.match(MIGRATION, /alter table public\.notification_preferences enable row level security/);

  const policies = [...MIGRATION.matchAll(/create policy "[^"]+"\s+on public\.notification_preferences for (\w+)/g)]
    .map((m) => m[1]);
  assert.deepEqual(policies.sort(), ['insert', 'select', 'update']);

  // Três políticas, e as três presas a auth.uid().
  const trechos = MIGRATION.split('create policy').slice(1);
  for (const trecho of trechos) {
    assert.match(trecho, /user_id = auth\.uid\(\)/);
  }
});

test('nenhum caminho faz INSERT ... RETURNING em notifications', () => {
  // A amarra que torna seguro um trigger que devolve null. Um `returning` sobre
  // linha descartada volta vazio; um `into` ou `strict` do lado chamador
  // derrubaria a transação, e desligar notificação passaria a derrubar a ação que
  // a gerou (seguir alguém, salvar o roteiro).
  const arquivos = [
    ...fs.readdirSync(path.join(root, 'supabase/migrations')).map((f) => `supabase/migrations/${f}`),
  ];

  const listarJs = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory()
      ? listarJs(`${dir}/${entry.name}`)
      : entry.name.endsWith('.js') || entry.name.endsWith('.ts') ? [`${dir}/${entry.name}`] : []));

  // Comentários fora antes de procurar: o próprio cabeçalho desta migração
  // EXPLICA que não se deve usar `insert into notifications ... returning`, e um
  // scanner ingênuo acusaria a frase que documenta a regra.
  const semComentarios = (texto) => texto
    .replace(/--[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  for (const arquivo of [...arquivos, ...listarJs('src'), ...listarJs('supabase/functions')]) {
    const texto = semComentarios(fs.readFileSync(path.join(root, arquivo), 'utf8'));
    const suspeito = /insert\s+into\s+(public\.)?notifications[\s\S]{0,600}?returning/i.exec(texto);
    assert.equal(suspeito, null, `${arquivo} faz INSERT ... RETURNING em notifications`);
  }
});

// ---------------------------------------------------------------------------
// MENSAGEM DIRETA: UM AVISO POR CONVERSA
// ---------------------------------------------------------------------------
//
// Este é o bloco que decide se a volta do tipo `message` repete o erro que levou
// a 20260812130000 a removê-lo. Lá o defeito era uma linha de notificação POR
// MENSAGEM: trinta mensagens numa conversa enchiam o sino de trinta avisos
// idênticos e tornavam o resto invisível.
//
// O agrupamento é por LEITURA, não por tempo: o aviso continua sendo um só até a
// pessoa abrir a conversa. Então os casos que importam são "duas mensagens
// seguidas", "conversas diferentes" e "ler a conversa".

/** Uma conversa entre duas pessoas, pronta para receber mensagem. */
const criarConversa = async (db, participantes) => {
  const { rows } = await db.query(
    'insert into public.conversations (created_by) values ($1) returning id',
    [participantes[0]]
  );
  const id = rows[0].id;
  for (const pessoa of participantes) {
    await db.query(
      'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)',
      [id, pessoa]
    );
  }
  return id;
};

const enviar = (db, conversaId, autor, corpo) =>
  db.query(
    'insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)',
    [conversaId, autor, corpo]
  );

/** As notificações de mensagem de alguém, na ordem em que o sino as mostra. */
const avisosDeMensagem = async (db, userId) => {
  const { rows } = await db.query(
    `select conversation_id, actor_id, preview, read
       from public.notifications
      where user_id = $1 and type = 'message'
      order by created_at desc`,
    [userId]
  );
  return rows;
};

test('duas mensagens seguidas na mesma conversa geram UM aviso', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, conversa, BRUNO, 'oi');
    await enviar(db, conversa, BRUNO, 'tudo bem?');
    await enviar(db, conversa, BRUNO, 'vamos marcar?');

    const avisos = await avisosDeMensagem(db, ANA);
    assert.equal(avisos.length, 1, 'voltou a duplicar por mensagem');
    // O aviso carrega a ÚLTIMA mensagem: é o que o sino mostra como resumo, e um
    // resumo congelado na primeira mensagem seria pior do que nenhum.
    assert.equal(avisos[0].preview, 'vamos marcar?');
    assert.equal(avisos[0].conversation_id, conversa);
  });
});

test('o aviso sobe na lista a cada mensagem nova', async () => {
  // `created_at` é o que a tela ordena (`order by created_at desc`). Sem atualizar
  // esse campo, uma conversa ativa ficaria afundada embaixo de avisos mais novos e
  // menos relevantes.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, conversa, BRUNO, 'primeira');
    const { rows: antes } = await db.query(
      "select created_at from public.notifications where user_id = $1 and type = 'message'",
      [ANA]
    );

    await enviar(db, conversa, BRUNO, 'segunda');
    const { rows: depois } = await db.query(
      "select created_at from public.notifications where user_id = $1 and type = 'message'",
      [ANA]
    );

    assert.ok(
      depois[0].created_at >= antes[0].created_at,
      'o aviso não subiu: created_at ficou para trás'
    );
  });
});

test('conversas diferentes geram avisos separados, mesmo do mesmo remetente', async () => {
  // O caso que a deduplicação da TELA quase comeu: dois avisos de mensagem do
  // mesmo ator têm tipo, texto e photo_id iguais. É por isso que
  // `NotificationsScreen` passou a incluir `conversation_id` na chave.
  await comBanco(async (db) => {
    const uma = await criarConversa(db, [ANA, BRUNO]);
    const outra = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, uma, BRUNO, 'assunto A');
    await enviar(db, outra, BRUNO, 'assunto B');

    const avisos = await avisosDeMensagem(db, ANA);
    assert.equal(avisos.length, 2);
    assert.deepEqual(
      new Set(avisos.map((a) => a.conversation_id)),
      new Set([uma, outra])
    );
  });
});

test('quem enviou não recebe aviso da própria mensagem', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'oi');

    assert.equal((await avisosDeMensagem(db, BRUNO)).length, 0);
    assert.equal((await avisosDeMensagem(db, ANA)).length, 1);
  });
});

test('ler a conversa marca o aviso como lido', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'oi');

    // `mark_conversation_read` lê `auth.uid()`, então o teste precisa de sessão:
    // é o GUC que o helper transforma em usuário logado.
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ANA]);
    await db.query('select public.mark_conversation_read($1)', [conversa]);

    const avisos = await avisosDeMensagem(db, ANA);
    assert.equal(avisos.length, 1, 'o aviso não deve ser apagado, só marcado');
    assert.equal(avisos[0].read, true, 'o sino ficaria preso num número que ninguém zera');

    // E a mensagem em si, que é o comportamento antigo da função — preservado.
    const { rows } = await db.query(
      'select read_at from public.messages where conversation_id = $1',
      [conversa]
    );
    assert.notEqual(rows[0].read_at, null);
  });
});

test('depois de ler, a mensagem seguinte gera um aviso NOVO', async () => {
  // O outro lado do agrupamento por leitura: agrupar até a leitura é o certo;
  // agrupar DEPOIS dela significaria que a pessoa leu a conversa, recebeu mais
  // uma mensagem e não foi avisada. O `and read = false` do UPDATE é o que
  // garante isso.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'oi');

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ANA]);
    await db.query('select public.mark_conversation_read($1)', [conversa]);

    await enviar(db, conversa, BRUNO, 'voltei');

    const avisos = await avisosDeMensagem(db, ANA);
    assert.equal(avisos.length, 2, 'a mensagem depois da leitura não avisou');
    assert.equal(avisos.filter((a) => a.read === false).length, 1);
  });
});

test('com a categoria de mensagens desligada, não insere nada', async () => {
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, social_messages) values ($1, false)',
      [ANA]
    );
    const conversa = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, conversa, BRUNO, 'oi');
    await enviar(db, conversa, BRUNO, 'alguém aí?');

    assert.equal((await avisosDeMensagem(db, ANA)).length, 0);
  });
});

test('desligar mensagens no meio não deixa o UPDATE reerguer o aviso antigo', async () => {
  // O FURO que um filtro só no INSERT deixaria aberto, e a razão de
  // `notification_enabled_for` existir: Ana já tem um aviso não lido quando
  // desliga a categoria. A mensagem seguinte passaria pelo caminho do UPDATE, que
  // nenhum trigger de INSERT alcança, e o aviso voltaria ao topo do sino de quem
  // acabou de pedir para não ser avisado.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'antes de desligar');

    const antes = await avisosDeMensagem(db, ANA);
    assert.equal(antes.length, 1);
    assert.equal(antes[0].preview, 'antes de desligar');

    await db.query(
      'insert into public.notification_preferences (user_id, social_messages) values ($1, false)',
      [ANA]
    );
    await enviar(db, conversa, BRUNO, 'depois de desligar');

    const depois = await avisosDeMensagem(db, ANA);
    // O aviso antigo não é apagado (desligar vale para o que vem), mas também não
    // é atualizado com a mensagem nova.
    assert.equal(depois.length, 1);
    assert.equal(depois[0].preview, 'antes de desligar', 'o UPDATE furou o filtro');
  });
});

test('a pausa geral também silencia mensagem direta', async () => {
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, all_enabled) values ($1, false)',
      [ANA]
    );
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'oi');

    assert.equal((await avisosDeMensagem(db, ANA)).length, 0);
  });
});

test('bloqueio impede o aviso, nos dois sentidos', async () => {
  for (const [bloqueador, bloqueado] of [[ANA, BRUNO], [BRUNO, ANA]]) {
    await comBanco(async (db) => {
      // A conversa pode já existir quando o bloqueio acontece: a RLS esconde a
      // conversa, mas uma mensagem em trânsito não deve virar aviso.
      const conversa = await criarConversa(db, [ANA, BRUNO]);
      await db.query(
        'insert into public.blocked_users (blocker_id, blocked_id) values ($1, $2)',
        [bloqueador, bloqueado]
      );

      await enviar(db, conversa, BRUNO, 'oi');
      assert.equal(
        (await avisosDeMensagem(db, ANA)).length,
        0,
        `bloqueio ${bloqueador === ANA ? 'de quem recebe' : 'de quem envia'} nao foi respeitado`
      );
    });
  }
});

test('mensagem com passaporte compartilhado não gera aviso de mensagem', async () => {
  // O `when (new.shared_passport_id is null)` do trigger de mensagem: dizer
  // "enviou uma mensagem" sobre um passaporte descreveria errado o que aconteceu.
  //
  // O passaporte precisa EXISTIR (FK para `passport_shares`), e desde que o tipo
  // `passport` voltou ao check este caso também afirma o outro lado: a linha cai
  // no trigger de passaporte, e só nele.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    const { rows } = await db.query(
      `insert into public.passport_shares (sender_id, recipient_id, snapshot)
       values ($1, $2, '{}'::jsonb) returning id`,
      [BRUNO, ANA]
    );
    await db.query(
      `insert into public.messages (conversation_id, sender_id, shared_passport_id, shared_passport)
       values ($1, $2, $3, '{}'::jsonb)`,
      [conversa, BRUNO, rows[0].id]
    );

    assert.equal((await avisosDeMensagem(db, ANA)).length, 0);

    const { rows: avisos } = await db.query(
      "select type from public.notifications where user_id = $1",
      [ANA]
    );
    assert.deepEqual(avisos, [{ type: 'passport' }]);
  });
});

test('mensagem sem corpo descreve o anexo em vez de ficar vazia', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await db.query(
      `insert into public.messages (conversation_id, sender_id, shared_photo)
       values ($1, $2, '{"id":"x"}'::jsonb)`,
      [conversa, BRUNO]
    );

    const avisos = await avisosDeMensagem(db, ANA);
    assert.equal(avisos[0].preview, 'Compartilhou uma publicação');
  });
});

test('o deep link de mensagem leva à conversa', () => {
  // A rota de `message` nunca foi removida de notificationRouting (só o tipo saiu
  // do banco), então o que este teste cobra é que ela continua de pé e que a
  // coluna que ela lê é pedida pelas telas.
  const { getRoute } = loadEsm('src/utils/notificationRouting.js');

  const rota = getRoute({
    type: 'message',
    conversation_id: 'c0ffee00-0000-0000-0000-000000000000',
    actor: { id: BRUNO, username: 'bruno' },
  });
  assert.equal(rota.name, 'Conversation');
  assert.equal(rota.params.conversationId, 'c0ffee00-0000-0000-0000-000000000000');
  assert.equal(rota.params.username, 'bruno');

  // Sem `conversation_id` no select, a rota volta null e o aviso vira um item que
  // não responde ao toque — foi assim que os tipos de viagem chegaram à produção.
  for (const arquivo of ['src/screens/NotificationsScreen.js', 'src/screens/profile/ProfileScreen.js']) {
    assert.match(
      fs.readFileSync(path.join(root, arquivo), 'utf8'),
      /conversation_id/,
      `${arquivo} nao pede conversation_id`
    );
  }
});

// ---------------------------------------------------------------------------
// PASSAPORTE COMPARTILHADO: UM AVISO POR PASSAPORTE
// ---------------------------------------------------------------------------
//
// O contraste com mensagem direta é o que estes testes protegem. Os dois tipos
// chegam pelo chat e dividem o mesmo interruptor, mas têm regras OPOSTAS de
// agrupamento:
//
//   `message`   uma linha por conversa não lida, atualizada a cada mensagem;
//   `passport`  uma linha por passaporte, nunca agrupada.
//
// O jeito de errar isso é o UPDATE de `notify_new_message` absorver um aviso de
// passaporte, ou o trigger de passaporte passar a reaproveitar linha. Nos dois
// casos o sintoma é um passaporte que foi enviado e não dá para abrir.

/** Um passaporte compartilhado numa conversa, como `shareWithUser` faz. */
const compartilharPassaporte = async (db, conversaId, autor, destinatario) => {
  const { rows } = await db.query(
    `insert into public.passport_shares (sender_id, recipient_id, snapshot)
     values ($1, $2, '{"visitedCountries":[]}'::jsonb) returning id`,
    [autor, destinatario]
  );
  const shareId = rows[0].id;

  await db.query(
    `insert into public.messages (conversation_id, sender_id, shared_passport_id, shared_passport)
     values ($1, $2, $3, '{}'::jsonb)`,
    [conversaId, autor, shareId]
  );
  return shareId;
};

const avisosDePassaporte = async (db, userId) => {
  const { rows } = await db.query(
    `select passport_share_id, conversation_id, actor_id, preview, read
       from public.notifications
      where user_id = $1 and type = 'passport'
      order by created_at desc`,
    [userId]
  );
  return rows;
};

test('passaporte compartilhado gera aviso próprio, com os dois identificadores', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    const share = await compartilharPassaporte(db, conversa, BRUNO, ANA);

    const avisos = await avisosDePassaporte(db, ANA);
    assert.equal(avisos.length, 1);
    // `passport_share_id` é o que o deep link usa; `conversation_id` é o que
    // `mark_conversation_read` usa. Faltando um, uma das duas coisas para de
    // funcionar — e nenhuma delas falha de forma visível.
    assert.equal(avisos[0].passport_share_id, share);
    assert.equal(avisos[0].conversation_id, conversa);
    assert.equal(avisos[0].actor_id, BRUNO);
  });
});

test('passaporte e mensagem na mesma conversa geram DOIS avisos distintos', async () => {
  // A regra central: o UPDATE de `notify_new_message` filtra `type = 'message'`,
  // então nunca absorve o aviso de passaporte. Se um dia absorver, o passaporte
  // desaparece do sino e fica sem caminho de abertura.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, conversa, BRUNO, 'te mandei meu passaporte');
    const share = await compartilharPassaporte(db, conversa, BRUNO, ANA);

    const { rows } = await db.query(
      `select type, passport_share_id from public.notifications
        where user_id = $1 order by type`,
      [ANA]
    );
    assert.deepEqual(rows.map((r) => r.type), ['message', 'passport']);
    assert.equal(rows[1].passport_share_id, share);

    // E a ordem inversa: mensagem DEPOIS do passaporte não deve TOCAR no aviso do
    // passaporte. Contar linhas não prova isso — o UPDATE de `notify_new_message`
    // não apaga nada, ele reescreve `preview`, `actor_id` e `created_at`. Sem o
    // filtro `type = 'message'` o passaporte continuaria existindo, com o texto da
    // mensagem no lugar do dele: um aviso que, pelo que está escrito, parece
    // mensagem, e que ninguém liga ao passaporte que não abriu.
    const passaporteAntes = (await avisosDePassaporte(db, ANA))[0];

    await enviar(db, conversa, BRUNO, 'viu?');

    const passaporteDepois = await avisosDePassaporte(db, ANA);
    assert.equal(passaporteDepois.length, 1);
    assert.deepEqual(passaporteDepois[0], passaporteAntes, 'a mensagem reescreveu o aviso do passaporte');

    const mensagens = await avisosDeMensagem(db, ANA);
    assert.equal(mensagens.length, 1);
    assert.equal(mensagens[0].preview, 'viu?');
  });
});

test('dois passaportes na mesma conversa são dois avisos', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    const primeiro = await compartilharPassaporte(db, conversa, BRUNO, ANA);
    const segundo = await compartilharPassaporte(db, conversa, BRUNO, ANA);

    const avisos = await avisosDePassaporte(db, ANA);
    assert.equal(avisos.length, 2, 'passaporte não pode ser agrupado');
    assert.deepEqual(
      new Set(avisos.map((a) => a.passport_share_id)),
      new Set([primeiro, segundo])
    );
  });
});

test('a categoria de mensagens diretas silencia os DOIS tipos', async () => {
  // Passaporte não tem interruptor próprio: ele chega pelo chat e obedece ao de
  // mensagens diretas. Um interruptor que silencia um e não o outro seria pior do
  // que nenhum, porque a pessoa não teria como descobrir qual.
  await comBanco(async (db) => {
    await db.query(
      'insert into public.notification_preferences (user_id, social_messages) values ($1, false)',
      [ANA]
    );
    const conversa = await criarConversa(db, [ANA, BRUNO]);

    await enviar(db, conversa, BRUNO, 'oi');
    await compartilharPassaporte(db, conversa, BRUNO, ANA);

    assert.equal((await avisosDeMensagem(db, ANA)).length, 0);
    assert.equal((await avisosDePassaporte(db, ANA)).length, 0);
  });
});

test('quem compartilhou não recebe aviso, e bloqueio impede o aviso', async () => {
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await compartilharPassaporte(db, conversa, BRUNO, ANA);
    assert.equal((await avisosDePassaporte(db, BRUNO)).length, 0);
  });

  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await db.query(
      'insert into public.blocked_users (blocker_id, blocked_id) values ($1, $2)',
      [ANA, BRUNO]
    );
    await compartilharPassaporte(db, conversa, BRUNO, ANA);
    assert.equal((await avisosDePassaporte(db, ANA)).length, 0);
  });
});

test('ler a conversa marca o aviso de passaporte como lido também', async () => {
  // Sem isto o sino ficaria preso: a pessoa abre a conversa, vê o passaporte ali
  // mesmo (ele aparece como anexo da mensagem), e o contador não zera.
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await enviar(db, conversa, BRUNO, 'olha');
    await compartilharPassaporte(db, conversa, BRUNO, ANA);

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ANA]);
    await db.query('select public.mark_conversation_read($1)', [conversa]);

    const { rows } = await db.query(
      'select type, read from public.notifications where user_id = $1 order by type',
      [ANA]
    );
    assert.deepEqual(rows, [
      { type: 'message', read: true },
      { type: 'passport', read: true },
    ]);
  });
});

test('mensagem sem passaporte no banco não gera aviso de passaporte', async () => {
  // O `shared_passport_id is not null` do `when`. Quando o insert em
  // `passport_shares` falha, o cliente manda a mensagem com o snapshot no jsonb e
  // `shared_passport_id` nulo — um aviso apontando para aquilo abriria
  // "Passaporte indisponível".
  await comBanco(async (db) => {
    const conversa = await criarConversa(db, [ANA, BRUNO]);
    await db.query(
      `insert into public.messages (conversation_id, sender_id, shared_passport)
       values ($1, $2, '{"visitedCountries":[]}'::jsonb)`,
      [conversa, BRUNO]
    );

    assert.equal((await avisosDePassaporte(db, ANA)).length, 0);
    // E cai no trigger de mensagem, que é o certo: para o banco aquilo é uma
    // mensagem com anexo, e o resumo descreve o anexo.
    assert.equal((await avisosDeMensagem(db, ANA)).length, 1);
  });
});

test('os dois triggers de mensagem não se sobrepõem', () => {
  // As condições são complementares: `is null` e `is not null` sobre a mesma
  // coluna, na mesma tabela. Nenhuma linha dispara os dois, e nenhuma escapa dos
  // dois — se alguém mexer num `when` sem mexer no outro, abre-se um buraco ou
  // uma duplicidade, e os dois são silenciosos.
  assert.match(
    MIGRATION,
    /create trigger on_message_created_notify\s+after insert on public\.messages\s+for each row\s+when \(new\.shared_passport_id is null\)/
  );
  assert.match(
    MIGRATION,
    /create trigger on_message_created_notify_passport\s+after insert on public\.messages\s+for each row\s+when \(new\.shared_passport_id is not null\)/
  );
});

test('o deep link do passaporte leva à tela do passaporte', () => {
  // A rota estava MORTA desde que o tipo saiu do check na 20260812130000: o
  // `case 'passport'` continuou em notificationRouting, sem nenhuma linha no banco
  // que chegasse até ele.
  const { getRoute, isRouteRegistered } = loadEsm('src/utils/notificationRouting.js');

  const share = 'deadbeef-0000-0000-0000-000000000000';
  const rota = getRoute({
    type: 'passport',
    passport_share_id: share,
    conversation_id: 'c0ffee00-0000-0000-0000-000000000000',
    actor: { id: BRUNO, username: 'bruno' },
  });

  assert.equal(rota.name, 'PassportDetail');
  assert.equal(rota.params.passportShareId, share);
  // A rota tem de estar registrada, senão o banner não navega.
  assert.ok(isRouteRegistered(rota.name));

  // E a tela precisa pedir a coluna, senão a rota volta null e o aviso não
  // responde ao toque.
  for (const arquivo of ['src/screens/NotificationsScreen.js', 'src/screens/profile/ProfileScreen.js']) {
    assert.match(
      fs.readFileSync(path.join(root, arquivo), 'utf8'),
      /passport_share_id/,
      arquivo + ' nao pede passport_share_id'
    );
  }
});

// ---------------------------------------------------------------------------
// O BANNER EM TEMPO REAL
// ---------------------------------------------------------------------------

test('o banner escuta UPDATE, e não só INSERT', () => {
  // O banner é o ÚNICO alerta em tempo real do app — não há push nativo. Da
  // segunda mensagem em diante o trigger ATUALIZA a linha em vez de inserir, então
  // sem o ouvinte de UPDATE o banner só apareceria na primeira mensagem de cada
  // conversa e o resto passaria invisível.
  const banner = fs.readFileSync(path.join(root, 'src/components/GlobalNotificationBanner.js'), 'utf8');

  assert.match(banner, /event: 'INSERT'/);
  assert.match(banner, /event: 'UPDATE'/);

  // A guarda que impede o "marcar como lida" de virar rajada de banners: abrir a
  // tela de notificações marca TODAS de uma vez, e cada uma emite um UPDATE.
  assert.match(banner, /if \(isUpdate && row\.read\) return;/);

  // Conteúdo trocado no banner visível em vez de um segundo banner empilhado.
  assert.match(banner, /setCurrent\(atual => \(atual && atual\.id === row\.id \? enriquecida : atual\)\)/);
});

test('o banner rearma a contagem de saída sem repetir a animação de entrada', () => {
  // O `id` não muda quando o conteúdo é trocado, e a animação de entrada é keyed
  // nele — então ela não roda de novo, que é o certo. Mas a contagem para esconder
  // vive no mesmo efeito: sem rearmá-la, a mensagem que chega a 2,4s de um banner
  // de 2,5s apareceria por 100ms.
  const banner = fs.readFileSync(path.join(root, 'src/components/NotificationBanner.js'), 'utf8');

  assert.match(banner, /const bumpedAt = notification\?\.bumpedAt \?\? null;/);
  assert.match(banner, /\}, \[bumpedAt, notificationId, visibleForMs\]\);/);
  // A animação de entrada continua presa ao id, e não ao bump.
  assert.match(banner, /\}, \[notificationId, visibleForMs, translateY, opacity, badgeProgress\]\);/);
  // E não rearma um banner que já começou a sair.
  assert.match(banner, /if \(hasExitedRef\.current \|\| !hideRef\.current\) return;/);
});
