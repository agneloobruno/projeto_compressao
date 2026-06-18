// app.js — lógica do frontend do comparador de compressão
// Autor: Bruno

// ─── estado ──────────────────────────────────────────────────────────────────
let arquivoAtual = null;
let ultimoResultado = null;

// ─── elementos ───────────────────────────────────────────────────────────────
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const previewCont   = document.getElementById('preview-container');
const previewImg    = document.getElementById('preview-img');
const previewInfo   = document.getElementById('preview-info');
const btnComparar   = document.getElementById('btn-comparar');
const btnExportar   = document.getElementById('btn-exportar');
const statusBar     = document.getElementById('status-bar');
const statusMsg     = document.getElementById('status-msg');
const statusIcon    = document.getElementById('status-icon');
const statusSpinner = document.getElementById('status-spinner');
const cardsGrid     = document.getElementById('cards-grid');
const placeholder   = document.getElementById('placeholder');
const cardsSection  = document.getElementById('cards-section');
const graficosSection = document.getElementById('graficos-section');

const sliderQual    = document.getElementById('slider-qualidade');
const sliderPng     = document.getElementById('slider-png');
const valQual       = document.getElementById('val-qualidade');
const valPng        = document.getElementById('val-png');
const checkLossless = document.getElementById('check-lossless');

// ─── sliders ─────────────────────────────────────────────────────────────────
function atualizarSlider(slider, label) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1);
  slider.style.setProperty('--val', `${pct}%`);
  label.textContent = slider.value;
}

sliderQual.addEventListener('input', () => atualizarSlider(sliderQual, valQual));
sliderPng.addEventListener('input',  () => atualizarSlider(sliderPng, valPng));

// inicializa os sliders com os valores padrão
atualizarSlider(sliderQual, valQual);
atualizarSlider(sliderPng, valPng);

// ─── upload ───────────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const arquivo = e.dataTransfer.files[0];
  if (arquivo) processarArquivo(arquivo);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processarArquivo(fileInput.files[0]);
});

function processarArquivo(arquivo) {
  // valida tipo básico antes de mandar pro servidor
  if (!arquivo.type.startsWith('image/')) {
    setStatus('error', 'O arquivo não é uma imagem válida.');
    return;
  }

  arquivoAtual = arquivo;

  // mostra preview local imediatamente — sem esperar o servidor
  const url = URL.createObjectURL(arquivo);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);

  const kb = (arquivo.size / 1024).toFixed(1);
  previewInfo.textContent = `${arquivo.name} · ${kb} KB`;

  previewCont.style.display = 'flex';
  dropZone.querySelector('.drop-content').style.display = 'none';

  // dispara a comparação automaticamente com os parâmetros atuais
  comparar();
}

// ─── comparação ───────────────────────────────────────────────────────────────
btnComparar.addEventListener('click', comparar);

async function comparar() {
  if (!arquivoAtual) return;

  setStatus('loading', 'Comprimindo nos três formatos...');
  btnComparar.disabled = true;
  cardsGrid.classList.add('loading');

  const formData = new FormData();
  formData.append('imagem', arquivoAtual);
  formData.append('qualidade', sliderQual.value);
  formData.append('nivel_png', sliderPng.value);
  formData.append('webp_lossless', checkLossless.checked ? 'true' : 'false');

  try {
    const resp = await fetch('/api/comparar', { method: 'POST', body: formData });
    const data = await resp.json();

    if (!data.sucesso) {
      setStatus('error', `Erro: ${data.erro}`);
      return;
    }

    ultimoResultado = data;
    renderizarResultados(data);
    setStatus('success', 'Pronto!');
    btnExportar.disabled = false;
  } catch (e) {
    setStatus('error', `Erro de conexão: ${e.message}`);
  } finally {
    btnComparar.disabled = false;
    cardsGrid.classList.remove('loading');
  }
}

