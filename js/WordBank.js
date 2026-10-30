/**
 * WordBank — pacotes de palavras e o que cada palavra "já significa".
 *
 * Cada pacote é { id, nome, idioma, palavras[], equivalentes{} }.
 *   idioma       → 'pt' (padrão), 'en' ou 'es': decide a regra de "mesma família" das pistas.
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

    pacotes[pacote.id] = {
      id: pacote.id, nome: pacote.nome || pacote.id, idioma: pacote.idioma || 'pt', palavras: unicas, indice: indice
    };
    return pacotes[pacote.id];
  }

  function obter(id) {
    var pacote = pacotes[id];
    if (!pacote) throw new Error('Pacote de palavras não encontrado: ' + id);
    return pacote;
  }

  function listar() {
    return Object.keys(pacotes).map(function (id) {
      return { id: id, nome: pacotes[id].nome, idioma: pacotes[id].idioma, total: pacotes[id].palavras.length };
    });
  }

  /** Idioma do pacote ('pt', 'en' ou 'es'). */
  function idioma(idPacote) {
    return obter(idPacote || 'classico').idioma;
  }

  /** As duas palavras querem dizer a mesma coisa? (mesma família, sinônimo direto ou tradução) */
  function equivalentes(a, b, idPacote) {
    var pacote = obter(idPacote || 'classico');
    if (UtilRef.mesmaFamilia(a, b, pacote.idioma)) return true;
    var indice = pacote.indice;
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

  // O Clássico em inglês e em espanhol: as mesmas 169 palavras, na mesma ordem.
  // Ainda não aparecem no jogo; a sala passa a escolher o idioma das palavras numa próxima etapa.
  // Equivalentes de cada palavra: os sinônimos no próprio idioma, a palavra em português e a do outro idioma.
  // [português, inglês, sinônimos em inglês, espanhol, sinônimos em espanhol]
  var TRADUCOES = [
    // Natureza
    ['mar', 'sea', ['ocean'], 'mar', ['océano']],
    ['montanha', 'mountain', ['mount', 'peak'], 'montaña', ['monte', 'cerro']],
    ['floresta', 'forest', ['woods', 'jungle'], 'bosque', ['selva', 'floresta']],
    ['deserto', 'desert', [], 'desierto', []],
    ['rio', 'river', ['stream', 'creek'], 'río', ['arroyo']],
    ['vulcão', 'volcano', [], 'volcán', []],
    ['ilha', 'island', ['isle'], 'isla', ['islote']],
    ['chuva', 'rain', ['drizzle', 'shower', 'downpour'], 'lluvia', ['llovizna', 'aguacero']],
    ['neve', 'snow', ['blizzard'], 'nieve', ['nevada', 'ventisca']],
    ['trovão', 'thunder', [], 'trueno', []],
    ['sol', 'sun', ['solar'], 'sol', ['solar']],
    ['lua', 'moon', ['lunar'], 'luna', ['lunar']],
    ['estrela', 'star', ['stellar'], 'estrella', ['astro']],
    ['nuvem', 'cloud', [], 'nube', []],
    ['vento', 'wind', ['breeze', 'gust'], 'viento', ['brisa', 'ventarrón']],
    ['areia', 'sand', [], 'arena', []],
    ['pedra', 'stone', ['rock', 'pebble'], 'piedra', ['roca', 'guijarro']],
    ['raiz', 'root', [], 'raíz', []],
    ['flor', 'flower', ['blossom', 'bloom'], 'flor', []],
    ['folha', 'leaf', ['foliage'], 'hoja', ['follaje']],
    ['gelo', 'ice', [], 'hielo', []],
    ['fogo', 'fire', ['flame', 'blaze', 'bonfire'], 'fuego', ['llama', 'hoguera', 'fogata']],
    ['cachoeira', 'waterfall', ['falls', 'cascade'], 'cascada', ['catarata']],
    ['caverna', 'cave', ['cavern', 'grotto'], 'cueva', ['caverna', 'gruta']],
    ['cometa', 'comet', [], 'cometa', []],
    ['lago', 'lake', ['pond', 'lagoon'], 'lago', ['laguna', 'estanque']],
    ['onda', 'wave', ['surf'], 'ola', ['oleaje']],
    ['neblina', 'fog', ['mist', 'haze'], 'niebla', ['bruma', 'neblina']],
    // Animais
    ['gato', 'cat', ['kitten', 'kitty', 'feline'], 'gato', ['gatito', 'felino', 'minino']],
    ['cachorro', 'dog', ['puppy', 'hound', 'canine'], 'perro', ['can', 'cachorro', 'canino']],
    ['leão', 'lion', ['lioness'], 'león', ['leona']],
    ['baleia', 'whale', [], 'ballena', []],
    ['coruja', 'owl', [], 'búho', ['lechuza']],
    ['cobra', 'snake', ['serpent', 'viper'], 'serpiente', ['culebra', 'víbora']],
    ['abelha', 'bee', [], 'abeja', []],
    ['formiga', 'ant', [], 'hormiga', []],
    ['tubarão', 'shark', [], 'tiburón', []],
    ['cavalo', 'horse', ['pony', 'stallion', 'mare'], 'caballo', ['yegua', 'potro', 'equino']],
    ['macaco', 'monkey', ['ape', 'primate'], 'mono', ['simio', 'primate', 'chango']],
    ['pinguim', 'penguin', [], 'pingüino', []],
    ['aranha', 'spider', [], 'araña', []],
    ['borboleta', 'butterfly', [], 'mariposa', []],
    ['tartaruga', 'turtle', ['tortoise'], 'tortuga', []],
    ['polvo', 'octopus', [], 'pulpo', []],
    ['lobo', 'wolf', [], 'lobo', ['loba']],
    ['galo', 'rooster', ['hen', 'chicken'], 'gallo', ['gallina']],
    ['elefante', 'elephant', [], 'elefante', []],
    ['morcego', 'bat', [], 'murciélago', []],
    // Casa e objetos
    ['cadeira', 'chair', ['seat', 'stool'], 'silla', ['asiento', 'taburete']],
    ['janela', 'window', [], 'ventana', []],
    ['espelho', 'mirror', [], 'espejo', []],
    ['chave', 'key', [], 'llave', []],
    ['relógio', 'clock', ['watch'], 'reloj', []],
    ['vela', 'candle', [], 'vela', []],
    ['tesoura', 'scissors', [], 'tijeras', ['tijera']],
    ['livro', 'book', [], 'libro', []],
    ['garrafa', 'bottle', [], 'botella', []],
    ['travesseiro', 'pillow', ['cushion'], 'almohada', ['cojín']],
    ['escada', 'ladder', ['stairs', 'staircase', 'step'], 'escalera', ['escalón', 'peldaño']],
    ['porta', 'door', ['gate'], 'puerta', ['portón']],
    ['lâmpada', 'lamp', ['bulb'], 'lámpara', ['bombilla', 'foco']],
    ['mochila', 'backpack', ['rucksack', 'knapsack'], 'mochila', []],
    ['chapéu', 'hat', ['cap'], 'sombrero', ['gorro', 'gorra']],
    ['agulha', 'needle', [], 'aguja', []],
    ['martelo', 'hammer', ['mallet'], 'martillo', ['mazo']],
    ['balde', 'bucket', ['pail'], 'balde', ['cubo', 'cubeta']],
    ['caixa', 'box', ['crate', 'carton'], 'caja', ['cajón']],
    ['telefone', 'phone', ['telephone', 'cellphone', 'mobile'], 'teléfono', ['celular', 'móvil']],
    ['ímã', 'magnet', ['magnetic'], 'imán', ['magnético']],
    ['corda', 'rope', ['cord', 'string'], 'cuerda', ['soga', 'cordón']],
    ['moeda', 'coin', [], 'moneda', []],
    ['carta', 'letter', [], 'carta', []],
    ['mapa', 'map', [], 'mapa', []],
    ['bússola', 'compass', [], 'brújula', []],
    ['lupa', 'magnifier', [], 'lupa', []],
    ['sino', 'bell', [], 'campana', ['campanilla', 'cascabel']],
    // Comida
    ['pão', 'bread', ['loaf'], 'pan', ['bollo']],
    ['queijo', 'cheese', [], 'queso', []],
    ['chocolate', 'chocolate', ['cocoa', 'cacao'], 'chocolate', ['cacao']],
    ['café', 'coffee', ['espresso'], 'café', []],
    ['pimenta', 'pepper', ['chili'], 'pimienta', ['chile', 'ají']],
    ['mel', 'honey', [], 'miel', []],
    ['limão', 'lemon', ['lime'], 'limón', ['lima']],
    ['pipoca', 'popcorn', [], 'palomitas', ['pochoclo', 'cotufas']],
    ['sorvete', 'popsicle', ['gelato'], 'helado', ['paleta', 'polo']],
    ['bolo', 'cake', ['pie'], 'pastel', ['tarta', 'torta', 'bizcocho']],
    ['sal', 'salt', ['salty'], 'sal', ['salado']],
    ['açúcar', 'sugar', [], 'azúcar', []],
    ['ovo', 'egg', [], 'huevo', []],
    ['banana', 'banana', [], 'plátano', ['banana']],
    ['abacaxi', 'pineapple', [], 'piña', ['ananá']],
    ['feijão', 'bean', [], 'frijol', ['judía', 'poroto', 'habichuela']],
    ['leite', 'milk', [], 'leche', []],
    ['uva', 'grape', [], 'uva', []],
    // Lugares
    ['escola', 'school', ['college'], 'escuela', ['colegio']],
    ['hospital', 'hospital', ['clinic'], 'hospital', ['clínica']],
    ['praia', 'beach', ['shore', 'coast', 'seaside'], 'playa', ['costa', 'litoral']],
    ['castelo', 'castle', ['fortress', 'fort'], 'castillo', ['fortaleza']],
    ['igreja', 'church', ['chapel', 'temple'], 'iglesia', ['capilla', 'templo']],
    ['circo', 'circus', [], 'circo', []],
    ['museu', 'museum', [], 'museo', []],
    ['prisão', 'prison', ['jail'], 'cárcel', ['prisión', 'presidio']],
    ['mercado', 'market', ['supermarket'], 'mercado', ['supermercado', 'feria']],
    ['farol', 'lighthouse', [], 'faro', []],
    ['estádio', 'stadium', ['arena'], 'estadio', []],
    ['biblioteca', 'library', [], 'biblioteca', []],
    ['aeroporto', 'airport', [], 'aeropuerto', []],
    ['cemitério', 'cemetery', ['graveyard'], 'cementerio', ['camposanto']],
    ['teatro', 'theater', ['theatre'], 'teatro', []],
    ['fazenda', 'farm', ['ranch'], 'granja', ['finca', 'rancho', 'hacienda']],
    ['ponte', 'bridge', [], 'puente', []],
    ['túnel', 'tunnel', [], 'túnel', []],
    // Corpo
    ['olho', 'eye', ['ocular'], 'ojo', ['ocular']],
    ['coração', 'heart', ['cardiac'], 'corazón', ['cardíaco']],
    ['mão', 'hand', ['manual'], 'mano', ['manual']],
    ['osso', 'bone', [], 'hueso', []],
    ['cabelo', 'hair', [], 'cabello', ['pelo', 'melena']],
    ['dente', 'tooth', ['teeth', 'dental'], 'diente', ['dental']],
    ['sangue', 'blood', [], 'sangre', ['sanguíneo']],
    ['pulmão', 'lung', [], 'pulmón', ['pulmonar']],
    ['joelho', 'knee', [], 'rodilla', []],
    ['sombra', 'shadow', ['shade'], 'sombra', []],
    // Pessoas e ofícios
    ['rei', 'king', ['monarch', 'ruler', 'majesty'], 'rey', ['monarca', 'soberano', 'majestad']],
    ['pirata', 'pirate', ['buccaneer', 'corsair'], 'pirata', ['corsario', 'bucanero']],
    ['palhaço', 'clown', ['jester'], 'payaso', ['bufón']],
    ['médico', 'doctor', ['physician', 'medic'], 'médico', ['doctor']],
    ['bruxa', 'witch', ['wizard', 'sorcerer', 'sorceress'], 'bruja', ['brujo', 'hechicera']],
    ['astronauta', 'astronaut', ['cosmonaut', 'spaceman'], 'astronauta', ['cosmonauta']],
    ['detetive', 'detective', ['investigator', 'sleuth'], 'detective', ['investigador']],
    ['soldado', 'soldier', ['trooper'], 'soldado', ['militar']],
    ['chef', 'chef', ['cook'], 'chef', ['cocinero', 'cocinera']],
    ['bebê', 'baby', ['infant', 'newborn'], 'bebé', ['nene']],
    ['fantasma', 'ghost', ['spirit', 'phantom', 'spook'], 'fantasma', ['espíritu', 'espectro', 'aparición']],
    ['robô', 'robot', ['android', 'droid'], 'robot', ['androide']],
    ['ninja', 'ninja', ['shinobi'], 'ninja', ['shinobi']],
    ['sereia', 'mermaid', ['siren'], 'sirena', []],
    ['vampiro', 'vampire', [], 'vampiro', []],
    ['professor', 'teacher', ['professor', 'tutor'], 'profesor', ['maestro', 'docente']],
    // Ideias e coisas abstratas
    ['sonho', 'dream', [], 'sueño', []],
    ['medo', 'fear', ['fright', 'dread', 'terror'], 'miedo', ['temor', 'pavor', 'terror']],
    ['segredo', 'secret', [], 'secreto', []],
    ['festa', 'party', ['celebration', 'feast'], 'fiesta', ['celebración', 'festejo']],
    ['guerra', 'war', ['warfare'], 'guerra', ['conflicto']],
    ['música', 'music', ['song', 'tune'], 'música', ['canción']],
    ['silêncio', 'silence', ['quiet', 'hush'], 'silencio', ['quietud']],
    ['tempo', 'time', [], 'tiempo', []],
    ['sorte', 'luck', ['fortune'], 'suerte', ['fortuna']],
    ['memória', 'memory', ['remembrance'], 'memoria', ['recuerdo']],
    ['dinheiro', 'money', ['cash'], 'dinero', ['plata', 'efectivo']],
    ['amor', 'love', ['passion'], 'amor', ['pasión', 'cariño']],
    ['viagem', 'trip', ['journey', 'travel', 'voyage'], 'viaje', ['travesía']],
    ['jogo', 'game', ['match'], 'juego', ['partida']],
    ['perigo', 'danger', ['risk', 'threat', 'peril'], 'peligro', ['riesgo', 'amenaza']],
    ['mentira', 'lie', ['falsehood', 'fib'], 'mentira', ['engaño', 'falsedad']],
    // Transporte e tecnologia
    ['avião', 'plane', ['airplane', 'aircraft', 'jet'], 'avión', ['aeronave', 'jet']],
    ['trem', 'train', ['locomotive'], 'tren', ['locomotora']],
    ['navio', 'ship', ['boat', 'vessel'], 'barco', ['buque', 'navío', 'nave']],
    ['bicicleta', 'bicycle', ['bike', 'cycle'], 'bicicleta', ['bici']],
    ['foguete', 'rocket', [], 'cohete', []],
    ['carro', 'car', ['automobile', 'auto', 'vehicle'], 'coche', ['carro', 'auto', 'automóvil', 'vehículo']],
    ['balão', 'balloon', [], 'globo', []],
    ['satélite', 'satellite', [], 'satélite', []],
    ['computador', 'computer', ['laptop', 'pc'], 'computadora', ['ordenador', 'computador', 'portátil']],
    ['câmera', 'camera', [], 'cámara', []],
    ['bateria', 'battery', [], 'batería', ['pila']],
    ['antena', 'antenna', ['aerial'], 'antena', []],
    ['radar', 'radar', [], 'radar', []],
    ['motor', 'engine', ['motor'], 'motor', []],
    ['roda', 'wheel', [], 'rueda', []]
  ];

  function classicoEm(idioma, nome) {
    var col = idioma === 'en' ? 1 : 3;
    var outra = idioma === 'en' ? 3 : 1;
    var equivalentes = {};
    TRADUCOES.forEach(function (linha) {
      equivalentes[linha[col]] = linha[col + 1].concat([linha[0], linha[outra]]);
    });
    registrar({
      id: 'classico-' + idioma,
      nome: nome,
      idioma: idioma,
      palavras: TRADUCOES.map(function (linha) { return linha[col]; }),
      equivalentes: equivalentes
    });
  }
  classicoEm('en', 'Classic');
  classicoEm('es', 'Clásico');

  /** Baralho da grade para cada idioma: o clássico em português, inglês ou espanhol. */
  function pacoteDoIdioma(idioma) {
    return idioma === 'en' || idioma === 'es' ? 'classico-' + idioma : 'classico';
  }

  return {
    registrar: registrar, obter: obter, listar: listar, idioma: idioma, sortear: sortear, pacoteDoIdioma: pacoteDoIdioma,
    equivalentes: equivalentes, ehSimples: ehSimples, TRADUCOES: TRADUCOES
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WordBank;
