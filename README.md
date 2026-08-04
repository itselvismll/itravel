# Journi

Aplicativo mobile de viagem para documentar e compartilhar jornadas ao redor do mundo.

## Funcionalidades

- **Mapa mundial interativo** — Visualize os países que você já visitou e os da sua wishlist
- **Assistente de viagem com IA** — Guias completos, roteiros, orçamento, clima e dicas de segurança gerados por Gemini
- **Feed social** — Publique e explore fotos de viagem com localização automática via GPS
- **Perfil do viajante** — Nível de experiência, conquistas e histórico de países
- **Perfis públicos** — Veja e siga outros viajantes
- **Upload inteligente** — Detecção automática de cidade e país ao postar uma foto

## Stack

- **Frontend:** React Native + Expo (iOS, Android e Web)
- **Backend:** Supabase (banco de dados, autenticação, storage, Edge Functions)
- **IA:** Google Gemini 3.5 Flash via Supabase Edge Function (Deno)
- **Mapas:** Leaflet + D3-geo + TopoJSON
- **Navegação:** React Navigation (Stack + Bottom Tabs)

## Pré-requisitos

- Node.js 20.19+
- Expo CLI pelo projeto (`npx expo`)
- Supabase CLI
- Conta no [Supabase](https://supabase.com)
- Chave de API do [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=sua-chave-restrita-do-google-maps
```

> A chave do Google Maps é incluída no app cliente. Restrinja-a no Google Cloud
> aos aplicativos, domínios e APIs usados pelo Journi.

### 3. Aplicar as migrations do Supabase

```bash
supabase db push
```

### 4. Configurar o segredo Gemini no Supabase

```bash
supabase secrets set GEMINI_API_KEY=AIzaSy...
```

### 5. Habilitar login Google

No painel do Supabase, abra **Authentication → Providers → Google**, habilite o
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
supabase secrets set GOOGLE_PLACES_API_KEY=sua_chave_google_places
supabase functions deploy travel-assistant
```

`GOOGLE_PLACES_API_KEY` é opcional, mas habilita avaliações e horários do Google
Places. Sem ela, o planejador usa coordenadas e horários disponíveis no
OpenStreetMap, sem inventar avaliações ausentes.

## Rodando o app

```bash
# Web
npx expo start --web

# iOS
npx expo start --ios

# Android
npx expo start --android
```

## Estrutura do projeto

```
src/
  screens/
    auth/          # Login e cadastro
    map/           # Mapa mundial interativo
    explore/       # Explorar conteúdo
    feed/          # Feed de fotos
    profile/       # Perfil próprio e público
    assistant/     # Resultado do assistente de IA
  services/        # Supabase, fotos, social, assistente
  components/      # Componentes reutilizáveis
  navigation/      # Configuração de rotas
  utils/           # Constantes e utilitários
supabase/
  functions/
    travel-assistant/  # Edge Function Gemini
```

## Memória Persistente com Obsidian (Claude Code)

O projeto usa o Obsidian como "segundo cérebro" para o Claude Code não perder contexto entre sessões.

### Vault
```
C:\Users\elvis.leite.de.lima\Documents\Obsidian Vault\Journi
```

### Estrutura de memória
```
claude-memory/
  projects/itravel.md   — contexto e estado atual do projeto
  decisions.md          — decisões técnicas registradas por data
  preferences.md        — preferências do usuário
```

### MCP configurado
O arquivo `~\.claude\settings.json` aponta o vault via `@modelcontextprotocol/server-filesystem`, dando ao Claude acesso de leitura/escrita às notas.

### Comandos úteis no chat
| O que dizer | O que o Claude faz |
|---|---|
| `"salva a memória no Obsidian"` | Atualiza os 3 arquivos com o resumo da sessão |
| `"leia a memória do Obsidian"` | Lê o vault e retoma o contexto de onde parou |

### Referências
- [CLAUDE.md](./CLAUDE.md) — instruções automáticas de memória para o Claude
- [Model Context Protocol Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)

---

## Manutenção

Um workflow do GitHub Actions faz ping no Supabase a cada 5 dias para manter o projeto ativo no plano gratuito (`.github/workflows/keep-supabase-alive.yml`).
