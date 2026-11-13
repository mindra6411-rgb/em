/*
 * SiteSeller — storage.js
 * Módulo central de persistência. Tudo o que o sistema guarda passa por aqui.
 * Os dados ficam no LocalStorage deste navegador: não há servidor nem
 * sincronização entre dispositivos.
 */
(function (global) {
  'use strict';

  const SS = (global.SS = global.SS || {});

  const PREFIXO = 'siteseller:';
  const VERSAO_DADOS = 1;

  /* Categorias em lista (cada registro tem um id único). */
  const LISTAS = ['clientes', 'servicos', 'orcamentos', 'negociacoes', 'projetos', 'receitas', 'despesas', 'notificacoes'];
  /* Categorias em objeto único. "sistema" guarda o estado interno (primeiro uso, fila de contatos, sequências). */
  const OBJETOS = ['configuracoes', 'sistema'];
  const CATEGORIAS = OBJETOS.concat(LISTAS);

  const ROTULOS = {
    configuracoes: 'Configurações',
    sistema: 'Estado do sistema',
    clientes: 'Clientes',
    servicos: 'Serviços',
    orcamentos: 'Orçamentos',
    negociacoes: 'Negociações',
    projetos: 'Projetos',
    receitas: 'Receitas',
    despesas: 'Despesas',
    notificacoes: 'Notificações',
  };

  const PADROES = {
    configuracoes: {
      nomeAgencia: 'SiteSeller',
      descricao: 'Agência de desenvolvimento de sites.',
      iniciais: 'SS',
      logo: '',
      email: '',
      telefone: '',
      cidade: '',
      fundadaEm: '',
      margemMinima: 30,
      validadePropostaDias: 15,
      precoPaginaExtra: 120,
      tema: 'escuro',
    },
    sistema: {
      versao: VERSAO_DADOS,
      inicializado: false,
      modo: null, // 'demo' | 'vazio'
      leadsPendentes: [],
      leadsUsados: [],
      ultimaChegadaLead: null,
      sequencias: { orcamento: 0, projeto: 0 },
    },
  };

  const erros = [];
  const memoria = {}; // usado apenas se o LocalStorage estiver indisponível
  let persistente = true;

  try {
    const teste = PREFIXO + '__teste';
    global.localStorage.setItem(teste, '1');
    global.localStorage.removeItem(teste);
  } catch (erro) {
    persistente = false;
    erros.push('O armazenamento local está indisponível neste navegador. Os dados serão perdidos ao fechar a página.');
  }

  function clonar(valor) {
    return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
  }

  function ehLista(categoria) {
    return LISTAS.includes(categoria);
  }

  function exigirCategoria(categoria) {
    if (!CATEGORIAS.includes(categoria)) throw new Error('Categoria de dados desconhecida: ' + categoria);
  }

  function lerBruto(chave) {
    return persistente ? global.localStorage.getItem(chave) : (chave in memoria ? memoria[chave] : null);
  }

  function gravarBruto(chave, texto) {
    if (persistente) global.localStorage.setItem(chave, texto);
    else memoria[chave] = texto;
  }

  function removerBruto(chave) {
    if (persistente) global.localStorage.removeItem(chave);
    else delete memoria[chave];
  }

  function valorPadrao(categoria) {
    return ehLista(categoria) ? [] : clonar(PADROES[categoria]);
  }

  /** Lê uma categoria inteira. Nunca lança erro: dados ilegíveis são isolados e substituídos pelo padrão. */
  function ler(categoria) {
    exigirCategoria(categoria);
    const chave = PREFIXO + categoria;
    let texto = null;
    try {
      texto = lerBruto(chave);
      if (texto === null) return valorPadrao(categoria);
      const dados = JSON.parse(texto);
      if (ehLista(categoria)) {
        if (!Array.isArray(dados)) throw new Error('formato inesperado');
        return dados;
      }
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('formato inesperado');
      const padrao = PADROES[categoria];
      const resultado = Object.assign(clonar(padrao), dados);
      if (padrao.sequencias) resultado.sequencias = Object.assign({}, padrao.sequencias, dados.sequencias);
      return resultado;
    } catch (erro) {
      const aviso = 'Não foi possível ler "' + ROTULOS[categoria] + '". O conteúdo ilegível foi preservado em separado e a seção foi reiniciada.';
      if (!erros.includes(aviso)) erros.push(aviso);
      try {
        if (texto !== null) {
          gravarBruto(PREFIXO + 'corrompido:' + categoria, texto);
          removerBruto(chave);
        }
      } catch (falha) { /* sem espaço para preservar: segue com o padrão */ }
      return valorPadrao(categoria);
    }
  }

  /** Grava uma categoria inteira. Retorna false se o navegador recusar (ex.: armazenamento cheio). */
  function gravar(categoria, dados) {
    exigirCategoria(categoria);
    try {
      gravarBruto(PREFIXO + categoria, JSON.stringify(dados));
      return true;
    } catch (erro) {
      const aviso = 'Não foi possível salvar "' + ROTULOS[categoria] + '". O armazenamento do navegador pode estar cheio.';
      if (!erros.includes(aviso)) erros.push(aviso);
      global.dispatchEvent(new CustomEvent('ss:erro-armazenamento', { detail: aviso }));
      return false;
    }
  }

  /** Gera um identificador único, ex.: "cli-m3k2x9-4f7a1c". */
  function gerarId(prefixo) {
    let aleatorio = '';
    if (global.crypto && global.crypto.getRandomValues) {
      const bytes = new Uint8Array(4);
      global.crypto.getRandomValues(bytes);
      aleatorio = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      aleatorio = Math.random().toString(16).slice(2, 10);
    }
    return (prefixo || 'reg') + '-' + Date.now().toString(36) + '-' + aleatorio;
  }

  function buscar(categoria, id) {
    return ler(categoria).find((registro) => registro.id === id) || null;
  }

  function inserir(categoria, registro) {
    const lista = ler(categoria);
    lista.push(registro);
    return gravar(categoria, lista) ? registro : null;
  }

  /** Atualiza um registro com um objeto parcial ou com uma função (registro) => registro. */
  function atualizar(categoria, id, alteracao) {
    const lista = ler(categoria);
    const indice = lista.findIndex((registro) => registro.id === id);
    if (indice === -1) return null;
    const atual = lista[indice];
    lista[indice] = typeof alteracao === 'function' ? alteracao(atual) || atual : Object.assign({}, atual, alteracao);
    return gravar(categoria, lista) ? lista[indice] : null;
  }

  function remover(categoria, filtro) {
    const lista = ler(categoria);
    const teste = typeof filtro === 'function' ? filtro : (registro) => registro.id === filtro;
    const restante = lista.filter((registro) => !teste(registro));
    if (restante.length === lista.length) return 0;
    gravar(categoria, restante);
    return lista.length - restante.length;
  }

  /** Lê, altera e grava um objeto único (configurações ou sistema). */
  function alterarObjeto(categoria, alteracao) {
    const atual = ler(categoria);
    const novo = typeof alteracao === 'function' ? alteracao(atual) || atual : Object.assign(atual, alteracao);
    gravar(categoria, novo);
    return novo;
  }

  /** Próximo número de uma sequência legível (ORC-2026-0007, PRJ-0003...). */
  function proximaSequencia(nome) {
    let numero = 0;
    alterarObjeto('sistema', (sistema) => {
      sistema.sequencias[nome] = (sistema.sequencias[nome] || 0) + 1;
      numero = sistema.sequencias[nome];
      return sistema;
    });
    return numero;
  }

  /* ---------- Backup ---------- */

  function exportar() {
    const dados = {};
    CATEGORIAS.forEach((categoria) => { dados[categoria] = ler(categoria); });
    return { app: 'SiteSeller', versao: VERSAO_DADOS, exportadoEm: new Date().toISOString(), dados };
  }

  /**
   * Confere um backup antes de qualquer substituição.
   * Retorna { valido, erros, avisos, resumo } sem tocar nos dados atuais.
   */
  function validarBackup(backup) {
    const problemas = [];
    const avisos = [];
    const resumo = {};

    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
      return { valido: false, erros: ['O arquivo não contém um backup em formato JSON válido.'], avisos, resumo };
    }
    if (backup.app !== 'SiteSeller') problemas.push('O arquivo não foi gerado pelo SiteSeller.');
    if (typeof backup.versao !== 'number') problemas.push('O backup não informa a versão dos dados.');
    else if (backup.versao > VERSAO_DADOS) problemas.push('O backup foi criado por uma versão mais nova do SiteSeller.');
    if (!backup.dados || typeof backup.dados !== 'object') {
      problemas.push('O backup não possui a seção de dados.');
      return { valido: false, erros: problemas, avisos, resumo };
    }

    const dados = backup.dados;
    const config = dados.configuracoes;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      problemas.push('As configurações da agência estão ausentes ou inválidas.');
    } else {
      if (typeof config.nomeAgencia !== 'string' || !config.nomeAgencia.trim()) problemas.push('O nome da agência está ausente.');
      if (typeof config.margemMinima !== 'number' || config.margemMinima < 0 || config.margemMinima > 90) problemas.push('A margem mínima de negociação é inválida.');
    }
    if (dados.sistema !== undefined && (typeof dados.sistema !== 'object' || dados.sistema === null || Array.isArray(dados.sistema))) {
      problemas.push('O estado do sistema está em formato inválido.');
    }

    LISTAS.forEach((categoria) => {
      const lista = dados[categoria];
      if (lista === undefined) {
        avisos.push('"' + ROTULOS[categoria] + '" não está no backup e ficará vazio.');
        resumo[categoria] = 0;
        return;
      }
      if (!Array.isArray(lista)) {
        problemas.push('"' + ROTULOS[categoria] + '" deveria ser uma lista.');
        return;
      }
      const ids = new Set();
      const invalido = lista.some((registro) => {
        if (!registro || typeof registro !== 'object' || typeof registro.id !== 'string' || !registro.id) return true;
        if (ids.has(registro.id)) return true;
        ids.add(registro.id);
        return false;
      });
      if (invalido) problemas.push('"' + ROTULOS[categoria] + '" possui registros sem identificador ou com identificadores repetidos.');
      resumo[categoria] = lista.length;
    });

    if (!problemas.length) {
      const temId = (categoria, id) => (dados[categoria] || []).some((registro) => registro.id === id);
      const semValor = (lista, campo) => (lista || []).some((registro) => typeof registro[campo] !== 'number' || !isFinite(registro[campo]));
      if (semValor(dados.servicos, 'preco')) problemas.push('Há serviços sem preço numérico.');
      if (semValor(dados.receitas, 'valor') || semValor(dados.despesas, 'valor')) problemas.push('Há lançamentos financeiros sem valor numérico.');
      if ((dados.orcamentos || []).some((o) => !o.principal || typeof o.principal.preco !== 'number')) problemas.push('Há orçamentos sem serviço principal.');
      if ((dados.orcamentos || []).some((o) => !temId('clientes', o.clienteId))) problemas.push('Há orçamentos ligados a clientes que não existem no backup.');
      if ((dados.negociacoes || []).some((n) => !temId('orcamentos', n.orcamentoId))) problemas.push('Há negociações ligadas a orçamentos que não existem no backup.');
      if ((dados.projetos || []).some((p) => !temId('clientes', p.clienteId))) problemas.push('Há projetos ligados a clientes que não existem no backup.');
      if ((dados.receitas || []).some((r) => r.projetoId && !temId('projetos', r.projetoId))) avisos.push('Algumas receitas apontam para projetos que não estão no backup.');
    }

    return { valido: problemas.length === 0, erros: problemas, avisos, resumo };
  }

  /** Substitui todos os dados pelo backup. Revalida antes e desfaz em caso de falha de gravação. */
  function importar(backup) {
    const analise = validarBackup(backup);
    if (!analise.valido) return analise;
    const anterior = exportar();
    const aplicar = (origem) => CATEGORIAS.every((categoria) => {
      let valor = origem[categoria];
      if (valor === undefined) valor = valorPadrao(categoria);
      if (categoria === 'sistema') valor = Object.assign(clonar(PADROES.sistema), valor, { inicializado: true, versao: VERSAO_DADOS });
      if (categoria === 'configuracoes') valor = Object.assign(clonar(PADROES.configuracoes), valor);
      return gravar(categoria, valor);
    });
    if (!aplicar(backup.dados)) {
      aplicar(anterior.dados);
      analise.valido = false;
      analise.erros.push('O navegador não conseguiu gravar o backup. Os dados anteriores foram mantidos.');
    }
    return analise;
  }

  /** Apaga todos os dados do SiteSeller neste navegador. */
  function limparTudo() {
    CATEGORIAS.forEach((categoria) => removerBruto(PREFIXO + categoria));
  }

  /** Tamanho aproximado ocupado, em bytes. */
  function tamanhoOcupado() {
    return CATEGORIAS.reduce((total, categoria) => total + (lerBruto(PREFIXO + categoria) || '').length, 0);
  }

  SS.Storage = {
    VERSAO_DADOS, CATEGORIAS, LISTAS, ROTULOS, PADROES,
    ler, gravar, buscar, inserir, atualizar, remover, alterarObjeto,
    gerarId, proximaSequencia, exportar, validarBackup, importar, limparTudo, tamanhoOcupado,
    clonar,
    get persistente() { return persistente; },
    erros,
  };

  /* Aplica o tema salvo antes da primeira pintura para evitar o "piscar" entre temas. */
  if (global.document) {
    global.document.documentElement.dataset.tema = ler('configuracoes').tema === 'claro' ? 'claro' : 'escuro';
  }
})(window);
