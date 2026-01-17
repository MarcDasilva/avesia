import "./App.css";
import FaultyTerminal from "./components/FaultyTerminal.jsx";

function App() {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FaultyTerminal
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
        }}
        scale={1.8}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-6xl font-bold">Agentic Camera</h1>
          <p className="mt-4 text-xl">Your AI-powered camera assistant</p>
          <button className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
