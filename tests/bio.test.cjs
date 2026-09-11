// Validação da bio do perfil (src/utils/bio.js).
//
// A bio é opcional, aceita quebra de linha e emoji, e bloqueia duas coisas: link
// e palavrão. Os dois bloqueios IMPEDEM O SALVAMENTO com mensagem — nada é
// removido ou mascarado pelas costas de quem escreveu.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const {
  validateBio,
  normalizeBio,
  containsLink,
  findBlockedTerm,
  bioLength,
  countLineBreaks,
  BIO_MAX_LENGTH,
  BIO_MAX_LINES,
  BIO_MAX_LINE_BREAKS,
} = loadEsm('src/utils/bio.js', {});

test('bio vazia é válida e vira null', () => {
  // Campo opcional. O null distingue "não preencheu" de "preencheu com vazio".
  for (const input of ['', '   ', '\n\n', null, undefined]) {
    const result = validateBio(input);
    assert.equal(result.valid, true, `${JSON.stringify(input)} deveria ser válida`);
    assert.equal(result.value, null);
    assert.equal(result.error, null);
  }
});

test('limite de 160 caracteres', () => {
  assert.equal(BIO_MAX_LENGTH, 160);

  assert.equal(validateBio('a'.repeat(160)).valid, true);

  const tooLong = validateBio('a'.repeat(161));
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error, /no máximo 160 caracteres/);
});

test('o limite conta emoji como um caractere, não como bytes UTF-16', () => {
  // '😀' ocupa 2 unidades UTF-16: por String.length, 100 deles dariam 200 e a bio
  // seria recusada mesmo tendo 100 caracteres para quem escreveu.
  const cem = '😀'.repeat(100);
  assert.equal(cem.length, 200, 'premissa do teste: String.length conta o dobro');
  assert.equal(bioLength(cem), 100);
  assert.equal(validateBio(cem).valid, true);

  // E o contador da tela usa a MESMA função do limite, então eles nunca
  // discordam.
  assert.equal(bioLength('a'.repeat(161)), 161);
  assert.equal(validateBio('a'.repeat(161)).valid, false);
});

test('emoji e quebra de linha são aceitos', () => {
  const bio = 'Viajante 🌍✈️\nJá fui a 12 países 🇧🇷🇯🇵\nPróximo: Peru 🦙';
  const result = validateBio(bio);

  assert.equal(result.valid, true);
  // As quebras do MEIO sobrevivem — só as pontas são aparadas.
  assert.equal(result.value, bio);
  assert.match(result.value, /\n/);
});

test('apara as pontas mas preserva as quebras internas', () => {
  const result = validateBio('  \n Amo viajar\nE fotografar \n  ');
  assert.equal(result.value, 'Amo viajar\nE fotografar');
});

test('detecta link em vários formatos', () => {
  const links = [
    'http://exemplo.com',
    'https://exemplo.com/perfil',
    'HTTPS://EXEMPLO.COM',
    'ftp://arquivos.exemplo.com',
    'www.instagram.com',
    'siga em www.meusite.com.br agora',
    'instagram.com/meuperfil',
    'meusite.com',
    'canal.tv',
    'loja.shop',
    'algum.site',
    'contato: fulano.dev',
  ];

  for (const bio of links) {
    assert.equal(containsLink(bio), true, `não detectou link em "${bio}"`);

    const result = validateBio(bio);
    assert.equal(result.valid, false, `deixou salvar "${bio}"`);
    assert.match(result.error, /Links não são permitidos/);
  }
});

