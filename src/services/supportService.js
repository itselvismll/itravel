import { supabase } from './supabase';

export const SUPPORT_CATEGORIES = [
  { id: 'bug', label: 'Reportar um bug' },
  { id: 'duvida', label: 'Dúvida' },
  { id: 'sugestao', label: 'Sugestão' },
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
