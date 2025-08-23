// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import PDFKit from "pdfkit";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/downloads", express.static("downloads"));

/* ================== Upload ================== */
const upload = multer({ dest: "uploads/" });

/* ================== Utils ================== */
const norm = (s = "") => String(s).replace(/\s+/g, " ").trim();

/** 1.234,56 -> 1234.56 */
function parsePtNumber(str) {
  if (!str) return NaN;
  const s = String(str).replace(/\./g, "").replace(",", ".");
  return Number(s);
}

/** preço PT-BR (tem vírgula e 2 decimais) */
function isPtPrice(tok) {
  return /^\d{1,3}(\.\d{3})*,\d{2}$/.test(tok);
}

/** número PT-BR genérico: 3, 3,00, 10, 0 */
function isPtNumeric(tok) {
  return /^\d+(,\d+)?$/.test(tok);
}

/* ============== Extração de texto do PDF (agrupando por Y com tolerância) ============== */
async function extrairTextoPDF(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const linhasSaida = [];
  const EPS_Y = 4; // tolerância vertical p/ considerar itens na mesma linha

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Clustering por Y
    const rows = [];
    const items = content.items
      .map((it) => {
        const [, , , , x, y] = it.transform;
        return { x, y, str: it.str };
      })
      .filter((it) => it.str && it.str.trim());

    // Ordena por Y (topo→baixo = y decrescente) e X crescente
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    for (const it of items) {
      // tenta encaixar em uma linha existente (y próximo)
      let placed = false;
      for (const row of rows) {
        if (Math.abs(row.y - it.y) <= EPS_Y) {
          row.items.push(it);
          // atualiza y médio da linha para estabilizar
          row.y = (row.y * row.items.length + it.y) / (row.items.length + 1);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push({ y: it.y, items: [it] });
      }
    }

    // Ordena linhas de cima para baixo
    rows.sort((a, b) => b.y - a.y);

    // Para cada linha, ordena por X e junta
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const texto = norm(row.items.map((i) => i.str).join(" "));
      if (texto) linhasSaida.push(texto);
    }

    // quebra de página
    linhasSaida.push("");
  }

  return linhasSaida.join("\n");
}

/* ============== Parser por grupo ============== */
function extrairProdutosPorGrupo(texto) {
  const linhas = texto
    .split("\n")
    .map((l) => norm(l))
    .filter((l) => l.length > 0);

  const grupos = {};
  let grupoAtual = null;

  for (const linha of linhas) {
    // Cabeçalhos de grupo: "GRUPO: 12 - BICICLETA" ou "12 - BICICLETA"
    const mGrupo =
      linha.match(/^GRUPO:\s*(.+)$/i) || // pega tudo após "GRUPO:"
      linha.match(/^\d+\s*-\s*.+$/); // "12 - BICICLETA"
    if (mGrupo) {
      const raw = mGrupo[0].replace(/^GRUPO:\s*/i, "");
      grupoAtual = norm(raw);
      if (!grupos[grupoAtual]) grupos[grupoAtual] = [];
      continue;
    }

    if (!grupoAtual) continue;

    const produtos = parseProdutosEmLinha(linha, grupoAtual);
    if (produtos.length) grupos[grupoAtual].push(...produtos);
  }

  return grupos;
}

/**
 * Para cada segmento entre um CÓDIGO (>=3 dígitos) e o próximo, extrai:
 * { codigo, descricao, quantidade(E.Físico), grupo }.
 * Regra da quantidade:
 *   - tenta o PRIMEIRO número após o PREÇO
 *   - se não houver preço, usa o ÚLTIMO número do segmento
 */
function parseProdutosEmLinha(linha, grupo) {
  const tokens = linha.split(/\s+/);
  const codigo = tokens[0]; // assume que o primeiro token é o código
  if (!/^\d{3,}$/.test(codigo)) return [];

  // procura quantidade: último número da linha
  let quantidade = 0;
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (/^\d+(,\d+)?$/.test(tokens[i])) {
      quantidade = Math.round(parsePtNumber(tokens[i]));
      tokens.splice(i, 1); // remove quantidade dos tokens
      break;
    }
  }

  // descrição: tudo que sobrou, excluindo código
  const descricao = tokens.slice(1).join(" ");

  return [{ codigo, descricao, quantidade, grupo }];
}