test('texto comum com ponto não é confundido com link', () => {
  // O padrão de domínio sem protocolo é o mais fácil de errar: precisa pegar
  // "meusite.com" sem acusar fim de frase nem número decimal.
  const naoSaoLinks = [
    'Cheguei em SP. Foi ótimo.',
    'Nota 3.5 no hotel',
    'Sou dev. Viajo sempre.',
    'Já visitei 12 países... e contando',
    'Trabalho com T.I. e viajo',
    'Amo Paris, Roma e Lisboa',
  ];

  for (const bio of naoSaoLinks) {
    assert.equal(containsLink(bio), false, `acusou link falso em "${bio}"`);
    assert.equal(validateBio(bio).valid, true, `bloqueou indevidamente "${bio}"`);
  }
});

test('detecta termo bloqueado', () => {
  for (const bio of ['vc eh um otario', 'que merda de viagem', 'CARALHO que lugar']) {
    assert.ok(findBlockedTerm(bio), `não detectou palavrão em "${bio}"`);

    const result = validateBio(bio);
    assert.equal(result.valid, false);
    assert.match(result.error, /palavra que não é permitida/);
  }
});

test('pega o disfarce óbvio com número no lugar da letra', () => {
  // Não é à prova de quem quer burlar — nenhum filtro é. Cobre o caso comum.
  assert.ok(findBlockedTerm('p0rra'));
  assert.ok(findBlockedTerm('m3rda'));
  assert.ok(findBlockedTerm('put@'));
});

test('palavra comum que CONTÉM um termo bloqueado não é barrada', () => {
  // O falso positivo é o que faz o usuário achar que o app está quebrado:
  // "reputação" contém "puta", "computador" contém "puta".
  const inocentes = [
    'Cuido da minha reputação',
    'Trabalho com computador o dia todo',
    'Amo o Grand Canyon',
    'Analista de sistemas',
    'Sou de Cuiabá',
  ];

  for (const bio of inocentes) {
    assert.equal(findBlockedTerm(bio), null, `falso positivo em "${bio}"`);
    assert.equal(validateBio(bio).valid, true, `bloqueou indevidamente "${bio}"`);
  }
});

test('palavrão colado em pontuação ainda é pego', () => {
  // A busca é por palavra inteira, mas emoji e pontuação contam como fronteira —
  // senão "merda!" passaria.
  assert.ok(findBlockedTerm('que merda!'));
  assert.ok(findBlockedTerm('(porra)'));
  assert.ok(findBlockedTerm('merda😀'));
});

test('acento não escapa do filtro', () => {
  assert.ok(findBlockedTerm('otário'));
  assert.ok(findBlockedTerm('OTÁRIO'));
});

test('uma bio normal passa inteira', () => {
  const bio = 'Fotógrafa de viagem 📷\n32 países visitados\nApaixonada por montanhas ⛰️';
  const result = validateBio(bio);

  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.equal(result.value, bio);
  assert.ok(bioLength(bio) <= BIO_MAX_LENGTH);
});

