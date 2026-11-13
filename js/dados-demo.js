/*
 * SiteSeller — dados-demo.js
 * Monta os dados de demonstração usando as mesmas funções do sistema (cálculo de
 * orçamento, criação de projeto, geração de parcelas), com datas relativas a hoje.
 * Todos os registros recebem a marca "demo" para serem identificados na interface.
 * É executado uma única vez: na primeira utilização ou ao restaurar a demonstração.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util } = SS;

  /** Momento ISO de N dias atrás, em horário comercial. */
  function ha(dias, hora) {
    const data = new Date();
    data.setDate(data.getDate() - dias);
    data.setHours(hora || 10, (dias * 7) % 60, 0, 0);
    return data.toISOString();
  }
  const dia = (dias) => util.somarDias(util.hoje(), -dias);

  function carregar() {
    const O = SS.Orcamentos;
    const clientes = {};

    Storage.alterarObjeto('configuracoes', (config) => Object.assign(config, {
      descricao: config.descricao === Storage.PADROES.configuracoes.descricao ? 'Agência de desenvolvimento de sites para pequenos e médios negócios.' : config.descricao,
      email: 'contato@agencia.exemplo.com.br', telefone: '(11) 5550-0199', cidade: 'São Paulo, SP',
    }));

    /* ---------- Clientes ---------- */
    const carteira = [['lead-local', 162], ['lead-tecnologia', 121], ['lead-clinica', 27], ['lead-roupas', 19], ['lead-academia', 9], ['lead-advocacia', 8], ['lead-salao', 41], ['lead-restaurante', 4], ['lead-autonomo', 2]];
    carteira.forEach(([contatoId, dias]) => {
      const contato = SS.Clientes.contatoPorId(contatoId);
      const cliente = Object.assign({}, contato, { id: Storage.gerarId('cli'), leadId: contato.id, origem: 'demo', demo: true, criadoEm: ha(dias, 9) });
      Storage.inserir('clientes', cliente);
      clientes[contatoId] = cliente;
    });
    Storage.alterarObjeto('sistema', (sistema) => Object.assign(sistema, {
      leadsUsados: carteira.map(([id]) => id), leadsPendentes: ['lead-floricultura'], ultimaChegadaLead: util.hoje(),
    }));

    /* ---------- Orçamentos ---------- */
    function orcar(contatoId, servicoId, adicionais, ajustes, status, diasCriacao, extras) {
      const rascunho = O.novo(clientes[contatoId].id);
      O.definirPrincipal(rascunho, servicoId);
      adicionais.forEach((id) => O.alternarAdicional(rascunho, id, true));
      Object.assign(rascunho, ajustes || {});
      const salvo = O.salvar(rascunho, status);
      const validade = util.paraDia(util.somarDias(dia(diasCriacao), Storage.ler('configuracoes').validadePropostaDias));
      return Storage.atualizar('orcamentos', salvo.id, Object.assign({ demo: true, criadoEm: ha(diasCriacao, 11), atualizadoEm: ha(diasCriacao, 11), validade: status === 'rascunho' ? undefined : validade }, extras || {}));
    }

    function conversar(orcamento, status, rodadas, extras) {
      const total = O.calcular(orcamento);
      return Storage.inserir('negociacoes', Object.assign({
        id: Storage.gerarId('neg'), orcamentoId: orcamento.id, clienteId: orcamento.clienteId, demo: true,
        status, vez: null, ultimato: false, duvidasResolvidas: 0, topicosPerguntados: [],
        valorInicial: rodadas[0].valor || total.total, criadoEm: ha(rodadas[0].dias, 11), atualizadoEm: ha(rodadas[rodadas.length - 1].dias, 15),
        rodadas: rodadas.map((r, indice) => ({ autor: r.autor, tipo: r.tipo, mensagem: r.mensagem, data: ha(r.dias, 11 + indice), valor: r.valor || total.total, prazo: r.prazo || total.prazo, dados: r.dados, atendeu: r.atendeu })),
      }, extras || {}));
    }

    /** Venda fechada no passado: projeto, etapas percorridas e parcelas (algumas já recebidas). */
    function fechar(orcamento, diasAprovacao, etapas, pagamentos) {
      Storage.atualizar('orcamentos', orcamento.id, { status: 'aprovado', aprovadoEm: ha(diasAprovacao, 16), atualizadoEm: ha(diasAprovacao, 16), enviadoEm: ha(diasAprovacao + 2, 11) });
      const aprovado = O.buscar(orcamento.id);
      const projeto = SS.Projetos.criarDeOrcamento(aprovado, { data: ha(diasAprovacao, 16), demo: true });
      const receitas = SS.Financeiro.gerarParcelas(aprovado, projeto, { demo: true });
      const ultima = etapas[etapas.length - 1];
      const historico = [{ status: 'aguardando', data: ha(diasAprovacao, 16) }].concat(etapas.map(([status, dias]) => ({ status, data: ha(dias, 14) })));
      const achar = (status) => { const etapa = etapas.find((e) => e[0] === status); return etapa ? ha(etapa[1], 14) : undefined; };
      Storage.atualizar('projetos', projeto.id, (p) => Object.assign(p, {
        status: ultima ? ultima[0] : 'aguardando', historico,
        dataInicio: etapas.length ? dia(etapas[0][1]) : null,
        concluidoEm: achar('concluido'), entregueEm: achar('entregue'),
      }));
      receitas.forEach((receita, indice) => {
        const diasPagamento = pagamentos[indice];
        const alteracao = {};
        if (receita.naEntrega && ultima && ultima[0] === 'entregue') { alteracao.vencimento = dia(ultima[1]); alteracao.liberada = true; }
        if (typeof diasPagamento === 'number') { alteracao.status = 'recebido'; alteracao.recebidoEm = dia(diasPagamento); }
        Storage.atualizar('receitas', receita.id, alteracao);
      });
      return Storage.buscar('projetos', projeto.id);
    }

    // 1. Tavares Materiais — venda antiga, projeto entregue e pago à vista.
    const tavares = orcar('lead-local', 'srv-institucional', ['add-whatsapp', 'add-formulario'], { descontoTipo: 'valor', descontoValor: 170, pagamento: 'avista' }, 'aprovado', 156);
    conversar(tavares, 'aprovada', [
      { autor: 'agencia', tipo: 'proposta', dias: 154, valor: 2070, mensagem: 'Olá, Jorge! Segue a proposta: site institucional com integração com WhatsApp e formulário de contato, entrega em 17 dias, por R$ 2.070,00.' },
      { autor: 'cliente', tipo: 'contraproposta', dias: 154, valor: 2070, dados: { valor: 1900 }, mensagem: 'Vou ser direto: tenho R$ 1.900 para isso. Se fizer por esse valor, fecho hoje.' },
      { autor: 'agencia', tipo: 'aceite_agencia', dias: 153, atendeu: true, mensagem: 'Fechado! Aceitamos R$ 1.900,00. Vamos preparar o contrato e iniciar o projeto.' },
    ]);
    fechar(tavares, 153, [['planejamento', 151], ['desenvolvimento', 147], ['revisao', 140], ['concluido', 138], ['entregue', 137]], [152]);

    // 2. Nimbo Sistemas — maior contrato, entregue, quatro parcelas recebidas.
    const nimbo = orcar('lead-tecnologia', 'srv-sistema', ['add-login', 'add-banco', 'add-painel', 'add-apis'], { complexidade: 'media', prazoDias: 60, pagamento: 'quatro' }, 'aprovado', 116);
    conversar(nimbo, 'aprovada', [
      { autor: 'agencia', tipo: 'proposta', dias: 114, mensagem: 'Olá, Otávio! Segue a proposta: sistema web personalizado com área de login, banco de dados, painel administrativo e integração com APIs, entrega em 60 dias, por R$ 9.000,00.' },
      { autor: 'cliente', tipo: 'aceite', dias: 112, mensagem: 'Proposta aprovada internamente. Seguimos com R$ 9.000,00; aguardo o contrato para assinatura.' },
    ]);
    const projetoNimbo = fechar(nimbo, 112, [['planejamento', 110], ['desenvolvimento', 101], ['revisao', 64], ['concluido', 57], ['entregue', 55]], [111, 80, 51, 21]);

    // 3. Clínica Vitalis — em revisão, com a entrega chegando.
    const vitalis = orcar('lead-clinica', 'srv-institucional', ['add-formulario', 'add-seo', 'add-mobile', 'add-animacoes'], { complexidade: 'media', pagamento: 'entrada' }, 'aprovado', 23);
    conversar(vitalis, 'aprovada', [
      { autor: 'agencia', tipo: 'proposta', dias: 22, valor: 2800, mensagem: 'Olá, Dra. Helena! Segue a proposta: site institucional com formulário de contato, SEO básico e otimização para dispositivos móveis, entrega em 18 dias, por R$ 2.800,00.' },
      { autor: 'cliente', tipo: 'alteracao', dias: 22, valor: 2800, dados: { campo: 'acabamento' }, mensagem: 'O nível simples não combina com a imagem que queremos passar. Quero um acabamento mais elaborado — pode revisar?' },
      { autor: 'agencia', tipo: 'ajuste', dias: 21, atendeu: true, mensagem: 'Revisamos a proposta: incluímos animações personalizadas e o nível do projeto agora é intermediária. O valor passou de R$ 2.800,00 para R$ 3.330,00, com entrega em 23 dias.' },
      { autor: 'cliente', tipo: 'aceite', dias: 20, mensagem: 'Agora sim está completa. Podem seguir; vou acompanhar cada etapa de perto.' },
    ]);
    const projetoVitalis = fechar(vitalis, 20, [['planejamento', 19], ['desenvolvimento', 15], ['revisao', 3]], [19]);

    // 4. Ateliê Linho & Cor — em desenvolvimento, primeira parcela recebida.
    const atelie = orcar('lead-roupas', 'srv-loja', ['add-galeria', 'add-whatsapp', 'add-mobile'], { descontoTipo: 'percentual', descontoValor: 6, pagamento: 'tres' }, 'aprovado', 15);
    conversar(atelie, 'aprovada', [
      { autor: 'agencia', tipo: 'proposta', dias: 14, valor: 4150, mensagem: 'Olá, Marina! Segue a proposta: loja virtual com galeria de imagens, integração com WhatsApp e otimização para dispositivos móveis, entrega em 33 dias, por R$ 4.150,00.' },
      { autor: 'cliente', tipo: 'desconto', dias: 14, valor: 4150, dados: { pct: 14 }, mensagem: 'Achei salgado. Meu orçamento é R$ 4.200… Faz 14% de desconto que a gente conversa?' },
      { autor: 'agencia', tipo: 'ajuste', dias: 13, mensagem: 'Revisamos a proposta: aplicamos 6% de desconto. O valor passou de R$ 4.150,00 para R$ 3.901,00, com entrega em 33 dias.' },
      { autor: 'cliente', tipo: 'contraproposta', dias: 13, dados: { valor: 3700 }, mensagem: 'Ainda está acima. Minha contraproposta é R$ 3.700 — é o que cabe.' },
      { autor: 'agencia', tipo: 'manter', dias: 12, mensagem: 'Esta é a nossa melhor condição para o escopo proposto: R$ 3.901,00, com entrega em 33 dias. Abaixo disso não conseguimos manter a qualidade da entrega.' },
      { autor: 'cliente', tipo: 'aceite', dias: 12, mensagem: 'Tá bom, você me convenceu. Fechamos em R$ 3.901,00.' },
    ]);
    fechar(atelie, 12, [['planejamento', 11], ['desenvolvimento', 7]], [11]);

    // 5. Lacerda & Fontes — recém-contratado, entrada ainda não paga.
    const lacerda = orcar('lead-advocacia', 'srv-institucional', ['add-formulario', 'add-seo', 'add-mobile'], { complexidade: 'media', pagamento: 'entrada' }, 'aprovado', 7);
    conversar(lacerda, 'aprovada', [
      { autor: 'agencia', tipo: 'proposta', dias: 6, mensagem: 'Olá, Dr. Augusto! Segue a proposta: site institucional com formulário de contato, SEO básico e otimização para dispositivos móveis, entrega em 22 dias, por R$ 2.980,00.' },
      { autor: 'cliente', tipo: 'aceite', dias: 4, mensagem: 'A proposta está no nível que eu esperava. Aprovado — conto com o mesmo cuidado na execução.' },
    ]);
    fechar(lacerda, 4, [], []);

    // 6. Cantina Monteiro — negociação aberta, cliente indeciso esperando resposta.
    const cantina = orcar('lead-restaurante', 'srv-institucional', ['add-whatsapp', 'add-galeria', 'add-formulario'], { pagamento: 'entrada' }, 'negociacao', 3, { enviadoEm: ha(2, 11) });
    const conversaCantina = conversar(cantina, 'ativa', [
      { autor: 'agencia', tipo: 'proposta', dias: 2, mensagem: 'Olá, Rafael! Segue a proposta: site institucional com integração com WhatsApp, galeria de imagens e formulário de contato, entrega em 18 dias, por R$ 2.270,00.' },
      { autor: 'cliente', tipo: 'duvida', dias: 1, dados: { topico: 'suporte' }, mensagem: 'Antes de decidir: depois que o site for entregue, vocês dão suporte? E se algo parar de funcionar?' },
    ], { vez: 'agencia', topicosPerguntados: ['suporte'] });

    // 7. Caio Bittencourt — proposta pronta, ainda não enviada.
    orcar('lead-autonomo', 'srv-portfolio', ['add-galeria', 'add-formulario'], { pagamento: 'entrada' }, 'aguardando', 1);

    // 8. Pulso Academia — recusada: o prazo oferecido não atendia à urgência.
    const pulso = orcar('lead-academia', 'srv-landing', ['add-whatsapp', 'add-formulario'], { prazoDias: 12, pagamento: 'avista' }, 'recusado', 8, { enviadoEm: ha(7, 11), recusadoEm: ha(6, 12) });
    conversar(pulso, 'recusada', [
      { autor: 'agencia', tipo: 'proposta', dias: 7, mensagem: 'Olá, Bruno! Segue a proposta: landing page com integração com WhatsApp e formulário de contato, entrega em 12 dias, por R$ 1.070,00.' },
      { autor: 'cliente', tipo: 'recusa', dias: 6, dados: { motivo: 'prazo' }, mensagem: 'Não consigo esperar 12 dias. Preciso do site em 6; vou fechar com quem entregue a tempo.' },
    ], { encerradoEm: ha(6, 12) });

    // 9. Studio Lívia Antunes — uma proposta que expirou e um novo rascunho.
    const livia = orcar('lead-salao', 'srv-landing', ['add-galeria'], { pagamento: 'avista' }, 'expirado', 40, { enviadoEm: ha(39, 11), expiradoEm: ha(24, 8) });
    conversar(livia, 'expirada', [
      { autor: 'agencia', tipo: 'proposta', dias: 39, mensagem: 'Olá, Lívia! Segue a proposta: landing page com galeria de imagens, entrega em 8 dias, por R$ 1.000,00.' },
      { autor: 'cliente', tipo: 'duvida', dias: 38, dados: { topico: 'exemplos' }, mensagem: 'Vocês já fizeram algo parecido para um negócio como o meu? Queria ver exemplos antes de decidir.' },
    ], { topicosPerguntados: ['exemplos'], encerradoEm: ha(24, 8) });
    orcar('lead-salao', 'srv-landing', ['add-whatsapp', 'add-galeria'], { pagamento: 'entrada' }, 'rascunho', 3);

    /* ---------- Despesas ---------- */
    const despesa = (dias, categoria, descricao, valor, projetoId) => ({ id: Storage.gerarId('dsp'), demo: true, data: dia(dias), categoria, descricao, valor, projetoId: projetoId || '' });
    const despesas = [];
    [141, 111, 81, 51, 21].forEach((d) => despesas.push(despesa(d, 'Hospedagem', 'Hospedagem dos sites de clientes', 89.9)));
    [136, 106, 76, 46, 16].forEach((d) => despesas.push(despesa(d, 'Ferramentas', 'Assinatura da ferramenta de design', 75)));
    [60, 29].forEach((d) => despesas.push(despesa(d, 'Outras despesas', 'Honorários do contador', 180)));
    despesas.push(
      despesa(124, 'Domínio', 'Renovação do domínio da agência', 40),
      despesa(96, 'Marketing', 'Anúncios nas redes sociais', 300),
      despesa(33, 'Marketing', 'Anúncios nas redes sociais', 250),
      despesa(72, 'Serviços terceirizados', 'Freelancer de back-end — portal Nimbo', 1800, projetoNimbo.id),
      despesa(10, 'Serviços terceirizados', 'Banco de imagens — Clínica Vitalis', 120, projetoVitalis.id));
    Storage.gravar('despesas', despesas);

    /* ---------- Notificações ---------- */
    const N = SS.Notificacoes;
    const contato = SS.Clientes.contatoPorId('lead-floricultura');
    N.criar({ demo: true, lida: true, data: ha(11, 15), tipo: 'pagamento', titulo: 'Pagamento recebido', mensagem: 'Marina Duarte pagou a parcela 1/3 da loja virtual.', link: 'financeiro.html' });
    N.criar({ demo: true, lida: true, data: ha(6, 12), tipo: 'recusada', titulo: 'Proposta recusada', mensagem: 'Pulso Academia recusou ' + pulso.codigo + ' por causa do prazo.', link: 'orcamentos.html?ver=' + pulso.id });
    N.criar({ demo: true, lida: true, data: ha(4, 16), tipo: 'aprovada', titulo: 'Proposta aprovada', mensagem: 'Dr. Augusto Lacerda aprovou ' + lacerda.codigo + '. O projeto foi criado.', link: 'projetos.html' });
    N.criar({ demo: true, lida: true, data: ha(2, 11), tipo: 'proposta', titulo: 'Nova proposta enviada', mensagem: cantina.codigo + ' enviada para Rafael Monteiro.', link: 'negociacoes.html?id=' + conversaCantina.id });
    N.criar({ demo: true, data: ha(1, 12), tipo: 'negociacao', titulo: 'Cliente pediu mais informações', mensagem: 'Cantina Monteiro respondeu à proposta ' + cantina.codigo + ' e aguarda o seu retorno.', link: 'negociacoes.html?id=' + conversaCantina.id });
    N.criar({ demo: true, data: ha(0, 9), tipo: 'cliente', titulo: 'Novo cliente interessado', mensagem: contato.nome + ', de ' + contato.empresa + ', pediu contato sobre loja virtual.', link: 'clientes.html' });
  }

  SS.Demo = { carregar };
})(window);
