# SiteSeller 1.0

Simulação de gestão de uma agência de desenvolvimento web: clientes, orçamentos,
negociações, projetos e financeiro, tudo integrado e salvo no LocalStorage do navegador.

Feito com HTML5, CSS3 e JavaScript puro. Não há backend, build ou dependências a instalar.

## Como abrir

Abra `index.html` no navegador ou sirva a pasta com qualquer servidor estático:

```
python3 -m http.server 8080
```

No primeiro acesso, escolha entre explorar com dados de demonstração (identificados
como tal) ou começar com a agência vazia.

## Estrutura

```
index.html            Dashboard
clientes.html         Carteira e caixa de entrada de contatos
orcamentos.html       Lista e assistente de orçamento
negociacoes.html      Conversas com os clientes simulados
projetos.html         Etapas e prazos dos projetos
financeiro.html       Contas a receber, despesas e histórico
configuracoes.html    Agência, catálogo, regras, aparência e backup
css/                  style.css (base e estrutura), components.css, responsive.css
js/storage.js         Persistência central (LocalStorage)
js/app.js             Utilitários, interface comum e inicialização
js/<módulo>.js        Um arquivo por área: clientes, servicos, orcamentos,
                      negociacoes, projetos, financeiro, notificacoes,
                      dashboard, configuracoes
js/dados-demo.js      Gerador dos dados de demonstração
assets/               Fontes, ícones (Lucide) e Chart.js locais
```

## Observações

- Os dados ficam apenas neste navegador. Use Configurações > Dados e backup para
  exportar ou importar um arquivo JSON.
- Os clientes são simulados por regras determinísticas (orçamento, prazo,
  necessidades e perfil). Não há sorteio nem serviço externo de IA.
- Lucide (ISC), Chart.js (MIT) e as fontes Sora, Inter e JetBrains Mono (OFL)
  estão incluídos em `assets/` para o sistema funcionar sem internet.
