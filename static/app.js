// app.js — lógica do comparador de compressão
// Autor: Bruno

// ─── tema claro / escuro ──────────────────────────────────────────────────────
(function () {
  const salvo = localStorage.getItem('tema') || 'dark';
  document.documentElement.setAttribute('data-theme', salvo);
})();

document.addEventListener('DOMContentLoaded', () => {
  const btnTema = document.getElementById('theme-toggle');
  const iconTema = document.getElementById('theme-icon');

  function sincronizarIcone() {
    const atual = document.documentElement.getAttribute('data-theme');
    iconTema.textContent = atual === 'dark' ? '☀️' : '🌙';
  }

  sincronizarIcone();

  btnTema.addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme');
    const novo  = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    localStorage.setItem('tema', novo);
    sincronizarIcone();
    // recria gráficos com nova paleta de texto
    if (_ultimosResultados) criarGraficos(_ultimosResultados);
  });
});

// ─── estado ──────────────────────────────────────────────────────────────────
let arquivoAtual      = null;
let tamanhoOriginalKb = 0;
let originalDataUrl   = null;   // base64 da imagem original — usado no slider
let _ultimosResultados = null;  // cache para recriar gráficos ao trocar tema

// instâncias Chart.js — guardamos para destruir antes de recriar
const _charts = {};

// ─── elementos ───────────────────────────────────────────────────────────────
const dropZone        = document.getElementById('drop-zone');
const dropContent     = document.getElementById('drop-content');
const fileInput       = document.getElementById('file-input');
const previewCont     = document.getElementById('preview-container');
const previewImg      = document.getElementById('preview-img');
const previewInfo     = document.getElementById('preview-info');
const previewTrocar   = document.getElementById('preview-trocar');
const btnComparar     = document.getElementById('btn-comparar');
const btnExportar     = document.getElementById('btn-exportar');
const statusMsg       = document.getElementById('status-msg');
const statusIcon      = document.getElementById('status-icon');
const statusSpin      = document.getElementById('status-spinner');
const cardsGrid       = document.getElementById('cards-grid');
const placeholder     = document.getElementById('placeholder');
const cardsSection    = document.getElementById('cards-section');
const graficosSection = document.getElementById('graficos-section');
const comparacaoSection = document.getElementById('comparacao-section');

const sliderQual    = document.getElementById('slider-qualidade');
const sliderPng     = document.getElementById('slider-png');
const valQual       = document.getElementById('val-qualidade');
const valPng        = document.getElementById('val-png');
const checkLossless = document.getElementById('check-lossless');

// elementos do slider before/after
const iaWrapper    = document.getElementById('ia-wrapper');
const iaAfter      = document.getElementById('ia-after');
const iaBefore     = document.getElementById('ia-before');
const iaBeforeClip = document.getElementById('ia-before-clip');
const iaDivider    = document.getElementById('ia-divider');
const iaLabelR     = document.getElementById('ia-label-r');

// ─── sliders — preenchimento dinâmico ─────────────────────────────────────────
function atualizarSlider(slider, label) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1);
  slider.style.setProperty('--val', `${pct}%`);
  label.textContent = slider.value;
}

sliderQual.addEventListener('input', () => atualizarSlider(sliderQual, valQual));
sliderPng.addEventListener('input',  () => atualizarSlider(sliderPng, valPng));
atualizarSlider(sliderQual, valQual);
atualizarSlider(sliderPng, valPng);

