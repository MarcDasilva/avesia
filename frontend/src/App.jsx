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
          opacity: 1,
        }}
        scale={3}
        mouseReact={false}
      />
      <div
        style={{
          position: "absolute",
          left: "40px",
          top: "40px",
          bottom: "40px",
          width: "600px",
          backgroundColor: "#000000",
          padding: "20px",
          zIndex: 10,
          overflow: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #ffffff",
            padding: "20px",
          }}
        >
          {/* Additional elements container */}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <button className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors"></button>
        </div>
      </div>
    </div>
  );
}

export default App;
