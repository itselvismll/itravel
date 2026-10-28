// A estrutura da tela de Perguntas frequentes — 10 categorias, 35 perguntas.
//
// A COPY MORA EM docs/faq-content.md, NÃO AQUI
//
// Este arquivo só guarda CHAVES de tradução, na mesma convenção de
// `notificationCategories.js`: módulo puro, sem `useLocale`, para dar para
// testar sem renderizar nada. Quem resolve a chave é a tela, com o `t` do
// contexto de idioma. `docs/faq-content.md` é a fonte de verdade do TEXTO —
// editar a copy é editar lá e refletir aqui e nos três JSON de
// `src/i18n/locales`, nunca o contrário.
//
// `tests/faq-content.test.cjs` compara a contagem de categorias e perguntas
// deste módulo com `docs/faq-content.md`, para os dois nunca divergirem em
// silêncio.
/**
 * @typedef {{
 *   key: string,
 *   questionKey: string,
 *   answerKey: string,
 * }} FaqQuestion
 */

/**
 * @typedef {{
 *   key: string,
 *   icon: React.ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'],
 *   titleKey: string,
 *   questions: ReadonlyArray<FaqQuestion>,
 * }} FaqCategory
 */

/** @type {ReadonlyArray<FaqCategory>} */
export const FAQ_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'account',
    icon: 'person-circle-outline',
    titleKey: 'faq.categories.account.title',
    questions: Object.freeze([
      Object.freeze({ key: 'createAccount', questionKey: 'faq.categories.account.questions.createAccount.question', answerKey: 'faq.categories.account.questions.createAccount.answer' }),
      Object.freeze({ key: 'confirmationEmailMissing', questionKey: 'faq.categories.account.questions.confirmationEmailMissing.question', answerKey: 'faq.categories.account.questions.confirmationEmailMissing.answer' }),
      Object.freeze({ key: 'googleLogin', questionKey: 'faq.categories.account.questions.googleLogin.question', answerKey: 'faq.categories.account.questions.googleLogin.answer' }),
      Object.freeze({ key: 'changeUsername', questionKey: 'faq.categories.account.questions.changeUsername.question', answerKey: 'faq.categories.account.questions.changeUsername.answer' }),
      Object.freeze({ key: 'forgotPassword', questionKey: 'faq.categories.account.questions.forgotPassword.question', answerKey: 'faq.categories.account.questions.forgotPassword.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'globe',
    icon: 'earth-outline',
    titleKey: 'faq.categories.globe.title',
    questions: Object.freeze([
      Object.freeze({ key: 'visitedVsWishlist', questionKey: 'faq.categories.globe.questions.visitedVsWishlist.question', answerKey: 'faq.categories.globe.questions.visitedVsWishlist.answer' }),
      Object.freeze({ key: 'markCountry', questionKey: 'faq.categories.globe.questions.markCountry.question', answerKey: 'faq.categories.globe.questions.markCountry.answer' }),
      Object.freeze({ key: 'unmarkCountry', questionKey: 'faq.categories.globe.questions.unmarkCountry.question', answerKey: 'faq.categories.globe.questions.unmarkCountry.answer' }),
      Object.freeze({ key: 'ukNations', questionKey: 'faq.categories.globe.questions.ukNations.question', answerKey: 'faq.categories.globe.questions.ukNations.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'aiPlanning',
    icon: 'sparkles-outline',
    titleKey: 'faq.categories.aiPlanning.title',
    questions: Object.freeze([
      Object.freeze({ key: 'howItWorks', questionKey: 'faq.categories.aiPlanning.questions.howItWorks.question', answerKey: 'faq.categories.aiPlanning.questions.howItWorks.answer' }),
      Object.freeze({ key: 'editPlan', questionKey: 'faq.categories.aiPlanning.questions.editPlan.question', answerKey: 'faq.categories.aiPlanning.questions.editPlan.answer' }),
      Object.freeze({ key: 'viewOnGlobe', questionKey: 'faq.categories.aiPlanning.questions.viewOnGlobe.question', answerKey: 'faq.categories.aiPlanning.questions.viewOnGlobe.answer' }),
      Object.freeze({ key: 'savedPlans', questionKey: 'faq.categories.aiPlanning.questions.savedPlans.question', answerKey: 'faq.categories.aiPlanning.questions.savedPlans.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'groupTrips',
    icon: 'people-outline',
    titleKey: 'faq.categories.groupTrips.title',
    questions: Object.freeze([
      Object.freeze({ key: 'inviteSomeone', questionKey: 'faq.categories.groupTrips.questions.inviteSomeone.question', answerKey: 'faq.categories.groupTrips.questions.inviteSomeone.answer' }),
      Object.freeze({ key: 'participantRoles', questionKey: 'faq.categories.groupTrips.questions.participantRoles.question', answerKey: 'faq.categories.groupTrips.questions.participantRoles.answer' }),
      Object.freeze({ key: 'groupTasks', questionKey: 'faq.categories.groupTrips.questions.groupTasks.question', answerKey: 'faq.categories.groupTrips.questions.groupTasks.answer' }),
      Object.freeze({ key: 'checklistVsTasks', questionKey: 'faq.categories.groupTrips.questions.checklistVsTasks.question', answerKey: 'faq.categories.groupTrips.questions.checklistVsTasks.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'profile',
    icon: 'ribbon-outline',
    titleKey: 'faq.categories.profile.title',
    questions: Object.freeze([
      Object.freeze({ key: 'levels', questionKey: 'faq.categories.profile.questions.levels.question', answerKey: 'faq.categories.profile.questions.levels.answer' }),
      Object.freeze({ key: 'passport', questionKey: 'faq.categories.profile.questions.passport.question', answerKey: 'faq.categories.profile.questions.passport.answer' }),
      Object.freeze({ key: 'publicProfile', questionKey: 'faq.categories.profile.questions.publicProfile.question', answerKey: 'faq.categories.profile.questions.publicProfile.answer' }),
      Object.freeze({ key: 'changePhoto', questionKey: 'faq.categories.profile.questions.changePhoto.question', answerKey: 'faq.categories.profile.questions.changePhoto.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'social',
    icon: 'heart-outline',
    titleKey: 'faq.categories.social.title',
    questions: Object.freeze([
      Object.freeze({ key: 'followSomeone', questionKey: 'faq.categories.social.questions.followSomeone.question', answerKey: 'faq.categories.social.questions.followSomeone.answer' }),
      Object.freeze({ key: 'postPhoto', questionKey: 'faq.categories.social.questions.postPhoto.question', answerKey: 'faq.categories.social.questions.postPhoto.answer' }),
      Object.freeze({ key: 'shareInstagram', questionKey: 'faq.categories.social.questions.shareInstagram.question', answerKey: 'faq.categories.social.questions.shareInstagram.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'messages',
    icon: 'chatbubble-ellipses-outline',
    titleKey: 'faq.categories.messages.title',
    questions: Object.freeze([
      Object.freeze({ key: 'sendMessage', questionKey: 'faq.categories.messages.questions.sendMessage.question', answerKey: 'faq.categories.messages.questions.sendMessage.answer' }),
      Object.freeze({ key: 'shareInChat', questionKey: 'faq.categories.messages.questions.shareInChat.question', answerKey: 'faq.categories.messages.questions.shareInChat.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'notifications',
    icon: 'notifications-outline',
    titleKey: 'faq.categories.notifications.title',
    questions: Object.freeze([
      Object.freeze({ key: 'pushToPhone', questionKey: 'faq.categories.notifications.questions.pushToPhone.question', answerKey: 'faq.categories.notifications.questions.pushToPhone.answer' }),
      Object.freeze({ key: 'chooseTypes', questionKey: 'faq.categories.notifications.questions.chooseTypes.question', answerKey: 'faq.categories.notifications.questions.chooseTypes.answer' }),
      Object.freeze({ key: 'disableAll', questionKey: 'faq.categories.notifications.questions.disableAll.question', answerKey: 'faq.categories.notifications.questions.disableAll.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'safety',
    icon: 'shield-checkmark-outline',
    titleKey: 'faq.categories.safety.title',
    questions: Object.freeze([
      Object.freeze({ key: 'blockVsReport', questionKey: 'faq.categories.safety.questions.blockVsReport.question', answerKey: 'faq.categories.safety.questions.blockVsReport.answer' }),
      Object.freeze({ key: 'whatHappensWhenBlocking', questionKey: 'faq.categories.safety.questions.whatHappensWhenBlocking.question', answerKey: 'faq.categories.safety.questions.whatHappensWhenBlocking.answer' }),
      Object.freeze({ key: 'unblock', questionKey: 'faq.categories.safety.questions.unblock.question', answerKey: 'faq.categories.safety.questions.unblock.answer' }),
    ]),
  }),
  Object.freeze({
    key: 'privacy',
    icon: 'lock-closed-outline',
    titleKey: 'faq.categories.privacy.title',
    questions: Object.freeze([
      Object.freeze({ key: 'deleteAccount', questionKey: 'faq.categories.privacy.questions.deleteAccount.question', answerKey: 'faq.categories.privacy.questions.deleteAccount.answer' }),
      Object.freeze({ key: 'whatHappensToData', questionKey: 'faq.categories.privacy.questions.whatHappensToData.question', answerKey: 'faq.categories.privacy.questions.whatHappensToData.answer' }),
      Object.freeze({ key: 'termsLocation', questionKey: 'faq.categories.privacy.questions.termsLocation.question', answerKey: 'faq.categories.privacy.questions.termsLocation.answer' }),
    ]),
  }),
]);

/** @param {string} categoryKey */
export const findFaqCategory = (categoryKey) => (
  FAQ_CATEGORIES.find((category) => category.key === categoryKey) || null
);
