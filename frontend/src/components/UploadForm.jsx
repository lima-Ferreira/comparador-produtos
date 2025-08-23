import React, { useState } from "react";
import axios from "axios";

export default function UploadForm({ onCompare }) {
  const [origem, setOrigem] = useState(null);
  const [destino, setDestino] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!origem || !destino) {
      alert("Selecione os dois arquivos PDF!");
      return;
    }

    const formData = new FormData();
    formData.append("origem", origem);
    formData.append("destino", destino);

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:3001/comparar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onCompare(res.data);
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar os arquivos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md">
      <h1 className="text-2xl font-bold text-center mb-6">
        Comparador de Produtos
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Origem */}
        <div className="flex flex-col">
          <label className="font-bold mb-1" htmlFor="origem">
            Loja de Origem (PDF)
          </label>
          <input
            id="origem"
            type="file"
            accept="application/pdf"
            onChange={(e) => setOrigem(e.target.files[0])}
            className="border rounded-lg p-2 w-full"
          />
          {origem && <p className="text-sm mt-1">Selecionado: {origem.name}</p>}
        </div>

        {/* Destino */}
        <div className="flex flex-col">
          <label className="font-bold mb-1" htmlFor="destino">
            Loja de Destino (PDF)
          </label>
          <input
            id="destino"
            type="file"
            accept="application/pdf"
            onChange={(e) => setDestino(e.target.files[0])}
            className="border rounded-lg p-2 w-full"
          />
          {destino && (
            <p className="text-sm mt-1">Selecionado: {destino.name}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Comparando..." : "Comparar Produtos"}
        </button>
      </form>
    </div>
  );
}
