// app.js — lógica do comparador de compressão
// Autor: Bruno

// ─── estado ──────────────────────────────────────────────────────────────────
let arquivoAtual = null;
let tamanhoOriginalKb = 0;

// ─── elementos ───────────────────────────────────────────────────────────────
const dropZone     = document.getElementById('drop-zone');
const dropContent  = document.getElementById('drop-content');
const fileInput    = document.getElementById('file-input');
const previewCont  = document.getElementById('preview-container');
const previewImg   = document.getElementById('preview-img');
const previewInfo  = document.getElementById('preview-info');
const previewTrocar = document.getElementById('preview-trocar');
const btnComparar  = document.getElementById('btn-comparar');
const btnExportar  = document.getElementById('btn-exportar');
const statusBar    = document.getElementById('status-bar');
const statusMsg    = document.getElementById('status-msg');
const statusIcon   = document.getElementById('status-icon');
const statusSpin   = document.getElementById('status-spinner');
const cardsGrid    = document.getElementById('cards-grid');
const placeholder  = document.getElementById('placeholder');
const cardsSection = document.getElementById('cards-section');
const graficosSection = document.getElementById('graficos-section');

const sliderQual   = document.getElementById('slider-qualidade');
const sliderPng    = document.getElementById('slider-png');
const valQual      = document.getElementById('val-qualidade');
const valPng       = document.getElementById('val-png');
const checkLossless = document.getElementById('check-lossless');

// ─── sliders — preenchimento dinâmico via CSS custom property ────────────────
function atualizarSlider(slider, label) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1);
  slider.style.setProperty('--val', `${pct}%`);
  label.textContent = slider.value;
}

sliderQual.addEventListener('input', () => atualizarSlider(sliderQual, valQual));
sliderPng.addEventListener('input',  () => atualizarSlider(sliderPng, valPng));
atualizarSlider(sliderQual, valQual);
atualizarSlider(sliderPng, valPng);

// ─── drag-and-drop ────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) processarArquivo(f);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processarArquivo(fileInput.files[0]);
});

// "Trocar imagem" — reabre o input sem precisar limpar manualmente
previewTrocar.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  fileInput.click();
});

function processarArquivo(arquivo) {
  if (!arquivo.type.startsWith('image/')) {
    setStatus('error', 'O arquivo não é uma imagem válida.');
    return;
  }

  arquivoAtual = arquivo;
  tamanhoOriginalKb = arquivo.size / 1024;

  // preview local imediato — não precisa esperar o servidor
  const url = URL.createObjectURL(arquivo);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);

  const kb = tamanhoOriginalKb.toFixed(1);
  previewInfo.textContent = `${arquivo.name}  ·  ${kb} KB`;

  // mostra preview, esconde instrução de upload
  previewCont.style.display = 'flex';
  dropContent.style.display = 'none';
  btnComparar.disabled = false;

  // atualiza indicador de fluxo — passo 1 concluído
  avancarFluxo(1);

  // compara automaticamente com os parâmetros atuais
  comparar();
}

// ─── fluxo de passos ─────────────────────────────────────────────────────────
function avancarFluxo(passoAtual) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`passo-${i}`);
    el.classList.remove('ativo', 'concluido');
    if (i < passoAtual) el.classList.add('concluido');
    else if (i === passoAtual) el.classList.add('ativo');
  }
}

// ─── comparação principal ────────────────────────────────────────────────────
btnComparar.addEventListener('click', comparar);

async function comparar() {
  if (!arquivoAtual) return;

  avancarFluxo(2);
  setStatus('loading', 'Comprimindo nos três formatos...');
  btnComparar.disabled = true;
  cardsGrid.classList.add('loading');

  const fd = new FormData();
  fd.append('imagem', arquivoAtual);
  fd.append('qualidade', sliderQual.value);
  fd.append('nivel_png', sliderPng.value);
  fd.append('webp_lossless', checkLossless.checked ? 'true' : 'false');

  try {
    const resp = await fetch('/api/comparar', { method: 'POST', body: fd });
    const data = await resp.json();

    if (!data.sucesso) {
      setStatus('error', `Erro: ${data.erro}`);
      avancarFluxo(1);
      return;
    }

    renderizarResultados(data);
    avancarFluxo(3);
    setStatus('success', 'Comparação concluída.');
    btnExportar.disabled = false;
  } catch (e) {
    setStatus('error', `Erro de conexão: ${e.message}`);
  } finally {
    btnComparar.disabled = false;
    cardsGrid.classList.remove('loading');
  }
}

