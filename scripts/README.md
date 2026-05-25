# 📸 Gerar Fotos do Catálogo — Manual de Uso

Script automatizado que baixa fotos de todos os produtos do catálogo Stylos
direto da API pública do **Mercado Livre**, redimensiona pra 400x400, converte
em `.webp` otimizado e salva em `public/products/{codigo}-{slug}.webp`.

Tempo estimado: **~15 minutos pra rodar tudo** + ~10 min de revisão.

---

## 🎯 O que ele faz

1. Lê o array `produtosRaw` direto do `index.html` (não precisa duplicar dados).
2. Pra cada produto, busca no Mercado Livre Brasil por nome + "piscina".
3. Pega a thumbnail do primeiro resultado bom, baixa, redimensiona e salva.
4. Pula imagens que já existem (re-executar é seguro e rápido).
5. Gera `relatorio-fotos.csv` na raiz do projeto com link do ML pra revisão.

---

## ✅ Pré-requisitos

Você precisa ter o **Node.js 18 ou maior** instalado.

### Como conferir
Abre o PowerShell e roda:

```powershell
node --version
```

Se aparecer algo tipo `v20.x.x` ou superior → **está pronto**.
Se der erro ou aparecer versão `v16.x.x` → instala/atualiza pelo site oficial:
👉 https://nodejs.org (baixar versão **LTS**).

---

## 🚀 Passo a passo (primeira vez)

### 1. Abrir o PowerShell na pasta do projeto

```powershell
cd C:\Users\dell\Desktop\piscina-cia
```

### 2. Instalar a única dependência (`sharp`)

```powershell
npm install sharp
```

> Vai criar uma pasta `node_modules`. Demora ~30s na primeira vez.

### 3. Rodar o script

```powershell
node scripts/gerar-fotos.js
```

Você vai ver algo assim no terminal:

```
📦 Lendo catálogo de C:\Users\dell\Desktop\piscina-cia\index.html
✅ 75 produtos encontrados
📁 Criado diretório C:\Users\dell\Desktop\piscina-cia\imagens\produtos
⏳ [1/75] 000004 HTH REDUTOR ALCALINIDADE... ✅
⏳ [2/75] 000022 Q CLOR LIMPA BORDAS 1L... ✅
⏳ [3/75] 000023 Q CLOR CLARIFICANTE 1L QUIMIL... ✅
...
🎉 FIM!
✅ Baixadas:  72
⏭️  Puladas:   0
❌ Falharam:  3
📊 Relatório: C:\Users\dell\Desktop\piscina-cia\relatorio-fotos.csv
📁 Imagens:   C:\Users\dell\Desktop\piscina-cia\imagens\produtos
```

---

## 📊 Revisar o relatório

Abre o arquivo `relatorio-fotos.csv` no **Excel** ou **Google Sheets**.
Vai ver 5 colunas:

| codigo | nome_produto | titulo_ml | url_ml | status |
|--------|--------------|-----------|--------|--------|

**Como revisar (rápido):**

1. Filtra `status = OK` e dá uma passada de olho no `titulo_ml` — se o nome do
   produto do ML bate aproximadamente com o seu, tá certo.
2. Quando o título do ML for muito diferente do seu produto (ex: você pediu
   "HTH Cloro Tablete" e veio "HTH Limpeza Genérica"), copia o `url_ml`,
   abre no navegador, confirma se a foto faz sentido.
3. Pra produtos que não bateram, anota o **código** e roda o script só pra
   eles (veja "Comandos avançados" abaixo) **ou** baixa a foto manual e
   coloca em `public/products/{codigo}-{slug}.webp`.

---

## 🛠️ Comandos avançados

### Sobrescrever todas as imagens existentes
Útil se você mudou nomes/categorias e quer regerar tudo:

```powershell
node scripts/gerar-fotos.js --force
```

### Refazer só um produto específico
Útil quando a foto saiu errada e você quer testar uma 2ª busca:

```powershell
node scripts/gerar-fotos.js --so 000004 --force
```

> Troca `000004` pelo código do produto que quer regerar.

---

## ⚙️ Conectar as fotos ao site

✅ **Não precisa fazer nada manual.** O script salva no exato mesmo caminho
que o `index.html` já procura (`public/products/{codigo}-{slug-do-nome}.webp`,
gerado pela função `imagemDoProduto`).

Assim que terminar de rodar o script, é só atualizar o navegador
(`Ctrl+F5`) e as fotos aparecem nos cards do catálogo automaticamente.

---

## ❗ Problemas comuns

### "npm: comando não reconhecido"
Você não instalou o Node.js. Volta no passo "Pré-requisitos".

### "Cannot find module 'sharp'"
Você não rodou `npm install sharp` ou rodou na pasta errada. Confere que está
em `C:\Users\dell\Desktop\piscina-cia` antes de instalar.

### Muitas fotos saíram erradas
Algumas marcas usam nomes muito genéricos no ML. Soluções:
- Edita o nome no array `produtosRaw` do `index.html` pra ficar mais
  específico (ex: adiciona a marca explícita) e roda `--force` pra esse código.
- Ou baixa manualmente e salva em `public/products/{codigo}-{slug}.webp`.

### "Rate limit" ou erro HTTP 429
A API do ML reclamou. Espera 1-2 minutos e roda de novo — o script vai pular
o que já baixou. Se persistir, aumenta o `DELAY_MS` no topo do
`gerar-fotos.js` de 350 pra 800.

---

## 🔁 Atualizar fotos depois (workflow recorrente)

Quando adicionar um produto novo no array `produtosRaw`:

```powershell
node scripts/gerar-fotos.js
```

Ele pula tudo que já existe e processa só os novos. Sem complicação.
