// Limpeza definitiva das contas que venceram a carência de 5 dias.
//
// Chamada uma vez por dia pelo job `journi-purge-expired-accounts` (pg_cron via
// pg_net). Ver supabase/migrations/20260911150000_account_deletion_cron.sql.
//
// POR QUE ESTA FUNÇÃO EXISTE
//
// A limpeza tem duas metades e só uma delas é SQL:
//
//   1. As LINHAS no banco — `purge_expired_accounts()` faz, e devolve os
//      caminhos dos arquivos de cada conta apagada.
//   2. Os ARQUIVOS nos buckets `avatars` e `country-photos` — SQL não alcança
//      Storage. É esta função que apaga, com os caminhos do passo 1 na mão.
//
// Sem o passo 2 as fotos ficariam órfãs para sempre, e a Política de Privacidade
// promete que elas são apagadas junto.
//
// ORDEM IMPORTA: o banco primeiro. Se o Storage falhar, as linhas já sumiram e
// restam arquivos órfãos — ruim, mas recuperável, e o relatório abaixo nomeia o
// que falhou. O inverso (arquivo apagado, linha viva) deixaria fotos quebradas
// na tela de todo mundo.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AVATAR_BUCKET = 'avatars'
const PHOTO_BUCKET = 'country-photos'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * O avatar é gravado como URL pública, não como caminho — ao contrário da foto,
 * que guarda `photo_path`. Aqui a URL é desmontada de volta no caminho dentro do
 * bucket. Devolve null quando a URL não é do nosso bucket (avatar do Google, por
 * exemplo, que não temos o que apagar).
 */
const avatarPathFromUrl = (url: unknown): string | null => {
  if (typeof url !== 'string' || !url) return null
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  const path = url.slice(index + marker.length).split('?')[0]
  return path ? decodeURIComponent(path) : null
}

serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405)
  }

  // Segredo compartilhado com o job do cron (Vault -> header). Esta função
  // apaga contas em definitivo: não pode ficar aberta a quem descobrir a URL.
  const expected = Deno.env.get('PURGE_ACCOUNTS_SECRET')
  if (!expected) {
    return jsonResponse({ error: 'PURGE_ACCOUNTS_SECRET não configurado' }, 500)
  }
  if (request.headers.get('x-purge-secret') !== expected) {
    return jsonResponse({ error: 'Não autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Credenciais do Supabase ausentes' }, 500)
  }

  // service_role: `purge_expired_accounts` não é executável por `authenticated`.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 1. Banco ──────────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('purge_expired_accounts')
  if (error) {
    // A varredura defensiva de `purge_account` aborta com mensagem quando acha
    // uma tabela com FK não prevista. Propagar o texto é o que torna esse aviso
    // útil em vez de um 500 mudo.
    console.error('purge_expired_accounts falhou:', error.message)
    return jsonResponse({ error: error.message }, 500)
  }

  const accounts = (data?.accounts ?? []) as Array<{
    user_id: string
    avatar_url: string | null
    photo_paths: string[] | null
  }>

  if (accounts.length === 0) {
    return jsonResponse({ purged: 0, storage: { removed: 0, failed: [] } })
  }

  // ── 2. Storage ────────────────────────────────────────────────────────────
  const avatarPaths: string[] = []
  const photoPaths: string[] = []

  for (const account of accounts) {
    const avatar = avatarPathFromUrl(account.avatar_url)
    if (avatar) avatarPaths.push(avatar)
    for (const path of account.photo_paths ?? []) {
      if (typeof path === 'string' && path) photoPaths.push(path)
    }
  }

  const failed: Array<{ bucket: string; error: string }> = []
  let removed = 0

  // `remove` aceita lote, e o lote evita uma requisição por arquivo.
  for (const [bucket, paths] of [
    [AVATAR_BUCKET, avatarPaths],
    [PHOTO_BUCKET, photoPaths],
  ] as const) {
    if (paths.length === 0) continue

    const { data: apagados, error: storageError } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (storageError) {
      // Não aborta: o outro bucket ainda pode ser limpo, e o banco já foi.
      console.error(`Storage ${bucket} falhou:`, storageError.message)
      failed.push({ bucket, error: storageError.message })
      continue
    }
    removed += apagados?.length ?? 0
  }

  const relatorio = {
    purged: accounts.length,
    storage: { removed, failed },
  }
  console.log('purge-accounts:', JSON.stringify(relatorio))

  // 207 quando o banco foi limpo mas sobrou arquivo: o job não falhou por
  // inteiro, e o status distingue isso de um sucesso limpo no monitoramento.
  return jsonResponse(relatorio, failed.length > 0 ? 207 : 200)
})
