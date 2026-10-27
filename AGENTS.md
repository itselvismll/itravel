# Convenções do Journi

Instruções para quem for mexer neste projeto — inclusive sessões futuras do
Claude Code, que leem este arquivo pelo `CLAUDE.md`.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before
writing any code.

## Deploy web: SEMPRE `npm run deploy:web`

**Nunca** rode `npx expo export -p web` e `eas deploy` separadamente, na mão.

O script `scripts/deploy-web.cjs` faz o fluxo inteiro — guarda o `.env.local`,
exporta, **verifica que as chaves do Supabase e do Mapbox estão de fato dentro
do bundle gerado**, publica, e restaura o `.env.local` mesmo se algo falhar no
meio. Faltando qualquer chave, ele aborta e **não publica nada**.

Por que isso importa: em 15/09/2026 a produção foi ao ar com o bundle sem
nenhuma variável `EXPO_PUBLIC_*` (`SUPABASE_URL:void 0`) e o app quebrava no
boot para todo mundo, em `src/services/supabase.js`. O `expo export` não sabe
que aquelas variáveis são obrigatórias: ele termina com exit 0, imprime
"Exported" e entrega um site que não abre. A verificação entre exportar e
publicar é o que impede isso de se repetir.

```bash
npm run deploy:web           # exporta, verifica, publica e confere o que ficou no ar
npm run deploy:web -- --dry  # exporta e verifica, sem publicar
npm run verify:prod          # só a conferência, contra o que está no ar AGORA
```

**Segundo incidente, 06/10/2026**: mesmo com o script acima existindo, o globo
voltou a mostrar países transparentes — bundle publicado com
`EXPO_PUBLIC_MAPBOX_TOKEN` vazio. A causa mais provável (não 100% provável pelo
histórico disponível: deploy via `eas-cli` não deixa rastro no `git log`) é um
deploy publicado por fora deste script — `expo export` + `eas deploy` direto no
terminal, sem a checagem. A checagem pré-deploy só vê o que o PRÓPRIO script
exportou; não tem como pegar um deploy feito de outro jeito.

Por isso `npm run deploy:web` agora também confere, DEPOIS de publicar, o que
`journi.expo.app` está servindo de verdade (`scripts/verify-production.cjs`) —
e isso roda isolado (`npm run verify:prod`) e também num workflow agendado
(`.github/workflows/verify-production.yml`, a cada 6h), que pega um deploy
feito por fora mesmo que ninguém rode a conferência na mão.

**Terceiro incidente, 27/10/2026**: o globo voltou a ficar sem satélite,
desta vez porque o deploy saiu de uma máquina cujo `.env` nunca teve
`EXPO_PUBLIC_MAPBOX_TOKEN` — não é o caso do segundo incidente (deploy por
fora do script), é o `.env` daquela máquina mesmo que não tinha a variável.
Sem o token, `MAPBOX_SATELLITE_SOURCE` (`src/components/map/globeConfig.js`)
vira `null`, o globo pede satélite à Stadia, que responde 403, e
`isSatelliteTileError` engole esse erro de propósito — zero aviso, em
produção, até alguém reclamar.

Por isso agora existe uma CAMADA 1, antes do export: `npm run deploy:web`
roda `scripts/check-build-env.cjs` automaticamente (via `predeploy:web` no
`package.json`) e aborta, nomeando a variável, se faltar qualquer uma das
três que já quebraram produção — `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPBOX_TOKEN`. As demais
`EXPO_PUBLIC_*` são opcionais por design (degradam com aviso, não quebram em
silêncio) e a classificação de cada uma — com o motivo — está no topo do
próprio script, não só aqui.

Isto não substitui a verificação do bundle que já existia (`verifyBundle()`
dentro de `scripts/deploy-web.cjs`): uma variável pode estar no AMBIENTE e
ainda assim não ir para o bundle. As duas camadas ficam, cada uma pega um
jeito diferente do mesmo bug chegar à produção:

```bash
npm run check:build-env      # só a camada 1, isolada — útil pra testar antes
npm run deploy:web           # roda a camada 1 antes de exportar, e já tinha a 2
```

