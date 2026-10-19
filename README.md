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
- No fim da partida, o placar mostra o XP que cada um ganhou, as conquistas novas e a barra do nível. O botão **Meu perfil** (na tela inicial, na sala e no fim da partida) mostra estatísticas, conquistas, itens e as últimas partidas, e é onde se escolhe título, moldura e cor do tabuleiro. Isso precisa do banco de dados (veja abaixo).

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
- Quando o Render vai desligar a versão antiga (sinal `SIGTERM`), o servidor avisa na hora os aparelhos conectados: "O jogo está sendo atualizado. Esta sala vai fechar em instantes." Espera no máximo 1 segundo pelas confirmações e desliga; quem não recebeu vê "Reconectando…", como antes. Partidas em andamento não são gravadas, e as que já terminaram acabam de ser gravadas antes de desligar.
- Enquanto o servidor acorda, a tela mostra "Conectando ao servidor…". Se depois de 1 minuto não der, aparece a opção de tentar de novo ou jogar num aparelho só.

### Logs

O servidor escreve uma linha JSON por acontecimento, para ler em **Logs** no Render. Dá para buscar pelo nome do evento (por exemplo `erro_` ou `limites_atingidos`). O código fica em `server/log.js`.

| Evento | Quando aparece | O que traz |
| --- | --- | --- |
| `servidor_iniciado` | O servidor ligou | Porta e se a progressão (banco) está ligada |
| `sala_criada` | Alguém criou uma sala | Quantas salas existem agora |
| `partida_iniciada` / `partida_encerrada` | Início e fim de uma partida | Jogadores conectados; no fim, se foi concluída ou interrompida e quantas cartas foram jogadas |
| `limites_atingidos` | No máximo uma vez por minuto, só se algum bloqueio contra abuso aconteceu | Quantas vezes cada proteção recusou algo no minuto: `criar` (salas demais), `entrar` (códigos errados demais), `perfil` (pedidos demais), `chat` (mensagens rápidas demais), `conexoes` (conexões demais do mesmo IP), `origem` (conexão vinda de outro site) |
| `encerramento_recebido` / `aviso_reinicio` / `encerramento_concluido` | O Render mandou o servidor desligar | Salas, jogadores e partidas em andamento; quantos aparelhos receberam o aviso; quanto tempo levou |
| `erro_…` (`"nivel":"erro"`) | Algo deu errado e o jogo seguiu | Mensagem e as primeiras linhas de onde aconteceu |
| `erro_fatal` | Um erro não tratado derrubou o servidor | O mesmo; o processo sai com código 1 e o Render o liga de novo, como antes |

