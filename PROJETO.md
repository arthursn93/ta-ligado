# Tá Ligado? — Diretrizes do projeto

## 1. Mecânica
- Grade 5x5: colunas A–E (topo), linhas 1–5 (esquerda). Cada linha/coluna recebe uma palavra aleatória em português.
- O sistema sorteia uma coordenada secreta (ex.: C2). O dador dá UMA palavra que conecta a palavra da coluna com a da linha.
- O grupo clica na grade; o sistema é o juiz: acerto → verde menta; erro → coral, a carta é descartada.

## 2. UI/UX
- Estilo de jogo de cartas retrô (anos 50), inspirado no visual do jogo de tabuleiro Entre Linhas, com paleta própria: tomate (bordas e botões), mostarda (cartas de palavra), azul-cobalto (cartas de dica) sobre papel marfim e toalha listrada clara. Não usa logo, ilustrações nem nome do jogo original.
- Peças: cabeçalhos são cartas com letra/número serifado (Abril Fatface); palavras em etiqueta branca (Oswald); acerto vira carta de dica azul com a coordenada; erro vira carta de verso listrado com X. Logo em Chewy.
- 100% responsivo (celular vertical + desktop). No celular, quadrados centrais vazios; tocar destaca linha/coluna e mostra as palavras num painel fixo (anti "dedo gordo").

## 3. Banco de dados (evolução)
- Fase 1 (atual): multiplayer online entre humanos, salas privadas por código de convite. Sem IA; só validação de coordenadas.
- Fase 2: servidor salva anonimamente as melhores pistas humanas → modo Solo/Campanha usa essas pistas.

## 4. Monetização / progressão (futuro)
- Níveis/XP ficam para depois. MVP = partida crua e divertida.
- Código modular para: anúncios entre partidas, pacotes temáticos de palavras, skins de cor do tabuleiro.

## 5. Arquitetura
- MVP: HTML5, CSS moderno (Grid/Flexbox), JavaScript ES6 puro, sem dependências.
- Backend futuro: Node.js + Socket.io para salas em tempo real.

## Mapa do código atual
- `WordBank` → pacotes de palavras (base para pacotes temáticos).
- `Hooks` → eventos `roundResolved` (coleta de pistas p/ Fase 2) e `gameEnd` (anúncio entre partidas).
- `Theme` + `[data-skin]` no CSS → skins.
- `Game` → estado oficial da partida (migrará para o servidor).
- `UI` → estado visual local (seleção/hover) e renderização.
