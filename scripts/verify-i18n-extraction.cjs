// A INVARIANTE DA FASE 1: nada muda na tela.
//
// A extração troca texto literal por `t('chave')`. O jeito de errar é a chave
// apontar para um texto DIFERENTE do que estava escrito — um acento perdido, uma
// maiúscula trocada, uma frase reescrita "de passagem". Nada disso quebra teste
// nem typecheck: só aparece como copy alterada em produção.
//
// Este script compara o texto que o app mostrava ANTES (lido do git, versão
// HEAD) com o que o pt.json diz AGORA, string por string.
const { execSync } = require('child_process');
const fs = require('fs');

// As strings que foram extraídas, e de onde cada uma saiu no código original.
// Montada à mão de propósito: é a conferência, e gerar os dois lados do mesmo
// jeito não provaria nada.
const ESPERADO = [
  // SettingsDrawer
  ['drawer.closeLabel', 'Fechar configurações'],
  ['drawer.sections.account', 'CONTA'],
  ['drawer.sections.community', 'COMUNIDADE'],
  ['drawer.sections.preferences', 'PREFERÊNCIAS'],
  ['drawer.sections.support', 'SUPORTE'],
  ['drawer.items.editProfile', 'Editar perfil'],
  ['drawer.items.myTrips', 'Minhas viagens'],
  ['drawer.items.blockedUsers', 'Usuários bloqueados'],
  ['drawer.items.inviteFriends', 'Convidar amigos'],
  ['drawer.items.inviteFriendsSubtitle', 'Chame quem viaja com você'],
  ['drawer.items.notifications', 'Notificações'],
  ['drawer.items.talkToTeam', 'Falar com o time'],
  ['drawer.items.termsAndPrivacy', 'Termos e privacidade'],
  ['drawer.items.logout', 'Sair'],
  ['common.toast.linkCopied', 'Link copiado'],

  // NotificationPreferencesScreen
  ['notificationPreferences.title', 'Notificações'],
  ['notificationPreferences.all.label', 'Todas as notificações'],
  ['notificationPreferences.all.helpOn', 'Desligue para silenciar tudo sem perder suas escolhas abaixo.'],
  ['notificationPreferences.all.helpPaused', 'Pausadas. Suas escolhas continuam guardadas.'],
  ['notificationPreferences.sections.social', 'SOCIAL'],
  ['notificationPreferences.sections.trips', 'VIAGENS'],
  ['notificationPreferences.rows.social_follows', 'Novos seguidores'],
  ['notificationPreferences.rows.social_comments', 'Comentários nas suas publicações'],
  ['notificationPreferences.rows.social_likes', 'Curtidas nas suas publicações'],
  ['notificationPreferences.rows.social_messages', 'Mensagens diretas'],
  ['notificationPreferences.rows.social_messagesSubtitle', 'E passaportes recebidos no chat'],
  ['notificationPreferences.rows.trip_invites', 'Convites para viagens'],
  ['notificationPreferences.rows.trip_joins', 'Alguém entrou na viagem'],
  ['notificationPreferences.rows.trip_edits', 'Edições no roteiro'],
  ['notificationPreferences.rows.trip_editsSubtitle', 'Quando alguém altera uma parada'],
  ['notificationPreferences.rows.trip_tasks', 'Tarefas do grupo'],
  ['notificationPreferences.rows.trip_tasksSubtitle', 'Criadas e concluídas'],
  ['notificationPreferences.footnote', 'Avisos que já chegaram continuam no sino, mesmo depois de desligar uma categoria.'],
  ['common.toast.saveFailed', 'Não foi possível salvar'],
  ['common.actions.back', 'Voltar'],
];

// ─────────────────────────────────────────────────────────────────────────────
// AS MUDANÇAS DELIBERADAS DE COPY
//
// A fase 1 tem uma invariante: nada muda na tela. Estas DUAS entradas são
// exceções decididas, e estão aqui para não parecerem regressão quando alguém
// comparar o app com uma captura antiga.
//
// O CONTEXTO: o texto da notificação existia em DOIS lugares, com redações
// diferentes. A lista do sino mostrava o `message` gravado pelos triggers; o
// banner montava a frase no cliente, com `getTitle`. Oito dos dez tipos batiam
// palavra por palavra. Dois não — e viver com duas redações para o mesmo aviso
// era o defeito, não a solução.
//
// Ao unificar, a escolha foi pelo MELHOR TEXTO de cada caso, não pela fonte:
// isso muda uma superfície em cada um, e as duas estão registradas abaixo.
//
// Quem for mexer nisso: o texto agora vive SÓ em pt.json
// (`notifications.predicate.*`). A coluna `notifications.message` continua sendo
// gravada pelos triggers, mas não é mais lida para nenhum tipo conhecido.
const MUDANCAS_DELIBERADAS = [
  {
    chave: 'notifications.predicate.message',
    antesNoSino: 'enviou uma mensagem',
    antesNoBanner: 'te enviou uma mensagem',
    agora: 'te enviou uma mensagem',
    mudou: 'a lista do sino',
    porque: 'o "te" diz a quem a mensagem foi enviada, e é o que o banner já dizia',
  },
  {
    chave: 'notifications.predicate.passport',
    antesNoSino: 'compartilhou um passaporte com você',
    antesNoBanner: 'compartilhou um passaporte',
    agora: 'compartilhou um passaporte com você',
    mudou: 'o banner',
    porque: 'sem o "com você" a frase não distingue "compartilhou comigo" de "compartilhou com alguém"',
  },
];

