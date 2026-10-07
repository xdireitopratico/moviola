# Moviola — ledger de trabalho

Caminho canônico do beta `0.1.0-beta.001`. São 100 itens. O item 100, com a release no GitHub, é o produto pronto. Nada do que o produto faz ficou de fora desta lista. O que não está aqui não faz parte deste beta.

O clone `/root/Projetos/video-engineer` e o `docs/CANONICO.md` do Windows ficam como história. Não se edita aquele clone para construir o Moviola. Não se copia código de lá.

Trabalho, teste e build acontecem na VPS `187.77.239.8`, no repositório `/root/Projetos/moviola`. A conversa com a Lumen continua na frota deste projeto. O arquivo que ela edita está na VPS, em `app/`. Patch no clone antigo não conta como item feito.

## Como usar

O próximo item é o primeiro que ainda está `aberto`. A verificação escrita nele é a única prova. Sem ela, o item continua aberto.

Itens **Eu** são backend, contrato, worker e empacotamento. Itens **Lumen** são tela. A tela importa as funções de `shared/` e do store. Ela não cria um segundo formato de sessão e não chama `fetch` por conta própria.

Quando a Lumen estiver na frota, o pedido leva o número do item, a dependência e a verificação. A resposta dela é a verificação cumprida ou o impedimento. Não se abre subagente no lugar dela.

Um item **Lumen** só começa quando a dependência está `feito`. A exceção é o 022, que pode começar assim que o 001 estiver feito.

## Decisões que esta lista já aplica

O nome é Moviola, o que ela batizou no mockup. A versão de produto é `0.1.0-beta.001`.

Há três salas: Entrada, Criação, Editor. A sala de agentes não existe. O trabalho dela é uma operação por baixo da Criação, e a barra mostra o último evento.

A sessão é um arquivo JSON no disco. Não há Supabase, nem o que já roda na VPS para outros produtos, nem MQTT. O contrato de render é HTTP `POST /api/v1/post-production`. O `ffmpeg` está no PATH da VPS (`/usr/bin/ffmpeg`). O item 042 sobe o endpoint; o 044 usa o ffmpeg para concatenar clipes.

Gerar a imagem da cena é outro HTTP, de modelo. FFmpeg junta, legenda e mistura. O da máquina e o da VPS recebem o mesmo pedido. O da VPS vem primeiro.

O agente e a pessoa usam as mesmas funções. A pessoa edita tema, ordem, narração e corte. Marca começa vazia. O texto "Direito Prático" não entra.

Push e release são os itens 099 e 100. Antes disso o git fica só na VPS. Os dois esperam autorização explícita.

## Direção inicial da Lumen

Sua primeira tarefa é o item 022, e só ele. Desenhe a Entrada em `app/entrada/` a partir de `design/redesign-mockup.html` do clone antigo, como referência visual, sem copiar o JavaScript.

Critério do 022: a sala aparece com tema, duração, formato e estilo; o texto de interface tem no mínimo 12px; não há `<select>` nativo; o campo de tema mostra o cursor e não ganha anel de foco na caixa.

Não faça a Criação, o Editor, recentes ligados em dados, nem o botão que grava sessão. Isso são os itens 023 em diante, e cada um espera a dependência. Não crie quarta página. Não traga a sala de agentes. Não altere `shared/`, `main/` nem `docs/LEDGER.md`.

## Itens

