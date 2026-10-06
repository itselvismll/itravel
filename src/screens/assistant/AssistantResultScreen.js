import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adjustTravelPlan, regeneratePlanActivity } from '../../services/assistantService';
import { getTripPlan, saveTripPlan } from '../../services/tripPlanService';
import { confirm, notify } from '../../utils/dialogs';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatCurrency } from '../../utils/formatNumber';
import {
  periodIcon,
  periodLabelKey,
  budgetCategoryLabelKey,
  isShoppingBudgetCategory,
  checklistCategoryLabelKey,
} from '../../utils/assistantPlanCategories';
import { toBrazilianDate } from '../../utils/dateUtils';
import ShareToJourniModal from '../../components/ShareToJourniModal';
import TripCoverHeader from '../../components/trip/TripCoverHeader';
import TripTravelers from '../../components/trip/TripTravelers';
import { getTripMembers, acceptTripInvite } from '../../services/tripMemberService';
import { tripAbilities } from '../../utils/tripPermissions';
import { TRIP_SECTION } from '../../utils/notificationRouting';
import { supabase } from '../../services/supabase';
import { getTourismImage } from '../../services/tourismImageService';
import TripShortcutBar from '../../components/trip/TripShortcutBar';
import ActivityEditedTag from '../../components/trip/ActivityEditedTag';
import TripTasksPanel from '../../components/trip/TripTasksPanel';
import { activityEditTag } from '../../utils/activityAttribution';
import {
  createTripTask,
  deleteTripTask,
  getTripTasks,
  setTripTaskDone,
} from '../../services/tripTaskService';
import { trip, shadow } from '../../theme/tripCollab';
import PlanDayTabs from '../../components/map/PlanDayTabs';
import {
  activeDayFromScroll,
  backToTopThreshold,
  buildDayInfo,
  planDayNumber,
  scrollTargetForDay,
} from '../../components/map/planDayStrip';
import {
  dayFocusReducer,
  initialDayFocus,
  measureContentOffset,
} from '../../components/map/planDayFocus';
import { formatAssistantError } from '../../utils/assistantErrors';
import {
  countPlanStops,
  coverSearchTerm,
  destinationTitle,
  tripChips,
  tripDurationDays,
} from '../../utils/tripSummary';

const TABS = [
  { id: 'itinerary', labelKey: 'assistantResult.tabs.itinerary', icon: 'map-outline' },
  { id: 'budget', labelKey: 'assistantResult.tabs.budget', icon: 'wallet-outline' },
  { id: 'checklist', labelKey: 'assistantResult.tabs.checklist', icon: 'checkbox-outline' },
  { id: 'tips', labelKey: 'assistantResult.tabs.tips', icon: 'bulb-outline' },
  { id: 'chat', label: 'Ajustar', icon: 'chatbubble-ellipses-outline' },
];

const formatMoney = (value, currency = 'BRL', tag) => {
  if (Number(value) === 0) return '0';
  try {
    return `≈ ${formatCurrency(Number(value) || 0, currency, tag)}`;
  } catch {
    return `≈ ${currency} ${Number(value || 0).toFixed(2)}`;
  }
};

