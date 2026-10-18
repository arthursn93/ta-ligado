/**
 * WordBank — pacotes de palavras e o que cada palavra "já significa".
 *
 * Cada pacote é { id, nome, palavras[], equivalentes{} }.
 *   palavras     → só palavras simples (sem hífen nem espaço); compostas são descartadas no registro.
 *   equivalentes → para cada palavra, sinônimos diretos, traduções e variações óbvias.
 *                  Uma pista igual a um equivalente não acrescenta nada e é recusada pelo Game.
 * Novos pacotes temáticos entram com `registrar`.
 */
var WordBank = (function () {
  'use strict';

  var UtilRef = typeof Util !== 'undefined' ? Util : require('./Util.js');

  var pacotes = {};

  function ehSimples(palavra) {
    return /^[\p{L}]+$/u.test(String(palavra).trim());
  }

  function registrar(pacote) {
    if (!pacote || !pacote.id || !Array.isArray(pacote.palavras)) {
      throw new Error('Pacote inválido: precisa de id e palavras[]');
    }
    // Remove repetidas (ignorando acento e caixa) e compostas.
    var vistas = {};
    var unicas = pacote.palavras.filter(function (p) {
      var chave = UtilRef.normalizar(p);
      if (!chave || vistas[chave] || !ehSimples(p)) return false;
      vistas[chave] = true;
      return true;
    });

    // Índice normalizado e simétrico: se "palhaço" lista "clown", "clown" também aponta para "palhaço".
    var indice = {};
    function ligar(a, b) {
      (indice[a] = indice[a] || {})[b] = true;
    }
    Object.keys(pacote.equivalentes || {}).forEach(function (palavra) {
      var p = UtilRef.normalizar(palavra);
      pacote.equivalentes[palavra].forEach(function (eq) {
        var e = UtilRef.normalizar(eq);
        ligar(p, e);
        ligar(e, p);
      });
    });

    pacotes[pacote.id] = { id: pacote.id, nome: pacote.nome || pacote.id, palavras: unicas, indice: indice };
    return pacotes[pacote.id];
  }

  function obter(id) {
    var pacote = pacotes[id];
    if (!pacote) throw new Error('Pacote de palavras não encontrado: ' + id);
    return pacote;
  }

  function listar() {
    return Object.keys(pacotes).map(function (id) {
      return { id: id, nome: pacotes[id].nome, total: pacotes[id].palavras.length };
    });
  }

  /** As duas palavras querem dizer a mesma coisa? (mesma família, sinônimo direto ou tradução) */
  function equivalentes(a, b, idPacote) {
    if (UtilRef.mesmaFamilia(a, b)) return true;
    var indice = obter(idPacote || 'classico').indice;
    var na = UtilRef.normalizar(a);
    var nb = UtilRef.normalizar(b);
    return !!((indice[na] && indice[na][nb]) || (indice[nb] && indice[nb][na]));
  }

  /**
   * Sorteia `quantidade` palavras distintas do pacote.
   * opcoes.evitar → palavras já usadas na sessão; só voltam se o pacote não tiver alternativas.
   * Nunca coloca na mesma grade duas palavras equivalentes entre si (ex.: "cão" e "cachorro").
   */
  function sortear(quantidade, idPacote, rng, opcoes) {
    var pacote = obter(idPacote || 'classico');
    var evitar = {};
    ((opcoes && opcoes.evitar) || []).forEach(function (p) { evitar[UtilRef.normalizar(p)] = true; });

    var embaralhadas = UtilRef.embaralhar(pacote.palavras, rng);
    var escolhidas = [];

    function tentar(lista) {
      for (var i = 0; i < lista.length && escolhidas.length < quantidade; i++) {
        var candidata = lista[i];
        if (escolhidas.indexOf(candidata) !== -1) continue;
        var conflita = escolhidas.some(function (e) { return equivalentes(e, candidata, pacote.id); });
        if (!conflita) escolhidas.push(candidata);
      }
    }

    // 1º: só palavras inéditas na sessão. 2º: se faltar, completa com as já usadas.
    tentar(embaralhadas.filter(function (p) { return !evitar[UtilRef.normalizar(p)]; }));
    tentar(embaralhadas);

    if (escolhidas.length < quantidade) {
      throw new Error('O pacote "' + pacote.id + '" não tem ' + quantidade + ' palavras independentes');
    }
    return escolhidas;
  }

  registrar({
    id: 'classico',
    nome: 'Clássico',
    palavras: [
      // Natureza
      'mar', 'montanha', 'floresta', 'deserto', 'rio', 'vulcão', 'ilha', 'chuva', 'neve', 'trovão',
      'sol', 'lua', 'estrela', 'nuvem', 'vento', 'areia', 'pedra', 'raiz', 'flor', 'folha',
      'gelo', 'fogo', 'cachoeira', 'caverna', 'cometa', 'lago', 'onda', 'neblina',
      // Animais
      'gato', 'cachorro', 'leão', 'baleia', 'coruja', 'cobra', 'abelha', 'formiga', 'tubarão', 'cavalo',
      'macaco', 'pinguim', 'aranha', 'borboleta', 'tartaruga', 'polvo', 'lobo', 'galo', 'elefante', 'morcego',
      // Casa e objetos
      'cadeira', 'janela', 'espelho', 'chave', 'relógio', 'vela', 'tesoura', 'livro', 'garrafa', 'travesseiro',
      'escada', 'porta', 'lâmpada', 'mochila', 'chapéu', 'agulha', 'martelo', 'balde', 'caixa', 'telefone',
      'ímã', 'corda', 'moeda', 'carta', 'mapa', 'bússola', 'lupa', 'sino',
      // Comida
      'pão', 'queijo', 'chocolate', 'café', 'pimenta', 'mel', 'limão', 'pipoca', 'sorvete', 'bolo',
      'sal', 'açúcar', 'ovo', 'banana', 'abacaxi', 'feijão', 'leite', 'uva',
      // Lugares
      'escola', 'hospital', 'praia', 'castelo', 'igreja', 'circo', 'museu', 'prisão', 'mercado', 'farol',
      'estádio', 'biblioteca', 'aeroporto', 'cemitério', 'teatro', 'fazenda', 'ponte', 'túnel',
      // Corpo
      'olho', 'coração', 'mão', 'osso', 'cabelo', 'dente', 'sangue', 'pulmão', 'joelho', 'sombra',
      // Pessoas e ofícios
      'rei', 'pirata', 'palhaço', 'médico', 'bruxa', 'astronauta', 'detetive', 'soldado', 'chef', 'bebê',
      'fantasma', 'robô', 'ninja', 'sereia', 'vampiro', 'professor',
      // Ideias e coisas abstratas
      'sonho', 'medo', 'segredo', 'festa', 'guerra', 'música', 'silêncio', 'tempo', 'sorte', 'memória',
      'dinheiro', 'amor', 'viagem', 'jogo', 'perigo', 'mentira',
      // Transporte e tecnologia
      'avião', 'trem', 'navio', 'bicicleta', 'foguete', 'carro', 'balão', 'satélite', 'computador', 'câmera',
      'bateria', 'antena', 'radar', 'motor', 'roda'
    ],
    // Sinônimos diretos, traduções (inglês) e variações óbvias. Não entram associações legítimas
    // (ex.: "palhaço" → "circo" é uma boa pista; "palhaço" → "clown" só traduz).
    equivalentes: {
      mar: ['oceano', 'sea', 'ocean'],
      montanha: ['monte', 'serra', 'morro', 'mountain'],
      floresta: ['mata', 'selva', 'bosque', 'forest', 'jungle'],
      deserto: ['desert'],
      rio: ['riacho', 'córrego', 'river'],
      vulcão: ['volcano'],
      ilha: ['ilhota', 'island'],
      chuva: ['chuvisco', 'garoa', 'aguaceiro', 'rain'],
      neve: ['nevasca', 'snow'],
      trovão: ['trovoada', 'thunder'],
      sol: ['solar', 'sun'],
      lua: ['luar', 'lunar', 'moon'],
      estrela: ['star'],
      nuvem: ['cloud'],
      vento: ['brisa', 'ventania', 'wind'],
      areia: ['sand'],
      pedra: ['rocha', 'pedregulho', 'rock', 'stone'],
      raiz: ['root'],
      flor: ['flower'],
      folha: ['folhagem', 'leaf'],
      gelo: ['ice'],
      fogo: ['chama', 'labareda', 'fogueira', 'fire'],
      cachoeira: ['cascata', 'catarata', 'waterfall'],
      caverna: ['gruta', 'cave'],
      cometa: ['comet'],
      lago: ['lagoa', 'lake'],
      onda: ['vaga', 'wave'],
      neblina: ['névoa', 'nevoeiro', 'cerração', 'bruma', 'fog'],
      gato: ['felino', 'bichano', 'gata', 'cat'],
      cachorro: ['cão', 'cadela', 'canino', 'dog'],
      leão: ['leoa', 'lion'],
      baleia: ['whale'],
      coruja: ['mocho', 'owl'],
      cobra: ['serpente', 'víbora', 'snake'],
      abelha: ['bee'],
      formiga: ['ant'],
      tubarão: ['shark'],
      cavalo: ['égua', 'potro', 'equino', 'horse'],
      macaco: ['símio', 'primata', 'monkey'],
      pinguim: ['penguin'],
      aranha: ['spider'],
      borboleta: ['butterfly'],
      tartaruga: ['jabuti', 'cágado', 'turtle'],
      polvo: ['octopus'],
      lobo: ['loba', 'wolf'],
      galo: ['galinha', 'rooster'],
      elefante: ['elephant'],
      morcego: ['bat'],
      cadeira: ['assento', 'chair'],
      janela: ['window'],
      espelho: ['mirror'],
      chave: ['key'],
      relógio: ['watch', 'clock'],
      vela: ['candle'],
      tesoura: ['scissors'],
      livro: ['book'],
      garrafa: ['bottle'],
      travesseiro: ['almofada', 'pillow'],
      escada: ['escadaria', 'degrau', 'stairs', 'ladder'],
      porta: ['portão', 'door'],
      lâmpada: ['luminária', 'lamp'],
      mochila: ['backpack'],
      chapéu: ['cartola', 'hat'],
      agulha: ['needle'],
      martelo: ['marreta', 'hammer'],
      balde: ['bucket'],
      caixa: ['caixote', 'box'],
      telefone: ['celular', 'fone', 'phone'],
      ímã: ['imã', 'magnet'],
      corda: ['cordão', 'barbante', 'rope'],
      moeda: ['coin'],
      carta: ['letter', 'card'],
      mapa: ['map'],
      bússola: ['compass'],
      lupa: ['magnifier'],
      sino: ['sineta', 'campainha', 'bell'],
      pão: ['bread'],
      queijo: ['cheese'],
      chocolate: ['cacau'],
      café: ['coffee'],
      pimenta: ['pepper'],
      mel: ['honey'],
      limão: ['lemon', 'lime'],
      pipoca: ['popcorn'],
      sorvete: ['picolé', 'gelato'],
      bolo: ['torta', 'cake'],
      sal: ['salt'],
      açúcar: ['sugar'],
      ovo: ['egg'],
      abacaxi: ['ananás', 'pineapple'],
      feijão: ['bean'],
      leite: ['milk'],
      uva: ['grape'],
      escola: ['colégio', 'school'],
      hospital: ['clínica'],
      praia: ['litoral', 'beach'],
      castelo: ['fortaleza', 'castle'],
      igreja: ['templo', 'capela', 'church'],
      circo: ['circus'],
      museu: ['museum'],
      prisão: ['cadeia', 'presídio', 'jail', 'prison'],
      mercado: ['feira', 'supermercado', 'market'],
      farol: ['lighthouse'],
      estádio: ['arena', 'stadium'],
      biblioteca: ['library'],
      aeroporto: ['airport'],
      cemitério: ['cemetery'],
      teatro: ['theater', 'theatre'],
      fazenda: ['sítio', 'rancho', 'farm'],
      ponte: ['bridge'],
      túnel: ['tunnel'],
      olho: ['ocular', 'eye'],
      coração: ['cardíaco', 'heart'],
      mão: ['manual', 'hand'],
      osso: ['ossada', 'bone'],
      cabelo: ['cabeleira', 'fio', 'hair'],
      dente: ['dental', 'tooth'],
      sangue: ['sanguíneo', 'blood'],
      pulmão: ['pulmonar', 'lung'],
      joelho: ['knee'],
      sombra: ['shadow'],
      rei: ['monarca', 'soberano', 'majestade', 'king'],
      pirata: ['corsário', 'bucaneiro', 'pirate'],
      palhaço: ['bufão', 'clown'],
      médico: ['doutor', 'doctor'],
      bruxa: ['bruxo', 'feiticeira', 'witch'],
      astronauta: ['cosmonauta', 'astronaut'],
      detetive: ['investigador', 'detective'],
      soldado: ['militar', 'soldier'],
      chef: ['cozinheiro', 'cozinheira', 'cook'],
      bebê: ['nenê', 'neném', 'baby'],
      fantasma: ['assombração', 'espectro', 'espírito', 'ghost'],
      robô: ['androide', 'robot'],
      ninja: ['shinobi'],
      sereia: ['mermaid'],
      vampiro: ['vampire'],
      professor: ['mestre', 'docente', 'teacher'],
      sonho: ['dream'],
      medo: ['pavor', 'temor', 'receio', 'fear'],
      segredo: ['secret'],
      festa: ['comemoração', 'celebração', 'party'],
      guerra: ['conflito', 'war'],
      música: ['canção', 'song', 'music'],
      silêncio: ['quietude', 'silence'],
      tempo: ['time'],
      sorte: ['fortuna', 'luck'],
      memória: ['lembrança', 'recordação', 'memory'],
      dinheiro: ['grana', 'money', 'cash'],
      amor: ['paixão', 'love'],
      viagem: ['jornada', 'travel', 'trip'],
      jogo: ['partida', 'game'],
      perigo: ['risco', 'ameaça', 'danger'],
      mentira: ['farsa', 'falsidade', 'lie'],
      avião: ['aeronave', 'jato', 'plane'],
      trem: ['comboio', 'train'],
      navio: ['barco', 'embarcação', 'ship'],
      bicicleta: ['bike'],
      foguete: ['rocket'],
      carro: ['automóvel', 'veículo', 'car'],
      balão: ['balloon'],
      satélite: ['satellite'],
      computador: ['notebook', 'computer'],
      câmera: ['camera'],
      bateria: ['pilha', 'battery'],
      antena: ['antenna'],
      motor: ['engine'],
      roda: ['wheel']
    }
  });

  return { registrar: registrar, obter: obter, listar: listar, sortear: sortear, equivalentes: equivalentes, ehSimples: ehSimples };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WordBank;
