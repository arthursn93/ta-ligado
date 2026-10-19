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
- Social: chat por sala (validado no servidor, histórico das últimas 50, limite contra spam, dador não escreve durante a própria carta) e voz por WebRTC em malha, com sinalização pelo Socket.io e STUN público. TURN opcional por `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`.
- Hospedagem: Render (Web Service gratuito, configurado pelo `render.yaml`; verificação de saúde em `/saude`). Salas ficam em memória, então somem quando o serviço reinicia (o cliente volta para o início com aviso).
- Proteções: limites por IP (conexões, salas criadas, códigos errados), checagem de origem (`ORIGENS_PERMITIDAS` para liberar outras), tamanho máximo de token e de mensagem, rede de segurança contra erros nos eventos, CSP e gzip.
- Backend: Node.js + Socket.io (`server/`). Salas privadas por código de 4 letras, até 10 pessoas, rodízio do dador por carta. O servidor é a autoridade: roda o `Game` e manda a cada aparelho só a visão dele.

## Mapa do código atual
- `WordBank` → pacotes de palavras (base para pacotes temáticos).
- `Hooks` → eventos `roundResolved` (coleta de pistas p/ Fase 2) e `gameEnd` (anúncio entre partidas).
- `Theme` + `[data-skin]` no CSS → skins.
- `Game` → estado oficial da partida (no modo online, roda no servidor).
- `Salas` (servidor) → salas, anfitrião, dador da vez, permissões, reconexão por token.
- `progressao/Partida` (servidor) → estatísticas por partida; o resumo sai por `aoEncerrarPartida` quando a partida termina ou é interrompida.
- `progressao/Banco` (servidor) → grava cada partida no PostgreSQL (`DATABASE_URL`) numa transação; `Memoria` faz o mesmo em memória para testes; `Perfil` monta estatísticas, recordes e histórico.
- `Rede` → cliente Socket.io com a mesma interface do `Game`; `Lobby` → criar/entrar na sala.
- `UI` → estado visual local (seleção/hover) e renderização, nos modos local e online.
