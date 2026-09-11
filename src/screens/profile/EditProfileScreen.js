import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { updateProfile, checkUsernameAvailable, uploadAvatar } from '../../services/profileService';
import { getCurrentUser } from '../../services/supabase';
import { USERNAME_MAX_LENGTH, normalizeUsername, validateUsername } from '../../utils/username';
import useTabBarContentPadding from '../../hooks/useTabBarContentPadding';
import {
  BIO_MAX_LENGTH,
  BIO_MAX_LINES,
  BIO_MAX_LINE_BREAKS,
  bioLength,
  countLineBreaks,
  normalizeBio,
  validateBio,
} from '../../utils/bio';

// Teto bruto do TextInput. Fica ACIMA do limite real para o excedente poder ser
// digitado, contado e mostrado em vermelho — o corte seco no limite esconderia
// do usuário o motivo de o botão recusar. O maxLength existe só para não deixar
// alguém colar um texto gigantesco no campo.
const BIO_HARD_INPUT_LIMIT = BIO_MAX_LENGTH * 2;

const PALAVRAS_PROIBIDAS = [
  'puta', 'puto', 'viado', 'buceta', 'cu', 'merda', 'caralho', 'porra',
  'foda', 'foder', 'fodase', 'fudeu', 'desgraça', 'arrombado', 'fdp',
  'vsf', 'imbecil', 'idiota', 'burro', 'corno', 'vagabundo', 'vagabunda',
  'prostituta', 'safado', 'safada', 'pilantra', 'lixo', 'otario', 'otária',
  'babaca', 'cuzao', 'cuzão', 'boceta', 'piroca', 'rola', 'xereca',
  'xoxota', 'pentelho', 'cacete', 'escrota', 'escrotão', 'viada',
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'cock', 'pussy', 'motherfucker', 'nigga', 'nigger', 'faggot',
  'whore', 'slut', 'retard', 'nazi', 'hitler', 'porn', 'sex',
  'admin', 'suporte', 'moderador', 'journi', 'sistema',
];

const contemPalavraProibida = (texto) => {
  const textoLower = texto.toLowerCase().trim();
  const palavras = textoLower.split(/\s+/);
  return PALAVRAS_PROIBIDAS.some(proibida =>
    palavras.some(palavra => palavra === proibida)
  );
};

