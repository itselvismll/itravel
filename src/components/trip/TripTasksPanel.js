// O bloco "Tarefas do grupo", dentro da aba Checklist.
//
// POR QUE AQUI E NÃO NUMA ABA PRÓPRIA (opção A do mockup): as duas listas
// respondem à mesma pergunta — "o que falta antes de viajar?". Separá-las em
// abas obrigaria a pessoa a procurar em dois lugares para saber isso, e a aba
// nova competiria por espaço numa barra que já tem cinco.
//
// A decisão (quem pode marcar, que nome aparece, em que ordem a lista sai) está
// toda em `utils/tripTasks`; aqui só a pintura e o estado da tela. Mesmo arranjo
// do `ActivityEditedTag`, e pelo mesmo motivo: é o que deixa a regra ser testada
// sem browser.
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MemberAvatar from './MemberAvatar';
import { trip, font, shadow } from '../../theme/tripCollab';
import { fullPersonName } from '../../utils/personName';
import {
  TASK_TITLE_MAX_LENGTH,
  canCreateTask,
  sortTasks,
  taskProgress,
  taskRow,
  validateTaskTitle,
} from '../../utils/tripTasks';

/**
 * @param {{
 *   tasks: Array<any>,
 *   members: Array<any>,
 *   abilities: { role?: string | null, status?: string | null },
 *   currentUserId: string | null,
 *   loading?: boolean,
 *   onCreate: (params: { title: string, assignedTo: string | null }) => Promise<boolean>,
 *   onToggle: (params: { taskId: string, done: boolean }) => Promise<boolean>,
 *   onDelete?: (taskId: string) => void,
 * }} props
 */