O que nunca entra nos logs: nomes de jogadores, códigos de sala, mensagens do chat, tokens, IPs, senhas e endereços com credenciais. Nas mensagens de erro, endereços (como uma URL de banco) viram `[endereço]` e IPs viram `[ip]`. Os bloqueios são somados por minuto para um ataque não encher os logs; o Render descarta o que passar de 6.000 linhas por minuto ([documentação](https://render.com/docs/logging)).

Por quanto tempo o Render guarda os logs depende do plano do **workspace**, não do serviço: 7 dias no Hobby, 14 no Pro e 30 no Scale/Enterprise, segundo a [documentação do Render](https://render.com/docs/logging) (consultada em outubro de 2026). Este projeto usa a instância **Free**, num workspace **Hobby** (o único plano de workspace de $0, segundo os [preços do Render](https://render.com/pricing)): os logs ficam **7 dias**. Se o workspace mudar de plano, o prazo muda junto. Logs mais antigos que isso não ficam disponíveis.

### Proteções do servidor

- Cada endereço de IP pode ter até 60 conexões ao mesmo tempo, criar até 10 salas por minuto e errar o código da sala até 10 vezes por minuto (os números ficam em `LIMITES`, no `server/index.js`).
- Só páginas do próprio site conectam no servidor. Para liberar outro endereço (por exemplo, um app de celular no futuro), defina `ORIGENS_PERMITIDAS` com os endereços separados por vírgula.
- Um erro inesperado num evento é registrado no log e respondido com "Algo deu errado", sem derrubar as outras salas.
- As páginas saem comprimidas (gzip) e com cabeçalhos de segurança (CSP, sem iframe de outros sites).
- A página [privacidade.html](privacidade.html) explica o que o jogo guarda e as regras de uso; ela fica linkada na tela inicial.

### Histórico das partidas (banco de dados)

O servidor guarda o resultado de cada partida online para montar as estatísticas e o histórico de cada jogador. Para isso ele precisa de um PostgreSQL. Sem banco, o jogo funciona normalmente, só sem histórico.

1. Crie um banco PostgreSQL. O [Neon](https://neon.tech) tem plano gratuito que não expira (o Postgres gratuito do Render expira em 30 dias).
2. Copie a URL de conexão (começa com `postgresql://` e termina com `?sslmode=require`).
3. No Render, abra o serviço, vá em **Environment** e crie a variável `DATABASE_URL` com essa URL. O Render reinicia o serviço sozinho.
4. Na subida o servidor cria as tabelas sozinho e escreve `Migração aplicada` no log.

A senha fica só nessa variável, nunca no repositório. Cada aparelho é identificado pelo código aleatório que o navegador já guarda; o banco recebe só uma versão embaralhada (hash) dele. Por isso o histórico fica preso ao navegador: outro aparelho, aba anônima ou limpar os dados do site começam do zero.

Se o banco estiver fora do ar quando uma partida acaba, o servidor tenta gravar de novo duas vezes e segue o jogo normalmente. A mesma partida nunca é gravada duas vezes.

### Backup do banco

Todo dia às 03:00 de Brasília, o workflow **Backup do banco** (GitHub Actions) copia o banco do Neon com um usuário só de leitura, criptografa a cópia, restaura num PostgreSQL temporário para conferir tabelas, linhas e conteúdo, e guarda só o arquivo criptografado por 30 dias. Se algo falhar, uma issue **Backup do banco falhou** é aberta e fecha sozinha quando um backup seguinte der certo. Configuração, avisos e como restaurar: [docs/backup.md](docs/backup.md).

### XP e níveis

O servidor calcula o XP de cada pessoa quando a partida termina; o aparelho só mostra. Os números ficam em `server/progressao/regras.js`.

| O que rende XP | XP |
| --- | ---: |
| Concluir uma partida válida | 30 |
| Cada acerto da turma enquanto você estava na partida | 2 (até 50) |
| Cada pista sua que levou a acerto | 5 |
| Turma com 20 acertos ou mais | 20 |

- Partida válida: chegou às 25 cartas, com pelo menos 2 pessoas, e você estava na sala no fim e participou (deu pista ou acompanhou pelo menos metade das cartas). Partida interrompida não rende XP.
- Erro não tira XP, e o XP nunca diminui.
- Depois de 10 partidas válidas em 24 horas, as seguintes rendem só os 30 da participação.
- XP para chegar ao nível n = 50 × n × (n − 1): nível 2 com 100, 3 com 300, 4 com 600, 5 com 1.000, 10 com 4.500.

### Conquistas e recompensas

As conquistas (14, em `server/progressao/catalogo.js`) desbloqueiam uma vez só, rendem 15 XP cada e só contam em partida válida. Exemplos: Primeira ligação (uma pista sua levou a acerto), Sintonia (turma com 80% ou mais), Mão certeira (todas as suas pistas da partida acertadas, pelo menos 3), Tabuleiro perfeito (25 acertos sem erro).

As recompensas são só visuais: títulos, molduras do nome e cores do tabuleiro, liberados por nível ou por conquista. Nenhuma muda pista, tempo ou o que cada um vê do tabuleiro. Quem escolhe um item é o aparelho, mas o servidor confere se ele está liberado antes de salvar.

### Variáveis de ambiente

Nenhuma é obrigatória. Todas ficam em **Environment** no painel do Render, nunca no repositório.

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | PostgreSQL do histórico, XP, conquistas e perfil. Sem ela o jogo funciona, mas sem progressão. |
| `ORIGENS_PERMITIDAS` | Outros endereços que podem conectar no servidor, separados por vírgula. |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Servidor TURN para a voz em redes fechadas. |
| `PORT` | Porta do servidor. O Render define sozinho; em casa o padrão é 3000. |

### Num aparelho só

Abra o `index.html` direto no navegador (dois cliques, sem servidor) e o aparelho vai passando de mão em mão. Com o servidor rodando, essa opção também aparece na tela inicial: **Jogar num aparelho só**. Partidas num aparelho só não rendem XP nem entram no histórico.

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
| `js/Progresso.js` | XP no placar final, selo de nível ao lado do nome e a tela **Meu perfil**. Só mostra o que o servidor manda. |
| `js/Rede.js` | Cliente Socket.io com a mesma interface do `Game` (`visao`, `executar`, `assinar`). |
| `server/index.js` | Servidor HTTP + Socket.io. Serve só os arquivos do jogo, com limites contra abuso. |
| `server/Salas.js` | Salas por código, anfitrião, rodízio do dador, permissões e reconexão. |
| `server/log.js` | Logs em JSON, uma linha por evento, sem dados pessoais. |
| `server/progressao/Partida.js` | Estatísticas de cada partida online (acertos, erros, sequência, pistas de cada dador), contadas no servidor. |
| `server/progressao/Banco.js` | Grava as partidas no PostgreSQL e lê o perfil de cada aparelho. Aplica as migrações de `server/progressao/migracoes/` na subida. |
| `server/progressao/Memoria.js` | O mesmo que o `Banco.js`, só em memória (testes e jogo em casa). |
| `server/progressao/catalogo.js` | Catálogo de conquistas e recompensas visuais, com os critérios de cada uma. |
| `server/progressao/regras.js` | Regras de XP e níveis: todos os números de balanceamento ficam aqui. |
| `server/progressao/Perfil.js` | Monta estatísticas gerais, recordes e histórico a partir das partidas gravadas. |
| `js/Theme.js` | Skins de cor. |
| `style.css` | Visual estilo jogo de cartas retrô. |
| `privacidade.html` | Privacidade e termos de uso. |
| `favicon.svg`, `icone-180.png`, `previa.png` | Ícone da aba, ícone do celular e imagem da prévia do link (WhatsApp etc.). |
| `testes/` | Testes da lógica, das salas e do servidor. |
| `scripts/backup-*`, `docs/backup.md` | Backup diário do banco: cópia, criptografia, restauração de teste e o usuário só de leitura do Neon. |

Os scripts são carregados como scripts comuns (sem `import`) para o jogo abrir direto do disco. O mesmo `Game.js` roda no navegador (modo local) e no servidor (modo online).

## Testes

```bash
npm install
npm test
```

Os testes do banco rodam também num PostgreSQL de verdade quando `TEST_DATABASE_URL` está definida. Use um banco só para isso, porque as tabelas são apagadas:

```bash
TEST_DATABASE_URL=postgres://usuario:senha@localhost/ta_ligado_teste npm test
```

### Testes automáticos

O GitHub Actions (`.github/workflows/testes.yml`) roda todos os testes em cada Pull Request para o `main` e em cada commit que entra no `main`, com Node 22 e um PostgreSQL 18 temporário criado só para a execução. Nenhuma credencial é usada: o banco de produção nunca é acessado. A verificação `testes` só fica verde se nenhum teste falhar, for ignorado ou ficar pendente, e se os testes de PostgreSQL real tiverem rodado.

Mais detalhes de produto e roadmap em [PROJETO.md](PROJETO.md).
