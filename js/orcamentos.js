/*
 * SiteSeller — orcamentos.js
 * Propostas comerciais: cálculo, ciclo de vida (rascunho → aprovado), lista e assistente de criação.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const STATUS = {
    rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
    aguardando: { rotulo: 'Aguardando envio', tom: 'champanhe' },
    enviado: { rotulo: 'Enviado', tom: 'claro' },
    negociacao: { rotulo: 'Em negociação', tom: 'rosa' },
    aprovado: { rotulo: 'Aprovado', tom: 'ouro' },
    recusado: { rotulo: 'Recusado', tom: 'vinho' },
    expirado: { rotulo: 'Expirado', tom: 'apagado' },
  };

  const COMPLEXIDADES = {
    baixa: { rotulo: 'Simples', acrescimo: 0, fatorPrazo: 1, descricao: 'Layout direto a partir de uma estrutura conhecida, com a identidade do cliente aplicada.' },
    media: { rotulo: 'Intermediária', acrescimo: 0.2, fatorPrazo: 1.25, descricao: 'Layout desenhado para o projeto, com seções sob medida e refinamento visual.' },
    alta: { rotulo: 'Avançada', acrescimo: 0.45, fatorPrazo: 1.6, descricao: 'Direção de arte exclusiva, interações elaboradas e regras de negócio específicas.' },
  };

  const PAGAMENTOS = {
    avista: { rotulo: 'À vista na aprovação', parcelas: [{ pct: 100, quando: 'aprovacao' }] },
    entrada: { rotulo: '50% na aprovação e 50% na entrega', parcelas: [{ pct: 50, quando: 'aprovacao' }, { pct: 50, quando: 'entrega' }] },
    tres: { rotulo: '40% na aprovação, 30% em 30 dias e 30% na entrega', parcelas: [{ pct: 40, quando: 'aprovacao' }, { pct: 30, quando: 'dias', dias: 30 }, { pct: 30, quando: 'entrega' }] },
    quatro: { rotulo: '4 parcelas mensais de 25%', parcelas: [{ pct: 25, quando: 'aprovacao' }, { pct: 25, quando: 'dias', dias: 30 }, { pct: 25, quando: 'dias', dias: 60 }, { pct: 25, quando: 'dias', dias: 90 }] },
  };

  /* Custo estimado de itens sem custo cadastrado (páginas extras, itens personalizados, horas de urgência). */
  const CUSTO_PADRAO = 0.55;

  const EDITAVEIS = ['rascunho', 'aguardando'];
  const ABERTOS = ['aguardando', 'enviado', 'negociacao'];

  const listar = () => Storage.ler('orcamentos');
  const buscar = (id) => Storage.buscar('orcamentos', id);

  /* ---------- Itens ---------- */

  function copiarPrincipal(servico) {
    return { servicoId: servico.id, nome: servico.nome, descricao: servico.descricao, preco: servico.preco, custo: servico.custo, paginasIncluidas: servico.paginasIncluidas, prazoBaseDias: servico.prazoBaseDias };
  }

  function copiarAdicional(servico) {
    return { servicoId: servico.id, nome: servico.nome, descricao: servico.descricao, preco: servico.preco, custo: servico.custo, categoria: servico.categoria };
  }

  function novo(clienteId) {
    const config = Storage.ler('configuracoes');
    return {
      id: null, codigo: null, clienteId: clienteId || '', status: 'rascunho',
      principal: null, adicionais: [], personalizados: [],
      paginas: null, complexidade: 'baixa', prazoDias: null,
      descontoTipo: 'percentual', descontoValor: 0, pagamento: 'entrada', observacoes: '',
      precoPaginaExtra: config.precoPaginaExtra,
    };
  }

  function definirPrincipal(orcamento, servicoId) {
    const servico = SS.Servicos.buscar(servicoId);
    if (!servico) return;
    orcamento.principal = copiarPrincipal(servico);
    orcamento.paginas = servico.paginasIncluidas;
    orcamento.prazoDias = null; // volta a acompanhar o prazo sugerido
  }

  function alternarAdicional(orcamento, servicoId, incluir) {
    const presente = orcamento.adicionais.some((a) => a.servicoId === servicoId);
    if (incluir && !presente) {
      const servico = SS.Servicos.buscar(servicoId);
      if (servico) orcamento.adicionais.push(copiarAdicional(servico));
    }
    if (!incluir && presente) orcamento.adicionais = orcamento.adicionais.filter((a) => a.servicoId !== servicoId);
  }

  /* ---------- Cálculo ---------- */

  /**
   * Serviço principal + adicionais + personalizações − desconto = valor final.
   * Personalizações: páginas extras, nível de complexidade, taxa de urgência e itens avulsos.
   */
  function calcular(o) {
    const vazio = { linhas: [], valorPrincipal: 0, valorAdicionais: 0, valorPersonalizacoes: 0, subtotal: 0, desconto: 0, descontoPercentual: 0, total: 0, custo: 0, lucro: 0, margem: 0, prazoSugerido: 0, prazoMinimo: 0, prazo: 0, paginasExtras: 0, taxaUrgencia: 0 };
    const p = o.principal;
    if (!p) return vazio;

    const comp = COMPLEXIDADES[o.complexidade] || COMPLEXIDADES.baixa;
    const paginas = o.paginas || p.paginasIncluidas;
    const paginasExtras = Math.max(0, paginas - p.paginasIncluidas);
    const precoPagina = typeof o.precoPaginaExtra === 'number' ? o.precoPaginaExtra : Storage.ler('configuracoes').precoPaginaExtra;

    const valorPaginas = paginasExtras * precoPagina;
    const valorComplexidade = util.arredondar(p.preco * comp.acrescimo);
    const base = p.preco + valorPaginas + valorComplexidade;
    const valorAdicionais = util.somar(o.adicionais, (a) => a.preco);
    const valorAvulsos = util.somar(o.personalizados, (i) => i.preco);

    const prazoSugerido = Math.ceil(p.prazoBaseDias * comp.fatorPrazo + paginasExtras * 0.5 + o.adicionais.length);
    const prazoMinimo = Math.max(2, Math.ceil(prazoSugerido * 0.5));
    const prazo = o.prazoDias || prazoSugerido;
    const folga = prazo / prazoSugerido;
    const taxa = folga < 0.7 ? 0.2 : folga < 0.85 ? 0.1 : 0;
    const taxaUrgencia = util.arredondar(base * taxa);

    const linhas = [{ tipo: 'principal', rotulo: p.nome, descricao: p.descricao + ' Inclui ' + util.plural(p.paginasIncluidas, 'página', 'páginas') + '.', valor: p.preco }];
    o.adicionais.forEach((a) => linhas.push({ tipo: 'adicional', rotulo: a.nome, descricao: a.descricao, valor: a.preco }));
    if (paginasExtras) linhas.push({ tipo: 'personalizacao', rotulo: util.plural(paginasExtras, 'página extra', 'páginas extras'), descricao: util.moeda(precoPagina) + ' por página além das incluídas.', valor: valorPaginas });
    if (valorComplexidade) linhas.push({ tipo: 'personalizacao', rotulo: 'Complexidade ' + comp.rotulo.toLowerCase(), descricao: comp.descricao, valor: valorComplexidade });
    if (taxaUrgencia) linhas.push({ tipo: 'personalizacao', rotulo: 'Taxa de urgência (' + taxa * 100 + '%)', descricao: 'Prazo de ' + prazo + ' dias, abaixo dos ' + prazoSugerido + ' recomendados para este escopo.', valor: taxaUrgencia });
    o.personalizados.forEach((i) => linhas.push({ tipo: 'personalizacao', rotulo: i.nome, descricao: 'Item personalizado.', valor: i.preco }));

    const valorPersonalizacoes = valorPaginas + valorComplexidade + taxaUrgencia + valorAvulsos;
    const subtotal = util.arredondar(p.preco + valorAdicionais + valorPersonalizacoes);
    const valorDesconto = Number(o.descontoValor) || 0;
    const desconto = util.arredondar(Math.min(subtotal, o.descontoTipo === 'valor' ? valorDesconto : subtotal * valorDesconto / 100));
    const total = util.arredondar(subtotal - desconto);

    const custo = util.arredondar(p.custo * (1 + comp.acrescimo) + util.somar(o.adicionais, (a) => a.custo) + (valorPaginas + valorAvulsos + taxaUrgencia) * CUSTO_PADRAO);
    const lucro = util.arredondar(total - custo);

    return {
      linhas, valorPrincipal: p.preco, valorAdicionais, valorPersonalizacoes, subtotal, desconto,
      descontoPercentual: subtotal ? (desconto / subtotal) * 100 : 0,
      total, custo, lucro, margem: total > 0 ? (lucro / total) * 100 : -100,
      prazoSugerido, prazoMinimo, prazo, paginasExtras, taxaUrgencia,
    };
  }

  /**
   * Compara a proposta com a margem mínima da agência.
   * nivel: 'ok' | 'abaixo' (pede confirmação) | 'inviavel' (não cobre os custos: bloqueia).
   */
  function viabilidade(calculo) {
    const margemMinima = Storage.ler('configuracoes').margemMinima;
    const totalMinimo = margemMinima >= 100 ? Infinity : calculo.custo / (1 - margemMinima / 100);
    const descontoMaximo = Math.max(0, Math.floor(calculo.subtotal - totalMinimo));
    const resultado = { nivel: 'ok', margemMinima, descontoMaximo, totalMinimo: Math.ceil(totalMinimo), mensagem: '' };
    if (!calculo.total && !calculo.subtotal) return resultado;
    if (calculo.total <= calculo.custo) {
      resultado.nivel = 'inviavel';
      resultado.mensagem = 'Proposta inviável: o valor final (' + util.moeda(calculo.total) + ') não cobre o custo estimado de ' + util.moeda(calculo.custo) + '. A agência teria prejuízo.';
    } else if (calculo.margem < margemMinima) {
      resultado.nivel = 'abaixo';
      resultado.mensagem = 'Margem de ' + util.percentual(calculo.margem) + ', abaixo do mínimo de ' + util.percentual(margemMinima) + ' definido para a agência. Para respeitar a margem, o valor final deve ser de pelo menos ' + util.moeda(resultado.totalMinimo, true) + '.';
    }
    return resultado;
  }

  /** Parcelas previstas para um valor, a partir da data de aprovação e da entrega prevista. */
  function parcelas(o, total, dataAprovacao, dataEntrega) {
    const plano = (PAGAMENTOS[o.pagamento] || PAGAMENTOS.entrada).parcelas;
    let acumulado = 0;
    return plano.map((parcela, indice) => {
      const ultima = indice === plano.length - 1;
      const valor = ultima ? util.arredondar(total - acumulado) : util.arredondar(total * parcela.pct / 100);
      acumulado += valor;
      const vencimento = parcela.quando === 'aprovacao' ? dataAprovacao : parcela.quando === 'entrega' ? dataEntrega : util.somarDias(dataAprovacao, parcela.dias);
      const momento = parcela.quando === 'aprovacao' ? 'na aprovação' : parcela.quando === 'entrega' ? 'na entrega' : 'em ' + parcela.dias + ' dias';
      return { numero: indice + 1, total: plano.length, pct: parcela.pct, valor, vencimento, naEntrega: parcela.quando === 'entrega', momento };
    });
  }

  /* ---------- Ciclo de vida ---------- */

  function gerarCodigo() {
    return 'ORC-' + new Date().getFullYear() + '-' + String(Storage.proximaSequencia('orcamento')).padStart(4, '0');
  }

  /** Grava o orçamento (novo ou existente) com o status informado. */
  function salvar(o, status) {
    const agora = util.agora();
    const calculo = calcular(o);
    const registro = Object.assign({}, o, { status: status || o.status, prazoDias: calculo.prazo, paginas: o.paginas || (o.principal ? o.principal.paginasIncluidas : 1), atualizadoEm: agora });
    if (registro.status !== 'rascunho' && !registro.validade) registro.validade = util.somarDias(util.hoje(), Storage.ler('configuracoes').validadePropostaDias);
    if (!registro.id) {
      registro.id = Storage.gerarId('orc');
      registro.codigo = gerarCodigo();
      registro.criadoEm = agora;
      Storage.inserir('orcamentos', registro);
    } else {
      Storage.atualizar('orcamentos', registro.id, registro);
    }
    return registro;
  }

  function duplicar(id) {
    const original = buscar(id);
    if (!original) return null;
    const copia = Storage.clonar(original);
    ['id', 'codigo', 'criadoEm', 'enviadoEm', 'aprovadoEm', 'recusadoEm', 'expiradoEm', 'validade', 'demo'].forEach((campo) => delete copia[campo]);
    copia.id = null;
    return salvar(copia, 'rascunho');
  }

  function podeExcluir(o) { return o.status !== 'aprovado'; }

  function excluir(id) {
    const o = buscar(id);
    if (!o || !podeExcluir(o)) return false;
    Storage.remover('negociacoes', (n) => n.orcamentoId === id);
    Storage.remover('orcamentos', id);
    return true;
  }

  /** Envia a proposta ao cliente e abre a negociação. Retorna a negociação criada. */
  function enviar(id) {
    const config = Storage.ler('configuracoes');
    const o = Storage.atualizar('orcamentos', id, (atual) => Object.assign(atual, {
      status: 'enviado', enviadoEm: util.agora(), atualizadoEm: util.agora(),
      validade: util.somarDias(util.hoje(), config.validadePropostaDias),
    }));
    if (!o) return null;
    const negociacao = SS.Negociacoes.abrir(o);
    SS.Notificacoes.criar({
      tipo: 'proposta', titulo: 'Nova proposta enviada',
      mensagem: o.codigo + ' enviada para ' + SS.Clientes.nomeDe(o.clienteId) + ' no valor de ' + util.moeda(calcular(o).total) + '.',
      link: 'negociacoes.html?id=' + negociacao.id,
    });
    return negociacao;
  }

  /** Venda fechada: cria o projeto e as parcelas a receber. Nada entra no caixa aqui. */
  function aprovar(id) {
    const o = Storage.atualizar('orcamentos', id, { status: 'aprovado', aprovadoEm: util.agora(), atualizadoEm: util.agora() });
    if (!o) return null;
    const projeto = SS.Projetos.criarDeOrcamento(o);
    SS.Financeiro.gerarParcelas(o, projeto);
    SS.Notificacoes.criar({
      tipo: 'aprovada', titulo: 'Proposta aprovada',
      mensagem: SS.Clientes.nomeDe(o.clienteId) + ' aprovou ' + o.codigo + ' por ' + util.moeda(projeto.valorContratado) + '. O projeto foi criado.',
      link: 'projetos.html?id=' + projeto.id,
    });
    return { orcamento: o, projeto };
  }

  function recusar(id) {
    return Storage.atualizar('orcamentos', id, { status: 'recusado', recusadoEm: util.agora(), atualizadoEm: util.agora() });
  }

  /** Propostas abertas com validade vencida passam a "Expirado" e encerram a negociação. */
  function verificarExpirados() {
    const hoje = util.hoje();
    listar().filter((o) => ABERTOS.includes(o.status) && o.validade && o.validade < hoje).forEach((o) => {
      Storage.atualizar('orcamentos', o.id, { status: 'expirado', expiradoEm: util.agora(), atualizadoEm: util.agora() });
      Storage.ler('negociacoes').filter((n) => n.orcamentoId === o.id && n.status === 'ativa')
        .forEach((n) => Storage.atualizar('negociacoes', n.id, { status: 'expirada', vez: null, encerradoEm: util.agora() }));
      SS.Notificacoes.criar({ tipo: 'recusada', titulo: 'Proposta expirada', mensagem: o.codigo + ' para ' + SS.Clientes.nomeDe(o.clienteId) + ' passou da validade sem fechamento.', link: 'orcamentos.html?ver=' + o.id });
    });
  }

  /* ---------- Documento da proposta ---------- */

  function htmlDocumento(o) {
    const config = Storage.ler('configuracoes');
    const cliente = SS.Clientes.buscar(o.clienteId);
    const c = calcular(o);
    const status = STATUS[o.status] || STATUS.rascunho;
    const base = o.aprovadoEm ? util.paraDia(o.aprovadoEm) : util.hoje();
    const plano = parcelas(o, c.total, base, util.somarDias(base, c.prazo));
    const comp = COMPLEXIDADES[o.complexidade] || COMPLEXIDADES.baixa;
    const grupos = [['principal', 'Serviço principal'], ['adicional', 'Funcionalidades e serviços adicionais'], ['personalizacao', 'Personalizações']];

    const corpo = grupos.map(([tipo, titulo]) => {
      const linhas = c.linhas.filter((l) => l.tipo === tipo);
      if (!linhas.length) return '';
      return '<tr class="documento__grupo"><th colspan="2" scope="colgroup">' + titulo + '</th></tr>' +
        linhas.map((l) => '<tr><td><strong>' + util.esc(l.rotulo) + '</strong><small>' + util.esc(l.descricao) + '</small></td><td class="num">' + util.moeda(l.valor) + '</td></tr>').join('');
    }).join('');

    return '<article class="documento">' +
      '<header class="documento__cabecalho">' +
        '<div class="documento__agencia">' + ui.avatarAgencia(config, 'avatar--g') + '<div><strong>' + util.esc(config.nomeAgencia) + '</strong><span>' + util.esc(config.descricao || '') + '</span></div></div>' +
        '<div class="documento__id"><span class="sobrelinha">Proposta comercial</span><strong class="mono">' + (o.codigo || 'Ainda não salva') + '</strong>' + ui.selo(status.rotulo, status.tom) + '</div>' +
      '</header>' +
      '<dl class="ficha ficha--documento">' +
        '<div><dt>Cliente</dt><dd>' + (cliente ? util.esc(cliente.nome) + (cliente.empresa ? '<small>' + util.esc(cliente.empresa) + '</small>' : '') : 'Não selecionado') + '</dd></div>' +
        '<div><dt>Emissão</dt><dd>' + util.data(o.criadoEm || new Date()) + '</dd></div>' +
        '<div><dt>Validade</dt><dd>' + (o.validade ? util.data(o.validade) : config.validadePropostaDias + ' dias após o envio') + '</dd></div>' +
        '<div><dt>Prazo de entrega</dt><dd>' + c.prazo + ' dias corridos</dd></div>' +
        '<div><dt>Escopo</dt><dd>' + util.plural(o.paginas || (o.principal ? o.principal.paginasIncluidas : 0), 'página', 'páginas') + ' · ' + comp.rotulo + '</dd></div>' +
      '</dl>' +
      '<table class="documento__itens"><thead><tr><th scope="col">Descrição</th><th scope="col" class="num">Valor</th></tr></thead><tbody>' + corpo + '</tbody>' +
        '<tfoot>' +
          '<tr><th scope="row">Subtotal</th><td class="num">' + util.moeda(c.subtotal) + '</td></tr>' +
          '<tr><th scope="row">Desconto' + (c.desconto ? ' (' + util.percentual(c.descontoPercentual) + ')' : '') + '</th><td class="num">' + (c.desconto ? '− ' + util.moeda(c.desconto) : util.moeda(0)) + '</td></tr>' +
          '<tr class="documento__total"><th scope="row">Valor total</th><td class="num">' + util.moeda(c.total) + '</td></tr>' +
        '</tfoot></table>' +
      '<section class="documento__secao"><h3>Condições de pagamento</h3><p>' + (PAGAMENTOS[o.pagamento] || PAGAMENTOS.entrada).rotulo + '.</p>' +
        '<ul class="documento__parcelas">' + plano.map((p) => '<li><span>Parcela ' + p.numero + '/' + p.total + ' — ' + p.momento + '</span><strong>' + util.moeda(p.valor) + '</strong></li>').join('') + '</ul></section>' +
      (o.observacoes ? '<section class="documento__secao"><h3>Observações</h3><p>' + util.esc(o.observacoes) + '</p></section>' : '') +
    '</article>';
  }

  function abrirDocumento(id) {
    const o = buscar(id);
    if (!o) { ui.toast('Orçamento não encontrado.', 'erro'); return; }
    const c = calcular(o);
    const analise = viabilidade(c);
    const interno = '<aside class="interno"><p class="sobrelinha">Visão interna — não aparece para o cliente</p>' +
      '<dl class="ficha"><div><dt>Custo estimado</dt><dd>' + util.moeda(c.custo) + '</dd></div><div><dt>Lucro previsto</dt><dd>' + util.moeda(c.lucro) + '</dd></div><div><dt>Margem</dt><dd>' + util.percentual(c.margem) + '</dd></div></dl>' +
      (analise.nivel !== 'ok' ? '<p class="aviso aviso--' + (analise.nivel === 'inviavel' ? 'perigo' : 'atencao') + '">' + ui.icone('triangle-alert') + '<span>' + analise.mensagem + '</span></p>' : '') + '</aside>';
    ui.modal({
      titulo: 'Proposta ' + o.codigo, tamanho: 'g',
      conteudo: htmlDocumento(o) + interno,
      acoes: [
        { rotulo: 'Imprimir', variante: 'fantasma', icone: 'printer', aoClicar() { global.print(); return false; } },
        { rotulo: 'Fechar', variante: 'secundario' },
      ],
    });
  }

  /* =====================================================================
   * Página: lista de orçamentos
   * ===================================================================== */

  const filtros = { status: '', busca: '' };

  function negociacaoDe(orcamentoId) {
    return Storage.ler('negociacoes').find((n) => n.orcamentoId === orcamentoId) || null;
  }

  function acaoPrincipal(o) {
    if (o.status === 'rascunho') return '<a class="botao botao--secundario botao--p" href="orcamentos.html?editar=' + o.id + '">' + ui.icone('pencil') + 'Continuar</a>';
    if (o.status === 'aguardando') return '<button type="button" class="botao botao--primario botao--p" data-acao="enviar" data-id="' + o.id + '">' + ui.icone('send') + 'Enviar</button>';
    if (o.status === 'enviado' || o.status === 'negociacao') {
      const n = negociacaoDe(o.id);
      return n ? '<a class="botao botao--secundario botao--p" href="negociacoes.html?id=' + n.id + '">' + ui.icone('messages-square') + 'Negociar</a>' : '';
    }
    if (o.status === 'aprovado') {
      const projeto = Storage.ler('projetos').find((p) => p.orcamentoId === o.id);
      return projeto ? '<a class="botao botao--secundario botao--p" href="projetos.html?id=' + projeto.id + '">' + ui.icone('kanban') + 'Projeto</a>' : '';
    }
    return '<button type="button" class="botao botao--secundario botao--p" data-acao="duplicar" data-id="' + o.id + '">' + ui.icone('copy') + 'Refazer</button>';
  }

  function desenharLista() {
    const todos = listar();
    const contagem = util.agrupar(todos, (o) => o.status);
    const chips = [['', 'Todos', todos.length]].concat(Object.keys(STATUS).map((id) => [id, STATUS[id].rotulo, (contagem[id] || []).length]));
    ui.render('#filtros-status', chips.map(([id, rotulo, total]) =>
      '<button type="button" class="chip' + (filtros.status === id ? ' chip--ativo' : '') + '" data-status="' + id + '" aria-pressed="' + (filtros.status === id) + '">' + rotulo + '<span>' + total + '</span></button>').join(''));

    const alvo = document.getElementById('lista-orcamentos');
    if (!todos.length) {
      const semClientes = !SS.Clientes.listar().length;
      ui.render(alvo, ui.estadoVazio(semClientes
        ? { icone: 'file-text', titulo: 'Nenhum orçamento ainda', texto: 'Um orçamento precisa de um cliente. Atenda um contato ou cadastre um cliente para montar a primeira proposta.', acao: { rotulo: 'Ir para Clientes', href: 'clientes.html', icone: 'users' } }
        : { icone: 'file-text', titulo: 'Nenhum orçamento ainda', texto: 'Monte uma proposta escolhendo o cliente, o tipo de site e os serviços. O valor é calculado conforme você avança.', acao: { rotulo: 'Novo orçamento', acao: 'novo' } }));
      return;
    }

    const busca = util.semAcento(filtros.busca);
    const clientes = SS.Clientes.listar();
    const lista = todos
      .filter((o) => !filtros.status || o.status === filtros.status)
      .filter((o) => {
        if (!busca) return true;
        const cliente = clientes.find((c) => c.id === o.clienteId);
        return util.semAcento(o.codigo).includes(busca) || (cliente && (util.semAcento(cliente.nome).includes(busca) || util.semAcento(cliente.empresa).includes(busca)));
      })
      .sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));

    if (!lista.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'search-x', titulo: 'Nenhum orçamento neste filtro', texto: 'Ajuste a busca ou escolha outro status.', acao: { rotulo: 'Limpar filtros', acao: 'limpar-filtros', icone: 'filter-x' } }));
      return;
    }

    const linhas = lista.map((o) => {
      const cliente = clientes.find((c) => c.id === o.clienteId);
      const c = calcular(o);
      const status = STATUS[o.status];
      const validade = o.validade && ABERTOS.includes(o.status) ? 'Válido até ' + util.data(o.validade) : 'Atualizado ' + util.tempoRelativo(o.atualizadoEm);
      return '<tr>' +
        '<td><button type="button" class="celula-link mono" data-acao="ver" data-id="' + o.id + '">' + o.codigo + '</button>' + ui.seloDemo(o) + '</td>' +
        '<td data-rotulo="Cliente"><strong>' + util.esc(cliente ? cliente.nome : 'Cliente removido') + '</strong><small>' + util.esc(cliente && cliente.empresa ? cliente.empresa : '') + '</small></td>' +
        '<td data-rotulo="Serviço">' + util.esc(o.principal ? o.principal.nome : 'A definir') + '<small>' + (o.adicionais.length ? '+ ' + util.plural(o.adicionais.length, 'adicional', 'adicionais') : 'sem adicionais') + '</small></td>' +
        '<td class="num" data-rotulo="Valor"><strong>' + util.moeda(c.total) + '</strong>' + (c.desconto ? '<small>' + util.percentual(c.descontoPercentual) + ' de desconto</small>' : '') + '</td>' +
        '<td data-rotulo="Status">' + ui.selo(status.rotulo, status.tom) + '<small>' + validade + '</small></td>' +
        '<td class="acoes">' + acaoPrincipal(o) +
          '<button type="button" class="botao-icone" data-acao="ver" data-id="' + o.id + '" aria-label="Visualizar ' + o.codigo + '" title="Visualizar">' + ui.icone('eye') + '</button>' +
          (EDITAVEIS.includes(o.status) && o.status !== 'rascunho' ? '<a class="botao-icone" href="orcamentos.html?editar=' + o.id + '" aria-label="Editar ' + o.codigo + '" title="Editar">' + ui.icone('pencil') + '</a>' : '') +
          '<button type="button" class="botao-icone" data-acao="duplicar" data-id="' + o.id + '" aria-label="Duplicar ' + o.codigo + '" title="Duplicar">' + ui.icone('copy') + '</button>' +
          (podeExcluir(o) ? '<button type="button" class="botao-icone" data-acao="excluir" data-id="' + o.id + '" aria-label="Excluir ' + o.codigo + '" title="Excluir">' + ui.icone('trash-2') + '</button>' : '') +
        '</td></tr>';
    }).join('');
    ui.render(alvo, '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Código</th><th>Cliente</th><th>Serviço</th><th class="num">Valor</th><th>Status</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhas + '</tbody></table></div>');
  }

  /** Confere a viabilidade e envia. Usado pela lista e pelo assistente. */
  async function enviarComConferencia(id) {
    const o = buscar(id);
    if (!o) return;
    const analise = viabilidade(calcular(o));
    if (analise.nivel === 'inviavel') { ui.toast(analise.mensagem, 'erro'); return; }
    if (analise.nivel === 'abaixo') {
      const seguir = await ui.confirmar({ titulo: 'Enviar abaixo da margem mínima?', mensagem: 'A proposta ' + o.codigo + ' está com a rentabilidade abaixo do limite da agência.', detalhe: analise.mensagem, rotuloConfirmar: 'Enviar mesmo assim', icone: 'send' });
      if (!seguir) return;
    }
    const negociacao = enviar(id);
    ui.toastAposNavegar('Proposta enviada. Acompanhe a resposta do cliente.');
    global.location.href = 'negociacoes.html?id=' + negociacao.id;
  }

  /* =====================================================================
   * Página: assistente de orçamento
   * ===================================================================== */

  const ETAPAS = [
    { id: 'cliente', rotulo: 'Cliente', titulo: 'Para quem é a proposta?', ajuda: 'Escolha o cliente e releia o que ele precisa antes de montar o escopo.' },
    { id: 'tipo', rotulo: 'Tipo de site', titulo: 'Qual tipo de site será entregue?', ajuda: 'O tipo de site define o preço base, as páginas incluídas e o prazo de referência.' },
    { id: 'funcionalidades', rotulo: 'Funcionalidades', titulo: 'Quais funcionalidades entram no projeto?', ajuda: 'Recursos que o site precisa ter. Itens pedidos pelo cliente estão sinalizados.' },
    { id: 'escopo', rotulo: 'Escopo e prazo', titulo: 'Páginas, complexidade e prazo de entrega', ajuda: 'Essas escolhas geram as personalizações do orçamento: páginas extras, nível de acabamento e urgência.' },
    { id: 'adicionais', rotulo: 'Serviços adicionais', titulo: 'Algum serviço adicional?', ajuda: 'Serviços complementares do catálogo e itens avulsos combinados com o cliente.' },
    { id: 'desconto', rotulo: 'Desconto e pagamento', titulo: 'Desconto e condições de pagamento', ajuda: 'O desconto reduz a margem da agência. O painel ao lado mostra o limite seguro.' },
    { id: 'revisao', rotulo: 'Revisão', titulo: 'Revise a proposta antes de salvar', ajuda: 'É assim que o cliente verá a proposta.' },
  ];

  const editor = { orc: null, etapa: 0, visitada: 0, raiz: null };

  function htmlPassos() {
    return '<ol class="passos">' + ETAPAS.map((etapa, indice) => {
      const estado = indice === editor.etapa ? 'atual' : indice <= editor.visitada ? 'feita' : 'futura';
      return '<li class="passo passo--' + estado + '"><button type="button" data-ir-etapa="' + indice + '"' + (indice > editor.visitada ? ' disabled' : '') + (indice === editor.etapa ? ' aria-current="step"' : '') + '>' +
        '<span class="passo__numero">' + (estado === 'feita' ? ui.icone('check') : indice + 1) + '</span><span class="passo__rotulo">' + etapa.rotulo + '</span></button></li>';
    }).join('') + '</ol>';
  }

  function htmlResumoCliente(cliente) {
    if (!cliente) return '';
    const perfil = SS.Clientes.PERFIS[cliente.perfil] || SS.Clientes.PERFIS.indeciso;
    const necessidades = (cliente.necessidades || []).map((id) => SS.Servicos.buscar(id)).filter(Boolean);
    return '<div class="briefing">' +
      '<header>' + ui.avatar(cliente.nome) + '<div><strong>' + util.esc(cliente.nome) + '</strong><span>' + util.esc(cliente.empresa || cliente.segmento) + '</span></div>' + ui.seloDemo(cliente) + '</header>' +
      '<p>' + util.esc(cliente.descricao) + '</p>' +
      '<dl class="ficha">' +
        '<div><dt>Quer</dt><dd>' + util.esc(SS.Servicos.nomeDe(cliente.tipoSite)) + '</dd></div>' +
        '<div><dt>Orçamento disponível</dt><dd>' + util.moeda(cliente.orcamentoDisponivel, true) + '</dd></div>' +
        '<div><dt>Prazo desejado</dt><dd>' + cliente.prazoDesejado + ' dias</dd></div>' +
        '<div><dt>Perfil</dt><dd>' + perfil.rotulo + '</dd></div>' +
      '</dl>' +
      (necessidades.length ? '<p class="briefing__rotulo">Precisa de</p><ul class="lista-etiquetas">' + necessidades.map((s) => '<li class="etiqueta">' + util.esc(s.nome) + '</li>').join('') + '</ul>' : '') +
      '<p class="briefing__perfil">' + ui.icone(perfil.icone) + '<span>' + perfil.resumo + '</span></p>' +
    '</div>';
  }

  function htmlListaAdicionais(grupo) {
    const o = editor.orc;
    const cliente = SS.Clientes.buscar(o.clienteId);
    const pedidos = cliente ? cliente.necessidades || [] : [];
    const doCatalogo = SS.Servicos.adicionais().filter((a) => SS.Servicos.grupoDe(a) === grupo);
    // Itens já incluídos que saíram do catálogo continuam visíveis para poderem ser removidos.
    const orfaos = o.adicionais.filter((a) => !SS.Servicos.buscar(a.servicoId) && (grupo === 'servico') === !['Funcionalidade', 'Integração', 'Dados e acesso'].includes(a.categoria))
      .map((a) => Object.assign({ id: a.servicoId, orfao: true }, a));
    const itens = doCatalogo.concat(orfaos);
    if (!itens.length) return ui.estadoVazio({ icone: 'package-open', titulo: 'Nada cadastrado nesta categoria', texto: 'Cadastre itens no catálogo em Configurações para oferecê-los aqui.', compacto: true });
    return '<div class="opcoes">' + itens.map((a) => {
      const incluido = o.adicionais.find((x) => x.servicoId === a.id);
      const preco = incluido ? incluido.preco : a.preco;
      return '<label class="opcao"><input type="checkbox" data-campo="adicional" value="' + a.id + '"' + (incluido ? ' checked' : '') + '>' +
        '<span class="opcao__corpo"><span class="opcao__titulo">' + util.esc(a.nome) + (pedidos.includes(a.id) ? '<span class="etiqueta etiqueta--destaque">Pedido pelo cliente</span>' : '') + (a.orfao ? '<span class="etiqueta">Fora do catálogo</span>' : '') + '</span>' +
        '<span class="opcao__texto">' + util.esc(a.descricao) + '</span></span>' +
        '<span class="opcao__preco">+ ' + util.moeda(preco, true) + '</span></label>';
    }).join('') + '</div>';
  }

  function htmlDicaPrazo() {
    const o = editor.orc;
    const c = calcular(o);
    const cliente = SS.Clientes.buscar(o.clienteId);
    const partes = ['Recomendado para este escopo: <strong>' + c.prazoSugerido + ' dias</strong>. Mínimo viável: ' + c.prazoMinimo + ' dias.'];
    if (c.taxaUrgencia) partes.push('Com ' + c.prazo + ' dias, entra uma taxa de urgência de <strong>' + util.moeda(c.taxaUrgencia) + '</strong>.');
    if (cliente) partes.push('O cliente deseja receber em ' + cliente.prazoDesejado + ' dias.');
    return partes.join(' ');
  }

  function htmlEtapa() {
    const o = editor.orc;
    const etapa = ETAPAS[editor.etapa].id;
    const cliente = SS.Clientes.buscar(o.clienteId);

    if (etapa === 'cliente') {
      const clientes = SS.Clientes.listar().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return '<div class="campo"><label class="campo__rotulo" for="campo-cliente">Cliente</label>' +
        '<select class="entrada" id="campo-cliente" data-campo="cliente"><option value="">Selecione um cliente</option>' +
        clientes.map((c) => '<option value="' + c.id + '"' + (c.id === o.clienteId ? ' selected' : '') + '>' + util.esc(c.nome + (c.empresa ? ' — ' + c.empresa : '')) + '</option>').join('') + '</select>' +
        '<p class="campo__erro" id="erro-etapa" hidden></p></div>' +
        (cliente ? htmlResumoCliente(cliente) : '<p class="texto-suave">Não encontrou o cliente? <a href="clientes.html">Cadastre-o em Clientes</a> e volte para montar a proposta.</p>');
    }

    if (etapa === 'tipo') {
      return '<div class="opcoes opcoes--grade" role="radiogroup" aria-label="Tipo de site">' + SS.Servicos.principais().map((s) => {
        const marcado = o.principal && o.principal.servicoId === s.id;
        return '<label class="opcao opcao--cartao"><input type="radio" name="tipo" data-campo="tipo" value="' + s.id + '"' + (marcado ? ' checked' : '') + '>' +
          '<span class="opcao__corpo">' + ui.icone(s.icone || 'globe', 'opcao__icone') +
          '<span class="opcao__titulo">' + util.esc(s.nome) + (cliente && cliente.tipoSite === s.id ? '<span class="etiqueta etiqueta--destaque">Pedido pelo cliente</span>' : '') + '</span>' +
          '<span class="opcao__texto">' + util.esc(s.descricao) + '</span>' +
          '<span class="opcao__meta">' + util.plural(s.paginasIncluidas, 'página', 'páginas') + ' · ' + s.prazoBaseDias + ' dias</span></span>' +
          '<span class="opcao__preco">' + util.moeda(marcado ? o.principal.preco : s.preco, true) + '</span></label>';
      }).join('') + '</div><p class="campo__erro" id="erro-etapa" hidden></p>';
    }

    if (etapa === 'funcionalidades') return htmlListaAdicionais('funcionalidade');

    if (etapa === 'escopo') {
      const c = calcular(o);
      return '<div class="grade-form">' +
        '<div class="campo"><label class="campo__rotulo" for="campo-paginas">Quantidade de páginas</label>' +
          '<input class="entrada" id="campo-paginas" type="number" min="1" max="100" step="1" data-campo="paginas" value="' + (o.paginas || o.principal.paginasIncluidas) + '">' +
          '<p class="campo__dica">' + util.esc(o.principal.nome) + ' inclui ' + util.plural(o.principal.paginasIncluidas, 'página', 'páginas') + '. Cada página extra custa ' + util.moeda(o.precoPaginaExtra) + '.</p><p class="campo__erro" id="erro-paginas" hidden></p></div>' +
        '<div class="campo"><label class="campo__rotulo" for="campo-prazo">Prazo de entrega</label>' +
          '<div class="entrada-grupo entrada-grupo--sufixo"><input class="entrada" id="campo-prazo" type="number" min="1" max="365" step="1" data-campo="prazo" value="' + c.prazo + '"><span class="entrada-grupo__sufixo">dias</span></div>' +
          '<p class="campo__dica" id="dica-prazo">' + htmlDicaPrazo() + '</p><p class="campo__erro" id="erro-prazo" hidden></p></div>' +
        '</div>' +
        '<fieldset class="campo"><legend class="campo__rotulo">Complexidade</legend><div class="opcoes opcoes--tres" role="radiogroup">' +
        Object.keys(COMPLEXIDADES).map((id) => {
          const comp = COMPLEXIDADES[id];
          return '<label class="opcao opcao--cartao"><input type="radio" name="complexidade" data-campo="complexidade" value="' + id + '"' + (o.complexidade === id ? ' checked' : '') + '>' +
            '<span class="opcao__corpo"><span class="opcao__titulo">' + comp.rotulo + '</span><span class="opcao__texto">' + comp.descricao + '</span></span>' +
            '<span class="opcao__preco">' + (comp.acrescimo ? '+ ' + comp.acrescimo * 100 + '%' : 'Sem acréscimo') + '</span></label>';
        }).join('') + '</div></fieldset>';
    }

    if (etapa === 'adicionais') {
      const avulsos = o.personalizados.length
        ? '<ul class="lista-simples lista-simples--avulsos">' + o.personalizados.map((item, indice) => '<li><span>' + util.esc(item.nome) + '</span><span class="num">' + util.moeda(item.preco) + '</span>' +
          '<button type="button" class="botao-icone botao-icone--p" data-remover-avulso="' + indice + '" aria-label="Remover ' + util.esc(item.nome) + '">' + ui.icone('x') + '</button></li>').join('') + '</ul>'
        : '';
      return htmlListaAdicionais('servico') +
        '<section class="avulsos"><h3 class="subtitulo">Itens personalizados</h3><p class="texto-suave">Para algo combinado com o cliente que não está no catálogo, como produção de textos ou sessão de fotos.</p>' + avulsos +
        '<div class="avulsos__novo">' +
          '<div class="campo"><label class="campo__rotulo" for="avulso-nome">Descrição do item</label><input class="entrada" id="avulso-nome" maxlength="60" placeholder="Ex.: Redação dos textos do site"></div>' +
          '<div class="campo"><label class="campo__rotulo" for="avulso-preco">Valor</label><div class="entrada-grupo"><span class="entrada-grupo__prefixo">R$</span><input class="entrada" id="avulso-preco" type="number" min="1" step="0.01" placeholder="0,00"></div></div>' +
          '<button type="button" class="botao botao--secundario" data-acao-editor="adicionar-avulso">' + ui.icone('plus') + 'Adicionar</button>' +
        '</div><p class="campo__erro" id="erro-avulso" hidden></p></section>';
    }

    if (etapa === 'desconto') {
      return '<div class="grade-form">' +
        '<fieldset class="campo"><legend class="campo__rotulo">Tipo de desconto</legend><div class="segmentado" role="radiogroup">' +
          '<label><input type="radio" name="descontoTipo" data-campo="descontoTipo" value="percentual"' + (o.descontoTipo !== 'valor' ? ' checked' : '') + '><span>Percentual</span></label>' +
          '<label><input type="radio" name="descontoTipo" data-campo="descontoTipo" value="valor"' + (o.descontoTipo === 'valor' ? ' checked' : '') + '><span>Valor em reais</span></label></div></fieldset>' +
        '<div class="campo"><label class="campo__rotulo" for="campo-desconto">Desconto</label>' +
          '<div class="entrada-grupo ' + (o.descontoTipo === 'valor' ? '' : 'entrada-grupo--sufixo') + '">' + (o.descontoTipo === 'valor' ? '<span class="entrada-grupo__prefixo">R$</span>' : '') +
          '<input class="entrada" id="campo-desconto" type="number" min="0" step="' + (o.descontoTipo === 'valor' ? '0.01' : '0.5') + '" data-campo="descontoValor" value="' + (o.descontoValor || 0) + '">' +
          (o.descontoTipo === 'valor' ? '' : '<span class="entrada-grupo__sufixo">%</span>') + '</div>' +
          '<p class="campo__dica" id="dica-desconto"></p><p class="campo__erro" id="erro-desconto" hidden></p></div>' +
        '<div class="campo campo--largo"><label class="campo__rotulo" for="campo-pagamento">Condições de pagamento</label>' +
          '<select class="entrada" id="campo-pagamento" data-campo="pagamento">' + Object.keys(PAGAMENTOS).map((id) => '<option value="' + id + '"' + (o.pagamento === id ? ' selected' : '') + '>' + PAGAMENTOS[id].rotulo + '</option>').join('') + '</select>' +
          '<p class="campo__dica">As parcelas viram contas a receber quando a proposta é aprovada.</p></div>' +
        '<div class="campo campo--largo"><label class="campo__rotulo" for="campo-observacoes">Observações <span class="campo__opcional">opcional</span></label>' +
          '<textarea class="entrada" id="campo-observacoes" rows="3" maxlength="400" data-campo="observacoes" placeholder="Ex.: conteúdo e imagens fornecidos pelo cliente.">' + util.esc(o.observacoes || '') + '</textarea></div>' +
        '</div>';
    }

    return htmlDocumento(o);
  }

  function htmlResumo() {
    const o = editor.orc;
    const c = calcular(o);
    const cliente = SS.Clientes.buscar(o.clienteId);
    if (!o.principal) {
      return '<p class="sobrelinha">Resumo do orçamento</p><p class="texto-suave">' + (cliente ? 'Escolha o tipo de site para iniciar o cálculo.' : 'Selecione o cliente para começar.') + '</p>';
    }
    const analise = viabilidade(c);
    const linha = (rotulo, valor, classe) => '<div class="resumo__linha' + (classe ? ' ' + classe : '') + '"><span>' + rotulo + '</span><span class="num">' + valor + '</span></div>';
    let comparacao = '';
    if (cliente) {
      const razao = c.total / cliente.orcamentoDisponivel;
      const largura = Math.min(100, Math.round(razao * 100));
      comparacao = '<div class="resumo__bloco"><div class="resumo__linha"><span>Orçamento do cliente</span><span class="num">' + util.moeda(cliente.orcamentoDisponivel, true) + '</span></div>' +
        '<div class="medidor' + (razao > 1 ? ' medidor--excedido' : '') + '" role="img" aria-label="A proposta equivale a ' + Math.round(razao * 100) + '% do orçamento do cliente"><span style="width:' + largura + '%"></span></div>' +
        '<p class="resumo__nota">' + (razao > 1 ? 'A proposta está ' + util.moeda(c.total - cliente.orcamentoDisponivel, true) + ' acima do que o cliente pretende investir.' : 'A proposta usa ' + Math.round(razao * 100) + '% do orçamento do cliente.') + '</p></div>';
    }
    return '<p class="sobrelinha">Resumo do orçamento</p>' +
      '<div class="resumo__total"><span>Valor final</span><strong>' + util.moeda(c.total) + '</strong><small>Entrega em ' + c.prazo + ' dias</small></div>' +
      '<div class="resumo__bloco">' +
        linha('Serviço principal', util.moeda(c.valorPrincipal)) +
        linha('Adicionais (' + o.adicionais.length + ')', util.moeda(c.valorAdicionais)) +
        linha('Personalizações', util.moeda(c.valorPersonalizacoes)) +
        linha('Desconto', c.desconto ? '− ' + util.moeda(c.desconto) : util.moeda(0)) +
      '</div>' + comparacao +
      '<div class="resumo__bloco"><p class="resumo__rotulo">Visão interna</p>' +
        linha('Custo estimado', util.moeda(c.custo)) +
        linha('Lucro previsto', util.moeda(c.lucro)) +
        linha('Margem', util.percentual(c.margem), 'resumo__linha--' + (analise.nivel === 'ok' ? 'boa' : 'ruim')) +
        '<p class="resumo__nota">Margem mínima da agência: ' + util.percentual(analise.margemMinima) + '. Desconto máximo sem ultrapassá-la: ' + util.moeda(analise.descontoMaximo, true) + '.</p>' +
      '</div>' +
      (analise.nivel !== 'ok' ? '<p class="aviso aviso--' + (analise.nivel === 'inviavel' ? 'perigo' : 'atencao') + '" role="alert">' + ui.icone('triangle-alert') + '<span>' + analise.mensagem + '</span></p>' : '');
  }

  function atualizarResumo() {
    ui.render('#editor-resumo', htmlResumo());
    const dicaPrazo = document.getElementById('dica-prazo');
    if (dicaPrazo) dicaPrazo.innerHTML = htmlDicaPrazo();
    const dicaDesconto = document.getElementById('dica-desconto');
    if (dicaDesconto) {
      const c = calcular(editor.orc);
      const analise = viabilidade(c);
      dicaDesconto.textContent = 'Equivale a ' + util.moeda(c.desconto) + ' (' + util.percentual(c.descontoPercentual) + '). Limite pela margem mínima: ' + util.moeda(analise.descontoMaximo, true) + '.';
    }
  }

  function desenharEditor() {
    const etapa = ETAPAS[editor.etapa];
    const ultima = editor.etapa === ETAPAS.length - 1;
    const o = editor.orc;
    const rodape = ultima
      ? '<button type="button" class="botao botao--fantasma" data-acao-editor="voltar">' + ui.icone('arrow-left') + 'Voltar</button><span class="editor__espaco"></span>' +
        '<button type="button" class="botao botao--secundario" data-acao-editor="salvar-rascunho">Salvar como rascunho</button>' +
        '<button type="button" class="botao botao--secundario" data-acao-editor="salvar-pronto">' + ui.icone('check') + 'Salvar proposta</button>' +
        '<button type="button" class="botao botao--primario" data-acao-editor="salvar-enviar">' + ui.icone('send') + 'Salvar e enviar ao cliente</button>'
      : (editor.etapa > 0 ? '<button type="button" class="botao botao--fantasma" data-acao-editor="voltar">' + ui.icone('arrow-left') + 'Voltar</button>' : '') + '<span class="editor__espaco"></span>' +
        (o.clienteId && o.principal ? '<button type="button" class="botao botao--fantasma" data-acao-editor="salvar-rascunho">Salvar rascunho</button>' : '') +
        '<button type="button" class="botao botao--primario" data-acao-editor="avancar">Avançar' + ui.icone('arrow-right') + '</button>';

    ui.render(editor.raiz,
      '<header class="editor__topo"><a class="botao botao--fantasma botao--p" href="orcamentos.html">' + ui.icone('arrow-left') + 'Orçamentos</a>' +
        '<div><p class="sobrelinha">' + (o.id ? 'Editando ' + o.codigo : 'Novo orçamento') + '</p></div></header>' +
      htmlPassos() +
      '<div class="editor__grade">' +
        '<section class="cartao editor__etapa" aria-labelledby="titulo-etapa">' +
          '<p class="sobrelinha">Etapa ' + (editor.etapa + 1) + ' de ' + ETAPAS.length + '</p><h2 id="titulo-etapa" tabindex="-1">' + etapa.titulo + '</h2><p class="editor__ajuda">' + etapa.ajuda + '</p>' +
          '<div class="editor__corpo">' + htmlEtapa() + '</div>' +
          '<footer class="editor__rodape">' + rodape + '</footer>' +
        '</section>' +
        '<aside class="cartao resumo" id="editor-resumo" aria-live="polite"></aside>' +
      '</div>');
    atualizarResumo();
  }

  function erroNaEtapa(idElemento, mensagem) {
    const el = document.getElementById(idElemento);
    if (!el) { ui.toast(mensagem, 'erro'); return; }
    el.textContent = mensagem; el.hidden = !mensagem;
  }

  /** Valida a etapa informada. Retorna a mensagem de erro ou ''. */
  function validarEtapa(indice) {
    const o = editor.orc;
    const etapa = ETAPAS[indice].id;
    const c = calcular(o);
    if (etapa === 'cliente' && !SS.Clientes.buscar(o.clienteId)) return ['erro-etapa', 'Selecione o cliente da proposta.'];
    if (etapa === 'tipo' && !o.principal) return ['erro-etapa', 'Escolha um tipo de site.'];
    if (etapa === 'escopo') {
      if (!Number.isInteger(o.paginas) || o.paginas < 1 || o.paginas > 100) return ['erro-paginas', 'Informe um número inteiro de páginas entre 1 e 100.'];
      if (!Number.isInteger(c.prazo) || c.prazo > 365) return ['erro-prazo', 'Informe o prazo em dias, até 365.'];
      if (c.prazo < c.prazoMinimo) return ['erro-prazo', 'Prazo inviável: este escopo precisa de pelo menos ' + c.prazoMinimo + ' dias.'];
    }
    if (etapa === 'desconto') {
      const valor = Number(o.descontoValor);
      if (!isFinite(valor) || valor < 0) return ['erro-desconto', 'O desconto não pode ser negativo.'];
      if (o.descontoTipo !== 'valor' && valor > 100) return ['erro-desconto', 'O desconto percentual vai de 0 a 100%.'];
      if (o.descontoTipo === 'valor' && valor > c.subtotal) return ['erro-desconto', 'O desconto não pode ser maior que o subtotal de ' + util.moeda(c.subtotal) + '.'];
    }
    return null;
  }

  function irParaEtapa(indice) {
    editor.etapa = indice;
    editor.visitada = Math.max(editor.visitada, indice);
    desenharEditor();
    const titulo = document.getElementById('titulo-etapa');
    if (titulo) titulo.focus({ preventScroll: true });
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validarTudo() {
    for (let i = 0; i < ETAPAS.length; i++) {
      const erro = validarEtapa(i);
      if (erro) { irParaEtapa(i); erroNaEtapa(erro[0], erro[1]); return false; }
    }
    return true;
  }

  async function concluirEditor(destino) {
    const o = editor.orc;
    if (destino === 'rascunho') {
      if (!SS.Clientes.buscar(o.clienteId) || !o.principal) { ui.toast('Escolha o cliente e o tipo de site antes de salvar o rascunho.', 'aviso'); return; }
      salvar(o, 'rascunho');
      ui.toastAposNavegar('Rascunho salvo.');
      global.location.href = 'orcamentos.html';
      return;
    }
    if (!validarTudo()) return;
    const analise = viabilidade(calcular(o));
    if (analise.nivel === 'inviavel') { ui.toast('Esta proposta só pode ser salva como rascunho: ' + analise.mensagem, 'erro'); return; }
    if (destino === 'pronto') {
      if (analise.nivel === 'abaixo') {
        const seguir = await ui.confirmar({ titulo: 'Salvar abaixo da margem mínima?', mensagem: 'A proposta ficará pronta para envio com rentabilidade abaixo do limite da agência.', detalhe: analise.mensagem, rotuloConfirmar: 'Salvar mesmo assim' });
        if (!seguir) return;
      }
      salvar(o, 'aguardando');
      ui.toastAposNavegar('Proposta salva e pronta para envio.');
      global.location.href = 'orcamentos.html';
      return;
    }
    const salvo = salvar(o, 'aguardando');
    editor.orc = salvo;
    enviarComConferencia(salvo.id);
  }

  function ligarEditor() {
    const raiz = editor.raiz;

    raiz.addEventListener('change', (evento) => {
      const alvo = evento.target;
      const campo = alvo.dataset.campo;
      const o = editor.orc;
      if (campo === 'cliente') { o.clienteId = alvo.value; desenharEditor(); }
      if (campo === 'tipo') { definirPrincipal(o, alvo.value); atualizarResumo(); }
      if (campo === 'adicional') { alternarAdicional(o, alvo.value, alvo.checked); atualizarResumo(); }
      if (campo === 'complexidade') { o.complexidade = alvo.value; const c = calcular(o); const prazo = document.getElementById('campo-prazo'); if (prazo && !o.prazoDias) prazo.value = c.prazo; atualizarResumo(); }
      if (campo === 'descontoTipo') { o.descontoTipo = alvo.value; o.descontoValor = 0; desenharEditor(); }
      if (campo === 'pagamento') { o.pagamento = alvo.value; }
    });

    raiz.addEventListener('input', (evento) => {
      const alvo = evento.target;
      const campo = alvo.dataset.campo;
      const o = editor.orc;
      if (campo === 'paginas') { o.paginas = alvo.value === '' ? null : Number(alvo.value); erroNaEtapa('erro-paginas', ''); const prazo = document.getElementById('campo-prazo'); if (prazo && !o.prazoDias) prazo.value = calcular(o).prazo; atualizarResumo(); }
      if (campo === 'prazo') { o.prazoDias = alvo.value === '' ? null : Number(alvo.value); erroNaEtapa('erro-prazo', ''); atualizarResumo(); }
      if (campo === 'descontoValor') { o.descontoValor = alvo.value === '' ? 0 : Number(alvo.value); erroNaEtapa('erro-desconto', ''); atualizarResumo(); }
      if (campo === 'observacoes') { o.observacoes = alvo.value.trim(); }
    });

    raiz.addEventListener('click', (evento) => {
      const etapa = evento.target.closest('[data-ir-etapa]');
      if (etapa) {
        const destino = Number(etapa.dataset.irEtapa);
        if (destino > editor.etapa) { const erro = validarEtapa(editor.etapa); if (erro) { erroNaEtapa(erro[0], erro[1]); return; } }
        irParaEtapa(destino);
        return;
      }
      const remover = evento.target.closest('[data-remover-avulso]');
      if (remover) { editor.orc.personalizados.splice(Number(remover.dataset.removerAvulso), 1); desenharEditor(); return; }

      const botao = evento.target.closest('[data-acao-editor]');
      if (!botao) return;
      const acao = botao.dataset.acaoEditor;
      if (acao === 'voltar') irParaEtapa(editor.etapa - 1);
      if (acao === 'avancar') {
        const erro = validarEtapa(editor.etapa);
        if (erro) erroNaEtapa(erro[0], erro[1]); else irParaEtapa(editor.etapa + 1);
      }
      if (acao === 'adicionar-avulso') {
        const nome = document.getElementById('avulso-nome').value.trim();
        const preco = Number(document.getElementById('avulso-preco').value);
        if (nome.length < 3) { erroNaEtapa('erro-avulso', 'Descreva o item com pelo menos 3 caracteres.'); return; }
        if (!(preco > 0)) { erroNaEtapa('erro-avulso', 'Informe um valor maior que zero.'); return; }
        editor.orc.personalizados.push({ nome, preco: util.arredondar(preco) });
        desenharEditor();
      }
      if (acao === 'salvar-rascunho') concluirEditor('rascunho');
      if (acao === 'salvar-pronto') concluirEditor('pronto');
      if (acao === 'salvar-enviar') concluirEditor('enviar');
    });
  }

  function abrirEditor(orcamento, clienteId) {
    editor.orc = orcamento ? Storage.clonar(orcamento) : novo(SS.Clientes.buscar(clienteId) ? clienteId : '');
    editor.etapa = 0;
    editor.visitada = orcamento ? ETAPAS.length - 1 : 0;
    document.getElementById('vista-lista').hidden = true;
    editor.raiz.hidden = false;
    // Com cliente pré-selecionado (vindo da página de clientes), o briefing já aparece na primeira etapa.
    desenharEditor();
  }

  function montarPagina() {
    editor.raiz = document.getElementById('vista-editor');
    ligarEditor();

    const raiz = document.getElementById('vista-lista');
    const campoBusca = document.getElementById('busca-orcamentos');
    campoBusca.addEventListener('input', util.atrasar(() => { filtros.busca = campoBusca.value; desenharLista(); }, 150));
    ui.delegar(raiz, 'click', '[data-status]', (evento, chip) => { filtros.status = chip.dataset.status; desenharLista(); });
    ui.delegar(raiz, 'click', '[data-acao]', async (evento, alvo) => {
      const { acao, id } = alvo.dataset;
      if (acao === 'novo') {
        if (!SS.Clientes.listar().length) { ui.toast('Cadastre ou atenda um cliente antes de criar um orçamento.', 'aviso', { link: { href: 'clientes.html', rotulo: 'Ir para Clientes' } }); return; }
        abrirEditor(null, null);
      }
      if (acao === 'ver') abrirDocumento(id);
      if (acao === 'enviar') enviarComConferencia(id);
      if (acao === 'limpar-filtros') { filtros.status = ''; filtros.busca = ''; campoBusca.value = ''; desenharLista(); }
      if (acao === 'duplicar') {
        const copia = duplicar(id);
        if (copia) { desenharLista(); ui.toast('Cópia criada como rascunho: ' + copia.codigo + '.', 'sucesso', { link: { href: 'orcamentos.html?editar=' + copia.id, rotulo: 'Editar cópia' } }); }
      }
      if (acao === 'excluir') {
        const o = buscar(id);
        const emNegociacao = o.status === 'enviado' || o.status === 'negociacao';
        const confirmado = await ui.confirmar({ titulo: 'Excluir orçamento', mensagem: 'Excluir ' + o.codigo + '? Esta ação não pode ser desfeita.', detalhe: emNegociacao ? 'A negociação em andamento com o cliente também será apagada.' : '', rotuloConfirmar: 'Excluir', perigo: true, icone: 'trash-2' });
        if (confirmado && excluir(id)) { desenharLista(); SS.App.dadosAlterados(); ui.toast('Orçamento excluído.'); }
      }
    });

    const paraEditar = util.parametro('editar');
    if (paraEditar) {
      const o = buscar(paraEditar);
      if (o && EDITAVEIS.includes(o.status)) { abrirEditor(o); return; }
      ui.toast(o ? 'Este orçamento já foi enviado. Ajustes agora são feitos na negociação.' : 'Orçamento não encontrado.', 'aviso');
    } else if (util.parametro('novo')) {
      if (SS.Clientes.listar().length) { abrirEditor(null, util.parametro('cliente')); return; }
      ui.toast('Cadastre ou atenda um cliente antes de criar um orçamento.', 'aviso');
    }
    desenharLista();
    const paraVer = util.parametro('ver');
    if (paraVer) abrirDocumento(paraVer);
  }

  SS.Orcamentos = {
    STATUS, COMPLEXIDADES, PAGAMENTOS, EDITAVEIS, ABERTOS,
    listar, buscar, novo, definirPrincipal, alternarAdicional, calcular, viabilidade, parcelas,
    salvar, duplicar, excluir, enviar, aprovar, recusar, verificarExpirados,
    htmlDocumento, abrirDocumento,
  };
  SS.App.paginas.orcamentos = montarPagina;
})(window);
