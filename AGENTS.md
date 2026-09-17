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
