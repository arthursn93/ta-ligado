// Testes dos arquivos de textos (etapas C e E). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Textos = require('../js/Textos.js');
const TextosPt = require('../js/TextosPt.js');
const Catalogo = require('../server/progressao/catalogo.js');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS = ['js', 'server', 'server/progressao'].flatMap((pasta) => fs.readdirSync(path.join(RAIZ, pasta))
  .filter((nome) => nome.endsWith('.js') && !/^Textos(Pt|En|Es)\.js$/.test(nome))
  .map((nome) => path.join(pasta, nome)));
// Nomes da progressão: a chave é montada com o id do catálogo ('item.' + id), então o teste confere pelo catálogo.
const DINAMICOS = {
  item: Catalogo.RECOMPENSAS.map((r) => [r.id, r.nome]),
  conquista: Catalogo.CONQUISTAS.map((c) => [c.id, c.nome]),
  conquistaTexto: Catalogo.CONQUISTAS.map((c) => [c.id, c.descricao])
};
const GRUPOS = [...new Set(Object.keys(TextosPt).map((chave) => chave.split('.')[0]))].filter((g) => !(g in DINAMICOS));
// Qualquer texto entre aspas no formato "grupo.nome" com um grupo do arquivo de textos é uma chave.
const PADRAO = new RegExp("'((?:" + GRUPOS.join('|') + ")\\.[A-Za-z0-9]+)'", 'g');

function chavesUsadas() {
  const usadas = new Map();
  for (const arquivo of ARQUIVOS) {
    const codigo = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    for (const [, chave] of codigo.matchAll(PADRAO)) usadas.set(chave, arquivo);
  }
  return usadas;
}

test('toda chave usada no código existe no arquivo de português', () => {
  const faltando = [...chavesUsadas()].filter(([chave]) => !(chave in TextosPt)).map(([chave, arquivo]) => arquivo + ': ' + chave);
  assert.deepEqual(faltando, []);
});

test('todo texto do arquivo de português é usado em algum lugar', () => {
  const usadas = chavesUsadas();
  const fixas = Object.keys(TextosPt).filter((chave) => !(chave.split('.')[0] in DINAMICOS));
  assert.deepEqual(fixas.filter((chave) => !usadas.has(chave)), []);
});

test('os nomes da progressão em português são os mesmos do catálogo do servidor', () => {
  for (const [grupo, lista] of Object.entries(DINAMICOS)) {
    const noArquivo = Object.keys(TextosPt).filter((chave) => chave.startsWith(grupo + '.')).map((chave) => [chave.slice(grupo.length + 1), TextosPt[chave]]);
    assert.deepEqual(noArquivo, lista, grupo);
  }
});

// Marcas {nome} e etiquetas HTML de um texto, em ordem alfabética.
function marcas(texto) {
  return [...texto.matchAll(/\{\w+\}|<\/?\w+[^>]*>/g)].map((m) => m[0]).sort();
}

for (const [idioma, arquivo] of [['inglês', 'TextosEn'], ['espanhol', 'TextosEs']]) {
  const tabela = require('../js/' + arquivo + '.js');
  test('o arquivo de ' + idioma + ' tem as mesmas chaves, marcas e etiquetas do português', () => {
    assert.deepEqual(Object.keys(tabela), Object.keys(TextosPt));
    const diferentes = Object.keys(TextosPt).filter((chave) => typeof tabela[chave] !== 'string' || !tabela[chave].trim() ||
      JSON.stringify(marcas(tabela[chave])) !== JSON.stringify(marcas(TextosPt[chave])));
    assert.deepEqual(diferentes, []);
  });
}

test('trocar de idioma muda os textos, e o que faltar sai em português', () => {
  try {
    assert.equal(Textos.usar('xx'), false);
    assert.equal(Textos.idioma(), 'pt');
    assert.equal(Textos.usar('en'), true);
    assert.equal(Textos.t('lobby.esperando', { nome: 'Ana' }), 'Waiting for Ana to start the game…');
    assert.equal(Textos.ou('item.titulo_nivel_5', 'reserva'), 'Clue Master');
    assert.equal(Textos.ou('item.novo_no_servidor', 'Nome do servidor'), 'Nome do servidor');
    Textos.tabelas.en['lobby.criar'] = undefined;
    delete Textos.tabelas.en['lobby.criar'];
    assert.equal(Textos.t('lobby.criar'), 'Criar uma sala nova');
    assert.equal(Textos.usar('es'), true);
    assert.equal(Textos.t('lobby.criar'), 'Crear una sala nueva');
  } finally {
    Textos.tabelas.en['lobby.criar'] = 'Create a new room';
    Textos.usar('pt');
  }
});