// desabilita o slider de qualidade quando WebP lossless está ativo
// (qualidade é ignorada pelo Pillow no modo lossless)
checkLossless.addEventListener('change', () => {
  sliderQual.disabled = checkLossless.checked;
  sliderQual.closest('.param-item').style.opacity = checkLossless.checked ? '0.4' : '1';
});

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

  // preview local imediato
  const url = URL.createObjectURL(arquivo);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);
  previewInfo.textContent = `${arquivo.name}  ·  ${tamanhoOriginalKb.toFixed(1)} KB`;

  // lê como base64 para o slider before/after
  const reader = new FileReader();
  reader.onload = (e) => { originalDataUrl = e.target.result; };
  reader.readAsDataURL(arquivo);

  previewCont.style.display = 'flex';
  dropContent.style.display = 'none';
  btnComparar.disabled = false;
  avancarFluxo(1);
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
  comparacaoSection.style.display = 'block';
  graficosSection.style.display = 'block';
  document.getElementById('export-row').style.display = 'flex';

  const r = data.resultados;
  _ultimosResultados = r;

  const vencedores = calcularVencedores(r);
  const formatos = [
    { chave: 'jpeg', nome: 'JPEG', cor: '#e8593c' },
    { chave: 'png',  nome: 'PNG',  cor: '#3b8bd4' },
    { chave: 'webp', nome: 'WebP', cor: '#e9a227' },
  ];

  // cards com animação (precisa remover e re-inserir para re-triggar keyframes)
  cardsGrid.innerHTML = '';
  for (const fmt of formatos) {
    if (!r[fmt.chave]) continue;
    cardsGrid.appendChild(criarCard(fmt, r[fmt.chave], vencedores[fmt.chave]));
  }

  // slider before/after — formato padrão: jpeg
  inicializarSlider(r);

  // gráficos Chart.js
  criarGraficos(r);
}

// ─── cálculo de vencedores ───────────────────────────────────────────────────
function calcularVencedores(resultados) {
  const fmts = ['jpeg', 'png', 'webp'];

  const melhorPsnr   = fmts.reduce((m, f) =>
    (resultados[f]?.psnr_db ?? 0) > (resultados[m]?.psnr_db ?? 0) ? f : m);
  const menorArquivo = fmts.reduce((m, f) =>
    (resultados[f]?.tamanho_kb ?? Infinity) < (resultados[m]?.tamanho_kb ?? Infinity) ? f : m);
  const maisRapido   = fmts.reduce((m, f) =>
    (resultados[f]?.tempo_ms ?? Infinity) < (resultados[m]?.tempo_ms ?? Infinity) ? f : m);

  const badges = {};
  badges[melhorPsnr] = '✦ Melhor qualidade';
  if (!badges[menorArquivo]) badges[menorArquivo] = '✦ Menor arquivo';
  if (!badges[maisRapido])   badges[maisRapido]   = '✦ Mais rápido';

  return badges;
}

