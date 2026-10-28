import { supabase } from './supabase';

// O texto saiu para pt.json (support.categories.*) na fase 1 do i18n. O `id` é o
// que vai para a coluna `category` do ticket (ver createSupportTicket); o
// `labelKey` é só exibição — quem resolve é a tela, com `t()`.
export const SUPPORT_CATEGORIES = [
  { id: 'bug', labelKey: 'support.categories.bug' },
  { id: 'duvida', labelKey: 'support.categories.duvida' },
  { id: 'sugestao', labelKey: 'support.categories.sugestao' },
];

export const createSupportTicket = async ({ userId, email, category, description }) => {
  // Sem .select() de propósito: não existe policy de SELECT em support_tickets
  // (leitura é só via admin/service role), então pedir a linha de volta faria o
  // RLS devolver 0 linhas e o insert pareceria ter falhado mesmo tendo funcionado.
  const { error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId || null,
      email: email?.trim(),
      category,
      description: description?.trim(),
    });

  if (error) return { success: false, error: error.message };
  return { success: true };
};
