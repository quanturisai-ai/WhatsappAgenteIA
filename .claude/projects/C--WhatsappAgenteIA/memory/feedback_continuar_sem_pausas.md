---
name: feedback-continuar-sem-pausas
description: Diego prefere que o Writer (e outros agentes) continuem gerando todos os arquivos sem pausar para pedir CONTINUAR entre cada item
metadata:
  type: feedback
---

Não pausar entre itens do plano de geração pedindo "CONTINUAR".

**Why:** Diego pediu explicitamente "pode continuar tudo sem me perguntar" durante a execução do Writer.

**How to apply:** Em execuções do Writer (e demais agentes com fluxo sequencial), gerar todos os arquivos em sequência sem aguardar confirmação entre cada item. Ainda pausar em checkpoints críticos que exijam decisão humana (ex: decisão de doc_level, organização de specs), mas não em cada arquivo gerado.