// ─── card de formato ──────────────────────────────────────────────────────────
function criarCard(fmt, r, destaque) {
  const psnrPct = r.psnr_db !== null ? Math.min((r.psnr_db / 60) * 100, 100) : 0;
  const ssimPct = r.ssim    !== null ? r.ssim * 100 : 0;
  const psnrStr = r.psnr_db !== null ? `${r.psnr_db.toFixed(1)} dB` : '—';
  const ssimStr = r.ssim    !== null ? r.ssim.toFixed(3) : '—';

  const reducaoPct = tamanhoOriginalKb > 0
    ? Math.round((1 - r.tamanho_kb / tamanhoOriginalKb) * 100)
    : null;
  const reducaoStr = reducaoPct !== null && reducaoPct > 0
    ? `${reducaoPct}% menor que o original`
    : reducaoPct === 0
      ? 'mesmo tamanho do original'
      : 'maior que o original';

  const qualRaw  = r.qualidade_percebida || 'desconhecida';
  const qualClass = 'qb-' + qualRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const card = document.createElement('div');
  card.className = 'resultado-card';
  card.style.setProperty('--fmt-color', fmt.cor);

  card.innerHTML = `
    <div class="card-topo">
      <div class="card-topo-linha">
        <div class="fmt-nome">
          <div class="fmt-dot" style="background:${fmt.cor}"></div>
          ${fmt.nome}
        </div>
        <div class="card-tamanho">${r.tamanho_kb.toFixed(1)} KB</div>
      </div>
      <div class="card-topo-linha card-topo-sub">
        <span class="card-reducao">${reducaoStr}</span>
        ${destaque ? `<span class="winner-badge">${destaque}</span>` : ''}
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
    // Chart.js precisa de resize após ficar visível
    if (_charts[alvo]) _charts[alvo].resize();
  });
});

// ─── Chart.js ────────────────────────────────────────────────────────────────
function obterCoresTema() {
  const tema = document.documentElement.getAttribute('data-theme');
  const dark = tema !== 'light';
  return {
    texto:  dark ? '#eceaf5' : '#1c1830',
    muted:  dark ? '#9896a8' : '#5a5875',
    grid:   dark ? 'rgba(236,234,245,.08)' : 'rgba(28,24,72,.08)',
    fundo:  dark ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0)',
  };
}

function destruirGraficos() {
  for (const id of Object.keys(_charts)) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }
}

function criarGraficos(r) {
  destruirGraficos();

  const cores  = obterCoresTema();
  const labels = ['JPEG', 'PNG', 'WebP'];
  const bgFmts = ['#e8593c', '#3b8bd4', '#e9a227'];
  const bgAlfa = bgFmts.map(c => c + 'cc'); // 80% opaco

  // ── Tamanho (barras) ────────────────────────────────────────────────────
  _charts.tamanho = new Chart(document.getElementById('chart-tamanho'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tamanho (KB)',
        data: [r.jpeg?.tamanho_kb, r.png?.tamanho_kb, r.webp?.tamanho_kb],
        backgroundColor: bgAlfa,
        borderColor: bgFmts,
        borderWidth: 1.5,
        borderRadius: 3,
      }],
    },
    options: opcoesBarras(cores, 'Tamanho (KB)'),
  });

  // ── Qualidade PSNR (barras) ─────────────────────────────────────────────
  _charts.qualidade = new Chart(document.getElementById('chart-qualidade'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'PSNR (dB)',
          data: [r.jpeg?.psnr_db, r.png?.psnr_db, r.webp?.psnr_db],
          backgroundColor: bgAlfa,
          borderColor: bgFmts,
          borderWidth: 1.5,
          borderRadius: 3,
          yAxisID: 'y',
        },
        {
          label: 'SSIM',
          data: [r.jpeg?.ssim, r.png?.ssim, r.webp?.ssim],
          backgroundColor: ['#e8593c33', '#3b8bd433', '#e9a22733'],
          borderColor: bgFmts,
          borderWidth: 1.5,
          borderRadius: 3,
          yAxisID: 'y2',
          type: 'bar',
        },
      ],
    },
    options: {
      ...opcoesBarras(cores, 'Qualidade'),
      scales: {
        x: escalaX(cores),
        y:  { ...escalaY(cores, 'PSNR (dB)'), position: 'left' },
        y2: { ...escalaY(cores, 'SSIM (0–1)'), position: 'right', max: 1.05, grid: { display: false } },
      },
    },
  });

  // ── Tempo (barras) ──────────────────────────────────────────────────────
  _charts.tempo = new Chart(document.getElementById('chart-tempo'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tempo (ms)',
        data: [r.jpeg?.tempo_ms, r.png?.tempo_ms, r.webp?.tempo_ms],
        backgroundColor: bgAlfa,
        borderColor: bgFmts,
        borderWidth: 1.5,
        borderRadius: 3,
      }],
    },
    options: opcoesBarras(cores, 'Tempo de compressão (ms)'),
  });

  // ── Radar de resumo ─────────────────────────────────────────────────────
  const catLabels = ['Qualidade PSNR', 'Fidelidade SSIM', 'Compressão', 'Velocidade'];
  const maxPsnr = Math.max(r.jpeg?.psnr_db ?? 0, r.png?.psnr_db ?? 0, r.webp?.psnr_db ?? 0) || 1;
  const maxSsim = Math.max(r.jpeg?.ssim ?? 0, r.png?.ssim ?? 0, r.webp?.ssim ?? 0) || 1;
  const maxTaxa = Math.max(r.jpeg?.taxa_compressao ?? 0, r.png?.taxa_compressao ?? 0, r.webp?.taxa_compressao ?? 0) || 1;
  const maxTempo = Math.max(r.jpeg?.tempo_ms ?? 0, r.png?.tempo_ms ?? 0, r.webp?.tempo_ms ?? 0) || 1;

  function normalizar(fmt) {
    const m = r[fmt];
    if (!m) return [0, 0, 0, 0];
    return [
      (m.psnr_db ?? 0) / maxPsnr,
      (m.ssim ?? 0) / maxSsim,
      m.taxa_compressao / maxTaxa,
      1 - m.tempo_ms / maxTempo,
    ];
  }

  _charts.radar = new Chart(document.getElementById('chart-radar'), {
    type: 'radar',
    data: {
      labels: catLabels,
      datasets: [
        {
          label: 'JPEG',
          data: normalizar('jpeg'),
          backgroundColor: '#e8593c22',
          borderColor: '#e8593c',
          borderWidth: 2,
          pointBackgroundColor: '#e8593c',
          pointRadius: 4,
        },
        {
          label: 'PNG',
          data: normalizar('png'),
          backgroundColor: '#3b8bd422',
          borderColor: '#3b8bd4',
          borderWidth: 2,
          pointBackgroundColor: '#3b8bd4',
          pointRadius: 4,
        },
        {
          label: 'WebP',
          data: normalizar('webp'),
          backgroundColor: '#e9a22722',
          borderColor: '#e9a227',
          borderWidth: 2,
          pointBackgroundColor: '#e9a227',
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: cores.texto, font: { size: 12 }, boxWidth: 12 },
        },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${(ctx.raw * 100).toFixed(0)}%` } },
      },
      scales: {
        r: {
          min: 0,
          max: 1,
          ticks: { display: false, stepSize: 0.25 },
          grid: { color: cores.grid },
          angleLines: { color: cores.grid },
          pointLabels: { color: cores.muted, font: { size: 11 } },
        },
      },
    },
  });
}

