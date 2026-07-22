import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../utils/constants';
import { signUp } from '../../services/supabase';
import { checkUsernameAvailable } from '../../services/profileService';
import Logo from '../../components/Logo';

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
  const [errors, setErrors] = useState({});

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

  const showTerms = () => {
    Alert.alert(
      'Termos de Uso',
      'Ao usar o Journi, você concorda em:\n\n• Fornecer informações verdadeiras\n• Não usar o app para fins ilegais\n• Respeitar outros usuários\n• Não compartilhar conteúdo ofensivo\n• Seguir as leis locais e internacionais\n\nO Journi se reserva o direito de suspender contas que violem estes termos.',
      [{ text: 'Entendi' }]
    );
  };

  const showPrivacy = () => {
    Alert.alert(
      'Política de Privacidade',
      'Suas informações são protegidas:\n\n• Seus dados são criptografados\n• Não vendemos suas informações\n• Você controla sua privacidade\n• Fotos e posts seguem suas configurações\n• Coletamos apenas dados necessários\n• Você pode deletar sua conta a qualquer momento\n\nUsamos cookies para melhorar sua experiência.',
      [{ text: 'Entendi' }]
    );
  };

  const handleRegister = async () => {
    console.log('🔵 Cadastro iniciado');
    setErrors({});
    const newErrors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Nome completo é obrigatório';
    }

    if (!username.trim()) {
      newErrors.username = 'Nome de usuário é obrigatório';
    } else if (username.length < 3) {
      newErrors.username = 'Nome de usuário deve ter no mínimo 3 caracteres';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = 'Use apenas letras, números e underscore';
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
      console.log('❌ Erros de validação:', newErrors);
      setErrors(newErrors);
      return;
    }

    console.log('✅ Validação OK, criando conta...');
    setLoading(true);
    const result = await signUp(email, password, username, fullName);
    console.log('📦 Resultado:', result);
    setLoading(false);

    if (result.success) {
      console.log('✅ Conta criada com sucesso!');
      Alert.alert(
        'Conta criada! 🎉',
        'Verifique seu email para confirmar sua conta antes de fazer login.',
        [
          {
            text: 'OK',
            onPress: () => {
              console.log('🔄 Navegando para Login...');
              navigation.navigate('Login');
            }
          }
        ]
      );
    } else {
      console.log('❌ Erro ao criar conta:', result.error);
      let errorMessage = result.error;
      
      if (errorMessage.includes('already registered')) {
        errorMessage = 'Este email já está cadastrado';
      }
      
      Alert.alert('Erro no Cadastro', errorMessage);
    }
  };

  const passwordValidation = validatePassword(password);

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
                name="register-fullname"
                id="register-fullname"
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
                  const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
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
                name="register-username"
                id="register-username"
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
                name="register-email"
                id="register-email"
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
                name="register-password"
                id="register-password"
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
                name="register-confirm-password"
                id="register-confirm-password"
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
                <TouchableOpacity onPress={showTerms}>
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' }}>
                    Termos de Uso
                  </Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 13, color: COLORS.text }}> e </Text>
                <TouchableOpacity onPress={showPrivacy}>
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' }}>
                    Política de Privacidade
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {errors.terms && <Text style={styles.errorText}>{errors.terms}</Text>}

          {/* Botão Cadastrar */}
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
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