001. **Eu** — `feito` — Repositório `/root/Projetos/moviola` na `main`, com este ledger. Verificar: não existe `supabase/` nem `src/components/` copiados.
002. **Eu** — `feito` — `package.json` com nome `moviola`, versão `0.1.0-beta.001` e scripts Bun. Verificar: `bun run typecheck` verde.
003. **Eu** — `feito` — `.gitignore` de dependência, build, segredo, sessão e mídia. Verificar: `git status` não mostra `node_modules`.
004. **Eu** — `feito` — `tsconfig` estrito em `shared/`. Verificar: o typecheck do 002.
005. **Eu** — `feito` — `README.md` só aponta para este ledger. Verificar: o README não repete a lista.
006. **Eu** — `feito` — depende 004 — Tipos em `shared/contract.ts`: sessão, lançamento, cena, cinco estados (`vazia`, `gerando`, `pronta`, `falhou`, `travada`), pedido de pós-produção e evento de atividade. Verificar: `bun run typecheck`.
007. **Eu** — `feito` — depende 006 — Teste: sessão nova válida, status `briefing`, cena não travada.
008. **Eu** — `feito` — depende 006 — Teste: estado de cena fora dos cinco é rejeitado.
009. **Eu** — `feito` — depende 006 — Teste: texto de cena travada não é sobrescrito.
010. **Eu** — `feito` — depende 006 — Teste: o portão de completude aponta a cena que falta e não monta o pedido.
011. **Eu** — `feito` — depende 006 — Teste: o portão de arquivo recusa clipe marcado pronto sem caminho no disco.
012. **Eu** — `feito` — depende 006 — Teste: o pedido feliz ordena as cenas, pede `mp4` e inclui o callback.
013. **Eu** — `feito` — depende 007 — Store JSON cria e relê uma sessão no disco da VPS.
014. **Eu** — `feito` — depende 013 — Listar sessões recentes pela data.
015. **Eu** — `feito` — depende 013 — Gravar tema, duração, formato e estilo.
016. **Eu** — `feito` — depende 013 — Gravar a nova ordem das cenas.
017. **Eu** — `feito` — depende 013 — Gravar a narração editada.
018. **Eu** — `feito` — depende 009, 013 — Gravar a trava da cena.
019. **Eu** — `feito` — depende 005 — A janela Electron abre na Entrada.
020. **Eu** — `feito` — depende 019 — O processo principal não cita Supabase nem tela de login. Verificar: busca em `main/` sem ocorrência.
021. **Eu** — `feito` — depende 019 — A configuração do updater tem dono, repositório e versão, e não publica. Verificar: um teste lê os três campos.
022. **Lumen** — `feito` — depende 001 — Entrada com o visual do mockup. Texto de interface com no mínimo 12px. Sem `<select>` nativo. Campo de tema sem anel de foco. Verificar: a sala abre na VPS com tema, duração, formato e estilo.
023. **Lumen** — `feito` — depende 022 — Estado vazio, sem projeto de exemplo.
024. **Lumen** — `feito` — depende 006, 015 — O preenchido lê e grava o contrato. Não existe um estado de tela paralelo.
025. **Lumen** — `feito` — depende 014, 022 — Recentes saem do store.
026. **Lumen** — `feito` — depende 013, 022 — "Criar vídeo" grava a sessão e abre a Criação. Verificar: o arquivo existe no disco depois da ação.
027. **Eu** — `feito` — depende 013 — `createSession` é a única criação de sessão. A tela e o agente importam essa função.
028. **Eu** — `feito` — depende 006 — `fillStoryboard` de teste, sem rede, escreve cenas a partir do tema.
029. **Eu** — `feito` — depende 009, 028 — `fillStoryboard` não altera cena travada.
030. **Eu** — `feito` — depende 027 — Cada operação acrescenta um evento de atividade.
031. **Lumen** — `feito` — depende 030 — A barra mostra o último evento. Não há quarta tela.
032. **Lumen** — `feito` — depende 008, 022 — A folha de contato desenha os cinco estados da cena.
033. **Lumen** — `feito` — depende 017 — Editar a narração grava no store.
034. **Lumen** — `feito` — depende 016 — Reordenar grava no store.
035. **Lumen** — `feito` — depende 028 — Regenerar mostra `gerando` e chama a operação. A cena não vira pronta sozinha.
036. **Lumen** — `feito` — depende 022 — As abas Legendas e Trilha aparecem e ainda não gravam.
037. **Lumen** — `feito` — depende 010 — "Abrir no editor" fica bloqueado e nomeia a cena que segurou.
038. **Eu** — `feito` — depende 006 — Cliente HTTP de geração. Sem URL, a cena fica `falhou` com motivo.
039. **Eu** — `feito` — depende 038 — Fila local, uma cena por vez, em `gerando` até terminar.
040. **Eu** — `feito` — depende 039 — O arquivo do clipe está no disco antes do status `pronta`.
041. **Eu** — `feito` — depende 040 — Teste com servidor falso: HTTP 200 grava o arquivo; HTTP 500 marca `falhou`.
042. **Eu** — `feito` — depende 012 — Subir na VPS `POST /api/v1/post-production`. Verificar: a porta responde.
043. **Eu** — `feito` — depende 042 — O worker recusa os dois portões no mesmo formato dos testes 010 e 011.
044. **Eu** — `feito` — depende 042 — Instalar o ffmpeg na VPS se o probe não achar. O worker concatena dois clipes de cor e devolve um mp4.
045. **Eu** — `feito` — depende 044 — O callback grava o mp4 e marca a sessão `done` ou `failed`.
046. **Eu** — `feito` — depende 045 — Teste do worker com arquivo real, sem resposta forjada.
047. **Eu** — `feito` — depende 040, 046 — O app chama o worker e espera `done` ou `failed`.
048. **Eu** — `feito` — depende 042 — `dry_run` devolve o pedido e não chama o ffmpeg.
049. **Lumen** — `aberto` — depende 047 — O monitor do Editor toca o mp4 da sessão.
050. **Lumen** — `aberto` — depende 016, 049 — A faixa V1 mostra os clipes na ordem salva.
051. **Lumen** — `aberto` — depende 049 — Exportar copia o mp4 para o caminho escolhido.
052. **Lumen** — `feito` — depende 010, 037 — Se o render não começou, a sala mostra a cena e o motivo.
053. **Eu** — `aberto` — depende 026, 047, 051 — Um script na VPS percorre tema, sessão, cenas, clipes, mp4 e exportação, e termina verde.
054. **Eu** — `aberto` — depende 006 — Contrato de voz: id, velocidade e pausa entre cenas.
055. **Eu** — `aberto` — depende 054 — A pré-escuta baixa um áudio ou falha com motivo.
056. **Eu** — `aberto` — depende 012, 055 — A narração entra no pedido de pós-produção.
057. **Lumen** — `aberto` — depende 033, 054 — A aba Narração grava voz, velocidade e pausa, e dispara a prévia.
058. **Eu** — `aberto` — depende 056 — Gerar o SRT a partir da narração.
059. **Eu** — `aberto` — depende 012, 058 — Com legenda ligada, o pedido leva o SRT.
060. **Eu** — `aberto` — depende 012 — Com música ligada, o pedido leva arquivo, volume e fades.
061. **Lumen** — `aberto` — depende 059, 060 — As abas Legendas e Trilha passam a gravar.
062. **Eu** — `aberto` — depende 044 — Probe do ffmpeg local: achou ou não, com caminho e versão.
063. **Eu** — `aberto` — depende 012, 062 — Com ffmpeg local, o mesmo pedido roda na máquina do app.
064. **Eu** — `aberto` — depende 047, 063 — Sem ffmpeg local, o mesmo pedido vai para a VPS. São dois testes.
065. **Eu** — `aberto` — depende 041 — Regenerar pelo inspetor usa a mesma fila.
066. **Eu** — `aberto` — depende 006 — Escala, posição e opacidade do clipe entram no contrato e sobrevivem a reabrir a sessão.
067. **Lumen** — `aberto` — depende 066 — O inspetor Clipe edita escala, posição e opacidade.
068. **Eu** — `aberto` — depende 044, 066 — Ken Burns entra no pedido e o worker aplica.
069. **Eu** — `aberto` — depende 044 — Cor: o worker aplica um ajuste, ou a aba fica desabilitada. O teste prova qual dos dois vale, e que a aba desabilitada não grava.
070. **Lumen** — `aberto` — depende 069 — A aba Cor segue a decisão do 069.
071. **Eu** — `aberto` — depende 044 — A lâmina divide o clipe e o worker renderiza os dois trechos.
072. **Lumen** — `aberto` — depende 071 — A ferramenta lâmina chama essa operação.
073. **Eu** — `aberto` — depende 012 — A faixa de texto entra no pedido.
074. **Lumen** — `aberto` — depende 073 — A faixa V2 edita esse texto.
075. **Eu** — `aberto` — depende 044 — Faixa travada não entra no render seguinte.
076. **Eu** — `aberto` — depende 066 — Desfazer e refazer uma edição de clipe.
077. **Lumen** — `aberto` — depende 076 — Os botões desfazer e refazer chamam essa operação.
078. **Eu** — `aberto` — depende 053 — O electron-builder, na VPS, gera o instalador Windows.
079. **Eu** — `aberto` — depende 078 — A versão dentro do binário é `0.1.0-beta.001`.
080. **Eu** — `aberto` — depende 021, 079 — O updater aponta para as GitHub Releases deste repositório, ainda sem release publicada.
081. **Eu** — `aberto` — depende 006 — A marca começa vazia. Verificar: busca no repositório não acha "Direito Prático".
082. **Lumen** — `aberto` — depende 081 — O campo de marca no inspetor abre vazio.
083. **Eu** — `aberto` — depende 040 — Ingerir um vídeo local cria um clipe com a duração lida do arquivo.
084. **Eu** — `aberto` — depende 071 — Recortar um trecho desse arquivo.
085. **Eu** — `aberto` — depende 009 — Traduzir o texto de uma cena guarda a tradução ao lado. Cena travada não perde o original.
086. **Eu** — `aberto` — depende 056 — A dublagem gera outro áudio e substitui a narração da sessão.
087. **Eu** — `aberto` — depende 038 — A busca de stock devolve opções. Inserir cria uma cena na mesma fila.
088. **Eu** — `aberto` — depende 038 — Avatar usa a mesma fila de geração.
089. **Eu** — `aberto` — depende 028 — Slides viram cenas pelo mesmo `fillStoryboard`.
090. **Eu** — `aberto` — depende 044 — Remoção de fundo é um passo do worker, com teste em um clipe.
091. **Eu** — `aberto` — depende 008 — A auditoria grava `score` na cena. Sem auditoria, o campo é nulo.
092. **Lumen** — `aberto` — depende 082, 083, 084, 085, 086, 087, 088, 089, 090, 091 — Essas ferramentas ficam num menu do Editor. Nenhuma vira página.
093. **Eu** — `aberto` — depende 092 — Não há botão de publicação social. Verificar: a busca na tela não acha ação de publicar.
094. **Eu** — `aberto` — depende 053, 092 — O script do item 053 roda outra vez e termina verde.
095. **Eu** — `aberto` — depende 094 — `bun test` completo, um comando, termina verde.
096. **Eu** — `aberto` — depende 095 — A busca no repositório não acha cópia nem import de `video-engineer`.
097. **Eu** — `aberto` — depende 095 — Tag git local `v0.1.0-beta.001`.
098. **Eu** — `aberto` — depende 097 — Nota curta de versão no próprio repositório, dizendo o que o beta faz. Não é o changelog do SEALs.
099. **Eu** — `aberto` — depende 080, 097 — Com autorização, push fast-forward da `main` e da tag. Sem autorização, este item fica aberto e nada é publicado.
100. **Eu** — `aberto` — depende 099 — GitHub Release com o instalador. Um segundo lançamento do app enxerga essa release. Neste ponto o beta 001 está pronto.

## Fora da lista

Colaboração, login e time não têm item. Entram com uma ordem nova, no fim, sem furar a fila.

A sala de agentes, o Supabase e o MQTT não têm item. Reabrir isso é trocar o ledger, não um ajuste no meio.