export default function TripTasksPanel({
  tasks,
  members,
  abilities,
  currentUserId,
  loading = false,
  onCreate,
  onToggle,
  onDelete,
}) {
  const podeCriar = canCreateTask(abilities);

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState(/** @type {string | null} */ (null));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Qual tarefa está indo ao servidor. Por ID e não um booleano de tela: com um
  // booleano, marcar uma tarefa travaria o checkbox de TODAS até a resposta.
  const [togglingId, setTogglingId] = useState(/** @type {string | null} */ (null));

  const rows = useMemo(
    () => sortTasks(tasks).map((task) => taskRow(task, members, abilities, currentUserId)),
    [tasks, members, abilities, currentUserId]
  );
  const progress = useMemo(() => taskProgress(tasks), [tasks]);

  // Só quem está DENTRO da viagem pode receber uma tarefa. Convite pendente
  // ainda não é participante, e atribuir a ele criaria uma tarefa que a pessoa
  // não vê até aceitar.
  const candidatos = useMemo(
    () => (members || []).filter((m) => m?.status === 'accepted'),
    [members]
  );

  const fecharForm = useCallback(() => {
    setFormOpen(false);
    setTitle('');
    setAssignedTo(null);
    setFormError('');
  }, []);

  const criar = useCallback(async () => {
    const check = validateTaskTitle(title);
    if (!check.valid) {
      setFormError(check.error || '');
      return;
    }

    setSaving(true);
    const ok = await onCreate({ title: check.value, assignedTo });
    setSaving(false);
    // O form fica aberto se falhar: o texto digitado continua ali para tentar de
    // novo, em vez de sumir junto com o erro.
    if (ok) fecharForm();
  }, [title, assignedTo, onCreate, fecharForm]);

  const alternar = useCallback(async (row) => {
    setTogglingId(row.id);
    await onToggle({ taskId: row.id, done: !row.done });
    setTogglingId(null);
  }, [onToggle]);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Tarefas do grupo</Text>
        {progress.total > 0 ? (
          <Text style={styles.progress}>{progress.done}/{progress.total}</Text>
        ) : null}
      </View>

      {loading && !rows.length ? (
        <ActivityIndicator color={trip.accentSoft} style={styles.loader} />
      ) : null}

      {!loading && !rows.length ? (
        <Text style={styles.empty}>
          {podeCriar
            ? 'Nenhuma tarefa ainda. Crie a primeira e escolha quem fica responsável.'
            : 'Nenhuma tarefa por enquanto. Quem organiza a viagem pode criar e atribuir tarefas aqui.'}
        </Text>
      ) : null}

      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          {/* `disabled` e não escondido: a tarefa PRECISA continuar visível para
              quem não pode marcá-la — saber o que o grupo combinou é metade da
              utilidade do bloco para quem só acompanha. */}
          <TouchableOpacity
            onPress={() => alternar(row)}
            disabled={!row.canToggle || togglingId === row.id}
            style={styles.checkbox}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.done, disabled: !row.canToggle }}
            accessibilityLabel={row.title}
          >
            {togglingId === row.id ? (
              <ActivityIndicator size="small" color={trip.accentSoft} />
            ) : (
              <Ionicons
                name={row.done ? 'checkbox' : 'square-outline'}
                size={22}
                color={row.done ? trip.d2 : row.canToggle ? trip.inkDim : trip.inkFaint}
              />
            )}
          </TouchableOpacity>

          {/* A opacidade reduzida é do CONTEÚDO da tarefa concluída, não da
              linha inteira: aplicada na linha, ela apagaria também o botão de
              excluir do organizador. */}
          <View style={[styles.body, row.done && styles.bodyDone]}>
            <Text style={[styles.taskTitle, row.done && styles.taskTitleDone]}>{row.title}</Text>

            {row.assignee ? (
              <View style={styles.assignee}>
                <MemberAvatar person={row.assignee.person} size={16} showOwnerSeal={false} sealBorderColor={trip.card} />
                <Text style={styles.assigneeName} numberOfLines={1}>{row.assignee.label}</Text>
              </View>
            ) : (
              <Text style={styles.unassigned}>Sem responsável</Text>
            )}

            {row.completedLabel ? (
              <Text style={styles.completed}>{row.completedLabel}</Text>
            ) : null}
          </View>

          {podeCriar && onDelete ? (
            <TouchableOpacity
              onPress={() => onDelete(row.id)}
              style={styles.delete}
              accessibilityRole="button"
              accessibilityLabel={`Excluir a tarefa ${row.title}`}
            >
              <Ionicons name="trash-outline" size={16} color={trip.inkFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {podeCriar && !formOpen ? (
        <TouchableOpacity
          onPress={() => setFormOpen(true)}
          style={styles.newButton}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={16} color={trip.accentSoft} />
          <Text style={styles.newButtonText}>Nova tarefa</Text>
        </TouchableOpacity>
      ) : null}

      {podeCriar && formOpen ? (
        <View style={styles.form}>
          <TextInput
            value={title}
            onChangeText={(texto) => { setTitle(texto); setFormError(''); }}
            placeholder="O que precisa ser feito?"
            placeholderTextColor={trip.inkFaint}
            style={styles.input}
            maxLength={TASK_TITLE_MAX_LENGTH}
            autoFocus
          />

          <Text style={styles.formLabel}>Responsável</Text>
          <View style={styles.people}>
            {/* "Ninguém" é uma escolha, e não a ausência de escolha: tarefa do
                grupo sem dono definido existe, e o banco aceita `assigned_to`
                nulo. */}
            <TouchableOpacity
              onPress={() => setAssignedTo(null)}
              style={[styles.person, assignedTo === null && styles.personOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: assignedTo === null }}
            >
              <Ionicons name="people-outline" size={14} color={assignedTo === null ? trip.ink : trip.inkDim} />
              <Text style={[styles.personName, assignedTo === null && styles.personNameOn]}>Ninguém</Text>
            </TouchableOpacity>

            {candidatos.map((member) => {
              const selecionado = assignedTo === member.id;
              const nome = member.id === currentUserId ? 'Você' : fullPersonName(member.profile);
              return (
                <TouchableOpacity
                  key={member.id}
                  onPress={() => setAssignedTo(member.id)}
                  style={[styles.person, selecionado && styles.personOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selecionado }}
                >
                  <MemberAvatar
                    person={{ id: member.id, role: member.role, ...(member.profile || {}) }}
                    size={18}
                    showOwnerSeal={false}
                    sealBorderColor={trip.card2}
                  />
                  <Text style={[styles.personName, selecionado && styles.personNameOn]} numberOfLines={1}>
                    {nome || 'Participante'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <View style={styles.formActions}>
            <TouchableOpacity onPress={fecharForm} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={criar}
              disabled={saving}
              style={[styles.confirm, saving && styles.confirmOff]}
              accessibilityRole="button"
            >
              {saving
                ? <ActivityIndicator size="small" color={trip.ink} />
                : <Ionicons name="checkmark" size={16} color={trip.ink} />}
              <Text style={styles.confirmText}>{saving ? 'Criando...' : 'Criar tarefa'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: trip.card,
    borderWidth: 1,
    borderColor: trip.line,
    gap: 10,
    ...shadow.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: trip.ink, fontFamily: font.title, fontSize: 14 },
  progress: { color: trip.inkDim, fontFamily: font.bodySemi, fontSize: 12 },
  loader: { marginVertical: 8 },
  empty: { color: trip.inkDim, fontFamily: font.body, fontSize: 12, lineHeight: 18 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4, paddingTop: 2 },
  bodyDone: { opacity: 0.55 },
  taskTitle: { color: trip.ink, fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18 },
  taskTitleDone: { textDecorationLine: 'line-through' },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assigneeName: { color: trip.inkDim, fontFamily: font.body, fontSize: 11, flexShrink: 1 },
  unassigned: { color: trip.inkFaint, fontFamily: font.body, fontSize: 11 },
  completed: { color: trip.d2, fontFamily: font.body, fontSize: 10 },
  delete: { padding: 6 },

  newButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 4, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: trip.line2, borderStyle: 'dashed',
  },
  newButtonText: { color: trip.accentSoft, fontFamily: font.bodySemi, fontSize: 12 },

  form: {
    marginTop: 4, padding: 12, borderRadius: 14,
    backgroundColor: trip.card2, borderWidth: 1, borderColor: trip.line, gap: 10,
  },
  input: {
    color: trip.ink, fontFamily: font.body, fontSize: 13,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 10, backgroundColor: trip.bg, borderWidth: 1, borderColor: trip.line,
  },
  formLabel: { color: trip.inkDim, fontFamily: font.bodySemi, fontSize: 11 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 99, borderWidth: 1, borderColor: trip.line,
  },
  personOn: { borderColor: trip.accentSoft, backgroundColor: 'rgba(167,139,250,0.14)' },
  personName: { color: trip.inkDim, fontFamily: font.body, fontSize: 11, maxWidth: 110 },
  personNameOn: { color: trip.ink },
  error: { color: trip.d1, fontFamily: font.body, fontSize: 11 },

  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancel: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 11 },
  cancelText: { color: trip.inkDim, fontFamily: font.bodySemi, fontSize: 12 },
  confirm: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 11, backgroundColor: trip.accent,
  },
  confirmOff: { opacity: 0.6 },
  confirmText: { color: trip.ink, fontFamily: font.bodySemi, fontSize: 12 },
});
