/**
 * GERAR FOTOS DO CATÁLOGO — Stylos Piscinas (versão Puppeteer)
 *
 * Lê o array de produtos do index.html, abre o Mercado Livre em um Chrome
 * headless (Puppeteer), captura a primeira imagem de produto da listagem,
 * baixa, redimensiona para 400x400 e salva em
 * public/products/{codigo}-{slug}.webp — caminho que o site já procura.
 *
 * Gera relatorio-fotos.csv com:
 *   codigo | nome_produto | titulo_ml | url_ml | status
 *
 * USO:
 *   node scripts/gerar-fotos.js              -> processa tudo (pula existentes)
 *   node scripts/gerar-fotos.js --force      -> sobrescreve todas as imagens
 *   node scripts/gerar-fotos.js --so 000004  -> processa só um código
 *   node scripts/gerar-fotos.js --headed     -> abre o Chrome visível (debug)
 *
 * Requisitos: Node 18+, sharp e puppeteer
 *   npm install sharp puppeteer
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const puppeteer = require('puppeteer');

// ============== CONFIGURAÇÃO ==============
const RAIZ = path.join(__dirname, '..');
const HTML_PATH = path.join(RAIZ, 'index.html');
const SAIDA_DIR = path.join(RAIZ, 'public', 'products');
const CSV_PATH = path.join(RAIZ, 'relatorio-fotos.csv');

const TAMANHO_PX = 400;
const QUALIDADE_WEBP = 82;
const TIMEOUT_NAV = 25000;
const MAX_TENTATIVAS = 2;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const HEADED = args.includes('--headed');
const RETRY_FALHAS = args.includes('--retry-falhas');
const SO_INDEX = args.indexOf('--so');
const SO_CODIGO = SO_INDEX !== -1 ? args[SO_INDEX + 1] : null;

// Modo retry usa delay 3x maior + relança browser a cada N pra driblar rate-limit
const DELAY_MS = RETRY_FALHAS ? 2000 : 600;
const REINICIAR_BROWSER_A_CADA = RETRY_FALHAS ? 20 : 0;

// ============== UTILS ==============
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(emoji, msg) {
  process.stdout.write(`${emoji} ${msg}\n`);
}

function escapeCsv(s) {
  if (s == null) return '';
  const str = String(s).replace(/"/g, '""');
  return /[",\n;]/.test(str) ? `"${str}"` : str;
}

// Bate exatamente com slugify() do index.html
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
function nomeArquivo(produto) {
  return `${produto.codigo}-${slugify(produto.nome)}.webp`;
}

// ============== EXTRAÇÃO DO CATÁLOGO ==============
function extrairProdutos() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const inicio = html.indexOf('const produtosRaw = [');
  if (inicio === -1) throw new Error('produtosRaw não encontrado no index.html');
  const fim = html.indexOf('];', inicio);
  const bloco = html.slice(inicio, fim + 2);

  const re = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*'([^']+)'\s*\]/g;
  const produtos = [];
  let m;
  while ((m = re.exec(bloco)) !== null) {
    produtos.push({
      codigo: m[1],
      nome: m[2],
      preco: parseFloat(m[3]),
      categoria: m[4],
    });
  }
  return produtos;
}

// Limpa o nome pra busca: tira sufixos de embalagem e números soltos
function termoDeBusca(nome) {
  return nome
    .replace(/\b\d+\s*(?:G|KG|ML|L|LT|UN|UNIDADES?|KG\.|LT\.)\b/gi, ' ')
    .replace(/\bC\/\s*\d+\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[,.\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' piscina';
}

// ============== PUPPETEER: BUSCA + EXTRAÇÃO ==============
async function abrirBrowser() {
  return puppeteer.launch({
    headless: HEADED ? false : 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=pt-BR',
    ],
    defaultViewport: { width: 1366, height: 900 },
  });
}

async function buscarNoML(page, termo) {
  const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(termo)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_NAV });

  await page.waitForFunction(() => {
    return !!document.querySelector('.poly-card, .ui-search-result, [class*="andes-card"]');
  }, { timeout: 12000 }).catch(() => null);

  // Coleta os 5 primeiros cards orgânicos (sem patrocinado)
  const candidatos = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.poly-card, .ui-search-result'));
    const lista = [];
    for (const card of cards) {
      // Pula patrocinados (links de tracking "click1.mercadolivre")
      const linkRef = card.querySelector('a[href*="click1.mercadolivre"], a[href*="/mclics/"]');
      if (linkRef) continue;
      // Pula cards com badge de "Patrocinado"
      const txt = card.textContent || '';
      if (/Patrocinado/i.test(txt)) continue;

      const imgEl = card.querySelector('img');
      if (!imgEl) continue;
      const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
      if (!src || !src.includes('mlstatic')) continue;
      const urlGrande = src
        .replace(/-(?:I|R|O|V|W|S)\.(jpg|webp)$/i, '-O.$1')
        .replace(/_W\.(jpg|webp)$/i, '_O.$1');
      const titEl = card.querySelector('a.poly-component__title, h2 a, .ui-search-item__title');
      const linkEl = card.querySelector('a.poly-component__title, a[href*="mercadolivre"]');
      lista.push({
        titulo: titEl ? titEl.textContent.trim() : '',
        imagem: urlGrande,
        link: linkEl ? linkEl.href : '',
      });
      if (lista.length >= 5) break;
    }
    return lista;
  });

  return candidatos;
}

// Score 0-1 de relevância: % de palavras significativas do produto que aparecem no título do ML
function scoreRelevancia(nomeProduto, tituloML) {
  if (!tituloML) return 0;
  const stop = new Set(['de', 'da', 'do', 'para', 'com', 'sem', 'em', 'a', 'o', 'e', 'piscina', 'piscinas']);
  const norm = s => normalizarBusca(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
  const tokensProd = norm(nomeProduto);
  const tokensML = new Set(norm(tituloML));
  if (tokensProd.length === 0) return 0;
  const acertos = tokensProd.filter(t => tokensML.has(t)).length;
  return acertos / tokensProd.length;
}

// Escolhe o melhor candidato por score; retorna null se nenhum passar do mínimo
function escolherMelhorCandidato(nomeProduto, candidatos, scoreMinimo = 0.4) {
  let melhor = null;
  let melhorScore = 0;
  for (const c of candidatos) {
    const s = scoreRelevancia(nomeProduto, c.titulo);
    if (s > melhorScore) { melhor = c; melhorScore = s; }
  }
  return { candidato: melhor, score: melhorScore, passou: melhorScore >= scoreMinimo };
}

// ============== DOWNLOAD + PROCESSAMENTO ==============
async function baixarImagem(page, url) {
  // Reusa o contexto do browser pra evitar bloqueios (cookies já setados)
  const response = await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_NAV });
  if (!response || !response.ok()) throw new Error(`HTTP ${response ? response.status() : '???'}`);
  return await response.buffer();
}

async function processarImagem(buffer, destino) {
  await sharp(buffer)
    .resize(TAMANHO_PX, TAMANHO_PX, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: QUALIDADE_WEBP })
    .toFile(destino);
}

// ============== PIPELINE POR PRODUTO ==============
async function processarProduto(browser, produto) {
  const destino = path.join(SAIDA_DIR, nomeArquivo(produto));

  if (!FORCE && fs.existsSync(destino)) {
    return { status: 'PULADO_JA_EXISTE', titulo_ml: '', url_ml: '' };
  }

  const termo = termoDeBusca(produto.nome);

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const pageBusca = await browser.newPage();
    try {
      await pageBusca.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      const candidatos = await buscarNoML(pageBusca, termo);
      if (!candidatos || candidatos.length === 0) {
        await pageBusca.close();
        return { status: 'SEM_RESULTADO_ML', titulo_ml: '', url_ml: '', termo };
      }
      const { candidato, score, passou } = escolherMelhorCandidato(produto.nome, candidatos);
      if (!candidato) {
        await pageBusca.close();
        return { status: 'SEM_IMAGEM', titulo_ml: '', url_ml: '', termo };
      }
      const pageImg = await browser.newPage();
      try {
        await pageImg.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        const buffer = await baixarImagem(pageImg, candidato.imagem);
        await processarImagem(buffer, destino);
        const status = passou ? 'OK' : `BAIXA_RELEVANCIA(${score.toFixed(2)})`;
        return { status, titulo_ml: candidato.titulo, url_ml: candidato.link || candidato.imagem, termo };
      } finally {
        await pageImg.close();
      }
    } catch (err) {
      if (tentativa === MAX_TENTATIVAS) {
        return { status: `ERRO: ${err.message}`, titulo_ml: '', url_ml: '', termo };
      }
      await sleep(1200);
    } finally {
      try { await pageBusca.close(); } catch {}
    }
  }
}

// Carrega CSV existente e retorna mapa codigo => {titulo_ml, url_ml, status}
function carregarCsvExistente() {
  if (!fs.existsSync(CSV_PATH)) return new Map();
  const conteudo = fs.readFileSync(CSV_PATH, 'utf8').split('\n').slice(1);
  const mapa = new Map();
  for (const linha of conteudo) {
    if (!linha.trim()) continue;
    // Parser CSV simples: respeita aspas
    const cols = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"' && linha[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    if (cols.length >= 5) {
      mapa.set(cols[0], { nome: cols[1], titulo_ml: cols[2], url_ml: cols[3], status: cols[4] });
    }
  }
  return mapa;
}

// ============== MAIN ==============
async function main() {
  log('📦', `Lendo catálogo de ${HTML_PATH}`);
  let produtos = extrairProdutos();
  log('✅', `${produtos.length} produtos encontrados`);

  const csvExistente = RETRY_FALHAS ? carregarCsvExistente() : new Map();

  if (RETRY_FALHAS) {
    const naoOk = new Set();
    for (const [codigo, info] of csvExistente.entries()) {
      if (info.status !== 'OK' && !info.status.startsWith('PULADO')) naoOk.add(codigo);
    }
    produtos = produtos.filter(p => naoOk.has(p.codigo));
    log('🔁', `Modo --retry-falhas: ${produtos.length} produtos falharam antes, vou re-tentar`);
    log('⏱️ ', `Delay ${DELAY_MS}ms entre requests, browser reinicia a cada ${REINICIAR_BROWSER_A_CADA}`);
  }

  if (SO_CODIGO) {
    produtos = produtos.filter(p => p.codigo === SO_CODIGO);
    log('🎯', `Filtrando só código ${SO_CODIGO} (${produtos.length} resultado)`);
  }

  if (!fs.existsSync(SAIDA_DIR)) {
    fs.mkdirSync(SAIDA_DIR, { recursive: true });
    log('📁', `Criado diretório ${SAIDA_DIR}`);
  }

  log('🌐', `Abrindo Chrome headless...`);
  let browser = await abrirBrowser();
  log('✅', `Chrome pronto. Iniciando processamento...\n`);

  // Resultados acumulados deste run
  const resultados = new Map();
  let ok = 0, pulado = 0, falhou = 0;

  try {
    for (let i = 0; i < produtos.length; i++) {
      const p = produtos[i];

      // Reinicia browser periodicamente em modo retry (limpa cookies/sessão)
      if (REINICIAR_BROWSER_A_CADA > 0 && i > 0 && i % REINICIAR_BROWSER_A_CADA === 0) {
        process.stdout.write(`🔄 Reiniciando browser (drible anti-bot)...\n`);
        await browser.close();
        await sleep(3000);
        browser = await abrirBrowser();
      }

      const prefixo = `[${i + 1}/${produtos.length}] ${p.codigo}`;
      process.stdout.write(`⏳ ${prefixo} ${p.nome.slice(0, 50)}... `);

      const res = await processarProduto(browser, p);
      if (res.status === 'OK') {
        ok++;
        process.stdout.write(`✅\n`);
      } else if (res.status === 'PULADO_JA_EXISTE') {
        pulado++;
        process.stdout.write(`⏭️  (já existe)\n`);
      } else {
        falhou++;
        process.stdout.write(`❌ ${res.status}\n`);
      }

      resultados.set(p.codigo, {
        nome: p.nome,
        titulo_ml: res.titulo_ml,
        url_ml: res.url_ml,
        status: res.status,
      });

      if (res.status !== 'PULADO_JA_EXISTE') await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Em modo retry, faz MERGE: mantém OK antigos + sobrescreve os retestados
  let linhasFinal;
  if (RETRY_FALHAS) {
    const todosProdutos = extrairProdutos();
    linhasFinal = [['codigo', 'nome_produto', 'titulo_ml', 'url_ml', 'status'].join(',')];
    for (const p of todosProdutos) {
      const novo = resultados.get(p.codigo);
      const antigo = csvExistente.get(p.codigo);
      const fonte = novo || antigo;
      if (!fonte) continue;
      linhasFinal.push([
        escapeCsv(p.codigo),
        escapeCsv(p.nome),
        escapeCsv(fonte.titulo_ml || ''),
        escapeCsv(fonte.url_ml || ''),
        escapeCsv(fonte.status || ''),
      ].join(','));
    }
  } else {
    linhasFinal = [['codigo', 'nome_produto', 'titulo_ml', 'url_ml', 'status'].join(',')];
    for (const p of produtos) {
      const r = resultados.get(p.codigo);
      if (!r) continue;
      linhasFinal.push([
        escapeCsv(p.codigo),
        escapeCsv(p.nome),
        escapeCsv(r.titulo_ml),
        escapeCsv(r.url_ml),
        escapeCsv(r.status),
      ].join(','));
    }
  }

  fs.writeFileSync(CSV_PATH, linhasFinal.join('\n'), 'utf8');

  log('', '');
  log('🎉', `FIM!`);
  log('✅', `Baixadas:  ${ok}`);
  log('⏭️ ', `Puladas:   ${pulado}`);
  log('❌', `Falharam:  ${falhou}`);
  log('📊', `Relatório: ${CSV_PATH}`);
  log('📁', `Imagens:   ${SAIDA_DIR}`);
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
