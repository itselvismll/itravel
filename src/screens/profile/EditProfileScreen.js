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
import {
  updateProfile,
  checkUsernameAvailable,
  uploadAvatar,
  requestAccountDeletion,
  ACCOUNT_DELETION_GRACE_DAYS,
} from '../../services/profileService';
import { getCurrentUser, signOut } from '../../services/supabase';
import { confirm, notify } from '../../utils/dialogs';
import { useLocale } from '../../i18n/LocaleProvider';
import { USERNAME_MAX_LENGTH, normalizeUsername, validateUsername } from '../../utils/username';
import {
  DISPLAY_NAME_MAX_LENGTH,
  acceptDisplayNameInput,
  displayNameLengthState,
} from '../../utils/displayName';
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
import { INSTAGRAM_FEATURE_ENABLED, normalizeInstagramUsername } from '../../utils/instagram';

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
  const { t } = useLocale();
  // Esta tela vive dentro do ProfileStack, que fica sob as tabs: a barra flutua
  // sobre o formulário e cobriria o último campo.
  const tabBarPadding = useTabBarContentPadding();
  const { profile } = route.params || {};

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [instagram, setInstagram] = useState(profile?.instagram_username || '');
  const [avatarUri, setAvatarUri] = useState(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setInstagram(profile.instagram_username || '');
    }
  }, [profile]);

  // Tudo medido sobre o texto NORMALIZADO — é o que validateBio mede e o que vai
  // para o banco. Contar o texto cru faria o contador acusar 170/160 em vermelho
  // numa bio que salva sem problema, porque as quebras excedentes são
  // compactadas antes de medir.
  const nameState = displayNameLengthState(displayName);

  const bioNormalized = normalizeBio(bio);
  const bioCount = bioLength(bioNormalized);
  const bioOverLength = bioCount > BIO_MAX_LENGTH;
  // O limite de linhas BLOQUEIA o salvamento, então ele precisa aparecer
  // enquanto a pessoa digita — descobrir só ao apertar "Salvar" é pior.
  const bioOverLines = countLineBreaks(bioNormalized) > BIO_MAX_LINE_BREAKS;
  const bioInvalid = bioOverLength || bioOverLines;

  // Vazio NAO e invalido: o campo e opcional. So o que a pessoa digitou e a
  // normalizacao nao conseguiu aproveitar conta como erro — assim o aviso
  // vermelho nao aparece num campo intocado.
  const instagramNormalizado = normalizeInstagramUsername(instagram);
  const instagramInvalido = instagram.trim().length > 0 && !instagramNormalizado;

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

    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      setErrorMessage(`O nome deve ter no máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres.`);
      return;
    }
    if (contemPalavraProibida(displayName) || contemPalavraProibida(username)) {
      setErrorMessage('Nome inadequado. Por favor escolha outro nome.');
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

    // Barra ANTES de gravar: o constraint do banco recusaria com um 23514, cuja
    // mensagem crua não diz à pessoa o que fazer. Campo vazio segue em frente —
    // é opcional, e vira null lá.
    if (INSTAGRAM_FEATURE_ENABLED && instagramInvalido) {
      setErrorMessage('O @ do Instagram só aceita letras, números, ponto e underline.');
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
        // Com a feature ligada, é enviado SEMPRE, inclusive vazio: é assim que
        // apagar o campo funciona. Mandar só quando preenchido deixaria o @
        // antigo no banco para sempre.
        //
        // Com a feature desligada, a chave nem entra no update — e isso não é
        // arrumação, é o que impede uma regressão séria: a migration da coluna
        // AINDA NÃO foi aplicada em produção, então mandar `instagram_username`
        // faria o PostgREST recusar o UPDATE inteiro por coluna inexistente. O
        // campo está escondido, mas o salvamento de nome, username, bio e avatar
        // quebraria para todo mundo.
        // Ternário e não `&&`: a flag é a constante literal `false`, e o
        // TypeScript estreita o tipo para `false`, que não pode ser espalhado.
        ...(INSTAGRAM_FEATURE_ENABLED ? { instagram_username: instagramNormalizado } : {}),
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


  // Exclusão de conta. Vive nesta tela, no fim e atrás de um divisor, porque é a
  // tela de "mexer na minha conta" — mas separada dos campos: um toque acidental
  // aqui não pode parecer edição de perfil.
  //
  // A regra inteira é do banco (ver 20260911140000_account_deletion.sql). Aqui só
  // se pede, se avisa e se sai.
  const confirmarExclusao = async () => {
    // O texto diz exatamente o que acontece, porque é a última tela antes de uma
    // ação que apaga fotos e histórico. "Tem certeza?" sozinho não informa nada.
    // As quebras de linha dobradas são parte do texto e foram para a chave como
    // `\n\n`: elas separam os três parágrafos do aviso, e o que importa aqui é
    // que o tradutor as veja junto da frase que elas dividem.
    const aceitou = await confirm(
      t('editProfile.account.confirmTitle'),
      t('editProfile.account.confirmMessage', { count: ACCOUNT_DELETION_GRACE_DAYS })
    );
    if (!aceitou) return;

    setExcluindo(true);
    const resultado = await requestAccountDeletion();

    if (!resultado.success) {
      setExcluindo(false);
      notify(t('editProfile.account.deleteFailedTitle'), resultado.error || t('editProfile.account.deleteFailedMessage'));
      return;
    }

    // Sair é parte da regra, não cortesia: a conta já está invisível, e continuar
    // na sessão mostraria um app pela metade — feed vazio, perfil sem nada.
    await signOut();
    setExcluindo(false);

    notify(
      t('editProfile.account.deletedTitle'),
      t('editProfile.account.deletedMessage', { count: ACCOUNT_DELETION_GRACE_DAYS })
    );
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
        <Text style={styles.headerTitle}>{t('editProfile.title')}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="white" />
            : <Text style={styles.saveBtnText}>{t('common.actions.save')}</Text>
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
          <Text style={styles.avatarHint}>{t('editProfile.changePhoto')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('editProfile.fields.name')}</Text>
          <TextInput
            style={[
              styles.input,
              nameState === 'full' && { borderBottomColor: '#6C2BD9' },
              nameState === 'over' && { borderBottomColor: '#ef4444' },
            ]}
            value={displayName}
            onChangeText={(text) => {
              // Barra só o que CRESCE além do limite; apagar passa sempre — ver
              // utils/displayName.js, é lá que o campo travava.
              if (acceptDisplayNameInput(displayName, text)) {
                setDisplayName(text);
                setErrorMessage('');
              }
            }}
            placeholder={t('editProfile.fields.namePlaceholder')}
            placeholderTextColor="#bbb"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {nameState === 'over' && (
              <Text style={{ fontSize: 10, color: '#ef4444' }}>
                {t('editProfile.trimToSave', {
                  characters: t('common.plural.character', {
                    count: displayName.length - DISPLAY_NAME_MAX_LENGTH,
                  }),
                })}
              </Text>
            )}
            {nameState === 'full' && <Text style={{ fontSize: 10, color: '#6C2BD9' }}>{t('editProfile.limitReached')}</Text>}
            {nameState === 'ok' && <Text style={{ fontSize: 10, color: '#bbb' }}>{`Máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres`}</Text>}
            <Text
              style={{
                fontSize: 10,
                color: nameState === 'over' ? '#ef4444' : displayName.length >= DISPLAY_NAME_MAX_LENGTH - 2 ? '#6C2BD9' : '#bbb',
              }}
            >
              {displayName.length}/{DISPLAY_NAME_MAX_LENGTH}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>{t('editProfile.fields.username')}</Text>
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
              placeholder={t('editProfile.fields.usernamePlaceholder')}
              placeholderTextColor="#bbb"
              autoCapitalize="none"
            />
            {checkingUsername && <ActivityIndicator size="small" color="#6C2BD9" />}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {usernameAvailable === true && <Text style={{ fontSize: 10, color: '#22c55e' }}>{t('editProfile.usernameAvailable')}</Text>}
            {usernameAvailable === false && <Text style={{ fontSize: 10, color: '#ef4444' }}>{t('editProfile.usernameTaken')}</Text>}
            {!usernameAvailable && username.length >= USERNAME_MAX_LENGTH && <Text style={{ fontSize: 10, color: '#6C2BD9' }}>{t('editProfile.limitReached')}</Text>}
            {!usernameAvailable && username.length < USERNAME_MAX_LENGTH && <Text style={{ fontSize: 10, color: '#bbb' }}>{`Máximo ${USERNAME_MAX_LENGTH} caracteres`}</Text>}
            <Text style={{ fontSize: 10, color: username.length >= USERNAME_MAX_LENGTH - 1 ? '#6C2BD9' : '#bbb' }}>
              {username.length}/{USERNAME_MAX_LENGTH}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>{t('editProfile.fields.bio')}</Text>
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
            placeholder={t('editProfile.fields.bioPlaceholder')}
            placeholderTextColor="#bbb"
            multiline
            // A bio aceita quebra de linha, então o teclado precisa oferecer o
            // Enter em vez de um "OK" que fecha o campo.
            textAlignVertical="top"
            maxLength={BIO_HARD_INPUT_LIMIT}
            accessibilityLabel={t('editProfile.fields.bioLabel')}
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

          {/* Campo de Instagram: desativado por decisao de produto — ver
              INSTAGRAM_FEATURE_ENABLED em utils/instagram.js. */}
          {INSTAGRAM_FEATURE_ENABLED && (
            <>
            <View style={styles.divider} />

            <Text style={styles.label}>{t('editProfile.fields.instagram')}</Text>
            <View style={styles.instagramRow}>
              {/* O @ é desenhado FORA do campo, como prefixo fixo. Dentro do valor
                  ele seria salvo junto e teria de ser retirado depois; como rótulo
                  ele diz o formato esperado sem a pessoa precisar digitá-lo — e
                  quem digitar assim mesmo continua funcionando, porque a
                  normalização tira. */}
              <Text style={styles.instagramPrefix}>@</Text>
              <TextInput
                style={[styles.input, styles.instagramInput]}
                value={instagram}
                onChangeText={(text) => {
                  setInstagram(text);
                  setErrorMessage('');
                }}
                placeholder={t('editProfile.fields.instagramPlaceholder')}
                placeholderTextColor="#bbb"
                autoCapitalize="none"
                autoCorrect={false}
                // Sem `keyboardType="url"`: o teclado de URL esconde o underline,
                // que é caractere válido de username no Instagram.
                maxLength={90}
                accessibilityLabel={t('editProfile.fields.instagramLabel')}
              />
            </View>
            <Text
              style={{ fontSize: 10, color: instagramInvalido ? '#ef4444' : '#bbb', marginTop: 4 }}
            >
              {instagramInvalido
                ? 'Use apenas letras, números, ponto e underline.'
                : 'Opcional. Pode colar o link do seu perfil — o @ é removido automaticamente.'}
            </Text>
            </>
          )}
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Zona destrutiva. Fora do card branco e atrás de um divisor com
            rótulo: o olho precisa registrar que aqui não se edita nada, se
            encerra. */}
        <View style={styles.dangerDivider} />
        <Text style={styles.dangerLabel}>{t('editProfile.account.section')}</Text>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={confirmarExclusao}
          disabled={excluindo}
          accessibilityRole="button"
          accessibilityLabel={t('editProfile.account.deleteAccount')}
        >
          {excluindo
            ? <ActivityIndicator size="small" color="#ef4444" />
            : <Ionicons name="trash-outline" size={18} color="#ef4444" />}
          <View style={{ flex: 1 }}>
            <Text style={styles.dangerButtonText}>{t('editProfile.account.deleteAccount')}</Text>
            <Text style={styles.dangerButtonHint}>
              Reversível por {ACCOUNT_DELETION_GRACE_DAYS} dias
            </Text>
          </View>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  bioInput: { minHeight: 74, paddingTop: 8, lineHeight: 20 },
  // O @ é prefixo fixo ao lado do campo, não parte do valor digitado.
  instagramRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  instagramPrefix: { fontSize: 15, color: '#bbb', fontWeight: '600' },
  instagramInput: { flex: 1 },
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
  dangerDivider: {
    height: 1,
    backgroundColor: '#e2e2e2',
    marginTop: 28,
    marginBottom: 16,
  },
  dangerLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3d0d0',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dangerButtonText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  dangerButtonHint: { color: '#b0b0b0', fontSize: 11, marginTop: 2 },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
  },
});
