# Journi

Rede social e planejador de viagens: documente onde você já esteve, planeje para
onde vai e acompanhe as viagens de quem você segue. Roda em iOS, Android e web
(<https://journi.expo.app>) a partir do mesmo código.

## Funcionalidades

**Mapa e países**
- Globo 3D interativo (MapLibre GL, projeção esférica) com imagem de satélite,
  atmosfera e céu estrelado
- Países visitados e lista de desejos pintados no território, com bandeiras que
  aparecem progressivamente conforme o zoom e detecção de colisão entre elas
- Reino Unido dividido em Inglaterra, Escócia, País de Gales e Irlanda do Norte
- Busca de país com voo da câmera até ele

**Viagens**
- Assistente de roteiro com IA (Gemini): dia a dia, orçamento, clima e dicas
- Roteiro desenhado no globo, com rota real entre as paradas e filtro por dia
- Viagens colaborativas: convite por link ou por busca de usuário, papéis
  (organizador, editor, visualizador), histórico de edição por parada
- Tarefas do grupo com responsável, e checklist pessoal privada

**Social**
- Feed de fotos com local, nota e avaliação, detecção automática de cidade e país
- Perfis públicos, seguir e ser seguido
- Mensagens diretas, com compartilhamento de passaporte e de roteiro na conversa
- Passaporte com carimbos por país e níveis de viajante
- Compartilhamento nos Stories do Instagram

**Conta e convivência**
- Cadastro por e-mail ou Google, com hCaptcha
- Bloqueio e denúncia (exigências de loja para conteúdo de usuário)
- Preferências de notificação por categoria, com pausa geral
- Exclusão de conta com carência de 5 dias (entrar de novo cancela o pedido)
- Interface em português, inglês e espanhol

## Stack

- **Frontend:** React Native + Expo SDK 55 (iOS, Android e Web)
- **Backend:** Supabase (Postgres, auth, storage, realtime, Edge Functions)
- **IA:** Google Gemini (3.6 Flash e 3.5 Flash Lite) via Edge Function (Deno)
- **Mapa:** MapLibre GL — style vetorial da Stadia Maps, imagem de satélite do
  Mapbox, e as APIs de Optimization e Directions do Mapbox para as rotas do
  roteiro. No nativo o globo roda dentro de um DOM Component (WebView), porque
  o MapLibre nativo ainda não tem projeção `globe`
- **i18n:** i18n-js + expo-localization (pt/en/es)
- **Navegação:** React Navigation (Stack + Bottom Tabs)

## Pré-requisitos

- Node.js 20.19+
- Expo CLI pelo projeto (`npx expo`)
- Supabase CLI
- Conta no [Supabase](https://supabase.com)
- Chave do [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
- Conta no [Mapbox](https://account.mapbox.com) (satélite e rotas)

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

**O `.env.example` é a fonte de verdade** — ele documenta cada variável, o que
acontece sem ela, e por que algumas não podem ser commitadas. Copie e preencha:

```bash
cp .env.example .env
```

Três variáveis são obrigatórias e, sem elas, o app quebra em produção:

| Variável | Sem ela |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | app não abre |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | app não abre |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | globo sem imagem de satélite, em silêncio |

As demais degradam com aviso em vez de quebrar. A classificação completa, com o
motivo de cada uma, está no topo de `scripts/check-build-env.cjs`.

#### Os dois tokens do Mapbox

O projeto usa dois, de propósito:

- **`.env`** — token restrito ao domínio `journi.expo.app`. É o que vai para
  produção. Se vazar, não serve em outro domínio.
- **`.env.local`** — token sem restrição de URL, só para desenvolvimento. É
  necessário porque a restrição acima também bloqueia `localhost`.

O Expo carrega `.env.local` **sobrepondo** o `.env`, inclusive num export de
produção. É por isso que o deploy passa por `scripts/lib/verifyMapboxTokenSource.cjs`,
que confere qual dos dois foi realmente embutido no bundle.

### 3. Aplicar as migrations do Supabase

```bash
supabase db push
```

### 4. Segredos das Edge Functions

```bash
supabase secrets set GEMINI_API_KEY=AIzaSy...
supabase secrets set GOOGLE_PLACES_API_KEY=sua_chave_google_places
```

`GOOGLE_PLACES_API_KEY` é opcional, mas habilita avaliações e horários do Google
Places. Sem ela, o planejador usa coordenadas e horários do OpenStreetMap, sem
inventar avaliações ausentes.

### 5. Login Google

No painel do Supabase, em **Authentication → Providers → Google**, habilite o
provedor e informe o Client ID e o Client Secret criados no Google Cloud.

No cliente OAuth do Google, autorize o callback do projeto:

```text
https://qenehyizxesmaeylmcjv.supabase.co/auth/v1/callback
```

Em **Authentication → URL Configuration**, use `https://journi.expo.app` como
Site URL e permita os redirecionamentos `https://journi.expo.app/**` e
`journi://**`.

### 6. Deploy da Edge Function

```bash
supabase functions deploy travel-assistant
```

## Rodando o app

```bash
npx expo start --web
npx expo start --ios
npx expo start --android
```

> O `.env.local` aponta para o Supabase de **produção**. Isto não é sandbox: o
> que você fizer rodando localmente afeta os dados reais.

## Qualidade

```bash
npm test           # suíte completa (node --test)
npm run typecheck  # tsc --noEmit
npm run check      # invariantes de código-fonte
```

A suíte cobre regras que não dá para ver lendo o diff: permissões de viagem,
colisão de bandeiras no globo, roteamento de notificação, i18n sem texto fixo em
português, e as travas de deploy descritas abaixo. Parte dos testes de banco roda
Postgres de verdade via PGlite, não `mock`.

## Deploy do site (journi.expo.app)

```bash
npm run deploy:web           # verifica, exporta, verifica de novo, publica e confere o que ficou no ar
npm run deploy:web -- --dry  # tudo, menos publicar
npm run verify:prod          # só a conferência, contra o que está no ar AGORA
npm run check:build-env      # só a checagem de ambiente, isolada
```

**Use sempre o script.** Nunca rode `expo export -p web` e `eas deploy`
separados, na mão.

### Por que existem três camadas

A produção já quebrou três vezes pelo mesmo motivo — variável de ambiente
faltando no bundle publicado — e cada incidente mostrou um buraco diferente:

| Camada | Quando roda | Pergunta que responde |
|---|---|---|
| 1 — `check-build-env.cjs` | antes do export | a máquina que está deployando tem as variáveis? |
| 2 — `verifyBundle()` em `deploy-web.cjs` | depois do export, antes de publicar | o bundle que vou publicar tem as chaves? |
| 3 — `verify-production.cjs` | depois de publicar, e a cada 6h via CI | o que está no ar agora tem as chaves? |

As camadas 1 e 2 só existem dentro de `npm run deploy:web`. A camada 3 é a única
que pega um deploy publicado por fora do script, porque não confia no processo:
ela lê `journi.expo.app` e confere o resultado.

Os três incidentes, com data e causa, estão registrados no
[AGENTS.md](./AGENTS.md).

### Rollback

Pelo painel, promovendo o deployment anterior:
<https://expo.dev/accounts/itselvismll/projects/journi/hosting/deployments>

## CI (GitHub Actions)

| Workflow | Quando | O que faz |
|---|---|---|
| `verify-production.yml` | a cada 6h (00, 06, 12 e 18 UTC) e sob demanda | Lê `journi.expo.app`, baixa os bundles JS publicados e confere que as chaves do Supabase e do Mapbox estão lá, no formato certo. Falha se faltar alguma. Não usa segredo nenhum — é leitura pública. |
| `keep-supabase-alive.yml` | a cada 5 dias, meio-dia UTC | Faz ping no Supabase para o projeto não ser pausado por inatividade no plano gratuito. |

Workflow agendado só dispara a partir da branch padrão (`master`). Um workflow
que exista só numa branch de trabalho nunca roda — foi o que manteve a
verificação de produção desligada entre 06/10 e 28/10/2026.

Quando `verify-production` falha, o GitHub avisa por e-mail quem tem acesso ao
repositório. Vale confirmar que esse aviso chega onde você olha: alarme que
ninguém escuta é a mesma falha silenciosa que ele existe para evitar.

## Estrutura do projeto

```
src/
  screens/
    auth/          # Login, cadastro, confirmação e recuperação de senha
    onboarding/    # Slides de boas-vindas e escolha de usuário
    map/           # Globo 3D
    explore/       # Descoberta de destinos e pessoas
    feed/          # Feed de fotos
    messages/      # Conversas e mensagens diretas
    assistant/     # Planejador de IA, roteiros salvos e tela da viagem
    profile/       # Perfil próprio, público, passaporte e bloqueados
    support/       # Ajuda, suporte e perguntas frequentes
  components/      # Componentes reutilizáveis (map/, profile/, onboarding/...)
  services/        # Supabase, fotos, social, mensagens, viagens, moderação
  navigation/      # Configuração de rotas
  i18n/            # Traduções pt/en/es
  data/            # GeoJSON de países e dados estáticos
  utils/           # Constantes, níveis, formatação, layout
supabase/
  functions/
    travel-assistant/   # Edge Function Gemini
  migrations/           # Schema e políticas de RLS
scripts/           # Deploy, verificação, geração de dados, backup
tests/             # Suíte do npm test
docs/
  faq-content.md   # Copy da FAQ — fonte de verdade das telas de perguntas
```

## Convenções

[AGENTS.md](./AGENTS.md) é o arquivo de convenções do projeto, lido
automaticamente pelo Claude Code via `CLAUDE.md`. Ele registra as regras
permanentes (deploy, i18n, texto de interface) e o histórico dos incidentes de
produção com causa e correção.

Duas regras que valem destacar:

- **Nenhum texto fixo em português no código.** Tela, componente ou mensagem
  nova nasce com chave de tradução. Vale também para o banco: trigger não grava
  frase em português em coluna que vai para a tela — grava dado, e o app monta a
  frase. Cobrado por `tests/i18n-no-hardcoded-text.test.cjs`.
- **Deploy de produção só por `npm run deploy:web`.**
