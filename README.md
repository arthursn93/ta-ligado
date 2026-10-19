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

### Chat e voz

Dentro da sala (na espera e durante a partida) aparecem dois botões: 🎙️ **Voz** e 💬 **Chat**.

- **Chat:** as mensagens vão só para quem está na mesma sala. No computador o chat fica aberto ao lado do tabuleiro; no celular abre por cima e um número avisa as mensagens novas. Quem está dando a pista não escreve enquanto a carta está em jogo, para não dar dica extra.
- **Voz:** ao tocar em Voz, o jogo explica e só então o navegador pede o microfone. Dá para ligar e desligar o microfone a qualquer hora, ou entrar só para ouvir. Ao lado de cada nome aparece 🎙️ (microfone ligado), 🔇 (desligado) ou 🎧 (só ouvindo), e o nome acende quando a pessoa fala.
- O áudio vai direto de aparelho para aparelho (WebRTC); o servidor só ajuda a combinar a conexão. Cada aparelho conecta com cada outro, o que funciona bem para salas pequenas como as do jogo (até 10 pessoas).
- Em algumas redes mais fechadas (certos 4G e redes de empresa) o áudio não consegue passar direto e precisa de um servidor TURN. Se alguém entrar na voz e não ouvir ninguém, configure um TURN nas variáveis de ambiente do servidor: `TURN_URL` (ex.: `turn:turn.exemplo.com:3478`, pode ter vários separados por vírgula), `TURN_USERNAME` e `TURN_CREDENTIAL`. No Render, isso fica em **Environment** no painel do serviço.

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
- As salas ficam na memória do servidor. Se ele dormir, reiniciar ou receber uma versão nova, as salas abertas somem: o jogo volta sozinho para a tela inicial com o aviso "A sala foi encerrada" e a turma cria outra.
- Enquanto o servidor acorda, a tela mostra "Conectando ao servidor…". Se depois de 1 minuto não der, aparece a opção de tentar de novo ou jogar num aparelho só.

### Proteções do servidor

- Cada endereço de IP pode ter até 60 conexões ao mesmo tempo, criar até 10 salas por minuto e errar o código da sala até 10 vezes por minuto (os números ficam em `LIMITES`, no `server/index.js`).
- Só páginas do próprio site conectam no servidor. Para liberar outro endereço (por exemplo, um app de celular no futuro), defina `ORIGENS_PERMITIDAS` com os endereços separados por vírgula.
- Um erro inesperado num evento é registrado no log e respondido com "Algo deu errado", sem derrubar as outras salas.
- As páginas saem comprimidas (gzip) e com cabeçalhos de segurança (CSP, sem iframe de outros sites).
- A página [privacidade.html](privacidade.html) explica o que o jogo guarda e as regras de uso; ela fica linkada na tela inicial.

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
| `js/Social.js` | Chat e voz da sala (WebRTC de aparelho para aparelho, sinalização pelo Socket.io). |
| `js/Rede.js` | Cliente Socket.io com a mesma interface do `Game` (`visao`, `executar`, `assinar`). |
| `server/index.js` | Servidor HTTP + Socket.io. Serve só os arquivos do jogo, com limites contra abuso. |
| `server/Salas.js` | Salas por código, anfitrião, rodízio do dador, permissões e reconexão. |
| `js/Theme.js` | Skins de cor. |
| `style.css` | Visual estilo jogo de cartas retrô. |
| `privacidade.html` | Privacidade e termos de uso. |
| `favicon.svg`, `icone-180.png`, `previa.png` | Ícone da aba, ícone do celular e imagem da prévia do link (WhatsApp etc.). |
| `testes/` | Testes da lógica, das salas e do servidor. |

Os scripts são carregados como scripts comuns (sem `import`) para o jogo abrir direto do disco. O mesmo `Game.js` roda no navegador (modo local) e no servidor (modo online).

## Testes

```bash
npm install
npm test
```

Mais detalhes de produto e roadmap em [PROJETO.md](PROJETO.md).
