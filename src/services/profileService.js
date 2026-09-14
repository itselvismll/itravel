import { supabase } from './supabase';
// Normalização compartilhada com as telas e espelhada em SQL pelo trigger de
// cadastro. Antes daqui saía um `trim().toLowerCase()` próprio, que não tirava
// acento nem caractere inválido e deixava passar username que o banco recusava.
import { normalizeUsername } from '../utils/username';
import { validateBio } from '../utils/bio';
import { normalizeInstagramUsername } from '../utils/instagram';

const sanitizeProfileUpdates = (updates = {}) => {
  const allowedFields = ['username', 'display_name', 'avatar_url', 'bio', 'instagram_username'];
  const sanitized = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedFields.includes(key))
  );

  if (Object.hasOwn(sanitized, 'username')) {
    sanitized.username = normalizeUsername(sanitized.username);
  }

  return sanitized;
};

export const createProfile = async (userId, username, fullName) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        username: normalizeUsername(username),
        display_name: fullName?.trim() || null,
      },
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const updateProfile = async (userId, updates) => {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };

  const sanitizedUpdates = sanitizeProfileUpdates(updates);
  if (
    Object.hasOwn(sanitizedUpdates, 'username')
    && !sanitizedUpdates.username
  ) {
    return { success: false, error: 'O nome de usuário não pode ficar vazio.' };
  }

  // A bio é validada AQUI, e não só na tela: link e palavrão são regra do
  // produto, não detalhe de formulário. Qualquer caminho que chegue ao
  // updateProfile passa por esta checagem — e o `value` normalizado é o que vai
  // para o banco (bio vazia vira null).
  if (Object.hasOwn(sanitizedUpdates, 'bio')) {
    const bio = validateBio(sanitizedUpdates.bio);
    if (!bio.valid) return { success: false, error: bio.error };
    sanitizedUpdates.bio = bio.value;
  }

  // O @ do Instagram passa pela MESMA normalização da tela, aqui também: o
  // constraint do banco recusa qualquer coisa fora de [A-Za-z0-9._]{1,30}, e o
  // que chegasse por outro caminho que não o formulário viraria um 23514 cru na
  // cara do usuário. Vazio vira null — "não informado" é ausência de valor, e
  // não string vazia, senão o badge teria dois casos para testar em vez de um.
  if (Object.hasOwn(sanitizedUpdates, 'instagram_username')) {
    sanitizedUpdates.instagram_username =
      normalizeInstagramUsername(sanitizedUpdates.instagram_username) || null;
  }

  // Some legacy auth accounts were created before profiles were generated
  // automatically. Repair the current user's row before applying a partial
  // update such as an avatar-only change.
  const { error: ensureError } = await supabase.rpc('ensure_current_user_profile');
  if (ensureError) return { success: false, error: ensureError.message };

  const { data, error } = await supabase
    .from('profiles')
    .update(sanitizedUpdates)
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error: 'Não foi possível preparar seu perfil. Entre novamente e tente de novo.',
    };
  }

  const metadata = {};
  if (Object.hasOwn(sanitizedUpdates, 'username')) {
    metadata.username = sanitizedUpdates.username;
  }
  if (Object.hasOwn(sanitizedUpdates, 'display_name')) {
    metadata.display_name = sanitizedUpdates.display_name;
    metadata.full_name = sanitizedUpdates.display_name;
  }
  if (Object.hasOwn(sanitizedUpdates, 'avatar_url')) {
    metadata.avatar_url = sanitizedUpdates.avatar_url;
  }

  let warning;
  if (Object.keys(metadata).length > 0) {
    const { error: authError } = await supabase.auth.updateUser({ data: metadata });
    warning = authError?.message;
  }

  return { success: true, data, warning };
};

