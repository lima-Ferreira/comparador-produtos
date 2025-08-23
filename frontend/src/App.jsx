import React, { useState } from "react";
import UploadForm from "./components/UploadForm";
import ComparadorProdutos from "./components/ComparadorProdutos";

function App() {
  const [dados, setDados] = useState(null);

  return (
    <div className="min-h-screen bg-gray-100">
      {!dados ? (
        <UploadForm onCompare={(res) => setDados(res)} />
      ) : (
        <ComparadorProdutos dados={dados} />
      )}
    </div>
  );
}

export default App;
