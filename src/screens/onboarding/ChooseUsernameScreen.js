// Escolha do username — primeiro passo de quem entrou pelo Google.
//
// O Google não pede username, então o trigger de cadastro deriva um do nome da
// conta ("Matheus Lima Peres" -> "matheuslim"). Esta tela existe para a pessoa
// aceitar esse palpite ou trocar por outro, uma única vez: ao confirmar,
// `profiles.username_confirmed` vira true e a tela nunca mais aparece.
//
// Não tem "pular" nem botão de voltar de propósito — o username é público
// (aparece em perfil, comentários e menções) e não pode ficar indefinido. Por
// isso a tela é um overlay sobre o app, e não um destino de navegação.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../utils/constants';
import { checkUsernameAvailable } from '../../services/profileService';
import {
  USERNAME_MAX_LENGTH,
  normalizeUsername,
  validateUsername,
} from '../../utils/username';

// Espera entre a última tecla e a ida ao banco. Curto o bastante para o retorno
// parecer imediato, longo o bastante para não disparar uma consulta por letra.
const AVAILABILITY_DEBOUNCE_MS = 400;

/**
 * @param {{
 *   userId: string,
 *   suggestion?: string,
 *   saving?: boolean,
 *   onConfirm: (username: string) => Promise<{ success: boolean, error: string | null }>,
 * }} props
 */
export default function ChooseUsernameScreen({ userId, suggestion = '', saving = false, onConfirm }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(() => normalizeUsername(suggestion));
  const [available, setAvailable] = useState(/** @type {boolean | null} */ (null));
  const [checking, setChecking] = useState(false);
  const [submitError, setSubmitError] = useState(/** @type {string | null} */ (null));

  // O palpite do banco chega junto com o perfil, que pode carregar depois da
  // primeira renderização. Só sobrescrevemos o campo enquanto ele estiver
  // intocado — nunca por cima do que a pessoa já digitou.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setUsername(normalizeUsername(suggestion));
  }, [suggestion]);

  const validation = validateUsername(username);

  // Disponibilidade só depois do formato passar: não faz sentido perguntar ao
  // banco por algo que já sabemos ser inválido.
  useEffect(() => {
    if (!validation.valid) {
      setAvailable(null);
      setChecking(false);
      return undefined;
    }

    let cancelled = false;
    setChecking(true);

    const timer = setTimeout(async () => {
      const free = await checkUsernameAvailable(validation.value, userId);
      if (cancelled) return;
      setAvailable(free);
      setChecking(false);
    }, AVAILABILITY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [validation.valid, validation.value, userId]);

  // Normaliza a cada tecla: o campo mostra exatamente o que será salvo, então
  // "Matheus Lima" aparece como "matheuslim" enquanto se digita, sem surpresa
  // no momento de confirmar.
  const handleChange = useCallback((text) => {
    touched.current = true;
    setSubmitError(null);
    setUsername(normalizeUsername(text));
  }, []);

  const canConfirm = validation.valid && available === true && !checking && !saving;

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setSubmitError(null);

    const result = await onConfirm(validation.value);
    if (!result.success) {
      // Quase sempre é corrida: alguém levou o username entre a checagem e o
      // update. A pessoa fica na tela e escolhe outro.
      setSubmitError(result.error);
      setAvailable(false);
    }
  }, [canConfirm, onConfirm, validation.value]);

  const hint = (() => {
    if (submitError) return { text: submitError, tone: 'error' };
    if (!username) return { text: 'De 3 a 10 caracteres', tone: 'muted' };
    if (!validation.valid) return { text: validation.error, tone: 'error' };
    if (checking) return { text: 'Verificando...', tone: 'muted' };
    if (available === true) return { text: 'Disponível', tone: 'ok' };
    if (available === false) return { text: 'Já está em uso', tone: 'error' };
    return { text: 'De 3 a 10 caracteres', tone: 'muted' };
  })();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.title}>Escolha seu username</Text>
        <Text style={styles.subtitle}>
          É como as pessoas vão te encontrar no Journi. Você pode mudar depois no
          seu perfil.
        </Text>

        <View style={styles.field}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={handleChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={USERNAME_MAX_LENGTH}
            placeholder="seuusername"
            placeholderTextColor="rgba(247,247,242,0.35)"
            onSubmitEditing={handleConfirm}
            returnKeyType="done"
          />
          {checking ? (
            <ActivityIndicator size="small" color="rgba(247,247,242,0.55)" />
          ) : available === true ? (
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          ) : available === false ? (
            <Ionicons name="close-circle" size={20} color="#ef4444" />
          ) : null}
        </View>

        <View style={styles.hintRow}>
          <Text
            style={[
              styles.hint,
              hint.tone === 'ok' && styles.hintOk,
              hint.tone === 'error' && styles.hintError,
            ]}
          >
            {hint.text}
          </Text>
          <Text style={styles.counter}>
            {username.length}/{USERNAME_MAX_LENGTH}
          </Text>
        </View>

        <Pressable
          style={[styles.button, !canConfirm && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.buttonLabel}>Continuar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.dark },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },

  title: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    fontSize: 30,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 12,
    color: 'rgba(247,247,242,0.72)',
    fontFamily: 'Poppins_300Light',
    fontSize: 15,
    lineHeight: 24,
  },

  field: {
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(247,247,242,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(247,247,242,0.14)',
  },
  at: {
    color: 'rgba(247,247,242,0.45)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 17,
  },
  input: {
    flex: 1,
    color: COLORS.white,
    fontFamily: 'Poppins_400Regular',
    fontSize: 17,
  },

  hintRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: 'rgba(247,247,242,0.55)',
  },
  hintOk: { color: '#22c55e' },
  hintError: { color: '#ef4444' },
  counter: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: 'rgba(247,247,242,0.4)',
  },

  button: {
    marginTop: 28,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '600',
    fontSize: 16,
  },
});
