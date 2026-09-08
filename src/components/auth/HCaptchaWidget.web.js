import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { COLORS } from '../../utils/constants';
import { HCAPTCHA_ENABLED, HCAPTCHA_SITE_KEY } from './hcaptchaConfig';

/**
 * Widget de hCaptcha para Expo Web: renderiza o checkbox inline do
 * `@hcaptcha/react-hcaptcha`. A versão nativa (WebView em modal) vive em
 * HCaptchaWidget.js — o Metro escolhe o arquivo pela plataforma.
 *
 * Props:
 *  - onVerify(token | null): recebe o token gerado, ou null quando o desafio
 *    expira, falha ou é resetado. Tokens são de uso único.
 *  - onError(error): opcional, para logar falhas de carregamento do widget.
 *
 * Ref:
 *  - reset(): descarta o token atual e recarrega o desafio.
 *  - markUsed(): no-op na web (existe para paridade com o nativo).
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
function HCaptchaWidgetImpl({ onVerify, onError, theme = 'light', style }, ref) {
  const captchaRef = useRef(null);

  const reset = useCallback(() => {
    onVerify?.(null);
    captchaRef.current?.resetCaptcha?.();
  }, [onVerify]);

  useImperativeHandle(ref, () => ({ reset, markUsed: () => {} }), [reset]);

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
      <HCaptcha
        ref={captchaRef}
        sitekey={HCAPTCHA_SITE_KEY}
        theme={theme}
        onVerify={(token) => onVerify?.(token)}
        onExpire={() => onVerify?.(null)}
        onChalExpired={() => onVerify?.(null)}
        onError={(error) => {
          onVerify?.(null);
          onError?.(error);
        }}
      />
    </View>
  );
}

const HCaptchaWidget = forwardRef(HCaptchaWidgetImpl);

const styles = StyleSheet.create({
  // O visual do desafio vem do próprio hCaptcha; aqui só cuidamos do
  // espaçamento para não empurrar o botão de submit para fora do card.
  container: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    minHeight: 78,
    justifyContent: 'center',
  },
  warning: {
    color: COLORS.error,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default HCaptchaWidget;
