/*
 * SiteSeller — negociacoes.js
 * Simulação de negociação baseada em regras. Cada perfil de cliente avalia preço,
 * orçamento disponível, serviços, prazo, necessidades e o histórico da conversa.
 * Nenhuma decisão é sorteada: a mesma proposta, no mesmo ponto da conversa,
 * produz sempre a mesma reação.
 */
(function (global) {
  'use strict';

  /** Inicial minúscula para usar o nome no meio de uma frase, preservando siglas e marcas (SEO, WhatsApp, APIs). */
  const minuscula = (texto) => String(texto || '').split(' ').map((p) => (/^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(p) ? p.toLowerCase() : p)).join(' ');

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  /*
   * Regras por perfil.
   * tetoInicial/concessao/tetoMaximo: fração do orçamento disponível que o cliente aceita pagar
   *   na primeira resposta, quanto cede a cada rodada e até onde chega.
   * ruptura: acima desta fração do orçamento, recusa sem negociar.
   * prazoTolerado: múltiplo do prazo desejado que ainda aceita.
   * coberturaMinima: fração das necessidades que a proposta precisa atender.
   * paciencia: quantas vezes responde antes de desistir.
   * prioridades: ordem em que reclama dos problemas da proposta.
   */
  const REGRAS = {
    economico: { tetoInicial: 0.82, concessao: 0.07, tetoMaximo: 1.0, ruptura: 1.7, prazoTolerado: 1.5, coberturaMinima: 0.5, paciencia: 5, prioridades: ['preco', 'tipoSite', 'prazo', 'funcionalidades'] },
    exigente: { tetoInicial: 1.0, concessao: 0.08, tetoMaximo: 1.25, ruptura: 1.7, prazoTolerado: 1.25, coberturaMinima: 1, paciencia: 4, exigeAcabamento: true, rigido: true, prioridades: ['tipoSite', 'funcionalidades', 'acabamento', 'prazo', 'preco'] },
    indeciso: { tetoInicial: 0.95, concessao: 0.05, tetoMaximo: 1.1, ruptura: 1.6, prazoTolerado: 1.3, coberturaMinima: 0.6, paciencia: 6, duvidasNecessarias: 2, prioridades: ['info', 'tipoSite', 'preco', 'funcionalidades', 'prazo'] },
    urgente: { tetoInicial: 1.1, concessao: 0.08, tetoMaximo: 1.3, ruptura: 1.8, prazoTolerado: 1.0, prazoRuptura: 1.6, coberturaMinima: 0.5, paciencia: 3, prioridades: ['prazo', 'tipoSite', 'preco', 'funcionalidades'] },
    empresarial: { tetoInicial: 1.05, concessao: 0.05, tetoMaximo: 1.2, ruptura: 1.6, prazoTolerado: 1.2, coberturaMinima: 1, paciencia: 5, exigeAcabamento: true, rigido: true, prefereParcelado: true, prioridades: ['tipoSite', 'funcionalidades', 'acabamento', 'pagamento', 'preco', 'prazo'] },
  };

  const VALOR_PARA_PARCELAR = 4000;
  const TOPICOS = ['suporte', 'cronograma', 'exemplos', 'pagamento'];

  const TIPOS_RODADA = {
    proposta: { rotulo: 'Proposta enviada', icone: 'send' },
    ajuste: { rotulo: 'Proposta revisada', icone: 'file-pen-line' },
    manter: { rotulo: 'Proposta mantida', icone: 'shield-check' },
    esclarecimento: { rotulo: 'Esclarecimento enviado', icone: 'message-square-text' },
    aceite_agencia: { rotulo: 'Contraproposta aceita', icone: 'handshake' },
    encerrar: { rotulo: 'Negociação encerrada pela agência', icone: 'door-open' },
    aceite: { rotulo: 'Aceitou a proposta', icone: 'badge-check' },
    recusa: { rotulo: 'Recusou a proposta', icone: 'circle-x' },
    desconto: { rotulo: 'Pediu desconto', icone: 'percent' },
    contraproposta: { rotulo: 'Fez uma contraproposta', icone: 'arrow-left-right' },
    alteracao: { rotulo: 'Pediu alterações', icone: 'file-pen-line' },
    adicional: { rotulo: 'Pediu funcionalidades adicionais', icone: 'package-plus' },
    duvida: { rotulo: 'Pediu mais informações', icone: 'circle-help' },
  };

  const STATUS = {
    ativa: { rotulo: 'Em andamento', tom: 'rosa' },
    aprovada: { rotulo: 'Fechada', tom: 'ouro' },
    recusada: { rotulo: 'Recusada', tom: 'vinho' },
    encerrada: { rotulo: 'Encerrada pela agência', tom: 'neutro' },
    expirada: { rotulo: 'Expirada', tom: 'apagado' },
  };

  /* ---------- Mensagens ---------- */

  const FALAS = {
    aceite: {
      geral: ['Fechado. A proposta atende ao que eu precisava — pode seguir com o contrato.', 'Está aprovado. {valor} com entrega em {prazo} dias funciona para nós.'],
      economico: ['Coube no bolso. Por {valor} eu fecho — pode mandar o contrato.', 'Tá bom, você me convenceu. Fechamos em {valor}.'],
      exigente: ['A proposta está no nível que eu esperava. Aprovado — conto com o mesmo cuidado na execução.', 'Agora sim está completa. Podem seguir; vou acompanhar cada etapa de perto.'],
      indeciso: ['Pensei bastante e agora estou seguro. Vamos fechar em {valor}.', 'Obrigado pela paciência com as minhas dúvidas. Pode seguir, está aprovado.'],
      urgente: ['Perfeito, {prazo} dias resolve. Aprovado — podem começar hoje?', 'É isso. Aprovado por {valor}; o que importa é estar no ar em {prazo} dias.'],
      empresarial: ['Proposta aprovada internamente. Seguimos com {valor}; aguardo o contrato para assinatura.', 'A diretoria validou o escopo e as condições. Podemos formalizar.'],
    },
    recusa_preco: {
      geral: ['Agradeço a proposta, mas {valor} está muito além do que posso investir — tenho cerca de {orcamento}. Vou procurar outra opção.'],
      economico: ['{valor}? Meu teto era {orcamento}. Assim não tem como; vou buscar algo mais em conta.'],
      empresarial: ['O valor de {valor} ultrapassa em muito a verba aprovada de {orcamento}. Não temos como levar isso adiante.'],
    },
    recusa_prazo: { geral: ['Não consigo esperar {prazo} dias. Preciso do site em {prazoDesejado}; vou fechar com quem entregue a tempo.'] },
    recusa_simples: { geral: ['A proposta é simples demais para o que descrevi. Não contempla nada do que pedi ({itens}). Prefiro não seguir.'] },
    recusa_desgaste: {
      geral: ['Já fomos e voltamos várias vezes e não chegamos a um acordo. Prefiro encerrar por aqui.'],
      indeciso: ['Ainda não me sinto seguro e a conversa se alongou demais. Vou deixar o projeto para outro momento.'],
      urgente: ['Perdi tempo demais nessa negociação e tempo é justamente o que eu não tenho. Vou resolver com outro fornecedor.'],
    },
    recusa_final_preco: { geral: ['Se {valor} é a condição final, fico de fora. Meu limite não chega a isso.'], economico: ['Sem baixar de {valor} não fecho. Obrigado pelo tempo.'] },
    recusa_final_prazo: { geral: ['Com {prazo} dias de prazo não resolve para mim. Vou ter que recusar.'] },
    recusa_final_funcionalidades: { geral: ['Sem {itens} a proposta não resolve o meu problema. Não vou seguir.'] },
    recusa_final_tipoSite: { geral: ['Pedi {tipoDesejado} e a proposta insiste em {servicoAtual}. Não é o que preciso.'] },
    recusa_final_acabamento: { geral: ['Um projeto de nível simples não representa a nossa marca. Sem rever isso, não aprovo.'] },
    recusa_final_pagamento: { geral: ['Não temos como pagar esse valor à vista, e a condição não mudou. Vamos buscar outro fornecedor.'] },
    recusa_final_info: { geral: ['Eu ainda tinha dúvidas e me senti pressionado a decidir. Prefiro não fechar agora.'] },
    desconto: {
      geral: ['Gostei da proposta, mas {valor} passa do que planejei. Consegue {pct}% de desconto?'],
      economico: ['Achei salgado. Meu orçamento é {orcamento}… Faz {pct}% de desconto que a gente conversa?', 'Tá caro pra mim. Com {pct}% a menos eu consigo pensar em fechar.'],
      exigente: ['O escopo está bom. Só o valor ficou acima do previsto — com {pct}% de ajuste, aprovamos.'],
      urgente: ['Entendo que urgência tem custo, mas {valor} pesou. Se der {pct}% de desconto, aprovo agora.'],
      empresarial: ['Estamos {pct}% acima da verba aprovada. Se ajustarem o valor nessa proporção, consigo aprovar.'],
    },
    contraproposta: {
      geral: ['O máximo a que consigo chegar é {valorContra}. Fechamos nesse valor?'],
      economico: ['Vou ser direto: tenho {valorContra} para isso. Se fizer por esse valor, fecho hoje.', 'Ainda está acima. Minha contraproposta é {valorContra} — é o que cabe.'],
      empresarial: ['Nossa verba comporta {valorContra}. Conseguem adequar a proposta a esse valor?'],
      urgente: ['Não tenho tempo para idas e vindas: {valorContra} e fechamos agora.'],
    },
    alteracao_prazo: {
      geral: ['O prazo de {prazo} dias é longo para mim. Preciso em até {prazoDesejado} dias — dá para ajustar?'],
      urgente: ['{prazo} dias não serve. Preciso disso no ar em {prazoDesejado} dias, mesmo que custe um pouco mais.', 'Meu problema é prazo: tem que estar pronto em {prazoDesejado} dias. Consegue?'],
    },
    alteracao_tipoSite: { geral: ['Acho que houve um desencontro: eu preciso de {tipoDesejado}, e a proposta fala em {servicoAtual}. Pode refazer?'] },
    alteracao_acabamento: {
      geral: ['O nível simples não combina com a imagem que queremos passar. Quero um acabamento mais elaborado — pode revisar?'],
      empresarial: ['Para o porte da nossa operação, o projeto precisa de um nível acima do simples. Podem ajustar a proposta?'],
    },
    alteracao_pagamento: { geral: ['O escopo está adequado, mas não pagamos projetos desse porte à vista. Podem parcelar?'] },
    adicional: {
      geral: ['Senti falta de alguns itens que comentei: {itens}. Pode incluir e me mandar o valor atualizado?'],
      exigente: ['A proposta está incompleta. Para mim é indispensável ter {itens}. Inclua, por favor.'],
      empresarial: ['Precisamos de uma solução completa. Faltou contemplar {itens} — sem isso não consigo aprovar internamente.'],
      economico: ['Quero gastar pouco, mas sem {itens} o site não me serve. Dá para incluir sem pesar muito?'],
    },
    duvida_suporte: { geral: ['Antes de decidir: depois que o site for entregue, vocês dão suporte? E se algo parar de funcionar?'] },
    duvida_cronograma: { geral: ['Como funciona o andamento? Eu acompanho as etapas ou só vejo o site pronto no final?'] },
    duvida_exemplos: { geral: ['Vocês já fizeram algo parecido para um negócio como o meu? Queria ver exemplos antes de decidir.'] },
    duvida_pagamento: { geral: ['Fiquei em dúvida sobre o pagamento: o que acontece se eu precisar pausar o projeto no meio?'] },
  };

  const ESCLARECIMENTOS = {
    suporte: 'Todo projeto inclui 30 dias de suporte após a entrega para ajustes e correções, sem custo. Depois disso, oferecemos manutenção opcional.',
    cronograma: 'Você acompanha cada etapa: planejamento, desenvolvimento e revisão. Antes da entrega há uma rodada de revisão para os seus ajustes.',
    exemplos: 'Separamos três projetos do nosso portfólio com perfil parecido com o seu, com o contexto e o resultado de cada um.',
    pagamento: 'As parcelas acompanham o andamento. Se o projeto for pausado, você paga apenas pelas etapas já entregues.',
  };

  function listaEmTexto(nomes) {
    if (nomes.length <= 1) return nomes.join('');
    return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  }

  function comporFala(chave, perfil, variaveis, semente) {
    const grupo = FALAS[chave] || {};
    const opcoes = grupo[perfil] || grupo.geral || ['…'];
    const modelo = opcoes[util.hash(semente) % opcoes.length];
    return modelo.replace(/\{(\w+)\}/g, (trecho, nome) => (variaveis[nome] !== undefined ? variaveis[nome] : trecho));
  }

  /* ---------- Motor de decisão ---------- */

  const listar = () => Storage.ler('negociacoes');
  const buscar = (id) => Storage.buscar('negociacoes', id);

  function contexto(negociacao) {
    const orcamento = SS.Orcamentos.buscar(negociacao.orcamentoId);
    const cliente = SS.Clientes.buscar(negociacao.clienteId);
    if (!orcamento || !cliente) return null;
    return { negociacao, orcamento, cliente, calculo: SS.Orcamentos.calcular(orcamento) };
  }

  /** Mede a proposta pelos olhos do cliente. Função pura: não grava nada. */
  function analisar(ctx) {
    const { cliente, orcamento, calculo, negociacao } = ctx;
    const regra = REGRAS[cliente.perfil] || REGRAS.indeciso;
    const rodadas = negociacao.rodadas.filter((r) => r.autor === 'cliente').length;
    const pedidosAtendidos = negociacao.rodadas.filter((r) => r.autor === 'agencia' && r.atendeu).length;

    const necessidades = (cliente.necessidades || []).filter((id) => SS.Servicos.buscar(id));
    const incluidos = new Set(orcamento.adicionais.map((a) => a.servicoId));
    const faltantes = necessidades.filter((id) => !incluidos.has(id));
    const cobertura = necessidades.length ? 1 - faltantes.length / necessidades.length : 1;

    // Valor percebido: proposta completa e pedidos atendidos aumentam a disposição a pagar.
    const bonus = (necessidades.length && cobertura === 1 ? 0.03 : 0) + Math.min(0.04, pedidosAtendidos * 0.02);
    const teto = Math.min(regra.tetoMaximo, regra.tetoInicial + regra.concessao * rodadas) + bonus;
    const tetoFinal = regra.tetoMaximo + bonus;
    const verba = cliente.orcamentoDisponivel;
    const prazoAceito = cliente.prazoDesejado * (regra.prazoTolerado + (rodadas >= 2 ? 0.1 : 0));
    const tipoDesejado = SS.Servicos.buscar(cliente.tipoSite);

    const pendencias = {
      preco: calculo.total > verba * teto + 0.005,
      prazo: calculo.prazo > prazoAceito + 0.001,
      funcionalidades: cobertura + 0.001 < regra.coberturaMinima,
      tipoSite: Boolean(tipoDesejado) && orcamento.principal.servicoId !== tipoDesejado.id,
      acabamento: Boolean(regra.exigeAcabamento) && orcamento.complexidade === 'baixa',
      pagamento: Boolean(regra.prefereParcelado) && orcamento.pagamento === 'avista' && calculo.total >= VALOR_PARA_PARCELAR,
      info: Boolean(regra.duvidasNecessarias) && (negociacao.duvidasResolvidas || 0) < regra.duvidasNecessarias,
    };
    const ordenadas = regra.prioridades.filter((p) => pendencias[p]);

    return { regra, rodadas, necessidades, faltantes, cobertura, teto, tetoFinal, verba, prazoAceito, tipoDesejado, pendencias, ordenadas, razaoPreco: calculo.total / verba };
  }

  /**
   * Decide a reação do cliente à proposta atual.
   * Retorna { tipo, chaveFala, dados } — tipo é uma das chaves de cliente em TIPOS_RODADA.
   */
  function decidir(ctx) {
    const { cliente, orcamento, calculo, negociacao } = ctx;
    const a = analisar(ctx);
    const { regra, pendencias, ordenadas } = a;
    const nomesFaltantes = a.faltantes.map((id) => SS.Servicos.nomeDe(id));
    const dadosBase = { analise: { razaoPreco: util.arredondar(a.razaoPreco), cobertura: util.arredondar(a.cobertura), pendencias: ordenadas } };

    /* 1. Rupturas: situações em que o cliente nem negocia. */
    if (calculo.total > a.verba * regra.ruptura) return { tipo: 'recusa', chaveFala: 'recusa_preco', dados: Object.assign({ motivo: 'preco' }, dadosBase) };
    if (regra.prazoRuptura && calculo.prazo > cliente.prazoDesejado * regra.prazoRuptura) return { tipo: 'recusa', chaveFala: 'recusa_prazo', dados: Object.assign({ motivo: 'prazo' }, dadosBase) };
    if (cliente.perfil === 'exigente' && a.necessidades.length >= 2 && a.cobertura === 0 && orcamento.complexidade === 'baixa') {
      return { tipo: 'recusa', chaveFala: 'recusa_simples', dados: Object.assign({ motivo: 'simples', itens: a.faltantes }, dadosBase) };
    }

    /* 2. Sem pendências: aceita. */
    if (!ordenadas.length) return { tipo: 'aceite', chaveFala: 'aceite', dados: dadosBase };

    /* 3. A agência declarou que é a condição final: o cliente decide com o limite máximo do perfil. */
    if (negociacao.ultimato) {
      const aceitaFinal = calculo.total <= a.verba * a.tetoFinal + 0.005 &&
        calculo.prazo <= cliente.prazoDesejado * (regra.prazoTolerado + 0.1) + 0.001 &&
        a.cobertura + 0.001 >= regra.coberturaMinima - 0.34 &&
        !(pendencias.tipoSite && regra.rigido) &&
        !(pendencias.acabamento && cliente.perfil === 'exigente') &&
        !(pendencias.pagamento) &&
        !(regra.duvidasNecessarias && (negociacao.duvidasResolvidas || 0) < 1);
      if (aceitaFinal) return { tipo: 'aceite', chaveFala: 'aceite', dados: dadosBase };
      return { tipo: 'recusa', chaveFala: 'recusa_final_' + ordenadas[0], dados: Object.assign({ motivo: ordenadas[0], itens: a.faltantes }, dadosBase) };
    }

    /* 4. Paciência esgotada. */
    if (a.rodadas >= regra.paciencia) return { tipo: 'recusa', chaveFala: 'recusa_desgaste', dados: Object.assign({ motivo: 'desgaste' }, dadosBase) };

    /* 5. Reclama do problema mais importante para o perfil. */
    const principal = ordenadas[0];
    if (principal === 'preco') {
      const limite = a.verba * a.teto;
      const excesso = (calculo.total - limite) / calculo.total;
      const pedeDesconto = cliente.perfil === 'economico' ? a.rodadas === 0 : excesso <= 0.08;
      if (pedeDesconto) {
        const pct = Math.min(40, Math.max(5, Math.ceil(excesso * 100)));
        return { tipo: 'desconto', chaveFala: 'desconto', dados: Object.assign({ pct }, dadosBase) };
      }
      let valor = Math.floor((limite * (cliente.perfil === 'economico' ? 0.97 : 1)) / 50) * 50;
      if (valor >= calculo.total) valor = Math.floor((calculo.total * 0.95) / 50) * 50;
      return { tipo: 'contraproposta', chaveFala: 'contraproposta', dados: Object.assign({ valor }, dadosBase) };
    }
    if (principal === 'prazo') return { tipo: 'alteracao', chaveFala: 'alteracao_prazo', dados: Object.assign({ campo: 'prazo', prazo: cliente.prazoDesejado }, dadosBase) };
    if (principal === 'tipoSite') return { tipo: 'alteracao', chaveFala: 'alteracao_tipoSite', dados: Object.assign({ campo: 'tipoSite', servicoId: a.tipoDesejado.id }, dadosBase) };
    if (principal === 'acabamento') return { tipo: 'alteracao', chaveFala: 'alteracao_acabamento', dados: Object.assign({ campo: 'acabamento' }, dadosBase) };
    if (principal === 'pagamento') return { tipo: 'alteracao', chaveFala: 'alteracao_pagamento', dados: Object.assign({ campo: 'pagamento' }, dadosBase) };
    if (principal === 'funcionalidades') return { tipo: 'adicional', chaveFala: 'adicional', dados: Object.assign({ itens: a.faltantes, nomes: nomesFaltantes }, dadosBase) };

    const perguntados = negociacao.topicosPerguntados || [];
    const topico = TOPICOS.find((t) => !perguntados.includes(t)) || TOPICOS[0];
    return { tipo: 'duvida', chaveFala: 'duvida_' + topico, dados: Object.assign({ topico }, dadosBase) };
  }

  function variaveisDaFala(ctx, decisao) {
    const { cliente, orcamento, calculo } = ctx;
    const dados = decisao.dados || {};
    const tipoDesejado = SS.Servicos.buscar(cliente.tipoSite);
    return {
      valor: util.moeda(calculo.total), orcamento: util.moeda(cliente.orcamentoDisponivel, true),
      prazo: calculo.prazo, prazoDesejado: cliente.prazoDesejado,
      pct: dados.pct, valorContra: util.moeda(dados.valor || 0, true),
      itens: listaEmTexto((dados.itens || []).map((id) => minuscula(SS.Servicos.nomeDe(id)))),
      tipoDesejado: tipoDesejado ? minuscula(tipoDesejado.nome) : 'outro tipo de site',
      servicoAtual: minuscula(orcamento.principal.nome),
    };
  }

  /* ---------- Registro das rodadas ---------- */

  function novaRodada(autor, tipo, mensagem, ctxOuCalculo, extras) {
    return Object.assign({ autor, tipo, mensagem, data: util.agora(), valor: ctxOuCalculo.total, prazo: ctxOuCalculo.prazo }, extras || {});
  }

  /** Cria a negociação quando a proposta é enviada. */
  function abrir(orcamento) {
    const cliente = SS.Clientes.buscar(orcamento.clienteId);
    const c = SS.Orcamentos.calcular(orcamento);
    const itens = orcamento.adicionais.length ? ' com ' + listaEmTexto(orcamento.adicionais.map((a) => minuscula(a.nome))) : '';
    const mensagem = 'Olá, ' + cliente.nome.split(' ').slice(0, cliente.nome.match(/^Dra?\./) ? 2 : 1).join(' ') + '! Segue a proposta ' + orcamento.codigo + ': ' + minuscula(orcamento.principal.nome) + itens +
      ', entrega em ' + c.prazo + ' dias, por ' + util.moeda(c.total) + '. Pagamento: ' + SS.Orcamentos.PAGAMENTOS[orcamento.pagamento].rotulo.toLowerCase() + '.';
    const negociacao = {
      id: Storage.gerarId('neg'), orcamentoId: orcamento.id, clienteId: orcamento.clienteId,
      status: 'ativa', vez: 'cliente', ultimato: false, duvidasResolvidas: 0, topicosPerguntados: [],
      valorInicial: c.total, criadoEm: util.agora(), atualizadoEm: util.agora(),
      rodadas: [novaRodada('agencia', 'proposta', mensagem, c)],
    };
    Storage.inserir('negociacoes', negociacao);
    return negociacao;
  }

  /** O cliente lê a proposta e responde. Aplica as consequências (aprovação, recusa, pedido). */
  function responderComoCliente(negociacaoId) {
    const negociacao = buscar(negociacaoId);
    if (!negociacao || negociacao.status !== 'ativa' || negociacao.vez !== 'cliente') return null;
    const ctx = contexto(negociacao);
    if (!ctx) return null;

    const decisao = decidir(ctx);
    const regra = REGRAS[ctx.cliente.perfil] || REGRAS.indeciso;
    const rodadasCliente = negociacao.rodadas.filter((r) => r.autor === 'cliente').length;
    let mensagem = comporFala(decisao.chaveFala, ctx.cliente.perfil, variaveisDaFala(ctx, decisao), negociacao.id + ':' + rodadasCliente);
    const final = decisao.tipo === 'aceite' || decisao.tipo === 'recusa';
    if (!final && rodadasCliente === regra.paciencia - 1) mensagem += ' Se não chegarmos a um acordo agora, prefiro encerrar.';

    const rodada = novaRodada('cliente', decisao.tipo, mensagem, ctx.calculo, { dados: decisao.dados });
    const atualizada = Storage.atualizar('negociacoes', negociacao.id, (n) => {
      n.rodadas.push(rodada);
      n.atualizadoEm = util.agora();
      n.ultimato = false;
      if (decisao.tipo === 'duvida') n.topicosPerguntados = (n.topicosPerguntados || []).concat(decisao.dados.topico);
      if (final) { n.status = decisao.tipo === 'aceite' ? 'aprovada' : 'recusada'; n.vez = null; n.encerradoEm = util.agora(); }
      else n.vez = 'agencia';
      return n;
    });

    const nome = SS.Clientes.rotuloDe(ctx.cliente);
    const link = 'negociacoes.html?id=' + negociacao.id;
    let projeto = null;
    if (decisao.tipo === 'aceite') {
      projeto = SS.Orcamentos.aprovar(ctx.orcamento.id).projeto;
    } else if (decisao.tipo === 'recusa') {
      SS.Orcamentos.recusar(ctx.orcamento.id);
      SS.Notificacoes.criar({ tipo: 'recusada', titulo: 'Proposta recusada', mensagem: nome + ' recusou ' + ctx.orcamento.codigo + '.', link });
    } else {
      Storage.atualizar('orcamentos', ctx.orcamento.id, { status: 'negociacao', atualizadoEm: util.agora() });
      const titulos = { desconto: 'Cliente solicitou desconto', contraproposta: 'Cliente fez uma contraproposta', alteracao: 'Cliente pediu alterações', adicional: 'Cliente pediu funcionalidades adicionais', duvida: 'Cliente pediu mais informações' };
      SS.Notificacoes.criar({ tipo: 'negociacao', titulo: titulos[decisao.tipo], mensagem: nome + ' respondeu à proposta ' + ctx.orcamento.codigo + ' e aguarda o seu retorno.', link });
    }
    return { negociacao: atualizada, decisao, projeto };
  }

  /* ---------- Ações da agência ---------- */

  function ultimaDoCliente(negociacao) {
    for (let i = negociacao.rodadas.length - 1; i >= 0; i--) if (negociacao.rodadas[i].autor === 'cliente') return negociacao.rodadas[i];
    return null;
  }

  /** Verifica se a proposta revisada atende ao último pedido do cliente. */
  function atendePedido(pedido, antes, depois, orcamento) {
    if (!pedido) return false;
    const d = pedido.dados || {};
    if (pedido.tipo === 'desconto') return depois.total <= antes.total * (1 - d.pct / 100) + 1;
    if (pedido.tipo === 'contraproposta') return depois.total <= d.valor + 1;
    if (pedido.tipo === 'adicional') return (d.itens || []).every((id) => orcamento.adicionais.some((a) => a.servicoId === id));
    if (pedido.tipo === 'alteracao') {
      if (d.campo === 'prazo') return depois.prazo <= d.prazo;
      if (d.campo === 'tipoSite') return orcamento.principal.servicoId === d.servicoId;
      if (d.campo === 'acabamento') return orcamento.complexidade !== 'baixa';
      if (d.campo === 'pagamento') return orcamento.pagamento !== 'avista';
    }
    return false;
  }

  function descreverMudancas(antes, depois) {
    const cAntes = SS.Orcamentos.calcular(antes);
    const cDepois = SS.Orcamentos.calcular(depois);
    const partes = [];
    if (antes.principal.servicoId !== depois.principal.servicoId) partes.push('o tipo de site passou a ser ' + minuscula(depois.principal.nome));
    const novos = depois.adicionais.filter((a) => !antes.adicionais.some((b) => b.servicoId === a.servicoId)).map((a) => minuscula(a.nome));
    const removidos = antes.adicionais.filter((a) => !depois.adicionais.some((b) => b.servicoId === a.servicoId)).map((a) => minuscula(a.nome));
    if (novos.length) partes.push('incluímos ' + listaEmTexto(novos));
    if (removidos.length) partes.push('retiramos ' + listaEmTexto(removidos));
    if (antes.complexidade !== depois.complexidade) partes.push('o nível do projeto agora é ' + SS.Orcamentos.COMPLEXIDADES[depois.complexidade].rotulo.toLowerCase());
    if (cAntes.prazo !== cDepois.prazo) partes.push('o prazo foi de ' + cAntes.prazo + ' para ' + cDepois.prazo + ' dias');
    if (antes.pagamento !== depois.pagamento) partes.push('o pagamento ficou em ' + SS.Orcamentos.PAGAMENTOS[depois.pagamento].rotulo.toLowerCase());
    if (Math.abs(cAntes.desconto - cDepois.desconto) > 0.009 && cDepois.desconto > cAntes.desconto) partes.push('aplicamos ' + util.percentual(cDepois.descontoPercentual) + ' de desconto');
    return { partes, cAntes, cDepois };
  }

  function registrarAcaoDaAgencia(negociacaoId, rodada, alteracoes) {
    return Storage.atualizar('negociacoes', negociacaoId, (n) => {
      n.rodadas.push(rodada);
      n.vez = 'cliente';
      n.atualizadoEm = util.agora();
      return Object.assign(n, alteracoes || {});
    });
  }

  /** Envia uma versão revisada da proposta. Sem mudança real, vale como "manter a proposta". */
  function enviarAjuste(negociacaoId, orcamentoRevisado) {
    const negociacao = buscar(negociacaoId);
    const anterior = SS.Orcamentos.buscar(negociacao.orcamentoId);
    const { partes, cAntes, cDepois } = descreverMudancas(anterior, orcamentoRevisado);
    if (!partes.length && Math.abs(cAntes.total - cDepois.total) < 0.01) return manterProposta(negociacaoId);
    const salvo = SS.Orcamentos.salvar(orcamentoRevisado, 'negociacao');
    const atendeu = atendePedido(ultimaDoCliente(negociacao), cAntes, cDepois, salvo);
    const texto = 'Revisamos a proposta: ' + (partes.length ? listaEmTexto(partes) + '. ' : '') + 'O valor ' + (Math.abs(cAntes.total - cDepois.total) < 0.01 ? 'permanece em ' + util.moeda(cDepois.total) : 'passou de ' + util.moeda(cAntes.total) + ' para ' + util.moeda(cDepois.total)) + ', com entrega em ' + cDepois.prazo + ' dias.';
    return registrarAcaoDaAgencia(negociacaoId, novaRodada('agencia', 'ajuste', texto, cDepois, { atendeu }));
  }

  /** Declara que a condição atual é a final. O cliente responde com sim ou não. */
  function manterProposta(negociacaoId) {
    const ctx = contexto(buscar(negociacaoId));
    const texto = 'Esta é a nossa melhor condição para o escopo proposto: ' + util.moeda(ctx.calculo.total) + ', com entrega em ' + ctx.calculo.prazo + ' dias. Abaixo disso não conseguimos manter a qualidade da entrega.';
    return registrarAcaoDaAgencia(negociacaoId, novaRodada('agencia', 'manter', texto, ctx.calculo), { ultimato: true });
  }

  function esclarecer(negociacaoId) {
    const negociacao = buscar(negociacaoId);
    const ctx = contexto(negociacao);
    const pedido = ultimaDoCliente(negociacao);
    const topico = pedido && pedido.dados && pedido.dados.topico ? pedido.dados.topico : TOPICOS[0];
    return registrarAcaoDaAgencia(negociacaoId, novaRodada('agencia', 'esclarecimento', ESCLARECIMENTOS[topico], ctx.calculo, { atendeu: true }), { duvidasResolvidas: (negociacao.duvidasResolvidas || 0) + 1 });
  }

  /** Orçamento como ficaria se a contraproposta do cliente fosse aceita. */
  function orcamentoComContraproposta(negociacao) {
    const pedido = ultimaDoCliente(negociacao);
    if (!pedido || pedido.tipo !== 'contraproposta') return null;
    const orcamento = SS.Orcamentos.buscar(negociacao.orcamentoId);
    const semDesconto = SS.Orcamentos.calcular(Object.assign({}, orcamento, { descontoValor: 0 }));
    return Object.assign({}, orcamento, { descontoTipo: 'valor', descontoValor: util.arredondar(semDesconto.subtotal - pedido.dados.valor) });
  }

  /** Fecha a venda pelo valor que o cliente propôs. */
  function aceitarContraproposta(negociacaoId) {
    const negociacao = buscar(negociacaoId);
    const revisado = orcamentoComContraproposta(negociacao);
    if (!revisado) return null;
    const salvo = SS.Orcamentos.salvar(revisado, 'negociacao');
    const c = SS.Orcamentos.calcular(salvo);
    Storage.atualizar('negociacoes', negociacaoId, (n) => {
      n.rodadas.push(novaRodada('agencia', 'aceite_agencia', 'Fechado! Aceitamos ' + util.moeda(c.total) + '. Vamos preparar o contrato e iniciar o projeto.', c, { atendeu: true }));
      n.status = 'aprovada'; n.vez = null; n.atualizadoEm = n.encerradoEm = util.agora();
      return n;
    });
    return SS.Orcamentos.aprovar(salvo.id);
  }

  function encerrar(negociacaoId) {
    const negociacao = buscar(negociacaoId);
    const ctx = contexto(negociacao);
    Storage.atualizar('negociacoes', negociacaoId, (n) => {
      n.rodadas.push(novaRodada('agencia', 'encerrar', 'Agradecemos o contato, mas não conseguiremos avançar nessas condições. Ficamos à disposição para um projeto futuro.', ctx.calculo));
      n.status = 'encerrada'; n.vez = null; n.atualizadoEm = n.encerradoEm = util.agora();
      return n;
    });
    SS.Orcamentos.recusar(negociacao.orcamentoId);
  }

  /* =====================================================================
   * Página de negociações
   * ===================================================================== */

  const tela = { filtro: 'ativas', selecionada: null, temporizador: null };

  function negociacoesFiltradas() {
    return listar()
      .filter((n) => tela.filtro === 'todas' || (tela.filtro === 'ativas' ? n.status === 'ativa' : n.status !== 'ativa'))
      .sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
  }

  function desenharLista() {
    const todas = listar();
    const ativas = todas.filter((n) => n.status === 'ativa').length;
    const filtrosHtml = [['ativas', 'Em andamento', ativas], ['encerradas', 'Encerradas', todas.length - ativas], ['todas', 'Todas', todas.length]]
      .map(([id, rotulo, total]) => '<button type="button" class="chip' + (tela.filtro === id ? ' chip--ativo' : '') + '" data-filtro="' + id + '" aria-pressed="' + (tela.filtro === id) + '">' + rotulo + '<span>' + total + '</span></button>').join('');
    const lista = negociacoesFiltradas();
    const itens = lista.map((n) => {
      const cliente = SS.Clientes.buscar(n.clienteId);
      const orcamento = SS.Orcamentos.buscar(n.orcamentoId);
      const ultima = n.rodadas[n.rodadas.length - 1];
      const status = STATUS[n.status];
      const marcador = n.status === 'ativa' ? (n.vez === 'agencia' ? '<span class="conversa__vez">Sua vez</span>' : '<span class="conversa__vez conversa__vez--cliente">Cliente analisando</span>') : ui.selo(status.rotulo, status.tom);
      return '<li><button type="button" class="conversa' + (n.id === tela.selecionada ? ' conversa--ativa' : '') + '" data-negociacao="' + n.id + '"' + (n.id === tela.selecionada ? ' aria-current="true"' : '') + '>' +
        ui.avatar(cliente ? cliente.nome : '?') +
        '<span class="conversa__corpo"><span class="conversa__topo"><strong>' + util.esc(cliente ? SS.Clientes.rotuloDe(cliente) : 'Cliente removido') + '</strong><small>' + util.tempoRelativo(n.atualizadoEm) + '</small></span>' +
        '<span class="conversa__trecho">' + (ultima.autor === 'agencia' ? 'Você: ' : '') + util.esc(ultima.mensagem) + '</span>' +
        '<span class="conversa__rodape"><span class="mono">' + (orcamento ? orcamento.codigo : '—') + '</span>' + marcador + '</span></span></button></li>';
    }).join('');
    ui.render('#lista-negociacoes',
      '<div class="chips">' + filtrosHtml + '</div>' +
      (lista.length ? '<ul class="conversas">' + itens + '</ul>' : ui.estadoVazio({ icone: 'messages-square', titulo: tela.filtro === 'ativas' ? 'Nenhuma negociação em andamento' : 'Nada por aqui', texto: tela.filtro === 'ativas' ? 'Envie uma proposta em Orçamentos para iniciar uma conversa com o cliente.' : 'Negociações aparecem aqui conforme são abertas ou encerradas.', compacto: true })));
  }

  function htmlBalao(rodada, cliente) {
    const tipo = TIPOS_RODADA[rodada.tipo] || { rotulo: rodada.tipo, icone: 'message-square' };
    const daAgencia = rodada.autor === 'agencia';
    return '<li class="balao balao--' + (daAgencia ? 'agencia' : 'cliente') + (rodada.tipo === 'aceite' || rodada.tipo === 'aceite_agencia' ? ' balao--acordo' : '') + (rodada.tipo === 'recusa' || rodada.tipo === 'encerrar' ? ' balao--fim' : '') + '">' +
      '<div class="balao__cabecalho">' + ui.icone(tipo.icone) + '<strong>' + (daAgencia ? 'Você' : util.esc(cliente.nome)) + '</strong><span>' + tipo.rotulo + '</span></div>' +
      '<p>' + util.esc(rodada.mensagem) + '</p>' +
      '<footer><span class="num">' + util.moeda(rodada.valor) + ' · ' + rodada.prazo + ' dias</span><time>' + util.dataHora(rodada.data) + '</time></footer></li>';
  }

  function htmlAcoes(negociacao, ctx) {
    if (negociacao.status !== 'ativa') {
      const status = STATUS[negociacao.status];
      const projeto = Storage.ler('projetos').find((p) => p.orcamentoId === negociacao.orcamentoId);
      return '<div class="acordo acordo--' + negociacao.status + '">' + ui.icone(negociacao.status === 'aprovada' ? 'badge-check' : 'circle-slash') +
        '<div><strong>' + (negociacao.status === 'aprovada' ? 'Venda fechada por ' + util.moeda(ctx.calculo.total) : 'Negociação ' + status.rotulo.toLowerCase()) + '</strong>' +
        '<span>' + (negociacao.status === 'aprovada' ? 'O projeto foi criado e as parcelas estão em contas a receber.' : 'Você pode duplicar o orçamento e tentar uma nova abordagem.') + '</span></div>' +
        (projeto ? '<a class="botao botao--primario" href="projetos.html?id=' + projeto.id + '">' + ui.icone('kanban') + 'Abrir projeto</a>'
          : '<a class="botao botao--secundario" href="orcamentos.html">' + ui.icone('file-text') + 'Ver orçamentos</a>') + '</div>';
    }
    if (negociacao.vez === 'cliente') {
      return '<div class="digitando" role="status">' + ui.avatar(ctx.cliente.nome) + '<span class="digitando__pontos"><i></i><i></i><i></i></span><span>' + util.esc(ctx.cliente.nome.split(' ')[0]) + ' está analisando a proposta…</span></div>';
    }
    const pedido = ultimaDoCliente(negociacao);
    const d = pedido.dados || {};
    let principal = '';
    if (pedido.tipo === 'desconto') principal = '<button type="button" class="botao botao--primario" data-acao="atender">' + ui.icone('percent') + 'Conceder ' + d.pct + '%</button>';
    if (pedido.tipo === 'contraproposta') principal = '<button type="button" class="botao botao--primario" data-acao="aceitar-contraproposta">' + ui.icone('handshake') + 'Aceitar ' + util.moeda(d.valor, true) + '</button>';
    if (pedido.tipo === 'alteracao' || pedido.tipo === 'adicional') principal = '<button type="button" class="botao botao--primario" data-acao="atender">' + ui.icone('check') + 'Atender ao pedido</button>';
    if (pedido.tipo === 'duvida') principal = '<button type="button" class="botao botao--primario" data-acao="esclarecer">' + ui.icone('message-square-text') + 'Responder à dúvida</button>';
    return '<div class="acoes-negociacao"><p class="acoes-negociacao__titulo">Sua resposta</p><div class="acoes-negociacao__botoes">' + principal +
      '<button type="button" class="botao botao--secundario" data-acao="ajustar">' + ui.icone('sliders-horizontal') + 'Ajustar proposta</button>' +
      '<button type="button" class="botao botao--secundario" data-acao="manter" title="Declara que esta é a condição final">' + ui.icone('shield-check') + 'Manter proposta</button>' +
      '<button type="button" class="botao botao--fantasma" data-acao="encerrar">' + ui.icone('door-open') + 'Encerrar</button></div></div>';
  }

  function htmlPainelProposta(negociacao, ctx) {
    const { cliente, orcamento, calculo } = ctx;
    const perfil = SS.Clientes.PERFIS[cliente.perfil] || SS.Clientes.PERFIS.indeciso;
    const analise = SS.Orcamentos.viabilidade(calculo);
    const a = analisar(ctx);
    const razao = calculo.total / cliente.orcamentoDisponivel;
    const linha = (rotulo, valor) => '<div><dt>' + rotulo + '</dt><dd>' + valor + '</dd></div>';
    const necessidades = a.necessidades.map((id) => {
      const incluida = !a.faltantes.includes(id);
      return '<li class="' + (incluida ? 'ok' : 'falta') + '">' + ui.icone(incluida ? 'check' : 'minus') + util.esc(SS.Servicos.nomeDe(id)) + '</li>';
    }).join('');
    return '<section class="painel-proposta">' +
      '<header><p class="sobrelinha">Proposta em discussão</p><button type="button" class="celula-link mono" data-acao="ver-proposta">' + orcamento.codigo + '</button></header>' +
      '<p class="painel-proposta__valor">' + util.moeda(calculo.total) + '</p>' +
      '<div class="medidor' + (razao > 1 ? ' medidor--excedido' : '') + '" role="img" aria-label="' + Math.round(razao * 100) + '% do orçamento do cliente"><span style="width:' + Math.min(100, Math.round(razao * 100)) + '%"></span></div>' +
      '<p class="resumo__nota">' + Math.round(razao * 100) + '% do orçamento do cliente (' + util.moeda(cliente.orcamentoDisponivel, true) + ')</p>' +
      '<dl class="ficha ficha--compacta">' +
        linha('Serviço', util.esc(orcamento.principal.nome)) +
        linha('Nível', SS.Orcamentos.COMPLEXIDADES[orcamento.complexidade].rotulo) +
        linha('Prazo', calculo.prazo + ' dias <small>(deseja ' + cliente.prazoDesejado + ')</small>') +
        linha('Desconto', calculo.desconto ? util.percentual(calculo.descontoPercentual) : 'Nenhum') +
        linha('Pagamento', SS.Orcamentos.PAGAMENTOS[orcamento.pagamento].rotulo) +
        linha('Margem', '<span class="' + (analise.nivel === 'ok' ? '' : 'texto-alerta') + '">' + util.percentual(calculo.margem) + '</span> <small>(mín. ' + util.percentual(analise.margemMinima) + ')</small>') +
      '</dl>' +
      (necessidades ? '<p class="briefing__rotulo">Necessidades do cliente</p><ul class="checagem">' + necessidades + '</ul>' : '') +
      '<p class="briefing__perfil">' + ui.icone(perfil.icone) + '<span><strong>' + perfil.rotulo + '.</strong> ' + perfil.resumo + '</span></p>' +
    '</section>';
  }

  function desenharDetalhe() {
    const alvo = document.getElementById('detalhe-negociacao');
    clearTimeout(tela.temporizador);
    const negociacao = tela.selecionada ? buscar(tela.selecionada) : null;
    const ctx = negociacao ? contexto(negociacao) : null;
    document.getElementById('negociacoes').classList.toggle('negociacoes--detalhe', Boolean(ctx));

    if (!ctx) {
      ui.render(alvo, listar().length
        ? ui.estadoVazio({ icone: 'mouse-pointer-click', titulo: 'Selecione uma negociação', texto: 'Escolha uma conversa na lista para ver o histórico e responder ao cliente.' })
        : ui.estadoVazio({ icone: 'messages-square', titulo: 'Nenhuma negociação ainda', texto: 'A negociação começa quando você envia uma proposta. O cliente analisa preço, prazo e serviços e responde de acordo com o perfil dele.', acao: { rotulo: 'Ir para Orçamentos', href: 'orcamentos.html', icone: 'file-text' } }));
      return;
    }

    const { cliente } = ctx;
    const status = STATUS[negociacao.status];
    ui.render(alvo,
      '<header class="detalhe-negociacao__topo">' +
        '<button type="button" class="botao-icone detalhe-negociacao__voltar" data-acao="voltar-lista" aria-label="Voltar para a lista">' + ui.icone('arrow-left') + '</button>' +
        ui.avatar(cliente.nome, 'avatar--g') +
        '<div><h2>' + util.esc(cliente.nome) + '</h2><p>' + util.esc(cliente.empresa || cliente.segmento) + ' ' + ui.seloDemo(cliente) + '</p></div>' +
        ui.selo(status.rotulo, status.tom) +
      '</header>' +
      '<div class="detalhe-negociacao__grade">' +
        '<div class="detalhe-negociacao__conversa"><ol class="baloes" id="baloes">' + negociacao.rodadas.map((r) => htmlBalao(r, cliente)).join('') + '</ol>' +
          '<div id="acoes-negociacao">' + htmlAcoes(negociacao, ctx) + '</div></div>' +
        htmlPainelProposta(negociacao, ctx) +
      '</div>');

    const baloes = document.getElementById('baloes');
    baloes.scrollTop = baloes.scrollHeight;

    if (negociacao.status === 'ativa' && negociacao.vez === 'cliente') {
      // Pausa curta para o cliente "ler" a proposta; a decisão em si é determinística.
      tela.temporizador = setTimeout(() => {
        const resultado = responderComoCliente(negociacao.id);
        desenharLista();
        desenharDetalhe();
        SS.App.dadosAlterados();
        if (!resultado) return;
        if (resultado.decisao.tipo === 'aceite') ui.toast('Proposta aprovada! O projeto foi criado.', 'sucesso', { link: { href: 'projetos.html?id=' + resultado.projeto.id, rotulo: 'Abrir projeto' } });
        if (resultado.decisao.tipo === 'recusa') ui.toast(SS.Clientes.rotuloDe(cliente) + ' recusou a proposta.', 'aviso');
      }, 1500);
    }
  }

  function selecionar(id) {
    tela.selecionada = id;
    const url = new URL(global.location.href);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    global.history.replaceState(null, '', url);
    desenharLista();
    desenharDetalhe();
  }

  function aposAcaoDaAgencia() {
    desenharLista();
    desenharDetalhe();
    SS.App.dadosAlterados();
  }

  /** Formulário de revisão da proposta, opcionalmente já preenchido com o pedido do cliente. */
  function abrirAjuste(negociacao, preencherPedido) {
    const ctx = contexto(negociacao);
    const original = ctx.orcamento;
    const rascunho = Storage.clonar(original);
    const pedido = ultimaDoCliente(negociacao);
    const pedidos = ctx.cliente.necessidades || [];

    if (preencherPedido && pedido) {
      const d = pedido.dados || {};
      if (pedido.tipo === 'desconto') {
        const semDesconto = SS.Orcamentos.calcular(Object.assign({}, rascunho, { descontoValor: 0 })).subtotal;
        const alvo = ctx.calculo.total * (1 - d.pct / 100);
        rascunho.descontoTipo = 'percentual';
        rascunho.descontoValor = Math.ceil(((semDesconto - alvo) / semDesconto) * 1000) / 10;
      }
      if (pedido.tipo === 'adicional') (d.itens || []).forEach((id) => SS.Orcamentos.alternarAdicional(rascunho, id, true));
      if (pedido.tipo === 'alteracao') {
        if (d.campo === 'prazo') rascunho.prazoDias = d.prazo;
        if (d.campo === 'tipoSite') { SS.Orcamentos.definirPrincipal(rascunho, d.servicoId); rascunho.prazoDias = SS.Orcamentos.calcular(rascunho).prazo; }
        if (d.campo === 'acabamento') rascunho.complexidade = 'media';
        if (d.campo === 'pagamento') rascunho.pagamento = 'tres';
      }
    }

    const catalogo = SS.Servicos.adicionais();
    const itens = catalogo.concat(rascunho.adicionais.filter((a) => !catalogo.some((s) => s.id === a.servicoId)).map((a) => Object.assign({ id: a.servicoId }, a)));
    const conteudo = '<form id="form-ajuste" novalidate><div class="ajuste">' +
      '<div class="grade-form">' +
        ui.campo({ nome: 'servicoId', tipo: 'select', rotulo: 'Tipo de site', valor: rascunho.principal.servicoId, obrigatorio: true, opcoes: SS.Servicos.principais().map((s) => ({ valor: s.id, rotulo: s.nome + (s.id === ctx.cliente.tipoSite ? ' (pedido pelo cliente)' : '') })) }) +
        ui.campo({ nome: 'complexidade', tipo: 'select', rotulo: 'Nível do projeto', valor: rascunho.complexidade, obrigatorio: true, opcoes: Object.keys(SS.Orcamentos.COMPLEXIDADES).map((id) => ({ valor: id, rotulo: SS.Orcamentos.COMPLEXIDADES[id].rotulo })) }) +
        ui.campo({ nome: 'prazoDias', tipo: 'number', rotulo: 'Prazo de entrega', valor: SS.Orcamentos.calcular(rascunho).prazo, obrigatorio: true, minimo: 1, maximoValor: 365, passo: 1, sufixo: 'dias', dica: 'O cliente deseja ' + ctx.cliente.prazoDesejado + ' dias.' }) +
        ui.campo({ nome: 'pagamento', tipo: 'select', rotulo: 'Pagamento', valor: rascunho.pagamento, obrigatorio: true, opcoes: Object.keys(SS.Orcamentos.PAGAMENTOS).map((id) => ({ valor: id, rotulo: SS.Orcamentos.PAGAMENTOS[id].rotulo })) }) +
        ui.campo({ nome: 'descontoTipo', tipo: 'select', rotulo: 'Tipo de desconto', valor: rascunho.descontoTipo, obrigatorio: true, opcoes: [{ valor: 'percentual', rotulo: 'Percentual (%)' }, { valor: 'valor', rotulo: 'Valor (R$)' }] }) +
        ui.campo({ nome: 'descontoValor', tipo: 'number', rotulo: 'Desconto', valor: rascunho.descontoValor || 0, obrigatorio: true, minimo: 0, passo: 0.01 }) +
        '<fieldset class="campo campo--largo"><legend class="campo__rotulo">Funcionalidades e serviços adicionais</legend><div class="marcadores">' +
          itens.map((a) => '<label class="marcador"><input type="checkbox" name="adicionais" data-lista value="' + a.id + '"' + (rascunho.adicionais.some((x) => x.servicoId === a.id) ? ' checked' : '') + '><span>' + util.esc(a.nome) + (pedidos.includes(a.id) ? ' <em>pedido</em>' : '') + '</span></label>').join('') +
        '</div></fieldset>' +
      '</div>' +
      '<aside class="ajuste__previa" id="previa-ajuste" aria-live="polite"></aside>' +
      '</div>' +
      '<label class="marcador marcador--risco" id="aceite-risco" hidden><input type="checkbox" name="assumirRisco"><span>Estou ciente de que esta condição fica abaixo da margem mínima da agência.</span></label>' +
      '</form>';

    const modal = ui.modal({
      titulo: 'Ajustar proposta', subtitulo: original.codigo + ' · ' + ctx.cliente.nome, tamanho: 'g', conteudo,
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: 'Enviar proposta revisada', variante: 'primario', icone: 'send', aoClicar(m) { m.corpo.querySelector('form').requestSubmit(); return false; } },
      ],
    });
    const formulario = modal.corpo.querySelector('form');

    const lerRascunho = () => {
      const dados = ui.lerFormulario(formulario);
      if (dados.servicoId !== rascunho.principal.servicoId) {
        SS.Orcamentos.definirPrincipal(rascunho, dados.servicoId);
        formulario.elements.prazoDias.value = SS.Orcamentos.calcular(Object.assign({}, rascunho, { complexidade: dados.complexidade })).prazoSugerido;
        dados.prazoDias = Number(formulario.elements.prazoDias.value);
      }
      rascunho.complexidade = dados.complexidade;
      rascunho.pagamento = dados.pagamento;
      rascunho.descontoTipo = dados.descontoTipo;
      rascunho.descontoValor = dados.descontoValor || 0;
      rascunho.prazoDias = dados.prazoDias || null;
      itens.forEach((a) => SS.Orcamentos.alternarAdicional(rascunho, a.id, (dados.adicionais || []).includes(a.id)));
      return dados;
    };

    const atualizarPrevia = () => {
      lerRascunho();
      const c = SS.Orcamentos.calcular(rascunho);
      const analise = SS.Orcamentos.viabilidade(c);
      const diferenca = c.total - ctx.calculo.total;
      const razao = c.total / ctx.cliente.orcamentoDisponivel;
      modal.corpo.querySelector('#aceite-risco').hidden = analise.nivel !== 'abaixo';
      ui.render(modal.corpo.querySelector('#previa-ajuste'),
        '<p class="sobrelinha">Nova condição</p><p class="painel-proposta__valor">' + util.moeda(c.total) + '</p>' +
        '<p class="resumo__nota">' + (Math.abs(diferenca) < 0.01 ? 'Mesmo valor da proposta atual.' : (diferenca < 0 ? util.moeda(-diferenca) + ' a menos' : util.moeda(diferenca) + ' a mais') + ' que a proposta atual.') + '</p>' +
        '<dl class="ficha ficha--compacta">' +
          '<div><dt>Do orçamento do cliente</dt><dd>' + Math.round(razao * 100) + '%</dd></div>' +
          '<div><dt>Desconto</dt><dd>' + util.moeda(c.desconto) + ' (' + util.percentual(c.descontoPercentual) + ')</dd></div>' +
          '<div><dt>Prazo recomendado</dt><dd>' + c.prazoSugerido + ' dias (mín. ' + c.prazoMinimo + ')</dd></div>' +
          (c.taxaUrgencia ? '<div><dt>Taxa de urgência</dt><dd>' + util.moeda(c.taxaUrgencia) + '</dd></div>' : '') +
          '<div><dt>Custo estimado</dt><dd>' + util.moeda(c.custo) + '</dd></div>' +
          '<div><dt>Margem</dt><dd class="' + (analise.nivel === 'ok' ? '' : 'texto-alerta') + '">' + util.percentual(c.margem) + '</dd></div>' +
        '</dl>' +
        '<p class="resumo__nota">Desconto máximo dentro da margem mínima: ' + util.moeda(analise.descontoMaximo, true) + '.</p>' +
        (analise.nivel !== 'ok' ? '<p class="aviso aviso--' + (analise.nivel === 'inviavel' ? 'perigo' : 'atencao') + '" role="alert">' + ui.icone('triangle-alert') + '<span>' + analise.mensagem + '</span></p>' : ''));
    };

    formulario.addEventListener('input', atualizarPrevia);
    formulario.addEventListener('change', atualizarPrevia);
    atualizarPrevia();

    ui.ligarFormulario(formulario, {
      prazoDias: (valor) => { const c = SS.Orcamentos.calcular(rascunho); return valor < c.prazoMinimo ? 'Prazo inviável: este escopo precisa de pelo menos ' + c.prazoMinimo + ' dias.' : ''; },
      descontoValor: (valor, dados) => {
        if (dados.descontoTipo === 'percentual' && valor > 100) return 'O desconto percentual vai de 0 a 100%.';
        const c = SS.Orcamentos.calcular(Object.assign({}, rascunho, { descontoValor: 0 }));
        return dados.descontoTipo === 'valor' && valor > c.subtotal ? 'O desconto não pode ser maior que o subtotal.' : '';
      },
    }, (dados) => {
      lerRascunho();
      const analise = SS.Orcamentos.viabilidade(SS.Orcamentos.calcular(rascunho));
      if (analise.nivel === 'inviavel') { ui.toast('Não é possível enviar: ' + analise.mensagem, 'erro'); return; }
      if (analise.nivel === 'abaixo' && !dados.assumirRisco) { ui.toast('Confirme que está ciente da margem abaixo do mínimo para enviar.', 'aviso'); formulario.elements.assumirRisco.focus(); return; }
      enviarAjuste(negociacao.id, rascunho);
      modal.fechar();
      aposAcaoDaAgencia();
    });
  }

  async function tratarAcao(acao) {
    const negociacao = buscar(tela.selecionada);
    if (acao === 'voltar-lista') { selecionar(null); return; }
    if (!negociacao) return;
    if (acao === 'ver-proposta') { SS.Orcamentos.abrirDocumento(negociacao.orcamentoId); return; }
    if (negociacao.status !== 'ativa' || negociacao.vez !== 'agencia') return;

    if (acao === 'ajustar') abrirAjuste(negociacao, false);
    if (acao === 'atender') abrirAjuste(negociacao, true);
    if (acao === 'esclarecer') { esclarecer(negociacao.id); aposAcaoDaAgencia(); }
    if (acao === 'manter') {
      const seguir = await ui.confirmar({ titulo: 'Manter a proposta como está?', mensagem: 'Você informa ao cliente que esta é a condição final. Ele responderá apenas com sim ou não.', detalhe: 'Se a proposta estiver fora do limite do cliente, a venda será perdida.', rotuloConfirmar: 'Manter proposta', icone: 'shield-check' });
      if (seguir) { manterProposta(negociacao.id); aposAcaoDaAgencia(); }
    }
    if (acao === 'encerrar') {
      const seguir = await ui.confirmar({ titulo: 'Encerrar a negociação?', mensagem: 'A proposta será marcada como recusada e a conversa com o cliente termina aqui.', rotuloConfirmar: 'Encerrar negociação', perigo: true, icone: 'door-open' });
      if (seguir) { encerrar(negociacao.id); aposAcaoDaAgencia(); ui.toast('Negociação encerrada.', 'info'); }
    }
    if (acao === 'aceitar-contraproposta') {
      const revisado = orcamentoComContraproposta(negociacao);
      const c = SS.Orcamentos.calcular(revisado);
      const analise = SS.Orcamentos.viabilidade(c);
      if (analise.nivel === 'inviavel') { ui.toast('Não é possível aceitar: ' + analise.mensagem, 'erro'); return; }
      const seguir = await ui.confirmar({
        titulo: 'Fechar por ' + util.moeda(c.total) + '?',
        mensagem: 'A venda é fechada pelo valor proposto pelo cliente, com margem de ' + util.percentual(c.margem) + ' para a agência.',
        detalhe: analise.nivel === 'abaixo' ? analise.mensagem : '', rotuloConfirmar: 'Fechar venda', icone: 'handshake',
      });
      if (!seguir) return;
      const resultado = aceitarContraproposta(negociacao.id);
      aposAcaoDaAgencia();
      ui.toast('Venda fechada! O projeto foi criado.', 'sucesso', { link: { href: 'projetos.html?id=' + resultado.projeto.id, rotulo: 'Abrir projeto' } });
    }
  }

  function montarPagina() {
    const raiz = document.getElementById('negociacoes');
    ui.delegar(raiz, 'click', '[data-filtro]', (evento, chip) => { tela.filtro = chip.dataset.filtro; desenharLista(); });
    ui.delegar(raiz, 'click', '[data-negociacao]', (evento, item) => selecionar(item.dataset.negociacao));
    ui.delegar(raiz, 'click', '[data-acao]', (evento, botao) => tratarAcao(botao.dataset.acao));

    const pedida = util.parametro('id');
    const todas = listar();
    if (pedida && buscar(pedida)) {
      tela.selecionada = pedida;
      if (buscar(pedida).status !== 'ativa') tela.filtro = 'todas';
    } else {
      if (!todas.some((n) => n.status === 'ativa') && todas.length) tela.filtro = 'todas';
      // Em telas largas, abre direto a conversa que mais precisa de atenção.
      if (global.matchMedia('(min-width: 961px)').matches) {
        const primeira = negociacoesFiltradas().sort((a, b) => (b.vez === 'agencia') - (a.vez === 'agencia'))[0];
        tela.selecionada = primeira ? primeira.id : null;
      }
    }
    desenharLista();
    desenharDetalhe();
  }

  SS.Negociacoes = {
    REGRAS, TIPOS_RODADA, STATUS,
    listar, buscar, contexto, analisar, decidir,
    abrir, responderComoCliente, enviarAjuste, manterProposta, esclarecer, aceitarContraproposta, encerrar,
  };
  SS.App.paginas.negociacoes = montarPagina;
})(window);
