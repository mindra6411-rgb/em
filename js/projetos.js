/*
 * SiteSeller — projetos.js
 * Projetos nascem de propostas aprovadas e avançam por etapas até a entrega.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const ETAPAS = [
    { id: 'aguardando', rotulo: 'Aguardando início', progresso: 0, tom: 'champanhe', icone: 'hourglass' },
    { id: 'planejamento', rotulo: 'Planejamento', progresso: 15, tom: 'claro', icone: 'pencil-ruler' },
    { id: 'desenvolvimento', rotulo: 'Desenvolvimento', progresso: 50, tom: 'rosa', icone: 'code-xml' },
    { id: 'revisao', rotulo: 'Revisão', progresso: 80, tom: 'rosa', icone: 'scan-search' },
    { id: 'concluido', rotulo: 'Concluído', progresso: 95, tom: 'ouro', icone: 'circle-check' },
    { id: 'entregue', rotulo: 'Entregue', progresso: 100, tom: 'ouro', icone: 'package-check' },
  ];
  const FINALIZADOS = ['concluido', 'entregue'];
  const DIAS_DE_ALERTA = 5;

  const listar = () => Storage.ler('projetos');
  const buscar = (id) => Storage.buscar('projetos', id);
  const indiceDe = (status) => ETAPAS.findIndex((e) => e.id === status);
  const etapaDe = (projeto) => ETAPAS[Math.max(0, indiceDe(projeto.status))];
  const emAndamento = (projeto) => !FINALIZADOS.includes(projeto.status);

  /** Cria o projeto de uma proposta aprovada. opcoes.data permite datar registros de demonstração. */
  function criarDeOrcamento(orcamento, opcoes) {
    const dia = util.paraDia((opcoes && opcoes.data) || new Date());
    const momento = (opcoes && opcoes.data) || util.agora();
    const c = SS.Orcamentos.calcular(orcamento);
    const cliente = SS.Clientes.buscar(orcamento.clienteId);
    const projeto = {
      id: Storage.gerarId('prj'),
      codigo: 'PRJ-' + String(Storage.proximaSequencia('projeto')).padStart(4, '0'),
      nome: orcamento.principal.nome + ' — ' + SS.Clientes.rotuloDe(cliente),
      clienteId: orcamento.clienteId, orcamentoId: orcamento.id,
      tipoSite: orcamento.principal.nome,
      valorContratado: c.total, custoPrevisto: c.custo,
      servicos: [orcamento.principal.nome].concat(orcamento.adicionais.map((a) => a.nome), orcamento.personalizados.map((i) => i.nome)),
      dataContrato: dia, dataInicio: null, prazoDias: c.prazo, prazoEntrega: util.somarDias(dia, c.prazo),
      status: 'aguardando', historico: [{ status: 'aguardando', data: momento }], alertas: {},
    };
    if (opcoes && opcoes.demo) projeto.demo = true;
    Storage.inserir('projetos', projeto);
    return projeto;
  }

  /** Situação do prazo: { tipo: 'ok' | 'proximo' | 'atrasado' | 'finalizado', dias, texto }. */
  function situacaoPrazo(projeto) {
    if (!emAndamento(projeto)) {
      const fim = projeto.concluidoEm || projeto.entregueEm;
      const noPrazo = fim ? util.paraDia(fim) <= projeto.prazoEntrega : true;
      return { tipo: 'finalizado', dias: 0, texto: noPrazo ? 'Finalizado dentro do prazo' : 'Finalizado após o prazo' };
    }
    const dias = util.diasAte(projeto.prazoEntrega);
    const tipo = dias < 0 ? 'atrasado' : dias <= DIAS_DE_ALERTA ? 'proximo' : 'ok';
    return { tipo, dias, texto: util.prazoEmTexto(dias) };
  }

  /**
   * Regras de mudança de etapa. Retorna '' se a mudança é permitida ou a explicação do bloqueio.
   */
  function bloqueioDeMudanca(projeto, novoStatus) {
    if (indiceDe(novoStatus) === -1) return 'Etapa desconhecida.';
    if (projeto.status === novoStatus) return 'O projeto já está nesta etapa.';
    if (projeto.status === 'entregue') return 'O projeto já foi entregue ao cliente e não pode mudar de etapa.';
    if (FINALIZADOS.includes(novoStatus) && !projeto.dataInicio) return 'Inicie o projeto (planejamento ou desenvolvimento) antes de concluí-lo.';
    if (novoStatus === 'entregue' && projeto.status !== 'concluido') return 'Marque o projeto como concluído antes de registrar a entrega.';
    if (novoStatus === 'aguardando') return 'Um projeto iniciado não volta para "Aguardando início".';
    return '';
  }

  function mudarStatus(id, novoStatus) {
    const projeto = buscar(id);
    if (!projeto) return { ok: false, mensagem: 'Projeto não encontrado.' };
    const bloqueio = bloqueioDeMudanca(projeto, novoStatus);
    if (bloqueio) return { ok: false, mensagem: bloqueio };

    const agora = util.agora();
    const atualizado = Storage.atualizar('projetos', id, (p) => {
      p.status = novoStatus;
      p.historico.push({ status: novoStatus, data: agora });
      if (!p.dataInicio && novoStatus !== 'aguardando') p.dataInicio = util.hoje();
      if (novoStatus === 'concluido') p.concluidoEm = agora;
      if (novoStatus === 'entregue') p.entregueEm = agora;
      if (!FINALIZADOS.includes(novoStatus)) delete p.concluidoEm;
      return p;
    });

    const cliente = SS.Clientes.nomeDe(projeto.clienteId);
    const link = 'projetos.html?id=' + id;
    if (novoStatus === 'concluido') SS.Notificacoes.criar({ tipo: 'projeto', titulo: 'Projeto concluído', mensagem: projeto.nome + ' está pronto para ser entregue a ' + cliente + '.', link });
    if (novoStatus === 'entregue') {
      const liberadas = SS.Financeiro.liberarParcelasDaEntrega(id);
      SS.Notificacoes.criar({ tipo: 'projeto', titulo: 'Projeto entregue', mensagem: projeto.nome + ' foi entregue.' + (liberadas ? ' ' + util.plural(liberadas, 'parcela vence', 'parcelas vencem') + ' hoje.' : ''), link: liberadas ? 'financeiro.html' : link });
    }
    return { ok: true, projeto: atualizado, etapa: etapaDe(atualizado) };
  }

  /** Gera, uma única vez por projeto, os alertas de prazo próximo e de atraso. */
  function verificarPrazos() {
    listar().filter(emAndamento).forEach((p) => {
      const prazo = situacaoPrazo(p);
      const alertas = p.alertas || {};
      const link = 'projetos.html?id=' + p.id;
      if (prazo.tipo === 'atrasado' && !alertas.atrasado) {
        SS.Notificacoes.criar({ tipo: 'prazo', titulo: 'Projeto atrasado', mensagem: p.nome + ' passou do prazo de entrega (' + util.data(p.prazoEntrega) + ').', link, demo: Boolean(p.demo) });
        Storage.atualizar('projetos', p.id, { alertas: Object.assign({}, alertas, { atrasado: true, proximo: true }) });
      } else if (prazo.tipo === 'proximo' && !alertas.proximo) {
        SS.Notificacoes.criar({ tipo: 'prazo', titulo: 'Projeto próximo do prazo', mensagem: p.nome + ' deve ser entregue em ' + util.data(p.prazoEntrega) + ' (' + prazo.texto + ').', link, demo: Boolean(p.demo) });
        Storage.atualizar('projetos', p.id, { alertas: Object.assign({}, alertas, { proximo: true }) });
      }
    });
  }

  /* =====================================================================
   * Página de projetos
   * ===================================================================== */

  const tela = { filtro: 'andamento' };

  function htmlPrazo(projeto) {
    const prazo = situacaoPrazo(projeto);
    const icone = { ok: 'calendar', proximo: 'alarm-clock', atrasado: 'triangle-alert', finalizado: 'calendar-check' }[prazo.tipo];
    return '<span class="prazo prazo--' + prazo.tipo + '">' + ui.icone(icone) + '<span>' + (prazo.tipo === 'finalizado' ? prazo.texto : util.data(projeto.prazoEntrega) + ' · ' + prazo.texto) + '</span></span>';
  }

  function htmlTrilha(projeto) {
    const atual = indiceDe(projeto.status);
    return '<ol class="trilha" aria-label="Etapas do projeto">' + ETAPAS.map((etapa, indice) => {
      const estado = indice < atual ? 'feita' : indice === atual ? 'atual' : 'futura';
      return '<li class="trilha__etapa trilha__etapa--' + estado + '"' + (estado === 'atual' ? ' aria-current="step"' : '') + '><span class="trilha__ponto"></span><span class="trilha__rotulo">' + etapa.rotulo + '</span></li>';
    }).join('') + '</ol>';
  }

  function htmlProgresso(projeto) {
    const etapa = etapaDe(projeto);
    return '<div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + etapa.progresso + '" aria-label="Progresso do projeto: ' + etapa.progresso + '%"><span style="width:' + etapa.progresso + '%"></span></div>';
  }

  function projetosFiltrados() {
    return listar().filter((p) => {
      if (tela.filtro === 'andamento') return emAndamento(p);
      if (tela.filtro === 'finalizados') return !emAndamento(p);
      if (tela.filtro === 'atencao') return ['proximo', 'atrasado'].includes(situacaoPrazo(p).tipo);
      return true;
    }).sort((a, b) => (emAndamento(a) === emAndamento(b) ? (a.prazoEntrega < b.prazoEntrega ? -1 : 1) * (emAndamento(a) ? 1 : -1) : emAndamento(a) ? -1 : 1));
  }

  function desenharPagina() {
    const todos = listar();
    const andamento = todos.filter(emAndamento);
    const atencao = todos.filter((p) => ['proximo', 'atrasado'].includes(situacaoPrazo(p).tipo));
    const atrasados = atencao.filter((p) => situacaoPrazo(p).tipo === 'atrasado').length;
    const contratado = util.somar(andamento, (p) => p.valorContratado);

    ui.render('#resumo-projetos',
      '<div class="faixa__item"><span>Em andamento</span><strong>' + andamento.length + '</strong><small>' + util.moeda(contratado, true) + ' em produção</small></div>' +
      '<div class="faixa__item"><span>Aguardando início</span><strong>' + todos.filter((p) => p.status === 'aguardando').length + '</strong><small>contratados e não iniciados</small></div>' +
      '<div class="faixa__item' + (atencao.length ? ' faixa__item--alerta' : '') + '"><span>Prazo crítico</span><strong>' + atencao.length + '</strong><small>' + (atrasados ? util.plural(atrasados, 'atrasado', 'atrasados') : 'vencem em até ' + DIAS_DE_ALERTA + ' dias') + '</small></div>' +
      '<div class="faixa__item"><span>Entregues</span><strong>' + todos.filter((p) => p.status === 'entregue').length + '</strong><small>de ' + util.plural(todos.length, 'projeto', 'projetos') + '</small></div>');

    const chips = [['andamento', 'Em andamento', andamento.length], ['atencao', 'Prazo crítico', atencao.length], ['finalizados', 'Finalizados', todos.length - andamento.length], ['todos', 'Todos', todos.length]];
    ui.render('#filtros-projetos', chips.map(([id, rotulo, total]) => '<button type="button" class="chip' + (tela.filtro === id ? ' chip--ativo' : '') + '" data-filtro="' + id + '" aria-pressed="' + (tela.filtro === id) + '">' + rotulo + '<span>' + total + '</span></button>').join(''));

    const alvo = document.getElementById('lista-projetos');
    if (!todos.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'kanban', titulo: 'Nenhum projeto contratado', texto: 'Um projeto é criado automaticamente quando o cliente aprova uma proposta. Envie um orçamento e conduza a negociação até o fechamento.', acao: { rotulo: 'Ir para Orçamentos', href: 'orcamentos.html', icone: 'file-text' } }));
      return;
    }
    const lista = projetosFiltrados();
    if (!lista.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'list-filter', titulo: 'Nenhum projeto neste filtro', texto: tela.filtro === 'atencao' ? 'Nenhum projeto está atrasado ou perto do prazo.' : 'Escolha outro filtro para ver os demais projetos.', compacto: true }));
      return;
    }

    ui.render(alvo, lista.map((p) => {
      const cliente = SS.Clientes.buscar(p.clienteId);
      const etapa = etapaDe(p);
      const proxima = ETAPAS[indiceDe(p.status) + 1];
      const prazo = situacaoPrazo(p);
      return '<article class="projeto projeto--' + prazo.tipo + '" id="projeto-' + p.id + '">' +
        '<header class="projeto__topo">' +
          '<div><p class="projeto__codigo"><span class="mono">' + p.codigo + '</span>' + ui.seloDemo(p) + '</p>' +
            '<h2><button type="button" class="celula-link" data-acao="detalhes" data-id="' + p.id + '">' + util.esc(p.nome) + '</button></h2>' +
            '<p class="projeto__cliente">' + util.esc(cliente ? cliente.nome : 'Cliente removido') + '</p></div>' +
          '<div class="projeto__numeros"><strong>' + util.moeda(p.valorContratado) + '</strong>' + htmlPrazo(p) + '</div>' +
        '</header>' +
        '<div class="projeto__andamento">' + htmlProgresso(p) + htmlTrilha(p) + '</div>' +
        '<footer class="projeto__rodape">' + ui.selo(etapa.rotulo, etapa.tom) +
          '<span class="projeto__espaco"></span>' +
          (p.status !== 'entregue'
            ? '<label class="so-leitor" for="etapa-' + p.id + '">Alterar etapa de ' + util.esc(p.nome) + '</label>' +
              '<select class="entrada entrada--p" id="etapa-' + p.id + '" data-mudar-etapa="' + p.id + '">' + ETAPAS.map((e) => '<option value="' + e.id + '"' + (e.id === p.status ? ' selected' : '') + '>' + e.rotulo + '</option>').join('') + '</select>'
            : '') +
          (proxima ? '<button type="button" class="botao botao--primario botao--p" data-acao="avancar" data-id="' + p.id + '" data-etapa="' + proxima.id + '">' + ui.icone('arrow-right') + (p.status === 'aguardando' ? 'Iniciar projeto' : proxima.id === 'entregue' ? 'Registrar entrega' : 'Avançar para ' + proxima.rotulo.toLowerCase()) + '</button>' : '') +
          '<button type="button" class="botao botao--fantasma botao--p" data-acao="detalhes" data-id="' + p.id + '">Detalhes</button>' +
        '</footer></article>';
    }).join(''));
  }

  const projetosFiltradosIncluem = (id) => projetosFiltrados().some((p) => p.id === id);

  function aplicarMudanca(id, novoStatus) {
    const resultado = mudarStatus(id, novoStatus);
    if (!resultado.ok) ui.toast(resultado.mensagem, 'aviso');
    else ui.toast(novoStatus === 'entregue' ? 'Entrega registrada. As parcelas vinculadas à entrega já podem ser cobradas.' : 'Projeto movido para ' + resultado.etapa.rotulo.toLowerCase() + '.', 'sucesso', novoStatus === 'entregue' ? { link: { href: 'financeiro.html', rotulo: 'Ver contas a receber' } } : undefined);
    // O projeto saiu do filtro atual (ex.: concluído): mostra todos para ele não sumir da tela.
    if (resultado.ok && tela.filtro !== 'todos' && !projetosFiltradosIncluem(id)) tela.filtro = 'todos';
    desenharPagina();
    SS.App.dadosAlterados();
    return resultado.ok;
  }

  function abrirDetalhes(id) {
    const p = buscar(id);
    if (!p) { ui.toast('Projeto não encontrado.', 'erro'); return; }
    const cliente = SS.Clientes.buscar(p.clienteId);
    const orcamento = SS.Orcamentos.buscar(p.orcamentoId);
    const etapa = etapaDe(p);
    const receitas = Storage.ler('receitas').filter((r) => r.projetoId === p.id).sort((a, b) => a.parcela - b.parcela);
    const despesas = Storage.ler('despesas').filter((d) => d.projetoId === p.id);
    const recebido = util.somar(receitas.filter((r) => r.status === 'recebido'), (r) => r.valor);
    const gasto = util.somar(despesas, (d) => d.valor);

    const htmlParcelas = receitas.length ? '<ul class="lista-simples">' + receitas.map((r) => {
      const estado = SS.Financeiro.situacaoReceita(r);
      return '<li><span>Parcela ' + r.parcela + '/' + r.totalParcelas + '<small>' + (r.status === 'recebido' ? 'Recebida em ' + util.data(r.recebidoEm) : 'Vence em ' + util.data(r.vencimento) + (r.naEntrega && p.status !== 'entregue' ? ' (na entrega)' : '')) + '</small></span>' +
        '<span class="num">' + util.moeda(r.valor) + '</span>' + ui.selo(estado.rotulo, estado.tom) + '</li>';
    }).join('') + '</ul>' : '<p class="texto-suave">Sem parcelas registradas.</p>';

    const htmlHistorico = '<ol class="linha-tempo">' + p.historico.slice().reverse().map((h) => {
      const e = ETAPAS[indiceDe(h.status)] || etapa;
      return '<li><span class="linha-tempo__icone">' + ui.icone(e.icone) + '</span><div><span>' + e.rotulo + '</span><small>' + util.dataHora(h.data) + '</small></div></li>';
    }).join('') + '</ol>';

    ui.modal({
      titulo: p.nome, subtitulo: p.codigo + (cliente ? ' · ' + cliente.nome : ''), tamanho: 'g',
      conteudo: '<div class="detalhe">' +
        '<div class="detalhe__topo">' + ui.selo(etapa.rotulo, etapa.tom) + htmlPrazo(p) + ui.seloDemo(p) + '</div>' +
        htmlProgresso(p) + htmlTrilha(p) +
        '<dl class="ficha">' +
          '<div><dt>Cliente</dt><dd>' + (cliente ? '<a href="clientes.html?id=' + cliente.id + '">' + util.esc(cliente.nome) + '</a>' : 'Removido') + '</dd></div>' +
          '<div><dt>Tipo de site</dt><dd>' + util.esc(p.tipoSite) + '</dd></div>' +
          '<div><dt>Valor contratado</dt><dd>' + util.moeda(p.valorContratado) + '</dd></div>' +
          '<div><dt>Contrato</dt><dd>' + util.data(p.dataContrato) + '</dd></div>' +
          '<div><dt>Início</dt><dd>' + (p.dataInicio ? util.data(p.dataInicio) : 'Ainda não iniciado') + '</dd></div>' +
          '<div><dt>Prazo de entrega</dt><dd>' + util.data(p.prazoEntrega) + ' (' + p.prazoDias + ' dias)</dd></div>' +
          '<div><dt>Proposta</dt><dd>' + (orcamento ? '<a class="mono" href="orcamentos.html?ver=' + orcamento.id + '">' + orcamento.codigo + '</a>' : '—') + '</dd></div>' +
        '</dl>' +
        '<section><h3 class="subtitulo">Serviços incluídos</h3><ul class="lista-etiquetas">' + p.servicos.map((s) => '<li class="etiqueta">' + util.esc(s) + '</li>').join('') + '</ul></section>' +
        '<section><h3 class="subtitulo">Financeiro do projeto</h3>' +
          '<dl class="ficha"><div><dt>Recebido</dt><dd>' + util.moeda(recebido) + ' de ' + util.moeda(p.valorContratado) + '</dd></div>' +
          '<div><dt>Custos previstos</dt><dd>' + util.moeda(p.custoPrevisto) + '</dd></div>' +
          '<div><dt>Despesas registradas</dt><dd>' + util.moeda(gasto) + (despesas.length ? ' <small>(' + despesas.length + ')</small>' : '') + '</dd></div>' +
          '<div><dt>Resultado até agora</dt><dd>' + util.moeda(recebido - gasto) + '</dd></div></dl>' + htmlParcelas + '</section>' +
        '<section><h3 class="subtitulo">Histórico de etapas</h3>' + htmlHistorico + '</section></div>',
      acoes: [
        { rotulo: 'Registrar despesa', variante: 'fantasma', icone: 'receipt', aoClicar() { setTimeout(() => SS.Financeiro.abrirFormularioDespesa(null, { projetoId: p.id, aoSalvar: () => abrirDetalhes(p.id) }), 180); } },
        { rotulo: 'Contas a receber', variante: 'secundario', icone: 'wallet', aoClicar() { global.location.href = 'financeiro.html'; return false; } },
        { rotulo: 'Fechar', variante: 'primario' },
      ],
    });
  }

  function montarPagina() {
    const raiz = document.getElementById('conteudo');
    ui.delegar(raiz, 'click', '[data-filtro]', (evento, chip) => { tela.filtro = chip.dataset.filtro; desenharPagina(); });
    ui.delegar(raiz, 'click', '[data-acao]', (evento, botao) => {
      if (botao.dataset.acao === 'avancar') aplicarMudanca(botao.dataset.id, botao.dataset.etapa);
      if (botao.dataset.acao === 'detalhes') abrirDetalhes(botao.dataset.id);
    });
    raiz.addEventListener('change', (evento) => {
      const seletor = evento.target.closest('[data-mudar-etapa]');
      if (seletor) aplicarMudanca(seletor.dataset.mudarEtapa, seletor.value);
    });

    const pedido = util.parametro('id');
    const projeto = pedido ? buscar(pedido) : null;
    if (projeto) tela.filtro = 'todos';
    else if (!listar().some(emAndamento) && listar().length) tela.filtro = 'todos';
    desenharPagina();
    if (projeto) {
      const cartao = document.getElementById('projeto-' + projeto.id);
      if (cartao) { cartao.classList.add('projeto--destaque'); cartao.scrollIntoView({ block: 'center' }); }
    }
  }

  SS.Projetos = { ETAPAS, FINALIZADOS, DIAS_DE_ALERTA, listar, buscar, etapaDe, emAndamento, criarDeOrcamento, situacaoPrazo, bloqueioDeMudanca, mudarStatus, verificarPrazos, htmlProgresso, htmlTrilha, htmlPrazo };
  SS.App.paginas.projetos = montarPagina;
})(window);
