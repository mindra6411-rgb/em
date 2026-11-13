/*
 * SiteSeller — notificacoes.js
 * Notificações internas. Só são criadas por acontecimentos reais do sistema
 * (um contato chegou, uma proposta foi enviada, um pagamento venceu...).
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;
  const LIMITE = 80;

  const TIPOS = {
    cliente: { icone: 'user-plus', rotulo: 'Cliente' },
    proposta: { icone: 'send', rotulo: 'Proposta' },
    negociacao: { icone: 'messages-square', rotulo: 'Negociação' },
    aprovada: { icone: 'badge-check', rotulo: 'Venda' },
    recusada: { icone: 'circle-x', rotulo: 'Proposta' },
    projeto: { icone: 'kanban', rotulo: 'Projeto' },
    prazo: { icone: 'alarm-clock', rotulo: 'Prazo' },
    pagamento: { icone: 'banknote', rotulo: 'Pagamento' },
    pendencia: { icone: 'clock-alert', rotulo: 'Pagamento' },
    sistema: { icone: 'info', rotulo: 'Sistema' },
  };

  let elementos = null;

  function listar() {
    return Storage.ler('notificacoes').sort((a, b) => (a.data < b.data ? 1 : -1));
  }

  function naoLidas() {
    return Storage.ler('notificacoes').filter((n) => !n.lida).length;
  }

  /** Registra uma notificação: { tipo, titulo, mensagem, link, data?, demo? }. */
  function criar(dados) {
    const lista = Storage.ler('notificacoes');
    const registro = {
      id: Storage.gerarId('not'),
      tipo: TIPOS[dados.tipo] ? dados.tipo : 'sistema',
      titulo: dados.titulo,
      mensagem: dados.mensagem || '',
      link: dados.link || '',
      data: dados.data || util.agora(),
      lida: Boolean(dados.lida),
    };
    if (dados.demo) registro.demo = true;
    lista.push(registro);
    // Mantém o histórico enxuto: descarta as mais antigas já lidas primeiro.
    if (lista.length > LIMITE) {
      lista.sort((a, b) => (a.lida === b.lida ? (a.data < b.data ? -1 : 1) : (a.lida ? -1 : 1)));
      lista.splice(0, lista.length - LIMITE);
    }
    Storage.gravar('notificacoes', lista);
    atualizar();
    return registro;
  }

  function marcarLida(id) {
    Storage.atualizar('notificacoes', id, { lida: true });
    atualizar();
  }

  function marcarTodas() {
    Storage.gravar('notificacoes', Storage.ler('notificacoes').map((n) => Object.assign(n, { lida: true })));
    atualizar();
  }

  function limparLidas() {
    Storage.remover('notificacoes', (n) => n.lida);
    atualizar();
  }

  function htmlItem(n) {
    const tipo = TIPOS[n.tipo] || TIPOS.sistema;
    return '<li class="notificacao' + (n.lida ? '' : ' notificacao--nova') + '">' +
      '<button type="button" class="notificacao__abrir" data-notificacao="' + n.id + '">' +
        '<span class="notificacao__icone">' + ui.icone(tipo.icone) + '</span>' +
        '<span class="notificacao__texto"><strong>' + util.esc(n.titulo) + '</strong>' +
          (n.mensagem ? '<span>' + util.esc(n.mensagem) + '</span>' : '') +
          '<small>' + util.tempoRelativo(n.data) + (n.demo ? ' · demonstração' : '') + '</small></span>' +
      '</button>' +
      (n.lida ? '' : '<button type="button" class="botao-icone botao-icone--p" data-marcar-lida="' + n.id + '" aria-label="Marcar como lida" title="Marcar como lida">' + ui.icone('check') + '</button>') +
      '</li>';
  }

  function desenharPainel() {
    if (!elementos) return;
    const lista = listar();
    const novas = lista.filter((n) => !n.lida).length;
    const corpo = lista.length
      ? '<ul class="notificacoes__lista">' + lista.slice(0, 30).map(htmlItem).join('') + '</ul>'
      : ui.estadoVazio({ icone: 'bell-off', titulo: 'Nenhuma notificação', texto: 'Os avisos aparecem aqui quando algo acontece na agência: um contato novo, uma resposta de cliente, um pagamento.', compacto: true });
    elementos.painel.innerHTML =
      '<header class="popover__cabecalho"><div><h2>Notificações</h2><p>' + (novas ? util.plural(novas, 'não lida', 'não lidas') : 'Tudo em dia') + '</p></div>' +
        '<div class="popover__acoes">' +
          '<button type="button" class="botao botao--fantasma botao--p" data-notificacoes="ler-todas"' + (novas ? '' : ' disabled') + '>' + ui.icone('check-check') + 'Marcar todas</button>' +
          '<button type="button" class="botao-icone botao-icone--p" data-notificacoes="limpar" aria-label="Remover notificações lidas" title="Remover lidas"' + (lista.length > novas ? '' : ' disabled') + '>' + ui.icone('trash-2') + '</button>' +
        '</div></header>' + corpo;
    ui.atualizarIcones();
  }

  function atualizarContador() {
    if (!elementos) return;
    const novas = naoLidas();
    elementos.contador.hidden = !novas;
    elementos.contador.textContent = novas > 9 ? '9+' : String(novas);
    elementos.botao.setAttribute('aria-label', novas ? 'Notificações: ' + util.plural(novas, 'não lida', 'não lidas') : 'Notificações');
  }

  function atualizar() {
    atualizarContador();
    if (elementos && !elementos.painel.hidden) desenharPainel();
  }

  function ligarPainel(botao, painel, contador) {
    elementos = { botao, painel, contador };
    atualizarContador();
    ui.ligarPopover(botao, painel, desenharPainel);
    painel.addEventListener('click', (evento) => {
      const marcar = evento.target.closest('[data-marcar-lida]');
      if (marcar) { marcarLida(marcar.dataset.marcarLida); return; }
      const comando = evento.target.closest('[data-notificacoes]');
      if (comando) { if (comando.dataset.notificacoes === 'ler-todas') marcarTodas(); else limparLidas(); return; }
      const abrir = evento.target.closest('[data-notificacao]');
      if (abrir) {
        const notificacao = Storage.buscar('notificacoes', abrir.dataset.notificacao);
        marcarLida(abrir.dataset.notificacao);
        if (notificacao && notificacao.link) global.location.href = notificacao.link;
      }
    });
  }

  SS.Notificacoes = { TIPOS, criar, listar, naoLidas, marcarLida, marcarTodas, limparLidas, ligarPainel };
})(window);
