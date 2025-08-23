import React, { useState } from "react";
import axios from "axios";

export default function ComparadorProdutos({ dados }) {
  const [grupo, setGrupo] = useState("");
  const [selecionados, setSelecionados] = useState([]);

  const grupos = dados.grupos || [];

  const handleToggle = (item, checked) => {
    if (checked) {
      setSelecionados((prev) => [...prev, { ...item, quantidade: 1 }]);
    } else {
      setSelecionados((prev) => prev.filter((p) => p.codigo !== item.codigo));
    }
  };

  const handleQuantidade = (codigo, qtd) => {
    setSelecionados((prev) =>
      prev.map((p) =>
        p.codigo === codigo ? { ...p, quantidade: parseInt(qtd, 10) || 0 } : p
      )
    );
  };

  const handleGerarPDF = async () => {
    if (selecionados.length === 0) {
      alert("Selecione ao menos 1 produto!");
      return;
    }

    try {
      const res = await axios.post("http://localhost:3001/gerar-pdf", {
        titulo: `Transferência de produtos`,
        itens: selecionados,
      });
      window.open(`http://localhost:3001${res.data.url}`, "_blank");
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF");
    }
  };

  const produtosOrigem = grupo ? dados.origem[grupo] || [] : [];
  const produtosDestino = grupo ? dados.faltandoNoDestino[grupo] || [] : [];

  return (
    <div className="p-6 max-w-[98%] mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">
        Comparador de Produtos
      </h1>

      {/* Filtro de grupos */}
      <div className="flex justify-center mb-4">
        <select
          className="border rounded-lg p-2 shadow w-60"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        >
          <option value="">Todos os Grupos</option>
          {grupos
            .slice() // cria uma cópia do array
            .sort((a, b) => {
              const numA = parseInt(a.split(" ")[0], 10); // pega o número antes do "-"
              const numB = parseInt(b.split(" ")[0], 10);
              return numA - numB;
            })
            .map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
        </select>
      </div>

      {grupo && (
        <div className="flex gap-6">
          {/* Loja de Origem */}
          <div className="flex-1 flex flex-col border rounded-xl shadow bg-white h-[400px] overflow-hidden">
            <h2 className="text-lg font-semibold text-center sticky top-0 bg-white z-10 py-2 border-b">
              Loja de Origem
            </h2>
            <div className="overflow-y-auto flex-1 p-2">
              {produtosOrigem.map((p) => (
                <div
                  key={p.codigo}
                  className="grid grid-cols-[70px_1fr_50px] gap-2 items-center border-b border-gray-200 py-1 px-2 text-sm"
                >
                  <div className="font-mono">{p.codigo}</div>
                  <div className="truncate" title={p.descricao}>
                    {p.descricao}
                  </div>
                  <div className="text-right font-bold">{p.quantidade}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Loja de Destino */}
          <div className="flex-1 flex flex-col border rounded-xl shadow bg-white h-[400px] overflow-hidden">
            <h2 className="text-lg font-semibold text-center sticky top-0 bg-white z-10 py-2 border-b">
              Loja de Destino
            </h2>
            <div className="overflow-y-auto flex-1 p-2">
              {produtosDestino.map((item) => {
                const selecionado = selecionados.find(
                  (p) => p.codigo === item.codigo
                );
                return (
                  <div
                    key={item.codigo}
                    className="grid grid-cols-[30px_70px_1fr_50px] items-center border-b border-gray-200 py-1 px-2 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={!!selecionado}
                      onChange={(e) => handleToggle(item, e.target.checked)}
                    />
                    <div className="font-mono">{item.codigo}</div>
                    <div className="truncate" title={item.descricao}>
                      {item.descricao}
                    </div>
                    <input
                      type="number"
                      min="0"
                      className="w-16 border rounded p-1 text-center"
                      value={selecionado?.quantidade || ""}
                      onChange={(e) =>
                        handleQuantidade(item.codigo, e.target.value)
                      }
                      disabled={!selecionado}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {grupo && (
        <div className="flex justify-center mt-6">
          <button
            onClick={handleGerarPDF}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg shadow hover:bg-blue-700"
          >
            Gerar PDF
          </button>
        </div>
      )}
    </div>
  );
}
