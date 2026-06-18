"""
Geração de gráficos comparativos como imagens base64.
Cada função retorna uma string "data:image/png;base64,..." pronta
para embutir em <img src="..."> no frontend.

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

# paleta consistente em todos os gráficos
_CORES = {
    "JPEG": "#E8593C",
    "PNG":  "#3B8BD4",
    "WebP": "#E9A227",
}
_ORDEM = ["JPEG", "PNG", "WebP"]


def _figura_para_base64(fig) -> str:
    """Converte uma Figure matplotlib em string base64 PNG.

    Fecha a figure depois de converter pra não vazar memória.
    """
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", transparent=True, dpi=110)
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return f"data:image/png;base64,{encoded}"


def _estilo_eixo(ax):
    """Remove bordas desnecessárias e adiciona grid horizontal suave."""
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.yaxis.grid(True, alpha=0.3, linestyle="--")
    ax.set_axisbelow(True)


def _extrair(metricas: list[dict], campo: str) -> tuple[list[str], list[float], list[str]]:
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


def _rotulos_em_cima(ax, barras, valores, fmt_str="{:.1f}"):
    """Escreve o valor em cima de cada barra."""
    maximo = max(valores) if valores else 1
    for barra, val in zip(barras, valores):
        ax.text(
            barra.get_x() + barra.get_width() / 2,
            barra.get_height() + maximo * 0.015,
            fmt_str.format(val),
            ha="center", va="bottom", fontsize=9, fontweight="bold",
            color="#333",
        )


def grafico_tamanho(metricas: list[dict]) -> str:
    """Gráfico de barras: tamanho dos arquivos comprimidos em KB.

    Args:
        metricas: Lista de dicts retornados por calcular_metricas_completas().

    Returns:
        String base64 PNG pronta para usar em <img src="...">.
    """
    formatos, valores, cores = _extrair(metricas, "tamanho_kb")

    fig, ax = plt.subplots(figsize=(5, 3.5))
    barras = ax.bar(formatos, valores, color=cores, width=0.5, zorder=3)
    _rotulos_em_cima(ax, barras, valores, "{:.1f} KB")
    _estilo_eixo(ax)
    ax.set_title("Tamanho do arquivo (KB)", fontsize=11, pad=8)
    ax.set_ylabel("KB")
    ax.set_ylim(0, max(valores) * 1.25 if valores else 1)
    fig.tight_layout()
    return _figura_para_base64(fig)


def grafico_qualidade(metricas: list[dict]) -> str:
    """Gráfico de barras duplas: PSNR (eixo esq) e SSIM (eixo dir).

    Dois eixos Y porque as escalas são muito diferentes — plotar junto
    distorceria a leitura.

    Args:
        metricas: Lista de dicts com campos "psnr_db" e "ssim".

    Returns:
        String base64 PNG.
    """
    formatos, psnr_vals, _ = _extrair(metricas, "psnr_db")
    _, ssim_vals, _ = _extrair(metricas, "ssim")

    x = np.arange(len(formatos))
    larg = 0.35

    fig, ax1 = plt.subplots(figsize=(5, 3.5))
    ax2 = ax1.twinx()

    b1 = ax1.bar(x - larg / 2, psnr_vals, larg, color="#5B8DB8", alpha=0.85, zorder=3, label="PSNR (dB)")
    b2 = ax2.bar(x + larg / 2, ssim_vals, larg, color="#E8A87C", alpha=0.85, zorder=3, label="SSIM")

    ax1.set_ylabel("PSNR (dB)", color="#5B8DB8")
    ax2.set_ylabel("SSIM (0–1)", color="#E8A87C")
    ax1.tick_params(axis="y", labelcolor="#5B8DB8")
    ax2.tick_params(axis="y", labelcolor="#E8A87C")
    ax2.set_ylim(0, 1.15)

    ax1.set_xticks(x)
    ax1.set_xticklabels(formatos)
    ax1.set_title("Métricas de qualidade", fontsize=11, pad=8)
    ax1.spines["top"].set_visible(False)
    ax1.yaxis.grid(True, alpha=0.3, linestyle="--")
    ax1.set_axisbelow(True)

    patches = [
        mpatches.Patch(color="#5B8DB8", label="PSNR (dB)"),
        mpatches.Patch(color="#E8A87C", label="SSIM"),
    ]
    ax1.legend(handles=patches, loc="lower right", fontsize=8)
    fig.tight_layout()
    return _figura_para_base64(fig)


def grafico_tempo(metricas: list[dict]) -> str:
    """Gráfico de barras: tempo de compressão em milissegundos.

    Args:
        metricas: Lista de dicts com campo "tempo_ms".

    Returns:
        String base64 PNG.
    """
    formatos, valores, cores = _extrair(metricas, "tempo_ms")

    fig, ax = plt.subplots(figsize=(5, 3.5))
    barras = ax.bar(formatos, valores, color=cores, width=0.5, zorder=3)
    _rotulos_em_cima(ax, barras, valores, "{:.1f} ms")
    _estilo_eixo(ax)
    ax.set_title("Tempo de compressão (ms)", fontsize=11, pad=8)
    ax.set_ylabel("ms")
    ax.set_ylim(0, max(valores) * 1.25 if valores else 1)
    fig.tight_layout()
    return _figura_para_base64(fig)


def _radar(ax, metricas: list[dict]) -> None:
    """Radar chart de resumo — normaliza métricas para escala 0-1."""
    categorias = ["Qualidade\n(PSNR)", "Fidelidade\n(SSIM)", "Compressão\n(taxa)", "Velocidade"]
    n = len(categorias)
    angulos = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angulos += angulos[:1]

    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angulos[:-1])
    ax.set_xticklabels(categorias, fontsize=7)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels(["", "", "", ""], fontsize=6)

    idx = {m["formato"]: m for m in metricas}
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
        ax.plot(angulos, vals, color=_CORES[fmt], linewidth=1.5, label=fmt)
        ax.fill(angulos, vals, color=_CORES[fmt], alpha=0.12)

    ax.legend(loc="upper right", bbox_to_anchor=(1.4, 1.1), fontsize=8)


def painel_completo(metricas: list[dict]) -> str:
    """Painel 2×2 com os três gráficos + radar de resumo.

    Args:
        metricas: Lista de dicts retornados por calcular_metricas_completas().

    Returns:
        String base64 PNG do painel completo (figsize 10×7).
    """
    fig = plt.figure(figsize=(10, 7))
    fig.patch.set_alpha(0)

    # tamanho
    ax1 = fig.add_subplot(2, 2, 1)
    fmts, vals, cores = _extrair(metricas, "tamanho_kb")
    barras = ax1.bar(fmts, vals, color=cores, width=0.5, zorder=3)
    _rotulos_em_cima(ax1, barras, vals)
    _estilo_eixo(ax1)
    ax1.set_title("Tamanho (KB)", fontsize=10)
    ax1.set_ylim(0, max(vals) * 1.3 if vals else 1)

    # qualidade PSNR
    ax2 = fig.add_subplot(2, 2, 2)
    _, psnr_vals, psnr_cores = _extrair(metricas, "psnr_db")
    barras2 = ax2.bar(fmts, psnr_vals, color=psnr_cores, width=0.5, zorder=3)
    _rotulos_em_cima(ax2, barras2, psnr_vals, "{:.1f}")
    _estilo_eixo(ax2)
    ax2.set_title("Qualidade PSNR (dB)", fontsize=10)
    ax2.set_ylim(0, max(psnr_vals) * 1.2 if psnr_vals else 50)

    # tempo
    ax3 = fig.add_subplot(2, 2, 3)
    _, tempo_vals, tempo_cores = _extrair(metricas, "tempo_ms")
    barras3 = ax3.bar(fmts, tempo_vals, color=tempo_cores, width=0.5, zorder=3)
    _rotulos_em_cima(ax3, barras3, tempo_vals)
    _estilo_eixo(ax3)
    ax3.set_title("Tempo (ms)", fontsize=10)
    ax3.set_ylim(0, max(tempo_vals) * 1.3 if tempo_vals else 1)

    # radar
    ax4 = fig.add_subplot(2, 2, 4, projection="polar")
    _radar(ax4, metricas)
    ax4.set_title("Resumo geral", fontsize=10, pad=15)

    fig.suptitle("Comparação de compressão de imagens", fontsize=12, fontweight="bold", y=1.01)
    fig.tight_layout()
    return _figura_para_base64(fig)
