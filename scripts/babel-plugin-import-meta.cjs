// O Metro emite o bundle web como <script> clássico (sem type="module"), e nesse
// contexto `import.meta` é erro de sintaxe — o bundle inteiro deixa de parsear.
// O maplibre-gl v6 usa `import.meta.url` para descobrir onde está o worker, então
// sem esta transformação o app web nem carrega.
//
// Trocamos `import.meta` por um objeto com a URL base do documento. Para o
// maplibre isso é suficiente: o WORKER_URL é definido explicitamente em
// GlobeMap.web.js apontando para a cópia servida em /maplibre.
module.exports = function transformImportMeta({ types: t }) {
  const buildUrl = () =>
    t.objectExpression([
      t.objectProperty(
        t.identifier('url'),
        t.conditionalExpression(
          t.logicalExpression(
            '&&',
            t.binaryExpression(
              '!==',
              t.unaryExpression('typeof', t.identifier('document')),
              t.stringLiteral('undefined')
            ),
            t.memberExpression(t.identifier('document'), t.identifier('baseURI'))
          ),
          t.memberExpression(t.identifier('document'), t.identifier('baseURI')),
          t.conditionalExpression(
            t.binaryExpression(
              '!==',
              t.unaryExpression('typeof', t.identifier('location')),
              t.stringLiteral('undefined')
            ),
            t.memberExpression(t.identifier('location'), t.identifier('href')),
            t.stringLiteral('')
          )
        )
      ),
    ]);

  return {
    name: 'transform-import-meta',
    visitor: {
      MetaProperty(path) {
        const { meta, property } = path.node;
        if (meta.name !== 'import' || property.name !== 'meta') return;
        path.replaceWith(buildUrl());
        path.skip();
      },
    },
  };
};