`tests/check-build-env.test.cjs` é a catraca: toda variável `EXPO_PUBLIC_*`
declarada em `.env.example` tem que estar classificada (obrigatória ou
opcional) em `scripts/check-build-env.cjs` — variável nova em `.env.example`
sem dono falha o teste, em vez de escapar da checagem em silêncio.

**Duas lacunas na trava acima, fechadas no mesmo dia**: "a variável existe"
não é "é a variável CERTA", e "existe uma checagem" não é "ninguém consegue
ignorá-la".

1. **Identidade do token, não só formato.** O projeto usa DOIS tokens do
   Mapbox (ver `.env.example`): o de `.env`, restrito a `journi.expo.app` —
   o único que pode ir para produção —, e o de `.env.local`, SEM restrição
   de URL, só para localhost. O Expo sobrepõe `.env` com `.env.local`
   sempre que o arquivo existe, **inclusive num `expo export --platform web`
   de produção**. Se isso acontecer, o site vai ao ar perfeito — todas as
   chaves "presentes", globo com satélite — com o token sem restrição
   exposto no bundle público, pronto para qualquer site queimar a cota da
   conta. `findMissingBundleKeys` não pega isso: os dois tokens têm o mesmo
   formato `pk.*`.

   Por isso `verifyBundle()` (`scripts/deploy-web.cjs`) agora também compara
   por IDENTIDADE: lê `.env` direto do disco (nunca `.env.local`, de
   propósito — `scripts/lib/verifyMapboxTokenSource.cjs`) e confere que é
   esse valor, e não outro, que foi embutido no bundle. Nenhum token entra
   hardcoded neste repositório — nem o "público" `pk.*`, que o push
   protection do GitHub recusa.

2. **O comando cru não passava por nenhuma checagem.** `predeploy:web` só
   dispara via `npm run deploy:web`. Os incidentes de produção já
   registrados aqui saíram exatamente do comando direto —
   `npx expo export --platform web` seguido de `eas deploy --prod`, sem
   passar por nenhum script deste projeto. Uma trava que só existe dentro de
   um script npm não resolve isso.

   A correção está em `app.config.js`, na raiz do projeto: o Expo CLI avalia
   esse arquivo (via `require`, no mesmo processo) sempre que lê a
   configuração — em `expo export`, `expo start`, `eas build` — **não tem
   como pular por engano**. Ele faz a mesma validação de variáveis
   obrigatórias e de identidade do token do Mapbox, e aborta com
   `process.exit(1)` especificamente para `expo export --platform web` (o
   único export que este projeto publica); em qualquer outro caminho — `expo
   start`, build de preview, build nativo — é tolerante por design, no
   máximo um aviso, porque ali o token sem restrição é legítimo. A decisão
   em si mora em `scripts/lib/validateDeployEnvironment.cjs`, como função
   pura, para dar para testar sem precisar spawnar um processo.

   **Produção nunca deve rodar com `.env.local` carregado.** É por isso que
   `scripts/deploy-web.cjs` renomeia `.env.local` antes do `expo export` e
   só devolve depois — e é por isso que o comando cru é perigoso: nada faz
   essa troca por quem roda `npx expo export` na mão. Uma alternativa mais
   robusta que depender do estado de `.env.local` de cada máquina é puxar as
   variáveis do painel da EAS antes de exportar:

   ```bash
   eas env:pull production   # traz as variáveis de PRODUÇÃO do painel da EAS
   npm run deploy:web
   ```

```bash
npm run check:build-env      # camada 1 isolada: só variáveis obrigatórias presentes
npm run deploy:web           # camada 1 + export + camada 2 (chaves e IDENTIDADE do Mapbox) + publicar
```

`tests/validate-deploy-environment.test.cjs` cobre a decisão de
`app.config.js` (duro só no export de produção para web; aviso, nunca falha,
em qualquer outro caminho) e `tests/mapbox-token-source.test.cjs` cobre a
comparação por identidade contra o bundle — os dois reproduzem o vazamento
exato: token de `.env.local` embutido num export de produção.

## Antes de entregar qualquer mudança

