import { API_CONFIG } from '../../utils/constants';

// Metade pública do par de chaves do hCaptcha. A secret vive apenas no painel
// do Supabase (Authentication -> Attack Protection), que é quem valida o token.
export const HCAPTCHA_SITE_KEY = API_CONFIG.HCAPTCHA_SITE_KEY;

// Sem site key configurada não dá para desenhar o desafio; nesse caso as telas
// deixam o submit liberado e o Supabase segue recusando pelo lado do servidor.
export const HCAPTCHA_ENABLED = Boolean(HCAPTCHA_SITE_KEY);

export const HCAPTCHA_ERROR_MESSAGE =
  'Não foi possível validar o desafio de segurança. Tente novamente.';
