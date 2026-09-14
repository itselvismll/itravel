// Folha de "Política e Privacidade", aberta pelo menu lateral.
//
// POR QUE UMA FOLHA, E NÃO DOIS ITENS NO MENU
//
// São dois documentos com nomes próprios (Termos de Uso e Política de
// Privacidade) e o menu pediu UM item. Abrir direto um deles esconderia o outro
// atrás de um link no rodapé da página, e o rótulo "Política e Privacidade" não
// avisaria que existem dois.
//
// "Excluir minha conta" já morou aqui e saiu para a tela de Editar perfil: a
// exclusão é uma ação sobre a CONTA, e quem a procura vai onde mexe na conta —
// não atrás de um item chamado "Política e Privacidade".
import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_CONFIG } from '../utils/constants';
import { notify } from '../utils/dialogs';

// Mesma base do RegisterScreen. A extensão .html é deliberada: o EAS Hosting faz
// fallback de SPA e devolve 200 com o app para caminho desconhecido, então uma
// rota limpa quebraria em silêncio se o arquivo saísse do lugar.
const BASE_URL = API_CONFIG.WEB_APP_URL.replace(/\/+$/, '');

const DOCUMENTOS = [
  {
    key: 'termos',
    icon: 'document-text-outline',
    label: 'Termos de Uso',
    description: 'Regras de uso, conteúdo e conta',
    path: 'termos.html',
  },
  {
    key: 'privacidade',
    icon: 'lock-closed-outline',
    label: 'Política de Privacidade',
    description: 'Que dados coletamos e seus direitos',
    path: 'privacidade.html',
  },
];

function DocumentoItem({ icon, label, description, onPress }) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Abre no navegador"
    >
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={19} color="#A78BFA" />
      </View>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <Ionicons name="open-outline" size={17} color="#4A5273" />
    </TouchableOpacity>
  );
}

/**
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function LegalSheet({ visible, onClose }) {
  const abrir = async (path) => {
    const url = `${BASE_URL}/${path}`;
    try {
      await Linking.openURL(url);
    } catch {
      notify('Não foi possível abrir', `Acesse ${url} pelo navegador.`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* O toque no fundo fecha. `Pressable` e não `TouchableOpacity` para o
          fundo não piscar a cada toque. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={21} color="#A78BFA" />
          <Text style={styles.title}>Política e Privacidade</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color="#8A90A6" />
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {DOCUMENTOS.map((documento) => (
            <DocumentoItem
              key={documento.key}
              icon={documento.icon}
              label={documento.label}
              description={documento.description}
              onPress={() => abrir(documento.path)}
            />
          ))}
        </View>

        <Text style={styles.footer}>
          Os documentos abrem no navegador e estão sempre disponíveis em
          {'\n'}
          {BASE_URL.replace(/^https?:\/\//, '')}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,7,15,0.6)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#131A2E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingBottom: 34,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  title: { flex: 1, color: '#F7F7F2', fontSize: 16, fontWeight: '800' },
  list: { gap: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  itemText: { flex: 1 },
  itemLabel: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  itemDescription: { color: '#8A90A6', fontSize: 11, marginTop: 2 },
  footer: {
    color: '#6E7694',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 16,
  },
});
