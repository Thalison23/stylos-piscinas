/**
 * GERAR PAINEL MANUAL — Stylos Piscinas
 *
 * Lê o relatorio-fotos.csv, pega os produtos que ainda não têm foto boa
 * (SEM_RESULTADO_ML / SEM_IMAGEM / BAIXA_RELEVANCIA) e gera um painel HTML
 * standalone (painel-manual.html) com:
 *   - 1 card por produto
 *   - 3 links de busca (Google Images, Mercado Livre, Google web)
 *   - área de drag-and-drop que renomeia a imagem pro formato exato do site
 *
 * USO:
 *   node scripts/gerar-painel-manual.js
 *   -> gera painel-manual.html na raiz do projeto
 *
 * Depois abre o painel-manual.html no navegador e segue o fluxo:
 *   1. Clica nos links de busca pra achar a foto
 *   2. Salva a imagem localmente (Downloads)
 *   3. Arrasta a imagem na área do card → baixa renomeada
 *   4. No fim, move tudo de Downloads pra public/products/
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const HTML_PATH = path.join(RAIZ, 'index.html');
const CSV_PATH = path.join(RAIZ, 'relatorio-fotos.csv');
const SAIDA_HTML = path.join(RAIZ, 'painel-manual.html');

// ============== UTILS (idênticas ao gerar-fotos.js pro mesmo slug) ==============
function normalizarBusca(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
function slugify(text) {
  return normalizarBusca(text)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

// ============== EXTRAÇÃO ==============
function extrairProdutos() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const inicio = html.indexOf('const produtosRaw = [');
  const fim = html.indexOf('];', inicio);
  const bloco = html.slice(inicio, fim + 2);
  const re = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*'([^']+)'\s*\]/g;
  const lista = [];
  let m;
  while ((m = re.exec(bloco)) !== null) {
    lista.push({ codigo: m[1], nome: m[2], preco: parseFloat(m[3]), categoria: m[4] });
  }
  return lista;
}

function carregarCsv() {
  if (!fs.existsSync(CSV_PATH)) return new Map();
  const linhas = fs.readFileSync(CSV_PATH, 'utf8').split('\n').slice(1);
  const mapa = new Map();
  for (const linha of linhas) {
    if (!linha.trim()) continue;
    const cols = [];
    let cur = '', q = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"' && linha[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    if (cols.length >= 5) mapa.set(cols[0], cols[4]);
  }
  return mapa;
}

// Detecta marca conhecida no nome do produto pra link adicional
function detectarMarca(nome) {
  const n = nome.toUpperCase();
  const marcas = [
    ['HTH', 'hth'],
    ['HIDROALL', 'hidroall'],
    ['HIDROSAN', 'hidrosan hidroall'],
    ['HIDRO', 'hidroall'],
    ['Q CLOR', 'q clor'],
    ['QCLOR', 'q clor'],
    ['CLOR UP', 'clor up'],
    ['CLORUP', 'clor up'],
    ['GENCO', 'genco'],
    ['SODRAMAR', 'sodramar'],
    ['NETUNO', 'netuno'],
    ['ATCLLOR', 'atcllor'],
    ['ATCLLORO', 'atcllor'],
    ['SUALL', 'suall'],
    ['PACE', 'pace pool'],
    ['PROPOOL', 'propool'],
    ['ATSULF', 'atcllor'],
    ['HERBINJEC', 'herbinject'],
  ];
  for (const [needle, busca] of marcas) {
    if (n.includes(needle)) return busca;
  }
  return null;
}

// ============== MAIN ==============
function main() {
  const todos = extrairProdutos();
  const csv = carregarCsv();

  // Filtra: sem foto boa OU sem entrada no CSV
  const faltantes = todos.filter(p => {
    const status = csv.get(p.codigo);
    if (!status) return true; // não tem no csv
    if (status === 'OK' || status.startsWith('PULADO')) return false;
    return true; // SEM_RESULTADO_ML, SEM_IMAGEM, BAIXA_RELEVANCIA
  });

  // Marca quais são baixa-relevância pra sinalizar visualmente
  const baixaRelevancia = new Set();
  for (const [codigo, status] of csv.entries()) {
    if (status.startsWith('BAIXA_RELEVANCIA')) baixaRelevancia.add(codigo);
  }

  console.log(`📦 ${todos.length} produtos no catálogo`);
  console.log(`❗ ${faltantes.length} produtos sem foto boa (alvo do painel)`);
  console.log(`⚠️  ${baixaRelevancia.size} com foto de baixa relevância (sugerimos trocar)`);

  // Monta os cards
  const cardsHtml = faltantes.map(p => {
    const slug = slugify(p.nome);
    const arqDest = `${p.codigo}-${slug}.webp`;
    const marca = detectarMarca(p.nome);
    const termoLimpo = p.nome.replace(/\s+/g, ' ').trim();
    const queryGoogle = encodeURIComponent(`${termoLimpo} piscina`);
    const queryGoogleImg = encodeURIComponent(`${termoLimpo} piscina`);
    const queryML = encodeURIComponent(termoLimpo);
    const queryMarca = marca ? encodeURIComponent(`${marca} ${termoLimpo}`) : null;
    const flagBaixa = baixaRelevancia.has(p.codigo) ? '<span class="flag flag-baixa">⚠ Foto atual fraca</span>' : '';
    const flagSem = !baixaRelevancia.has(p.codigo) ? '<span class="flag flag-sem">❌ Sem foto</span>' : '';

    return `
<div class="card" data-codigo="${p.codigo}" data-destino="${arqDest}">
  <div class="card-head">
    <div>
      <div class="cod">Cód. ${p.codigo}</div>
      <div class="nome">${p.nome}</div>
      <div class="cat">${p.categoria}</div>
    </div>
    <div class="flags">${flagBaixa}${flagSem}</div>
  </div>
  <div class="links">
    <a href="https://www.google.com/search?tbm=isch&q=${queryGoogleImg}" target="_blank" rel="noopener" class="btn btn-img">🖼️ Google Images</a>
    <a href="https://lista.mercadolivre.com.br/${queryML}" target="_blank" rel="noopener" class="btn btn-ml">🛒 Mercado Livre</a>
    <a href="https://www.google.com/search?q=${queryGoogle}" target="_blank" rel="noopener" class="btn btn-web">🌐 Google Web</a>
    ${queryMarca ? `<a href="https://www.google.com/search?tbm=isch&q=${queryMarca}" target="_blank" rel="noopener" class="btn btn-marca">🏢 Marca: ${marca}</a>` : ''}
  </div>
  <div class="drop" data-destino="${arqDest}">
    <span class="drop-msg">⬇️ Arraste a imagem aqui (será renomeada e baixada como)</span>
    <code class="drop-dest">${arqDest}</code>
  </div>
  <div class="preview" hidden></div>
</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Painel Manual — Fotos do Catálogo Stylos</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    margin: 0; background: #f1f5f9; color: #1e293b;
  }
  header {
    background: linear-gradient(135deg, #0077B6, #023E8A); color: white;
    padding: 32px 24px; text-align: center;
  }
  header h1 { margin: 0 0 8px; font-size: 26px; }
  header p { margin: 0; opacity: 0.9; font-size: 14px; }
  .stats {
    display: flex; gap: 24px; justify-content: center;
    margin-top: 18px; flex-wrap: wrap;
  }
  .stat {
    background: rgba(255,255,255,0.15); padding: 10px 20px; border-radius: 20px;
    font-size: 13px; font-weight: 600;
  }
  .stat b { font-size: 18px; display: block; }
  .instr {
    background: #fff7ed; border-left: 4px solid #f59e0b;
    margin: 24px auto; max-width: 1100px; padding: 16px 20px;
    border-radius: 8px; font-size: 14px; line-height: 1.6;
  }
  .instr h3 { margin: 0 0 8px; color: #92400e; font-size: 15px; }
  .instr ol { margin: 0; padding-left: 20px; }
  main {
    max-width: 1100px; margin: 0 auto; padding: 0 16px 40px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 18px;
  }
  .card {
    background: white; border-radius: 12px; padding: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    border: 1px solid #e2e8f0;
    display: flex; flex-direction: column; gap: 12px;
    transition: opacity 0.3s;
  }
  .card.feito { opacity: 0.45; }
  .card.feito::before { content: "✅ Concluído "; display: block; color: #15803d; font-weight: 700; font-size: 13px; }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .cod { font-size: 11px; color: #64748b; letter-spacing: 1px; }
  .nome { font-weight: 700; font-size: 14px; margin: 4px 0; line-height: 1.3; }
  .cat { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  .flags { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
  .flag { font-size: 10px; padding: 3px 8px; border-radius: 10px; font-weight: 700; white-space: nowrap; }
  .flag-baixa { background: #fef3c7; color: #92400e; }
  .flag-sem { background: #fee2e2; color: #991b1b; }
  .links { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .btn {
    display: block; text-align: center; padding: 8px 6px;
    background: #f1f5f9; color: #0f172a; text-decoration: none;
    border-radius: 8px; font-size: 12px; font-weight: 600;
    transition: background 0.15s;
  }
  .btn:hover { background: #e2e8f0; }
  .btn-img { background: #dbeafe; color: #1d4ed8; }
  .btn-ml { background: #fef3c7; color: #92400e; }
  .btn-web { background: #f1f5f9; }
  .btn-marca { background: #dcfce7; color: #166534; grid-column: span 2; }
  .drop {
    border: 2px dashed #cbd5e1; border-radius: 10px;
    padding: 18px 12px; text-align: center;
    background: #f8fafc; cursor: pointer;
    transition: all 0.2s;
  }
  .drop:hover, .drop.over { border-color: #0077B6; background: #e0f2fe; }
  .drop-msg { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; }
  .drop-dest { font-size: 11px; color: #0077B6; word-break: break-all; font-weight: 600; }
  .preview { margin-top: 4px; }
  .preview img { max-width: 100%; border-radius: 8px; max-height: 140px; }
  .filter-bar {
    max-width: 1100px; margin: 0 auto 16px; padding: 0 16px;
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  }
  .filter-bar input {
    flex: 1; min-width: 200px; padding: 8px 12px;
    border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px;
  }
  .filter-bar button {
    background: white; border: 1px solid #cbd5e1; padding: 8px 14px;
    border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 600;
  }
  .filter-bar button.ativo { background: #0077B6; color: white; border-color: #0077B6; }
</style>
</head>
<body>
<header>
  <h1>Painel Manual — Fotos do Catálogo</h1>
  <p>${faltantes.length} produtos pra baixar foto. Tempo estimado: ~45 min</p>
  <div class="stats">
    <div class="stat"><b id="totalEl">${faltantes.length}</b>Total</div>
    <div class="stat"><b id="feitoEl">0</b>Concluídos</div>
    <div class="stat"><b id="restanteEl">${faltantes.length}</b>Restantes</div>
  </div>
</header>

<div class="instr">
  <h3>Como usar (3 passos):</h3>
  <ol>
    <li><strong>Clica num link de busca</strong> (Google Images, ML ou Marca) → abre busca em nova aba</li>
    <li><strong>Salva a melhor foto</strong> no seu PC (botão direito → "Salvar imagem como…" — pode salvar em qualquer pasta, nome qualquer)</li>
    <li><strong>Arrasta a imagem</strong> na área pontilhada do card → ela é renomeada certinho e baixada pra <code>Downloads</code></li>
  </ol>
  <p style="margin: 12px 0 0;"><strong>No fim:</strong> abre <code>Downloads</code>, seleciona todos os arquivos novos e move pra <code>C:\\Users\\dell\\Desktop\\piscina-cia\\public\\products\\</code>. Atualiza o site (Ctrl+F5) e as fotos aparecem.</p>
</div>

<div class="filter-bar">
  <input type="search" id="filtro" placeholder="🔍 Filtrar por código ou nome...">
  <button data-cat="todos" class="ativo">Todos</button>
  <button data-cat="quimicos">Químicos</button>
  <button data-cat="equipamentos">Equipamentos</button>
  <button data-cat="acessorios">Acessórios</button>
</div>

<main id="grid">
${cardsHtml}
</main>

<script>
  // ============ Drag-and-drop por card ============
  function setupDrop(drop) {
    const card = drop.closest('.card');
    const preview = card.querySelector('.preview');
    const destino = drop.dataset.destino;

    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.remove('over');
    }));

    drop.addEventListener('drop', async (e) => {
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) {
        alert('Arraste uma imagem (jpg, png, webp etc.)');
        return;
      }
      const blob = await converterParaWebp(file);
      // Download com nome certo
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = destino;
      document.body.appendChild(a); a.click(); a.remove();
      // Preview
      preview.innerHTML = '<img src="' + URL.createObjectURL(file) + '">';
      preview.hidden = false;
      // Marca como feito
      card.classList.add('feito');
      atualizarContador();
      // Persiste localmente pra lembrar entre reloads
      const feitos = JSON.parse(localStorage.getItem('painel_feitos') || '[]');
      if (!feitos.includes(card.dataset.codigo)) {
        feitos.push(card.dataset.codigo);
        localStorage.setItem('painel_feitos', JSON.stringify(feitos));
      }
    });

    // Click no drop também abre file picker
    drop.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        if (inp.files[0]) {
          const dt = new DataTransfer();
          dt.items.add(inp.files[0]);
          drop.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        }
      };
      inp.click();
    });
  }

  // Converte qualquer imagem pra webp 400x400 (fundo branco)
  function converterParaWebp(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 400, 400);
        // Fit-contain
        const ratio = Math.min(400 / img.width, 400 / img.height);
        const w = img.width * ratio, h = img.height * ratio;
        ctx.drawImage(img, (400-w)/2, (400-h)/2, w, h);
        canvas.toBlob(b => resolve(b), 'image/webp', 0.85);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  document.querySelectorAll('.drop').forEach(setupDrop);

  // ============ Restaura "feitos" ============
  const feitos = JSON.parse(localStorage.getItem('painel_feitos') || '[]');
  feitos.forEach(cod => {
    const c = document.querySelector('.card[data-codigo="' + cod + '"]');
    if (c) c.classList.add('feito');
  });

  function atualizarContador() {
    const total = document.querySelectorAll('.card').length;
    const feito = document.querySelectorAll('.card.feito').length;
    document.getElementById('feitoEl').textContent = feito;
    document.getElementById('restanteEl').textContent = total - feito;
  }
  atualizarContador();

  // ============ Filtro busca + categoria ============
  const filtro = document.getElementById('filtro');
  const botoes = document.querySelectorAll('.filter-bar button');
  let categoriaAtiva = 'todos';
  let termoFiltro = '';

  function aplicarFiltros() {
    const t = termoFiltro.toLowerCase();
    document.querySelectorAll('.card').forEach(card => {
      const txt = card.textContent.toLowerCase();
      const cat = card.querySelector('.cat').textContent.toLowerCase().trim();
      const okTermo = !t || txt.includes(t);
      const okCat = categoriaAtiva === 'todos' || cat === categoriaAtiva;
      card.style.display = (okTermo && okCat) ? '' : 'none';
    });
  }
  filtro.addEventListener('input', e => { termoFiltro = e.target.value; aplicarFiltros(); });
  botoes.forEach(b => b.addEventListener('click', () => {
    botoes.forEach(x => x.classList.remove('ativo'));
    b.classList.add('ativo');
    categoriaAtiva = b.dataset.cat;
    aplicarFiltros();
  }));
</script>
</body>
</html>`;

  fs.writeFileSync(SAIDA_HTML, html, 'utf8');
  console.log(`\n✅ Painel gerado: ${SAIDA_HTML}`);
  console.log(`📂 Abre no navegador: file:///${SAIDA_HTML.replace(/\\/g, '/')}`);
}

main();