/* ============== Comparação por grupo ============== */
function compararPorGrupo(origem, destino) {
  const todos = new Set([...Object.keys(origem), ...Object.keys(destino)]);
  const faltandoNoDestino = {};
  const faltandoNaOrigem = {};

  for (const g of todos) {
    const arrO = origem[g] || [];
    const arrD = destino[g] || [];
    const mapD = new Map(arrD.map((x) => [String(x.codigo), x]));
    const mapO = new Map(arrO.map((x) => [String(x.codigo), x]));

    faltandoNoDestino[g] = arrO.filter((x) => !mapD.has(String(x.codigo)));
    faltandoNaOrigem[g] = arrD.filter((x) => !mapO.has(String(x.codigo)));
  }

  return {
    grupos: Array.from(todos),
    origem,
    destino,
    faltandoNoDestino,
    faltandoNaOrigem,
  };
}

/* ============== Rotas ============== */

// Upload + comparação
app.post(
  "/comparar",
  upload.fields([
    { name: "origem", maxCount: 1 },
    { name: "destino", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const fOrigem = req.files?.origem?.[0];
      const fDestino = req.files?.destino?.[0];
      if (!fOrigem || !fDestino) {
        return res
          .status(400)
          .json({ error: "Envie os dois arquivos: origem e destino" });
      }

      const txtOrigem = await extrairTextoPDF(fOrigem.path);
      const txtDestino = await extrairTextoPDF(fDestino.path);

      // // Logs curtos p/ depurar rapidamente
      // console.log("=== ORIGEM (10 linhas) ===");
      // console.log(txtOrigem.split("\n").slice(0, 10).join("\n"));
      // console.log("=== DESTINO (10 linhas) ===");
      // console.log(txtDestino.split("\n").slice(0, 10).join("\n"));

      const origem = extrairProdutosPorGrupo(txtOrigem);
      const destino = extrairProdutosPorGrupo(txtDestino);

      const resultado = compararPorGrupo(origem, destino);

      fs.unlink(fOrigem.path, () => {});
      fs.unlink(fDestino.path, () => {});

      res.json(resultado);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro ao processar PDFs: " + err.message });
    }
  }
);

// Gerar PDF final (itens selecionados no front)

app.post("/gerar-pdf", (req, res) => {
  try {
    const { itens = [], titulo = "Solicitação de Transferência" } =
      req.body || {};
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: "Nenhum item selecionado" });
    }

    if (!fs.existsSync("downloads")) fs.mkdirSync("downloads");
    const nomeArq = `solicitacao_${Date.now()}.pdf`;
    const caminho = path.join("downloads", nomeArq);

    const doc = new PDFKit({ size: "A4", margin: 36 });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    // Cabeçalho do PDF
    doc.fontSize(18).text("Transferência de produtos", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, {
      align: "center",
    });
    doc.moveDown(1);

    // Função para escrever cabeçalho da tabela
    const escreverHeader = (y) => {
      doc
        .fontSize(11)
        .text("Código", 40, y, { width: 80 })
        .text("Descrição", 125, y, { width: 360 })
        .text("Qtd", 490, y, { width: 50, align: "right" });
      doc
        .moveTo(40, y + 14)
        .lineTo(560, y + 14)
        .stroke();
    };

    let y = doc.y;
    escreverHeader(y);
    y += 20;
    doc.fontSize(10);

    // Função para truncar texto com "..."
    const truncarTexto = (text, maxWidth) => {
      let t = text;
      while (doc.widthOfString(t) > maxWidth) {
        t = t.slice(0, -1);
      }
      if (t.length < text.length) t = t.slice(0, -3) + "...";
      return t;
    };

    for (const it of itens) {
      if (y > 780) {
        doc.addPage();
        y = 60;
        escreverHeader(y);
        y += 20;
      }

      doc
        .text(String(it.codigo ?? ""), 40, y, { width: 80 })
        .text(truncarTexto(norm(String(it.descricao ?? "")), 360), 125, y, {
          width: 360,
        })
        .text(String(it.quantidade ?? 0), 490, y, {
          width: 50,
          align: "right",
        });

      y += 16;
    }

    doc.end();
    stream.on("finish", () => res.json({ url: `/downloads/${nomeArq}` }));
    stream.on("error", (e) =>
      res.status(500).json({ error: "Falha ao gerar PDF: " + e.message })
    );
  } catch (err) {
    res.status(500).json({ error: "Erro interno: " + err.message });
  }
});

/* ============== Start ============== */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});
