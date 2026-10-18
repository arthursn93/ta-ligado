# Tá Ligado?

Jogo cooperativo de associação de palavras para o navegador (celular ou computador).

A grade 5x5 tem uma palavra em cada coluna (A–E) e em cada linha (1–5). A cada rodada, o dador recebe uma coordenada secreta e dá **uma única palavra** como pista, ligando as duas palavras daquele cruzamento. O grupo tenta descobrir o quadrado certo. São 25 cartas por partida: vence quem posicionar todas sem erro.

## Como jogar

### Online, cada um no seu aparelho

```bash
npm install
npm start
```

Abra `http://localhost:3000`, digite seu nome e crie uma sala. Mande o código de 4 letras (ou o link do botão **Copiar convite**) para a turma. Quando todos entrarem, quem criou a sala toca em **Começar partida**.

- A vez de dar a pista gira entre os jogadores, uma carta para cada. Só o dador vê a coordenada secreta, no próprio aparelho.
- Qualquer outra pessoa da sala pode escolher o quadrado e confirmar o palpite.
- Quem recarregar a página ou perder a conexão volta para o mesmo lugar. Se o dador cair antes de dar a pista, a vez passa para o próximo.
- O servidor é o juiz: as regras rodam só nele, e cada aparelho recebe apenas o que pode ver.

Para jogar com gente de fora da sua rede, publique o servidor em qualquer hospedagem de Node com WebSocket (Render, Railway, Fly.io...). O comando de início é `npm start` e a porta vem da variável `PORT`.

### Num aparelho só

Abra o `index.html` direto no navegador (dois cliques, sem servidor) e o aparelho vai passando de mão em mão. Com o servidor rodando, essa opção também aparece na tela inicial: **Jogar num aparelho só**.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `js/Game.js` | Regras e estado oficial da partida. Não sabe nada de tela; recebe ações (`NOVA_PARTIDA`, `DAR_PISTA`, `CHUTAR`). |
| `js/WordBank.js` | Pacotes de palavras e dicionário de sinônimos/traduções usado para barrar pistas redundantes. |
| `js/Util.js` | Funções puras: embaralhar, normalizar acentos, detectar palavras da mesma família. |
| `js/Hooks.js` | Eventos para extensões (`roundResolved`, `gameEnd`). |
| `js/UI.js` | Interface: grade, painel, fluxo de passar o aparelho e modo online. |
| `js/Lobby.js` | Tela de entrada online: criar sala, entrar com código, sala de espera. |
| `js/Rede.js` | Cliente Socket.io com a mesma interface do `Game` (`visao`, `executar`, `assinar`). |
| `server/index.js` | Servidor HTTP + Socket.io. Serve só os arquivos do jogo. |
| `server/Salas.js` | Salas por código, anfitrião, rodízio do dador, permissões e reconexão. |
| `js/Theme.js` | Skins de cor. |
| `style.css` | Visual estilo jogo de cartas retrô. |
| `testes/` | Testes da lógica, das salas e do servidor. |

Os scripts são carregados como scripts comuns (sem `import`) para o jogo abrir direto do disco. O mesmo `Game.js` roda no navegador (modo local) e no servidor (modo online).

## Testes

```bash
npm install
npm test
```

Mais detalhes de produto e roadmap em [PROJETO.md](PROJETO.md).
