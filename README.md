# Comparador de Compressão de Imagens

Projeto final da disciplina de **Sistemas Multimídia**. Aplicação web que comprime uma imagem nos formatos JPEG, PNG e WebP e compara os resultados através de métricas objetivas de qualidade (PSNR, SSIM) e eficiência (tamanho, tempo).

> screenshot aqui

---

## Sobre

O sistema permite:
- Carregar uma imagem via upload ou drag-and-drop
- Configurar a qualidade de compressão com sliders interativos
- Comparar os resultados dos três formatos lado a lado
- Visualizar gráficos comparativos de tamanho, qualidade e tempo
- Exportar os resultados (CSV + JSON + imagens comprimidas) em um único `.zip`

---

## Como rodar localmente

### Sem Docker (direto com Python)

```bash
# clonar o repositório
git clone https://github.com/agneloobruno/projeto_compressao.git
cd projeto_compressao

# instalar dependências
pip install -r requirements.txt

# rodar o servidor
python app.py
```

Acesse `http://localhost:5000` no navegador.

### Com Docker

```bash
# subir com docker-compose (recomendado)
docker-compose up

# ou build + run manual
docker build -t comparador-compressao .
docker run -p 5000:5000 comparador-compressao
```

---

## Como fazer deploy no Railway

1. Crie uma conta em [railway.app](https://railway.app)
2. No dashboard, clique em **New Project → Deploy from GitHub repo**
3. Autorize o acesso ao repositório `agneloobruno/projeto_compressao`
4. O Railway detecta o `Dockerfile` automaticamente e faz o build
5. Após o deploy, acesse a URL gerada pelo Railway

> O Railway usa a variável de ambiente `PORT` automaticamente — o `app.py` já está configurado para respeitá-la.

---

## Tecnologias usadas

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.11 + Flask |
| Compressão | Pillow (JPEG, PNG, WebP) |
| Métricas | NumPy + scikit-image (PSNR, SSIM) |
| Gráficos | Matplotlib (gerado como PNG base64) |
| Frontend | HTML + CSS + JavaScript puro |
| Deploy | Docker + Railway |

---

## Estrutura do projeto

```
projeto_compressao/
├── app.py          # servidor Flask e rotas da API
├── compressor.py   # lógica de compressão (Pillow)
├── metricas.py     # cálculo de PSNR e SSIM
├── graficos.py     # geração de gráficos como base64
├── templates/
│   └── index.html  # interface web
├── static/
│   ├── style.css
│   └── app.js
├── Dockerfile
└── docker-compose.yml
```
