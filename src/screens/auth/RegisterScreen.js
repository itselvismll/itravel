import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { API_CONFIG, COLORS, SIZES } from '../../utils/constants';
import { signUp } from '../../services/supabase';
import { checkUsernameAvailable } from '../../services/profileService';
import { USERNAME_MAX_LENGTH, normalizeUsername, validateUsername } from '../../utils/username';
import Logo from '../../components/Logo';
import { notify } from '../../utils/dialogs';
import HCaptchaWidget from '../../components/auth/HCaptchaWidget';
import { HCAPTCHA_ENABLED, HCAPTCHA_ERROR_MESSAGE } from '../../components/auth/hcaptchaConfig';

// Os documentos legais saem do mesmo host do app web (journi.expo.app por
// padrão, sobrescrito por EXPO_PUBLIC_WEB_APP_URL). Reaproveitar a constante
// evita que a URL das lojas e a do app divirjam.
const LEGAL_DOCS_BASE_URL = API_CONFIG.WEB_APP_URL.replace(/\/+$/, '');

export default function RegisterScreen({ navigation, onRegisterSuccess }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(/** @type {string | null} */ (null));
  const captchaRef = useRef(/** @type {{ reset: () => void, markUsed: () => void } | null} */ (null));
  const [errors, setErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validatePassword = (password) => {
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return {
      isValid: hasMinLength && hasUpperCase && hasLowerCase && hasNumber,
      hasMinLength,
      hasUpperCase,
      hasLowerCase,
      hasNumber,
    };
  };

  // Os documentos moram em public/termos.html e public/privacidade.html e são
  // servidos pelo próprio host do app. Antes isto eram dois Alert com texto
  // resumido escrito na mão — que não servem para as lojas (elas exigem uma URL
  // pública, acessível sem instalar o app) e, no caso da privacidade, prometiam
  // exclusão de conta que ainda não existia.
  //
  // A extensão .html é DELIBERADA e não deve virar rota limpa: o EAS Hosting faz
  // fallback de SPA e devolve HTTP 200 com o app para qualquer caminho
  // desconhecido. `/termos` responderia 200 mostrando o aplicativo, e nem um
  // monitoramento de status perceberia que a página não existe.
  const openLegalDoc = async (path) => {
    const url = `${LEGAL_DOCS_BASE_URL}/${path}`;
    try {
      await Linking.openURL(url);
    } catch {
      notify('Não foi possível abrir', `Acesse ${url} pelo navegador.`);
    }
  };

  const handleRegister = async () => {
    setErrors({});
    const newErrors = /** @type {Record<string, string>} */ ({});

    if (!fullName.trim()) {
      newErrors.fullName = 'Nome completo é obrigatório';
    }

    // Mesma regra do trigger de cadastro e da edição de perfil — ver
    // src/utils/username.js.
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      newErrors.username = usernameCheck.error;
    }

    if (!email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Email inválido';
    }

    const passwordValidation = validatePassword(password);
    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (!passwordValidation.isValid) {
      newErrors.password = 'Senha não atende aos requisitos de segurança';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Confirme sua senha';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem';
    }

    if (!acceptedTerms) {
      newErrors.terms = 'Você deve aceitar os termos de uso';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    const result = await signUp(email, password, username, fullName, captchaToken ?? undefined);
    setLoading(false);

    if (result.success) {
      // Token do hCaptcha é de uso único: consumido, some do estado.
      captchaRef.current?.markUsed();
      setCaptchaToken(null);
      navigation.navigate('ConfirmEmail', { email });
    } else {
      // Falhou? O token já foi queimado na tentativa — recarrega o desafio.
      captchaRef.current?.reset();
      setCaptchaToken(null);

      let errorMessage = result.error;

      if (errorMessage.includes('already registered')) {
        errorMessage = 'Este email já está cadastrado';
      } else if (/rate limit|too many|429/i.test(errorMessage)) {
        errorMessage = 'Muitas tentativas de cadastro em pouco tempo. Aguarde alguns minutos e tente novamente.';
      } else if (/captcha/i.test(errorMessage)) {
        errorMessage = HCAPTCHA_ERROR_MESSAGE;
      }

      notify('Erro no Cadastro', errorMessage);
    }
  };

  const passwordValidation = validatePassword(password);

  // Sem site key configurada o desafio não aparece, então não travamos o
  // formulário — o Supabase continua recusando pelo lado do servidor.
  const submitDisabled = loading || (HCAPTCHA_ENABLED && !captchaToken);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.wrapper}>
        <LinearGradient
          colors={['#0D1326', '#1a2040']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerLogo}>
            <Logo size={50} />
          </View>
          
          <Text style={styles.headerTitle}>Criar Conta</Text>
        </LinearGradient>

        <View style={styles.card}>
          {/* Nome Completo */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nome completo"
                placeholderTextColor={COLORS.textSecondary}
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (errors.fullName) setErrors({...errors, fullName: null});
                }}
                autoCapitalize="words"
                autoComplete="off"
                autoCorrect={false}
              />
            </View>
            {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
          </View>

          {/* Username */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="at" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nome de usuário"
                placeholderTextColor={COLORS.textSecondary}
                value={username}
                onChangeText={async (text) => {
                  // Normaliza a cada tecla: o campo mostra exatamente o que
                  // será salvo (sem acento, sem maiúscula, sem espaço).
                  const clean = normalizeUsername(text);
                  setUsername(clean);
                  if (errors.username) setErrors({...errors, username: null});
                  if (clean.length >= 3) {
                    setCheckingUsername(true);
                    const available = await checkUsernameAvailable(clean);
                    setUsernameAvailable(available);
                    setCheckingUsername(false);
                  } else {
                    setUsernameAvailable(null);
                  }
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={USERNAME_MAX_LENGTH}
              />
            </View>
            {checkingUsername && (
              <ActivityIndicator size="small" color="#6C2BD9" style={{ marginTop: 4, alignSelf: 'flex-start' }} />
            )}
            {usernameAvailable === true && username.length >= 3 && (
              <Text style={{ color: 'green', fontSize: 11, marginTop: 4 }}>✓ Username disponível</Text>
            )}
            {usernameAvailable === false && (
              <Text style={{ color: 'red', fontSize: 11, marginTop: 4 }}>✗ Username já em uso</Text>
            )}
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
          </View>

          {/* Email */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.textSecondary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors({...errors, email: null});
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
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
                placeholder="Senha"
                placeholderTextColor={COLORS.textSecondary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({...errors, password: null});
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
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
            
            {/* Requisitos de Senha */}
            {password.length > 0 && (
              <View style={styles.passwordRequirements}>
                <Text style={styles.requirementTitle}>Sua senha deve ter:</Text>
                <View style={styles.requirement}>
                  <Ionicons 
                    name={passwordValidation.hasMinLength ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={passwordValidation.hasMinLength ? COLORS.success : COLORS.error} 
                  />
                  <Text style={[styles.requirementText, passwordValidation.hasMinLength && styles.requirementMet]}>
                    Mínimo 8 caracteres
                  </Text>
                </View>
                <View style={styles.requirement}>
                  <Ionicons 
                    name={passwordValidation.hasUpperCase ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={passwordValidation.hasUpperCase ? COLORS.success : COLORS.error} 
                  />
                  <Text style={[styles.requirementText, passwordValidation.hasUpperCase && styles.requirementMet]}>
                    Uma letra maiúscula
                  </Text>
                </View>
                <View style={styles.requirement}>
                  <Ionicons 
                    name={passwordValidation.hasLowerCase ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={passwordValidation.hasLowerCase ? COLORS.success : COLORS.error} 
                  />
                  <Text style={[styles.requirementText, passwordValidation.hasLowerCase && styles.requirementMet]}>
                    Uma letra minúscula
                  </Text>
                </View>
                <View style={styles.requirement}>
                  <Ionicons 
                    name={passwordValidation.hasNumber ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={passwordValidation.hasNumber ? COLORS.success : COLORS.error} 
                  />
                  <Text style={[styles.requirementText, passwordValidation.hasNumber && styles.requirementMet]}>
                    Um número
                  </Text>
                </View>
              </View>
            )}
            
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Confirmar Senha */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithIcon]}
                placeholder="Confirmar senha"
                placeholderTextColor={COLORS.textSecondary}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) setErrors({...errors, confirmPassword: null});
                }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
              />
              <TouchableOpacity 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={COLORS.gray} 
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
          </View>

          {/* Termos de Uso */}
          <View style={styles.checkboxContainer}>
            <TouchableOpacity 
              onPress={() => {
                setAcceptedTerms(!acceptedTerms);
                if (errors.terms) setErrors({...errors, terms: null});
              }}
              style={styles.checkboxTouchable}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                {acceptedTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
            </TouchableOpacity>
            
            <View style={{ flex: 1, pointerEvents: 'box-none' }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: COLORS.text }}>Aceito os </Text>
                <TouchableOpacity
                  onPress={() => openLegalDoc('termos.html')}
                  accessibilityRole="link"
                  accessibilityLabel="Abrir os Termos de Uso"
                >
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' }}>
                    Termos de Uso
                  </Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 13, color: COLORS.text }}> e </Text>
                <TouchableOpacity
                  onPress={() => openLegalDoc('privacidade.html')}
                  accessibilityRole="link"
                  accessibilityLabel="Abrir a Política de Privacidade"
                >
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' }}>
                    Política de Privacidade
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {errors.terms && <Text style={styles.errorText}>{errors.terms}</Text>}

          {/* Verificação anti-bot (hCaptcha) */}
          <HCaptchaWidget
            ref={captchaRef}
            onVerify={setCaptchaToken}
            onError={() => notify('Verificação de segurança', HCAPTCHA_ERROR_MESSAGE)}
          />

          {/* Botão Cadastrar */}
          <TouchableOpacity 
            style={[styles.button, submitDisabled && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={submitDisabled}
          >
            <LinearGradient
              colors={['#FF5722', '#FF7043']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <Text style={styles.buttonText}>Criando conta...</Text>
              ) : (
                <>
                  <Text style={styles.buttonText}>Criar Conta</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Link para Login */}
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>
              Já tem conta? <Text style={styles.linkTextBold}>Faça login</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: '100%',
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 50,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerLogo: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    paddingBottom: 60,
  },
  inputContainer: {
    marginBottom: 16,
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
  passwordRequirements: {
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  requirementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  requirement: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  requirementText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  requirementMet: {
    color: COLORS.success,
    textDecorationLine: 'line-through',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    marginBottom: 24,
  },
  checkboxTouchable: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  button: {
    borderRadius: SIZES.radius,
    overflow: 'hidden',
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
  linkButton: {
    marginTop: 24,
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
});