// ─── renderização dos resultados ──────────────────────────────────────────────
function renderizarResultados(data) {
  placeholder.style.display = 'none';
  cardsSection.style.display = 'block';
  graficosSection.style.display = 'block';
  document.getElementById('export-row').style.display = 'flex';

  // descobre os "vencedores" em cada categoria
  const r = data.resultados;
  const vencedores = calcularVencedores(r);

  const formatos = [
    { chave: 'jpeg', nome: 'JPEG', cor: '#e8593c' },
    { chave: 'png',  nome: 'PNG',  cor: '#3b8bd4' },
    { chave: 'webp', nome: 'WebP', cor: '#e9a227' },
  ];

  cardsGrid.innerHTML = '';
  for (const fmt of formatos) {
    if (!r[fmt.chave]) continue;
    const destaque = vencedores[fmt.chave];
    cardsGrid.appendChild(criarCard(fmt, r[fmt.chave], destaque));
  }

  // popula gráficos
  for (const chave of ['painel', 'tamanho', 'qualidade', 'tempo']) {
    const el = document.getElementById(`grafico-${chave}`);
    if (el && data.graficos[chave]) el.src = data.graficos[chave];
  }
}

function calcularVencedores(resultados) {
  const fmts = ['jpeg', 'png', 'webp'];
  const destaques = {};

  // melhor qualidade visual = maior PSNR
  const melhorPsnr = fmts.reduce((m, f) =>
    (resultados[f]?.psnr_db ?? 0) > (resultados[m]?.psnr_db ?? 0) ? f : m
  );

  // menor arquivo = menor tamanho_kb
  const menorArquivo = fmts.reduce((m, f) =>
    (resultados[f]?.tamanho_kb ?? Infinity) < (resultados[m]?.tamanho_kb ?? Infinity) ? f : m
  );

  // mais rápido = menor tempo_ms
  const maisRapido = fmts.reduce((m, f) =>
    (resultados[f]?.tempo_ms ?? Infinity) < (resultados[m]?.tempo_ms ?? Infinity) ? f : m
  );

  // se um formato ganhar em dois critérios, o segundo fica sem badge
  // prioridade: qualidade > tamanho > velocidade
  const badges = {};
  badges[melhorPsnr] = '✦ Melhor qualidade';
  if (!badges[menorArquivo]) badges[menorArquivo] = '✦ Menor arquivo';
  if (!badges[maisRapido])   badges[maisRapido]   = '✦ Mais rápido';

  return badges;
}

