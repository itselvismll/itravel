import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset } from '../../services/supabase';
import { notify } from '../../utils/dialogs';
import HCaptchaWidget from '../../components/auth/HCaptchaWidget';
import { HCAPTCHA_ENABLED } from '../../components/auth/hcaptchaConfig';
import { useLocale } from '../../i18n/LocaleProvider';
import { authErrorMessage } from '../../utils/authErrors';
import { isValidEmail } from '../../utils/authValidation';

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(/** @type {string | null} */ (null));
  const captchaRef = useRef(/** @type {{ reset: () => void, markUsed: () => void } | null} */ (null));

  // Sem site key configurada o desafio não aparece, então não travamos o
  // formulário — o Supabase continua recusando pelo lado do servidor.
  const submitDisabled = loading || (HCAPTCHA_ENABLED && !captchaToken);

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      notify(t('auth.forgot.invalidEmailTitle'), t('auth.forgot.invalidEmailMessage'));
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(normalizedEmail, captchaToken ?? undefined);
    setLoading(false);

    if (!result.success) {
      // Token do hCaptcha é de uso único: queimado na tentativa, recarrega.
      captchaRef.current?.reset();
      setCaptchaToken(null);
      // `authErrorMessage` já reconhece o caso do captcha, então o ternário que
      // existia aqui saiu junto. O `result.error` cru que ele usava como último
      // recurso é exatamente o que não pode ir para a tela — ver
      // `utils/authErrors.js`.
      notify(t('auth.forgot.failedTitle'), authErrorMessage(result, t));
      return;
    }

    captchaRef.current?.markUsed();
    setCaptchaToken(null);
    setSent(true);
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel={t('common.actions.back')}>
        <Ionicons name="arrow-back" size={23} color="#F7F7F2" />
      </TouchableOpacity>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="key-outline" size={28} color="#A78BFA" /></View>
        <Text style={styles.title}>{t('auth.forgot.title')}</Text>
        <Text style={styles.subtitle}>
          {sent
            ? t('auth.forgot.sent')
            : t('auth.forgot.intro')}
        </Text>

        {!sent && (
          <>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.forgot.emailPlaceholder')}
              placeholderTextColor="#777F9E"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Verificação anti-bot (hCaptcha) */}
            <HCaptchaWidget
              ref={captchaRef}
              theme="dark"
              onVerify={setCaptchaToken}
              onError={() => notify(t('auth.captchaTitle'), t('auth.errors.captcha'))}
            />

            <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={submitDisabled}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('auth.forgot.submit')}</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.secondaryText}>{t('auth.forgot.backToLogin')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1326', alignItems: 'center', justifyContent: 'center', padding: 20 },
  back: { position: 'absolute', top: 24, left: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: '#202744', alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 430, backgroundColor: '#151B33', borderRadius: 22, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: '#F7F7F2', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9BA2BF', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  input: { color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  primary: { minHeight: 48, backgroundColor: '#6C2BD9', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondary: { alignItems: 'center', paddingTop: 18 },
  secondaryText: { color: '#A78BFA', fontSize: 13, fontWeight: '700' },
});