export default function AssistantResultScreen({ route, navigation }) {
  const { t, tag } = useLocale();
  // `request` e `plan` começam com o que a LISTA passou — e a lista passa tudo.
  // Quem chega pelo convite ou pela notificação traz só o id, e para esses dois
  // a viagem é BUSCADA (ver o efeito "viagem aberta só pelo id" mais abaixo).
  const [request, setRequest] = useState(route.params?.request || route.params?.request_data || {});
  const [plan, setPlan] = useState(route.params?.plan || route.params?.plan_data || {});
  const [planId, setPlanId] = useState(route.params?.planId || route.params?.id || null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState(/** @type {string | null} */ (null));
  const userContext = route.params?.userContext || {};
  // Quem chega por um aviso de tarefa já abre na aba certa, em vez de ver o
  // roteiro por um quadro e a tela pular sozinha depois.
  const [activeTab, setActiveTab] = useState(
    route.params?.section === TRIP_SECTION.groupTasks ? 'checklist' : 'itinerary'
  );
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState('');
  const [editing, setEditing] = useState(null);
  const [chatText, setChatText] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustments, setAdjustments] = useState([]);
  const [shareVisible, setShareVisible] = useState(false);

  // ── Capa e viajantes (Fase 1) ────────────────────────────────────────────
  // Duas buscas independentes e opcionais: a viagem abre inteira sem nenhuma
  // das duas. A capa é ilustração; a lista de viajantes, hoje, é sempre você.
  const [coverUrl, setCoverUrl] = useState(null);

  // ── Índice de dias (o mesmo seletor do mapa, com outro papel) ────────────
  //
  // No globo a faixa FILTRA: escolher o dia 3 esconde os outros. Aqui ela
  // INDEXA: escolher o dia 3 rola a lista até ele, e o dia destacado acompanha
  // a leitura. Mesmo componente, mesma aparência; o que muda é de onde vem o
  // dia em foco e o que o toque provoca.
  const scrollRef = useRef(null);
  const dayRefs = useRef({});
  const dayOffsetsRef = useRef({});

  // Onde a lista está rolada AGORA. Não é enfeite: é o que converte a medida
  // crua de um cartão para a régua em que `scrollTo` trabalha (ver measureDay).
  const scrollYRef = useRef(0);

  // O dia em foco sai de uma MÁQUINA DE ESTADOS, e não de um `useState` solto,
  // porque ele tem duas fontes que competem — o toque do usuário e a leitura da
  // rolagem — e decidir quem ganha é metade do conserto. A regra mora em
  // planDayFocus.js, testada sem tela.
  const [dayFocus, dispatchFocus] = useReducer(dayFocusReducer, initialDayFocus);
  const readingDay = dayFocus.day;

  const dayList = useMemo(
    () => (plan.days || [])
      .map(planDayNumber)
      .sort((a, b) => a - b),
    [plan.days]
  );

  const dayInfo = useMemo(
    () => buildDayInfo(
      // O mesmo número normalizado do cartão e de `dayList`: sem isso, um
      // roteiro sem `day` mandaria todas as paradas para o dia 1 e a legenda da
      // faixa mostraria o lugar errado em todos os dias.
      (plan.days || []).flatMap((day, index) => (day?.activities || []).map((activity) => ({
        day: planDayNumber(day, index),
        location: activity?.location,
      }))),
      plan,
      []
    ),
    [plan]
  );

  /**
   * Onde cada cartão de dia está DENTRO do conteúdo do ScrollView.
   *
   * POR QUE MEDIR ASSIM, E NÃO POR `onLayout`
   *
   * O `onLayout` de um cartão devolve a posição dele dentro do pai imediato — a
   * lista —, e a lista muda de lugar depois do primeiro layout: a lista de
   * viajantes chega quando a consulta responde e empurra tudo para baixo. No
   * web isso é pior ainda, porque ali o `onLayout` é implementado com
   * ResizeObserver: ele dispara quando a view muda de TAMANHO, não quando ela
   * muda de POSIÇÃO. A soma "onde a lista começa + onde o cartão está nela"
   * ficava congelada no valor do primeiro quadro.
   *
   * POR QUE `findNodeHandle` MATOU O TOQUE POR COMPLETO
   *
   * Este é o terceiro conserto desta mesma função, e o segundo errado. O de
   * antes media contra `findNodeHandle(scrollRef)` — um NÚMERO. Nesta versão do
   * React Native (0.83, arquitetura nova) isso não mede nada:
   *
   *     // ReactNativeElement.js
   *     if (!(relativeToNativeNode instanceof ReactNativeElement)) {
   *       console.error('ref.measureLayout must be called with a ref to a native component');
   *       return;   // <- não chama onSuccess NEM onFail
   *     }
   *
   * Sai sem chamar callback nenhum. A Promise aqui NUNCA resolvia, o `await`
   * em `scrollToDay` ficava pendurado para sempre e o toque na pílula não
   * produzia reação alguma — nem certa, nem errada. O mesmo pendurava o
   * `Promise.all` da remedida, então nem as posições de reserva existiam. Foi
   * exatamente o relato: "clicar num dia não rola pra ele, nenhuma reação".
   *
   * DUAS MUDANÇAS, E A SEGUNDA IMPORTA MAIS QUE A PRIMEIRA
   *
   * 1. Medir contra `getInnerViewRef()`, que é a view de CONTEÚDO do ScrollView
   *    e é um nó nativo de verdade — a forma que a arquitetura nova aceita. De
   *    quebra ela é a régua certa: a posição já vem em coordenada de conteúdo,
   *    que é o que `scrollTo` espera, sem somar nem descontar rolagem.
   *
   * 2. NUNCA MAIS ESPERAR PARA SEMPRE. Um callback nativo que não vem não pode
   *    travar a tela: passado o prazo, a medida desiste e devolve `null`, e
   *    quem chamou cai nas posições de reserva vindas do `onLayout`. É isso que
   *    transforma "o botão morreu" em "o botão funciona um pouco pior".
   */
  const measureDay = useCallback((day) => measureContentOffset({
    node: dayRefs.current[day],
    // A view de CONTEÚDO, e não o ScrollView: é um nó nativo de verdade (a
    // arquitetura nova recusa o número do `findNodeHandle`) e é a régua que o
    // `scrollTo` usa. A conta, o prazo e o motivo estão em planDayFocus.js.
    contentNode: scrollRef.current?.getInnerViewRef?.(),
  }), []);

  /**
   * As posições de reserva, vindas do `onLayout`.
   *
   * O `onLayout` de um cartão dá a posição dele dentro da LISTA; o `onLayout` da
   * lista dá onde a lista começa dentro do conteúdo. Somados, dão a mesma coisa
   * que o `measureLayout` daria. É menos preciso — no web o `onLayout` não
   * dispara para mudança de posição —, mas tem uma qualidade que a medida nativa
   * não tem: ele SEMPRE existe, sem depender de callback nenhum. É a rede que
   * impede que uma API quebrada volte a matar o toque por inteiro.
   */
  const listTopRef = useRef(0);
  const layoutOffsetsRef = useRef({});
  const offsetsFromLayout = useCallback(() => {
    const base = listTopRef.current || 0;
    return Object.fromEntries(
      Object.entries(layoutOffsetsRef.current)
        .filter(([, y]) => Number.isFinite(y))
        .map(([day, y]) => [day, base + Number(y)])
    );
  }, []);

  /** As melhores posições disponíveis: as medidas, se houver; senão as do layout. */
  const currentOffsets = useCallback(() => (
    Object.keys(dayOffsetsRef.current).length ? dayOffsetsRef.current : offsetsFromLayout()
  ), [offsetsFromLayout]);

  /**
   * Remede todos os dias. Roda quando o conteúdo muda de tamanho — que é
   * exatamente quando as posições antigas deixam de valer.
   *
   * A `geração` existe porque cada cartão pede uma remedida ao terminar o
   * layout: numa viagem de 21 dias são 21 pedidos quase simultâneos, e eles
   * terminam fora de ordem. Sem o selo, um lote velho sobrescrevia o resultado
   * de um lote mais novo e as posições voltavam a ficar erradas.
   */
  const measureGenerationRef = useRef(0);
  const refreshDayOffsets = useCallback(async () => {
    const geracao = (measureGenerationRef.current += 1);

    const measured = await Promise.all(
      Object.keys(dayRefs.current).map(async (day) => [day, await measureDay(day)])
    );
    if (geracao !== measureGenerationRef.current) return;

    const validas = measured.filter(([, y]) => Number.isFinite(y));
    // Um lote inteiro sem resposta não apaga o que já se sabia: manter as
    // posições anteriores é sempre melhor do que ficar sem nenhuma.
    if (validas.length) dayOffsetsRef.current = Object.fromEntries(validas);
  }, [measureDay]);

  /** @param {number} day */
  const scrollToDay = useCallback(async (day) => {
    // O destaque muda ANTES de qualquer medida, e sem depender dela.
    //
    // Era aqui que as setas morriam: a função saía cedo quando a posição não
    // estava medida, e saía ANTES de marcar o dia — então o toque na seta não
    // rolava nada e também não mexia na faixa. Nada acontecia, literalmente.
    //
    // E `choose` faz mais do que marcar: ele cala o scroll-spy pelo tempo da
    // animação. Sem isso, a rolagem que esta função dispara emite eventos de
    // scroll que reescrevem o dia em foco no caminho, e quem decide o destaque
    // deixa de ser o toque. No ÚLTIMO dia isso nunca acerta — o ScrollView não
    // rola além do fim do conteúdo, o cartão não alcança a linha de leitura e o
    // destaque voltava para o penúltimo, sempre.
    dispatchFocus({ type: 'choose', day, now: Date.now() });

    const measured = await measureDay(day);
    const offsets = Number.isFinite(measured)
      ? { [day]: measured }
      : currentOffsets();

    const target = scrollTargetForDay(offsets, day);
    if (target === null) return;

    scrollRef.current?.scrollTo?.({ y: target, animated: true });
  }, [measureDay, currentOffsets]);

  // ── Voltar ao topo ────────────────────────────────────────────────────────
  //
  // Um roteiro de 20+ dias é uma rolagem longa, e a pílula de dias fica lá em
  // cima, no fluxo da lista (não é sticky) — de onde o botão pode ficar no canto
  // sem disputar espaço com ela.
  //
  // `showBackToTop` só muda quando a rolagem CRUZA o limiar, nunca a cada
  // evento: `onScroll` dispara a cada quadro, e um setState por quadro
  // re-renderizaria a tela inteira de 21 dias enquanto a pessoa rola.
  const insets = useSafeAreaInsets();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopShownRef = useRef(false);
  const backToTopOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(backToTopOpacity, {
      toValue: showBackToTop ? 1 : 0,
      duration: 220,
      // O driver nativo não existe no react-native-web; lá ele só avisaria.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [showBackToTop, backToTopOpacity]);

  const handleScroll = useCallback((event) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;

    const offsets = currentOffsets();
    const day = activeDayFromScroll(offsets, scrollYRef.current);
    if (day !== null) dispatchFocus({ type: 'scrolled', day, now: Date.now() });

    const passou = scrollYRef.current > backToTopThreshold(offsets, dayList);
    if (passou !== backToTopShownRef.current) {
      backToTopShownRef.current = passou;
      setShowBackToTop(passou);
    }
  }, [currentOffsets, dayList]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }, []);

  // O dedo na lista tem prioridade sobre a trava: quem rola a tela está lendo
  // outro dia, e o destaque precisa acompanhar na hora em vez de esperar o
  // prazo da animação acabar.
  const handleScrollBegin = useCallback(() => {
    dispatchFocus({ type: 'grabbed', now: Date.now() });
  }, []);

  // A rolagem parou: o spy volta a mandar antes do prazo. É só um atalho — o
  // prazo sozinho já solta a trava, porque este evento não é confiável no
  // Android nem no react-native-web.
  const handleScrollSettled = useCallback(() => {
    dispatchFocus({ type: 'settled', now: Date.now() });
  }, []);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data?.user?.id || null);
    });
    return () => { cancelled = true; };
  }, []);

  // O QUE ESTA PESSOA PODE FAZER NESTA VIAGEM.
  //
  // Enquanto a lista de participantes não chegou, ou quando a viagem ainda não
  // existe no banco (roteiro recém-gerado, `local-`), não há papel a consultar —
  // e nesse caso quem está olhando é quem acabou de gerar o roteiro, que edita
  // tudo. Tratar "ainda não sei" como "não pode" faria a tela abrir travada por
  // um instante a cada carregamento, que é pior do que o contrário: a RLS recusa
  // a escrita de um viewer de qualquer jeito.
  const abilities = useMemo(() => {
    if (!planId || !currentUserId || !members.length) {
      return {
        role: null,
        status: null,
        canEdit: true,
        canEditChecklist: true,
        canEditBudget: true,
        canInvite: false,
        canManageMembers: false,
        canChangeRole: false,
      };
    }
    return tripAbilities(members, currentUserId);
  }, [members, currentUserId, planId]);

  // Viewer não edita. A tela ESCONDE os controles em vez de desabilitá-los:
  // botão apagado ainda convida a tocar e não explica nada, e a explicação de
  // por que ele está apagado teria de caber num tooltip que o celular não tem.
  // O aviso de "só visualiza" aparece uma vez, no topo, e diz a mesma coisa uma
  // vez só.
  const readOnly = !abilities.canEdit;

  const recarregarMembros = useCallback(() => {
    if (!planId) return;
    getTripMembers(planId).then((resultado) => setMembers(resultado.data));
  }, [planId]);

  // ── Tarefas do grupo ──────────────────────────────────────────────────────
  //
  // A lista vem do banco e volta do banco a cada escrita, em vez de ser mexida
  // aqui na mão: quem escreve `completed_by`, `completed_at` e `created_by` é o
  // trigger, e uma cópia otimista não teria esses valores — a linha apareceria
  // sem o "Concluído por X" que acabou de ser o motivo do toque.
  //
  // NENHUMA NOTIFICAÇÃO SAI DAQUI. Os dois avisos são triggers presos à
  // transição da linha (INSERT, e is_done false -> true), e não a estes botões.
  // É o que impede o caso que já aconteceu duas vezes no roteiro: avisar porque
  // alguém abriu uma tela ou tocou num botão, e não porque algo mudou.
  const [tasks, setTasks] = useState(/** @type {Array<any>} */ ([]));
  const [tasksLoading, setTasksLoading] = useState(false);

  const recarregarTarefas = useCallback(() => {
    if (!planId || String(planId).startsWith('local-')) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    getTripTasks(planId).then((resultado) => {
      setTasks(resultado.data);
      setTasksLoading(false);
    });
  }, [planId]);

  useEffect(() => { recarregarTarefas(); }, [recarregarTarefas]);

  const criarTarefa = useCallback(async ({ title, assignedTo }) => {
    const resultado = await createTripTask({ tripId: planId, title, assignedTo });
    if (!resultado.success) {
      notify(t('assistantResult.tasks.createFailedTitle'), resultado.error || t('common.actions.tryAgainSoon'));
      return false;
    }
    setTasks((atual) => [...atual, resultado.data]);
    return true;
  }, [planId]);

  const alternarTarefa = useCallback(async ({ taskId, done }) => {
    const resultado = await setTripTaskDone({ taskId, done });
    if (!resultado.success) {
      notify(t('assistantResult.tasks.updateFailedTitle'), resultado.error || t('common.actions.tryAgainSoon'));
      return false;
    }
    // A linha que volta do banco é a que vale: ela traz quem concluiu e quando.
    setTasks((atual) => atual.map((t) => (t.id === taskId ? resultado.data : t)));
    return true;
  }, []);

  // ── Chegar no bloco de tarefas vindo de uma notificação ───────────────────
  //
  // `route.params.section` diz a SEÇÃO, e é esta tela que decide que aba isso
  // é (ver TRIP_SECTION em utils/notificationRouting).
  //
  // Por que não basta trocar a aba: a aba Checklist começa depois da capa e da
  // barra de abas, e numa tela já rolada (a pessoa estava lendo o roteiro) o
  // bloco pode nascer fora do campo de visão. Então a rolagem é um PEDIDO que
  // fica pendente até o bloco dizer onde ficou — o `onLayout` só dispara depois
  // de a aba Checklist ter sido desenhada, e antes disso não existe posição
  // nenhuma para onde rolar.
  const tasksTopRef = useRef(/** @type {number | null} */ (null));
  const [scrollToTasks, setScrollToTasks] = useState(false);

  const irParaTarefas = useCallback(() => {
    setActiveTab('checklist');
    // Zera a medida antiga: a posição do bloco na aba de agora não é a mesma
    // que ele tinha da última vez, e rolar para uma medida velha erra feio.
    tasksTopRef.current = null;
    setScrollToTasks(true);
  }, []);

  const section = route.params?.section;
  useEffect(() => {
    if (section === TRIP_SECTION.groupTasks) irParaTarefas();
  }, [section, irParaTarefas]);

  /**
   * O bloco terminou o layout e disse onde ficou. Se havia um pedido de
   * rolagem, é agora.
   *
   * O `y` do `onLayout` é relativo ao contentContainer do ScrollView — que é a
   * mesma régua do `scrollTo`, porque o bloco é filho direto dele.
   */
  const aoMedirTarefas = useCallback((event) => {
    const y = event?.nativeEvent?.layout?.y;
    if (!Number.isFinite(y)) return;
    tasksTopRef.current = y;

    if (!scrollToTasks) return;
    setScrollToTasks(false);
    // A mesma folga do roteiro (scrollTargetForDay): encostado no topo, o bloco
    // fica colado na barra de abas e parece cortado.
    scrollRef.current?.scrollTo?.({ y: Math.max(0, y - 12), animated: true });
  }, [scrollToTasks]);

  const excluirTarefa = useCallback(async (taskId) => {
    const tarefa = tasks.find((t) => t.id === taskId);
    const ok = await confirm(
      t('assistantResult.tasks.deleteConfirmTitle'),
      // O título da tarefa é conteúdo do usuário: entra por interpolação.
      t('assistantResult.tasks.deleteConfirmMessage', {
        title: tarefa?.title || t('assistantResult.tasks.untitled'),
      })
    );
    if (!ok) return;

    const resultado = await deleteTripTask(taskId);
    if (!resultado.success) {
      notify(t('assistantResult.tasks.deleteFailedTitle'), resultado.error || t('common.actions.tryAgainSoon'));
      return;
    }
    setTasks((atual) => atual.filter((t) => t.id !== taskId));
  }, [tasks]);

  // ── Convite pendente ──────────────────────────────────────────────────────
  //
  // O BECO SEM SAÍDA QUE ISTO FECHA
  //
  // Quem é convidado pela busca (e não pelo link) entra como `pending`. A RLS
  // deixa essa pessoa VER a viagem de propósito — é o que permite decidir se
  // aceita olhando o roteiro, que é a informação de que a decisão depende. Mas
  // sem um lugar para aceitar, ela ficava vendo a viagem em somente-leitura para
  // sempre, sem nada na tela explicando por quê nem como sair disso.
  //
  // Quem entra pelo LINK não passa por aqui: `redeem_trip_invite` já cria a
  // linha como 'accepted', porque abrir o link É a aceitação.
  const [accepting, setAccepting] = useState(false);
  const pendingInvite = abilities.status === 'pending';

  const aceitarConvite = useCallback(async () => {
    setAccepting(true);
    const resultado = await acceptTripInvite(planId);
    setAccepting(false);

    if (!resultado.success) {
      notify(t('assistantResult.invite.acceptFailedTitle'), resultado.error || t('common.actions.tryAgainSoon'));
      return;
    }
    // Recarregar é o que faz os controles de edição aparecerem: `abilities` sai
    // da lista de participantes, e o papel só muda de verdade quando ela volta
    // do banco. Marcar o estado aqui na mão daria uma tela otimista que discorda
    // do servidor se a escrita tiver falhado por outro motivo.
    recarregarMembros();
  }, [planId, recarregarMembros]);

  // A aba "Ajustar" REESCREVE o roteiro inteiro com a IA — é a ferramenta de
  // edição mais poderosa da tela, não um chat. Ela sai da barra para quem só
  // visualiza, em vez de ficar lá e recusar o envio: uma aba que abre e não
  // deixa fazer nada é pior do que uma aba que não existe.
  // A CHAVE É RESOLVIDA AQUI, e não dentro da TripShortcutBar: aquela barra é
  // genérica e recebe `label` pronto, e trocá-la para receber `labelKey`
  // obrigaria todo chamador futuro a usar tradução — o que é certo para abas e
  // errado para uma barra que também pode mostrar nome de dia ou de parada, que
  // são conteúdo. O `t` entra nas dependências porque muda ao trocar o idioma.
  const visibleTabs = useMemo(
    () => (readOnly ? TABS.filter((tab) => tab.id !== 'chat') : TABS)
      .map((tab) => ({ ...tab, label: t(tab.labelKey) })),
    [readOnly, t]
  );

  // Quem estava na aba Ajustar quando o papel mudou (o organizador rebaixou
  // alguém enquanto a tela estava aberta) não pode ficar preso numa aba que
  // sumiu da barra.
  useEffect(() => {
    if (readOnly && activeTab === 'chat') setActiveTab('itinerary');
  }, [readOnly, activeTab]);

  // O título da capa com TODOS os destinos. `plan.destinationCountry` é um país
  // só: uma viagem Itália + Croácia + Eslováquia se anunciava como "Itália".
  const destination = useMemo(
    () => destinationTitle(
      request.destinations,
      request.destination || plan.destinationCountry || plan.title || ''
    ),
    [request.destinations, request.destination, plan.destinationCountry, plan.title]
  );

  // O termo da BUSCA não é o título: "Itália, Croácia e Eslováquia" não casa com
  // nada no Wikimedia e a capa ficava sem foto. A busca vai pelo primeiro
  // destino; o título continua mostrando todos.
  const coverTerm = useMemo(
    () => coverSearchTerm(
      request.destinations,
      request.destination || plan.destinationCountry || plan.title || ''
    ),
    [request.destinations, request.destination, plan.destinationCountry, plan.title]
  );

  useEffect(() => {
    let cancelled = false;
    if (!coverTerm) return undefined;

    // O serviço já tem cache próprio (memória + localStorage), então reabrir a
    // viagem não repete a ida ao Wikimedia.
    getTourismImage(null, coverTerm).then((image) => {
      if (!cancelled) setCoverUrl(image?.url || null);
    });

    return () => { cancelled = true; };
  }, [coverTerm]);

  // ── Viagem aberta só pelo id ──────────────────────────────────────────────
  //
  // O convite (`TripInviteScreen` faz `replace('AssistantResult', { planId })`)
  // e a notificação abrem esta tela sem roteiro nenhum nos params. Antes disto,
  // a tela mostrava o que tinha: nada — sem capa, sem nome, "0 dias" —, o que
  // parecia falta de permissão e não era. Quem entrou pelo convite é membro
  // `accepted`, e a RLS já lhe dava leitura; ninguém tinha buscado os dados.
  //
  // Roda só quando falta roteiro: vindo da lista, `plan.days` já está aqui e
  // uma busca a mais só faria a viagem piscar.
  const temRoteiro = Boolean(plan?.days?.length);

  useEffect(() => {
    let cancelled = false;
    if (!planId || temRoteiro) return undefined;

    setTripLoading(true);
    setTripError(null);
    getTripPlan(planId).then((resultado) => {
      if (cancelled) return;
      setTripLoading(false);

      if (!resultado.success || !resultado.data) {
        setTripError(resultado.error || 'Não foi possível abrir esta viagem.');
        return;
      }

      setPlan(resultado.data.plan_data || {});
      setRequest(resultado.data.request_data || {});
    });

    return () => { cancelled = true; };
  }, [planId, temRoteiro]);

  useEffect(() => {
    let cancelled = false;
    if (!planId) {
      setMembers([]);
      return undefined;
    }

    setMembersLoading(true);
    getTripMembers(planId).then((result) => {
      if (cancelled) return;
      setMembers(result.data);
      setMembersLoading(false);
    });

    return () => { cancelled = true; };
  }, [planId]);

  // Os chips da capa. `travelers` é o número de PARTICIPANTES quando a viagem já
  // existe no banco — hoje sempre 1, e é esse número que vai crescer sozinho
  // quando o convite existir. Antes de salvar, vale o que foi pedido no
  // planejador, que é a única informação disponível.
  const coverChips = useMemo(() => tripChips({
    startDate: request.startDate,
    durationDays: tripDurationDays({
      startDate: request.startDate,
      endDate: request.endDate,
      planDays: (plan.days || []).length,
    }),
    travelers: members.length || Number(request.travelers) || null,
    stops: countPlanStops(plan),
  }), [request.startDate, request.endDate, request.travelers, plan, members.length]);

  const checklistProgress = useMemo(() => {
    const items = plan.checklist || [];
    const done = items.filter(item => item.done).length;
    return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [plan.checklist]);

  const budgetExplanation = useMemo(() => {
    const items = plan.budget?.items || [];
    const shoppingItem = items.find(item => isShoppingBudgetCategory(item.category));
    const shoppingIncluded = typeof plan.budget?.shoppingIncluded === 'boolean'
      ? plan.budget.shoppingIncluded
      : Number(shoppingItem?.amount) > 0;
    const categories = items
      .filter(item => Number(item.amount) > 0)
      .map(item => t(budgetCategoryLabelKey(item.category)))
      .join(', ');

    return {
      shoppingIncluded,
      scope: plan.budget?.scopeNote
        || (categories
          ? t('assistantResult.budget.scopeFromCategories', { categories })
          : t('assistantResult.budget.scopeFallback')),
    };
  }, [plan.budget]);

  const handleShare = async () => {
    const daySummary = (plan.days || []).map(day => (
      `Dia ${day.day} — ${day.theme}\n${(day.activities || []).map(item => `• ${t(periodLabelKey(item.period))}: ${item.title}`).join('\n')}`
    )).join('\n\n');
    await Share.share({
      title: plan.title || 'Meu roteiro Journi',
      message: `${plan.title}\n${plan.summary}\n\n${daySummary}\n\nCriado no Journi ✈️`,
    });
  };

  /**
   * @param {any} [planToSave] o roteiro a gravar. Vem explícito do "Aplicar" da
   *   parada, porque ali o `plan` do estado ainda é o de antes da edição.
   * @param {{ quiet?: boolean }} [options] `quiet`: sem o alerta de sucesso — no
   *   "Aplicar", a parada atualizada (e a tag) já é a resposta. Erro e conflito
   *   continuam sendo avisados.
   * @returns {Promise<boolean>} se gravou
   */
  const handleSave = async (planToSave = plan, { quiet = false } = {}) => {
    setSaving(true);
    const result = await saveTripPlan({ planId, request, plan: planToSave });
    setSaving(false);
    if (!result.success) {
      notify(t('assistantResult.save.failedTitle'), result.error || t('common.actions.tryAgain'));
      return false;
    }
    setPlanId(result.data.id);
    if (!quiet || result.warning) {
      notify(t('assistantResult.save.doneTitle'), result.warning || t('assistantResult.save.doneMessage'));
    }

    // RELER DEPOIS DE SALVAR. A cópia que está na tela tem os `updatedAt` de
    // ANTES do salvamento, e parada nova ainda não tem `id`. Sem reler, o
    // segundo salvamento da mesma parada esbarrava na guarda de conflito contra
    // a PRÓPRIA edição anterior ("alterada por outro participante"), e parada
    // nova era apagada e reinserida a cada save. De quebra, é o que faz a tag
    // "editado por" aparecer logo depois de salvar.
    if (!String(result.data.id).startsWith('local-')) {
      const atualizada = await getTripPlan(result.data.id);
      if (atualizada.success && atualizada.data?.plan_data?.days) {
        setPlan(atualizada.data.plan_data);
      }
    }
    return true;
  };

  const toggleChecklist = (index) => {
    setPlan(current => ({
      ...current,
      checklist: (current.checklist || []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, done: !item.done } : item
      )),
    }));
  };

  const openMap = async (activity) => {
    if (activity.mapsUrl) {
      await Linking.openURL(activity.mapsUrl);
      return;
    }
    const exactQuery = [activity.title, activity.location].filter(Boolean).join(', ');
    if (activity.placeId) {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactQuery)}&query_place_id=${encodeURIComponent(activity.placeId)}`
      );
      return;
    }
    if (activity.latitude && activity.longitude) {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activity.latitude},${activity.longitude}`)}`
      );
      return;
    }
    const query = exactQuery || activity.mapQuery || `${activity.location}, ${request.destination}`;
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };

  const openOfficialUrl = async activity => {
    if (/^https?:\/\//i.test(activity?.officialUrl || '')) {
      await Linking.openURL(activity.officialUrl);
    }
  };

  const regenerateActivity = async (dayIndex, activityIndex) => {
    const key = `${dayIndex}-${activityIndex}`;
    setRegenerating(key);
    const result = await regeneratePlanActivity({
      planRequest: request,
      userContext,
      plan,
      block: { dayIndex, activityIndex },
    });
    setRegenerating('');
    if (!result.success) {
      notify(t('assistantResult.adjust.swapFailedTitle'), formatAssistantError(result));
      return;
    }
    setPlan(result.plan);
  };

  const startEditing = (dayIndex, activityIndex, activity) => {
    setEditing({ dayIndex, activityIndex, draft: { ...activity } });
  };

  // "APLICAR" GRAVA. Antes ele só mudava a tela, e gravar dependia de descer até
  // o fim do roteiro e tocar em "Atualizar roteiro" — num roteiro de 21 dias,
  // ninguém fazia isso: a edição sumia ao sair da tela, e sem gravação não havia
  // tag "editado por" nem aviso para os outros. Foi o relato de 23/09.
  //
  // Sem checar aqui se algo mudou: quem decide isso é o banco
  // (trip_activity_content_changed), e "Aplicar" sem mudança não vira edição,
  // nem tag, nem aviso. Duas regras de "mudou?" discordariam um dia.
  //
  // Viagem ainda não salva (recém-gerada, ou `local-`) continua como antes: a
  // edição fica na tela até o "Salvar roteiro", que é quem cria a viagem.
  const saveActivityEdit = async () => {
    if (!editing) return;
    const nextPlan = {
      ...plan,
      days: plan.days.map((day, dayIndex) => (
        dayIndex !== editing.dayIndex ? day : {
          ...day,
          activities: day.activities.map((activity, activityIndex) => (
            activityIndex === editing.activityIndex ? editing.draft : activity
          )),
        }
      )),
    };

    const persiste = Boolean(planId) && !String(planId).startsWith('local-');
    if (!persiste) {
      setPlan(nextPlan);
      setEditing(null);
      return;
    }

    // O editor fica aberto até gravar: se falhar, o texto digitado continua ali
    // para tentar de novo, em vez de sumir junto com o erro.
    const gravou = await handleSave(nextPlan, { quiet: true });
    if (gravou) setEditing(null);
  };

  const handleAdjustPlan = async (suggestion) => {
    const message = String(suggestion || chatText).trim();
    if (!message || adjusting) return;

    setAdjusting(true);
    const result = await adjustTravelPlan({
      planRequest: request,
      userContext,
      plan,
      message,
    });
    setAdjusting(false);
    if (!result.success) {
      // Com o código, a falha deixa de ser um beco sem saída: ele localiza a
      // requisição no log da Edge Function, onde estão `providerStatus` e
      // `providerReason` — quem de fato recusou, e por quê.
      notify(
        t('assistantResult.adjust.failedTitle'),
        formatAssistantError(result, t('common.actions.tryAgainSoon'))
      );
      return;
    }

    setPlan(result.plan);
    setChatText('');
    setAdjustments(current => [
      ...current,
      { role: 'user', text: message },
      { role: 'assistant', text: 'Pronto! Ajustei o roteiro mantendo os demais detalhes da viagem.' },
    ].slice(-8));
  };

  // A viagem que ainda está vindo, e a que não veio, precisam DIZER isso. Uma
  // tela montada com o roteiro vazio é indistinguível de "esta viagem não tem
  // nada" — foi assim que a viagem compartilhada pareceu vazia para quem entrou
  // pelo convite.
  if (planId && !temRoteiro && (tripLoading || tripError)) {
    return (
      <View style={[styles.container, styles.tripStatus]}>
        {tripLoading ? (
          <>
            <ActivityIndicator size="large" color="#6C2BD9" />
            <Text style={styles.tripStatusText}>{t('assistantResult.opening')}</Text>
          </>
        ) : (
          <>
            <Ionicons name="alert-circle-outline" size={44} color="#9AA0B4" />
            <Text style={styles.tripStatusText}>{tripError}</Text>
            <TouchableOpacity style={styles.tripStatusButton} onPress={() => navigation.goBack()}>
              <Text style={styles.tripStatusButtonText}>{t('assistantResult.backToTripStatus')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* A capa É o cabeçalho: ela carrega a navegação (voltar e as três ações)
          nos botões flutuantes, e a barra de atalhos logo abaixo. O cabeçalho
          compacto que existia aqui — voltar, título e compartilhar — dizia as
          mesmas coisas numa faixa a mais. */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollSettled}
        onMomentumScrollEnd={handleScrollSettled}
        // A lista de viajantes chega depois e empurra tudo para baixo: é aqui
        // que as posições antigas deixam de valer.
        onContentSizeChange={refreshDayOffsets}
        // Um evento por quadro, e não os 16 por segundo de antes: este evento
        // deixou de ser só o destaque de leitura — é dele que sai a rolagem
        // atual usada para converter a medida dos cartões (ver measureDay). Com
        // 64ms, um toque logo depois de uma rolagem media contra uma posição de
        // até quatro quadros atrás.
        scrollEventThrottle={16}
      >
        <TripCoverHeader
          destination={destination}
          photoUrl={coverUrl}
          chips={coverChips}
          onBack={() => navigation.goBack()}
          // Esta tela vive no stack raiz; a aba do globo vive dentro de "Main".
          // `navigate('Map')` não encontrava rota nenhuma daqui e o toque não
          // fazia nada — é a mesma forma que o botão de roteiros salvos já usa,
          // algumas linhas abaixo.
          onOpenMap={() => navigation.navigate('Main', { screen: 'Map' })}
          // "Editar" é a aba Ajustar, que é onde se pede mudança no roteiro.
          // Sem `onEdit`, o TripCoverHeader não desenha o botão — é assim que
          // ele some para quem só visualiza.
          onEdit={readOnly ? undefined : () => setActiveTab('chat')}
          // Hoje a única ação extra da tela é compartilhar; quando houver outras,
          // os três pontinhos viram menu.
          onMore={() => setShareVisible(true)}
        />

        <TripShortcutBar
          items={visibleTabs}
          activeId={activeTab}
          onSelect={setActiveTab}
          style={styles.shortcutBar}
        />

        {/* Fora de qualquer aba: é o estado da VIAGEM inteira, e a ação que a
            pessoa precisa tomar não deixa de existir porque ela foi ver o
            orçamento. Some sozinho assim que a lista volta do banco com o
            status 'accepted'. */}
        {pendingInvite && (
          <View style={styles.inviteBanner}>
            <View style={styles.inviteBannerIcon}>
              <Ionicons name="airplane" size={18} color="#A78BFA" />
            </View>
            <View style={styles.inviteBannerText}>
              <Text style={styles.inviteBannerTitle}>{t('assistantResult.invited')}</Text>
              <Text style={styles.inviteBannerHint}>
                Aceite para editar o roteiro junto com o resto do grupo.
              </Text>
            </View>
            <TouchableOpacity
              onPress={aceitarConvite}
              disabled={accepting}
              style={[styles.acceptButton, accepting && styles.acceptButtonBusy]}
              accessibilityRole="button"
              accessibilityLabel={t('assistantResult.acceptInviteLabel')}
            >
              {accepting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.acceptButtonText}>{t('common.actions.accept')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'itinerary' && (
          <TripTravelers
            members={members}
            loading={membersLoading}
            tripId={planId}
            currentUserId={currentUserId}
            abilities={abilities}
            onInvite={() => navigation.navigate('TripInvite', { tripId: planId, tripTitle: destination })}
            onChanged={recarregarMembros}
          />
        )}

        {/* Dito uma vez, no topo, e não repetido em cada controle ausente.
            Fica de fora quando há convite pendente: ali o certo a fazer é
            aceitar, não "pedir a um organizador" — dois avisos, um deles
            apontando para o caminho errado, é pior do que um. */}
        {readOnly && !pendingInvite && activeTab === 'itinerary' ? (
          <View style={styles.readOnlyNotice}>
            <Ionicons name="eye-outline" size={16} color="#8B93AD" />
            <Text style={styles.readOnlyText}>
              Você está vendo esta viagem como convidado. Peça a um organizador para
              liberar a edição.
            </Text>
          </View>
        ) : null}

        {/* O resumo é da aba ROTEIRO: ele fala de dias, custo total e ritmo. Em
            Checklist ou Dicas ele era um cabeçalho fixo repetindo o que a aba
            não está mostrando. */}
        {activeTab === 'itinerary' ? (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.aiBadge}><Ionicons name="sparkles" size={13} color="#C4B5FD" /><Text style={styles.aiBadgeText}>{t('assistantResult.personalizedBadge')}</Text></View>
            <Text style={styles.countryText}>{plan.destinationCountry}</Text>
          </View>
          <Text style={styles.summaryText}>{plan.summary}</Text>
          <View style={styles.quickFacts}>
            <Fact icon="time-outline" text={t('common.plural.day', { count: (plan.days || []).length })} />
            <Fact icon="cash-outline" text={formatMoney(plan.budget?.total, plan.budget?.currency || request.currency, tag)} />
            <Fact icon="walk-outline" text={t(request.pace === 'calm' ? 'tripPlanner.paces.calm' : request.pace === 'intense' ? 'tripPlanner.paces.intense' : 'tripPlanner.paces.balanced')} />
          </View>
          <View style={styles.budgetScopeBox}>
            <View style={styles.budgetScopeHeader}>
              <Ionicons name="receipt-outline" size={16} color="#C4B5FD" />
              <Text style={styles.budgetScopeTitle}>{t('assistantResult.budget.whatIsIncluded')}</Text>
            </View>
            <Text style={styles.budgetScopeText}>{budgetExplanation.scope}</Text>
            <Text style={styles.shoppingStatus}>
              {budgetExplanation.shoppingIncluded
                ? '✓ Compras pessoais possuem uma verba própria na estimativa.'
                : 'Compras pessoais não estão incluídas nesta estimativa.'}
            </Text>
            <View style={styles.summaryBudgetList}>
              {(plan.budget?.items || []).map(item => (
                <View key={item.category} style={styles.summaryBudgetRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryBudgetCategory}>{t(budgetCategoryLabelKey(item.category))}</Text>
                    {!!item.note && <Text style={styles.summaryBudgetNote}>{item.note}</Text>}
                  </View>
                  <Text style={styles.summaryBudgetAmount}>
                    {formatMoney(item.amount, plan.budget?.currency || request.currency, tag)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {!!plan.weatherNote && <View style={styles.weatherBox}><Ionicons name="partly-sunny-outline" size={18} color="#35D3C8" /><Text style={styles.weatherText}>{plan.weatherNote}</Text></View>}
        </View>
        ) : null}

        {activeTab === 'itinerary' && dayList.length > 1 ? (
          <PlanDayTabs
            days={dayList}
            selectedDay={readingDay}
            // Aqui a faixa é ÍNDICE, não filtro: o dia destacado é o que está
            // sendo lido, e "desmarcar" não significa nada — esta tela descarta
            // `null`. Sem isto, tocar na pílula em destaque (que é justamente a
            // do dia a que você acabou de rolar) mandava `null` e o toque não
            // fazia nada.
            deselectable={false}
            onSelect={(day) => (day === null ? null : scrollToDay(day))}
            dayInfo={dayInfo}
            style={styles.dayIndex}
          />
        ) : null}

        {activeTab === 'itinerary' && (
          <View
            style={styles.listGap}
            // Onde a LISTA começa dentro do conteúdo. É a metade de baixo das
            // posições de reserva; a outra metade é o `onLayout` de cada cartão.
            onLayout={(event) => { listTopRef.current = event.nativeEvent.layout.y; }}
          >
            {(plan.days || []).map((day, dayIndex) => {
              // O MESMO número que `dayList` calcula, e não `day.day` cru.
              //
              // Roteiro gerado pela IA nem sempre traz `day` em todo dia, e
              // `dayList` já cobria isso caindo para a posição na lista. O
              // cartão, porém, guardava a referência sob `day.day` — que nessas
              // horas é `undefined`. A pílula pedia a posição do dia 3, não
              // achava referência nenhuma, caía nas posições guardadas e rolava
              // para outro lugar. Um número só, calculado de um jeito só.
              const dayNumber = planDayNumber(day, dayIndex);

              return (
              <View
                key={`${dayNumber}-${day.date}`}
                ref={(node) => {
                  // Referência morta é pior do que referência ausente: ela entra
                  // na remedida, falha, e some do mapa de posições sem avisar.
                  if (node) dayRefs.current[dayNumber] = node;
                  else delete dayRefs.current[dayNumber];
                }}
                style={styles.dayCard}
                // Duas funções num evento só: avisa que vale remedir (um cartão
                // que muda de altura mexe na posição de todos os seguintes) e
                // GUARDA a posição do cartão dentro da lista, que é a posição de
                // reserva usada quando a medida nativa não responde.
                onLayout={(event) => {
                  layoutOffsetsRef.current[dayNumber] = event.nativeEvent.layout.y;
                  refreshDayOffsets();
                }}
              >
                <View style={styles.dayHeader}>
                  <View style={styles.dayNumber}><Text style={styles.dayNumberText}>{dayNumber}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle}>{day.theme}</Text>
                    <Text style={styles.dayDate}>{day.date ? toBrazilianDate(day.date) : `Dia ${dayNumber}`}</Text>
                  </View>
                </View>
                {(day.activities || []).map((activity, activityIndex) => {
                  const key = `${dayIndex}-${activityIndex}`;
                  const isEditing = editing?.dayIndex === dayIndex && editing?.activityIndex === activityIndex;
                  return (
                    <View key={key} style={styles.activity}>
                      <View style={styles.timelineIcon}><Ionicons name={periodIcon(activity.period)} size={16} color="#A78BFA" /></View>
                      <View style={{ flex: 1 }}>
                        {isEditing ? (
                          <View style={styles.editBox}>
                            <TextInput value={editing.draft.title} onChangeText={title => setEditing(current => ({ ...current, draft: { ...current.draft, title } }))} style={styles.editInput} placeholderTextColor="#6F7798" />
                            <TextInput value={editing.draft.description} onChangeText={description => setEditing(current => ({ ...current, draft: { ...current.draft, description } }))} style={[styles.editInput, styles.editMultiline]} multiline placeholderTextColor="#6F7798" />
                            <View style={styles.actionRow}>
                              <SmallButton icon="close" label={t('common.actions.cancel')} onPress={() => setEditing(null)} />
                              <SmallButton icon="checkmark" label={saving ? t('assistantResult.saving') : t('assistantResult.applyEdit')} primary loading={saving} onPress={saveActivityEdit} />
                            </View>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.period}>{t(periodLabelKey(activity.period))} · {activity.duration}</Text>
                            <Text style={styles.activityTitle}>{activity.title}</Text>
                            <Text style={styles.activityDescription}>{activity.description}</Text>
                            {/* Parada editada depois de criada, em viagem
                                compartilhada — a regra está em
                                utils/activityAttribution. */}
                            <ActivityEditedTag tag={activityEditTag(activity, members, currentUserId)} />
                            <View style={styles.metaRow}>
                              <View style={styles.locationRow}>
                                <Ionicons name="location-outline" size={12} color="#7A7E8C" />
                                <Text style={styles.location} numberOfLines={1}>{activity.location}</Text>
                              </View>
                              <Text style={styles.cost}>{formatMoney(activity.estimatedCost, plan.budget?.currency || request.currency, tag)}</Text>
                            </View>
                            {(activity.rating || activity.openingHours?.length || activity.verificationSource) && (
                              <View style={styles.verifiedRow}>
                                {!!activity.rating && (
                                  <View style={styles.verifiedItem}>
                                    <Ionicons name="star" size={11} color="#FF9A00" />
                                    <Text style={styles.verifiedText}>{activity.rating}{activity.reviewCount ? ` (${activity.reviewCount})` : ''}</Text>
                                  </View>
                                )}
                                {!!activity.openingHours?.length && (
                                  <View style={styles.verifiedItem}>
                                    <Ionicons name="time-outline" size={11} color="#7A7E8C" />
                                    <Text style={styles.verifiedText} numberOfLines={1}>{activity.openingHours[0]}</Text>
                                  </View>
                                )}
                                {!!activity.verificationSource && (
                                  <Text style={styles.verifiedSource}>{activity.verificationSource}</Text>
                                )}
                              </View>
                            )}
                            <View style={styles.actionRow}>
                              <SmallButton icon="map-outline" label={t('assistantResult.openMap')} onPress={() => openMap(activity)} />
                              {!!activity.officialUrl && (
                                <SmallButton icon="ticket-outline" label={t('assistantResult.openOfficialSite')} onPress={() => openOfficialUrl(activity)} />
                              )}
                              {/* Editar e trocar com IA escrevem no roteiro: só
                                  para quem pode editar. "Mapa" e "Site oficial"
                                  continuam para todos — são leitura. */}
                              {!readOnly && (
                                <>
                                  <SmallButton icon="pencil-outline" label={t('assistantResult.editActivity')} onPress={() => startEditing(dayIndex, activityIndex, activity)} />
                                  <SmallButton
                                    icon="refresh-outline"
                                    label={regenerating === key ? t('assistantResult.swapping') : t('assistantResult.swapWithAI')}
                                    loading={regenerating === key}
                                    onPress={() => regenerateActivity(dayIndex, activityIndex)}
                                  />
                                </>
                              )}
                            </View>
                            <View style={styles.purchaseNoteBox}>
                              <Ionicons name={activity.officialUrl ? 'ticket-outline' : 'information-circle-outline'} size={14} color="#9DE8E1" />
                              <Text style={styles.purchaseNoteText}>
                                {activity.purchaseNote
                                  || (activity.officialUrl
                                    ? 'Confira valores e disponibilidade no site oficial.'
                                    : 'Consulte ingressos e canais oficiais na ficha deste local no Maps.')}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
              );
            })}
          </View>
        )}

        {activeTab === 'budget' && (
          <View style={styles.panel}>
            <Text style={styles.panelEyebrow}>{t('assistantResult.budget.wholeTripEstimate')}</Text>
            <Text style={styles.totalBudget}>{formatMoney(plan.budget?.total, plan.budget?.currency || request.currency, tag)}</Text>
            {!!request.convertedBudget && request.displayCurrency !== (plan.budget?.currency || request.currency) && (
              <View style={styles.convertedBudgetBox}>
                <Text style={styles.convertedBudgetLabel}>{t('assistantResult.budget.informedConverted')}</Text>
                <Text style={styles.convertedBudgetValue}>{formatMoney(request.convertedBudget, request.displayCurrency, tag)}</Text>
                <Text style={styles.convertedBudgetDate}>Cotação diária de {request.exchangeDate || 'hoje'}</Text>
              </View>
            )}
            <Text style={styles.budgetStatus}>{plan.budgetStatus}</Text>
            <Text style={styles.budgetScopeDetail}>{budgetExplanation.scope}</Text>
            <Text style={styles.shoppingStatus}>
              {budgetExplanation.shoppingIncluded ? 'Compras: incluídas no total.' : 'Compras: não incluídas no total.'}
            </Text>
            <View style={styles.divider} />
            {(plan.budget?.items || []).map(item => (
              <View key={item.category} style={styles.budgetRow}>
                <View style={{ flex: 1 }}><Text style={styles.budgetCategory}>{t(budgetCategoryLabelKey(item.category))}</Text><Text style={styles.budgetNote}>{item.note}</Text></View>
                <Text style={styles.budgetAmount}>{formatMoney(item.amount, plan.budget.currency, tag)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AS TAREFAS DO GRUPO VÊM PRIMEIRO. As duas listas respondem "o que
            falta antes de viajar?", e a de cima é a que tem PRAZO e DONO: ela
            pede uma ação de alguém em particular, enquanto a checklist da
            viagem é a lembrança de sempre, igual para todo mundo. Quem abre
            esta aba por causa de um aviso de tarefa também cai direto nela.

            Painel próprio, e não dentro do de baixo, porque o bloco tem card
            próprio — e some em viagem que ainda não existe no banco, onde não
            há tarefa possível. */}
        {activeTab === 'checklist' && planId && !String(planId).startsWith('local-') && (
          <View onLayout={aoMedirTarefas}>
            <TripTasksPanel
              tasks={tasks}
              members={members}
              abilities={abilities}
              currentUserId={currentUserId}
              loading={tasksLoading}
              onCreate={criarTarefa}
              onToggle={alternarTarefa}
              onDelete={excluirTarefa}
            />
          </View>
        )}

        {activeTab === 'checklist' && (
          <View style={styles.panel}>
            <View style={styles.progressHeader}><Text style={styles.panelTitle}>{t('assistantResult.preparation')}</Text><Text style={styles.progressText}>{checklistProgress.done}/{checklistProgress.total}</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${checklistProgress.percent}%` }]} /></View>
            {(plan.checklist || []).map((item, index) => (
              // Checklist é estado compartilhado da viagem: marcar um item
              // escreve para todo mundo. `disabled` e não escondido, porque a
              // lista PRECISA continuar visível — ela é metade da utilidade da
              // aba para quem só acompanha.
              <TouchableOpacity
                key={`${item.category}-${item.item}`}
                onPress={() => toggleChecklist(index)}
                disabled={!abilities.canEditChecklist}
                style={styles.checkRow}
              >
                <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={22} color={item.done ? '#00D1C1' : '#6F7798'} />
                <View style={{ flex: 1 }}><Text style={styles.checkCategory}>{t(checklistCategoryLabelKey(item.category))}</Text><Text style={[styles.checkItem, item.done && styles.checkDone]}>{item.item}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'tips' && (
          <View style={styles.listGap}>
            <TipPanel title={t('assistantResult.practicalTips')} icon="bulb-outline" color="#A78BFA" items={plan.practicalTips} />
            <TipPanel title={t('assistantResult.safetyTips')} icon="shield-checkmark-outline" color="#FF8AA0" items={plan.safetyTips} />
            {!!plan.sources?.length && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{t('assistantResult.sources')}</Text>
                {plan.sources.map(source => (
                  <TouchableOpacity key={`${source.label}-${source.url}`} onPress={() => source.url && Linking.openURL(source.url)} style={styles.sourceRow}>
                    <Ionicons name="open-outline" size={17} color="#8B5CF6" />
                    <View style={{ flex: 1 }}><Text style={styles.sourceLabel}>{source.label}</Text><Text style={styles.sourceDate}>{source.updatedAt}</Text></View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'chat' && (
          <View style={styles.panel}>
            <View style={styles.chatHeading}>
              <Ionicons name="sparkles" size={20} color="#A78BFA" />
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>{t('assistantResult.adjust.title')}</Text>
                <Text style={styles.chatHint}>{t('assistantResult.adjust.subtitle')}</Text>
              </View>
            </View>

            <View style={styles.suggestionRow}>
              {[
                'Deixe o roteiro mais econômico',
                'Inclua mais opções em dias de chuva',
                'Reduza os deslocamentos',
              ].map(suggestion => (
                <TouchableOpacity
                  key={suggestion}
                  onPress={() => handleAdjustPlan(suggestion)}
                  disabled={adjusting}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {adjustments.map((message, index) => (
              <View
                key={`${message.role}-${index}`}
                style={[styles.chatBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}
              >
                <Text style={styles.chatBubbleText}>{message.text}</Text>
              </View>
            ))}

            <View style={styles.chatComposer}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                placeholder={t('assistantResult.editPlaceholder')}
                placeholderTextColor="#69718F"
                style={styles.chatInput}
                multiline
                maxLength={600}
              />
              <TouchableOpacity
                onPress={() => handleAdjustPlan()}
                disabled={adjusting || !chatText.trim()}
                style={[styles.chatSend, (!chatText.trim() || adjusting) && styles.chatSendDisabled]}
              >
                {adjusting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="arrow-up" size={19} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Salvar e "Alterar viagem" gravam na viagem dos outros: fora para
            quem só visualiza. Sem isto, o convidado tocaria em "Atualizar
            roteiro" e levaria o erro da RLS na cara — que é exatamente o que a
            honestidade de interface existe para evitar. */}
        {!readOnly && (
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.replace('TripPlanner', { initialRequest: request })}>
              <Ionicons name="options-outline" size={18} color="#A78BFA" /><Text style={styles.secondaryText}>{t('assistantResult.adjust.cta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={() => handleSave()} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="bookmark" size={18} color="#fff" />}
              <Text style={styles.saveText}>{planId ? 'Atualizar roteiro' : 'Salvar roteiro'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!planId && (
          <TouchableOpacity
            style={styles.savedTripsButton}
            onPress={() => navigation.navigate('Main', { screen: 'Profile', params: { screen: 'SavedTrips' } })}
          >
            <Ionicons name="map-outline" size={18} color="#35D3C8" />
            <Text style={styles.savedTripsText}>{t('assistantResult.openSaved')}</Text>
            <Ionicons name="chevron-forward" size={17} color="#35D3C8" />
          </TouchableOpacity>
        )}
        <Text style={styles.disclaimer}>{t('assistantResult.estimatesDisclaimer')}</Text>
      </ScrollView>
      {/* Fora do ScrollView, para ficar parado no canto enquanto a lista rola.
          Só na aba Roteiro: é a única longa o bastante para precisar dele. */}
      {activeTab === 'itinerary' ? (
        <Animated.View
          style={[
            styles.backToTop,
            {
              bottom: insets.bottom + 20,
              right: insets.right + 18,
              opacity: backToTopOpacity,
              // Invisível não pode continuar pegando toque: com opacidade 0 ele
              // ainda estaria ali, cobrindo o canto do último cartão. No estilo e
              // não como prop: o react-native-web descontinuou a prop.
              pointerEvents: showBackToTop ? 'auto' : 'none',
            },
          ]}
        >
          <TouchableOpacity
            onPress={scrollToTop}
            style={styles.backToTopButton}
            accessibilityRole="button"
            accessibilityLabel={t('assistantResult.backToTop')}
          >
            <Ionicons name="arrow-up" size={20} color={trip.ink} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      <ShareToJourniModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        resource={{ plan: { request, plan } }}
        onExternalShare={handleShare}
      />
    </View>
  );
}

function Fact({ icon, text }) {
  return <View style={styles.fact}><Ionicons name={/** @type {any} */ (icon)} size={15} color="#A78BFA" /><Text style={styles.factText}>{text}</Text></View>;
}

function SmallButton({ icon, label, onPress, primary = false, loading = false }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading} style={[styles.smallButton, primary && styles.smallButtonPrimary]}>
      {loading ? <ActivityIndicator size="small" color="#A78BFA" /> : <Ionicons name={/** @type {any} */ (icon)} size={14} color={primary ? '#fff' : '#A78BFA'} />}
      <Text style={[styles.smallButtonText, primary && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TipPanel({ title, icon, color, items = [] }) {
  return (
    <View style={styles.panel}>
      <View style={styles.tipTitle}><Ionicons name={icon} size={19} color={color} /><Text style={styles.panelTitle}>{title}</Text></View>
      {items.map((item, index) => <Text key={`${item}-${index}`} style={styles.tipText}>• {item}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  // A viagem chegando, e a viagem que não abriu.
  tripStatus: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  tripStatusText: { fontSize: 15, color: '#5A6072', textAlign: 'center', lineHeight: 21 },
  tripStatusButton: {
    marginTop: 6, paddingHorizontal: 22, paddingVertical: 11,
    borderRadius: 12, backgroundColor: '#6C2BD9',
  },
  tripStatusButtonText: { color: '#fff', fontWeight: '700' },
  container: { flex: 1, backgroundColor: '#0D1326' },
  // O cabeçalho compacto e as abas em pill saíram: a capa virou o cabeçalho
  // (com os botões flutuantes) e as abas viraram a TripShortcutBar.
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center' },
  shortcutBar: { marginTop: 20, marginHorizontal: 6 },
  // Tingido com o roxo da marca, e não com o cinza do aviso de leitura: este é
  // o único card da tela que PEDE uma ação de quem está olhando.
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(108,43,217,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.42)',
  },
  inviteBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(108,43,217,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBannerText: { flex: 1, minWidth: 0, gap: 2 },
  inviteBannerTitle: {
    color: '#F4F5FB',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  inviteBannerHint: {
    color: '#8B93AD',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  acceptButton: {
    minWidth: 84,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#6C2BD9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonBusy: { opacity: 0.7 },
  acceptButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  readOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1B2545',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  readOnlyText: {
    flex: 1,
    color: '#8B93AD',
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
  // A faixa de dias é `position: absolute` no mapa (ela flutua sobre o globo);
  // aqui ela é conteúdo da lista, então volta ao fluxo.
  dayIndex: { position: 'relative', paddingHorizontal: 0 },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 15, paddingBottom: 50, gap: 14 },
  summaryCard: { padding: 18, borderRadius: 19, backgroundColor: '#171D36', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: 12 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 },
  aiBadgeText: { color: '#C4B5FD', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  countryText: { color: '#858DAD', fontSize: 11 },
  summaryText: { color: '#E8E9F3', fontSize: 14, lineHeight: 22 },
  quickFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#222946', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  factText: { color: '#C8CCE0', fontSize: 11, fontWeight: '700' },
  budgetScopeBox: { backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.16)' },
  budgetScopeHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  budgetScopeTitle: { color: '#E8E9F3', fontSize: 12, fontWeight: '800' },
  budgetScopeText: { color: '#9BA2BF', fontSize: 10, lineHeight: 16, marginTop: 7 },
  shoppingStatus: { color: '#9DE8E1', fontSize: 10, lineHeight: 16, marginTop: 6, fontWeight: '700' },
  summaryBudgetList: { gap: 7, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(167,139,250,0.14)' },
  summaryBudgetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  summaryBudgetCategory: { color: '#E8E2FF', fontSize: 10, fontWeight: '800' },
  summaryBudgetNote: { color: '#858DAD', fontSize: 8, lineHeight: 12, marginTop: 1 },
  summaryBudgetAmount: { color: '#9DE8E1', fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weatherBox: { flexDirection: 'row', gap: 9, backgroundColor: 'rgba(0,209,193,0.08)', borderRadius: 11, padding: 11 },
  weatherText: { color: '#A8DCD8', flex: 1, fontSize: 11, lineHeight: 17 },
  listGap: { gap: 13 },
  dayCard: { backgroundColor: '#151B33', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 4 },
  dayNumber: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
  dayNumberText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  dayTitle: { color: '#F7F7F2', fontSize: 15, fontWeight: '800' },
  dayDate: { color: '#777F9E', fontSize: 10, marginTop: 2 },
  activity: { flexDirection: 'row', gap: 11, paddingTop: 15, marginTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.055)' },
  timelineIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(139,92,246,0.13)', alignItems: 'center', justifyContent: 'center' },
  period: { color: '#A78BFA', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  activityTitle: { color: '#F0F1F7', fontSize: 14, fontWeight: '800', marginTop: 3 },
  activityDescription: { color: '#9BA2BF', fontSize: 12, lineHeight: 18, marginTop: 5 },
  metaRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 8 },
  location: { color: '#7F87A6', fontSize: 10, flex: 1 },
  // As linhas que seguram ícone + texto. O ícone substituiu os glifos 📍, ★ e ◷,
  // que eram desenhados pela fonte do sistema e variavam de tamanho e cor entre
  // aparelhos.
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  verifiedItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cost: { color: '#35D3C8', fontSize: 10, fontWeight: '800' },
  verifiedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 7 },
  verifiedText: { color: '#D5D8E8', fontSize: 9, fontWeight: '700' },
  verifiedSource: { color: '#6F7798', fontSize: 8, textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  purchaseNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: 'rgba(53,211,200,0.06)', borderRadius: 9, padding: 9, marginTop: 8 },
  purchaseNoteText: { flex: 1, color: '#8FB8B6', fontSize: 9, lineHeight: 14 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', backgroundColor: 'rgba(139,92,246,0.07)' },
  smallButtonPrimary: { backgroundColor: '#6C2BD9', borderColor: '#6C2BD9' },
  smallButtonText: { color: '#BBA8FA', fontSize: 10, fontWeight: '700' },
  editBox: { gap: 8 },
  editInput: { color: '#fff', backgroundColor: '#202744', borderRadius: 10, padding: 10, fontSize: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  editMultiline: { minHeight: 74, textAlignVertical: 'top' },
  panel: { backgroundColor: '#151B33', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  panelEyebrow: { color: '#858DAD', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  panelTitle: { color: '#F7F7F2', fontSize: 15, fontWeight: '800' },
  totalBudget: { color: '#35D3C8', fontSize: 30, fontWeight: '900', marginTop: 8 },
  budgetStatus: { color: '#9BA2BF', fontSize: 12, lineHeight: 18, marginTop: 5 },
  budgetScopeDetail: { color: '#B9BED2', fontSize: 11, lineHeight: 17, marginTop: 9 },
  convertedBudgetBox: { marginTop: 13, padding: 13, borderRadius: 13, backgroundColor: 'rgba(53,211,200,0.08)', borderWidth: 1, borderColor: 'rgba(53,211,200,0.2)' },
  convertedBudgetLabel: { color: '#799C9E', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  convertedBudgetValue: { color: '#9DE8E1', fontSize: 20, fontWeight: '900', marginTop: 4 },
  convertedBudgetDate: { color: '#687F85', fontSize: 9, marginTop: 3 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 15 },
  budgetRow: { flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.045)' },
  budgetCategory: { color: '#E7E8F1', fontSize: 13, fontWeight: '800' },
  budgetNote: { color: '#777F9E', fontSize: 10, lineHeight: 15, marginTop: 3 },
  budgetAmount: { color: '#C4B5FD', fontSize: 12, fontWeight: '800' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: '#35D3C8', fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 6, backgroundColor: '#252C48', borderRadius: 99, marginVertical: 13, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00D1C1' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.045)' },
  checkCategory: { color: '#777F9E', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  checkItem: { color: '#DDE0ED', fontSize: 12, marginTop: 2 },
  checkDone: { textDecorationLine: 'line-through', color: '#69718F' },
  tipTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  tipText: { color: '#AAB0C9', fontSize: 12, lineHeight: 19, marginBottom: 6 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  sourceLabel: { color: '#DDE0ED', fontSize: 12, fontWeight: '700' },
  sourceDate: { color: '#707896', fontSize: 9, marginTop: 2 },
  chatHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  chatHint: { color: '#858DAD', fontSize: 10, marginTop: 3 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  suggestionChip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(139,92,246,0.11)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.22)' },
  suggestionText: { color: '#C4B5FD', fontSize: 10, fontWeight: '700' },
  chatBubble: { maxWidth: '88%', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6C2BD9' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#222946' },
  chatBubbleText: { color: '#F2F0FA', fontSize: 11, lineHeight: 17 },
  chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  chatInput: { flex: 1, minHeight: 46, maxHeight: 110, color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, fontSize: 12, textAlignVertical: 'top' },
  chatSend: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
  chatSendDisabled: { opacity: 0.45 },
  bottomActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  secondaryButton: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, padding: 14, borderWidth: 1, borderColor: '#6C2BD9' },
  secondaryText: { color: '#BBA8FA', fontSize: 12, fontWeight: '800' },
  saveButton: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, padding: 14, backgroundColor: '#6C2BD9' },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  savedTripsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, padding: 13, backgroundColor: 'rgba(53,211,200,0.08)', borderWidth: 1, borderColor: 'rgba(53,211,200,0.25)' },
  savedTripsText: { color: '#9DE8E1', fontSize: 12, fontWeight: '800' },
  disclaimer: { color: '#636B89', fontSize: 9, lineHeight: 14, textAlign: 'center' },
  backToTop: { position: 'absolute' },
  backToTopButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: trip.card2,
    borderWidth: 1,
    borderColor: trip.line2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    // A sombra do card (18px, 55%) é para um cartão grande; num círculo de 46px
    // ela vira uma mancha. Mesma cor e direção, menos alcance.
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
