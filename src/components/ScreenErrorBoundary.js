// Rede de segurança para um erro de render/efeito não apagar a tela inteira.
//
// POR QUE ISTO EXISTE
//
// Um erro lançado no render ou num useEffect não fica contido no componente que
// o lançou: o React desmonta a árvore inteira acima dele e o que sobra é uma
// tela em branco, sem texto, sem botão e sem caminho de volta. Foi o que
// aconteceu quando a inscrição Realtime do Feed lançou ao remontar (ver o
// cabeçalho de services/realtimeChannel.js).
//
// Aquele bug está corrigido na origem. Este boundary não é a correção dele — é o
// que faz o PRÓXIMO erro desse tipo virar uma mensagem com um botão de tentar de
// novo, em vez de um app que parece ter morrido.
//
// POR QUE POR TELA, E NÃO UM SÓ NA RAIZ
//
// Um boundary na raiz derrubaria a navegação junto: o usuário perderia a tab bar
// e ficaria preso na tela de erro. Envolvendo cada tela, o estrago fica do
// tamanho da tela — a tab bar continua funcionando e dá para simplesmente ir
// para outro lugar.
//
// Precisa ser classe: `componentDidCatch` e `getDerivedStateFromError` não têm
// equivalente em hook. É a única classe do app por esse motivo.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';

export default class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // O erro continua indo para o console: engolir a mensagem transformaria uma
    // tela em branco (ruim, mas diagnosticável) numa tela de erro genérica sem
    // rastro nenhum (pior). Em dev o LogBox mostra isso normalmente.
    console.error(`[${this.props.name || 'tela'}] erro não tratado:`, error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  handleRetry() {
    // Só limpar o erro remonta os filhos — e se a causa foi transitória (uma
    // inscrição que pegou um estado ruim, uma resposta malformada), a remontagem
    // resolve. Se não foi, o boundary captura de novo e volta para esta tela, o
    // que é um laço visível e sem dano, não um travamento.
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textSecondary} />
        <Text style={styles.title}>Algo deu errado aqui</Text>
        <Text style={styles.message}>
          Não foi possível carregar esta tela. Você pode tentar de novo ou usar o menu abaixo para
          ir para outro lugar.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar a tela de novo"
        >
          <Ionicons name="refresh" size={18} color={COLORS.white} />
          <Text style={styles.buttonText}>Tentar de novo</Text>
        </TouchableOpacity>

        {/* A mensagem crua só em desenvolvimento: para quem está com o app na
            mão ela não significa nada, e ainda pode vazar detalhe interno. */}
        {__DEV__ && <Text style={styles.detail}>{String(error?.message || error)}</Text>}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: COLORS.background,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: COLORS.white,
  },
  detail: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
});
