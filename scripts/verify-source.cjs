const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
  });
}

const files = ['src', 'supabase'].flatMap(filesIn)
  .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of files) {
  parser.parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
}

console.log(`Validated ${files.length} source files.`);
