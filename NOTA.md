# Moviola 0.1.0-beta.001

Beta local, em três salas: Entrada, Criação e Editor.

A sessão fica num JSON nesta máquina. A pessoa e o agente usam as mesmas operações. A pessoa edita tema, ordem, narração e corte. A marca começa vazia.

O render pede `POST /api/v1/post-production`. Com ffmpeg nesta máquina, o mp4 sai aqui. Sem ffmpeg, o mesmo pedido vai para o worker.

O Editor ingere vídeo, recorta, traduz, dubla, busca stock, gera avatar, monta slides, remove fundo, audita, corta com a lâmina, desfaz e exporta. Não há publicação em rede social.

O instalador Windows foi gerado nesta máquina. O app aponta para as GitHub Releases de `xdireitopratico/moviola` e nenhuma release foi publicada.
