import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../utils/constants';
import { signIn, signInWithGoogle } from '../../services/supabase';
import { notify } from '../../utils/dialogs';
import HCaptchaWidget from '../../components/auth/HCaptchaWidget';
import { HCAPTCHA_ENABLED } from '../../components/auth/hcaptchaConfig';
import { useLocale } from '../../i18n/LocaleProvider';
import { authErrorMessage } from '../../utils/authErrors';
import { isValidEmail } from '../../utils/authValidation';

// O `formatLoginError` local saiu daqui: a mesma tradução de erro do GoTrue
// virou `utils/authErrors.js`, que as quatro telas de conta usam. Ele já não
// vazava texto do backend — mas era o único que não vazava, e o cadastro vazava.
// Ver o cabeçalho daquele módulo.

export default function LoginScreen({ navigation, onLoginSuccess }) {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(/** @type {string | null} */ (null));
  const captchaRef = useRef(/** @type {{ reset: () => void, markUsed: () => void } | null} */ (null));
  const [errors, setErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );

  // O `validateEmail` local saiu daqui: o MESMO regex estava copiado no
  // RegisterScreen e no SupportScreen. Agora é `isValidEmail`, em
  // `utils/authValidation.js`, junto da regra de senha.
  const handleLogin = async () => {
    setErrors({});
    const newErrors = /** @type {Record<string, string>} */ ({});
    
    if (!email) {
      newErrors.email = t('auth.fields.emailRequired');
    } else if (!isValidEmail(email)) {
      newErrors.email = t('auth.fields.emailInvalid');
    }

    if (!password) {
      newErrors.password = t('auth.fields.passwordRequired');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(email, password, captchaToken ?? undefined);

      if (result.success) {
        // O token do hCaptcha é de uso único e foi consumido nesta tentativa.
        captchaRef.current?.markUsed();
        setCaptchaToken(null);
        if (onLoginSuccess) {
          onLoginSuccess(result.user);
        }
        return;
      }

      // Mesmo uma autenticação recusada consome o token; gere outro desafio.
      captchaRef.current?.reset();
      setCaptchaToken(null);
      notify(t('auth.login.errorTitle'), authErrorMessage(result, t));
    } catch {
      captchaRef.current?.reset();
      setCaptchaToken(null);
      // Exceção lançada antes de haver resposta: não há `code` do GoTrue, então o
      // código vem daqui para o relato no suporte continuar possível.
      notify(
        t('auth.login.errorTitle'),
        t('auth.errors.unknown', { code: 'AUTH_UNEXPECTED_ERROR' })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleLoading) return;

    setGoogleLoading(true);
    const result = await signInWithGoogle();

    if (!result.success && !result.cancelled) {
      const providerDisabled = result.error?.toLowerCase().includes('provider is not enabled');
      notify(
        t('auth.login.googleErrorTitle'),
        providerDisabled
          ? 'O acesso pelo Google ainda precisa ser habilitado no servidor.'
          // Mesmo no caminho do Google, texto do backend não vai para a tela.
          : authErrorMessage(result, t)
      );
    }

    if (result.success && result.user && onLoginSuccess) {
      onLoginSuccess(result.user);
    }

    if (!result.redirecting) setGoogleLoading(false);
  };

  // Sem site key configurada o desafio não aparece, então não travamos o
  // formulário — o Supabase continua recusando pelo lado do servidor.
  const submitDisabled = loading || (HCAPTCHA_ENABLED && !captchaToken);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        {/* Header com fotos de viagens */}
        <View style={styles.header}>
          {/* Grade de fotos desfocadas */}
          <View style={styles.photosGrid}>
            <Image 
              source={require('../../assets/images/travel1.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel2.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel3.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel4.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel5.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel6.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
          </View>
          
          {/* Overlay escuro para destaque */}
          <View style={styles.headerOverlay}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../../assets/journi_logo_um_j_so_fundo_escuro.png')}
                style={{ width: 220, height: 98, alignSelf: 'center', marginBottom: 8 }}
                resizeMode="contain"
              />
              <Text style={styles.tagline}>{t('auth.login.tagline')}</Text>
            </View>
          </View>
        </View>

        {/* Card de Login */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('auth.login.welcome')}</Text>
          <Text style={styles.cardSubtitle}>{t('auth.login.subtitle')}</Text>

          {/* Email */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.login.emailPlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors({...errors, email: null});
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* Senha */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithIcon]}
                placeholder={t('auth.login.passwordPlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({...errors, password: null});
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showPassword ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={COLORS.gray} 
                />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotPasswordText}>{t('auth.login.forgotPassword')}</Text>
          </TouchableOpacity>

          {/* Verificação anti-bot (hCaptcha) */}
          <HCaptchaWidget
            ref={captchaRef}
            onVerify={setCaptchaToken}
            onError={() => notify(t('auth.captchaTitle'), t('auth.errors.captcha'))}
          />

          {/* Botão de Login */}
          <TouchableOpacity 
            style={[styles.button, submitDisabled && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitDisabled}
          >
            <LinearGradient
              colors={['#FF5722', '#FF7043']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <Text style={styles.buttonText}>{t('auth.login.submitting')}</Text>
              ) : (
                <>
                  <Text style={styles.buttonText}>{t('auth.login.submit')}</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.login.orDivider')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Login com Google */}
          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#DB4437" />
            ) : (
              <Ionicons name="logo-google" size={20} color="#DB4437" />
            )}
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Conectando...' : 'Continuar com Google'}
            </Text>
          </TouchableOpacity>

          {/* Link para Cadastro */}
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              Não tem conta? <Text style={styles.linkTextBold}>{t('auth.login.signUpCta')}</Text>
            </Text>
          </TouchableOpacity>

          {/* Ajuda e suporte, sem precisar estar logado */}
          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => navigation.navigate('Support')}
          >
            <Text style={styles.helpLinkText}>{t('auth.login.needHelp')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: '100%',
    backgroundColor: '#FFFFFF',
  },
  header: {
    position: 'relative',
    height: 340,
    overflow: 'hidden',
  },
  photosGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoItem: {
    width: '33.33%',
    height: '50%',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 30,
  },
  logoBackground: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    ...Platform.select({
      web: { textShadow: '0 3px 6px rgba(0,0,0,0.8)' },
      default: {
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 6,
      },
    }),
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
    ...Platform.select({
      web: { textShadow: '0 2px 4px rgba(0,0,0,0.7)' },
      default: {
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      },
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    marginTop: -30,
    boxShadow: '0px -3px 10px rgba(0, 0, 0, 0.1)',
    elevation: 10,
    paddingBottom: 60,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 28,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: SIZES.body,
    color: COLORS.text,
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginTop: -8,
    marginBottom: 8,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: COLORS.gray,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
  },
  linkButton: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  linkTextBold: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  helpLink: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  helpLinkText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
