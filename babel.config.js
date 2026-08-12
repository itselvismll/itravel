module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [require.resolve('./scripts/babel-plugin-import-meta.cjs')],
  };
};
