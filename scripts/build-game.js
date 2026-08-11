const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const fragmentsDirectory = path.join(repositoryRoot, 'js', 'game');
const outputPath = path.join(repositoryRoot, 'js', 'game.js');
const fragmentNames = [
  'bootstrap.js',
  'kaykit3d.js',
  'core.js',
  'ai.js',
  'turns.js',
  'audio.js',
  'ui.js',
  'diagnostics.js',
];

const rebuilt = Buffer.concat(
  fragmentNames.map(fragmentName => fs.readFileSync(path.join(fragmentsDirectory, fragmentName)))
);

// Parsing the assembled source catches broken fragment boundaries before comparison or writing.
new Function(rebuilt.toString('utf8'));

const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const writeRequested = process.argv.includes('--write');

if (writeRequested) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
  if (!current || !current.equals(rebuilt)) fs.writeFileSync(outputPath, rebuilt);
  console.log(`Built js/game.js (${rebuilt.length} bytes, sha256 ${digest(rebuilt)}).`);
  process.exit(0);
}

if (!fs.existsSync(outputPath)) {
  console.error('js/game.js is missing. Run: node scripts/build-game.js --write');
  process.exit(1);
}

const current = fs.readFileSync(outputPath);
if (!current.equals(rebuilt)) {
  console.error('js/game.js differs from its source fragments. Run: node scripts/build-game.js --write');
  console.error(`expected sha256 ${digest(rebuilt)}`);
  console.error(`actual   sha256 ${digest(current)}`);
  process.exit(1);
}

console.log(`js/game.js matches all ${fragmentNames.length} fragments byte-for-byte (sha256 ${digest(current)}).`);
