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

Para jogar com gente de fora da sua rede, publique o servidor (veja abaixo).

## Publicar no Render

O repositório já vem com o `render.yaml`, então o Render configura tudo sozinho:

1. Entre em [render.com](https://render.com) com sua conta do GitHub.
2. Clique em **New > Blueprint** e escolha o repositório `ta-ligado`.
3. Confirme em **Apply**. O Render roda `npm install`, depois `npm start`, e mostra o link público (algo como `https://ta-ligado.onrender.com`).

Mande esse link para a turma. Cada um abre no navegador do celular ou do computador, sem instalar nada. Cada novo push no `main` publica uma versão nova.

Se preferir criar à mão (**New > Web Service**): Runtime `Node`, Build Command `npm install`, Start Command `npm start`, Health Check Path `/saude`. Não precisa definir `PORT`; o Render passa a porta e o servidor usa.

Bom saber sobre o plano gratuito:

- O serviço dorme depois de um tempo sem visitas. O primeiro acesso depois disso demora cerca de um minuto para acordar.
- As salas ficam na memória do servidor. Se ele dormir, reiniciar ou receber uma versão nova, as salas abertas somem e a turma cria outra (o jogo volta sozinho para a tela inicial).

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
