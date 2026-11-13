/*
 * SiteSeller — app.js
 * Utilitários compartilhados, componentes de interface (toast, modal, formulários),
 * estrutura comum das páginas (sidebar e barra superior) e inicialização.
 */
(function (global) {
  'use strict';

  const SS = (global.SS = global.SS || {});
  const Storage = SS.Storage;
  const doc = global.document;

  /* =====================================================================
   * Utilitários
   * ===================================================================== */

  const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatoMoedaCurta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const formatoNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  const util = {
    moeda(valor, semCentavos) {
      const numero = Number(valor) || 0;
      return (semCentavos ? formatoMoedaCurta : formatoMoeda).format(numero);
    },
    numero(valor) { return formatoNumero.format(Number(valor) || 0); },
    percentual(valor) { return formatoNumero.format(Number(valor) || 0) + '%'; },
    arredondar(valor) { return Math.round((Number(valor) || 0) * 100) / 100; },

    /** Converte "AAAA-MM-DD" (data local) ou ISO completo em Date. */
    paraData(texto) {
      if (texto instanceof Date) return texto;
      if (!texto) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        const [ano, mes, dia] = texto.split('-').map(Number);
        return new Date(ano, mes - 1, dia);
      }
      const data = new Date(texto);
      return isNaN(data) ? null : data;
    },
    /** Date -> "AAAA-MM-DD" no fuso local. */
    paraDia(data) {
      const d = util.paraData(data) || new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    hoje() { return util.paraDia(new Date()); },
    agora() { return new Date().toISOString(); },
    somarDias(texto, dias) {
      const data = new Date(util.paraData(texto || new Date()).getTime());
      data.setDate(data.getDate() + dias);
      return util.paraDia(data);
    },
    /** Dias corridos de hoje até a data (negativo = já passou). */
    diasAte(texto) {
      const alvo = util.paraData(util.paraDia(texto));
      const hoje = util.paraData(util.hoje());
      return Math.round((alvo - hoje) / 86400000);
    },
    data(texto) {
      const d = util.paraData(texto);
      return d ? d.toLocaleDateString('pt-BR') : '—';
    },
    dataHora(texto) {
      const d = util.paraData(texto);
      return d ? d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    },
    dataPorExtenso(data) {
      const texto = (data || new Date()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    },
    /** "há 3 dias", "hoje", "ontem"... */
    tempoRelativo(texto) {
      const d = util.paraData(texto);
      if (!d) return '—';
      const minutos = Math.round((Date.now() - d.getTime()) / 60000);
      if (minutos < 1) return 'agora';
      if (minutos < 60) return 'há ' + minutos + ' min';
      const dias = -util.diasAte(d);
      if (dias <= 0) return 'hoje';
      if (dias === 1) return 'ontem';
      if (dias < 30) return 'há ' + dias + ' dias';
      if (dias < 365) { const meses = Math.round(dias / 30); return 'há ' + meses + (meses === 1 ? ' mês' : ' meses'); }
      return util.data(d);
    },
    prazoEmTexto(dias) {
      if (dias < 0) return (-dias === 1 ? '1 dia' : -dias + ' dias') + ' de atraso';
      if (dias === 0) return 'vence hoje';
      return dias === 1 ? 'falta 1 dia' : 'faltam ' + dias + ' dias';
    },
    plural(quantidade, singular, plural) { return quantidade + ' ' + (quantidade === 1 ? singular : plural); },
    esc(texto) {
      return String(texto === null || texto === undefined ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /** Hash estável de um texto: dá variedade às mensagens sem depender de sorteio. */
    hash(texto) {
      let h = 2166136261;
      for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    semAcento(texto) { return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); },
    iniciais(nome) {
      const partes = String(nome || '').trim().split(/\s+/).filter((p) => !/^(dra?\.?|de|da|do|dos|das|e|&)$/i.test(p));
      if (!partes.length) return '?';
      return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
    },
    somar(lista, seletor) { return lista.reduce((total, item) => total + (Number(seletor(item)) || 0), 0); },
    agrupar(lista, chave) {
      return lista.reduce((mapa, item) => { const k = chave(item); (mapa[k] = mapa[k] || []).push(item); return mapa; }, {});
    },
    parametro(nome) { return new URLSearchParams(global.location.search).get(nome); },
    atrasar(funcao, espera) {
      let temporizador;
      return function () { clearTimeout(temporizador); temporizador = setTimeout(() => funcao.apply(this, arguments), espera); };
    },
    /** Últimos N meses como [{ chave: "AAAA-MM", rotulo: "nov/26" }]. */
    ultimosMeses(quantidade) {
      const meses = [];
      const base = new Date();
      for (let i = quantidade - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const rotulo = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2);
        meses.push({ chave: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), rotulo });
      }
      return meses;
    },
    chaveMes(texto) { return texto ? util.paraDia(texto).slice(0, 7) : ''; },
    baixarArquivo(nome, conteudo, tipo) {
      const blob = new Blob([conteudo], { type: tipo || 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url; link.download = nome;
      doc.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  /* =====================================================================
   * Componentes de interface
   * ===================================================================== */

  const ui = {};

  ui.icone = function (nome, classe) {
    return '<i data-lucide="' + nome + '" class="icone' + (classe ? ' ' + classe : '') + '" aria-hidden="true"></i>';
  };

  /** Converte os marcadores <i data-lucide> em SVG. Chamar depois de inserir HTML novo. */
  ui.atualizarIcones = function () {
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  };

  ui.render = function (alvo, html) {
    const elemento = typeof alvo === 'string' ? doc.querySelector(alvo) : alvo;
    if (!elemento) return null;
    elemento.innerHTML = html;
    ui.atualizarIcones();
    return elemento;
  };

  /** Delegação de eventos: ui.delegar(raiz, 'click', '[data-acao]', (evento, alvo) => ...). */
  ui.delegar = function (raiz, tipo, seletor, tratador) {
    raiz.addEventListener(tipo, (evento) => {
      const alvo = evento.target.closest(seletor);
      if (alvo && raiz.contains(alvo)) tratador(evento, alvo);
    });
  };

  /* ---------- Selos de status ---------- */

  ui.selo = function (rotulo, tom) {
    return '<span class="selo selo--' + (tom || 'neutro') + '"><span class="selo__ponto"></span>' + util.esc(rotulo) + '</span>';
  };

  ui.seloDemo = function (registro) {
    if (!registro) return '';
    if (registro.demo) return '<span class="etiqueta" title="Registro fictício carregado com os dados de demonstração">Demonstração</span>';
    if (registro.origem === 'lead') return '<span class="etiqueta" title="Cliente fictício gerado pela simulação">Simulado</span>';
    return '';
  };

  ui.avatar = function (nome, classe) {
    return '<span class="avatar ' + (classe || '') + '" aria-hidden="true">' + util.esc(util.iniciais(nome)) + '</span>';
  };

  /* ---------- Estado vazio ---------- */

  ui.estadoVazio = function (opcoes) {
    const acao = opcoes.acao
      ? (opcoes.acao.href
        ? '<a class="botao botao--primario" href="' + opcoes.acao.href + '">' + ui.icone(opcoes.acao.icone || 'arrow-right') + util.esc(opcoes.acao.rotulo) + '</a>'
        : '<button type="button" class="botao botao--primario" data-acao="' + opcoes.acao.acao + '">' + ui.icone(opcoes.acao.icone || 'plus') + util.esc(opcoes.acao.rotulo) + '</button>')
      : '';
    return '<div class="vazio' + (opcoes.compacto ? ' vazio--compacto' : '') + '">' +
      '<span class="vazio__icone">' + ui.icone(opcoes.icone || 'inbox') + '</span>' +
      '<h3 class="vazio__titulo">' + util.esc(opcoes.titulo) + '</h3>' +
      (opcoes.texto ? '<p class="vazio__texto">' + util.esc(opcoes.texto) + '</p>' : '') + acao + '</div>';
  };

  /* ---------- Toasts ---------- */

  const ICONES_TOAST = { sucesso: 'circle-check', erro: 'circle-alert', aviso: 'triangle-alert', info: 'info' };

  ui.toast = function (mensagem, tipo, opcoes) {
    tipo = tipo || 'sucesso';
    let pilha = doc.getElementById('toasts');
    if (!pilha) {
      pilha = doc.createElement('div');
      pilha.id = 'toasts';
      pilha.className = 'toasts';
      pilha.setAttribute('aria-live', 'polite');
      doc.body.appendChild(pilha);
    }
    const toast = doc.createElement('div');
    toast.className = 'toast toast--' + tipo;
    toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    const link = opcoes && opcoes.link ? '<a class="toast__link" href="' + opcoes.link.href + '">' + util.esc(opcoes.link.rotulo) + '</a>' : '';
    toast.innerHTML = ui.icone(ICONES_TOAST[tipo] || 'info', 'toast__icone') +
      '<div class="toast__corpo"><p>' + util.esc(mensagem) + '</p>' + link + '</div>' +
      '<button type="button" class="toast__fechar" aria-label="Fechar aviso">' + ui.icone('x') + '</button>';
    pilha.appendChild(toast);
    // No máximo 3 avisos visíveis: os mais antigos saem para não cobrir a tela.
    while (pilha.children.length > 3) pilha.firstElementChild.remove();
    ui.atualizarIcones();
    const remover = () => { toast.classList.add('toast--saindo'); setTimeout(() => toast.remove(), 220); };
    toast.querySelector('.toast__fechar').addEventListener('click', remover);
    setTimeout(remover, tipo === 'erro' ? 7000 : (link ? 6500 : 4200));
  };

  /** Guarda um aviso para ser exibido depois de trocar de página. */
  ui.toastAposNavegar = function (mensagem, tipo) {
    try { global.sessionStorage.setItem('siteseller:aviso', JSON.stringify({ mensagem, tipo: tipo || 'sucesso' })); } catch (e) { /* opcional */ }
  };

  /* ---------- Modais ---------- */

  const pilhaModais = [];

  /**
   * ui.modal({ titulo, subtitulo, conteudo, tamanho: 'p'|'m'|'g', acoes: [{ rotulo, variante, icone, aoClicar(modal) }], aoAbrir(modal), aoFechar() })
   * Uma ação fecha o modal, exceto se aoClicar retornar false.
   */
  ui.modal = function (opcoes) {
    const raiz = doc.createElement('div');
    raiz.className = 'modal-raiz';
    const idTitulo = 'modal-titulo-' + (pilhaModais.length + 1) + '-' + Date.now();
    const acoes = (opcoes.acoes || []).map((acao, indice) =>
      '<button type="button" class="botao botao--' + (acao.variante || 'secundario') + '" data-modal-acao="' + indice + '">' +
      (acao.icone ? ui.icone(acao.icone) : '') + util.esc(acao.rotulo) + '</button>').join('');
    raiz.innerHTML =
      '<div class="modal-fundo" data-modal-fechar></div>' +
      '<section class="modal modal--' + (opcoes.tamanho || 'm') + '" role="dialog" aria-modal="true" aria-labelledby="' + idTitulo + '">' +
        '<header class="modal__cabecalho"><div>' +
          '<h2 class="modal__titulo" id="' + idTitulo + '">' + util.esc(opcoes.titulo) + '</h2>' +
          (opcoes.subtitulo ? '<p class="modal__subtitulo">' + util.esc(opcoes.subtitulo) + '</p>' : '') +
        '</div><button type="button" class="botao-icone" data-modal-fechar aria-label="Fechar">' + ui.icone('x') + '</button></header>' +
        '<div class="modal__corpo">' + (opcoes.conteudo || '') + '</div>' +
        (acoes ? '<footer class="modal__rodape">' + acoes + '</footer>' : '') +
      '</section>';

    const focoAnterior = doc.activeElement;
    const modal = {
      raiz,
      corpo: raiz.querySelector('.modal__corpo'),
      fechar(resultado) {
        if (!raiz.isConnected) return;
        raiz.classList.add('modal-raiz--saindo');
        const indice = pilhaModais.indexOf(modal);
        if (indice > -1) pilhaModais.splice(indice, 1);
        setTimeout(() => raiz.remove(), 160);
        if (!pilhaModais.length) doc.body.classList.remove('sem-rolagem');
        if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        if (opcoes.aoFechar) opcoes.aoFechar(resultado);
      },
    };

    raiz.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-modal-fechar]')) { modal.fechar(); return; }
      const botao = evento.target.closest('[data-modal-acao]');
      if (botao) {
        const acao = opcoes.acoes[Number(botao.dataset.modalAcao)];
        const resultado = acao.aoClicar ? acao.aoClicar(modal) : undefined;
        if (resultado !== false) modal.fechar(resultado);
      }
    });
    raiz.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') { evento.stopPropagation(); modal.fechar(); return; }
      if (evento.key !== 'Tab') return;
      const focaveis = Array.from(raiz.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && doc.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && doc.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    });

    doc.body.appendChild(raiz);
    doc.body.classList.add('sem-rolagem');
    pilhaModais.push(modal);
    ui.atualizarIcones();
    if (opcoes.aoAbrir) opcoes.aoAbrir(modal);
    const primeiroCampo = modal.corpo.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
    (primeiroCampo || raiz.querySelector('.modal__rodape .botao--primario, .modal__rodape .botao') || raiz.querySelector('[data-modal-fechar].botao-icone')).focus();
    return modal;
  };

  /** Confirmação. Retorna uma Promise<boolean>. */
  ui.confirmar = function (opcoes) {
    return new Promise((resolver) => {
      let confirmado = false;
      ui.modal({
        titulo: opcoes.titulo,
        tamanho: 'p',
        conteudo: '<p class="texto-suave">' + util.esc(opcoes.mensagem) + '</p>' + (opcoes.detalhe ? '<p class="aviso aviso--' + (opcoes.perigo ? 'perigo' : 'atencao') + '">' + ui.icone('triangle-alert') + '<span>' + util.esc(opcoes.detalhe) + '</span></p>' : ''),
        acoes: [
          { rotulo: opcoes.rotuloCancelar || 'Cancelar', variante: 'fantasma' },
          { rotulo: opcoes.rotuloConfirmar || 'Confirmar', variante: opcoes.perigo ? 'perigo' : 'primario', icone: opcoes.icone, aoClicar() { confirmado = true; } },
        ],
        aoFechar() { resolver(confirmado); },
      });
    });
  };

  /* ---------- Formulários ---------- */

  /**
   * Gera o HTML de um campo com rótulo, dica e área de erro.
   * tipo: text | email | tel | number | date | moeda | textarea | select
   */
  ui.campo = function (o) {
    const id = o.id || 'campo-' + o.nome;
    const valor = o.valor === undefined || o.valor === null ? '' : o.valor;
    const comuns = ' id="' + id + '" name="' + o.nome + '"' + (o.obrigatorio ? ' required' : '') + (o.atributos ? ' ' + o.atributos : '');
    let controle;
    if (o.tipo === 'textarea') {
      controle = '<textarea class="entrada" rows="' + (o.linhas || 3) + '"' + comuns + (o.maximo ? ' maxlength="' + o.maximo + '"' : '') + ' placeholder="' + util.esc(o.exemplo || '') + '">' + util.esc(valor) + '</textarea>';
    } else if (o.tipo === 'select') {
      const opcoes = (o.vazio !== undefined ? '<option value="">' + util.esc(o.vazio) + '</option>' : '') +
        o.opcoes.map((op) => '<option value="' + util.esc(op.valor) + '"' + (String(op.valor) === String(valor) ? ' selected' : '') + '>' + util.esc(op.rotulo) + '</option>').join('');
      controle = '<select class="entrada"' + comuns + '>' + opcoes + '</select>';
    } else if (o.tipo === 'moeda') {
      controle = '<div class="entrada-grupo"><span class="entrada-grupo__prefixo">R$</span>' +
        '<input class="entrada" type="number" inputmode="decimal" step="0.01" min="' + (o.minimo !== undefined ? o.minimo : 0) + '"' + comuns + ' value="' + util.esc(valor) + '" placeholder="0,00"></div>';
    } else {
      const tipo = o.tipo || 'text';
      const limites = (o.minimo !== undefined ? ' min="' + o.minimo + '"' : '') + (o.maximoValor !== undefined ? ' max="' + o.maximoValor + '"' : '') +
        (o.passo ? ' step="' + o.passo + '"' : '') + (o.maximo ? ' maxlength="' + o.maximo + '"' : '');
      const entrada = '<input class="entrada" type="' + tipo + '"' + comuns + limites + ' value="' + util.esc(valor) + '" placeholder="' + util.esc(o.exemplo || '') + '">';
      controle = o.sufixo ? '<div class="entrada-grupo entrada-grupo--sufixo">' + entrada + '<span class="entrada-grupo__sufixo">' + util.esc(o.sufixo) + '</span></div>' : entrada;
    }
    return '<div class="campo' + (o.classe ? ' ' + o.classe : '') + '">' +
      '<label class="campo__rotulo" for="' + id + '">' + util.esc(o.rotulo) + (o.obrigatorio ? '' : ' <span class="campo__opcional">opcional</span>') + '</label>' +
      controle +
      (o.dica ? '<p class="campo__dica">' + util.esc(o.dica) + '</p>' : '') +
      '<p class="campo__erro" hidden></p></div>';
  };

  /** Lê os valores de um formulário. Números viram Number; checkboxes com o mesmo nome viram lista. */
  ui.lerFormulario = function (formulario) {
    const dados = {};
    Array.from(formulario.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') {
        if (el.dataset.lista !== undefined) { dados[el.name] = dados[el.name] || []; if (el.checked) dados[el.name].push(el.value); }
        else dados[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) dados[el.name] = el.value; else if (!(el.name in dados)) dados[el.name] = '';
      } else if (el.type === 'number') {
        dados[el.name] = el.value === '' ? null : Number(el.value);
      } else {
        dados[el.name] = el.value.trim();
      }
    });
    return dados;
  };

  ui.mostrarErroCampo = function (formulario, nome, mensagem) {
    const el = formulario.elements[nome];
    const controle = el && el.length && !el.tagName ? el[0] : el;
    if (!controle) return;
    const campo = controle.closest('.campo');
    if (!campo) return;
    const erro = campo.querySelector('.campo__erro');
    campo.classList.toggle('campo--invalido', Boolean(mensagem));
    controle.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    if (erro) { erro.textContent = mensagem || ''; erro.hidden = !mensagem; }
  };

  function mensagemNativa(el) {
    const v = el.validity;
    if (v.valueMissing) return 'Preencha este campo.';
    if (v.typeMismatch && el.type === 'email') return 'Informe um e-mail válido, como nome@exemplo.com.br.';
    if (v.badInput) return 'Informe um número válido.';
    if (v.rangeUnderflow) return 'O valor mínimo é ' + el.min.replace('.', ',') + '.';
    if (v.rangeOverflow) return 'O valor máximo é ' + el.max.replace('.', ',') + '.';
    if (v.stepMismatch) return el.step === '1' || !el.step ? 'Informe um número inteiro.' : 'Use no máximo duas casas decimais.';
    if (v.tooLong) return 'Texto longo demais.';
    return v.valid ? '' : 'Valor inválido.';
  }

  /**
   * Valida o formulário (regras nativas + regras extras) e exibe os erros nos campos.
   * regras: { nomeDoCampo: (valor, dados) => 'mensagem de erro' | '' }
   * Retorna os dados lidos ou null se houver erro.
   */
  ui.validar = function (formulario, regras) {
    const dados = ui.lerFormulario(formulario);
    let primeiroInvalido = null;
    const vistos = new Set();
    Array.from(formulario.elements).forEach((el) => {
      if (!el.name || el.disabled || vistos.has(el.name) || el.type === 'checkbox' || el.type === 'radio') return;
      vistos.add(el.name);
      let mensagem = mensagemNativa(el);
      if (!mensagem && el.required && typeof dados[el.name] === 'string' && !dados[el.name]) mensagem = 'Preencha este campo.';
      if (!mensagem && regras && regras[el.name]) mensagem = regras[el.name](dados[el.name], dados) || '';
      ui.mostrarErroCampo(formulario, el.name, mensagem);
      if (mensagem && !primeiroInvalido) primeiroInvalido = el;
    });
    if (primeiroInvalido) { primeiroInvalido.focus(); return null; }
    return dados;
  };

  /** Liga a validação ao envio e limpa o erro do campo enquanto o usuário corrige. */
  ui.ligarFormulario = function (formulario, regras, aoEnviar) {
    formulario.setAttribute('novalidate', '');
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const dados = ui.validar(formulario, regras);
      if (dados) aoEnviar(dados);
    });
    formulario.addEventListener('input', (evento) => {
      if (evento.target.name && evento.target.closest('.campo--invalido')) ui.mostrarErroCampo(formulario, evento.target.name, '');
    });
  };

  /* ---------- Popovers (notificações, perfil) ---------- */

  let popoverAberto = null;

  function fecharPopover() {
    if (!popoverAberto) return;
    popoverAberto.painel.hidden = true;
    popoverAberto.botao.setAttribute('aria-expanded', 'false');
    popoverAberto = null;
  }

  ui.ligarPopover = function (botao, painel, aoAbrir) {
    botao.setAttribute('aria-expanded', 'false');
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation();
      const jaAberto = popoverAberto && popoverAberto.painel === painel;
      fecharPopover();
      if (jaAberto) return;
      if (aoAbrir) aoAbrir();
      painel.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      popoverAberto = { botao, painel };
    });
    painel.addEventListener('click', (evento) => evento.stopPropagation());
  };
  ui.fecharPopover = fecharPopover;

  doc.addEventListener('click', fecharPopover);
  doc.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') fecharPopover(); });

  /* ---------- Abas ---------- */

  /** Abas simples: botões [data-aba] e painéis [data-painel] dentro de uma raiz. */
  ui.ligarAbas = function (raiz, aoTrocar) {
    const ativar = (nome) => {
      raiz.querySelectorAll('[data-aba]').forEach((botao) => {
        const ativa = botao.dataset.aba === nome;
        botao.classList.toggle('aba--ativa', ativa);
        botao.setAttribute('aria-selected', ativa ? 'true' : 'false');
      });
      raiz.querySelectorAll('[data-painel]').forEach((painel) => { painel.hidden = painel.dataset.painel !== nome; });
      if (aoTrocar) aoTrocar(nome);
    };
    ui.delegar(raiz, 'click', '[data-aba]', (evento, botao) => ativar(botao.dataset.aba));
    return ativar;
  };

  /* =====================================================================
   * Estrutura comum: sidebar e barra superior
   * ===================================================================== */

  const PAGINAS = [
    { id: 'dashboard', rotulo: 'Dashboard', arquivo: 'index.html', icone: 'layout-dashboard', resumo: 'Visão geral da agência' },
    { id: 'clientes', rotulo: 'Clientes', arquivo: 'clientes.html', icone: 'users', resumo: 'Carteira e novos contatos' },
    { id: 'orcamentos', rotulo: 'Orçamentos', arquivo: 'orcamentos.html', icone: 'file-text', resumo: 'Propostas comerciais' },
    { id: 'negociacoes', rotulo: 'Negociações', arquivo: 'negociacoes.html', icone: 'messages-square', resumo: 'Conversas com clientes' },
    { id: 'projetos', rotulo: 'Projetos', arquivo: 'projetos.html', icone: 'kanban', resumo: 'Produção e entregas' },
    { id: 'financeiro', rotulo: 'Financeiro', arquivo: 'financeiro.html', icone: 'wallet', resumo: 'Receitas, despesas e lucro' },
    { id: 'configuracoes', rotulo: 'Configurações', arquivo: 'configuracoes.html', icone: 'settings', resumo: 'Agência, catálogo e dados' },
  ];

  const MARCA_SVG = '<svg class="marca__simbolo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#A94E65"/><path d="M21.5 10.5h-7a3.25 3.25 0 0 0 0 6.5h3a3.25 3.25 0 0 1 0 6.5h-7" fill="none" stroke="#F5E8E7" stroke-width="2.4" stroke-linecap="round"/><circle cx="23.5" cy="23.5" r="1.6" fill="#E9C58E"/></svg>';

  const App = { PAGINAS, paginaAtual: 'dashboard' };

  function contadoresDeNavegacao() {
    const negociacoes = Storage.ler('negociacoes').filter((n) => n.status === 'ativa' && n.vez === 'agencia').length;
    const contatos = Storage.ler('sistema').leadsPendentes.length;
    return { negociacoes, clientes: contatos };
  }

  function htmlAvatarAgencia(config, classe) {
    if (config.logo) return '<span class="avatar avatar--agencia ' + (classe || '') + '"><img src="' + util.esc(config.logo) + '" alt=""></span>';
    return '<span class="avatar avatar--agencia ' + (classe || '') + '" aria-hidden="true">' + util.esc((config.iniciais || util.iniciais(config.nomeAgencia)).slice(0, 3)) + '</span>';
  }
  ui.avatarAgencia = htmlAvatarAgencia;

  function montarSidebar() {
    const config = Storage.ler('configuracoes');
    const contadores = contadoresDeNavegacao();
    const dicas = { negociacoes: 'aguardando sua resposta', clientes: 'novos contatos' };
    const itens = PAGINAS.map((pagina) => {
      const quantidade = contadores[pagina.id];
      return '<li><a class="nav__link' + (pagina.id === App.paginaAtual ? ' nav__link--ativo' : '') + '" href="' + pagina.arquivo + '"' +
        (pagina.id === App.paginaAtual ? ' aria-current="page"' : '') + '>' + ui.icone(pagina.icone) + '<span>' + pagina.rotulo + '</span>' +
        (quantidade ? '<span class="nav__contador" title="' + quantidade + ' ' + dicas[pagina.id] + '">' + quantidade + '</span>' : '') + '</a></li>';
    });
    const principal = itens.slice(0, 6).join('');
    ui.render('#sidebar',
      '<a class="marca" href="index.html" aria-label="SiteSeller — ir para o dashboard">' + MARCA_SVG +
        '<span class="marca__texto"><strong>SiteSeller</strong><small>versão 1.0</small></span></a>' +
      '<nav class="nav" aria-label="Seções do sistema">' +
        '<p class="nav__titulo">Operação</p><ul>' + principal + '</ul>' +
        '<p class="nav__titulo">Sistema</p><ul>' + itens[6] + '</ul>' +
      '</nav>' +
      '<div class="sidebar__rodape">' +
        '<div class="sidebar__agencia">' + htmlAvatarAgencia(config) + '<div><strong>' + util.esc(config.nomeAgencia) + '</strong><small>Sua agência</small></div></div>' +
        '<p class="sidebar__nota">' + ui.icone('hard-drive') + '<span>Dados salvos apenas neste navegador, sem sincronização entre dispositivos.</span></p>' +
      '</div>');
  }

  function montarTopbar() {
    const config = Storage.ler('configuracoes');
    const sistema = Storage.ler('sistema');
    const pagina = PAGINAS.find((p) => p.id === App.paginaAtual) || PAGINAS[0];
    const escuro = config.tema !== 'claro';
    ui.render('#topbar',
      '<button type="button" class="botao-icone topbar__menu" id="abrir-menu" aria-label="Abrir menu de navegação" aria-controls="sidebar" aria-expanded="false">' + ui.icone('menu') + '</button>' +
      '<div class="topbar__titulo"><h1>' + pagina.rotulo + '</h1><p>' + pagina.resumo + '</p></div>' +
      '<div class="topbar__acoes">' +
        (sistema.modo === 'demo' ? '<span class="etiqueta etiqueta--destaque topbar__demo" title="Clientes, propostas e valores carregados são fictícios">' + ui.icone('flask-conical') + '<span>Dados de demonstração</span></span>' : '') +
        '<time class="topbar__data" datetime="' + util.hoje() + '">' + ui.icone('calendar') + '<span>' + util.dataPorExtenso() + '</span></time>' +
        '<div class="popover-ancora">' +
          '<button type="button" class="botao-icone" id="botao-notificacoes" aria-label="Notificações" aria-haspopup="true">' + ui.icone('bell') + '<span class="botao-icone__contador" id="contador-notificacoes" hidden></span></button>' +
          '<div class="popover popover--notificacoes" id="painel-notificacoes" hidden></div>' +
        '</div>' +
        '<button type="button" class="botao-icone" id="alternar-tema" aria-label="' + (escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro') + '" title="' + (escuro ? 'Tema claro' : 'Tema escuro') + '">' + ui.icone(escuro ? 'sun' : 'moon') + '</button>' +
        '<div class="popover-ancora">' +
          '<button type="button" class="perfil" id="botao-perfil" aria-haspopup="true" aria-label="Perfil da agência">' + htmlAvatarAgencia(config) + '<span class="perfil__nome">' + util.esc(config.nomeAgencia) + '</span>' + ui.icone('chevron-down') + '</button>' +
          '<div class="popover popover--perfil" id="painel-perfil" hidden>' +
            '<div class="perfil-cartao">' + htmlAvatarAgencia(config, 'avatar--g') + '<div><strong>' + util.esc(config.nomeAgencia) + '</strong><p>' + util.esc(config.descricao || 'Sem descrição cadastrada.') + '</p></div></div>' +
            '<dl class="perfil-dados">' +
              (config.cidade ? '<div><dt>Cidade</dt><dd>' + util.esc(config.cidade) + '</dd></div>' : '') +
              (config.email ? '<div><dt>E-mail</dt><dd>' + util.esc(config.email) + '</dd></div>' : '') +
              '<div><dt>Margem mínima</dt><dd>' + util.percentual(config.margemMinima) + '</dd></div>' +
            '</dl>' +
            '<a class="botao botao--secundario botao--bloco" href="configuracoes.html">' + ui.icone('settings') + 'Configurar agência</a>' +
          '</div>' +
        '</div>' +
      '</div>');

    doc.getElementById('alternar-tema').addEventListener('click', () => App.definirTema(escuro ? 'claro' : 'escuro'));
    ui.ligarPopover(doc.getElementById('botao-perfil'), doc.getElementById('painel-perfil'));
    if (SS.Notificacoes) SS.Notificacoes.ligarPainel(doc.getElementById('botao-notificacoes'), doc.getElementById('painel-notificacoes'), doc.getElementById('contador-notificacoes'));

    const botaoMenu = doc.getElementById('abrir-menu');
    botaoMenu.addEventListener('click', () => alternarMenu(!doc.body.classList.contains('menu-aberto')));
  }

  function alternarMenu(aberto) {
    doc.body.classList.toggle('menu-aberto', aberto);
    const botao = doc.getElementById('abrir-menu');
    if (botao) botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }

  App.definirTema = function (tema) {
    Storage.alterarObjeto('configuracoes', { tema });
    doc.documentElement.dataset.tema = tema;
    montarTopbar();
    global.dispatchEvent(new CustomEvent('ss:tema', { detail: tema }));
  };

  /** Redesenha sidebar e barra superior (contadores, nome da agência, notificações). */
  App.atualizarEstrutura = function () {
    montarSidebar();
    montarTopbar();
  };

  /* =====================================================================
   * Primeiro uso
   * ===================================================================== */

  /** Prepara a agência: catálogo padrão e, se pedido, dados de demonstração. */
  App.prepararAgencia = function (modo, nomeAgencia) {
    Storage.limparTudo();
    const config = Storage.clonar(Storage.PADROES.configuracoes);
    config.tema = doc.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
    if (nomeAgencia) { config.nomeAgencia = nomeAgencia; config.iniciais = util.iniciais(nomeAgencia); }
    Storage.gravar('configuracoes', config);
    Storage.gravar('servicos', SS.Servicos.catalogoPadrao());
    Storage.alterarObjeto('sistema', { inicializado: true, modo });
    if (modo === 'demo') SS.Demo.carregar();
    else SS.Clientes.receberContato({ silencioso: false });
  };

  function mostrarBoasVindas() {
    const raiz = doc.createElement('div');
    raiz.className = 'boas-vindas';
    raiz.innerHTML =
      '<section class="boas-vindas__painel" role="dialog" aria-modal="true" aria-labelledby="boas-vindas-titulo">' +
        '<div class="boas-vindas__marca">' + MARCA_SVG + '<span>SiteSeller <small>1.0</small></span></div>' +
        '<p class="sobrelinha">Simulação de agência de sites</p>' +
        '<h1 id="boas-vindas-titulo">Você acaba de assumir uma agência de desenvolvimento web.</h1>' +
        '<p class="boas-vindas__texto">Atenda clientes, monte propostas, negocie valores, entregue projetos e acompanhe o caixa. Cada decisão pesa no resultado da empresa.</p>' +
        '<form id="form-boas-vindas" novalidate>' +
          ui.campo({ nome: 'nomeAgencia', rotulo: 'Nome da sua agência', valor: 'SiteSeller', obrigatorio: true, maximo: 40, dica: 'Você pode alterar depois em Configurações.' }) +
          '<fieldset class="escolhas"><legend class="campo__rotulo">Como deseja começar?</legend>' +
            '<label class="escolha"><input type="radio" name="modo" value="demo" checked><span class="escolha__corpo">' + ui.icone('flask-conical') +
              '<strong>Explorar com dados de demonstração</strong><small>Clientes, propostas, projetos e lançamentos fictícios já carregados, todos identificados como demonstração.</small></span></label>' +
            '<label class="escolha"><input type="radio" name="modo" value="vazio"><span class="escolha__corpo">' + ui.icone('sprout') +
              '<strong>Começar com a agência vazia</strong><small>Apenas o catálogo de serviços e um primeiro contato interessado. O resto é com você.</small></span></label>' +
          '</fieldset>' +
          '<button type="submit" class="botao botao--primario botao--g">Abrir a agência' + ui.icone('arrow-right') + '</button>' +
        '</form>' +
        '<p class="boas-vindas__nota">' + ui.icone('hard-drive') + 'Tudo fica salvo no LocalStorage deste navegador. Não há conta, servidor ou sincronização entre dispositivos.</p>' +
      '</section>';
    doc.body.appendChild(raiz);
    doc.body.classList.add('sem-rolagem');
    ui.atualizarIcones();
    const formulario = raiz.querySelector('form');
    ui.ligarFormulario(formulario, {
      nomeAgencia: (valor) => (valor.length < 2 ? 'Use pelo menos 2 caracteres.' : ''),
    }, (dados) => {
      const botao = formulario.querySelector('button[type=submit]');
      botao.disabled = true;
      botao.classList.add('botao--carregando');
      // Pequena pausa para o indicador de carregamento ser percebido antes da recarga.
      setTimeout(() => {
        App.prepararAgencia(dados.modo === 'vazio' ? 'vazio' : 'demo', dados.nomeAgencia);
        ui.toastAposNavegar(dados.modo === 'vazio' ? 'Agência criada. Um primeiro contato já está esperando em Clientes.' : 'Dados de demonstração carregados.');
        global.location.href = 'index.html';
      }, 350);
    });
    formulario.elements.nomeAgencia.select();
  }

  /* =====================================================================
   * Inicialização
   * ===================================================================== */

  /** Rotinas que dependem da data: propostas expiradas, prazos, pagamentos em atraso. */
  function executarRotinas() {
    if (SS.Orcamentos) SS.Orcamentos.verificarExpirados();
    if (SS.Projetos) SS.Projetos.verificarPrazos();
    if (SS.Financeiro) SS.Financeiro.verificarAtrasos();
    if (SS.Clientes) SS.Clientes.verificarChegadaDeContatos();
  }

  App.paginas = {}; // cada módulo registra aqui a função que monta a sua página

  App.iniciar = function () {
    App.paginaAtual = doc.body.dataset.pagina || 'dashboard';
    const sistema = Storage.ler('sistema');

    if (!sistema.inicializado) {
      montarSidebar();
      montarTopbar();
      mostrarBoasVindas();
      return;
    }

    executarRotinas();
    App.atualizarEstrutura();

    doc.addEventListener('click', (evento) => {
      if (doc.body.classList.contains('menu-aberto') && !evento.target.closest('#sidebar') && !evento.target.closest('#abrir-menu')) alternarMenu(false);
    });
    doc.addEventListener('keydown', (evento) => { if (evento.key === 'Escape') alternarMenu(false); });
    global.addEventListener('ss:erro-armazenamento', (evento) => ui.toast(evento.detail, 'erro'));
    global.addEventListener('ss:dados', App.atualizarEstrutura);
    // Outra aba alterou os dados: mantém contadores e notificações coerentes.
    global.addEventListener('storage', (evento) => { if (evento.key && evento.key.indexOf('siteseller:') === 0) App.atualizarEstrutura(); });

    const montar = App.paginas[App.paginaAtual];
    if (montar) montar();
    ui.atualizarIcones();

    Storage.erros.forEach((mensagem) => ui.toast(mensagem, 'erro'));
    try {
      const aviso = global.sessionStorage.getItem('siteseller:aviso');
      if (aviso) {
        global.sessionStorage.removeItem('siteseller:aviso');
        const dados = JSON.parse(aviso);
        ui.toast(dados.mensagem, dados.tipo);
      }
    } catch (e) { /* aviso opcional */ }
  };

  /** Avisa a estrutura comum de que os dados mudaram. */
  App.dadosAlterados = function () { global.dispatchEvent(new CustomEvent('ss:dados')); };

  SS.util = util;
  SS.ui = ui;
  SS.App = App;

  doc.addEventListener('DOMContentLoaded', App.iniciar);
})(window);
