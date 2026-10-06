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
npm run deploy:web           # exporta, verifica e publica em produção
npm run deploy:web -- --dry  # exporta e verifica, sem publicar
```

Para conferir o que está no ar sem abrir o navegador, o bundle publicado é
público:

```bash
curl -s https://journi.expo.app/ | grep -o '_expo/static/js/web/[^"]*\.js'
# baixe esse arquivo e procure SUPABASE_URL: — `void 0` significa build sem chaves
```

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
