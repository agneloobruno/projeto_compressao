"""
Módulo de compressão de imagens.
Responsável por comprimir a imagem nos formatos JPEG, PNG e WebP
e retornar os resultados com metadados para comparação.

Autor: Breno
"""

import io
import time

from PIL import Image


class Compressor:
    """Comprime uma imagem PIL nos formatos JPEG, PNG e WebP.

    Cada método de compressão retorna um dicionário padronizado com
    a imagem resultante, tamanhos, taxa de compressão e tempo gasto.
    A imagem original nunca é modificada — sempre trabalhamos com cópias.
    """

    def __init__(self, imagem: Image.Image):
        """Inicializa o compressor com a imagem a ser processada.

        Args:
            imagem: Objeto PIL Image em qualquer modo. Será convertido
                    para RGB internamente, porque JPEG não suporta alpha
                    e isso evita problemas em todos os formatos.
        """
        # converter para RGB logo de cara evita dor de cabeça depois
        # JPEG rejeita RGBA, PNG com alpha causa problemas no cálculo de PSNR
        self.imagem_rgb = imagem.convert("RGB")
        self._bytes_originais = self._medir_bytes_originais()

    def _medir_bytes_originais(self) -> int:
        """Mede o tamanho da imagem sem compressão usando BMP como referência.

        Returns:
            Tamanho em bytes da imagem no formato BMP (sem compressão).

        Nota:
            Usamos BMP porque é o formato sem compressão mais direto do Pillow.
            TIFF sem compressão também serviria, mas BMP é mais simples.
            Isso nos dá uma base justa para calcular a taxa de compressão.
        """
        buffer = io.BytesIO()
        self.imagem_rgb.save(buffer, format="BMP")
        return buffer.tell()

    def comprimir_jpeg(self, qualidade: int = 85) -> dict:
        """Comprime a imagem no formato JPEG.

        JPEG é lossy por natureza — a qualidade controla o trade-off entre
        tamanho e fidelidade visual. Qualidade 85 é um bom ponto de partida
        para a maioria das fotos.

        Args:
            qualidade: Valor entre 1 (pior qualidade, menor arquivo) e
                       95 (melhor qualidade, maior arquivo). Valores acima
                       de 95 raramente valem o custo em tamanho.

        Returns:
            Dicionário com:
                - formato (str): "JPEG"
                - imagem (Image.Image): imagem reconstruída após compressão
                - bytes_originais (int): tamanho do BMP de referência
                - bytes_comprimidos (int): tamanho do arquivo JPEG gerado
                - taxa_compressao (float): razão bytes_originais / bytes_comprimidos
                - tempo_ms (float): tempo de compressão em milissegundos
                - parametros (dict): parâmetros usados

        Raises:
            ValueError: Se qualidade estiver fora do intervalo [1, 95].
        """
        if not (1 <= qualidade <= 95):
            raise ValueError(f"Qualidade JPEG deve estar entre 1 e 95, recebido: {qualidade}")

        buffer = io.BytesIO()

        inicio = time.perf_counter()
        self.imagem_rgb.save(buffer, format="JPEG", quality=qualidade, optimize=True)
        fim = time.perf_counter()

        tempo_ms = (fim - inicio) * 1000
        bytes_comprimidos = buffer.tell()

        # reconstruir a imagem a partir do buffer para ter o resultado real
        # (com os artefatos de compressão incluídos — é isso que queremos medir)
        buffer.seek(0)
        imagem_reconstruida = Image.open(buffer).copy()

        return {
            "formato": "JPEG",
            "imagem": imagem_reconstruida,
            "bytes_originais": self._bytes_originais,
            "bytes_comprimidos": bytes_comprimidos,
            "taxa_compressao": self._bytes_originais / bytes_comprimidos,
            "tempo_ms": round(tempo_ms, 3),
            "parametros": {"qualidade": qualidade, "optimize": True},
        }

    def comprimir_png(self, nivel_compressao: int = 6) -> dict:
        """Comprime a imagem no formato PNG (lossless).

        PNG é sempre lossless — a imagem reconstruída é idêntica ao original.
        O nível de compressão controla apenas a velocidade vs. tamanho do arquivo,
        não a qualidade visual.

        Args:
            nivel_compressao: Valor entre 0 (sem compressão, mais rápido) e
                              9 (máxima compressão, mais lento). O padrão 6
                              é o mesmo usado pelo zlib e funciona bem na prática.

        Returns:
            Dicionário com os mesmos campos de comprimir_jpeg(), mas sem
            artefatos de compressão na imagem reconstruída.

        Raises:
            ValueError: Se nivel_compressao estiver fora de [0, 9].
        """
        if not (0 <= nivel_compressao <= 9):
            raise ValueError(f"Nível de compressão PNG deve estar entre 0 e 9, recebido: {nivel_compressao}")

        buffer = io.BytesIO()

        inicio = time.perf_counter()
        self.imagem_rgb.save(buffer, format="PNG", compress_level=nivel_compressao)
        fim = time.perf_counter()

        tempo_ms = (fim - inicio) * 1000
        bytes_comprimidos = buffer.tell()

        buffer.seek(0)
        imagem_reconstruida = Image.open(buffer).copy()

        # TODO: considerar adicionar suporte a PNG com palette (modo P) no futuro
        # para imagens com poucos tons, a redução de tamanho seria significativa

        return {
            "formato": "PNG",
            "imagem": imagem_reconstruida,
            "bytes_originais": self._bytes_originais,
            "bytes_comprimidos": bytes_comprimidos,
            "taxa_compressao": self._bytes_originais / bytes_comprimidos,
            "tempo_ms": round(tempo_ms, 3),
            "parametros": {"nivel_compressao": nivel_compressao},
        }

    def comprimir_webp(self, qualidade: int = 85, lossless: bool = False) -> dict:
        """Comprime a imagem no formato WebP.

        WebP suporta tanto compressão lossy quanto lossless, o que o torna
        interessante para comparação. No modo lossy, costuma ser menor que
        JPEG com qualidade visual similar. No modo lossless, geralmente
        supera PNG em tamanho.

        Args:
            qualidade: Qualidade da compressão lossy (1-100). Ignorado quando
                       lossless=True.
            lossless: Se True, usa compressão lossless (sem perda de qualidade).
                      Se False, usa compressão lossy com a qualidade especificada.

        Returns:
            Dicionário padrão de resultados de compressão.

        Raises:
            ValueError: Se qualidade estiver fora de [1, 100].
        """
        if not (1 <= qualidade <= 100):
            raise ValueError(f"Qualidade WebP deve estar entre 1 e 100, recebido: {qualidade}")

        buffer = io.BytesIO()

        # o parâmetro 'method' controla o esforço de compressão (0-6)
        # usamos method=4 como compromisso razoável entre velocidade e tamanho
        inicio = time.perf_counter()
        self.imagem_rgb.save(
            buffer,
            format="WEBP",
            quality=qualidade,
            lossless=lossless,
            method=4,
        )
        fim = time.perf_counter()

        tempo_ms = (fim - inicio) * 1000
        bytes_comprimidos = buffer.tell()

        buffer.seek(0)
        imagem_reconstruida = Image.open(buffer).copy()

        modo = "lossless" if lossless else "lossy"
        return {
            "formato": "WebP",
            "imagem": imagem_reconstruida,
            "bytes_originais": self._bytes_originais,
            "bytes_comprimidos": bytes_comprimidos,
            "taxa_compressao": self._bytes_originais / bytes_comprimidos,
            "tempo_ms": round(tempo_ms, 3),
            "parametros": {"qualidade": qualidade, "lossless": lossless, "modo": modo},
        }

    def comprimir_todos(self, qualidade: int = 85, nivel_png: int = 6, webp_lossless: bool = False) -> dict:
        """Executa a compressão nos três formatos e retorna os resultados consolidados.

        Args:
            qualidade: Qualidade para JPEG e WebP (1-95 para JPEG, 1-100 para WebP).
                       O valor é aplicado a ambos para uma comparação justa.
            nivel_png: Nível de compressão para PNG (0-9).
            webp_lossless: Se True, comprime WebP em modo lossless.

        Returns:
            Dicionário com as chaves "jpeg", "png" e "webp", cada uma contendo
            o dicionário de resultado do respectivo formato.
        """
        # FIXME: no futuro poderia paralelizar os três com threading, mas
        # por enquanto a sequencial é suficiente e mais simples de depurar
        resultado_jpeg = self.comprimir_jpeg(qualidade=min(qualidade, 95))
        resultado_png = self.comprimir_png(nivel_compressao=nivel_png)
        resultado_webp = self.comprimir_webp(qualidade=qualidade, lossless=webp_lossless)

        return {
            "jpeg": resultado_jpeg,
            "png": resultado_png,
            "webp": resultado_webp,
        }
