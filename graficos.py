"""
Geração de gráficos comparativos como imagens base64.
Fundo sempre branco/claro — legível colado em qualquer tema da interface.

Autor: Breno
"""

# matplotlib sem display — obrigatório em servidor
import matplotlib
matplotlib.use('Agg')

import base64
import io

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np

# paleta dos formatos
_CORES = {
    "JPEG": "#E8593C",
    "PNG":  "#3B8BD4",
    "WebP": "#E9A227",
}
_ORDEM = ["JPEG", "PNG", "WebP"]

# cores dos gráficos — claro, legível, profissional
_BG_FIG    = "#ffffff"     # fundo da figure
_BG_AXES   = "#f7f6fc"     # fundo de cada eixo (levemente lilás)
_COR_TEXTO = "#2a2840"     # títulos e labels
_COR_MUTED = "#6b6882"     # rótulos secundários
_COR_GRID  = "#e4e1f0"     # linhas de grade
_COR_SPINE = "#cdc9e0"     # bordas dos eixos


def _aplicar_estilo():
    """Configura rcParams para todas as figures desta sessão."""
    plt.rcParams.update({
        "text.color":        _COR_TEXTO,
        "axes.labelcolor":   _COR_MUTED,
        "xtick.color":       _COR_MUTED,
        "ytick.color":       _COR_MUTED,
        "axes.edgecolor":    _COR_SPINE,
        "axes.linewidth":    0.8,
        "figure.facecolor":  _BG_FIG,
        "axes.facecolor":    _BG_AXES,
        "grid.color":        _COR_GRID,
        "grid.linewidth":    0.8,
        "font.family":       "DejaVu Sans",
        "font.size":         10,
    })