test('erros do servidor levam a mensagem em português e a chave, e o aparelho traduz', () => {
  const r = Textos.falha('servidor.mensagemLonga', { max: 200 });
  assert.deepEqual(r, { ok: false, erro: 'Mensagem longa demais (até 200 letras).', chave: 'servidor.mensagemLonga', valores: { max: 200 } });
  try {
    Textos.usar('es');
    assert.equal(Textos.traduzir(Object.assign({}, r)).erro, 'Mensaje demasiado largo (hasta 200 letras).');
    // Servidor mais antigo (sem chave) ou chave que o aparelho não conhece: fica a mensagem que veio.
    assert.equal(Textos.traduzir({ ok: false, erro: 'Texto velho' }).erro, 'Texto velho');
    assert.equal(Textos.traduzir({ ok: false, erro: 'Texto novo', chave: 'servidor.novo' }).erro, 'Texto novo');
    assert.deepEqual(Textos.traduzir({ ok: true }), { ok: true });
  } finally {
    Textos.usar('pt');
  }
});

test('nível e selo trazem o id do título, para o aparelho traduzir', () => {
  const Regras = require('../server/progressao/regras.js');
  const Perfil = require('../server/progressao/Perfil.js');
  assert.equal(Regras.nivel(0).tituloId, 'titulo_nivel_1');
  assert.equal(Regras.nivel(Regras.xpDoNivel(7)).tituloId, 'titulo_nivel_6');
  for (let n = 1; n <= Regras.NIVEL_MAXIMO; n++) {
    const nivel = Regras.nivel(Regras.xpDoNivel(n));
    assert.equal(Catalogo.recompensa(nivel.tituloId).nome, nivel.titulo);
  }
  assert.deepEqual(Perfil.selo(0, [], null), { nivel: 1, titulo: 'Novato', tituloId: 'titulo_nivel_1', moldura: 'moldura_nenhuma' });
});

test('t() troca os valores e devolve a própria chave quando ela não existe', () => {
  assert.equal(Textos.t('lobby.criar'), 'Criar uma sala nova');
  assert.equal(Textos.t('lobby.esperando', { nome: 'Ana' }), 'Esperando Ana começar a partida…');
  assert.equal(Textos.t('jogo.placarCarta', { rodada: 3, total: 25 }), 'Carta <b>3</b>/25');
  assert.equal(Textos.t('lobby.esperando', {}), 'Esperando {nome} começar a partida…');
  assert.equal(Textos.t('nao.existe'), 'nao.existe');
  // Um "$" no valor (nome de jogador) entra como está.
  assert.equal(Textos.t('lobby.esperando', { nome: '$& $1' }), 'Esperando $& $1 começar a partida…');
});

test('o servidor e as regras usam o mesmo arquivo de textos', () => {
  const Game = require('../js/Game.js');
  const jogo = Game.criar({ rng: () => 0.5 });
  assert.deepEqual(jogo.executar({ tipo: 'DAR_PISTA', pista: '' }), { ok: false, erro: TextosPt['pista.vazia'], chave: 'pista.vazia' });
  const { criarGerenciador } = require('../server/Salas.js');
  assert.equal(criarGerenciador().entrar('ZZZZ', 'token', 'Bia').erro, TextosPt['servidor.salaNaoEncontradaCodigo']);
});

test('a página carrega os textos antes de qualquer script que os usa', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const ordem = [...html.matchAll(/<script src="js\/(\w+)\.js">/g)].map((m) => m[1]);
  assert.deepEqual(ordem.slice(0, 4), ['TextosPt', 'TextosEn', 'TextosEs', 'Textos']);
});
