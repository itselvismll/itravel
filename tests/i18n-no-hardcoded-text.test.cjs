// REGRA PERMANENTE: texto visível ao usuário não nasce cravado no código.
//
// POR QUE ESTE ARQUIVO EXISTE, E NÃO BASTA O AGENTS.md
//
// A regra está escrita no AGENTS.md ("Texto de interface: sempre por chave de
// tradução"). Documento, porém, envelhece calado — já aconteceu aqui: o
// comentário da migração de autoria descrevia um comportamento que o código
// tinha deixado de ter, e ninguém notou porque nada falhava. Uma regra sobre
// strings é ainda mais frágil: a tela nova em português funciona perfeitamente,
// passa em revisão, e o defeito só aparece meses depois, quando alguém troca o
// idioma e metade do app continua em português.
//
// Este teste é o que de fato segura a regra.
//
// ─────────────────────────────────────────────────────────────────────────────
// COMO ELE FUNCIONA: CATRACA, NÃO INTERRUPTOR
//
// A extração da fase 1 não cobriu o app inteiro — ela cobriu a vertical de
// PREFERÊNCIAS e as notificações, e o resto está sendo migrado em lotes. Um
// teste que simplesmente exigisse zero literal em `src/` falharia com 337
// achados em 52 arquivos, e a única forma de fazê-lo passar hoje seria
// desligá-lo.
//
// Então ele tem DUAS asserções, e é a segunda que faz a lista encolher sozinha:
//
//   1. arquivo FORA de `PENDENTES` não pode ter literal. É isto que impede uma
//      tela nova de nascer com português cravado, e é a regra valendo para tudo
//      que já foi migrado;
//
//   2. arquivo DENTRO de `PENDENTES` tem de ter literal. Parece estranho, mas é
//      o que impede a lista de virar depósito: quando um lote extrai um arquivo,
//      este teste falha dizendo "tire este arquivo da lista". Sem isso, um nome
//      ficaria lá para sempre e aquele arquivo deixaria de ser vigiado em
//      silêncio.
//
// `PENDENTES` só pode diminuir. Não existe caminho legítimo para acrescentar
// nome: arquivo novo nasce fora da lista, e portanto já sob a regra.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// A ALLOWLIST
//
// Exceção é DECISÃO REGISTRADA, não escape silencioso — por isso uma lista
// explícita, com o motivo de cada grupo, e não um padrão genérico tipo "ignore
// strings com menos de N letras" (que deixaria passar "Sair" e "Dia").
//
// O que entra aqui: texto que é o MESMO nos três idiomas. Traduzir não o
// mudaria, e passá-lo por `t()` só criaria três chaves idênticas para o tradutor
// errar.
const LITERAIS_PERMITIDOS = new Set([
  // Siglas de idioma do seletor. São o código do idioma, não uma palavra: "PT"
  // é PT em inglês e em espanhol. A sigla do "Automático" é a inicial, e é a
  // única que mudaria — por isso a tela de Idioma a monta a partir da chave,
  // não daqui.
  'PT', 'EN', 'ES',

  // Nome próprio do produto. "Journi" não se traduz.
  'Journi',
]);

/**
 * Símbolo, pontuação, número e emoji não são texto a traduzir.
 *
 * Separado da allowlist porque é uma CLASSE, não uma lista: "·", "—", "•", "→",
 * "%", "4,2 km" e "R$" seriam dezenas de entradas, e a regra "não tem duas
 * letras seguidas" descreve todas de uma vez. É a mesma razão de o detector
 * exigir `\p{L}{2,}`: uma letra isolada é inicial de avatar ou unidade, nunca
 * frase.
 */
const EH_TEXTO_HUMANO = (valor) => /\p{L}{2,}/u.test(valor);

// ─────────────────────────────────────────────────────────────────────────────
// O DETECTOR

const listarJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory()
    ? listarJs(path.join(dir, entry.name))
    : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []
));