export default function EditProfileScreen({ navigation, route }) {
  // Esta tela vive dentro do ProfileStack, que fica sob as tabs: a barra flutua
  // sobre o formulário e cobriria o último campo.
  const tabBarPadding = useTabBarContentPadding();
  const { profile } = route.params || {};

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUri, setAvatarUri] = useState(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
    }
  }, [profile]);

  // Tudo medido sobre o texto NORMALIZADO — é o que validateBio mede e o que vai
  // para o banco. Contar o texto cru faria o contador acusar 170/160 em vermelho
  // numa bio que salva sem problema, porque as quebras excedentes são
  // compactadas antes de medir.
  const bioNormalized = normalizeBio(bio);
  const bioCount = bioLength(bioNormalized);
  const bioOverLength = bioCount > BIO_MAX_LENGTH;
  // O limite de linhas BLOQUEIA o salvamento, então ele precisa aparecer
  // enquanto a pessoa digita — descobrir só ao apertar "Salvar" é pior.
  const bioOverLines = countLineBreaks(bioNormalized) > BIO_MAX_LINE_BREAKS;
  const bioInvalid = bioOverLength || bioOverLines;

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Permissão para acessar galeria negada.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarFile(result.assets[0]);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setErrorMessage('O nome não pode estar vazio.');
      return;
    }
    // Mesma regra do cadastro, da escolha via Google e do trigger — ver
    // src/utils/username.js.
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      setErrorMessage(`${usernameCheck.error}.`);
      return;
    }
    const normalizedUsername = usernameCheck.value;

    if (displayName.length > 12) {
      setErrorMessage('O nome deve ter no máximo 12 caracteres.');
      return;
    }
    if (contemPalavraProibida(displayName) || contemPalavraProibida(username)) {
      setErrorMessage('⚠️ Nome inadequado. Por favor escolha outro nome.');
      return;
    }

    // A bio passa pela MESMA validação que o profileService aplica antes de
    // gravar (utils/bio.js). Aqui é só para a mensagem aparecer sem uma ida ao
    // servidor — a regra que vale continua sendo a de lá.
    const bioCheck = validateBio(bio);
    if (!bioCheck.valid) {
      setErrorMessage(bioCheck.error);
      return;
    }

    setErrorMessage('');
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Usuário não autenticado.');

      const usernameChanged = normalizedUsername !== profile?.username?.trim().toLowerCase();
      if (usernameChanged) {
        const available = await checkUsernameAvailable(normalizedUsername, user.id);
        setUsernameAvailable(available);
        if (!available) {
          setErrorMessage('Este username já está em uso.');
          return;
        }
      }

      let finalAvatarUrl = avatarUri;

      if (avatarFile) {
        setUploadingAvatar(true);
        const uploadResult = await uploadAvatar(user.id, avatarFile.uri);
        setUploadingAvatar(false);

        if (!uploadResult.success) {
          setErrorMessage('Erro ao enviar foto: ' + uploadResult.error);
          setSaving(false);
          return;
        }
        finalAvatarUrl = uploadResult.avatarUrl;
      }

      const result = await updateProfile(user.id, {
        display_name: displayName.trim(),
        username: normalizedUsername,
        bio: bioCheck.value,
        ...(avatarFile && { avatar_url: finalAvatarUrl }),
      });

      if (result.success) {
        Alert.alert('Perfil atualizado!', 'Suas informações foram salvas.');
        navigation.goBack();
      } else {
        setErrorMessage('Erro ao salvar: ' + result.error);
      }
    } catch (e) {
      setErrorMessage('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarPadding }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar perfil</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="white" />
            : <Text style={styles.saveBtnText}>Salvar</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarContainer}>
            {uploadingAvatar ? (
              <View style={styles.avatar}>
                <ActivityIndicator color="white" />
              </View>
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toque para alterar a foto</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            style={[styles.input, displayName.length >= 12 && { borderBottomColor: '#6C2BD9' }]}
            value={displayName}
            onChangeText={(text) => {
              if (text.length <= 12) {
                setDisplayName(text);
                setErrorMessage('');
              }
            }}
            placeholder="Como quer ser chamado"
            placeholderTextColor="#bbb"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {displayName.length >= 12
              ? <Text style={{ fontSize: 10, color: '#6C2BD9' }}>Limite máximo atingido</Text>
              : <Text style={{ fontSize: 10, color: '#bbb' }}>Máximo 12 caracteres</Text>
            }
            <Text style={{ fontSize: 10, color: displayName.length >= 10 ? '#6C2BD9' : '#bbb' }}>
              {displayName.length}/12
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>Username</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={{ flex: 1, fontSize: 15, color: '#0D1326', paddingVertical: 8 }}
              value={username}
              onChangeText={(text) => {
                // Normaliza a cada tecla: o campo mostra exatamente o que será
                // salvo, e o corte em 10 chars vem da regra compartilhada.
                const sliced = normalizeUsername(text);
                setUsername(sliced);
                setUsernameAvailable(null);
                setErrorMessage('');
                if (sliced.length >= 3 && sliced !== profile?.username) {
                  setCheckingUsername(true);
                  checkUsernameAvailable(sliced, profile?.id).then(available => {
                    setUsernameAvailable(available);
                    setCheckingUsername(false);
                  });
                }
              }}
              placeholder="seuusername"
              placeholderTextColor="#bbb"
              autoCapitalize="none"
            />
            {checkingUsername && <ActivityIndicator size="small" color="#6C2BD9" />}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {usernameAvailable === true && <Text style={{ fontSize: 10, color: '#22c55e' }}>✓ Disponível</Text>}
            {usernameAvailable === false && <Text style={{ fontSize: 10, color: '#ef4444' }}>✗ Já em uso</Text>}
            {!usernameAvailable && username.length >= USERNAME_MAX_LENGTH && <Text style={{ fontSize: 10, color: '#6C2BD9' }}>Limite máximo atingido</Text>}
            {!usernameAvailable && username.length < USERNAME_MAX_LENGTH && <Text style={{ fontSize: 10, color: '#bbb' }}>{`Máximo ${USERNAME_MAX_LENGTH} caracteres`}</Text>}
            <Text style={{ fontSize: 10, color: username.length >= USERNAME_MAX_LENGTH - 1 ? '#6C2BD9' : '#bbb' }}>
              {username.length}/{USERNAME_MAX_LENGTH}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput, bioInvalid && { borderBottomColor: '#ef4444' }]}
            value={bio}
            // Sem corte no onChangeText, diferente do Nome e do Username: cortar
            // no meio de um emoji composto (uma bandeira, uma família) quebraria
            // o caractere na cara de quem está digitando. Aqui o excedente é
            // mostrado em vermelho e barrado no salvar.
            onChangeText={(text) => {
              setBio(text);
              setErrorMessage('');
            }}
            placeholder="Conte algo sobre suas viagens"
            placeholderTextColor="#bbb"
            multiline
            // A bio aceita quebra de linha, então o teclado precisa oferecer o
            // Enter em vez de um "OK" que fecha o campo.
            textAlignVertical="top"
            maxLength={BIO_HARD_INPUT_LIMIT}
            accessibilityLabel="Bio do perfil"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text
              style={{ fontSize: 10, color: bioOverLines ? '#ef4444' : '#bbb', flex: 1 }}
            >
              {bioOverLines
                ? `A bio pode ter no máximo ${BIO_MAX_LINES} linhas.`
                : `Opcional. Sem links. Máximo ${BIO_MAX_LINES} linhas.`}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: bioOverLength ? '#ef4444' : bioCount >= BIO_MAX_LENGTH - 20 ? '#6C2BD9' : '#bbb',
              }}
            >
              {bioCount}/{BIO_MAX_LENGTH}
            </Text>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  bioInput: { minHeight: 74, paddingTop: 8, lineHeight: 20 },
  header: {
    backgroundColor: '#0D1326',
    padding: 16,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: 'white' },
  saveBtn: {
    backgroundColor: '#6C2BD9',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  body: { padding: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarContainer: { position: 'relative', marginBottom: 8 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6C2BD9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontSize: 32, fontWeight: '700', color: 'white' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6C2BD9',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  avatarHint: { fontSize: 12, color: '#999' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16 },
  label: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    fontSize: 15,
    color: '#0D1326',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  divider: { height: 16 },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  atSign: { fontSize: 15, color: '#999', marginRight: 2 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
  },
});
