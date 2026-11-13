/*
 * SiteSeller — financeiro.js
 * Contas a receber (parcelas das vendas), despesas e indicadores.
 * Regra central: venda aprovada é valor contratado, não dinheiro em caixa.
 * O lucro considera apenas pagamentos efetivamente recebidos e despesas registradas.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const CATEGORIAS_DESPESA = [
    { nome: 'Hospedagem', icone: 'server' },
    { nome: 'Domínio', icone: 'globe' },
    { nome: 'Ferramentas', icone: 'wrench' },
    { nome: 'Serviços terceirizados', icone: 'users-round' },
    { nome: 'Marketing', icone: 'megaphone' },
    { nome: 'Outras despesas', icone: 'receipt' },
  ];

  /* ---------- Receitas ---------- */

  /** Cria as parcelas a receber de uma venda. Todas nascem pendentes. */
  function gerarParcelas(orcamento, projeto, opcoes) {
    const base = projeto.dataContrato;
    const plano = SS.Orcamentos.parcelas(orcamento, projeto.valorContratado, base, projeto.prazoEntrega);
    const receitas = plano.map((parcela) => {
      const receita = {
        id: Storage.gerarId('rec'), projetoId: projeto.id, clienteId: projeto.clienteId, orcamentoId: orcamento.id,
        descricao: projeto.nome, parcela: parcela.numero, totalParcelas: parcela.total,
        valor: parcela.valor, vencimento: parcela.vencimento, naEntrega: parcela.naEntrega,
        status: 'pendente', recebidoEm: null,
      };
      if (opcoes && opcoes.demo) receita.demo = true;
      return receita;
    });
    Storage.gravar('receitas', Storage.ler('receitas').concat(receitas));
    return receitas;
  }

  /** Parcela "na entrega" só passa a ser cobrável quando o projeto é entregue. */
  function aguardandoEntrega(receita, projetos) {
    if (!receita.naEntrega || receita.liberada || receita.status === 'recebido') return false;
    const projeto = (projetos || Storage.ler('projetos')).find((p) => p.id === receita.projetoId);
    return Boolean(projeto) && projeto.status !== 'entregue';
  }

  function emAtraso(receita, projetos) {
    return receita.status === 'pendente' && !aguardandoEntrega(receita, projetos) && receita.vencimento < util.hoje();
  }

  function situacaoReceita(receita, projetos) {
    if (receita.status === 'recebido') return { id: 'recebido', rotulo: 'Recebido', tom: 'ouro' };
    if (aguardandoEntrega(receita, projetos)) return { id: 'entrega', rotulo: 'Na entrega', tom: 'neutro' };
    if (emAtraso(receita, projetos)) return { id: 'atraso', rotulo: 'Em atraso', tom: 'vinho' };
    return { id: 'aberto', rotulo: 'A receber', tom: 'champanhe' };
  }

  function registrarPagamento(id, data) {
    const receita = Storage.atualizar('receitas', id, { status: 'recebido', recebidoEm: data || util.hoje() });
    if (!receita) return null;
    SS.Notificacoes.criar({
      tipo: 'pagamento', titulo: 'Pagamento recebido',
      mensagem: SS.Clientes.nomeDe(receita.clienteId) + ' pagou ' + util.moeda(receita.valor) + ' (parcela ' + receita.parcela + '/' + receita.totalParcelas + ').',
      link: 'financeiro.html',
    });
    return receita;
  }

  function desfazerPagamento(id) {
    return Storage.atualizar('receitas', id, { status: 'pendente', recebidoEm: null });
  }

  /** Na entrega do projeto, as parcelas vinculadas vencem no próprio dia. Retorna quantas foram liberadas. */
  function liberarParcelasDaEntrega(projetoId) {
    let liberadas = 0;
    Storage.gravar('receitas', Storage.ler('receitas').map((r) => {
      if (r.projetoId === projetoId && r.naEntrega && r.status === 'pendente' && !r.liberada) {
        liberadas += 1;
        return Object.assign(r, { vencimento: util.hoje(), liberada: true });
      }
      return r;
    }));
    return liberadas;
  }

  /** Avisa, uma vez por parcela, quando um pagamento passa do vencimento. */
  function verificarAtrasos() {
    const projetos = Storage.ler('projetos');
    Storage.ler('receitas').filter((r) => emAtraso(r, projetos) && !r.avisoAtraso).forEach((r) => {
      SS.Notificacoes.criar({
        tipo: 'pendencia', titulo: 'Pagamento pendente',
        mensagem: 'A parcela ' + r.parcela + '/' + r.totalParcelas + ' de ' + SS.Clientes.nomeDe(r.clienteId) + ' (' + util.moeda(r.valor) + ') venceu em ' + util.data(r.vencimento) + '.',
        link: 'financeiro.html', demo: Boolean(r.demo),
      });
      Storage.atualizar('receitas', r.id, { avisoAtraso: true });
    });
  }

  /* ---------- Períodos e indicadores ---------- */

  const PERIODOS = {
    mes: 'Este mês', trimestre: 'Últimos 90 dias', ano: 'Este ano', tudo: 'Todo o período', personalizado: 'Personalizado',
  };

  function intervaloDe(periodo, inicio, fim) {
    const hoje = util.hoje();
    if (periodo === 'mes') return { inicio: hoje.slice(0, 8) + '01', fim: hoje };
    if (periodo === 'trimestre') return { inicio: util.somarDias(hoje, -89), fim: hoje };
    if (periodo === 'ano') return { inicio: hoje.slice(0, 4) + '-01-01', fim: hoje };
    if (periodo === 'personalizado') return { inicio: inicio || '', fim: fim || '' };
    return { inicio: '', fim: '' };
  }

  function noIntervalo(data, intervalo) {
    if (!data) return false;
    const dia = util.paraDia(data);
    return (!intervalo.inicio || dia >= intervalo.inicio) && (!intervalo.fim || dia <= intervalo.fim);
  }

  /**
   * Indicadores financeiros. Valores pendentes são um saldo (independem do período);
   * os demais consideram o intervalo informado.
   */
  function indicadores(intervalo) {
    intervalo = intervalo || { inicio: '', fim: '' };
    const receitas = Storage.ler('receitas');
    const projetos = Storage.ler('projetos');
    const despesas = Storage.ler('despesas').filter((d) => noIntervalo(d.data, intervalo));
    const recebidas = receitas.filter((r) => r.status === 'recebido' && noIntervalo(r.recebidoEm, intervalo));
    const pendentes = receitas.filter((r) => r.status === 'pendente');

    const contratado = util.somar(projetos.filter((p) => noIntervalo(p.dataContrato, intervalo)), (p) => p.valorContratado);
    const recebido = util.somar(recebidas, (r) => r.valor);
    const totalDespesas = util.somar(despesas, (d) => d.valor);
    const lucro = recebido - totalDespesas;
    return {
      contratado, recebido,
      pendente: util.somar(pendentes, (r) => r.valor),
      emAtraso: util.somar(pendentes.filter((r) => emAtraso(r, projetos)), (r) => r.valor),
      parcelasPendentes: pendentes.length,
      despesas: totalDespesas, lucro,
      margem: recebido > 0 ? (lucro / recebido) * 100 : null,
    };
  }

  /* =====================================================================
   * Página do financeiro
   * ===================================================================== */

  const tela = { periodo: 'tudo', inicio: '', fim: '', aba: 'receitas', situacao: 'pendentes', categoria: '' };

  const intervaloAtual = () => intervaloDe(tela.periodo, tela.inicio, tela.fim);

  function textoDoIntervalo() {
    const i = intervaloAtual();
    if (!i.inicio && !i.fim) return 'todo o período';
    if (i.inicio && i.fim) return util.data(i.inicio) + ' a ' + util.data(i.fim);
    return i.inicio ? 'a partir de ' + util.data(i.inicio) : 'até ' + util.data(i.fim);
  }

  function desenharIndicadores() {
    const ind = indicadores(intervaloAtual());
    const item = (rotulo, valor, nota, classe) => '<div class="indicador' + (classe ? ' ' + classe : '') + '"><span class="indicador__rotulo">' + rotulo + '</span><strong class="indicador__valor">' + valor + '</strong><small>' + nota + '</small></div>';
    ui.render('#indicadores-financeiros',
      item('Lucro líquido', util.moeda(ind.lucro), 'Recebido menos despesas em ' + textoDoIntervalo(), 'indicador--principal' + (ind.lucro < 0 ? ' indicador--negativo' : '')) +
      item('Faturamento contratado', util.moeda(ind.contratado), 'Vendas fechadas no período') +
      item('Faturamento recebido', util.moeda(ind.recebido), 'Pagamentos que entraram no caixa') +
      item('Valores pendentes', util.moeda(ind.pendente), ind.emAtraso ? util.moeda(ind.emAtraso) + ' em atraso' : util.plural(ind.parcelasPendentes, 'parcela em aberto', 'parcelas em aberto'), ind.emAtraso ? 'indicador--alerta' : '') +
      item('Total de despesas', util.moeda(ind.despesas), 'Lançadas no período') +
      item('Margem de lucro', ind.margem === null ? '—' : util.percentual(ind.margem), ind.margem === null ? 'Sem recebimentos no período' : 'Lucro sobre o valor recebido'));
  }

  function desenharReceitas() {
    const projetos = Storage.ler('projetos');
    const intervalo = intervaloAtual();
    const todas = Storage.ler('receitas');
    const alvo = document.getElementById('painel-receitas');
    if (!todas.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'hand-coins', titulo: 'Nenhuma conta a receber', texto: 'As parcelas aparecem aqui quando um cliente aprova uma proposta. Registre cada pagamento quando o dinheiro entrar.', acao: { rotulo: 'Ir para Negociações', href: 'negociacoes.html', icone: 'messages-square' } }));
      return;
    }
    const lista = todas.filter((r) => {
      if (tela.situacao === 'pendentes') return r.status === 'pendente';
      if (tela.situacao === 'atraso') return emAtraso(r, projetos);
      if (tela.situacao === 'recebidas') return r.status === 'recebido' && noIntervalo(r.recebidoEm, intervalo);
      return r.status === 'pendente' || noIntervalo(r.recebidoEm, intervalo);
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pendente' ? -1 : 1;
      return a.status === 'pendente' ? (a.vencimento < b.vencimento ? -1 : 1) : (a.recebidoEm < b.recebidoEm ? 1 : -1);
    });

    const opcoes = [['pendentes', 'Pendentes'], ['atraso', 'Em atraso'], ['recebidas', 'Recebidas no período'], ['todas', 'Todas']];
    const barra = '<div class="barra-filtros"><div class="campo campo--linha"><label class="campo__rotulo" for="filtro-situacao">Situação</label><select class="entrada entrada--p" id="filtro-situacao">' +
      opcoes.map(([id, rotulo]) => '<option value="' + id + '"' + (tela.situacao === id ? ' selected' : '') + '>' + rotulo + '</option>').join('') + '</select></div>' +
      '<p class="texto-suave">Pendências são um saldo e não dependem do período selecionado.</p></div>';

    if (!lista.length) {
      ui.render(alvo, barra + ui.estadoVazio({ icone: 'check-check', titulo: 'Nada nesta situação', texto: tela.situacao === 'atraso' ? 'Nenhum pagamento em atraso.' : 'Nenhuma parcela corresponde ao filtro e ao período.', compacto: true }));
      return;
    }
    const linhas = lista.map((r) => {
      const estado = situacaoReceita(r, projetos);
      const projeto = projetos.find((p) => p.id === r.projetoId);
      const data = r.status === 'recebido' ? util.data(r.recebidoEm) + '<small>recebido</small>' : util.data(r.vencimento) + '<small>' + (estado.id === 'entrega' ? 'previsão de entrega' : util.prazoEmTexto(util.diasAte(r.vencimento)).replace(/faltam?/, 'vence em')) + '</small>';
      const acao = r.status === 'recebido'
        ? '<button type="button" class="botao botao--fantasma botao--p" data-acao="desfazer-pagamento" data-id="' + r.id + '">' + ui.icone('undo-2') + 'Desfazer</button>'
        : '<button type="button" class="botao botao--' + (estado.id === 'entrega' ? 'secundario' : 'primario') + ' botao--p" data-acao="registrar-pagamento" data-id="' + r.id + '">' + ui.icone('banknote') + 'Registrar pagamento</button>';
      return '<tr><td>' + data + '</td>' +
        '<td data-rotulo="Cliente"><strong>' + util.esc(SS.Clientes.nomeDe(r.clienteId)) + '</strong>' + ui.seloDemo(r) + '</td>' +
        '<td data-rotulo="Projeto">' + (projeto ? '<a href="projetos.html?id=' + projeto.id + '">' + util.esc(projeto.nome) + '</a>' : util.esc(r.descricao)) + '<small>Parcela ' + r.parcela + ' de ' + r.totalParcelas + '</small></td>' +
        '<td class="num" data-rotulo="Valor"><strong>' + util.moeda(r.valor) + '</strong></td>' +
        '<td data-rotulo="Situação">' + ui.selo(estado.rotulo, estado.tom) + '</td>' +
        '<td class="acoes">' + acao + '</td></tr>';
    }).join('');
    ui.render(alvo, barra + '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Data</th><th>Cliente</th><th>Projeto</th><th class="num">Valor</th><th>Situação</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhas + '</tbody>' +
      '<tfoot><tr><th colspan="3" scope="row">Total listado (' + lista.length + ')</th><td class="num"><strong>' + util.moeda(util.somar(lista, (r) => r.valor)) + '</strong></td><td colspan="2"></td></tr></tfoot></table></div>');
  }

  function desenharDespesas() {
    const intervalo = intervaloAtual();
    const todas = Storage.ler('despesas');
    const alvo = document.getElementById('painel-despesas');
    const cabecalho = '<div class="barra-filtros"><div class="campo campo--linha"><label class="campo__rotulo" for="filtro-categoria">Categoria</label><select class="entrada entrada--p" id="filtro-categoria"><option value="">Todas</option>' +
      CATEGORIAS_DESPESA.map((c) => '<option' + (tela.categoria === c.nome ? ' selected' : '') + '>' + c.nome + '</option>').join('') + '</select></div>' +
      '<button type="button" class="botao botao--primario" data-acao="nova-despesa">' + ui.icone('plus') + 'Nova despesa</button></div>';
    if (!todas.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'receipt', titulo: 'Nenhuma despesa registrada', texto: 'Lance hospedagem, domínio, ferramentas, terceirizados e marketing. O lucro líquido só considera o que estiver registrado aqui.', acao: { rotulo: 'Nova despesa', acao: 'nova-despesa' } }));
      return;
    }
    const lista = todas.filter((d) => noIntervalo(d.data, intervalo) && (!tela.categoria || d.categoria === tela.categoria)).sort((a, b) => (a.data < b.data ? 1 : -1));
    if (!lista.length) {
      ui.render(alvo, cabecalho + ui.estadoVazio({ icone: 'search-x', titulo: 'Nenhuma despesa no filtro', texto: 'Não há lançamentos para a categoria e o período selecionados.', compacto: true }));
      return;
    }
    const projetos = Storage.ler('projetos');
    const linhas = lista.map((d) => {
      const categoria = CATEGORIAS_DESPESA.find((c) => c.nome === d.categoria) || CATEGORIAS_DESPESA[5];
      const projeto = d.projetoId ? projetos.find((p) => p.id === d.projetoId) : null;
      return '<tr><td>' + util.data(d.data) + '</td>' +
        '<td data-rotulo="Descrição"><strong>' + util.esc(d.descricao) + '</strong>' + ui.seloDemo(d) + (projeto ? '<small>Projeto: ' + util.esc(projeto.nome) + '</small>' : '') + '</td>' +
        '<td data-rotulo="Categoria"><span class="categoria">' + ui.icone(categoria.icone) + util.esc(d.categoria) + '</span></td>' +
        '<td class="num" data-rotulo="Valor"><strong>' + util.moeda(d.valor) + '</strong></td>' +
        '<td class="acoes"><button type="button" class="botao-icone" data-acao="editar-despesa" data-id="' + d.id + '" aria-label="Editar despesa ' + util.esc(d.descricao) + '" title="Editar">' + ui.icone('pencil') + '</button>' +
        '<button type="button" class="botao-icone" data-acao="excluir-despesa" data-id="' + d.id + '" aria-label="Excluir despesa ' + util.esc(d.descricao) + '" title="Excluir">' + ui.icone('trash-2') + '</button></td></tr>';
    }).join('');
    ui.render(alvo, cabecalho + '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhas + '</tbody>' +
      '<tfoot><tr><th colspan="3" scope="row">Total listado (' + lista.length + ')</th><td class="num"><strong>' + util.moeda(util.somar(lista, (d) => d.valor)) + '</strong></td><td></td></tr></tfoot></table></div>');
  }

  function desenharHistorico() {
    const intervalo = intervaloAtual();
    const alvo = document.getElementById('painel-historico');
    const entradas = Storage.ler('receitas').filter((r) => r.status === 'recebido' && noIntervalo(r.recebidoEm, intervalo))
      .map((r) => ({ data: util.paraDia(r.recebidoEm), tipo: 'entrada', descricao: 'Parcela ' + r.parcela + '/' + r.totalParcelas + ' — ' + r.descricao, detalhe: SS.Clientes.nomeDe(r.clienteId), valor: r.valor }));
    const saidas = Storage.ler('despesas').filter((d) => noIntervalo(d.data, intervalo))
      .map((d) => ({ data: d.data, tipo: 'saida', descricao: d.descricao, detalhe: d.categoria, valor: d.valor }));
    const lista = entradas.concat(saidas).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    if (!lista.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'history', titulo: 'Sem movimentações no período', texto: 'O histórico reúne pagamentos recebidos e despesas lançadas em ' + textoDoIntervalo() + '.', compacto: true }));
      return;
    }
    const totalEntradas = util.somar(entradas, (e) => e.valor);
    const totalSaidas = util.somar(saidas, (s) => s.valor);
    ui.render(alvo, '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Data</th><th>Movimentação</th><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>' +
      lista.map((m) => '<tr><td>' + util.data(m.data) + '</td><td data-rotulo="Movimentação"><strong>' + util.esc(m.descricao) + '</strong><small>' + util.esc(m.detalhe) + '</small></td>' +
        '<td data-rotulo="Tipo"><span class="movimento movimento--' + m.tipo + '">' + ui.icone(m.tipo === 'entrada' ? 'arrow-down-left' : 'arrow-up-right') + (m.tipo === 'entrada' ? 'Recebimento' : 'Despesa') + '</span></td>' +
        '<td class="num" data-rotulo="Valor"><strong>' + (m.tipo === 'entrada' ? '+ ' : '− ') + util.moeda(m.valor) + '</strong></td></tr>').join('') +
      '</tbody><tfoot><tr><th colspan="3" scope="row">Recebimentos</th><td class="num">+ ' + util.moeda(totalEntradas) + '</td></tr>' +
      '<tr><th colspan="3" scope="row">Despesas</th><td class="num">− ' + util.moeda(totalSaidas) + '</td></tr>' +
      '<tr class="tabela__total"><th colspan="3" scope="row">Resultado do período</th><td class="num"><strong>' + util.moeda(totalEntradas - totalSaidas) + '</strong></td></tr></tfoot></table></div>');
  }

  function desenharPagina() {
    desenharIndicadores();
    desenharReceitas();
    desenharDespesas();
    desenharHistorico();
    document.getElementById('periodo-personalizado').hidden = tela.periodo !== 'personalizado';
    document.getElementById('texto-periodo').textContent = 'Exibindo ' + textoDoIntervalo() + '.';
  }

  /* ---------- Formulários ---------- */

  function abrirPagamento(id) {
    const receita = Storage.buscar('receitas', id);
    if (!receita) return;
    const projeto = Storage.buscar('projetos', receita.projetoId);
    const antecipada = aguardandoEntrega(receita);
    const modal = ui.modal({
      titulo: 'Registrar pagamento', tamanho: 'p',
      subtitulo: SS.Clientes.nomeDe(receita.clienteId) + ' · parcela ' + receita.parcela + '/' + receita.totalParcelas,
      conteudo: '<form id="form-pagamento" novalidate><p class="valor-destaque">' + util.moeda(receita.valor) + '</p>' +
        (antecipada ? '<p class="aviso aviso--info">' + ui.icone('info') + '<span>Esta parcela está vinculada à entrega do projeto, que ainda não ocorreu. Registre apenas se o cliente antecipou o pagamento.</span></p>' : '') +
        ui.campo({ nome: 'data', tipo: 'date', rotulo: 'Data do recebimento', valor: util.hoje(), obrigatorio: true, atributos: 'max="' + util.hoje() + '"' }) + '</form>',
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: 'Confirmar recebimento', variante: 'primario', icone: 'check', aoClicar(m) { m.corpo.querySelector('form').requestSubmit(); return false; } },
      ],
    });
    ui.ligarFormulario(modal.corpo.querySelector('form'), {
      data: (valor) => {
        if (valor > util.hoje()) return 'A data não pode estar no futuro.';
        if (projeto && valor < projeto.dataContrato) return 'O pagamento não pode ser anterior ao contrato (' + util.data(projeto.dataContrato) + ').';
        return '';
      },
    }, (dados) => {
      registrarPagamento(id, dados.data);
      modal.fechar();
      desenharPagina();
      SS.App.dadosAlterados();
      ui.toast('Pagamento de ' + util.moeda(receita.valor) + ' registrado.');
    });
  }

  /** Formulário de despesa. opcoes: { projetoId, aoSalvar } — usado também pela página de projetos. */
  function abrirFormularioDespesa(despesa, opcoes) {
    opcoes = opcoes || {};
    const nova = !despesa;
    const d = despesa || { categoria: opcoes.projetoId ? 'Serviços terceirizados' : '', descricao: '', valor: '', data: util.hoje(), projetoId: opcoes.projetoId || '' };
    const projetos = Storage.ler('projetos');
    const modal = ui.modal({
      titulo: nova ? 'Nova despesa' : 'Editar despesa',
      conteudo: '<form id="form-despesa" class="grade-form" novalidate>' +
        ui.campo({ nome: 'descricao', rotulo: 'Descrição', valor: d.descricao, obrigatorio: true, maximo: 80, classe: 'campo--largo', exemplo: 'Ex.: Hospedagem mensal dos sites' }) +
        ui.campo({ nome: 'categoria', tipo: 'select', rotulo: 'Categoria', valor: d.categoria, obrigatorio: true, vazio: 'Selecione', opcoes: CATEGORIAS_DESPESA.map((c) => ({ valor: c.nome, rotulo: c.nome })) }) +
        ui.campo({ nome: 'valor', tipo: 'moeda', rotulo: 'Valor', valor: d.valor, obrigatorio: true, minimo: 0.01 }) +
        ui.campo({ nome: 'data', tipo: 'date', rotulo: 'Data', valor: d.data, obrigatorio: true, atributos: 'max="' + util.hoje() + '"' }) +
        ui.campo({ nome: 'projetoId', tipo: 'select', rotulo: 'Projeto relacionado', valor: d.projetoId || '', vazio: 'Despesa geral da agência', opcoes: projetos.map((p) => ({ valor: p.id, rotulo: p.codigo + ' — ' + p.nome })) }) +
        '</form>',
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: nova ? 'Registrar despesa' : 'Salvar alterações', variante: 'primario', aoClicar(m) { m.corpo.querySelector('form').requestSubmit(); return false; } },
      ],
    });
    ui.ligarFormulario(modal.corpo.querySelector('form'), {
      descricao: (valor) => (valor.length < 3 ? 'Descreva a despesa com pelo menos 3 caracteres.' : ''),
      data: (valor) => (valor > util.hoje() ? 'Registre apenas despesas já realizadas.' : ''),
    }, (dados) => {
      if (nova) Storage.inserir('despesas', Object.assign({ id: Storage.gerarId('dsp') }, dados));
      else Storage.atualizar('despesas', d.id, dados);
      modal.fechar();
      ui.toast(nova ? 'Despesa registrada.' : 'Despesa atualizada.');
      if (opcoes.aoSalvar) opcoes.aoSalvar(); else desenharPagina();
    });
  }

  function montarPagina() {
    const raiz = document.getElementById('conteudo');
    const seletorPeriodo = document.getElementById('filtro-periodo');
    seletorPeriodo.innerHTML = Object.keys(PERIODOS).map((id) => '<option value="' + id + '">' + PERIODOS[id] + '</option>').join('');
    seletorPeriodo.value = tela.periodo;
    seletorPeriodo.addEventListener('change', () => { tela.periodo = seletorPeriodo.value; desenharPagina(); });

    const inicio = document.getElementById('periodo-inicio');
    const fim = document.getElementById('periodo-fim');
    const erroPeriodo = document.getElementById('erro-periodo');
    const aoMudarDatas = () => {
      const invalido = inicio.value && fim.value && inicio.value > fim.value;
      erroPeriodo.hidden = !invalido;
      if (invalido) return;
      tela.inicio = inicio.value; tela.fim = fim.value;
      desenharPagina();
    };
    inicio.addEventListener('change', aoMudarDatas);
    fim.addEventListener('change', aoMudarDatas);

    const ativarAba = ui.ligarAbas(raiz, (nome) => { tela.aba = nome; });
    const abaPedida = util.parametro('aba');
    ativarAba(['receitas', 'despesas', 'historico'].includes(abaPedida) ? abaPedida : 'receitas');

    raiz.addEventListener('change', (evento) => {
      if (evento.target.id === 'filtro-situacao') { tela.situacao = evento.target.value; desenharReceitas(); }
      if (evento.target.id === 'filtro-categoria') { tela.categoria = evento.target.value; desenharDespesas(); }
    });

    ui.delegar(raiz, 'click', '[data-acao]', async (evento, botao) => {
      const { acao, id } = botao.dataset;
      if (acao === 'registrar-pagamento') abrirPagamento(id);
      if (acao === 'nova-despesa') abrirFormularioDespesa(null);
      if (acao === 'editar-despesa') abrirFormularioDespesa(Storage.buscar('despesas', id));
      if (acao === 'desfazer-pagamento') {
        const receita = Storage.buscar('receitas', id);
        const seguir = await ui.confirmar({ titulo: 'Desfazer recebimento', mensagem: 'A parcela de ' + util.moeda(receita.valor) + ' volta para pendente e sai do faturamento recebido.', rotuloConfirmar: 'Desfazer', icone: 'undo-2' });
        if (seguir) { desfazerPagamento(id); desenharPagina(); ui.toast('Recebimento desfeito.', 'info'); }
      }
      if (acao === 'excluir-despesa') {
        const despesa = Storage.buscar('despesas', id);
        const seguir = await ui.confirmar({ titulo: 'Excluir despesa', mensagem: 'Excluir "' + despesa.descricao + '" (' + util.moeda(despesa.valor) + ')? O lucro será recalculado.', rotuloConfirmar: 'Excluir', perigo: true, icone: 'trash-2' });
        if (seguir) { Storage.remover('despesas', id); desenharPagina(); ui.toast('Despesa excluída.'); }
      }
    });

    desenharPagina();
  }

  SS.Financeiro = {
    CATEGORIAS_DESPESA, PERIODOS,
    gerarParcelas, situacaoReceita, emAtraso, aguardandoEntrega, registrarPagamento, desfazerPagamento,
    liberarParcelasDaEntrega, verificarAtrasos, indicadores, intervaloDe, noIntervalo, abrirFormularioDespesa,
  };
  SS.App.paginas.financeiro = montarPagina;
})(window);
