// Gera previa-2.png (1200×630, prévia do link) e icone-180.png (ícone do celular) a partir de
// scripts/previa.html e favicon.svg. Rodar com: node scripts/gerar-previa.js  (precisa do Playwright).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
  await pagina.goto('file://' + path.join(__dirname, 'previa.html'));
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: path.join(RAIZ, 'previa-2.png') });

  const icone = await navegador.newPage({ viewport: { width: 180, height: 180 } });
  const svg = fs.readFileSync(path.join(RAIZ, 'favicon.svg'), 'utf8').replace('<svg ', '<svg width="180" height="180" ')
    // O iPhone arredonda os cantos sozinho: o ícone vai quadrado, sem os cantos brancos.
    .replace('rx="14" ', '');
  await icone.setContent('<body style="margin:0">' + svg + '</body>');
  await icone.screenshot({ path: path.join(RAIZ, 'icone-180.png') });

  await navegador.close();
  console.log('previa-2.png e icone-180.png gerados.');
})();
