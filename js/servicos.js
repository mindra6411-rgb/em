/*
 * SiteSeller — servicos.js
 * Catálogo da agência: tipos de site (serviços principais) e serviços adicionais.
 * A tela do catálogo é exibida dentro de Configurações.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  /* "grupo" define em qual etapa do orçamento o adicional aparece. */
  const CATEGORIAS = [
    { nome: 'Funcionalidade', grupo: 'funcionalidade' },
    { nome: 'Integração', grupo: 'funcionalidade' },
    { nome: 'Dados e acesso', grupo: 'funcionalidade' },
    { nome: 'Design', grupo: 'servico' },
    { nome: 'Desempenho', grupo: 'servico' },
    { nome: 'Marketing', grupo: 'servico' },
    { nome: 'Outros', grupo: 'servico' },
  ];

  function catalogoPadrao() {
    const principal = (id, nome, descricao, preco, custo, paginasIncluidas, prazoBaseDias, icone) =>
      ({ id, tipo: 'principal', nome, descricao, preco, custo, paginasIncluidas, prazoBaseDias, icone });
    const adicional = (id, nome, descricao, preco, custo, categoria) =>
      ({ id, tipo: 'adicional', nome, descricao, preco, custo, categoria });
    return [
      principal('srv-landing', 'Landing Page', 'Página única focada em conversão para um produto, serviço ou campanha.', 800, 440, 1, 7, 'panel-top'),
      principal('srv-portfolio', 'Portfólio profissional', 'Site para apresentar trabalhos, trajetória e formas de contato.', 1200, 660, 4, 10, 'images'),
      principal('srv-institucional', 'Site institucional', 'Presença completa da empresa: quem somos, serviços, equipe e contato.', 1800, 990, 5, 15, 'building-2'),
      principal('srv-blog', 'Blog', 'Site de conteúdo com categorias, busca e página de artigo.', 1500, 840, 5, 14, 'newspaper'),
      principal('srv-loja', 'Loja virtual', 'Catálogo de produtos, carrinho e fluxo de compra.', 3500, 2030, 8, 30, 'shopping-bag'),
      principal('srv-sistema', 'Sistema web personalizado', 'Aplicação sob medida para processos internos ou atendimento a clientes.', 5000, 3000, 8, 45, 'app-window'),
      adicional('add-whatsapp', 'Integração com WhatsApp', 'Botão flutuante e links de conversa com mensagem pré-preenchida.', 150, 60, 'Integração'),
      adicional('add-formulario', 'Formulário de contato', 'Formulário validado com envio para o e-mail da empresa.', 120, 50, 'Funcionalidade'),
      adicional('add-galeria', 'Galeria de imagens', 'Galeria responsiva com ampliação e carregamento otimizado.', 200, 90, 'Funcionalidade'),
      adicional('add-animacoes', 'Animações personalizadas', 'Transições e microinterações desenhadas para a marca.', 350, 180, 'Design'),
      adicional('add-login', 'Área de login', 'Cadastro, autenticação e área restrita para usuários.', 600, 320, 'Dados e acesso'),
      adicional('add-banco', 'Banco de dados', 'Modelagem e armazenamento estruturado das informações.', 700, 380, 'Dados e acesso'),
      adicional('add-painel', 'Painel administrativo', 'Área para a equipe do cliente gerenciar o conteúdo.', 900, 480, 'Funcionalidade'),
      adicional('add-mobile', 'Otimização para dispositivos móveis', 'Revisão detalhada de layout, toque e desempenho em celulares.', 300, 150, 'Desempenho'),
      adicional('add-apis', 'Integração com APIs', 'Conexão com serviços externos, como pagamento, mapas ou ERP.', 800, 440, 'Integração'),
      adicional('add-seo', 'SEO básico', 'Títulos, descrições, mapa do site e boas práticas de indexação.', 400, 190, 'Marketing'),
    ];
  }

  const listar = () => Storage.ler('servicos');
  const principais = () => listar().filter((s) => s.tipo === 'principal');
  const adicionais = () => listar().filter((s) => s.tipo === 'adicional');
  const buscar = (id) => listar().find((s) => s.id === id) || null;
  const nomeDe = (id) => { const s = buscar(id); return s ? s.nome : 'Serviço removido'; };

  function grupoDe(adicional) {
    const categoria = CATEGORIAS.find((c) => c.nome === adicional.categoria);
    return categoria ? categoria.grupo : 'servico';
  }

  /* ---------- Tela do catálogo (em Configurações) ---------- */

  let raizCatalogo = null;

  function margemDoItem(servico) {
    return servico.preco > 0 ? ((servico.preco - servico.custo) / servico.preco) * 100 : 0;
  }

  function desenharCatalogo() {
    if (!raizCatalogo) return;
    const config = Storage.ler('configuracoes');
    const linhasPrincipais = principais().map((s) =>
      '<tr><td><div class="celula-titulo">' + ui.icone(s.icone || 'globe', 'celula-titulo__icone') + '<div><strong>' + util.esc(s.nome) + '</strong><small>' + util.esc(s.descricao) + '</small></div></div></td>' +
      '<td class="num" data-rotulo="Preço">' + util.moeda(s.preco) + '</td>' +
      '<td class="num" data-rotulo="Custo estimado">' + util.moeda(s.custo) + '</td>' +
      '<td class="num" data-rotulo="Margem">' + util.percentual(margemDoItem(s)) + '</td>' +
      '<td class="num" data-rotulo="Páginas">' + s.paginasIncluidas + '</td>' +
      '<td class="num" data-rotulo="Prazo base">' + s.prazoBaseDias + ' dias</td>' +
      '<td class="acoes"><button type="button" class="botao-icone" data-catalogo="editar" data-id="' + s.id + '" aria-label="Editar ' + util.esc(s.nome) + '" title="Editar">' + ui.icone('pencil') + '</button></td></tr>').join('');

    const listaAdicionais = adicionais();
    const linhasAdicionais = listaAdicionais.map((s) =>
      '<tr><td><div class="celula-titulo"><div><strong>' + util.esc(s.nome) + '</strong><small>' + util.esc(s.descricao) + '</small></div></div></td>' +
      '<td data-rotulo="Categoria"><span class="etiqueta">' + util.esc(s.categoria) + '</span></td>' +
      '<td class="num" data-rotulo="Preço">' + util.moeda(s.preco) + '</td>' +
      '<td class="num" data-rotulo="Custo estimado">' + util.moeda(s.custo) + '</td>' +
      '<td class="acoes"><button type="button" class="botao-icone" data-catalogo="editar" data-id="' + s.id + '" aria-label="Editar ' + util.esc(s.nome) + '" title="Editar">' + ui.icone('pencil') + '</button>' +
      '<button type="button" class="botao-icone" data-catalogo="remover" data-id="' + s.id + '" aria-label="Remover ' + util.esc(s.nome) + '" title="Remover">' + ui.icone('trash-2') + '</button></td></tr>').join('');

    ui.render(raizCatalogo,
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Tipos de site</h2><p>Serviços principais. O preço é a base de cada orçamento; o custo estimado alimenta a margem da proposta.</p></div></header>' +
        '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Serviço</th><th class="num">Preço</th><th class="num">Custo estimado</th><th class="num">Margem</th><th class="num">Páginas incluídas</th><th class="num">Prazo base</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhasPrincipais + '</tbody></table></div>' +
        '<form class="linha-config" id="form-pagina-extra" novalidate>' +
          ui.campo({ nome: 'precoPaginaExtra', tipo: 'moeda', rotulo: 'Preço por página extra', valor: config.precoPaginaExtra, obrigatorio: true, dica: 'Cobrado por página além das incluídas no tipo de site.' }) +
          '<button type="submit" class="botao botao--secundario">Salvar preço</button>' +
        '</form></section>' +
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Serviços adicionais</h2><p>Itens que podem ser somados a qualquer proposta.</p></div>' +
        '<button type="button" class="botao botao--primario" data-catalogo="novo">' + ui.icone('plus') + 'Novo adicional</button></header>' +
        (listaAdicionais.length
          ? '<div class="tabela-envoltorio"><table class="tabela tabela--empilhavel"><thead><tr><th>Adicional</th><th>Categoria</th><th class="num">Preço</th><th class="num">Custo estimado</th><th><span class="so-leitor">Ações</span></th></tr></thead><tbody>' + linhasAdicionais + '</tbody></table></div>'
          : ui.estadoVazio({ icone: 'package-plus', titulo: 'Nenhum serviço adicional', texto: 'Cadastre itens como integrações, SEO ou painel administrativo para oferecê-los nos orçamentos.', compacto: true })) +
      '</section>');

    ui.ligarFormulario(raizCatalogo.querySelector('#form-pagina-extra'), null, (dados) => {
      Storage.alterarObjeto('configuracoes', { precoPaginaExtra: dados.precoPaginaExtra });
      ui.toast('Preço por página extra atualizado.');
    });
  }

  function abrirFormulario(servico) {
    const novo = !servico;
    const principal = servico && servico.tipo === 'principal';
    const s = servico || { tipo: 'adicional', nome: '', descricao: '', preco: '', custo: '', categoria: 'Funcionalidade' };
    const conteudo = '<form id="form-servico" class="grade-form" novalidate>' +
      ui.campo({ nome: 'nome', rotulo: 'Nome', valor: s.nome, obrigatorio: true, maximo: 60, classe: 'campo--largo' }) +
      ui.campo({ nome: 'descricao', tipo: 'textarea', rotulo: 'Descrição', valor: s.descricao, obrigatorio: true, maximo: 200, linhas: 2, classe: 'campo--largo', dica: 'Aparece na proposta enviada ao cliente.' }) +
      ui.campo({ nome: 'preco', tipo: 'moeda', rotulo: 'Preço de venda', valor: s.preco, obrigatorio: true, minimo: 1 }) +
      ui.campo({ nome: 'custo', tipo: 'moeda', rotulo: 'Custo estimado', valor: s.custo, obrigatorio: true, dica: 'Horas, licenças e terceiros para entregar o item.' }) +
      (principal
        ? ui.campo({ nome: 'paginasIncluidas', tipo: 'number', rotulo: 'Páginas incluídas', valor: s.paginasIncluidas, obrigatorio: true, minimo: 1, maximoValor: 100, passo: 1 }) +
          ui.campo({ nome: 'prazoBaseDias', tipo: 'number', rotulo: 'Prazo base', valor: s.prazoBaseDias, obrigatorio: true, minimo: 1, maximoValor: 365, passo: 1, sufixo: 'dias' })
        : ui.campo({ nome: 'categoria', tipo: 'select', rotulo: 'Categoria', valor: s.categoria, obrigatorio: true, classe: 'campo--largo', opcoes: CATEGORIAS.map((c) => ({ valor: c.nome, rotulo: c.nome })), dica: 'Funcionalidade, Integração e Dados e acesso aparecem na etapa de funcionalidades do orçamento; as demais, em serviços adicionais.' })) +
      '</form>';

    const modal = ui.modal({
      titulo: novo ? 'Novo serviço adicional' : 'Editar ' + s.nome,
      subtitulo: novo ? '' : 'Propostas já salvas mantêm os valores com que foram criadas.',
      conteudo,
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: novo ? 'Adicionar ao catálogo' : 'Salvar alterações', variante: 'primario', aoClicar(m) { m.corpo.querySelector('form').requestSubmit(); return false; } },
      ],
    });

    ui.ligarFormulario(modal.corpo.querySelector('form'), {
      nome: (valor) => {
        if (valor.length < 3) return 'Use pelo menos 3 caracteres.';
        const repetido = listar().some((outro) => outro.id !== s.id && util.semAcento(outro.nome) === util.semAcento(valor));
        return repetido ? 'Já existe um serviço com este nome.' : '';
      },
      custo: (valor, dados) => (valor >= dados.preco ? 'O custo precisa ser menor que o preço de venda.' : ''),
    }, (dados) => {
      if (novo) Storage.inserir('servicos', Object.assign({ id: Storage.gerarId('add'), tipo: 'adicional' }, dados));
      else Storage.atualizar('servicos', s.id, dados);
      modal.fechar();
      desenharCatalogo();
      ui.toast(novo ? 'Adicional incluído no catálogo.' : 'Serviço atualizado.');
    });
  }

  async function removerAdicional(id) {
    const servico = buscar(id);
    if (!servico || servico.tipo !== 'adicional') return;
    const confirmado = await ui.confirmar({
      titulo: 'Remover adicional',
      mensagem: 'Remover "' + servico.nome + '" do catálogo?',
      detalhe: 'Propostas existentes continuam com o item. Ele só deixa de ser oferecido em novos orçamentos.',
      rotuloConfirmar: 'Remover', perigo: true, icone: 'trash-2',
    });
    if (!confirmado) return;
    Storage.remover('servicos', id);
    desenharCatalogo();
    ui.toast('Adicional removido do catálogo.');
  }

  function montarCatalogo(raiz) {
    raizCatalogo = raiz;
    desenharCatalogo();
    ui.delegar(raiz, 'click', '[data-catalogo]', (evento, botao) => {
      const acao = botao.dataset.catalogo;
      if (acao === 'novo') abrirFormulario(null);
      if (acao === 'editar') abrirFormulario(buscar(botao.dataset.id));
      if (acao === 'remover') removerAdicional(botao.dataset.id);
    });
  }

  SS.Servicos = { CATEGORIAS, catalogoPadrao, listar, principais, adicionais, buscar, nomeDe, grupoDe, montarCatalogo };
})(window);
