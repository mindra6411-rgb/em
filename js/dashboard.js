/*
 * SiteSeller — dashboard.js
 * Página inicial. Todos os números são calculados a partir dos dados armazenados.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const tela = { meses: 6 };
  const graficos = {};

  const ENVIADOS = ['enviado', 'negociacao', 'aprovado', 'recusado', 'expirado'];

  function carregarDados() {
    return {
      clientes: Storage.ler('clientes'), orcamentos: Storage.ler('orcamentos'), negociacoes: Storage.ler('negociacoes'),
      projetos: Storage.ler('projetos'), receitas: Storage.ler('receitas'), despesas: Storage.ler('despesas'),
    };
  }

  /* ---------- Indicadores ---------- */

  function desenharIndicadores(d) {
    const geral = SS.Financeiro.indicadores();
    const mes = SS.Financeiro.indicadores(SS.Financeiro.intervaloDe('mes'));
    const mesAtual = util.hoje().slice(0, 7);
    const enviadas = d.orcamentos.filter((o) => ENVIADOS.includes(o.status));
    const aprovadas = d.orcamentos.filter((o) => o.status === 'aprovado');
    const decididas = d.orcamentos.filter((o) => ['aprovado', 'recusado', 'expirado'].includes(o.status)).length;
    const andamento = d.projetos.filter(SS.Projetos.emAndamento);
    const criticos = andamento.filter((p) => SS.Projetos.situacaoPrazo(p).tipo !== 'ok').length;
    const novosClientes = d.clientes.filter((c) => util.chaveMes(c.criadoEm) === mesAtual).length;
    const totalContratado = util.somar(d.projetos, (p) => p.valorContratado);
    const parteRecebida = totalContratado ? Math.min(100, (geral.recebido / totalContratado) * 100) : 0;

    ui.render('#painel-caixa',
      '<p class="sobrelinha">Caixa da agência</p>' +
      '<div class="caixa__principal"><span>Faturamento recebido</span><strong>' + util.moeda(geral.recebido) + '</strong>' +
        '<small>' + (mes.recebido ? util.moeda(mes.recebido) + ' neste mês' : 'Nenhum recebimento neste mês') + '</small></div>' +
      '<div class="caixa__barra" role="img" aria-label="' + Math.round(parteRecebida) + '% do valor contratado já foi recebido"><span style="width:' + parteRecebida + '%"></span></div>' +
      '<p class="caixa__legenda"><span>' + Math.round(parteRecebida) + '% do contratado já recebido</span><span>' + util.moeda(totalContratado, true) + ' em contratos</span></p>' +
      '<div class="caixa__duplo">' +
        '<a class="caixa__item" href="financeiro.html"><span>Lucro líquido</span><strong class="' + (geral.lucro < 0 ? 'texto-alerta' : '') + '">' + util.moeda(geral.lucro) + '</strong>' +
          '<small>' + (geral.margem === null ? 'Sem recebimentos ainda' : 'Margem de ' + util.percentual(geral.margem) + ' sobre o recebido') + '</small></a>' +
        '<a class="caixa__item" href="financeiro.html"><span>Pagamentos pendentes</span><strong>' + util.moeda(geral.pendente) + '</strong>' +
          '<small class="' + (geral.emAtraso ? 'texto-alerta' : '') + '">' + (geral.emAtraso ? util.moeda(geral.emAtraso) + ' em atraso' : util.plural(geral.parcelasPendentes, 'parcela em aberto', 'parcelas em aberto')) + '</small></a>' +
      '</div>');

    const metrica = (href, icone, rotulo, valor, nota) => '<a class="metrica" href="' + href + '">' + ui.icone(icone, 'metrica__icone') +
      '<span class="metrica__rotulo">' + rotulo + '</span><strong class="metrica__valor">' + valor + '</strong><small>' + nota + '</small></a>';
    ui.render('#painel-metricas',
      metrica('clientes.html', 'users', 'Total de clientes', d.clientes.length, novosClientes ? util.plural(novosClientes, 'novo', 'novos') + ' neste mês' : 'Nenhum novo neste mês') +
      metrica('orcamentos.html', 'send', 'Propostas enviadas', enviadas.length, decididas ? Math.round((aprovadas.length / decididas) * 100) + '% de aprovação nas decididas' : 'Nenhuma decidida ainda') +
      metrica('orcamentos.html', 'badge-check', 'Vendas fechadas', aprovadas.length, aprovadas.length ? 'Ticket médio de ' + util.moeda(totalContratado / Math.max(1, d.projetos.length), true) : 'Feche a primeira proposta') +
      metrica('projetos.html', 'kanban', 'Projetos em andamento', andamento.length, criticos ? util.plural(criticos, 'com prazo crítico', 'com prazo crítico') : andamento.length ? 'Todos dentro do prazo' : 'Nenhum em produção'));
  }

  /* ---------- Gráficos ---------- */

  function cores() {
    const estilo = getComputedStyle(document.documentElement);
    const v = (nome) => estilo.getPropertyValue(nome).trim();
    return {
      texto: v('--texto-suave'), forte: v('--texto'), grade: v('--borda'), fundo: v('--superficie'),
      rosa: '#C56583', carmim: '#A94E65', champanhe: '#D9A16E', ouro: '#E9C58E', blush: '#D98AA5', berry: '#82445D', vintage: '#633448', cinza: '#A99BA4',
    };
  }

  function desenharGrafico(id, temDados, textoVazio, configurar) {
    const moldura = document.getElementById(id);
    if (graficos[id]) { graficos[id].destroy(); delete graficos[id]; }
    if (!temDados || !global.Chart) {
      ui.render(moldura, '<p class="grafico__vazio">' + ui.icone('chart-no-axes-column') + '<span>' + (global.Chart ? textoVazio : 'Não foi possível carregar a biblioteca de gráficos.') + '</span></p>');
      return;
    }
    moldura.innerHTML = '<canvas role="img" aria-label="' + moldura.dataset.descricao + '"></canvas>';
    graficos[id] = new global.Chart(moldura.querySelector('canvas'), configurar(cores()));
  }

  function opcoesBase(c, formatoY, legenda) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: Boolean(legenda), position: 'bottom', align: 'start', labels: { color: c.texto, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { family: 'Inter', size: 12 } } },
        tooltip: {
          backgroundColor: '#190F18', borderColor: 'rgba(237,181,205,.25)', borderWidth: 1, titleColor: '#FFFFFF', bodyColor: '#F5E8E7', padding: 10, cornerRadius: 6, boxPadding: 4,
          titleFont: { family: 'Sora', size: 12, weight: '600' }, bodyFont: { family: 'Inter', size: 12 },
          callbacks: { label: (item) => ' ' + item.dataset.label + ': ' + formatoY(item.parsed.y, item) },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: c.grade }, ticks: { color: c.texto, font: { family: 'Inter', size: 11 } } },
        y: { beginAtZero: true, grid: { color: c.grade }, border: { display: false }, ticks: { color: c.texto, font: { family: 'Inter', size: 11 }, maxTicksLimit: 5, callback: (valor) => formatoY(valor, null, true) } },
      },
    };
  }

  const moedaCompacta = (valor, item, eixo) => (eixo ? (valor >= 1000 ? 'R$ ' + util.numero(valor / 1000) + ' mil' : 'R$ ' + valor) : util.moeda(valor));

  function desenharGraficos(d) {
    const meses = util.ultimosMeses(tela.meses);
    const rotulos = meses.map((m) => m.rotulo);
    const porMes = (lista, campoData, valor) => meses.map((m) => util.somar(lista.filter((item) => util.chaveMes(item[campoData]) === m.chave), valor));

    const recebidas = d.receitas.filter((r) => r.status === 'recebido');
    const serieRecebido = porMes(recebidas, 'recebidoEm', (r) => r.valor);
    const serieDespesas = porMes(d.despesas, 'data', (x) => x.valor);
    const serieVendas = porMes(d.projetos, 'dataContrato', () => 1);
    const serieContratado = porMes(d.projetos, 'dataContrato', (p) => p.valorContratado);
    const algum = (serie) => serie.some((v) => v > 0);

    desenharGrafico('grafico-faturamento', algum(serieRecebido), 'Nenhum pagamento recebido neste período. Registre os recebimentos em Financeiro.', (c) => ({
      type: 'line',
      data: { labels: rotulos, datasets: [{ label: 'Recebido', data: serieRecebido, borderColor: c.rosa, backgroundColor: 'rgba(197,101,131,.14)', fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3, pointBackgroundColor: c.rosa, pointBorderColor: c.fundo, pointBorderWidth: 2, pointHoverRadius: 5 }] },
      options: opcoesBase(c, moedaCompacta),
    }));

    desenharGrafico('grafico-vendas', algum(serieVendas), 'Nenhuma venda fechada neste período.', (c) => {
      const opcoes = opcoesBase(c, (valor, item, eixo) => (eixo ? valor : util.plural(valor, 'venda', 'vendas') + ' · ' + util.moeda(serieContratado[item.dataIndex], true)));
      opcoes.scales.y.ticks.stepSize = 1;
      return { type: 'bar', data: { labels: rotulos, datasets: [{ label: 'Vendas fechadas', data: serieVendas, backgroundColor: c.champanhe, hoverBackgroundColor: c.ouro, borderRadius: 3, maxBarThickness: 28 }] }, options: opcoes };
    });

    desenharGrafico('grafico-comparativo', algum(serieRecebido) || algum(serieDespesas), 'Sem receitas ou despesas registradas neste período.', (c) => ({
      type: 'bar',
      data: { labels: rotulos, datasets: [
        { label: 'Receitas', data: serieRecebido, backgroundColor: c.rosa, borderRadius: 3, maxBarThickness: 18 },
        { label: 'Despesas', data: serieDespesas, backgroundColor: c.cinza, borderRadius: 3, maxBarThickness: 18 },
      ] },
      options: opcoesBase(c, moedaCompacta, true),
    }));

    // Distribuição dos serviços vendidos (propostas aprovadas, todo o histórico).
    const vendidos = util.agrupar(d.orcamentos.filter((o) => o.status === 'aprovado'), (o) => o.principal.nome);
    const nomes = Object.keys(vendidos).sort((a, b) => vendidos[b].length - vendidos[a].length);
    const paleta = ['#C56583', '#D9A16E', '#82445D', '#EDB5CD', '#A99BA4', '#E9C58E', '#A94E65'];
    const totalVendidos = util.somar(nomes, (n) => vendidos[n].length);
    desenharGrafico('grafico-servicos', nomes.length > 0, 'A distribuição aparece quando houver vendas fechadas.', (c) => ({
      type: 'doughnut',
      data: { labels: nomes, datasets: [{ data: nomes.map((n) => vendidos[n].length), backgroundColor: nomes.map((n, i) => paleta[i % paleta.length]), borderColor: c.fundo, borderWidth: 3, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#190F18', titleColor: '#FFFFFF', bodyColor: '#F5E8E7', padding: 10, cornerRadius: 6, callbacks: { label: (item) => ' ' + util.plural(item.parsed, 'venda', 'vendas') + ' (' + Math.round((item.parsed / totalVendidos) * 100) + '%)' } } } },
    }));
    ui.render('#legenda-servicos', nomes.map((n, i) => {
      const valor = util.somar(vendidos[n], (o) => SS.Orcamentos.calcular(o).total);
      return '<li><span class="legenda__cor" style="background:' + paleta[i % paleta.length] + '"></span><span class="legenda__nome">' + util.esc(n) + '</span><span class="legenda__valor">' + vendidos[n].length + ' · ' + util.moeda(valor, true) + '</span></li>';
    }).join(''));
  }

  /* ---------- Listas ---------- */

  function desenharListas(d) {
    const nomeCliente = (id) => { const c = d.clientes.find((x) => x.id === id); return c ? SS.Clientes.rotuloDe(c) : 'Cliente removido'; };

    // Atividades recentes
    const atividades = SS.Clientes.atividades();
    ui.render('#lista-atividades', atividades.length ? SS.Clientes.htmlLinhaDoTempo(atividades, 8)
      : ui.estadoVazio({ icone: 'activity', titulo: 'Sem atividades', texto: 'O que acontecer na agência aparece aqui.', compacto: true }));

    // Últimas propostas
    const propostas = d.orcamentos.slice().sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1)).slice(0, 5);
    ui.render('#lista-propostas', propostas.length
      ? '<ul class="lista-simples">' + propostas.map((o) => {
        const status = SS.Orcamentos.STATUS[o.status];
        return '<li><a href="orcamentos.html?ver=' + o.id + '"><span class="mono">' + o.codigo + '</span><span>' + util.esc(nomeCliente(o.clienteId)) + '</span></a><span class="num">' + util.moeda(SS.Orcamentos.calcular(o).total, true) + '</span>' + ui.selo(status.rotulo, status.tom) + '</li>';
      }).join('') + '</ul>'
      : ui.estadoVazio({ icone: 'file-text', titulo: 'Nenhuma proposta', texto: 'Monte o primeiro orçamento para um cliente da carteira.', compacto: true, acao: { rotulo: 'Criar orçamento', href: 'orcamentos.html?novo=1', icone: 'plus' } }));

    // Projetos próximos do prazo
    const proximos = d.projetos.filter(SS.Projetos.emAndamento).sort((a, b) => (a.prazoEntrega < b.prazoEntrega ? -1 : 1)).slice(0, 4);
    ui.render('#lista-prazos', proximos.length
      ? '<ul class="lista-prazos">' + proximos.map((p) => {
        const etapa = SS.Projetos.etapaDe(p);
        return '<li class="prazo-item prazo-item--' + SS.Projetos.situacaoPrazo(p).tipo + '"><a href="projetos.html?id=' + p.id + '">' + util.esc(p.nome) + '</a>' +
          '<div class="prazo-item__linha">' + SS.Projetos.htmlPrazo(p) + '<span class="texto-suave">' + etapa.rotulo + '</span></div>' + SS.Projetos.htmlProgresso(p) + '</li>';
      }).join('') + '</ul>'
      : ui.estadoVazio({ icone: 'calendar-check', titulo: 'Nenhum projeto em produção', texto: 'Projetos aparecem aqui assim que uma proposta é aprovada.', compacto: true }));

    // Clientes aguardando resposta
    const aguardando = [];
    d.negociacoes.filter((n) => n.status === 'ativa' && n.vez === 'agencia').forEach((n) => {
      const ultima = n.rodadas[n.rodadas.length - 1];
      const tipo = SS.Negociacoes.TIPOS_RODADA[ultima.tipo] || { rotulo: 'Respondeu' };
      aguardando.push({ nome: nomeCliente(n.clienteId), motivo: tipo.rotulo, quando: ultima.data, href: 'negociacoes.html?id=' + n.id, acao: 'Responder', urgencia: 0 });
    });
    d.orcamentos.filter((o) => o.status === 'aguardando').forEach((o) =>
      aguardando.push({ nome: nomeCliente(o.clienteId), motivo: 'Proposta ' + o.codigo + ' pronta, ainda não enviada', quando: o.atualizadoEm, href: 'orcamentos.html', acao: 'Enviar', urgencia: 1 }));
    d.clientes.filter((c) => !d.orcamentos.some((o) => o.clienteId === c.id)).forEach((c) =>
      aguardando.push({ nome: SS.Clientes.rotuloDe(c), motivo: 'Ainda não recebeu proposta', quando: c.criadoEm, href: 'orcamentos.html?novo=1&cliente=' + c.id, acao: 'Orçar', urgencia: 2 }));
    aguardando.sort((a, b) => a.urgencia - b.urgencia || (a.quando < b.quando ? -1 : 1));
    ui.render('#lista-aguardando', aguardando.length
      ? '<ul class="lista-espera">' + aguardando.slice(0, 5).map((a) => '<li>' + ui.avatar(a.nome) + '<div><strong>' + util.esc(a.nome) + '</strong><span>' + util.esc(a.motivo) + ' · ' + util.tempoRelativo(a.quando) + '</span></div>' +
        '<a class="botao botao--secundario botao--p" href="' + a.href + '">' + a.acao + '</a></li>').join('') + '</ul>' +
        (aguardando.length > 5 ? '<p class="texto-suave lista-espera__mais">e mais ' + (aguardando.length - 5) + ' aguardando.</p>' : '')
      : ui.estadoVazio({ icone: 'coffee', titulo: 'Ninguém esperando', texto: 'Todos os clientes já tiveram retorno.', compacto: true }));

    // Resumo das negociações
    const ativas = d.negociacoes.filter((n) => n.status === 'ativa');
    const fechadas = d.negociacoes.filter((n) => n.status === 'aprovada');
    const perdidas = d.negociacoes.filter((n) => ['recusada', 'encerrada', 'expirada'].includes(n.status));
    const encerradas = fechadas.length + perdidas.length;
    const descontos = fechadas.map((n) => {
      const o = d.orcamentos.find((x) => x.id === n.orcamentoId);
      return o ? SS.Orcamentos.calcular(o).descontoPercentual : 0;
    });
    const descontoMedio = descontos.length ? util.somar(descontos, (x) => x) / descontos.length : 0;
    const rodadasMedias = fechadas.length ? util.somar(fechadas, (n) => n.rodadas.length) / fechadas.length : 0;
    ui.render('#resumo-negociacoes', d.negociacoes.length
      ? '<div class="funil"><div class="funil__barra" role="img" aria-label="' + fechadas.length + ' fechadas, ' + ativas.length + ' em andamento, ' + perdidas.length + ' perdidas">' +
          (fechadas.length ? '<span class="funil__parte funil__parte--ganha" style="flex:' + fechadas.length + '"></span>' : '') +
          (ativas.length ? '<span class="funil__parte funil__parte--ativa" style="flex:' + ativas.length + '"></span>' : '') +
          (perdidas.length ? '<span class="funil__parte funil__parte--perdida" style="flex:' + perdidas.length + '"></span>' : '') + '</div>' +
        '<ul class="funil__legenda"><li><span class="funil__cor funil__parte--ganha"></span>Fechadas <strong>' + fechadas.length + '</strong></li><li><span class="funil__cor funil__parte--ativa"></span>Em andamento <strong>' + ativas.length + '</strong></li><li><span class="funil__cor funil__parte--perdida"></span>Perdidas <strong>' + perdidas.length + '</strong></li></ul></div>' +
        '<dl class="ficha ficha--compacta">' +
          '<div><dt>Taxa de fechamento</dt><dd>' + (encerradas ? Math.round((fechadas.length / encerradas) * 100) + '%' : '—') + '</dd></div>' +
          '<div><dt>Desconto médio concedido</dt><dd>' + (fechadas.length ? util.percentual(descontoMedio) : '—') + '</dd></div>' +
          '<div><dt>Mensagens até fechar</dt><dd>' + (fechadas.length ? util.numero(rodadasMedias) : '—') + '</dd></div>' +
          '<div><dt>Aguardando você</dt><dd>' + ativas.filter((n) => n.vez === 'agencia').length + '</dd></div>' +
        '</dl>'
      : ui.estadoVazio({ icone: 'messages-square', titulo: 'Nenhuma negociação', texto: 'Envie uma proposta para abrir a primeira conversa.', compacto: true }));
  }

  /* ---------- Estado inicial (agência sem movimento) ---------- */

  function desenharPrimeirosPassos(d) {
    const pendentes = Storage.ler('sistema').leadsPendentes.length;
    const passo = (feito, numero, titulo, texto, href, rotulo) => '<li class="passo-inicial' + (feito ? ' passo-inicial--feito' : '') + '"><span class="passo-inicial__numero">' + (feito ? ui.icone('check') : numero) + '</span>' +
      '<div><h3>' + titulo + '</h3><p>' + texto + '</p></div>' + (feito ? '<span class="texto-suave">Feito</span>' : '<a class="botao botao--secundario botao--p" href="' + href + '">' + rotulo + '</a>') + '</li>';
    ui.render('#primeiros-passos',
      '<div class="inicio__texto"><p class="sobrelinha">Primeiros passos</p><h2>Sua agência está aberta. Falta o primeiro contrato.</h2>' +
      '<p>Os indicadores e gráficos deste painel são calculados a partir do que acontecer daqui em diante. Siga o caminho de uma venda:</p></div>' +
      '<ol class="inicio__passos">' +
        passo(d.clientes.length > 0, 1, 'Atenda um cliente', pendentes ? util.plural(pendentes, 'contato aguarda', 'contatos aguardam') + ' na caixa de entrada. Você também pode cadastrar clientes manualmente.' : 'Simule a chegada de um contato ou cadastre um cliente manualmente.', 'clientes.html', 'Abrir Clientes') +
        passo(d.orcamentos.length > 0, 2, 'Monte um orçamento', 'Escolha o tipo de site, as funcionalidades e o prazo. O valor e a margem são calculados na hora.', 'orcamentos.html', 'Abrir Orçamentos') +
        passo(d.negociacoes.length > 0, 3, 'Envie e negocie', 'O cliente reage conforme o perfil: pode aceitar, pedir desconto, exigir mais ou recusar.', 'negociacoes.html', 'Abrir Negociações') +
        passo(d.projetos.length > 0, 4, 'Entregue e receba', 'A venda fechada vira projeto e parcelas a receber. Só entra no caixa o que for pago.', 'projetos.html', 'Abrir Projetos') +
      '</ol>');
  }

  function desenhar() {
    const d = carregarDados();
    const semMovimento = !d.orcamentos.length && !d.projetos.length && !d.despesas.length;
    document.getElementById('primeiros-passos').hidden = !semMovimento;
    document.getElementById('painel-analitico').hidden = semMovimento;
    desenharIndicadores(d);
    if (semMovimento) { desenharPrimeirosPassos(d); return; }
    desenharGraficos(d);
    desenharListas(d);
  }

  function montarPagina() {
    const seletor = document.getElementById('periodo-graficos');
    ui.delegar(seletor, 'click', '[data-meses]', (evento, botao) => {
      tela.meses = Number(botao.dataset.meses);
      seletor.querySelectorAll('[data-meses]').forEach((b) => { const ativo = b === botao; b.classList.toggle('chip--ativo', ativo); b.setAttribute('aria-pressed', ativo); });
      desenharGraficos(carregarDados());
    });
    global.addEventListener('ss:tema', () => desenharGraficos(carregarDados()));
    desenhar();
  }

  SS.App.paginas.dashboard = montarPagina;
})(window);
