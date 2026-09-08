import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import { COLORS, SIZES } from '../../utils/constants';
import { HCAPTCHA_ENABLED, HCAPTCHA_SITE_KEY } from './hcaptchaConfig';

/**
 * Widget de hCaptcha para iOS/Android. O SDK nativo só sabe abrir o desafio em
 * um modal com WebView, então mostramos aqui uma linha clicável no lugar do
 * checkbox inline que a web tem (ver HCaptchaWidget.web.js).
 *
 * Props e ref seguem o mesmo contrato da versão web; `markUsed()` avisa o SDK
 * de que o token já foi consumido, evitando o evento `expired` de 120s.
 */
/**
 * @typedef {object} HCaptchaWidgetProps
 * @property {(token: string | null) => void} [onVerify] Recebe o token gerado,
 *   ou null quando o desafio expira, falha ou é resetado.
 * @property {(error: unknown) => void} [onError]
 * @property {'light' | 'dark'} [theme]
 * @property {import('react-native').StyleProp<import('react-native').ViewStyle>} [style]
 */

/** @typedef {{ reset: () => void, markUsed: () => void }} HCaptchaWidgetHandle */

/**
 * @param {HCaptchaWidgetProps} props
 * @param {import('react').ForwardedRef<HCaptchaWidgetHandle>} ref
 */
function HCaptchaWidgetImpl({ onVerify, onError, style }, ref) {
  const captchaRef = useRef(null);
  const lastEventRef = useRef(null);
  const [verified, setVerified] = useState(false);

  const clearToken = useCallback(() => {
    lastEventRef.current = null;
    setVerified(false);
    onVerify?.(null);
  }, [onVerify]);

  const reset = useCallback(() => {
    captchaRef.current?.hide();
    clearToken();
  }, [clearToken]);

  const markUsed = useCallback(() => {
    lastEventRef.current?.markUsed?.();
    lastEventRef.current = null;
  }, []);

  useImperativeHandle(ref, () => ({ reset, markUsed }), [reset, markUsed]);

  const handleMessage = useCallback((event) => {
    const data = event?.nativeEvent?.data;
    if (!data) return;

    if (event.success) {
      lastEventRef.current = event;
      captchaRef.current?.hide();
      setVerified(true);
      onVerify?.(data);
      return;
    }

    if (data === 'open') return;

    captchaRef.current?.hide();
    clearToken();

    // 'cancel'/'challenge-closed' são o usuário desistindo; o resto é falha real.
    if (data !== 'cancel' && data !== 'challenge-closed') {
      onError?.(data);
    }
  }, [clearToken, onError, onVerify]);

  if (!HCAPTCHA_ENABLED) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.warning}>
          Verificação de segurança indisponível: defina EXPO_PUBLIC_HCAPTCHA_SITE_KEY.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[styles.trigger, verified && styles.triggerVerified]}
        onPress={() => {
          if (verified) return;
          captchaRef.current?.show();
        }}
        disabled={verified}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Verificação de segurança"
      >
        <Ionicons
          name={verified ? 'checkmark-circle' : 'shield-checkmark-outline'}
          size={20}
          color={verified ? COLORS.success : COLORS.gray}
        />
        <Text style={[styles.triggerText, verified && styles.triggerTextVerified]}>
          {verified ? 'Verificação concluída' : 'Toque para verificar que não é um robô'}
        </Text>
      </TouchableOpacity>

      <ConfirmHcaptcha
        ref={captchaRef}
        siteKey={HCAPTCHA_SITE_KEY}
        size="invisible"
        baseUrl="https://hcaptcha.com"
        languageCode="pt"
        backgroundColor="rgba(13, 19, 38, 0.9)"
        loadingIndicatorColor={COLORS.textLight}
        onMessage={handleMessage}
      />
    </View>
  );
}

const HCaptchaWidget = forwardRef(HCaptchaWidgetImpl);

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 16,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.background,
  },
  triggerVerified: {
    borderColor: COLORS.success,
  },
  triggerText: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: '500',
  },
  triggerTextVerified: {
    color: COLORS.success,
  },
  warning: {
    color: COLORS.error,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default HCaptchaWidget;
