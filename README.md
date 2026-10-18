# Tá Ligado?

Jogo cooperativo de associação de palavras para o navegador (celular ou computador).

A grade 5x5 tem uma palavra em cada coluna (A–E) e em cada linha (1–5). A cada rodada, o dador recebe uma coordenada secreta e dá **uma única palavra** como pista, ligando as duas palavras daquele cruzamento. O grupo tenta descobrir o quadrado certo. São 25 cartas por partida: vence quem posicionar todas sem erro.

## Como jogar

Abra o `index.html` no navegador (dois cliques, não precisa de servidor). Por enquanto a partida acontece num aparelho só, que vai passando de mão em mão.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `js/Game.js` | Regras e estado oficial da partida. Não sabe nada de tela; recebe ações (`NOVA_PARTIDA`, `DAR_PISTA`, `CHUTAR`). |
| `js/WordBank.js` | Pacotes de palavras e dicionário de sinônimos/traduções usado para barrar pistas redundantes. |
| `js/Util.js` | Funções puras: embaralhar, normalizar acentos, detectar palavras da mesma família. |
| `js/Hooks.js` | Eventos para extensões (`roundResolved`, `gameEnd`). |
| `js/UI.js` | Interface: grade, painel, fluxo de passar o aparelho. |
| `js/Theme.js` | Skins de cor. |
| `style.css` | Visual estilo jogo de cartas retrô. |
| `testes/` | Testes da lógica. |

Os scripts são carregados como scripts comuns (sem `import`) para o jogo abrir direto do disco. A lógica também roda no Node, pronta para o multiplayer com Node.js + Socket.io.

## Testes

```bash
node --test testes/*.test.js
```

Mais detalhes de produto e roadmap em [PROJETO.md](PROJETO.md).
