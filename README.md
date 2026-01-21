# Gestao Treinamento

Este projeto usa uma estrutura de pastas focada em arquitetura e separacao de responsabilidades.

## Estrutura base

```
src/
  app/
  pages/
  features/
  entities/
  widgets/
  shared/
    assets/
    styles/
    ui/
```

## O que vai em cada pasta e porque

- `src/app`: composicao da aplicacao (providers, roteamento, layout raiz, inicializacao). Porque centraliza a orquestracao e evita acoplamento entre camadas.
- `src/pages`: telas ligadas a rotas, compostas por widgets e features. Porque separa navegacao da logica de negocio.
- `src/features`: funcionalidades focadas em casos de uso (ex: criar treinamento, listar turmas). Pode ter componentes, hooks, servicos e testes da feature. Porque facilita evolucao por fluxo.
- `src/entities`: modelos de dominio e regras centrais (tipos, validacoes, mappers, acesso a dados). Porque garante consistencia e reutilizacao.
- `src/widgets`: blocos de UI maiores que combinam features e entities (ex: dashboard, tabelas completas). Porque promove reuso de composicoes complexas.
- `src/shared`: itens reutilizaveis e agnosticos (UI generica, utils, hooks basicos, estilos globais, assets). Porque reduz duplicacao.
- `src/shared/styles`: estilos globais, tokens e resets. Porque centraliza identidade visual.
- `src/shared/ui`: componentes "dumb" e reusaveis (Button, Input). Porque mantem consistencia.
- `src/shared/assets`: imagens, icons e fontes comuns. Porque evita espalhar arquivos estaticos.

## Regras simples de dependencia

- Camadas inferiores nao importam de camadas superiores.
- `shared` pode ser usado por todas as camadas; `entities` por `features/widgets/pages/app`; e assim por diante.

## Outros diretorios

- `public/`: arquivos estaticos servidos diretamente pelo Vite (favicons, manifest).
- `src/main.tsx`: ponto de entrada da aplicacao.