// helpers Chart.js
function escalaX(cores) {
  return {
    ticks: { color: cores.muted, font: { size: 12 } },
    grid:  { display: false },
    border: { color: cores.grid },
  };
}

function escalaY(cores, titulo) {
  return {
    ticks: { color: cores.muted, font: { size: 11 } },
    grid:  { color: cores.grid },
    border: { color: cores.grid },
    title: { display: !!titulo, text: titulo, color: cores.muted, font: { size: 11 } },
  };
}

function opcoesBarras(cores, titulo) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: !!titulo,
        text: titulo,
        color: cores.texto,
        font: { size: 13, weight: '600' },
        padding: { bottom: 10 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: escalaX(cores),
      y: escalaY(cores, ''),
    },
  };
}

// ─── slider before/after ─────────────────────────────────────────────────────
let _sliderResultados = null;
let _sliderFmt = 'jpeg';
let _sliderArrastando = false;

function inicializarSlider(resultados) {
  _sliderResultados = resultados;
  _sliderFmt = 'jpeg';

  if (originalDataUrl) iaBefore.src = originalDataUrl;

  mudarFormatoSlider('jpeg');
  moverSlider(50);

  // remove listeners antigos para não acumular em re-comparações
  iaWrapper.removeEventListener('mousedown', iniciarArraste);
  iaWrapper.removeEventListener('touchstart', iniciarArraste);
  iaWrapper.addEventListener('mousedown', iniciarArraste);
  iaWrapper.addEventListener('touchstart', iniciarArraste, { passive: true });

  // reset seletor de formato
  document.querySelectorAll('.fmt-sel-btn').forEach(btn => {
    btn.classList.toggle('ativo', btn.dataset.fmt === 'jpeg');
  });
}

function iniciarArraste(e) {
  _sliderArrastando = true;
  moverPorEvento(e); // posiciona imediatamente no clique
  window.addEventListener('mousemove', moverPorEvento);
  window.addEventListener('touchmove', moverPorEvento, { passive: true });
  window.addEventListener('mouseup',  pararArraste);
  window.addEventListener('touchend', pararArraste);
}

function pararArraste() {
  _sliderArrastando = false;
  window.removeEventListener('mousemove', moverPorEvento);
  window.removeEventListener('touchmove', moverPorEvento);
  window.removeEventListener('mouseup',  pararArraste);
  window.removeEventListener('touchend', pararArraste);
}

function moverPorEvento(e) {
  if (!_sliderArrastando) return;
  const rect = iaWrapper.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  moverSlider(pct);
}

function moverSlider(pct) {
  const pctDir = 100 - pct;
  iaBeforeClip.style.clipPath = `inset(0 ${pctDir.toFixed(1)}% 0 0)`;
  iaDivider.style.left = `${pct.toFixed(1)}%`;
}

function mudarFormatoSlider(fmt) {
  _sliderFmt = fmt;
  if (!_sliderResultados || !_sliderResultados[fmt]) return;
  iaAfter.src = _sliderResultados[fmt].imagem_base64;
  iaLabelR.textContent = fmt.toUpperCase();
}

// seletor de formato do slider
document.querySelectorAll('.fmt-sel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt-sel-btn').forEach(b => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    mudarFormatoSlider(btn.dataset.fmt);
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
