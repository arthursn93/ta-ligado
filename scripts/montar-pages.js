// Monta em _site/ a cópia da tela do jogo para o GitHub Pages, que não dorme. As salas online
// continuam no servidor do Render. Rodar com:
//   node scripts/montar-pages.js --origem https://arthursn93.github.io/ta-ligado --servidor https://ta-ligado.onrender.com
// --origem é o endereço público da cópia (prévia do link); --servidor é o do Render (salas e endereço canônico).
// Não leva nenhum segredo: o endereço do banco fica só no Render.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, '_site');
const SOLTOS = ['index.html', 'style.css', 'privacidade.html', 'privacidade-en.html', 'privacidade-es.html',
  'favicon.svg', 'icone-180.png', 'previa.png', 'previa-2.png'];

function argumento(nome) {
  const i = process.argv.indexOf('--' + nome);
  const valor = i === -1 ? '' : String(process.argv[i + 1] || '');
  if (!/^https:\/\/[^\s"'<>]+$/.test(valor)) {
    console.error('Faltou --' + nome + ' com um endereço https (sem barra no fim).');
    process.exit(1);
  }
  return valor.replace(/\/+$/, '');
}

const origem = argumento('origem');
const servidor = argumento('servidor');

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(path.join(SAIDA, 'js'), { recursive: true });
fs.mkdirSync(path.join(SAIDA, 'fontes'), { recursive: true });
fs.mkdirSync(path.join(SAIDA, 'socket.io'), { recursive: true });

for (const arquivo of SOLTOS) fs.copyFileSync(path.join(RAIZ, arquivo), path.join(SAIDA, arquivo));
for (const arquivo of fs.readdirSync(path.join(RAIZ, 'js'))) {
  if (/^[A-Za-z]+\.js$/.test(arquivo)) fs.copyFileSync(path.join(RAIZ, 'js', arquivo), path.join(SAIDA, 'js', arquivo));
}
for (const arquivo of fs.readdirSync(path.join(RAIZ, 'fontes'))) {
  if (/\.woff2$/.test(arquivo)) fs.copyFileSync(path.join(RAIZ, 'fontes', arquivo), path.join(SAIDA, 'fontes', arquivo));
}
// O cliente da conexão vai junto, no mesmo caminho que o servidor do Render usa.
fs.copyFileSync(path.join(path.dirname(require.resolve('socket.io')), '..', 'client-dist', 'socket.io.min.js'), path.join(SAIDA, 'socket.io', 'socket.io.min.js'));

// Endereço do servidor das salas e endereço público da prévia do link.
fs.writeFileSync(path.join(SAIDA, 'js', 'Config.js'),
  "// Gerado por scripts/montar-pages.js para o GitHub Pages.\nvar Config = { servidor: " + JSON.stringify(servidor) + " };\n");
const index = path.join(SAIDA, 'index.html');
// O endereço canônico continua sendo o do Render, para os buscadores não tratarem a cópia como outro site.
fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
  .replace('<link rel="canonical" href="{{ORIGEM}}/">', '<link rel="canonical" href="' + servidor + '/">')
  .split('{{ORIGEM}}').join(origem));
// Sem isto o GitHub Pages trata a pasta com o processador Jekyll, que não é usado aqui.
fs.writeFileSync(path.join(SAIDA, '.nojekyll'), '');

console.log('_site/ montado: tela em ' + origem + ', salas em ' + servidor + '.');