```bash
npm test          # node:test, sem browser
npx tsc --noEmit  # o projeto é JS com checagem via JSDoc
npm run check     # invariantes de código (scripts/verify-source.cjs)
npm run sync:locales  # se mexeu em pt.json: espelha a estrutura em en/es
```

Mudança que toca a tela também merece `npx expo export --platform web` para um
diretório temporário: é o que pega import quebrado e dependência circular, que
os testes não veem.

## Consultas ao Supabase com relação aninhada (PostgREST)

Quando uma tabela tem **duas** chaves estrangeiras para a mesma tabela, o
PostgREST recusa o embed inteiro com `PGRST201` — e o app recebe erro, não
dados. Já aconteceu duas vezes aqui: `trip_activities` → `trip_days` (derrubou a
lista de viagens em produção) e `trip_members` → `profiles` (`user_id` e
`invited_by`).

Desambigue pelo nome da constraint e **teste a consulta contra a API antes de
mandar código para produção**:

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  "$SUPABASE_URL/rest/v1/trip_members?select=user_id,profiles!trip_members_user_id_fkey(username)&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

`HTTP 300` com `PGRST201` = ambiguidade. `HTTP 200` = consulta aceita.

## Arquitetura do mapa e do roteiro

A regra que vale para tudo que é do mapa: **lógica compartilhada em módulo puro,
renderização em arquivo de plataforma**.

- módulo puro (sem DOM, sem `maplibre-gl`, sem React): agrupamento de pinos,
  medidas geográficas, seleção de lugares próximos, faixa de dias, resumo da
  viagem. É o que o `node:test` exercita sem browser;
- `*.web.js`: só o ciclo de vida das layers e a conversa com o MapLibre;
- o globo do iOS/Android é **o mesmo MapLibre web** rodando num DOM Component
  (`NativeGlobe.dom.js`), então `PlanRouteLayer.web` roda lá dentro sem mudança.
  Props cruzam a ponte só em formato serializável, e toda função passada é
  assíncrona.

O estado que as duas plataformas compartilham (roteiro aplicado, parada aberta,
lista de lugares próximos) mora no lado React Native, nunca dentro do mapa.

## Idioma: todo texto de tela nasce como chave de tradução

O app suporta **português, inglês e espanhol**. O português é o único idioma
completo hoje; `en.json` e `es.json` existem com a mesma estrutura e ainda
repetem o português, para a tradução ser só preencher.

**Nenhum texto visível ao usuário é escrito direto no código.** Nem em tela nova,
nem em componente novo, nem "só este rótulo aqui".

```jsx
// NÃO
<Text>Salvar viagem</Text>
<Botao label="Cancelar" />

// SIM
const { t } = useLocale();
<Text>{t('trips.save')}</Text>
<Botao label={t('common.actions.cancel')} />
```

Onde cada coisa mora:

| o que | onde |
|---|---|
| os textos | `src/i18n/locales/pt.json`, por área (`common`, `drawer`, `notifications`, …) |
| o hook `t` | `src/i18n/LocaleProvider.js` — `useLocale()` |
| o catálogo de idiomas | `src/i18n/index.js` — `SUPPORTED_LOCALES` |
| data | `src/utils/formatDate.js` |
| número, moeda, distância | `src/utils/formatNumber.js` |

Regras que não são óbvias:

- **A chave descreve o SIGNIFICADO, não o texto.** `trips.empty.title`, nunca
  `trips.naoHaViagens` — senão a chave mente no dia em que o texto mudar.
- **Depois de mexer em `pt.json`, rode `npm run sync:locales`.** Ele espelha a
  estrutura em `en.json`/`es.json` preservando o que já foi traduzido. O teste de
  paridade falha se os três divergirem.
- **Plural é chave com `one`/`other`**, nunca ternário no código. Ver
  `common.plural.*`; `21 dias` e `1 dia` saem de `t('common.plural.day', { count })`.
- **Interpolação é `%{nome}`.** O teste cobra que a tradução use as MESMAS
  variáveis do português — tradutor que troca `%{name}` por "name" deixa um
  buraco na frase.