/**
 * O texto visível ao usuário escrito direto no código.
 *
 * Duas formas, que é onde ele aparece na prática:
 *
 *   1. entre tags — `<Text>Salvar</Text>`;
 *   2. em prop de texto — `label="Salvar"`, `placeholder="Buscar"`.
 *
 * O que NÃO é procurado, de propósito: string em variável, em objeto de
 * configuração, em `console.*`, em nome de rota e em chave de storage. Varrer
 * toda string do arquivo acusaria `'#6C2BD9'`, `'trip_invite'` e
 * `'notifications'` — e um detector que grita demais é desligado, não corrigido.
 * As duas formas acima pegam o caso real: alguém escrevendo uma tela.
 *
 * @param {string} codigoBruto
 * @returns {string[]}
 */
const literaisVisiveis = (codigoBruto) => {
  // Comentário não é tela. O `{/* */}` do JSX sai primeiro porque atravessa
  // várias linhas e o filtro de `//` não o alcançaria.
  const codigo = codigoBruto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const achados = new Set();

  // 1. Texto entre tags.
  //
  // A classe excluída (`;=()\`[]|&*/+`) e o "uma linha só" são o que separa JSX
  // de código comum: sem eles, um `if (a > b)` numa linha e um `c < d` noutra
  // casam o trecho inteiro entre os dois, e módulos puros como `geoMeasure`
  // apareciam acusados de ter texto de interface.
  for (const m of codigo.matchAll(/>([^<>{}\n;=()`[\]|&*/+]*)</g)) {
    const texto = m[1].trim();
    if (texto && EH_TEXTO_HUMANO(texto)) achados.add(texto);
  }

  // 2. Props de texto visível.
  //
  // Lista fechada de props, e não "qualquer prop com string": `icon="heart"`,
  // `name="chevron-back"` e `testID="save"` são identificadores, não texto.
  const PROPS_DE_TEXTO = [
    'label', 'title', 'placeholder', 'subtitle',
    'accessibilityLabel', 'accessibilityHint',
    'emptyText', 'confirmText', 'cancelText',
  ].join('|');

  for (const m of codigo.matchAll(new RegExp(`\\b(?:${PROPS_DE_TEXTO})=(?:"([^"\\n]*)"|'([^'\\n]*)')`, 'g'))) {
    const texto = (m[1] ?? m[2] ?? '').trim();
    if (texto && EH_TEXTO_HUMANO(texto)) achados.add(texto);
  }

  return [...achados].filter((texto) => !LITERAIS_PERMITIDOS.has(texto));
};

// ─────────────────────────────────────────────────────────────────────────────
// A CATRACA
//
// Os 52 arquivos que a fase 1 ainda não alcançou, com a contagem de achados de
// quando a lista foi levantada — o número é referência para quem for pegar o
// arquivo, não uma asserção.
//
// A ORDEM DOS LOTES combinada: notificações (feito), screens/auth,
// screens/profile + screens/feed, screens/assistant, components/map +
// components/trip + PhotoUploader + resto, e por fim a migração de data/número.
//
// Ao extrair um arquivo, TIRE a linha dele daqui. O teste vai cobrar.
const PENDENTES = [
];

const pendentes = new Set(PENDENTES);

const porArquivo = listarJs(path.join(root, 'src')).map((absoluto) => {
  const relativo = path.relative(root, absoluto).split(path.sep).join('/');
  return [relativo, literaisVisiveis(fs.readFileSync(absoluto, 'utf8'))];
});

// ---------------------------------------------------------------------------

test('tela já migrada não tem texto cravado no código', () => {
  const infratores = porArquivo
    .filter(([arquivo, achados]) => achados.length && !pendentes.has(arquivo));

  const relato = infratores
    .map(([arquivo, achados]) => `\n  ${arquivo}\n    ${achados.map((a) => JSON.stringify(a)).join('\n    ')}`)
    .join('');

  assert.deepEqual(
    infratores.map(([arquivo]) => arquivo),
    [],
    'texto visível ao usuário escrito direto no código. Passe por t() e acrescente a '
    + 'chave em src/i18n/locales/pt.json (e rode `npm run sync:locales`). Se for '
    + 'exceção legítima — sigla, símbolo, nome próprio —, acrescente a '
    + `LITERAIS_PERMITIDOS aqui, COM o motivo:${relato}`
  );
});

test('a lista de pendentes só encolhe', () => {
  // A asserção que mantém a catraca honesta: arquivo extraído tem de sair da
  // lista, senão ele deixa de ser vigiado sem ninguém perceber.
  const jaLimpos = [...pendentes].filter((arquivo) => {
    const entrada = porArquivo.find(([nome]) => nome === arquivo);
    // Arquivo que não existe mais também sai da lista.
    return !entrada || entrada[1].length === 0;
  });

  assert.deepEqual(
    jaLimpos,
    [],
    'estes arquivos já estão extraídos (ou não existem mais): tire-os de PENDENTES '
    + `neste arquivo, para voltarem a ser vigiados:\n  ${jaLimpos.join('\n  ')}`
  );
});

test('a allowlist não cresceu sem motivo', () => {
  // Uma exceção sem uso é uma exceção que alguém esqueceu de remover — e toda
  // entrada aqui é um lugar por onde texto em português pode passar.
  const todoOCodigo = porArquivo
    .map(([arquivo]) => fs.readFileSync(path.join(root, arquivo), 'utf8'))
    .join('\n');

  for (const permitido of LITERAIS_PERMITIDOS) {
    assert.ok(
      todoOCodigo.includes(permitido),
      `"${permitido}" está em LITERAIS_PERMITIDOS e não aparece mais no código — remova a exceção`
    );
  }

  // Teto baixo de propósito: a allowlist é para sigla e nome próprio. Se ela
  // começar a crescer, é sinal de que está sendo usada para escapar da regra, e
  // a conversa precisa acontecer na revisão — não aqui.
  assert.ok(
    LITERAIS_PERMITIDOS.size <= 12,
    `a allowlist tem ${LITERAIS_PERMITIDOS.size} entradas. Exceção é decisão registrada: `
    + 'se são tantas, provavelmente há texto a traduzir entre elas'
  );
});

test('o detector reconhece as duas formas, e ignora o que não é texto', () => {
  // O detector é o que dá valor aos testes acima, então ele próprio é exercitado
  // aqui — incluindo os falsos positivos que ele precisou aprender a ignorar.
  const achar = (codigo) => literaisVisiveis(codigo);

  // Pega: texto entre tags e prop de texto.
  assert.deepEqual(achar('<Text>Salvar agora</Text>'), ['Salvar agora']);
  assert.deepEqual(achar('<Botao label="Entrar na conta" />'), ['Entrar na conta']);
  assert.deepEqual(achar("<Campo placeholder='Buscar país' />"), ['Buscar país']);

  // Não pega: chamada de tradução, que é o jeito certo.
  assert.deepEqual(achar("<Text>{t('common.actions.save')}</Text>"), []);
  assert.deepEqual(achar("<Botao label={t('drawer.items.logout')} />"), []);

  // Não pega: identificador em prop que não é de texto.
  assert.deepEqual(achar('<Ionicons name="chevron-back" />'), []);
  assert.deepEqual(achar('<View testID="save-button" />'), []);

  // Não pega: comentário, inclusive o de bloco do JSX, que atravessa linhas.
  assert.deepEqual(achar('{/* O botão diz Salvar */}'), []);
  assert.deepEqual(achar('// <Text>Salvar</Text>'), []);
  assert.deepEqual(achar('/* <Text>Salvar</Text> */'), []);

  // Não pega: comparação em código comum. Era o falso positivo que acusava
  // geoMeasure e activityAttribution de conter texto de interface.
  assert.deepEqual(achar('if (a > b) return;\nif (c < d) return;'), []);
  assert.deepEqual(achar('const x = contagem > limite ? alto : baixo;\nif (y < z) {}'), []);

  // Não pega: símbolo e pontuação, que não têm duas letras seguidas.
  assert.deepEqual(achar('<Text>·</Text>'), []);
  assert.deepEqual(achar('<Text>—</Text>'), []);
  assert.deepEqual(achar('<Text>%</Text>'), []);

  // PEGA, e é o certo: "4,2 km" cravado tem a vírgula decimal do português
  // dentro (em inglês é "4.2") e a unidade colada no número. Distância é
  // `formatDistance`, que formata o número pelo locale — não texto escrito à
  // mão. Foi este caso que me fez conferir: a primeira versão do teste esperava
  // [] aqui, e a expectativa estava errada, não o detector.
  assert.deepEqual(achar('<Text>4,2 km</Text>'), ['4,2 km']);

  // Não pega: o que está na allowlist.
  assert.deepEqual(achar('<Text>PT</Text>'), []);
  assert.deepEqual(achar('<Text>Journi</Text>'), []);
});