// ─── criação de um card de formato ───────────────────────────────────────────
function criarCard(fmt, r, destaque) {
  const psnrPct = r.psnr_db !== null ? Math.min((r.psnr_db / 60) * 100, 100) : 0;
  const ssimPct = r.ssim    !== null ? r.ssim * 100 : 0;
  const psnrStr = r.psnr_db !== null ? `${r.psnr_db.toFixed(1)} dB` : '—';
  const ssimStr = r.ssim    !== null ? r.ssim.toFixed(3) : '—';

  // qual porcentagem do tamanho original ficou?
  const reducaoPct = tamanhoOriginalKb > 0
    ? Math.round((1 - r.tamanho_kb / tamanhoOriginalKb) * 100)
    : null;

  // string de redução, ex: "73% menor que o original"
  const reducaoStr = reducaoPct !== null && reducaoPct > 0
    ? `${reducaoPct}% menor que o original`
    : reducaoPct === 0
      ? 'mesmo tamanho do original'
      : 'maior que o original';

  // classe do badge de qualidade (sem acentos para o CSS)
  const qualRaw = r.qualidade_percebida || 'desconhecida';
  const qualClass = 'qb-' + qualRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const card = document.createElement('div');
  card.className = `resultado-card${destaque ? ' tem-destaque' : ''}`;
  card.style.setProperty('--fmt-color', fmt.cor);

  card.innerHTML = `
    ${destaque ? `<div class="winner-badge">${destaque}</div>` : ''}

    <div class="card-topo">
      <div class="fmt-nome">
        <div class="fmt-dot" style="background:${fmt.cor}"></div>
        ${fmt.nome}
      </div>
      <div style="text-align:right">
        <div class="card-tamanho">${r.tamanho_kb.toFixed(1)} KB</div>
        <div class="card-reducao">${reducaoStr}</div>
      </div>
    </div>

    <img class="card-preview"
         src="${r.imagem_base64}"
         alt="Imagem comprimida em ${fmt.nome}"
         loading="lazy"
         title="Clique para ver em tamanho real"
         onclick="window.open(this.src)"
         style="cursor:zoom-in">

    <div class="card-metricas">

      <div class="metrica-row">
        <div class="metrica-header">
          <div class="metrica-label-wrap">
            <span class="metrica-nome">Qualidade visual</span>
            <span class="tip-icon" data-tip="PSNR: mede defeitos matemáticos na imagem. Acima de 40 dB é imperceptível ao olho humano. Quanto maior, melhor.">?</span>
          </div>
          <span class="metrica-val">${psnrStr}</span>
        </div>
        <div class="metrica-bar">
          <div class="metrica-fill" style="width:${psnrPct}%;background:${fmt.cor}"></div>
        </div>
      </div>

      <div class="metrica-row">
        <div class="metrica-header">
          <div class="metrica-label-wrap">
            <span class="metrica-nome">Fidelidade ao original</span>
            <span class="tip-icon" data-tip="SSIM: mede como o olho humano percebe a diferença. Vai de 0 a 1 — quanto mais próximo de 1, mais fiel ao original.">?</span>
          </div>
          <span class="metrica-val">${ssimStr}</span>
        </div>
        <div class="metrica-bar">
          <div class="metrica-fill" style="width:${ssimPct}%;background:${fmt.cor}"></div>
        </div>
      </div>

    </div>

    <div class="card-rodape">
      <div class="rodape-dados">
        <span class="rodape-item">⚡ ${r.tempo_ms.toFixed(1)} ms para comprimir</span>
        <span class="rodape-item">📦 ${r.taxa_compressao.toFixed(1)}× menor que sem compressão</span>
      </div>
      <span class="qualidade-badge ${qualClass}">${qualRaw}</span>
    </div>
  `;

  return card;
}

// ─── tabs de gráficos ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const alvo = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('ativo'));
    btn.classList.add('ativo');
    document.getElementById(`tab-${alvo}`).classList.add('ativo');
  });
});

// ─── exportar ────────────────────────────────────────────────────────────────
btnExportar.addEventListener('click', async () => {
  setStatus('loading', 'Gerando arquivo ZIP...');
  btnExportar.disabled = true;

  try {
    const resp = await fetch('/api/exportar');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      setStatus('error', err.erro || 'Erro ao exportar.');
      return;
    }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `compressao_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('success', 'Download iniciado com sucesso!');
  } catch (e) {
    setStatus('error', `Erro: ${e.message}`);
  } finally {
    btnExportar.disabled = false;
  }
});

// ─── barra de status ─────────────────────────────────────────────────────────
function setStatus(tipo, msg) {
  statusMsg.textContent = msg;
  statusSpin.style.display = tipo === 'loading' ? 'block' : 'none';
  statusIcon.textContent = tipo === 'success' ? '✓' : tipo === 'error' ? '✕' : '';
  statusIcon.style.color = tipo === 'success' ? '#4db887' : tipo === 'error' ? '#d45252' : '';
}