test('a validação também roda no serviço, não só na tela', () => {
  // A regra é de produto: qualquer caminho que chegue ao updateProfile precisa
  // passar por ela, senão bastaria chamar o serviço direto para gravar um link.
  const fs = require('fs');
  const path = require('path');
  const service = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/services/profileService.js'),
    'utf8'
  );

  assert.match(service, /import \{ validateBio \} from '\.\.\/utils\/bio'/);
  assert.match(service, /const bio = validateBio\(sanitizedUpdates\.bio\)/);
  assert.match(service, /if \(!bio\.valid\) return \{ success: false, error: bio\.error \}/);
  // E o campo precisa estar na allowlist, senão ele seria descartado em silêncio.
  assert.match(service, /allowedFields = \['username', 'display_name', 'avatar_url', 'bio'\]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exibição: a bio não pode vazar do card.
//
// O sintoma era o texto esticando horizontalmente para fora do cartão em vez de
// quebrar, com sequência longa sem espaço.
//
// A CAUSA não estava no Text, e sim no pai: o `styles.header` das duas telas de
// perfil tem `alignItems: 'center'`, que em flexbox dimensiona cada filho pelo
// CONTEÚDO e não pela largura do pai. Com texto normal isso não aparece — o
// conteúdo cabe. Com "aaaa…" a largura de conteúdo é a linha inteira, e o Text
// cresce para fora.
//
// LIMITE DESTES TESTES, dito com todas as letras: eles verificam que a restrição
// de largura ESTÁ no estilo. Nenhum teste aqui renderiza nem calcula layout — o
// projeto não tem renderer, e jsdom não faria layout de qualquer forma. A
// confirmação visual de que nada vaza precisa de device/navegador.
// ─────────────────────────────────────────────────────────────────────────────
const fsDisplay = require('fs');
const pathDisplay = require('path');
const readScreen = (file) =>
  fsDisplay.readFileSync(pathDisplay.resolve(__dirname, '..', file), 'utf8');

const PERFIS = [
  'src/screens/profile/ProfileScreen.js',
  'src/screens/profile/PublicProfileScreen.js',
];

test('as duas telas de perfil restringem a largura da bio', () => {
  for (const file of PERFIS) {
    const source = readScreen(file);

    // O bloco de estilo da bio.
    const bloco = source.match(/\n  bio: \{([\s\S]*?)\n  \},/);
    assert.ok(bloco, `${file}: não achei o estilo bio`);

    // A restrição de largura é o que impede o vazamento. Aceita qualquer
    // mecanismo válido (stretch ou largura explícita) para não travar um
    // refactor legítimo, mas reprova se ela sumir de vez.
    assert.match(
      bloco[1],
      /alignSelf:\s*'stretch'|width:\s*'100%'/,
      `${file}: a bio precisa de restrição de largura, senão o pai com ` +
        `alignItems:'center' a dimensiona pelo conteúdo e ela vaza do card`
    );

    // Centralização tem de vir do textAlign, não do alinhamento da caixa —
    // senão a correção acima desalinha o visual e alguém a remove.
    assert.match(bloco[1], /textAlign:\s*'center'/, `${file}: a bio perdeu o textAlign`);

    // numberOfLines truncaria a bio e ESCONDERIA o vazamento em vez de
    // corrigi-lo, além de comer as quebras de linha que a pessoa escreveu.
    assert.doesNotMatch(source, /style=\{styles\.bio\}[^>]*numberOfLines/);
  }
});

test('o pai continua sendo o que exige a restrição', () => {
  // Documenta o acoplamento: é o alignItems:'center' do header que torna o
  // stretch necessário. Se um dia ele sair, este teste falha e quem estiver
  // mexendo lê o comentário acima antes de remover a correção junto.
  for (const file of PERFIS) {
    const source = readScreen(file);
    const header = source.match(/\n  header: \{([\s\S]*?)\n  \},/);
    assert.ok(header, `${file}: não achei o estilo header`);
    assert.match(
      header[1],
      /alignItems:\s*'center'/,
      `${file}: o header mudou de alinhamento — reavalie o alignSelf da bio`
    );
  }
});

test('as bios que motivaram o bug são válidas e chegam à tela', () => {
  // Se a validação recusasse estas entradas, o bug de layout não existiria.
  // Elas passam, então é o layout que precisa dar conta.
  const cento = 'Viajante apaixonada por montanhas e mar. '.repeat(4).slice(0, BIO_MAX_LENGTH);
  const semEspaco = 'a'.repeat(BIO_MAX_LENGTH);
  const sequenciaNoMeio = `Oi ${'b'.repeat(140)} tchau`;

  for (const [nome, texto] of [
    ['160 caracteres normais', cento],
    ['160 caracteres sem nenhum espaço', semEspaco],
    ['sequência longa no meio da frase', sequenciaNoMeio],
  ]) {
    const resultado = validateBio(texto);
    assert.equal(resultado.valid, true, `${nome} foi recusada: ${resultado.error}`);
    assert.ok(bioLength(texto) <= BIO_MAX_LENGTH, `${nome} passou do limite`);
  }

  // A sequência sem espaço não pode ser confundida com link: sem ponto, não há
  // domínio. Se fosse bloqueada, o caso do bug nunca chegaria ao render.
  assert.equal(containsLink(semEspaco), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Compactação de quebras de linha.
//
// Dez Enters seguidos abriam um vão vertical enorme no perfil e empurravam o
// texto para baixo — abuso de formatação, não conteúdo. A regra: no máximo uma
// linha em branco entre blocos, ou seja no máximo dois \n seguidos.
//
// É SILENCIOSA de propósito: recusar o salvamento por causa de Enter a mais
// seria implicância, e nenhum texto é perdido — só o vão.
// ─────────────────────────────────────────────────────────────────────────────

test('qualquer bloco de 2+ quebras vira UMA quebra', () => {
  // Não existe linha em branco na bio: Enter só pula para a próxima linha de
  // texto. O alvo antes era '\n\n' (uma linha em branco), e com ele ainda dava
  // para ocupar meia tela empilhando linhas curtas.
  for (const quantidade of [2, 3, 5, 10, 25]) {
    const bio = `Primeiro bloco${'\n'.repeat(quantidade)}Segundo bloco`;
    assert.equal(
      normalizeBio(bio),
      'Primeiro bloco\nSegundo bloco',
      `${quantidade} quebras não viraram uma`
    );
    // E o valor salvo é o compactado.
    assert.equal(validateBio(bio).value, 'Primeiro bloco\nSegundo bloco');
  }
});

test('nenhuma linha em branco sobrevive à normalização', () => {
  for (const bio of ['a\n\nb', 'a\n\n\nb', 'Um\n\nDois\n\nTrês', 'a\nA\nA\n\nAA']) {
    assert.doesNotMatch(
      normalizeBio(bio),
      /\n\n/,
      `sobrou linha em branco em ${JSON.stringify(bio)}`
    );
  }
});

test('quebra simples fica intacta', () => {
  // Formatação legítima não pode ser tocada.
  const simples = 'Linha um\nLinha dois';
  assert.equal(normalizeBio(simples), simples);
  assert.equal(validateBio(simples).value, simples);
});

test('linha "em branco" com espaços conta como em branco, sem apagar os espaços', () => {
  // Quem cola de outro app traz "\n   \n   \n", que a olho nu é idêntico a
  // "\n\n\n" — as quebras excedentes precisam ser compactadas.
  //
  // Mas os ESPAÇOS não podem sumir junto. Esta expectativa já foi
  // `'Um\n\nDois'`, e era ela que codificava o bug: a função apagava os espaços
  // vizinhos ao bloco de quebras, e com isso comia caractere do texto do
  // usuário. As quatro quebras viram UMA; os espaços continuam todos lá.
  const comEspacos = normalizeBio('Um\n   \n   \n   \nDois');
  assert.equal((comEspacos.match(/\n/g) || []).length, 1, 'as quebras não foram compactadas');
  assert.equal(comEspacos.replace(/\n/g, ''), 'Um         Dois', 'espaços foram perdidos');

  const comTabs = normalizeBio('Um\n\t\n\t\nDois');
  assert.equal((comTabs.match(/\n/g) || []).length, 1);
  assert.equal(comTabs.replace(/\n/g, ''), 'Um\t\tDois');
});

test('CRLF do Windows é compactado igual', () => {
  assert.equal(normalizeBio('Um\r\n\r\n\r\n\r\nDois'), 'Um\nDois');
  // E o CRLF simples vira LF, sem virar duas quebras.
  assert.equal(normalizeBio('Um\r\nDois'), 'Um\nDois');
});

test('quebras nas pontas somem, como já acontecia', () => {
  assert.equal(normalizeBio('\n\n\n\nOlá\n\n\n\n'), 'Olá');
  assert.equal(validateBio('\n\n\n\nOlá\n\n\n\n').value, 'Olá');
});

test('só quebras não é bio: vira null', () => {
  for (const entrada of ['\n\n\n\n\n', '\n   \n   \n', '\r\n\r\n\r\n']) {
    const resultado = validateBio(entrada);
    assert.equal(resultado.valid, true);
    assert.equal(resultado.value, null);
  }
});

test('o limite de 160 mede o texto JÁ compactado', () => {
  // Uma bio que só passa de 160 por causa das quebras excedentes precisa salvar:
  // o que vai para o banco é o compactado, então é ele que tem de ser medido.
  // Medir o texto cru recusaria algo que cabe.
  const texto = 'a'.repeat(155);
  const comVaoEnorme = `${texto}${'\n'.repeat(30)}fim`;

  assert.ok(bioLength(comVaoEnorme) > BIO_MAX_LENGTH, 'premissa: o texto cru estoura');

  const resultado = validateBio(comVaoEnorme);
  assert.equal(resultado.valid, true, `recusou: ${resultado.error}`);
  assert.equal(resultado.value, `${texto}\nfim`);
  assert.ok(bioLength(resultado.value) <= BIO_MAX_LENGTH);

  // E o que passa de 160 DEPOIS de compactar continua sendo recusado.
  const longoDeVerdade = `${'a'.repeat(160)}\n\n\n\nb`;
  assert.equal(validateBio(longoDeVerdade).valid, false);
});

test('espaço e quebra continuam contando como caractere', () => {
  // A compactação mudou; a contagem não. Quebra e espaço contam normalmente.
  assert.equal(bioLength('a\nb'), 3);
  assert.equal(bioLength('a b'), 3);
  assert.equal(bioLength('a\n\nb'), 4);
});

test('a exibição normaliza bio antiga, gravada antes da regra', () => {
  // Defensivo: quem já salvou dez linhas em branco continua com elas no banco.
  // A tela não pode reproduzir o vão.
  for (const file of PERFIS) {
    const source = readScreen(file);
    assert.match(
      source,
      /<Text style=\{styles\.bio\}>\{normalizeBio\(profile[?]?\.bio\)\}<\/Text>/,
      `${file}: a bio é exibida sem normalizar`
    );
    assert.match(source, /import \{ normalizeBio \} from '\.\.\/\.\.\/utils\/bio'/, `${file}: falta o import`);
  }
});

test('o contador da tela mede o mesmo texto que o limite', () => {
  // Se o contador medisse o texto cru, ele acusaria 170/160 em vermelho numa bio
  // que salva sem problema — o contador não pode discordar do erro.
  const edit = readScreen('src/screens/profile/EditProfileScreen.js');
  assert.match(edit, /const bioNormalized = normalizeBio\(bio\)/);
  assert.match(edit, /const bioCount = bioLength\(bioNormalized\)/);
  // O limite de linhas também é medido sobre o normalizado, pelo mesmo motivo.
  assert.match(edit, /countLineBreaks\(bioNormalized\) > BIO_MAX_LINE_BREAKS/);
});

test('a tela avisa do limite de linhas antes de a pessoa apertar Salvar', () => {
  // Descobrir um bloqueio só ao salvar é pior do que ver o aviso enquanto digita.
  const edit = readScreen('src/screens/profile/EditProfileScreen.js');
  assert.match(edit, /Máximo \$\{BIO_MAX_LINES\} linhas/);
  assert.match(edit, /A bio pode ter no máximo \$\{BIO_MAX_LINES\} linhas\./);
  // E a borda do campo acusa qualquer um dos dois bloqueios.
  assert.match(edit, /const bioInvalid = bioOverLength \|\| bioOverLines/);
});

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANTE: normalizeBio só remove QUEBRA DE LINHA.
//
// O bug que motivou isto: o padrão de compactação era
// `(?:[^\S\n]*\n){3,}[^\S\n]*` trocado por '\n\n'. O `[^\S\n]*` das pontas
// engolia os espaços e tabs vizinhos ao bloco de quebras, e a substituição os
// jogava fora junto — "BB\n\n\n n." virava "BB\n\nn.", sem o espaço. Ou seja, a
// função comia caractere do texto de quem escreveu.
//
// A regra agora é verificável: tire as quebras dos dois lados e o que sobra tem
// de ser idêntico. É o único ponto em que a função pode mexer.
// ─────────────────────────────────────────────────────────────────────────────

// As pontas são aparadas por decisão antiga e documentada (bio não começa nem
// termina com espaço), então a comparação apara os dois lados igualmente.
const semQuebras = (texto) => texto.replace(/[\r\n]/g, '').replace(/^\s+|\s+$/g, '');

test('nenhum caractere que não seja quebra de linha é removido ou alterado', () => {
  const casos = [
    // O caso exato do bug.
    'BB\n\n\n n.\r.n',
    'Ba. a \r\t\n\r😀😀',
    // Espaço colado no bloco de quebras, dos dois lados.
    'a   \n\n\nb',
    'a\n\n\n   b',
    'a   \n\n\n   b',
    // Linha em branco feita de espaços e de tabs.
    'Um\n   \n   \n   \nDois',
    'Um\n\t\n\t\nDois',
    // Texto de verdade.
    'Fotógrafa de viagem 📷\n\n\n\n32 países visitados\n\nMontanhas ⛰️',
    'Viajante 🌍✈️\n\n\n\n\n\n\n\n\n\nAmo o mar',
    // Emoji composto grudado nas quebras (não pode ser partido).
    '🇧🇷\n\n\n\n🇯🇵',
    '👨‍👩‍👧\n\n\n\n\nfamília',
    // Sem quebra nenhuma.
    'Uma bio comum, sem quebras.',
    // Só quebras.
    '\n\n\n\n\n',
  ];

  for (const entrada of casos) {
    const saida = normalizeBio(entrada);
    assert.equal(
      semQuebras(saida),
      semQuebras(entrada),
      `conteúdo alterado.\n  entrada: ${JSON.stringify(entrada)}\n  saída:   ${JSON.stringify(saida)}`
    );
  }
});

test('a invariante vale para entrada aleatória (fuzz)', () => {
  // O caso do bug tinha uma forma específica — espaço encostado num bloco de 3+
  // quebras. Uma lista fixa de exemplos pode não conter a próxima forma; o fuzz
  // contém. Este teste rodado contra a versão com bug acusa milhares de falhas.
  const alfabeto = ['a', 'B', 'n', 'A', ' ', '\t', '\n', '\r', '\n\n', 'é', '😀', '.', ',', '  '];
  const aleatorio = (max) => Math.floor(Math.random() * max);

  for (let amostra = 0; amostra < 20000; amostra += 1) {
    let entrada = '';
    const tamanho = 1 + aleatorio(16);
    for (let i = 0; i < tamanho; i += 1) entrada += alfabeto[aleatorio(alfabeto.length)];

    const saida = normalizeBio(entrada);
    assert.equal(
      semQuebras(saida),
      semQuebras(entrada),
      `conteúdo alterado.\n  entrada: ${JSON.stringify(entrada)}\n  saída:   ${JSON.stringify(saida)}`
    );
  }
});

test('a compactação continua fazendo o trabalho dela', () => {
  // A invariante acima seria satisfeita por uma função que não faz nada. Este
  // teste garante que a correção não desligou a compactação.
  const contarQuebras = (texto) => (texto.match(/\n/g) || []).length;

  for (const quantidade of [2, 3, 5, 10, 25]) {
    const entrada = `Bloco um${'\n'.repeat(quantidade)}Bloco dois`;
    assert.equal(contarQuebras(normalizeBio(entrada)), 1, `${quantidade} quebras não compactaram`);
  }

  assert.equal(contarQuebras(normalizeBio('a\nb')), 1);
  assert.equal(contarQuebras(normalizeBio('a\n\nb')), 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Limite de LINHAS.
//
// A compactação de blocos sozinha não resolvia o problema: "a\nA\nA\n\nAA\n\nAAA"
// vira "a\nA\nA\nAA\nAAA" — nenhuma linha em branco, e ainda assim uma coluna de
// texto ocupando meia tela.
//
// Este limite BLOQUEIA, e não compacta. Juntar quebras coladas não muda o que a
// pessoa escreveu; juntar quebras ESPALHADAS reescreveria a formatação que ela
// escolheu. Melhor recusar e explicar.
// ─────────────────────────────────────────────────────────────────────────────

test('o limite é de 4 quebras / 5 linhas', () => {
  assert.equal(BIO_MAX_LINE_BREAKS, 4);
  assert.equal(BIO_MAX_LINES, 5);
});

test('bio dentro do limite de linhas salva', () => {
  for (const quebras of [0, 1, 2, 3, 4]) {
    const bio = Array.from({ length: quebras + 1 }, (_, i) => `Linha ${i + 1}`).join('\n');
    const resultado = validateBio(bio);

    assert.equal(resultado.valid, true, `${quebras} quebras foi recusada: ${resultado.error}`);
    assert.equal(countLineBreaks(resultado.value), quebras);
  }
});

test('bio com 5 ou mais quebras é bloqueada com mensagem', () => {
  for (const quebras of [5, 6, 10]) {
    const bio = Array.from({ length: quebras + 1 }, (_, i) => `L${i + 1}`).join('\n');
    const resultado = validateBio(bio);

    assert.equal(resultado.valid, false, `${quebras} quebras passou`);
    assert.match(resultado.error, /no máximo 5 linhas/);
  }
});

test('o caso reportado é bloqueado', () => {
  // A bio que ocupava quase metade da tela.
  const resultado = validateBio('a\nA\nA\n\nAA\n\nAAA\n\nA');

  // A normalização já tira as linhas em branco...
  assert.equal(normalizeBio('a\nA\nA\n\nAA\n\nAAA\n\nA'), 'a\nA\nA\nAA\nAAA\nA');
  // ...mas sobram 5 quebras, uma acima do limite, e aí o salvamento é recusado.
  assert.equal(resultado.valid, false);
  assert.match(resultado.error, /no máximo 5 linhas/);
});

test('o limite conta as quebras DEPOIS de compactar', () => {
  // "a\n\n\n\nb" gasta uma quebra do orçamento, não quatro: o bloco vira uma só
  // antes da contagem. Contar o texto cru recusaria uma bio de duas linhas.
  const resultado = validateBio('a\n\n\n\n\n\n\n\nb');

  assert.equal(resultado.valid, true, `recusou: ${resultado.error}`);
  assert.equal(resultado.value, 'a\nb');

  // Cinco linhas de verdade, cada uma com um bloco de quebras antes: ainda cabe.
  const cincoLinhas = 'L1\n\n\nL2\n\n\nL3\n\n\nL4\n\n\nL5';
  assert.equal(validateBio(cincoLinhas).valid, true);
  assert.equal(validateBio(cincoLinhas).value, 'L1\nL2\nL3\nL4\nL5');
});

test('a recusa por linhas não altera o texto que volta', () => {
  // `value` volta normalizado mesmo quando inválido, para a tela poder mostrar o
  // que seria salvo — mas o conteúdo não pode ter sido mexido além das quebras.
  const entrada = 'um\ndois\ntrês\nquatro\ncinco\nseis';
  const resultado = validateBio(entrada);

  assert.equal(resultado.valid, false);
  assert.equal(
    resultado.value.replace(/\n/g, ''),
    entrada.replace(/\n/g, ''),
    'a recusa mexeu no conteúdo'
  );
});
