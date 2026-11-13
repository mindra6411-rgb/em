/*
 * SiteSeller — configuracoes.js
 * Personalização da agência, regras de negociação, aparência e gestão dos dados locais.
 */
(function (global) {
  'use strict';

  const SS = global.SS;
  const { Storage, util, ui } = SS;

  const LIMITE_LOGO = 150 * 1024; // o LocalStorage é pequeno: logotipos grandes comprometeriam o restante dos dados

  /* ---------- Agência ---------- */

  let logoAtual = '';

  function desenharPreviaLogo() {
    const config = Object.assign(Storage.ler('configuracoes'), { logo: logoAtual });
    const formulario = document.getElementById('form-agencia');
    if (formulario) config.iniciais = formulario.elements.iniciais.value || config.iniciais;
    ui.render('#previa-logo', ui.avatarAgencia(config, 'avatar--xg') +
      '<div><p class="texto-suave">' + (logoAtual ? 'Logotipo em uso. As iniciais aparecem se ele for removido.' : 'Sem logotipo: a agência é identificada pelas iniciais.') + '</p>' +
      '<div class="previa-logo__acoes"><label class="botao botao--secundario botao--p" for="arquivo-logo">' + ui.icone('upload') + (logoAtual ? 'Trocar imagem' : 'Enviar logotipo') + '</label>' +
      (logoAtual ? '<button type="button" class="botao botao--fantasma botao--p" data-acao="remover-logo">' + ui.icone('trash-2') + 'Remover</button>' : '') + '</div>' +
      '<p class="campo__dica">PNG, JPG, WebP ou SVG de até 150 KB.</p></div>');
  }

  function desenharAgencia() {
    const config = Storage.ler('configuracoes');
    logoAtual = config.logo || '';
    ui.render('#painel-agencia',
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Identidade da agência</h2><p>Aparece na barra superior, na lateral e no cabeçalho das propostas.</p></div></header>' +
      '<form id="form-agencia" novalidate>' +
        '<div class="previa-logo" id="previa-logo"></div><input class="so-leitor" type="file" id="arquivo-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml">' +
        '<div class="grade-form">' +
          ui.campo({ nome: 'nomeAgencia', rotulo: 'Nome da agência', valor: config.nomeAgencia, obrigatorio: true, maximo: 40 }) +
          ui.campo({ nome: 'iniciais', rotulo: 'Iniciais', valor: config.iniciais, obrigatorio: true, maximo: 3, dica: 'Até 3 caracteres, usados quando não há logotipo.' }) +
          ui.campo({ nome: 'descricao', tipo: 'textarea', rotulo: 'Descrição da empresa', valor: config.descricao, maximo: 160, linhas: 2, classe: 'campo--largo' }) +
        '</div>' +
        '<h3 class="subtitulo">Dados da empresa</h3>' +
        '<div class="grade-form">' +
          ui.campo({ nome: 'email', tipo: 'email', rotulo: 'E-mail de contato', valor: config.email, maximo: 120, exemplo: 'contato@agencia.exemplo.com.br' }) +
          ui.campo({ nome: 'telefone', tipo: 'tel', rotulo: 'Telefone', valor: config.telefone, maximo: 20, exemplo: '(11) 5550-0100' }) +
          ui.campo({ nome: 'cidade', rotulo: 'Cidade', valor: config.cidade, maximo: 60, exemplo: 'Campinas, SP' }) +
          ui.campo({ nome: 'fundadaEm', tipo: 'date', rotulo: 'Data de fundação', valor: config.fundadaEm, atributos: 'max="' + util.hoje() + '"' }) +
        '</div>' +
        '<footer class="form-rodape"><button type="submit" class="botao botao--primario">' + ui.icone('save') + 'Salvar identidade</button></footer>' +
      '</form></section>');
    desenharPreviaLogo();

    const formulario = document.getElementById('form-agencia');
    formulario.elements.iniciais.addEventListener('input', desenharPreviaLogo);
    ui.ligarFormulario(formulario, {
      nomeAgencia: (valor) => (valor.length < 2 ? 'Use pelo menos 2 caracteres.' : ''),
      telefone: (valor) => { const digitos = valor.replace(/\D/g, ''); return valor && (digitos.length < 10 || digitos.length > 11) ? 'Informe DDD e número, como (11) 5550-0100.' : ''; },
    }, (dados) => {
      dados.iniciais = dados.iniciais.toUpperCase();
      dados.logo = logoAtual;
      Storage.alterarObjeto('configuracoes', dados);
      SS.App.atualizarEstrutura();
      ui.toast('Identidade da agência atualizada.');
    });

    document.getElementById('arquivo-logo').addEventListener('change', (evento) => {
      const arquivo = evento.target.files[0];
      evento.target.value = '';
      if (!arquivo) return;
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) { ui.toast('Formato não aceito. Envie PNG, JPG, WebP ou SVG.', 'erro'); return; }
      if (arquivo.size > LIMITE_LOGO) { ui.toast('A imagem tem ' + Math.round(arquivo.size / 1024) + ' KB. O limite é 150 KB.', 'erro'); return; }
      const leitor = new FileReader();
      leitor.onload = () => { logoAtual = String(leitor.result); desenharPreviaLogo(); ui.toast('Logotipo carregado. Salve para aplicar.', 'info'); };
      leitor.onerror = () => ui.toast('Não foi possível ler a imagem.', 'erro');
      leitor.readAsDataURL(arquivo);
    });
  }

  /* ---------- Negociação ---------- */

  function desenharNegociacao() {
    const config = Storage.ler('configuracoes');
    ui.render('#painel-negociacao',
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Regras comerciais</h2><p>Limites que protegem a rentabilidade da agência durante orçamentos e negociações.</p></div></header>' +
      '<form id="form-negociacao" novalidate><div class="grade-form">' +
        ui.campo({ nome: 'margemMinima', tipo: 'number', rotulo: 'Margem mínima de negociação', valor: config.margemMinima, obrigatorio: true, minimo: 0, maximoValor: 90, passo: 1, sufixo: '%', dica: 'Propostas abaixo desta margem geram alerta e pedem confirmação. Abaixo do custo, são bloqueadas.' }) +
        ui.campo({ nome: 'validadePropostaDias', tipo: 'number', rotulo: 'Validade das propostas', valor: config.validadePropostaDias, obrigatorio: true, minimo: 1, maximoValor: 90, passo: 1, sufixo: 'dias', dica: 'Depois deste prazo sem fechamento, a proposta enviada expira.' }) +
      '</div>' +
      '<p class="aviso aviso--info">' + ui.icone('calculator') + '<span>Margem = (valor final − custo estimado) ÷ valor final. O custo vem do catálogo de serviços; ajuste-o na aba Catálogo.</span></p>' +
      '<footer class="form-rodape"><button type="submit" class="botao botao--primario">' + ui.icone('save') + 'Salvar regras</button></footer></form></section>');
    ui.ligarFormulario(document.getElementById('form-negociacao'), null, (dados) => {
      Storage.alterarObjeto('configuracoes', dados);
      SS.App.atualizarEstrutura();
      ui.toast('Regras comerciais atualizadas.');
    });
  }

  /* ---------- Aparência ---------- */

  function desenharAparencia() {
    const tema = Storage.ler('configuracoes').tema === 'claro' ? 'claro' : 'escuro';
    const opcao = (id, titulo, texto) => '<label class="tema-opcao"><input type="radio" name="tema" value="' + id + '"' + (tema === id ? ' checked' : '') + '>' +
      '<span class="tema-opcao__corpo"><span class="tema-opcao__amostra tema-opcao__amostra--' + id + '" aria-hidden="true"><i></i><i></i><i></i></span><strong>' + titulo + '</strong><small>' + texto + '</small></span></label>';
    ui.render('#painel-aparencia',
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Tema</h2><p>A preferência fica salva neste navegador.</p></div></header>' +
      '<div class="temas" role="radiogroup" aria-label="Tema da interface">' +
        opcao('escuro', 'Escuro', 'Obsidian e Burgundy. Padrão do SiteSeller.') + opcao('claro', 'Claro', 'Pearl e Ivory, para ambientes iluminados.') + '</div></section>');
  }

  /* ---------- Dados ---------- */

  function desenharDados() {
    const sistema = Storage.ler('sistema');
    const contagens = Storage.LISTAS.map((categoria) => '<div><dt>' + Storage.ROTULOS[categoria] + '</dt><dd>' + Storage.ler(categoria).length + '</dd></div>').join('');
    const ocupado = Storage.tamanhoOcupado();
    ui.render('#painel-dados',
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Armazenamento local</h2><p>' + (Storage.persistente ? 'Os dados ficam no LocalStorage deste navegador. Não há servidor, conta ou sincronização entre dispositivos: limpar os dados do navegador apaga a agência.' : 'O LocalStorage está indisponível. Os dados serão perdidos ao fechar esta página.') + '</p></div></header>' +
        '<dl class="ficha ficha--contagem">' + contagens + '</dl>' +
        '<p class="texto-suave">Espaço utilizado: cerca de ' + util.numero(ocupado / 1024) + ' KB' + (sistema.modo === 'demo' ? ' · agência iniciada com dados de demonstração' : '') + '.</p></section>' +
      '<section class="cartao"><header class="cartao__cabecalho"><div><h2>Backup</h2><p>Exporte um arquivo JSON para guardar ou levar a agência a outro navegador.</p></div></header>' +
        '<div class="acoes-dados">' +
          '<div class="acao-dado"><div><h3>Exportar backup</h3><p>Baixa todos os dados atuais em um arquivo .json.</p></div><button type="button" class="botao botao--secundario" data-acao="exportar">' + ui.icone('download') + 'Exportar</button></div>' +
          '<div class="acao-dado"><div><h3>Importar backup</h3><p>O arquivo é validado e você confere o conteúdo antes de substituir os dados atuais.</p></div><label class="botao botao--secundario" for="arquivo-backup">' + ui.icone('upload') + 'Escolher arquivo</label><input class="so-leitor" type="file" id="arquivo-backup" accept="application/json,.json"></div>' +
        '</div></section>' +
      '<section class="cartao cartao--perigo"><header class="cartao__cabecalho"><div><h2>Reiniciar</h2><p>Ações que substituem ou apagam os dados. Exporte um backup antes, se quiser voltar atrás.</p></div></header>' +
        '<div class="acoes-dados">' +
          '<div class="acao-dado"><div><h3>Restaurar dados de demonstração</h3><p>Substitui clientes, propostas, projetos e lançamentos pelos dados fictícios de exemplo. Nome, logotipo e regras da agência são mantidos; o catálogo volta ao padrão.</p></div><button type="button" class="botao botao--secundario" data-acao="restaurar-demo">' + ui.icone('flask-conical') + 'Restaurar demonstração</button></div>' +
          '<div class="acao-dado"><div><h3>Limpar todos os dados</h3><p>Apaga tudo, inclusive configurações, e volta à tela de primeiro uso.</p></div><button type="button" class="botao botao--perigo" data-acao="limpar-tudo">' + ui.icone('trash-2') + 'Limpar tudo</button></div>' +
        '</div></section>');

    document.getElementById('arquivo-backup').addEventListener('change', (evento) => {
      const arquivo = evento.target.files[0];
      evento.target.value = '';
      if (arquivo) lerBackup(arquivo);
    });
  }

  function exportarBackup() {
    const backup = Storage.exportar();
    const nome = 'siteseller-backup-' + util.hoje() + '.json';
    util.baixarArquivo(nome, JSON.stringify(backup, null, 2));
    ui.toast('Backup exportado: ' + nome + '.');
  }

  function lerBackup(arquivo) {
    if (arquivo.size > 5 * 1024 * 1024) { ui.toast('Arquivo grande demais para ser um backup do SiteSeller.', 'erro'); return; }
    const leitor = new FileReader();
    leitor.onerror = () => ui.toast('Não foi possível ler o arquivo.', 'erro');
    leitor.onload = () => {
      let backup;
      try { backup = JSON.parse(String(leitor.result)); }
      catch (erro) { ui.toast('O arquivo não é um JSON válido. Nada foi alterado.', 'erro'); return; }
      conferirBackup(backup, arquivo.name);
    };
    leitor.readAsText(arquivo);
  }

  function conferirBackup(backup, nomeArquivo) {
    const analise = Storage.validarBackup(backup);
    if (!analise.valido) {
      ui.modal({
        titulo: 'Backup inválido', subtitulo: nomeArquivo, tamanho: 'p',
        conteudo: '<p class="texto-suave">O arquivo foi recusado e os dados atuais continuam intactos.</p><ul class="lista-problemas">' + analise.erros.map((e) => '<li>' + ui.icone('circle-x') + '<span>' + util.esc(e) + '</span></li>').join('') + '</ul>',
        acoes: [{ rotulo: 'Entendi', variante: 'primario' }],
      });
      return;
    }
    const resumo = Storage.LISTAS.map((categoria) => '<div><dt>' + Storage.ROTULOS[categoria] + '</dt><dd>' + (analise.resumo[categoria] || 0) + '</dd></div>').join('');
    ui.modal({
      titulo: 'Importar este backup?', subtitulo: nomeArquivo,
      conteudo: '<p class="texto-suave">Agência <strong>' + util.esc(backup.dados.configuracoes.nomeAgencia) + '</strong>, exportada em ' + util.dataHora(backup.exportadoEm) + '.</p>' +
        '<dl class="ficha ficha--contagem">' + resumo + '</dl>' +
        (analise.avisos.length ? '<ul class="lista-problemas lista-problemas--avisos">' + analise.avisos.map((a) => '<li>' + ui.icone('info') + '<span>' + util.esc(a) + '</span></li>').join('') + '</ul>' : '') +
        '<p class="aviso aviso--perigo">' + ui.icone('triangle-alert') + '<span>Todos os dados atuais deste navegador serão substituídos pelo conteúdo do backup.</span></p>',
      acoes: [
        { rotulo: 'Cancelar', variante: 'fantasma' },
        { rotulo: 'Substituir dados', variante: 'perigo', icone: 'upload', aoClicar() {
          const resultado = Storage.importar(backup);
          if (!resultado.valido) { ui.toast(resultado.erros[resultado.erros.length - 1], 'erro'); return; }
          ui.toastAposNavegar('Backup importado com sucesso.');
          global.location.reload();
        } },
      ],
    });
  }

  async function restaurarDemonstracao() {
    const seguir = await ui.confirmar({ titulo: 'Restaurar dados de demonstração', mensagem: 'Clientes, orçamentos, negociações, projetos e lançamentos atuais serão substituídos pelos dados fictícios de exemplo.', detalhe: 'Esta ação não pode ser desfeita. Exporte um backup antes se quiser preservar os dados atuais.', rotuloConfirmar: 'Restaurar demonstração', perigo: true, icone: 'flask-conical' });
    if (!seguir) return;
    const anterior = Storage.ler('configuracoes');
    SS.App.prepararAgencia('demo', anterior.nomeAgencia);
    Storage.alterarObjeto('configuracoes', (config) => Object.assign(config, {
      iniciais: anterior.iniciais, logo: anterior.logo, descricao: anterior.descricao, margemMinima: anterior.margemMinima,
      validadePropostaDias: anterior.validadePropostaDias, tema: anterior.tema, fundadaEm: anterior.fundadaEm,
      email: anterior.email || config.email, telefone: anterior.telefone || config.telefone, cidade: anterior.cidade || config.cidade,
    }));
    ui.toastAposNavegar('Dados de demonstração restaurados.');
    global.location.href = 'index.html';
  }

  async function limparTudo() {
    const seguir = await ui.confirmar({ titulo: 'Limpar todos os dados', mensagem: 'Clientes, propostas, projetos, financeiro, notificações e configurações serão apagados deste navegador.', detalhe: 'Não há como recuperar depois, a menos que você tenha exportado um backup.', rotuloConfirmar: 'Apagar tudo', perigo: true, icone: 'trash-2' });
    if (!seguir) return;
    Storage.limparTudo();
    global.location.href = 'index.html';
  }

  function montarPagina() {
    const raiz = document.getElementById('conteudo');
    desenharAgencia();
    desenharNegociacao();
    desenharAparencia();
    desenharDados();
    SS.Servicos.montarCatalogo(document.getElementById('painel-catalogo'));

    const abas = ['agencia', 'catalogo', 'negociacao', 'aparencia', 'dados'];
    const ativar = ui.ligarAbas(raiz, (nome) => {
      if (nome === 'dados') desenharDados();
      const url = new URL(global.location.href);
      url.searchParams.set('aba', nome);
      global.history.replaceState(null, '', url);
    });
    const pedida = util.parametro('aba');
    ativar(abas.includes(pedida) ? pedida : 'agencia');

    raiz.addEventListener('change', (evento) => {
      if (evento.target.name === 'tema') { SS.App.definirTema(evento.target.value); ui.toast('Tema ' + evento.target.value + ' aplicado.'); }
    });
    global.addEventListener('ss:tema', desenharAparencia);

    ui.delegar(raiz, 'click', '[data-acao]', (evento, botao) => {
      const acao = botao.dataset.acao;
      if (acao === 'remover-logo') { logoAtual = ''; desenharPreviaLogo(); ui.toast('Logotipo removido. Salve para aplicar.', 'info'); }
      if (acao === 'exportar') exportarBackup();
      if (acao === 'restaurar-demo') restaurarDemonstracao();
      if (acao === 'limpar-tudo') limparTudo();
    });
  }

  SS.App.paginas.configuracoes = montarPagina;
})(window);
