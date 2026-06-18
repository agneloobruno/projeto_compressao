"""
Módulo de métricas de qualidade para comparação de compressão.
Calcula PSNR, SSIM e outras métricas entre a imagem original e
a imagem reconstruída após compressão.

Autor: Breno
"""

import numpy as np
from PIL import Image

# tentamos importar o scikit-image, mas se não tiver instalado o app
# ainda funciona — só não vai mostrar PSNR e SSIM
try:
    from skimage.metrics import peak_signal_noise_ratio, structural_similarity
    SKIMAGE_DISPONIVEL = True
except ImportError:
    SKIMAGE_DISPONIVEL = False
    print(
        "[aviso] scikit-image não encontrado. "
        "As métricas PSNR e SSIM não estarão disponíveis.\n"
        "Para instalar: pip install scikit-image"
    )


def _sanitizar(valor: float, fallback: float = 0.0) -> float:
    """Garante que o valor é finito antes de usar nos gráficos.

    PNG lossless e WebP lossless retornam inf no PSNR porque as imagens
    são idênticas — isso quebra os limites dos eixos do matplotlib.
    """
    return float(valor) if np.isfinite(valor) else fallback


def _para_array(imagem: Image.Image) -> np.ndarray:
    """Converte uma imagem PIL para array numpy uint8.

    Args:
        imagem: Objeto PIL Image em qualquer modo.

    Returns:
        Array numpy de shape (H, W, 3) com dtype uint8.
    """
    # forçar uint8 explicitamente — arrays com dtype diferente causam
    # comportamento estranho no skimage e no matplotlib
    return np.array(imagem.convert("RGB"), dtype=np.uint8)


def calcular_psnr(original: Image.Image, comprimida: Image.Image) -> float | None:
    """Calcula o PSNR entre a imagem original e a imagem comprimida.

    PSNR (Peak Signal-to-Noise Ratio) é a métrica mais comum na literatura
    de compressão. Mede a razão entre o valor máximo possível do sinal e a
    potência do ruído introduzido pela compressão.

    Interpretação típica:
        - Acima de 40 dB: excelente, dificilmente perceptível ao olho humano
        - 35–40 dB: boa qualidade
        - 30–35 dB: aceitável para uso geral
        - Abaixo de 30 dB: degradação visível

    Args:
        original: Imagem original (referência).
        comprimida: Imagem após compressão e descompressão.

    Returns:
        Valor do PSNR em dB (quanto maior, melhor), ou None se o scikit-image
        não estiver disponível.

    Nota:
        usamos PSNR porque é o mais comum na literatura, mas SSIM captura
        melhor a percepção humana — vale usar os dois juntos para análise completa.
    """
    if not SKIMAGE_DISPONIVEL:
        return None

    arr_original = _para_array(original)
    arr_comprimida = _para_array(comprimida)

    # data_range=255 porque estamos trabalhando com uint8 (0-255)
    psnr = peak_signal_noise_ratio(arr_original, arr_comprimida, data_range=255)

    # cap em 100 dB porque PNG lossless retorna inf e quebra o gráfico
    # 100 dB representa "sem perda perceptível" de forma plausível
    return round(_sanitizar(psnr, fallback=100.0), 4)


def calcular_ssim(original: Image.Image, comprimida: Image.Image) -> float | None:
    """Calcula o SSIM entre a imagem original e a imagem comprimida.

    SSIM (Structural Similarity Index) é uma métrica perceptual que leva em
    conta luminância, contraste e estrutura — coisas que o olho humano percebe
    mas o PSNR ignora. Por isso, às vezes uma imagem com PSNR menor tem SSIM
    maior e parece melhor visualmente.

    Args:
        original: Imagem original (referência).
        comprimida: Imagem após compressão e descompressão.

    Returns:
        Valor do SSIM entre 0 e 1 (quanto mais próximo de 1, melhor),
        ou None se o scikit-image não estiver disponível.

    Raises:
        ValueError: Se as imagens tiverem dimensões diferentes.
    """
    if not SKIMAGE_DISPONIVEL:
        return None

    arr_original = _para_array(original)
    arr_comprimida = _para_array(comprimida)

    if arr_original.shape != arr_comprimida.shape:
        raise ValueError(
            f"As imagens precisam ter o mesmo tamanho. "
            f"Original: {arr_original.shape}, Comprimida: {arr_comprimida.shape}"
        )

    # win_size adaptativo para imagens menores que 7px — o padrão quebraria
    h, w = arr_original.shape[:2]
    win = min(7, h, w)
    if win % 2 == 0:
        win -= 1
    win = max(win, 1)

    # channel_axis=2 porque nosso array é (H, W, C) — o scikit-image precisa
    # saber qual eixo é o de canais para calcular o SSIM colorido corretamente
    ssim = structural_similarity(
        arr_original,
        arr_comprimida,
        channel_axis=2,
        data_range=255,
        win_size=win,
    )
    return round(_sanitizar(float(ssim), fallback=1.0), 6)


def _classificar_qualidade(psnr_db: float | None) -> str:
    """Classifica a qualidade percebida baseada no PSNR.

    Args:
        psnr_db: Valor do PSNR em dB, ou None se não calculado.

    Returns:
        String com a classificação: "excelente", "boa", "aceitável", "ruim"
        ou "desconhecida" se o PSNR não estiver disponível.
    """
    if psnr_db is None:
        return "desconhecida"

    # 100 dB é nosso cap para lossless — sempre vai ser "excelente"
    if psnr_db > 40:
        return "excelente"
    elif psnr_db > 35:
        return "boa"
    elif psnr_db > 30:
        return "aceitável"
    else:
        return "ruim"


def calcular_metricas_completas(original: Image.Image, resultado_compressor: dict) -> dict:
    """Calcula todas as métricas de qualidade para um resultado de compressão.

    Combina as métricas objetivas (PSNR, SSIM) com as métricas de eficiência
    (tamanho, taxa de compressão, tempo) em um único dicionário consolidado.

    Args:
        original: Imagem original antes da compressão.
        resultado_compressor: Dicionário retornado por um dos métodos do
                              Compressor (comprimir_jpeg, comprimir_png, etc.).

    Returns:
        Dicionário com:
            - formato (str): nome do formato de compressão
            - psnr_db (float | None): PSNR em dB
            - ssim (float | None): SSIM entre 0 e 1
            - tamanho_kb (float): tamanho do arquivo comprimido em KB
            - taxa_compressao (float): razão de compressão
            - tempo_ms (float): tempo de compressão em ms
            - qualidade_percebida (str): classificação qualitativa baseada no PSNR

    Example:
        >>> comp = Compressor(img)
        >>> resultado = comp.comprimir_jpeg(qualidade=85)
        >>> metricas = calcular_metricas_completas(img, resultado)
        >>> print(metricas["psnr_db"])
        42.37
    """
    imagem_comprimida = resultado_compressor["imagem"]

    psnr = calcular_psnr(original, imagem_comprimida)
    ssim = calcular_ssim(original, imagem_comprimida)

    tamanho_kb = resultado_compressor["bytes_comprimidos"] / 1024

    return {
        "formato": resultado_compressor["formato"],
        "psnr_db": psnr,
        "ssim": ssim,
        "tamanho_kb": round(tamanho_kb, 2),
        "taxa_compressao": round(resultado_compressor["taxa_compressao"], 2),
        "tempo_ms": resultado_compressor["tempo_ms"],
        "qualidade_percebida": _classificar_qualidade(psnr),
    }