export const uploadAvatar = async (userId, imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = data.publicUrl;

    const updateResult = await updateProfile(userId, { avatar_url: avatarUrl });
    if (!updateResult.success) return updateResult;

    return { success: true, avatarUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

export const checkUsernameAvailable = async (username, excludingUserId = null) => {
  const candidate = normalizeUsername(username);
  if (!candidate) return false;

  const { data, error } = await supabase.rpc('is_username_available', {
    candidate,
    excluding_user_id: excludingUserId,
  });
  if (error) return false;
  return data === true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Exclusão de conta
//
// O pedido não apaga nada: marca `profiles.deletion_requested_at` e a conta
// entra numa carência de 5 dias, invisível para terceiros (ver as policies em
// 20260911140000_account_deletion.sql). Quem logar dentro do prazo reverte tudo;
// quem não logar tem os dados apagados por um job diário.
//
// Toda a regra vive no banco, em funções `security definer`. Estas duas são só a
// porta de entrada — o cliente não decide prazo nem o que é apagado.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantos dias a pessoa tem para se arrepender. Espelha
 *  `account_deletion_grace_period()` no banco; usado só para texto de tela. */
export const ACCOUNT_DELETION_GRACE_DAYS = 5;

/**
 * Pede a exclusão. Idempotente: pedir de novo não reinicia a contagem.
 *
 * Quem chama precisa deslogar em seguida — a conta fica invisível, e continuar
 * na sessão mostraria um app pela metade.
 *
 * @returns {Promise<{ success: boolean, requestedAt?: string, error?: string }>}
 */
export const requestAccountDeletion = async () => {
  const { data, error } = await supabase.rpc('request_account_deletion');
  if (error) return { success: false, error: error.message };
  return { success: true, requestedAt: data };
};

/**
 * O status HTTP da resposta, quando o postgrest-js anexa um ao erro.
 *
 * @param {unknown} error
 * @returns {number | undefined}
 */
const httpStatus = (error) => {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const { status } = /** @type {{ status?: unknown }} */ (error);
  return typeof status === 'number' ? status : undefined;
};

/**
 * Reverte a exclusão, se houver uma pendente.
 *
 * Chamada em TODO login, sem checar antes se há pedido: a RPC devolve `false`
 * quando não havia nada para cancelar, então uma ida ao banco resolve o caso
 * comum e o caso de reativação com a mesma chamada. Ler o perfil antes só para
 * decidir se vale chamar seria uma consulta a mais em todo login.
 *
 * POR QUE O STATUS SAI DE UM TYPE GUARD
 *
 * `status` não existe no tipo `PostgrestError`, que declara só message, details,
 * hint e code — mas chega em runtime em parte dos erros, e é justamente ele que
 * separa "a policy recusou" (401/403) de "a RPC não existe no banco" (404), que
 * é a distinção pela qual este log existe. Lido por `httpStatus` em vez de cast
 * direto: um cast afirmaria ao TypeScript um campo que pode não vir, e o log
 * passaria a imprimir `undefined` sem ninguém notar que a informação sumiu.
 *
 * POR QUE O RETORNO NÃO É UM BOOLEANO
 *
 * Era `if (error) return false`, e isso escondeu um defeito real: uma conta
 * marcada para exclusão logou de novo, a marca continuou no banco e NADA
 * apareceu — nem alerta, nem erro. Falha e "não havia o que cancelar" produziam
 * o mesmo `false`, e quem chama não tinha como distinguir um do outro.
 *
 * Agora os dois casos são distintos e toda falha é registrada no console com o
 * código e o status da resposta — é por esse log que se descobre SE a chamada
 * chega a sair do app e com que credencial ela sai.
 *
 * O `catch` não é decorativo: a chamada é disparada sem `await` de dentro do
 * `onAuthStateChange`, então um erro de rede ou um TypeError viraria uma
 * unhandled rejection — visível no máximo como um aviso amarelo, que foi
 * exatamente o tipo de sinal que faltou da primeira vez.
 *
 * @returns {Promise<{ reactivated: boolean, error?: string, code?: string, status?: number }>}
 */
export const cancelAccountDeletion = async () => {
  try {
    const { data, error } = await supabase.rpc('cancel_account_deletion');

    if (error) {
      const status = httpStatus(error);
      console.error(
        '[conta] cancel_account_deletion falhou:',
        { message: error.message, code: error.code, details: error.details, hint: error.hint, status }
      );
      return { reactivated: false, error: error.message, code: error.code, status };
    }

    return { reactivated: data === true };
  } catch (erroInesperado) {
    // Rede fora, timeout, resposta que não é JSON: nada disso chega como
    // `error` do postgrest — chega como exceção.
    console.error('[conta] cancel_account_deletion lançou exceção:', erroInesperado);
    return { reactivated: false, error: erroInesperado?.message || String(erroInesperado) };
  }
};
