// A tela de Perguntas frequentes tem TRÊS lugares que precisam combinar:
//
//   docs/faq-content.md          -- a fonte de verdade do TEXTO
//   src/utils/faqContent.js      -- a ESTRUTURA (categorias, perguntas, chaves)
//   src/i18n/locales/pt.json     -- o TEXTO de verdade, por chave
//
// Os três divergem em silêncio se alguém editar um e esquecer os outros --
// este arquivo é o que cobra que não divergiram.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FAQ_CATEGORIES, findFaqCategory } = require('../src/utils/faqContent');
const pt = require('../src/i18n/locales/pt.json');
const en = require('../src/i18n/locales/en.json');
const es = require('../src/i18n/locales/es.json');

const root = path.resolve(__dirname, '..');
const faqDoc = fs.readFileSync(path.join(root, 'docs/faq-content.md'), 'utf8');

const resolveKey = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);

test('docs/faq-content.md tem 10 categorias (##) e o mesmo total de perguntas (**...**) que o módulo', () => {
  const categoriasNoDoc = [...faqDoc.matchAll(/^## .+$/gm)].length;
  const perguntasNoDoc = [...faqDoc.matchAll(/^\*\*.+\*\*$/gm)].length;
  const totalPerguntasNoModulo = FAQ_CATEGORIES.reduce((soma, c) => soma + c.questions.length, 0);

  assert.equal(FAQ_CATEGORIES.length, categoriasNoDoc, 'categorias do módulo != categorias (##) do doc');
  assert.equal(totalPerguntasNoModulo, perguntasNoDoc, 'perguntas do módulo != perguntas (**...**) do doc');
});

test('toda categoria tem pelo menos uma pergunta, e nenhuma key se repete', () => {
  const todasAsKeys = new Set();
  for (const category of FAQ_CATEGORIES) {
    assert.ok(category.questions.length > 0, `categoria "${category.key}" sem pergunta`);
    assert.ok(!todasAsKeys.has(category.key), `category key "${category.key}" duplicada`);
    todasAsKeys.add(category.key);

    const questionKeysDaCategoria = new Set();
    for (const question of category.questions) {
      assert.ok(
        !questionKeysDaCategoria.has(question.key),
        `pergunta "${question.key}" duplicada em "${category.key}"`
      );
      questionKeysDaCategoria.add(question.key);
    }
  }
});

test('toda chave do módulo (título, pergunta, resposta) resolve para string não vazia nos três idiomas', () => {
  for (const category of FAQ_CATEGORIES) {
    for (const [name, dict] of [['pt', pt], ['en', en], ['es', es]]) {
      const titulo = resolveKey(dict, category.titleKey);
      assert.equal(typeof titulo, 'string', `${category.titleKey} não é string em ${name}`);
      assert.ok(titulo.length > 0, `${category.titleKey} vazio em ${name}`);
    }

    for (const question of category.questions) {
      for (const [name, dict] of [['pt', pt], ['en', en], ['es', es]]) {
        const pergunta = resolveKey(dict, question.questionKey);
        const resposta = resolveKey(dict, question.answerKey);
        assert.equal(typeof pergunta, 'string', `${question.questionKey} não é string em ${name}`);
        assert.ok(pergunta.length > 0, `${question.questionKey} vazio em ${name}`);
        assert.equal(typeof resposta, 'string', `${question.answerKey} não é string em ${name}`);
        assert.ok(resposta.length > 0, `${question.answerKey} vazio em ${name}`);
      }
    }
  }
});

test('findFaqCategory acha categoria existente e devolve null para chave desconhecida', () => {
  assert.equal(findFaqCategory('account')?.key, 'account');
  assert.equal(findFaqCategory('categoria-que-nao-existe'), null);
});

test('a pergunta com lista de papéis preserva os três papéis e o formato "- **Papel** — texto"', () => {
  // É a única resposta com marcação de lista/negrito na copy -- prova que o
  // texto chegou inteiro na chave, sem ser resumido.
  const resposta = resolveKey(pt, 'faq.categories.groupTrips.questions.participantRoles.answer');
  assert.match(resposta, /- \*\*Organizador\*\* —/);
  assert.match(resposta, /- \*\*Editor\*\* —/);
  assert.match(resposta, /- \*\*Visualizador\*\* —/);
});

test('SettingsDrawer tem o item de FAQ, perto de "Falar com o time"', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/SettingsDrawer.js'), 'utf8');
  assert.match(source, /onFAQ/);
  assert.match(source, /t\('drawer\.items\.faq'\)/);
  // "Perto de": no mesmo bloco SUPORTE, não em outra seção.
  const supportBlock = source.slice(source.indexOf("t('drawer.sections.support')"));
  assert.match(supportBlock, /drawer\.items\.faq[\s\S]*talkToTeam/);
});

test('AppNavigator registra as duas telas do FAQ na mesma stack das outras telas de configurações', () => {
  const source = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
  assert.match(source, /name="FAQ" component=\{FAQScreen\}/);
  assert.match(source, /name="FAQCategory" component=\{FAQCategoryScreen\}/);
  // Mesma função que registra Support/BlockedUsers/NotificationPreferences/Language.
  const profileStackBlock = source.slice(
    source.indexOf('function ProfileStack'),
    source.indexOf('function ProfileStack') + 1500
  );
  assert.match(profileStackBlock, /name="FAQ"/);
  assert.match(profileStackBlock, /name="FAQCategory"/);
});

test('ProfileScreen passa onFAQ navegando para a tela "FAQ"', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/profile/ProfileScreen.js'), 'utf8');
  assert.match(source, /onFAQ=\{\(\) => \{[\s\S]*?navigation\.navigate\('FAQ'\)/);
});

// A folga da tab bar flutuante para QUALQUER tela da ProfileStack -- não só
// as duas da FAQ -- é coberta por tests/tab-bar-clearance.test.cjs, que
// descobre a tela a partir do AppNavigator.js em vez de nomeá-la aqui.
