// Termos de Uso e Política de Privacidade públicos.
//
// As lojas exigem uma URL pública, acessível sem instalar o app. Antes destes
// arquivos, o "aceite de termos" do cadastro era dois Alert com texto escrito à
// mão, sem URL nenhuma — e a política prometia exclusão de conta que não existia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const DOCS = ['public/termos.html', 'public/privacidade.html'];

test('os dois documentos existem e são HTML em português', () => {
  for (const doc of DOCS) {
    const html = read(doc);
    assert.match(html, /^<!DOCTYPE html>/i, `${doc} não é um HTML completo`);
    assert.match(html, /<html lang="pt-BR">/, `${doc} sem lang pt-BR`);
    assert.match(html, /<title>[^<]+Journi<\/title>/, `${doc} sem title`);
    // Loja abre no celular: sem viewport o texto sai ilegível.
    assert.match(html, /name="viewport"/, `${doc} não é responsivo`);
  }
});

test('a extensão .html é obrigatória nos links — rota limpa não é confiável', () => {
  // O EAS Hosting faz fallback de SPA: qualquer caminho desconhecido devolve
  // HTTP 200 com o app. `/termos` responderia 200 mostrando o aplicativo, e nem
  // um monitoramento de status perceberia. Um arquivo real vence o fallback.
  const register = read('src/screens/auth/RegisterScreen.js');

  assert.match(register, /openLegalDoc\('termos\.html'\)/);
  assert.match(register, /openLegalDoc\('privacidade\.html'\)/);
  assert.doesNotMatch(
    register,
    /openLegalDoc\('(termos|privacidade)'\)/,
    'link sem .html: cairia no fallback SPA e mostraria o app'
  );

  // E os documentos apontam um para o outro com a extensão.
  assert.match(read('public/termos.html'), /href="\/privacidade\.html"/);
  assert.match(read('public/privacidade.html'), /href="\/termos\.html"/);
});

test('o cadastro abre a URL de verdade, e não um Alert com texto embutido', () => {
  const register = read('src/screens/auth/RegisterScreen.js');

  assert.match(register, /Linking\.openURL\(url\)/);
  // A base vem da constante compartilhada, senão a URL das lojas e a do app divergem.
  assert.match(register, /API_CONFIG\.WEB_APP_URL/);
  // Os Alert antigos não podem voltar.
  assert.doesNotMatch(register, /const showTerms =/);
  assert.doesNotMatch(register, /const showPrivacy =/);
  // E o aceite continua obrigatório.
  assert.match(register, /newErrors\.terms = 'Você deve aceitar os termos de uso'/);
});

test('a política descreve a exclusão de conta como ela realmente será', () => {
  const privacidade = read('public/privacidade.html');

  // Imediata, reversível por 5 dias fazendo login.
  assert.match(privacidade, /exclusão é imediata, e reversível por 5 dias/i);
  assert.match(privacidade, /fazer login novamente/i);
  assert.match(privacidade, /apagados permanentemente/i);
  assert.match(privacidade, /incluindo as fotos armazenadas/i);

  // O comportamento por tipo de dado, que é onde estão as decisões do produto.
  assert.match(privacidade, /Anonimizadas/);
  assert.match(privacidade, /Usuário removido/);
  assert.match(privacidade, /favoritaram/);

  // A promessa vaga do texto antigo não pode reaparecer.
  assert.doesNotMatch(privacidade, /deletar sua conta a qualquer momento/i);
});

test('a política declara os terceiros e o que o Gemini NÃO recebe', () => {
  const privacidade = read('public/privacidade.html');

  for (const terceiro of [
    'Supabase', 'hCaptcha', 'Gemini', 'Google Places',
    'Mapbox', 'Stadia', 'flagcdn', 'Wikimedia', 'Photon', 'Overpass',
    'restcountries', 'Frankfurter',
  ]) {
    assert.match(privacidade, new RegExp(terceiro, 'i'), `terceiro não declarado: ${terceiro}`);
  }

  // O ponto que protege o usuário e diferencia o documento: o Gemini não recebe
  // identificadores. É verdade no código (safeUserContext) e precisa estar aqui.
  assert.match(privacidade, /não inclui seu nome, seu e-mail, seu nome de usuário/i);
});

test('a política declara os dados sensíveis e o rastreamento de comportamento', () => {
  const privacidade = read('public/privacidade.html');

  // Os dois que passam despercebidos num inventário apressado.
  assert.match(privacidade, /restrições alimentares/i);
  assert.match(privacidade, /acessibilidade/i);
  assert.match(privacidade, /Comportamento na aba Explorar/i);
  // Localização: o que é guardado é a cidade, não rastreamento contínuo.
  assert.match(privacidade, /não é um rastreamento contínuo/i);
});

test('os documentos trazem controlador, idade mínima, base legal e foro', () => {
  const termos = read('public/termos.html');
  const privacidade = read('public/privacidade.html');

  assert.match(privacidade, /controlador/i);
  assert.match(privacidade, /LGPD|13\.709/);
  assert.match(privacidade, /art\. 18/);
  assert.match(privacidade, /São Paulo, Brasil/);

  assert.match(termos, /13 anos/);
  assert.match(privacidade, /13 anos/);
  assert.match(termos, /foro do domicílio do usuário/i);
  assert.match(termos, /leis da República Federativa do Brasil/i);
});

test('os marcadores pendentes são visíveis e consistentes nos dois documentos', () => {
  // Nome do responsável e e-mail de contato ainda não foram definidos. Enquanto
  // os marcadores existirem, o documento está publicável mas NÃO é conforme —
  // este teste garante que eles fiquem visíveis em vez de virar texto solto.
  const pendentes = ['[NOME COMPLETO DO RESPONSÁVEL]', '[E-MAIL DE CONTATO]'];

  for (const doc of DOCS) {
    const html = read(doc);
    for (const marcador of pendentes) {
      if (!html.includes(marcador)) continue;
      // Todo marcador precisa estar dentro de um destaque visual — comparação
      // por string, sem regex, para não depender de escapar os colchetes.
      assert.ok(
        html.includes(`<span class="pendente">${marcador}</span>`),
        `${doc}: o marcador ${marcador} não está dentro de <span class="pendente">`
      );
    }
  }

  // E os dois documentos precisam citar o mesmo contato.
  for (const doc of DOCS) {
    assert.match(read(doc), /\[E-MAIL DE CONTATO\]/, `${doc} sem canal de contato`);
  }
});
