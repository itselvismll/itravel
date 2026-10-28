// Um React Native de mentira, só o bastante para RENDERIZAR um componente do
// app dentro do `node:test` e TOCAR nele.
//
// POR QUE ISTO EXISTE
//
// Os testes desta pasta sempre afirmaram coisas sobre componentes lendo o
// código-fonte com expressão regular. Isso pega ausência (a chamada sumiu), mas
// não pega comportamento: um `onPress` presente no arquivo pode mandar `null`
// em vez do dia, e o teste passa enquanto o botão não faz nada no aparelho. Foi
// exatamente o que aconteceu duas vezes com a faixa de dias.
//
// Aqui os componentes de `react-native` viram elementos de host com os mesmos
// props. O `react-test-renderer` monta a árvore de verdade — hooks, efeitos,
// refs, re-render — e o teste acha a pílula do dia 20 e chama o `onPress` dela
// como o dedo chamaria. O que se afirma passa a ser o que o usuário faria.
//
// Não é um emulador: não há layout, nem gesto, nem responder nativo. O que ele
// cobre é a ligação entre o toque e o que o componente faz com ele.
const React = require('react');

/**
 * Um componente de host que repassa todos os props, para o teste poder lê-los.
 *
 * @param {string} name
 */
const host = (name) => {
  const Component = React.forwardRef((/** @type {any} */ props, ref) =>
    React.createElement(name, { ...props, ref }, props.children));
  Component.displayName = name;
  return Component;
};

const View = host('View');
const Text = host('Text');
const TouchableOpacity = host('TouchableOpacity');

/**
 * ScrollView com `scrollTo` observável.
 *
 * As chamadas ficam em `scrollView.calls`, que é como o teste pergunta "a faixa
 * rolou até onde?" sem precisar de tela.
 */
const makeScrollView = () => {
  /** @type {Array<any>} */
  const calls = [];
  const Component = React.forwardRef((/** @type {any} */ props, ref) => {
    React.useImperativeHandle(ref, () => ({
      /** @param {any} options */
      scrollTo: (options) => { calls.push(options); },
    }), []);
    return React.createElement('ScrollView', { ...props }, props.children);
  });
  Component.displayName = 'ScrollView';
  return { Component, calls };
};

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => (Array.isArray(style)
    ? style.filter(Boolean).reduce((acc, item) => ({ ...acc, ...StyleSheet.flatten(item) }), {})
    : style || {}),
};

/**
 * O módulo `react-native` de mentira, mais o registro do que o ScrollView rolou.
 *
 * @returns {{ module: Record<string, any>, scrollCalls: Array<any> }}
 */
const makeReactNative = () => {
  const scroll = makeScrollView();
  return {
    scrollCalls: scroll.calls,
    module: {
      View,
      Text,
      TouchableOpacity,
      TouchableWithoutFeedback: TouchableOpacity,
      Pressable: TouchableOpacity,
      ScrollView: scroll.Component,
      StyleSheet,
      Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
    },
  };
};

/** Ionicons de mentira: um host que guarda o nome do ícone. */
const fakeVectorIcons = {
  Ionicons: host('Ionicons'),
};

module.exports = { makeReactNative, fakeVectorIcons, StyleSheet, host };
