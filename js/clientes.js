/*
 * SiteSeller — clientes.js
 * Carteira de clientes, contatos fictícios que chegam à agência e histórico de atividades.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const SEGMENTOS = ['Moda e varejo', 'Gastronomia', 'Saúde', 'Serviços profissionais', 'Esporte e bem-estar', 'Beleza e estética', 'Tecnologia', 'Jurídico', 'Comércio local', 'Educação', 'Imobiliário', 'Outros'];

  const PERFIS = {
    economico: { rotulo: 'Econômico', icone: 'piggy-bank', resumo: 'Procura o menor preço e quase sempre pede desconto.' },
    exigente: { rotulo: 'Exigente', icone: 'gem', resumo: 'Valoriza qualidade, funcionalidades e acabamento. Rejeita propostas simples demais.' },
    indeciso: { rotulo: 'Indeciso', icone: 'circle-help', resumo: 'Precisa de mais informações e segurança antes de decidir.' },
    urgente: { rotulo: 'Urgente', icone: 'timer', resumo: 'Tem prazo curto e aceita pagar mais por rapidez.' },
    empresarial: { rotulo: 'Empresarial', icone: 'briefcase-business', resumo: 'Busca uma solução completa e profissional, com condições de pagamento adequadas.' },
  };

  /* Contatos fictícios que podem chegar à agência. Cada um entra uma única vez. */
  const CONTATOS = [
    { id: 'lead-roupas', nome: 'Marina Duarte', empresa: 'Ateliê Linho & Cor', email: 'marina@linhoecor.exemplo.com.br', telefone: '(11) 5550-0101', segmento: 'Moda e varejo', tipoSite: 'srv-loja', orcamentoDisponivel: 4200, prazoDesejado: 35, perfil: 'economico', necessidades: ['add-galeria', 'add-whatsapp', 'add-mobile'], descricao: 'Loja de roupas em linho com produção própria. Vende pelo Instagram e quer um catálogo com carrinho para parar de fechar pedido por mensagem.' },
    { id: 'lead-restaurante', nome: 'Rafael Monteiro', empresa: 'Cantina Monteiro', email: 'rafael@cantinamonteiro.exemplo.com.br', telefone: '(11) 5550-0102', segmento: 'Gastronomia', tipoSite: 'srv-institucional', orcamentoDisponivel: 2600, prazoDesejado: 20, perfil: 'indeciso', necessidades: ['add-whatsapp', 'add-galeria', 'add-formulario'], descricao: 'Restaurante italiano de bairro, 18 anos de casa. Quer mostrar o cardápio e receber reservas, mas nunca contratou um site e tem receio de errar.' },
    { id: 'lead-clinica', nome: 'Dra. Helena Prado', empresa: 'Clínica Vitalis', email: 'helena@vitalis.exemplo.com.br', telefone: '(11) 5550-0103', segmento: 'Saúde', tipoSite: 'srv-institucional', orcamentoDisponivel: 4000, prazoDesejado: 25, perfil: 'exigente', necessidades: ['add-formulario', 'add-seo', 'add-mobile', 'add-animacoes'], descricao: 'Clínica de dermatologia com três especialistas. O site atual é antigo e não transmite o padrão do atendimento presencial.' },
    { id: 'lead-autonomo', nome: 'Caio Bittencourt', empresa: 'Caio Bittencourt Fotografia', email: 'caio@cbfoto.exemplo.com.br', telefone: '(11) 5550-0104', segmento: 'Serviços profissionais', tipoSite: 'srv-portfolio', orcamentoDisponivel: 1500, prazoDesejado: 14, perfil: 'economico', necessidades: ['add-galeria', 'add-formulario'], descricao: 'Fotógrafo de casamentos em início de carreira. Precisa de um portfólio para enviar a noivos e cerimonialistas.' },
    { id: 'lead-academia', nome: 'Bruno Sarmento', empresa: 'Pulso Academia', email: 'bruno@pulsoacademia.exemplo.com.br', telefone: '(11) 5550-0105', segmento: 'Esporte e bem-estar', tipoSite: 'srv-landing', orcamentoDisponivel: 1600, prazoDesejado: 6, perfil: 'urgente', necessidades: ['add-whatsapp', 'add-formulario'], descricao: 'Academia que inaugura a segunda unidade na próxima semana e precisa de uma página de pré-matrícula no ar antes da abertura.' },
    { id: 'lead-salao', nome: 'Lívia Antunes', empresa: 'Studio Lívia Antunes', email: 'livia@studiolivia.exemplo.com.br', telefone: '(11) 5550-0106', segmento: 'Beleza e estética', tipoSite: 'srv-landing', orcamentoDisponivel: 1300, prazoDesejado: 15, perfil: 'indeciso', necessidades: ['add-whatsapp', 'add-galeria'], descricao: 'Salão de beleza com agenda cheia por indicação. Está em dúvida se um site traz clientes novos ou se continua só nas redes sociais.' },
    { id: 'lead-tecnologia', nome: 'Otávio Reis', empresa: 'Nimbo Sistemas', email: 'otavio@nimbo.exemplo.com.br', telefone: '(11) 5550-0107', segmento: 'Tecnologia', tipoSite: 'srv-sistema', orcamentoDisponivel: 11000, prazoDesejado: 60, perfil: 'empresarial', necessidades: ['add-login', 'add-banco', 'add-painel', 'add-apis'], descricao: 'Empresa de software de gestão para transportadoras. Quer um portal de clientes para abertura e acompanhamento de chamados.' },
    { id: 'lead-advocacia', nome: 'Dr. Augusto Lacerda', empresa: 'Lacerda & Fontes Advogados', email: 'augusto@lacerdafontes.exemplo.com.br', telefone: '(11) 5550-0108', segmento: 'Jurídico', tipoSite: 'srv-institucional', orcamentoDisponivel: 3800, prazoDesejado: 30, perfil: 'exigente', necessidades: ['add-formulario', 'add-seo', 'add-mobile'], descricao: 'Escritório de direito empresarial com dois sócios. Busca uma presença sóbria, com áreas de atuação e perfil dos advogados.' },
    { id: 'lead-floricultura', nome: 'Teresa Yamada', empresa: 'Flor de Cerejeira', email: 'teresa@flordecerejeira.exemplo.com.br', telefone: '(11) 5550-0109', segmento: 'Comércio local', tipoSite: 'srv-loja', orcamentoDisponivel: 4800, prazoDesejado: 18, perfil: 'urgente', necessidades: ['add-whatsapp', 'add-galeria', 'add-mobile'], descricao: 'Floricultura que quer vender arranjos pela internet a tempo da próxima data comemorativa. Cada dia sem loja é venda perdida.' },
    { id: 'lead-local', nome: 'Jorge Tavares', empresa: 'Tavares Materiais de Construção', email: 'jorge@tavaresmateriais.exemplo.com.br', telefone: '(11) 5550-0110', segmento: 'Comércio local', tipoSite: 'srv-institucional', orcamentoDisponivel: 2000, prazoDesejado: 30, perfil: 'economico', necessidades: ['add-whatsapp', 'add-formulario'], descricao: 'Loja de materiais de construção familiar. Quer aparecer nas buscas do bairro e receber pedidos de orçamento pelo WhatsApp.' },
    { id: 'lead-idiomas', nome: 'Camila Rocha', empresa: 'Língua Viva Idiomas', email: 'camila@linguaviva.exemplo.com.br', telefone: '(11) 5550-0111', segmento: 'Educação', tipoSite: 'srv-blog', orcamentoDisponivel: 2400, prazoDesejado: 25, perfil: 'indeciso', necessidades: ['add-formulario', 'add-seo'], descricao: 'Escola de idiomas que publica dicas de estudo nas redes. Pensa em um blog para atrair alunos, mas não sabe se dará conta de manter.' },
    { id: 'lead-imobiliaria', nome: 'Eduardo Valença', empresa: 'Valença Imóveis', email: 'eduardo@valencaimoveis.exemplo.com.br', telefone: '(11) 5550-0112', segmento: 'Imobiliário', tipoSite: 'srv-sistema', orcamentoDisponivel: 9500, prazoDesejado: 50, perfil: 'empresarial', necessidades: ['add-painel', 'add-banco', 'add-galeria', 'add-apis', 'add-seo'], descricao: 'Imobiliária com 12 corretores. Precisa de um sistema de cadastro e busca de imóveis integrado ao portal de anúncios que já utiliza.' },
  ];

  const listar = () => Storage.ler('clientes');
  const buscar = (id) => Storage.buscar('clientes', id);
  const contatoPorId = (id) => CONTATOS.find((c) => c.id === id) || null;

  function nomeDe(id) {
    const cliente = buscar(id);
    return cliente ? cliente.nome : 'Cliente removido';
  }

  /** Nome curto para listas: empresa quando houver, senão o nome da pessoa. */
  function rotuloDe(cliente) {
    return cliente ? (cliente.empresa || cliente.nome) : 'Cliente removido';
  }

  /* ---------- Contatos automáticos ---------- */

  /** Contatos que ainda não passaram pela agência. */
  function contatosDisponiveis() {
    const sistema = Storage.ler('sistema');
    return CONTATOS.filter((c) => !sistema.leadsUsados.includes(c.id) && !sistema.leadsPendentes.includes(c.id));
  }

  /** Coloca o próximo contato inédito na caixa de entrada. Retorna o contato ou null se a fila acabou. */
  function receberContato() {
    const proximo = contatosDisponiveis()[0];
    if (!proximo) return null;
    Storage.alterarObjeto('sistema', (sistema) => {
      sistema.leadsPendentes.push(proximo.id);
      sistema.ultimaChegadaLead = util.hoje();
      return sistema;
    });
    SS.Notificacoes.criar({
      tipo: 'cliente',
      titulo: 'Novo cliente interessado',
      mensagem: proximo.nome + ', de ' + proximo.empresa + ', pediu contato sobre ' + SS.Servicos.nomeDe(proximo.tipoSite).toLowerCase() + '.',
      link: 'clientes.html',
    });
    return proximo;
  }

  /** No máximo um contato espontâneo por dia, e só se a caixa de entrada não estiver cheia. */
  function verificarChegadaDeContatos() {
    const sistema = Storage.ler('sistema');
    if (sistema.ultimaChegadaLead === util.hoje() || sistema.leadsPendentes.length >= 2) return;
    if (!sistema.ultimaChegadaLead) { Storage.alterarObjeto('sistema', { ultimaChegadaLead: util.hoje() }); return; }
    receberContato();
  }

  function retirarDaCaixa(contatoId) {
    Storage.alterarObjeto('sistema', (sistema) => {
      sistema.leadsPendentes = sistema.leadsPendentes.filter((id) => id !== contatoId);
      if (!sistema.leadsUsados.includes(contatoId)) sistema.leadsUsados.push(contatoId);
      return sistema;
    });
  }

  function aceitarContato(contatoId) {
    const contato = contatoPorId(contatoId);
    if (!contato) return null;
    const cliente = Object.assign({}, contato, { id: Storage.gerarId('cli'), leadId: contato.id, origem: 'lead', criadoEm: util.agora() });
    Storage.inserir('clientes', cliente);
    retirarDaCaixa(contatoId);
    return cliente;
  }

  /** Devolve à fila os contatos dispensados ou cujos clientes foram excluídos. */
  function reabrirFilaDeContatos() {
    const emUso = new Set(listar().map((c) => c.leadId).filter(Boolean));
    let liberados = 0;
    Storage.alterarObjeto('sistema', (sistema) => {
      const antes = sistema.leadsUsados.length;
      sistema.leadsUsados = sistema.leadsUsados.filter((id) => emUso.has(id));
      liberados = antes - sistema.leadsUsados.length;
      return sistema;
    });
    return liberados;
  }

  /* ---------- Situação e histórico ---------- */

  function situacao(cliente, contexto) {
    const orcamentos = (contexto ? contexto.orcamentos : Storage.ler('orcamentos')).filter((o) => o.clienteId === cliente.id);
    const projetos = (contexto ? contexto.projetos : Storage.ler('projetos')).filter((p) => p.clienteId === cliente.id);
    if (projetos.some((p) => p.status !== 'entregue')) return { rotulo: 'Projeto em andamento', tom: 'ouro' };
    if (projetos.length) return { rotulo: 'Projeto entregue', tom: 'ouro' };
    if (orcamentos.some((o) => o.status === 'negociacao' || o.status === 'enviado')) return { rotulo: 'Em negociação', tom: 'rosa' };
    if (orcamentos.some((o) => o.status === 'rascunho' || o.status === 'aguardando')) return { rotulo: 'Proposta em preparo', tom: 'claro' };
    if (orcamentos.length) return { rotulo: 'Sem proposta ativa', tom: 'neutro' };
    return { rotulo: 'Aguardando proposta', tom: 'champanhe' };
  }

  /**
   * Linha do tempo derivada dos próprios registros (nada é armazenado em duplicidade).
   * Sem clienteId, devolve as atividades de toda a agência.
   */
  function atividades(clienteId) {
    const clientes = listar();
    const nome = (id) => { const c = clientes.find((x) => x.id === id); return c ? rotuloDe(c) : 'cliente removido'; };
    const doCliente = (registro) => !clienteId || registro.clienteId === clienteId;
    const itens = [];
    const adicionar = (data, icone, texto, link) => { if (data) itens.push({ data, icone, texto, link }); };

    clientes.filter((c) => !clienteId || c.id === clienteId).forEach((c) =>
      adicionar(c.criadoEm, 'user-plus', (c.origem === 'manual' ? 'Cliente cadastrado: ' : 'Novo contato atendido: ') + rotuloDe(c), 'clientes.html?id=' + c.id));

    const orcamentos = Storage.ler('orcamentos');
    orcamentos.filter(doCliente).forEach((o) => {
      adicionar(o.criadoEm, 'file-plus-2', 'Orçamento ' + o.codigo + ' criado para ' + nome(o.clienteId), 'orcamentos.html?ver=' + o.id);
      if (o.expiradoEm) adicionar(o.expiradoEm, 'hourglass', 'Orçamento ' + o.codigo + ' expirou sem resposta', 'orcamentos.html?ver=' + o.id);
    });

    const rotulos = SS.Negociacoes ? SS.Negociacoes.TIPOS_RODADA : {};
    Storage.ler('negociacoes').filter(doCliente).forEach((n) => {
      const orcamento = orcamentos.find((o) => o.id === n.orcamentoId);
      const codigo = orcamento ? orcamento.codigo : 'proposta';
      n.rodadas.forEach((r) => {
        const tipo = rotulos[r.tipo] || { rotulo: r.tipo, icone: 'message-square' };
        const texto = r.autor === 'cliente'
          ? nome(n.clienteId) + ' — ' + tipo.rotulo.toLowerCase() + ' (' + codigo + ')'
          : tipo.rotulo + ' — ' + codigo + ' para ' + nome(n.clienteId);
        adicionar(r.data, tipo.icone, texto, 'negociacoes.html?id=' + n.id);
      });
    });

    const projetos = Storage.ler('projetos');
    projetos.filter(doCliente).forEach((p) => {
      (p.historico || []).forEach((h) => {
        const etapa = SS.Projetos ? SS.Projetos.ETAPAS.find((e) => e.id === h.status) : null;
        adicionar(h.data, 'kanban', 'Projeto ' + p.nome + ': ' + (etapa ? etapa.rotulo.toLowerCase() : h.status), 'projetos.html?id=' + p.id);
      });
    });

    Storage.ler('receitas').filter((r) => r.status === 'recebido' && doCliente(r)).forEach((r) =>
      adicionar(r.recebidoEm, 'banknote', 'Pagamento recebido de ' + nome(r.clienteId) + ': ' + util.moeda(r.valor) + ' (parcela ' + r.parcela + '/' + r.totalParcelas + ')', 'financeiro.html'));

    if (!clienteId) {
      Storage.ler('despesas').forEach((d) => adicionar(d.data, 'receipt', 'Despesa registrada: ' + d.descricao + ' (' + util.moeda(d.valor) + ')', 'financeiro.html?aba=despesas'));
    } else {
      Storage.ler('despesas').filter((d) => d.projetoId && projetos.some((p) => p.id === d.projetoId && p.clienteId === clienteId))
        .forEach((d) => adicionar(d.data, 'receipt', 'Despesa do projeto: ' + d.descricao + ' (' + util.moeda(d.valor) + ')', 'financeiro.html?aba=despesas'));
    }

    return itens.sort((a, b) => (util.paraData(a.data) < util.paraData(b.data) ? 1 : -1));
  }

  function htmlLinhaDoTempo(itens, limite) {
    return '<ol class="linha-tempo">' + itens.slice(0, limite || itens.length).map((item) =>
      '<li><span class="linha-tempo__icone">' + ui.icone(item.icone) + '</span><div>' +
      (item.link ? '<a href="' + item.link + '">' + util.esc(item.texto) + '</a>' : '<span>' + util.esc(item.texto) + '</span>') +
      '<small>' + util.dataHora(item.data).replace(' às 00:00', '') + '</small></div></li>').join('') + '</ol>';
  }

  /* ---------- Exclusão ---------- */

  /** Clientes com projeto não podem ser excluídos: o histórico financeiro depende deles. */
  function podeExcluir(clienteId) {
    return !Storage.ler('projetos').some((p) => p.clienteId === clienteId);
  }

  function excluir(clienteId) {
    if (!podeExcluir(clienteId)) return false;
    Storage.remover('negociacoes', (n) => n.clienteId === clienteId);
    Storage.remover('orcamentos', (o) => o.clienteId === clienteId);
    Storage.remover('clientes', clienteId);
    return true;
  }

  /* =====================================================================
   * Página de clientes
   * ===================================================================== */

  const filtros = { busca: '', segmento: '', perfil: '' };

  function htmlNecessidades(ids) {
    const nomes = (ids || []).map((id) => SS.Servicos.buscar(id)).filter(Boolean).map((s) => s.nome);
    return nomes.length ? '<ul class="lista-etiquetas">' + nomes.map((n) => '<li class="etiqueta">' + util.esc(n) + '</li>').join('') + '</ul>' : '<p class="texto-suave">Nenhuma necessidade específica registrada.</p>';
  }

  function desenharCaixaDeEntrada() {
    const sistema = Storage.ler('sistema');
    const pendentes = sistema.leadsPendentes.map(contatoPorId).filter(Boolean);
    const alvo = document.getElementById('caixa-contatos');
    if (!pendentes.length) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    alvo.hidden = false;
    ui.render(alvo,
      '<header class="secao__cabecalho"><div><p class="sobrelinha">Caixa de entrada</p><h2>' + util.plural(pendentes.length, 'contato interessado', 'contatos interessados') + '</h2></div>' +
      '<p class="texto-suave">Contatos fictícios gerados pela simulação. Atenda para incluí-los na carteira.</p></header>' +
      '<div class="contatos">' + pendentes.map((c) => {
        const perfil = PERFIS[c.perfil];
        return '<article class="contato">' +
          '<header>' + ui.avatar(c.nome) + '<div><h3>' + util.esc(c.nome) + '</h3><p>' + util.esc(c.empresa) + ' · ' + util.esc(c.segmento) + '</p></div></header>' +
          '<p class="contato__texto">' + util.esc(c.descricao) + '</p>' +
          '<dl class="contato__dados">' +
            '<div><dt>Procura</dt><dd>' + util.esc(SS.Servicos.nomeDe(c.tipoSite)) + '</dd></div>' +
            '<div><dt>Orçamento</dt><dd>' + util.moeda(c.orcamentoDisponivel, true) + '</dd></div>' +
            '<div><dt>Prazo</dt><dd>' + c.prazoDesejado + ' dias</dd></div>' +
            '<div><dt>Perfil</dt><dd>' + perfil.rotulo + '</dd></div>' +
          '</dl>' +
          '<footer><button type="button" class="botao botao--primario" data-acao="aceitar-contato" data-id="' + c.id + '">' + ui.icone('user-check') + 'Atender</button>' +
          '<button type="button" class="botao botao--fantasma" data-acao="dispensar-contato" data-id="' + c.id + '">Dispensar</button></footer>' +
        '</article>';
      }).join('') + '</div>');
  }

  function clientesFiltrados() {
    const busca = util.semAcento(filtros.busca);
    return listar()
      .filter((c) => !busca || util.semAcento(c.nome).includes(busca) || util.semAcento(c.empresa).includes(busca))
      .filter((c) => !filtros.segmento || c.segmento === filtros.segmento)
      .filter((c) => !filtros.perfil || c.perfil === filtros.perfil)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  }

  function desenharLista() {
    const todos = listar();
    const lista = clientesFiltrados();
    const alvo = document.getElementById('lista-clientes');
    document.getElementById('contagem-clientes').textContent = todos.length
      ? (lista.length === todos.length ? util.plural(todos.length, 'cliente', 'clientes') : lista.length + ' de ' + util.plural(todos.length, 'cliente', 'clientes'))
      : '';

    if (!todos.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'users', titulo: 'Sua carteira está vazia', texto: 'Atenda um contato da caixa de entrada, simule a chegada de um novo interessado ou cadastre um cliente manualmente.', acao: { rotulo: 'Cadastrar cliente', acao: 'novo-cliente' } }));
      return;
    }
    if (!lista.length) {
      ui.render(alvo, ui.estadoVazio({ icone: 'search-x', titulo: 'Nenhum cliente encontrado', texto: 'Nenhum cadastro corresponde à busca e aos filtros aplicados.', acao: { rotulo: 'Limpar filtros', acao: 'limpar-filtros', icone: 'filter-x' } }));
      return;
    }

    const contexto = { orcamentos: Storage.ler('orcamentos'), projetos: Storage.ler('projetos') };
    const linhas = lista.map((c) => {
      const estado = situacao(c, contexto);
      const perfil = PERFIS[c.perfil] || PERFIS.indeciso;
      return '<tr>' +
        '<td><button type="button" class="celula-pessoa" data-acao="ver-cliente" data-id="' + c.id + '">' + ui.avatar(c.nome) +
          '<span><strong>' + util.esc(c.nome) + '</strong><small>' + util.esc(c.empresa || 'Pessoa física') + '</small></span></button>' + ui.seloDemo(c) + '</td>' +
        '<td data-rotulo="Segmento">' + util.esc(c.segmento) + '</td>' +
        '<td data-rotulo="Site desejado">' + util.esc(SS.Servicos.nomeDe(c.tipoSite)) + '</td>' +
        '<td class="num" data-rotulo="Orçamento">' + util.moeda(c.orcamentoDisponivel, true) + '</td>' +
        '<td data-rotulo="Perfil"><span class="perfil-cliente" title="' + util.esc(perfil.resumo) + '">' + ui.icone(perfil.icone) + perfil.rotulo + '</span></td>' +
        '<td data-rotulo="Situação">' + ui.selo(estado.rotulo, estado.tom) + '</td>' +
        '<td class="acoes">' +
          '<a class="botao-icone" href="orcamentos.html?novo=1&cliente=' + c.id + '" aria-label="Novo orçamento para ' + util.esc(c.nome) + '" title="Novo orçamento">' + ui.icone('file-plus-2') + '</a>' +
          '<button type="button" class="botao-icone" data-acao="editar-cliente" data-id="' + c.id + '" aria-label="Editar ' + util.esc(c.nome) + '" title="Editar">' + ui.icone('pencil') + '</button>' +
          '<button type="button" class="botao-icone" data-acao="excluir-cliente" data-id="' + c.id + '" aria-label="Excluir ' + util.esc(c.nome) + '" title="Excluir">' + ui.icone('trash-2') + '</button>' +
        '</td></tr>';
    }).join('');
    ui.render(alvo, '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Cliente</th><th>Segmento</th><th>Site desejado</th><th class="num">Orçamento</th><th>Perfil</th><th>Situação</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhas + '</tbody></table></div>');
  }

  function desenharPagina() {
    desenharCaixaDeEntrada();
    desenharLista();
    const restantes = contatosDisponiveis().length;
    const botao = document.getElementById('simular-contato');
    botao.title = restantes ? 'Traz um novo contato fictício (' + restantes + ' na fila)' : 'Todos os contatos fictícios já passaram pela agência';
  }

  function abrirFormulario(cliente) {
    const novo = !cliente;
    const c = cliente || { nome: '', empresa: '', email: '', telefone: '', segmento: '', descricao: '', tipoSite: '', orcamentoDisponivel: '', prazoDesejado: '', perfil: '', necessidades: [] };
    const adicionais = SS.Servicos.adicionais();
    const conteudo = '<form id="form-cliente" class="grade-form" novalidate>' +
      ui.campo({ nome: 'nome', rotulo: 'Nome do contato', valor: c.nome, obrigatorio: true, maximo: 80, exemplo: 'Ex.: Ana Ribeiro' }) +
      ui.campo({ nome: 'empresa', rotulo: 'Empresa', valor: c.empresa, maximo: 80, exemplo: 'Ex.: Padaria Ribeiro' }) +
      ui.campo({ nome: 'email', tipo: 'email', rotulo: 'E-mail (fictício)', valor: c.email, obrigatorio: true, maximo: 120, exemplo: 'ana@exemplo.com.br' }) +
      ui.campo({ nome: 'telefone', tipo: 'tel', rotulo: 'Telefone (fictício)', valor: c.telefone, obrigatorio: true, maximo: 20, exemplo: '(11) 5550-0100' }) +
      ui.campo({ nome: 'segmento', tipo: 'select', rotulo: 'Segmento de atuação', valor: c.segmento, obrigatorio: true, vazio: 'Selecione', opcoes: SEGMENTOS.map((s) => ({ valor: s, rotulo: s })) }) +
      ui.campo({ nome: 'tipoSite', tipo: 'select', rotulo: 'Tipo de site desejado', valor: c.tipoSite, obrigatorio: true, vazio: 'Selecione', opcoes: SS.Servicos.principais().map((s) => ({ valor: s.id, rotulo: s.nome })) }) +
      ui.campo({ nome: 'descricao', tipo: 'textarea', rotulo: 'Descrição do negócio', valor: c.descricao, obrigatorio: true, maximo: 400, classe: 'campo--largo', exemplo: 'O que a empresa faz e por que precisa de um site.' }) +
      ui.campo({ nome: 'orcamentoDisponivel', tipo: 'moeda', rotulo: 'Orçamento disponível', valor: c.orcamentoDisponivel, obrigatorio: true, minimo: 100, dica: 'Quanto o cliente pretende investir.' }) +
      ui.campo({ nome: 'prazoDesejado', tipo: 'number', rotulo: 'Prazo desejado', valor: c.prazoDesejado, obrigatorio: true, minimo: 1, maximoValor: 365, passo: 1, sufixo: 'dias' }) +
      ui.campo({ nome: 'perfil', tipo: 'select', rotulo: 'Perfil de comportamento', valor: c.perfil, obrigatorio: true, vazio: 'Selecione', classe: 'campo--largo', opcoes: Object.keys(PERFIS).map((id) => ({ valor: id, rotulo: PERFIS[id].rotulo + ' — ' + PERFIS[id].resumo })), dica: 'Define como o cliente reage às propostas durante a negociação.' }) +
      (adicionais.length ? '<fieldset class="campo campo--largo"><legend class="campo__rotulo">O que o cliente precisa <span class="campo__opcional">opcional</span></legend>' +
        '<div class="marcadores">' + adicionais.map((a) => '<label class="marcador"><input type="checkbox" name="necessidades" data-lista value="' + a.id + '"' + ((c.necessidades || []).includes(a.id) ? ' checked' : '') + '><span>' + util.esc(a.nome) + '</span></label>').join('') + '</div>' +
        '<p class="campo__dica">Na negociação, o cliente cobra os itens marcados aqui.</p></fieldset>' : '') +
      '</form>';

    const modal = ui.modal({
      titulo: novo ? 'Novo cliente' : 'Editar cliente',
      subtitulo: 'Use apenas dados fictícios: esta é uma simulação.',
      tamanho: 'g',
      conteudo,
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: novo ? 'Cadastrar cliente' : 'Salvar alterações', variante: 'primario', aoClicar(m) { m.corpo.querySelector('form').requestSubmit(); return false; } },
      ],
    });

    ui.ligarFormulario(modal.corpo.querySelector('form'), {
      nome: (valor) => (valor.length < 3 ? 'Informe o nome completo do contato.' : ''),
      telefone: (valor) => { const digitos = valor.replace(/\D/g, ''); return digitos.length < 10 || digitos.length > 11 ? 'Informe DDD e número, como (11) 5550-0100.' : ''; },
      descricao: (valor) => (valor.length < 10 ? 'Descreva o negócio em pelo menos uma frase.' : ''),
      email: (valor) => (listar().some((outro) => outro.id !== c.id && outro.email.toLowerCase() === valor.toLowerCase()) ? 'Já existe um cliente com este e-mail.' : ''),
    }, (dados) => {
      dados.necessidades = dados.necessidades || [];
      if (novo) {
        Storage.inserir('clientes', Object.assign({ id: Storage.gerarId('cli'), origem: 'manual', criadoEm: util.agora() }, dados));
      } else {
        Storage.atualizar('clientes', c.id, dados);
      }
      modal.fechar();
      desenharPagina();
      SS.App.dadosAlterados();
      ui.toast(novo ? 'Cliente cadastrado.' : 'Dados do cliente atualizados.');
    });
  }

  function abrirDetalhes(clienteId) {
    const c = buscar(clienteId);
    if (!c) { ui.toast('Cliente não encontrado.', 'erro'); return; }
    const perfil = PERFIS[c.perfil] || PERFIS.indeciso;
    const estado = situacao(c);
    const orcamentos = Storage.ler('orcamentos').filter((o) => o.clienteId === c.id).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
    const projetos = Storage.ler('projetos').filter((p) => p.clienteId === c.id);
    const historico = atividades(c.id);

    const htmlOrcamentos = orcamentos.length
      ? '<ul class="lista-simples">' + orcamentos.map((o) => {
        const status = SS.Orcamentos.STATUS[o.status];
        return '<li><a href="orcamentos.html?ver=' + o.id + '"><span class="mono">' + o.codigo + '</span><span>' + util.esc(o.principal.nome) + '</span></a>' +
          '<span class="num">' + util.moeda(SS.Orcamentos.calcular(o).total) + '</span>' + ui.selo(status.rotulo, status.tom) + '</li>';
      }).join('') + '</ul>'
      : '<p class="texto-suave">Nenhum orçamento para este cliente ainda.</p>';

    const htmlProjetos = projetos.length
      ? '<ul class="lista-simples">' + projetos.map((p) => {
        const etapa = SS.Projetos.etapaDe(p);
        return '<li><a href="projetos.html?id=' + p.id + '"><span>' + util.esc(p.nome) + '</span></a><span class="num">' + util.moeda(p.valorContratado) + '</span>' + ui.selo(etapa.rotulo, etapa.tom) + '</li>';
      }).join('') + '</ul>'
      : '<p class="texto-suave">Nenhum projeto contratado.</p>';

    ui.modal({
      titulo: c.nome,
      subtitulo: (c.empresa ? c.empresa + ' · ' : '') + c.segmento,
      tamanho: 'g',
      conteudo:
        '<div class="detalhe">' +
          '<div class="detalhe__topo">' + ui.selo(estado.rotulo, estado.tom) + ui.seloDemo(c) + '<span class="texto-suave">Cadastro em ' + util.data(c.criadoEm) + '</span></div>' +
          '<p class="detalhe__descricao">' + util.esc(c.descricao) + '</p>' +
          '<dl class="ficha">' +
            '<div><dt>E-mail</dt><dd>' + util.esc(c.email) + '</dd></div>' +
            '<div><dt>Telefone</dt><dd>' + util.esc(c.telefone) + '</dd></div>' +
            '<div><dt>Site desejado</dt><dd>' + util.esc(SS.Servicos.nomeDe(c.tipoSite)) + '</dd></div>' +
            '<div><dt>Orçamento disponível</dt><dd>' + util.moeda(c.orcamentoDisponivel) + '</dd></div>' +
            '<div><dt>Prazo desejado</dt><dd>' + c.prazoDesejado + ' dias</dd></div>' +
            '<div><dt>Perfil</dt><dd>' + perfil.rotulo + '</dd></div>' +
          '</dl>' +
          '<p class="aviso aviso--info">' + ui.icone(perfil.icone) + '<span><strong>Cliente ' + perfil.rotulo.toLowerCase() + '.</strong> ' + perfil.resumo + '</span></p>' +
          '<section><h3 class="subtitulo">Necessidades</h3>' + htmlNecessidades(c.necessidades) + '</section>' +
          '<section><h3 class="subtitulo">Orçamentos relacionados</h3>' + htmlOrcamentos + '</section>' +
          '<section><h3 class="subtitulo">Projetos</h3>' + htmlProjetos + '</section>' +
          '<section><h3 class="subtitulo">Histórico</h3>' + (historico.length ? htmlLinhaDoTempo(historico, 14) : '<p class="texto-suave">Sem movimentações.</p>') + '</section>' +
        '</div>',
      acoes: [
        { rotulo: 'Editar', variante: 'fantasma', icone: 'pencil', aoClicar() { setTimeout(() => abrirFormulario(buscar(c.id)), 180); } },
        { rotulo: 'Novo orçamento', variante: 'primario', icone: 'file-plus-2', aoClicar() { global.location.href = 'orcamentos.html?novo=1&cliente=' + c.id; return false; } },
      ],
    });
  }

  async function confirmarExclusao(clienteId) {
    const c = buscar(clienteId);
    if (!c) return;
    if (!podeExcluir(clienteId)) {
      ui.modal({
        titulo: 'Este cliente não pode ser excluído', tamanho: 'p',
        conteudo: '<p class="texto-suave">' + util.esc(c.nome) + ' possui projeto contratado. O cadastro é mantido para preservar o histórico de projetos e pagamentos.</p>',
        acoes: [{ rotulo: 'Entendi', variante: 'primario' }],
      });
      return;
    }
    const quantidade = Storage.ler('orcamentos').filter((o) => o.clienteId === clienteId).length;
    const confirmado = await ui.confirmar({
      titulo: 'Excluir cliente',
      mensagem: 'Excluir ' + c.nome + ' da carteira? Esta ação não pode ser desfeita.',
      detalhe: quantidade ? util.plural(quantidade, 'orçamento', 'orçamentos') + ' e as negociações deste cliente também serão excluídos.' : '',
      rotuloConfirmar: 'Excluir cliente', perigo: true, icone: 'trash-2',
    });
    if (!confirmado) return;
    excluir(clienteId);
    desenharPagina();
    SS.App.dadosAlterados();
    ui.toast('Cliente excluído.');
  }

  function montarPagina() {
    const raiz = document.getElementById('conteudo');
    const seletorSegmento = document.getElementById('filtro-segmento');
    const seletorPerfil = document.getElementById('filtro-perfil');
    seletorSegmento.innerHTML = '<option value="">Todos os segmentos</option>' + SEGMENTOS.map((s) => '<option>' + s + '</option>').join('');
    seletorPerfil.innerHTML = '<option value="">Todos os perfis</option>' + Object.keys(PERFIS).map((id) => '<option value="' + id + '">' + PERFIS[id].rotulo + '</option>').join('');

    const campoBusca = document.getElementById('busca-clientes');
    campoBusca.addEventListener('input', util.atrasar(() => { filtros.busca = campoBusca.value; desenharLista(); }, 150));
    seletorSegmento.addEventListener('change', () => { filtros.segmento = seletorSegmento.value; desenharLista(); });
    seletorPerfil.addEventListener('change', () => { filtros.perfil = seletorPerfil.value; desenharLista(); });

    ui.delegar(raiz, 'click', '[data-acao]', async (evento, alvo) => {
      const { acao, id } = alvo.dataset;
      if (acao === 'novo-cliente') abrirFormulario(null);
      if (acao === 'editar-cliente') abrirFormulario(buscar(id));
      if (acao === 'ver-cliente') abrirDetalhes(id);
      if (acao === 'excluir-cliente') confirmarExclusao(id);
      if (acao === 'limpar-filtros') {
        filtros.busca = filtros.segmento = filtros.perfil = '';
        campoBusca.value = ''; seletorSegmento.value = ''; seletorPerfil.value = '';
        desenharLista();
      }
      if (acao === 'simular-contato') {
        let contato = receberContato();
        if (!contato && reabrirFilaDeContatos()) contato = receberContato();
        if (contato) { ui.toast(contato.nome + ' entrou em contato com a agência.', 'info'); desenharPagina(); SS.App.dadosAlterados(); }
        else ui.toast('Todos os contatos fictícios já estão na sua carteira ou na caixa de entrada. Cadastre novos clientes manualmente.', 'aviso');
      }
      if (acao === 'aceitar-contato') {
        const cliente = aceitarContato(id);
        if (cliente) {
          desenharPagina(); SS.App.dadosAlterados();
          ui.toast(cliente.nome + ' agora está na sua carteira.', 'sucesso', { link: { href: 'orcamentos.html?novo=1&cliente=' + cliente.id, rotulo: 'Montar orçamento' } });
        }
      }
      if (acao === 'dispensar-contato') {
        const contato = contatoPorId(id);
        const confirmado = await ui.confirmar({ titulo: 'Dispensar contato', mensagem: 'Dispensar ' + contato.nome + '? O contato sai da caixa de entrada sem virar cliente.', rotuloConfirmar: 'Dispensar' });
        if (confirmado) { retirarDaCaixa(id); desenharPagina(); SS.App.dadosAlterados(); ui.toast('Contato dispensado.', 'info'); }
      }
    });

    desenharPagina();
    const aberto = util.parametro('id');
    if (aberto) abrirDetalhes(aberto);
  }

  SS.Clientes = {
    SEGMENTOS, PERFIS, CONTATOS,
    listar, buscar, nomeDe, rotuloDe, situacao, atividades, htmlLinhaDoTempo,
    receberContato, verificarChegadaDeContatos, aceitarContato, contatosDisponiveis, contatoPorId, reabrirFilaDeContatos,
    podeExcluir, excluir,
  };
  SS.App.paginas.clientes = montarPagina;
})(window);
