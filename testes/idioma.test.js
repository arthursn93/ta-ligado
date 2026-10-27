// Testes do botão de idioma (etapa F1). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Textos = require('../js/Textos.js');
const Idioma = require('../js/Idioma.js');

function janela(busca, salvo) {
  const guardado = new Map(salvo ? [[Idioma.CHAVE, salvo]] : []);
  return {
    location: { search: busca || '' },
    localStorage: { getItem: (k) => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, v) },
    document: { documentElement: { lang: 'pt-BR' } },
    guardado
  };
}

test('começa em português; o endereço vale se nada foi escolhido; a escolha salva vale sobre o endereço', () => {
  assert.equal(Idioma.inicial(janela('')), 'pt');
  assert.equal(Idioma.inicial(janela('?sala=ABCD&idioma=en')), 'en');
  assert.equal(Idioma.inicial(janela('?idioma=xx')), 'pt');
  assert.equal(Idioma.inicial(janela('?idioma=en', 'es')), 'es');
  assert.equal(Idioma.inicial(janela('', 'lixo')), 'pt');
});

test('sem armazenamento no aparelho, não quebra e usa o endereço', () => {
  const quebrado = { location: { search: '?idioma=es' }, get localStorage() { throw new Error('bloqueado'); } };
  assert.equal(Idioma.inicial(quebrado), 'es');
  try {
    assert.equal(Idioma.escolher('en', quebrado), true);
    assert.equal(Textos.idioma(), 'en');
  } finally {
    Textos.usar('pt');
  }
});

test('escolher troca a interface, salva e acerta o lang da página; idioma do endereço não é salvo', () => {
  const j = janela('?idioma=en');
  try {
    assert.equal(Idioma.aplicar(Idioma.inicial(j), j), true);
    assert.equal(j.guardado.size, 0);
    assert.equal(j.document.documentElement.lang, 'en-US');
    assert.equal(Idioma.escolher('es', j), true);
    assert.equal(j.guardado.get(Idioma.CHAVE), 'es');
    assert.equal(j.document.documentElement.lang, 'es');
    assert.equal(Textos.t('lobby.criar'), 'Crear una sala nueva');
    assert.equal(Idioma.escolher('xx', j), false);
    assert.equal(Textos.idioma(), 'es');
  } finally {
    Textos.usar('pt');
  }
});

test('o convite leva o idioma, menos o português', () => {
  try {
    assert.equal(Idioma.noEndereco(), '');
    Textos.usar('en');
    assert.equal(Idioma.noEndereco(), '&idioma=en');
  } finally {
    Textos.usar('pt');
  }
});

test('o botão marca o idioma atual e nomeia cada idioma nele mesmo', () => {
  try {
    Textos.usar('es');
    const html = Idioma.botao();
    assert.match(html, /aria-label="Idioma"/);
    assert.match(html, /data-idioma="es" lang="es" aria-label="Español" aria-pressed="true">ES</);
    assert.match(html, /data-idioma="en" lang="en" aria-label="English" aria-pressed="false">EN</);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  } finally {
    Textos.usar('pt');
  }
});