const pt = JSON.parse(fs.readFileSync('src/i18n/locales/pt.json', 'utf8'));
const valor = (chave) => chave.split('.').reduce((o, k) => (o ?? {})[k], pt);

console.log('--- as duas mudanças deliberadas de copy ---');
let deliberadasErradas = 0;
for (const m of MUDANCAS_DELIBERADAS) {
  const agora = valor(m.chave);
  const ok = agora === m.agora;
  if (!ok) deliberadasErradas += 1;
  console.log(`  ${ok ? 'OK     ' : 'DIVERGE'} ${m.chave}`);
  console.log(`          mudou ${m.mudou}: ${JSON.stringify(m.antesNoSino)} / ${JSON.stringify(m.antesNoBanner)} -> ${JSON.stringify(m.agora)}`);
  if (!ok) console.log(`          mas pt.json diz ${JSON.stringify(agora)}`);
}

console.log('\n--- pt.json diz o mesmo que o código dizia? ---');
let divergentes = 0;
for (const [chave, textoAntigo] of ESPERADO) {
  const agora = valor(chave);
  if (agora !== textoAntigo) {
    divergentes += 1;
    console.log(`  DIVERGE ${chave}\n     antes: ${JSON.stringify(textoAntigo)}\n     agora: ${JSON.stringify(agora)}`);
  }
}
console.log(divergentes === 0 ? `  OK — ${ESPERADO.length} strings idênticas` : `  ${divergentes} divergência(s)`);

// E o outro lado: essas frases não podem ter sobrado soltas no código. Uma string
// que continua literal É uma string que não traduz.
console.log('\n--- as frases extraídas sumiram do código? ---');
const arquivos = [
  'src/components/SettingsDrawer.js',
  'src/screens/NotificationPreferencesScreen.js',
  'src/utils/notificationCategories.js',
];
let sobraram = 0;
for (const arquivo of arquivos) {
  const codigo = fs.readFileSync(arquivo, 'utf8')
    // Comentário não é tela: as frases citadas em comentário ficam.
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  for (const [, texto] of ESPERADO) {
    // Só frases com mais de um caractere e que não são também nome de coisa.
    if (texto.length < 5) continue;
    if (codigo.includes(texto)) {
      sobraram += 1;
      console.log(`  SOBROU em ${arquivo}: ${JSON.stringify(texto)}`);
    }
  }
}
console.log(sobraram === 0 ? '  OK — nenhuma frase literal sobrou' : `  ${sobraram} sobra(s)`);

// Prova final: o git mostra que os arquivos de tela só perderam literais e
// ganharam chamadas de t(), sem frase nova.
console.log('\n--- o diff introduz alguma frase em português NOVA? ---');
// O diff e lido SEM comentario: a varredura anterior acusou "Ingles" e
// "Automatico" escritos dentro de um {/* */} explicando a linha de Idioma —
// texto que nunca e renderizado. Tirar comentario de bloco (que atravessa
// varias linhas do diff) e linha antes de procurar frase e o que separa copy de
// prosa.
const diffBruto = execSync(
  'git diff -- src/components/SettingsDrawer.js src/screens/NotificationPreferencesScreen.js',
  { encoding: 'utf8' }
);

// Junta só as linhas ACRESCENTADAS num texto, tira os comentários desse texto, e
// só então procura frase. A ordem é o que importa: um `{/* */}` atravessa várias
// linhas do diff, então filtrar comentário linha por linha não o alcança — foi
// assim que a primeira versão acusou "Inglês" e "Automático" escritos dentro do
// comentário que explica a linha de Idioma, texto que nunca é renderizado.
const adicionado = diffBruto
  .split('\n')
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  .map((l) => l.slice(1))
  .join('\n')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

const adicionadas = [adicionado]
  // Frase em português dentro de aspas, que não seja uma chave de tradução.
  .flatMap((l) => [...l.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"/g)].map((m) => m[1] || m[2]))
  .filter((v) => /[áàâãéêíóôõúüç]|\b(de|da|do|para|com|não|você|suas)\b/i.test(v))
  .filter((v) => !/^[a-zA-Z]+(\.[a-zA-Z_]+)+$/.test(v));

if (adicionadas.length === 0) console.log('  OK — nenhuma frase literal nova');
else for (const a of new Set(adicionadas)) console.log('  NOVA:', JSON.stringify(a));

process.exit(deliberadasErradas || divergentes || sobraram || adicionadas.length ? 1 : 0);
