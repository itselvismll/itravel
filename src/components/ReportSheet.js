// A folha de denúncia, usada nas quatro superfícies: foto, comentário, perfil e
// mensagem.
//
// POR QUE UM COMPONENTE SÓ
//
// São quatro telas com quatro alvos diferentes, mas UM fluxo: escolher o motivo,
// detalhar se quiser, enviar. Uma cópia por tela viraria quatro listas de
// motivos para manter em sincronia — e a lista de motivos é justamente o que a
// loja olha quando avalia se o app tem um caminho de denúncia de verdade.
//
// A folha não sabe o que está sendo denunciado: recebe `targetType` e `targetId`
// e repassa para o banco. É isso que faz caber nas quatro sem nenhuma condicional
// por tipo aqui dentro.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '../utils/dialogs';
import {
  REPORT_REASONS,
  REPORT_REASON_OTHER,
  createReport,
} from '../services/moderationService';

const DETAILS_MAX_LENGTH = 500;

/** Como cada alvo é chamado no título — o texto muda, o fluxo não. */
const TARGET_LABEL = {
  photo: 'esta foto',
  comment: 'este comentário',
  profile: 'este perfil',
  message: 'esta mensagem',
};

/**
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 *   targetType: 'photo'|'comment'|'profile'|'message',
 *   targetId: string,
 *   onReported?: () => void,
 * }} props
 */
export default function ReportSheet({ visible, onClose, targetType, targetId, onReported }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Zera a cada abertura. Sem isto, quem denuncia uma foto e depois abre a folha
  // num comentário encontra o motivo anterior já marcado — e envia sem perceber.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setEnviando(false);
    }
  }, [visible]);

  const precisaDetalhar = reason === REPORT_REASON_OTHER;
  const podeEnviar = !!reason && (!precisaDetalhar || details.trim().length > 0) && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;

    setEnviando(true);
    const resultado = await createReport({ targetType, targetId, reason, details });
    setEnviando(false);

    if (!resultado.success) {
      notify('Não foi possível denunciar', resultado.error || 'Tente novamente em instantes.');
      return;
    }

    onClose();
    // A confirmação não promete prazo nem resultado: a moderação é humana, e
    // prometer "vamos remover" seria assumir a conclusão antes da análise.
    notify('Denúncia enviada', 'Nossa equipe vai analisar. Obrigado por avisar.');
    onReported?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Ionicons name="flag-outline" size={19} color="#FF4D6D" />
            <Text style={styles.title}>Denunciar {TARGET_LABEL[targetType] || 'este conteúdo'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color="#8A90A6" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Conte o que está acontecendo. A denúncia é anônima para quem foi denunciado.
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {REPORT_REASONS.map((item) => {
              const selecionado = reason === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.reason, selecionado && styles.reasonSelected]}
                  onPress={() => setReason(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selecionado }}
                  accessibilityLabel={item}
                >
                  <Ionicons
                    name={selecionado ? 'radio-button-on' : 'radio-button-off'}
                    size={19}
                    color={selecionado ? '#A78BFA' : '#4A5273'}
                  />
                  <Text style={[styles.reasonText, selecionado && styles.reasonTextSelected]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* O campo só aparece em "Outro", onde ele é obrigatório: um motivo
                livre sem texto não diz nada para quem modera. Nos demais é
                opcional e fica escondido para não alongar a folha. */}
            {precisaDetalhar && (
              <View style={styles.detailsBox}>
                <TextInput
                  style={styles.detailsInput}
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Descreva o problema"
                  placeholderTextColor="#5A6180"
                  multiline
                  textAlignVertical="top"
                  maxLength={DETAILS_MAX_LENGTH}
                  accessibilityLabel="Detalhes da denúncia"
                />
                <Text style={styles.detailsCount}>
                  {details.length}/{DETAILS_MAX_LENGTH}
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.submit, !podeEnviar && styles.submitDisabled]}
            onPress={enviar}
            disabled={!podeEnviar}
            accessibilityRole="button"
            accessibilityLabel="Enviar denúncia"
          >
            {enviando
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.submitText}>Enviar denúncia</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,7,15,0.6)' },
  sheetWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#131A2E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingBottom: 30,
    paddingHorizontal: 18,
    maxHeight: '86%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2B3352',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { flex: 1, color: '#F7F7F2', fontSize: 15, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
  subtitle: { color: '#8A90A6', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  list: { flexGrow: 0 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232B49',
    marginBottom: 8,
  },
  reasonSelected: { borderColor: '#A78BFA', backgroundColor: 'rgba(167,139,250,0.10)' },
  reasonText: { flex: 1, color: '#D6DAEA', fontSize: 14 },
  reasonTextSelected: { color: '#F7F7F2' },
  detailsBox: { marginTop: 4, marginBottom: 8 },
  detailsInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232B49',
    backgroundColor: '#0F1527',
    color: '#F7F7F2',
    fontSize: 14,
    padding: 12,
  },
  detailsCount: { alignSelf: 'flex-end', color: '#5A6180', fontSize: 10, marginTop: 4 },
  submit: {
    marginTop: 12,
    backgroundColor: '#FF4D6D',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