// ─── renderização ─────────────────────────────────────────────────────────────
function renderizarResultados(data) {
  placeholder.style.display = 'none';
  cardsSection.style.display = 'block';
  graficosSection.style.display = 'block';
  document.getElementById('export-row').style.display = 'flex';

  const formatos = [
    { chave: 'jpeg', nome: 'JPEG', cor: '#E8593C' },
    { chave: 'png',  nome: 'PNG',  cor: '#3B8BD4' },
    { chave: 'webp', nome: 'WebP', cor: '#E9A227' },
  ];

  cardsGrid.innerHTML = '';
  for (const fmt of formatos) {
    const r = data.resultados[fmt.chave];
    if (!r) continue;
    cardsGrid.appendChild(criarCard(fmt, r));
  }

  // gráficos
  const tabs = { painel: 'painel', tamanho: 'tamanho', qualidade: 'qualidade', tempo: 'tempo' };
  for (const [id, chave] of Object.entries(tabs)) {
    const el = document.getElementById(`grafico-${id}`);
    if (el && data.graficos[chave]) {
      el.src = data.graficos[chave];
    }
  }
}

function criarCard(fmt, r) {
  const psnrPct = r.psnr_db !== null ? Math.min((r.psnr_db / 60) * 100, 100) : 0;
  const ssimPct = r.ssim !== null ? r.ssim * 100 : 0;
  const psnrStr = r.psnr_db !== null ? `${r.psnr_db.toFixed(2)} dB` : 'N/A';
  const ssimStr = r.ssim !== null ? r.ssim.toFixed(4) : 'N/A';
  const qualClass = (r.qualidade_percebida || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const card = document.createElement('div');
  card.className = 'resultado-card';
  card.innerHTML = `
    <div class="card-header">
      <div class="format-badge">
        <div class="format-dot" style="background:${fmt.cor}"></div>
        ${fmt.nome}
      </div>
      <span class="card-size">${r.tamanho_kb.toFixed(1)} KB</span>
    </div>
    <img class="card-preview" src="${r.imagem_base64}" alt="Preview ${fmt.nome}" loading="lazy">
    <div class="card-metrics">
      <div class="metric-row">
        <span class="metric-label">PSNR</span>
        <span class="metric-value">${psnrStr}</span>
        <div class="metric-bar-track">
          <div class="metric-bar-fill" style="width:${psnrPct}%;background:${fmt.cor}"></div>
        </div>
      </div>
      <div class="metric-row">
        <span class="metric-label">SSIM</span>
        <span class="metric-value">${ssimStr}</span>
        <div class="metric-bar-track">
          <div class="metric-bar-fill" style="width:${ssimPct}%;background:${fmt.cor}"></div>
        </div>
      </div>
    </div>
    <div class="card-footer">
      <div>
        <span class="metric-extra">${r.taxa_compressao.toFixed(2)}× · ${r.tempo_ms.toFixed(1)} ms</span>
      </div>
      <span class="qualidade-badge ${qualClass}">${r.qualidade_percebida || '—'}</span>
    </div>
  `;
  return card;
}

// ─── tabs de gráficos ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const alvo = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${alvo}`).classList.add('active');
  });
});

// ─── exportar ────────────────────────────────────────────────────────────────
btnExportar.addEventListener('click', async () => {
  setStatus('loading', 'Gerando arquivo ZIP...');
  btnExportar.disabled = true;

  try {
    const resp = await fetch('/api/exportar');
    if (!resp.ok) {
      const err = await resp.json();
      setStatus('error', err.erro || 'Erro ao exportar.');
      return;
    }

    // download do blob via link temporário
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressao_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setStatus('success', 'Arquivo baixado com sucesso!');
  } catch (e) {
    setStatus('error', `Erro: ${e.message}`);
  } finally {
    btnExportar.disabled = false;
  }
});

// ─── status ───────────────────────────────────────────────────────────────────
function setStatus(tipo, msg) {
  statusBar.className = `status-bar ${tipo}`;
  statusMsg.textContent = msg;
  statusSpinner.style.display = tipo === 'loading' ? 'block' : 'none';
  statusIcon.textContent = tipo === 'success' ? '✓' : tipo === 'error' ? '✕' : '';
  statusIcon.style.color = tipo === 'success' ? '#4ade80' : tipo === 'error' ? '#f87171' : '';
}
