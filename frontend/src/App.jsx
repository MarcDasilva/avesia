import { useState, useEffect } from "react";
import "./App.css";
import FaultyTerminal from "./components/FaultyTerminal.jsx";
import EC2Console from "./components/EC2Console.jsx";

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Show black screen for 800ms, then fade in
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Black screen overlay */}
      <div
        className={`fade-overlay ${isLoading ? "visible" : "fade-out"}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          zIndex: 9999,
          pointerEvents: isLoading ? "auto" : "none",
        }}
      />
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
          left: "clamp(20px, 3vw, 40px)",
          top: "clamp(20px, 3vh, 40px)",
          bottom: "clamp(20px, 3vh, 40px)",
          width: "clamp(350px, 50vw, 600px)",
          maxWidth: "calc(100vw - clamp(40px, 6vw, 80px))",
          backgroundColor: "#000000",
          padding: "clamp(10px, 1.5vw, 20px)",
          zIndex: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #ffffff",
            padding: "clamp(10px, 1.5vw, 20px)",
            backgroundColor: "#000000",
          }}
        >
          <EC2Console />
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