def _figura_para_base64(fig) -> str:
    """Salva a figure com fundo branco e retorna string base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight",
                facecolor=_BG_FIG, dpi=110)
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return f"data:image/png;base64,{encoded}"


def _estilo_eixo(ax, titulo: str = "", ylabel: str = ""):
    """Aplica estilo limpo e consistente em um eixo cartesiano."""
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(_COR_SPINE)
    ax.spines["bottom"].set_color(_COR_SPINE)
    ax.yaxis.grid(True, linestyle="--", color=_COR_GRID, linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    ax.set_facecolor(_BG_AXES)
    if titulo:
        ax.set_title(titulo, fontsize=11, color=_COR_TEXTO, pad=8, fontweight="semibold")
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9, color=_COR_MUTED)


def _extrair(metricas: list[dict], campo: str):
    """Retorna (formatos, valores, cores) na ordem canônica JPEG→PNG→WebP."""
    idx = {m["formato"]: m for m in metricas}
    formatos, valores, cores = [], [], []
    for fmt in _ORDEM:
        if fmt in idx:
            val = idx[fmt].get(campo) or 0
            formatos.append(fmt)
            valores.append(float(val))
            cores.append(_CORES[fmt])
    return formatos, valores, cores


def _rotulos(ax, barras, valores, fmt_str="{:.1f}"):
    """Escreve valor acima de cada barra."""
    maximo = max(valores) if valores else 1
    for barra, val in zip(barras, valores):
        ax.text(
            barra.get_x() + barra.get_width() / 2,
            barra.get_height() + maximo * 0.015,
            fmt_str.format(val),
            ha="center", va="bottom",
            fontsize=8.5, fontweight="bold", color=_COR_TEXTO,
        )


def grafico_tamanho(metricas: list[dict]) -> str:
    """Gráfico de barras: tamanho dos arquivos em KB."""
    _aplicar_estilo()
    formatos, valores, cores = _extrair(metricas, "tamanho_kb")

    fig, ax = plt.subplots(figsize=(5, 3.5), facecolor=_BG_FIG)
    barras = ax.bar(formatos, valores, color=cores, width=0.52, zorder=3,
                    edgecolor="white", linewidth=0.5)
    _rotulos(ax, barras, valores, "{:.1f} KB")
    _estilo_eixo(ax, titulo="Tamanho do arquivo (KB)", ylabel="KB")
    ax.set_ylim(0, max(valores) * 1.28 if valores else 1)
    fig.tight_layout()
    return _figura_para_base64(fig)


def grafico_qualidade(metricas: list[dict]) -> str:
    """Barras duplas: PSNR (eixo esquerdo) e SSIM (eixo direito)."""
    _aplicar_estilo()
    formatos, psnr_vals, _ = _extrair(metricas, "psnr_db")
    _, ssim_vals, _         = _extrair(metricas, "ssim")

    x    = np.arange(len(formatos))
    larg = 0.35

    fig, ax1 = plt.subplots(figsize=(5, 3.5), facecolor=_BG_FIG)
    ax2 = ax1.twinx()

    COR_PSNR = "#4a7fc1"
    COR_SSIM = "#c27c3a"

    ax1.bar(x - larg / 2, psnr_vals, larg, color=COR_PSNR, alpha=0.85,
            zorder=3, edgecolor="white", linewidth=0.5)
    ax2.bar(x + larg / 2, ssim_vals, larg, color=COR_SSIM, alpha=0.85,
            zorder=3, edgecolor="white", linewidth=0.5)

    ax1.set_ylabel("PSNR (dB)",  color=COR_PSNR, fontsize=9)
    ax2.set_ylabel("SSIM (0–1)", color=COR_SSIM, fontsize=9)
    ax1.tick_params(axis="y", labelcolor=COR_PSNR)
    ax2.tick_params(axis="y", labelcolor=COR_SSIM)
    ax2.set_ylim(0, 1.15)

    ax1.set_xticks(x)
    ax1.set_xticklabels(formatos, color=_COR_MUTED)
    _estilo_eixo(ax1, titulo="Métricas de qualidade")

    patches = [
        mpatches.Patch(color=COR_PSNR, label="PSNR (dB)"),
        mpatches.Patch(color=COR_SSIM, label="SSIM"),
    ]
    ax1.legend(handles=patches, loc="lower right", fontsize=8,
               framealpha=0.9, edgecolor=_COR_SPINE)
    fig.tight_layout()
    return _figura_para_base64(fig)


def grafico_tempo(metricas: list[dict]) -> str:
    """Gráfico de barras: tempo de compressão em ms."""
    _aplicar_estilo()
    formatos, valores, cores = _extrair(metricas, "tempo_ms")

    fig, ax = plt.subplots(figsize=(5, 3.5), facecolor=_BG_FIG)
    barras = ax.bar(formatos, valores, color=cores, width=0.52, zorder=3,
                    edgecolor="white", linewidth=0.5)
    _rotulos(ax, barras, valores, "{:.1f} ms")
    _estilo_eixo(ax, titulo="Tempo de compressão (ms)", ylabel="ms")
    ax.set_ylim(0, max(valores) * 1.28 if valores else 1)
    fig.tight_layout()
    return _figura_para_base64(fig)


def _radar(ax, metricas: list[dict]) -> None:
    """Spider chart de resumo normalizado 0–1."""
    categorias = ["Qualidade\n(PSNR)", "Fidelidade\n(SSIM)", "Compressão\n(taxa)", "Velocidade"]
    n = len(categorias)
    angulos = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angulos += angulos[:1]

    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angulos[:-1])
    ax.set_xticklabels(categorias, fontsize=7.5, color=_COR_TEXTO)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels([], fontsize=6)
    ax.set_facecolor(_BG_AXES)

    # grid do radar em cor visível
    ax.yaxis.grid(True, color=_COR_GRID, linewidth=0.8)
    ax.xaxis.grid(True, color=_COR_GRID, linewidth=0.8)
    for spine in ax.spines.values():
        spine.set_edgecolor(_COR_SPINE)

    idx      = {m["formato"]: m for m in metricas}
    max_psnr = max((m["psnr_db"] or 0) for m in metricas) or 1
    max_ssim = max((m["ssim"] or 0) for m in metricas) or 1
    max_taxa = max(m["taxa_compressao"] for m in metricas) or 1
    max_tempo = max(m["tempo_ms"] for m in metricas) or 1

    for fmt in _ORDEM:
        if fmt not in idx:
            continue
        m = idx[fmt]
        vals = [
            (m["psnr_db"] or 0) / max_psnr,
            (m["ssim"] or 0) / max_ssim,
            m["taxa_compressao"] / max_taxa,
            1 - (m["tempo_ms"] / max_tempo),
        ]
        vals += vals[:1]
        ax.plot(angulos, vals, color=_CORES[fmt], linewidth=2, label=fmt)
        ax.fill(angulos, vals, color=_CORES[fmt], alpha=0.14)

    ax.legend(loc="upper right", bbox_to_anchor=(1.45, 1.12),
              fontsize=8, framealpha=0.9, edgecolor=_COR_SPINE)


def painel_completo(metricas: list[dict]) -> str:
    """Painel 2×2: tamanho, PSNR, tempo e radar de resumo."""
    _aplicar_estilo()
    fig = plt.figure(figsize=(10, 7), facecolor=_BG_FIG)

    # tamanho
    ax1 = fig.add_subplot(2, 2, 1)
    fmts, vals, cores = _extrair(metricas, "tamanho_kb")
    b1 = ax1.bar(fmts, vals, color=cores, width=0.52, zorder=3, edgecolor="white", linewidth=0.5)
    _rotulos(ax1, b1, vals)
    _estilo_eixo(ax1, titulo="Tamanho (KB)")
    ax1.set_ylim(0, max(vals) * 1.3 if vals else 1)

    # qualidade PSNR
    ax2 = fig.add_subplot(2, 2, 2)
    _, psnr_vals, psnr_cores = _extrair(metricas, "psnr_db")
    b2 = ax2.bar(fmts, psnr_vals, color=psnr_cores, width=0.52, zorder=3,
                 edgecolor="white", linewidth=0.5)
    _rotulos(ax2, b2, psnr_vals, "{:.1f}")
    _estilo_eixo(ax2, titulo="Qualidade PSNR (dB)")
    ax2.set_ylim(0, max(psnr_vals) * 1.22 if psnr_vals else 50)

    # tempo
    ax3 = fig.add_subplot(2, 2, 3)
    _, tempo_vals, tempo_cores = _extrair(metricas, "tempo_ms")
    b3 = ax3.bar(fmts, tempo_vals, color=tempo_cores, width=0.52, zorder=3,
                 edgecolor="white", linewidth=0.5)
    _rotulos(ax3, b3, tempo_vals)
    _estilo_eixo(ax3, titulo="Tempo (ms)")
    ax3.set_ylim(0, max(tempo_vals) * 1.3 if tempo_vals else 1)

    # radar
    ax4 = fig.add_subplot(2, 2, 4, projection="polar")
    _radar(ax4, metricas)
    ax4.set_title("Resumo geral", fontsize=10, color=_COR_TEXTO, pad=15)

    fig.suptitle("Comparação de compressão de imagens",
                 fontsize=12, fontweight="bold", color=_COR_TEXTO, y=1.01)
    fig.tight_layout()
    return _figura_para_base64(fig)