- **Módulo puro não importa o contexto de idioma.** Ele guarda a CHAVE e quem
  renderiza resolve — ver `labelKey`/`subtitleKey` em
  `src/utils/notificationCategories.js` e `NOTIFICATION_PREDICATE_KEY` em
  `src/utils/notificationRouting.js`. É o que mantém esses módulos exercitáveis
  no `node:test` sem browser.
- **Não traduza:** mensagem de `console.*`, nome de rota, chave de storage, nome
  de coluna, nem conteúdo escrito pelo usuário (bio, legenda, comentário, título
  de tarefa, e o `preview` das notificações).

### O que segura a regra

`tests/i18n-no-hardcoded-text.test.cjs` falha quando aparece texto cravado em
JSX ou em prop de texto. Ele funciona como **catraca**: a lista `PENDENTES` tem
os arquivos que a extração ainda não alcançou, e um segundo teste exige que
arquivo já extraído SAIA dela. Arquivo novo nasce fora da lista — portanto já
sob a regra.

Exceção legítima (sigla, símbolo, nome próprio) vai em `LITERAIS_PERMITIDOS`,
**com o motivo escrito**. Exceção é decisão registrada, não escape silencioso.

A extração dos arquivos que faltam está sendo feita em lotes; a ordem combinada
está no comentário de `PENDENTES`.

## Texto de interface não nasce no banco

Trigger e função do Postgres **não gravam frase em português** em coluna que vai
para a tela. Gravam o DADO — tipo, ator, id, e o que mais a frase precisar — e o
app monta o texto.

O molde é a notificação. Os triggers escrevem `notifications.message` com frases
como `'começou a seguir você'`, e isso **não é mais lido** para nenhum dos dez
tipos conhecidos: o app resolve `NOTIFICATION_PREDICATE_KEY[type]` numa chave de
tradução (`src/utils/notificationRouting.js`). A coluna continua sendo gravada
por compatibilidade, e só é lida como último recurso, para um tipo que o app
ainda não aprendeu a renderizar.

Por que isso importa: **texto gravado não traduz depois.** Uma linha escrita em
português em setembro continua em português para sempre, mesmo quando o app
inteiro já fala inglês — e as linhas antigas não podem ser reescritas, porque
ninguém sabe em que idioma o destinatário estava quando o aviso chegou. Filtrar
ou migrar depois é pior: `update ... set message = ...` em cima de histórico é
perda de dado.

Na prática, ao escrever um trigger novo que gera algo visível:

1. grave o tipo e os identificadores em colunas próprias;
2. acrescente o tipo em `NOTIFICATION_PREDICATE_KEY` e a chave nos três JSON;
3. acrescente o tipo em `SOCIAL_NOTIFICATION_TYPES` ou `TRIP_NOTIFICATION_TYPES`
   (`src/utils/socialNotifications.js`) — aquela lista é FILTRO: tipo que não
   está lá chega ao banco, não aparece na tela e nunca é marcado como lido;
4. mapeie o tipo em `notification_category` (SQL) e em
   `src/utils/notificationCategories.js`, que o teste compara entre si.

**Se algum caso tornar isso inviável, avise antes de gravar a frase.** Pode
haver razão legítima — texto que depende de dado que o app não tem em mãos no
momento de renderizar —, mas é decisão consciente, com o custo declarado, nunca
o caminho mais curto.

## Feature flags

Recurso pronto mas desligado por decisão de produto fica atrás de uma constante
exportada e documentada, com o motivo e como religar — nunca comentado ou
apagado. Ver `INSTAGRAM_FEATURE_ENABLED` (`src/utils/instagram.js`) e
`NEARBY_AREA_FEATURE_ENABLED` (`src/components/map/isochroneLayer.js`).

## Ícones

Ícone de interface é Ionicons (`@expo/vector-icons`), nunca emoji: emoji é
desenhado pela fonte do sistema e sai diferente em cada aparelho. O teste
`nenhum emoji pictográfico é usado como ícone de interface`
(`tests/source-invariants.test.cjs`) cobra isso a cada `npm test`.

Exceção conhecida: `ShareCard.js` não usa fonte de ícones porque a exportação
PNG (`toPng` com `skipFonts`) não embute fontes customizadas.
