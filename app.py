"""
Servidor Flask do comparador de compressão de imagens.
Expõe a API REST e serve o frontend estático.

Autor: Bruno
"""

import base64
import csv
import io
import json
import os
import zipfile
from datetime import datetime

from flask import Flask, jsonify, render_template, request, send_file

import compressor as comp
import graficos
import metricas as met
from PIL import Image

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB max por upload

# guarda o último resultado em memória pra /api/exportar
# não é ideal pra múltiplos usuários simultâneos, mas serve pra uso local/acadêmico
_ultimo_resultado: dict | None = None


# ─── rotas ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    # Railway usa isso pra saber se o container tá vivo
    return jsonify({"status": "ok"})


@app.route("/api/comparar", methods=["POST"])
def comparar():
    global _ultimo_resultado

    # valida que veio uma imagem
    if "imagem" not in request.files:
        return jsonify({"sucesso": False, "erro": "Nenhuma imagem enviada."}), 400

    arquivo = request.files["imagem"]
    if arquivo.filename == "":
        return jsonify({"sucesso": False, "erro": "Nome de arquivo vazio."}), 400

    # lê parâmetros do form (com defaults seguros)
    try:
        qualidade = int(request.form.get("qualidade", 85))
        nivel_png = int(request.form.get("nivel_png", 6))
        webp_lossless = request.form.get("webp_lossless", "false").lower() == "true"
    except ValueError:
        return jsonify({"sucesso": False, "erro": "Parâmetros inválidos."}), 400

    # abre a imagem direto do buffer — sem salvar em disco
    try:
        imagem = Image.open(arquivo.stream)
        imagem.load()  # força a leitura antes do stream fechar
    except Exception as e:
        return jsonify({"sucesso": False, "erro": f"Não foi possível abrir a imagem: {e}"}), 400

    # comprime nos três formatos
    try:
        compressor = comp.Compressor(imagem)
        resultados = compressor.comprimir_todos(
            qualidade=qualidade,
            nivel_png=nivel_png,
            webp_lossless=webp_lossless,
        )
    except Exception as e:
        return jsonify({"sucesso": False, "erro": f"Erro na compressão: {e}"}), 500

    # calcula métricas
    original_rgb = compressor.imagem_rgb
    lista_metricas = []
    for chave in ["jpeg", "png", "webp"]:
        m = met.calcular_metricas_completas(original_rgb, resultados[chave])
        lista_metricas.append(m)

    # converte imagens comprimidas para base64
    mimes = {"jpeg": "jpeg", "png": "png", "webp": "webp"}
    formatos_pil = {"jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}

    resultado_json = {}
    for chave in ["jpeg", "png", "webp"]:
        r = resultados[chave]
        buf = io.BytesIO()
        r["imagem"].save(buf, format=formatos_pil[chave])
        encoded = base64.b64encode(buf.getvalue()).decode()
        imagem_b64 = f"data:image/{mimes[chave]};base64,{encoded}"

        m = next(x for x in lista_metricas if x["formato"].lower() == chave or
                 (chave == "jpeg" and x["formato"] == "JPEG") or
                 (chave == "png" and x["formato"] == "PNG") or
                 (chave == "webp" and x["formato"] == "WebP"))

        resultado_json[chave] = {
            "tamanho_kb": m["tamanho_kb"],
            "taxa_compressao": m["taxa_compressao"],
            "tempo_ms": m["tempo_ms"],
            "psnr_db": m["psnr_db"],
            "ssim": m["ssim"],
            "qualidade_percebida": m["qualidade_percebida"],
            "imagem_base64": imagem_b64,
        }

    # gera gráficos como base64
    try:
        graficos_json = {
            "tamanho":   graficos.grafico_tamanho(lista_metricas),
            "qualidade": graficos.grafico_qualidade(lista_metricas),
            "tempo":     graficos.grafico_tempo(lista_metricas),
            "painel":    graficos.painel_completo(lista_metricas),
        }
    except Exception as e:
        # gráfico com erro não derruba tudo — só avisa
        graficos_json = {"erro": f"Erro ao gerar gráficos: {e}"}

    # informações da imagem original
    w, h = original_rgb.size
    tamanho_original_kb = round(arquivo.tell() / 1024, 2) if hasattr(arquivo, "tell") else 0
    # fallback: calcula a partir do BMP (referência sem compressão)
    if tamanho_original_kb == 0:
        tamanho_original_kb = round(compressor._bytes_originais / 1024, 2)

    resposta = {
        "sucesso": True,
        "original": {
            "largura": w,
            "altura": h,
            "modo": original_rgb.mode,
            "tamanho_kb": tamanho_original_kb,
        },
        "resultados": resultado_json,
        "graficos": graficos_json,
    }

    # guarda pra /api/exportar usar depois
    _ultimo_resultado = {
        "metricas": lista_metricas,
        "imagens": {k: resultados[k]["imagem"] for k in ["jpeg", "png", "webp"]},
    }

    return jsonify(resposta)


@app.route("/api/exportar")
def exportar():
    """Exporta o último resultado como ZIP com CSV, JSON e imagens."""
    if _ultimo_resultado is None:
        return jsonify({"erro": "Nenhum resultado disponível. Faça uma comparação primeiro."}), 400

    lista_metricas = _ultimo_resultado["metricas"]
    imagens = _ultimo_resultado["imagens"]

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # CSV
        csv_buf = io.StringIO()
        writer = csv.DictWriter(csv_buf, fieldnames=[
            "Formato", "PSNR_dB", "SSIM", "Tamanho_KB",
            "Taxa_Compressao", "Tempo_ms", "Qualidade_Percebida"
        ])
        writer.writeheader()
        for m in lista_metricas:
            writer.writerow({
                "Formato": m["formato"],
                "PSNR_dB": m["psnr_db"] if m["psnr_db"] is not None else "N/A",
                "SSIM": m["ssim"] if m["ssim"] is not None else "N/A",
                "Tamanho_KB": m["tamanho_kb"],
                "Taxa_Compressao": m["taxa_compressao"],
                "Tempo_ms": m["tempo_ms"],
                "Qualidade_Percebida": m["qualidade_percebida"],
            })
        zf.writestr("metricas.csv", csv_buf.getvalue())

        # JSON
        payload_json = {
            "data_exportacao": datetime.now().isoformat(),
            "metricas": lista_metricas,
        }
        zf.writestr("metricas.json", json.dumps(payload_json, indent=2, ensure_ascii=False, default=str))

        # imagens
        for chave, fmt_pil, ext in [("jpeg", "JPEG", "jpg"), ("png", "PNG", "png"), ("webp", "WEBP", "webp")]:
            if chave in imagens:
                buf = io.BytesIO()
                imagens[chave].save(buf, format=fmt_pil)
                zf.writestr(f"resultado_{chave}.{ext}", buf.getvalue())

    zip_buf.seek(0)
    nome_arquivo = f"compressao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return send_file(
        zip_buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=nome_arquivo,
    )


# ─── entrada ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # em produção, debug=False — Railway não seta FLASK_ENV
    debug = os.environ.get("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
