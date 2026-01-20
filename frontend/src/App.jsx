import { useState, useEffect, useRef } from "react";
import "./App.css";
import FaultyTerminal from "./components/FaultyTerminal.jsx";
import EC2Console from "./components/EC2Console.jsx";
import LogoLoop from "./components/LogoLoop.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { Dashboard } from "./components/Dashboard.jsx";

function App() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const textRef = useRef(null);
  const [textWidth, setTextWidth] = useState("fit-content");
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    // Show black screen for 800ms, then fade in
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (textRef.current) {
      const width = textRef.current.offsetWidth;
      setTextWidth(`${width * 1}px`); // Make it 85% of text width to be less wide
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        console.error("Error signing in with Google:", error);
        setGoogleLoading(false);
      }
      // Don't reset loading state here - the OAuth redirect will happen
      // and the page will navigate to Google, then back
    } catch (error) {
      console.error("Error signing in with Google:", error);
      setGoogleLoading(false);
    }
  };

  // If user is logged in, show dashboard
  if (!authLoading && user) {
    return <Dashboard />;
  }

  // Main page when not logged in
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Black screen overlay - only show during initial fade */}
      {isLoading && (
        <div
          className="fade-overlay visible"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "#000000",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        />
      )}
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
        className="console-box"
        style={{
          position: "absolute",
          left: "clamp(20px, 3vw, 40px)",
          top: "clamp(20px, 3vh, 40px)",
          bottom: "clamp(20px, 3vh, 40px)",
          width: "clamp(350px, 50vw, 600px)",
          maxWidth: "calc(100vw - clamp(40px, 6vw, 80px))",
          backgroundColor: "#000000",
          padding: "clamp(5px, 1vw, 8px)",
          zIndex: 10,
          overflow: "hidden",
          boxShadow:
            "0 0 40px rgba(0, 0, 0, 1), 0 0 80px rgba(0, 0, 0, 0.8), 0 0 120px rgba(0, 0, 0, 0.6), 0 20px 60px rgba(0, 0, 0, 0.9)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #ffffff",
            padding: "clamp(5px, 1vw, 12px)",
            backgroundColor: "#000000",
          }}
        >
          <EC2Console />
        </div>
      </div>
      <div
        className="desktop-text"
        style={{
          position: "absolute",
          left: "clamp(620px, calc(50vw + 40px), 900px)",
          top: "45%",
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "fit-content",
        }}
      >
        <div
          style={{
            width: textWidth,
            overflow: "hidden",
            position: "relative",
            alignSelf: "center",
            opacity: 0.6,
            boxShadow: "0 0 8px rgba(0, 0, 0, 1), 0 0 4px rgba(0, 0, 0, 0.9)",
          }}
        >
          <LogoLoop
            logos={[
              {
                src: "/logoloop/atom.png",
                alt: "React",
              },
              {
                src: "/logoloop/js.png",
                alt: "JavaScript",
              },
              {
                src: "/logoloop/python.png",
                alt: "Python",
              },
              {
                src: "/logoloop/mongodb.svg",
                alt: "MongoDB",
              },
              {
                src: "/logoloop/supabase_logo_icon_249481.png",
                alt: "Supabase",
              },
            ]}
            speed={60}
            direction="left"
            logoHeight={60}
            gap={40}
            fadeOut={true}
            fadeOutColor="#000000"
            width={textWidth}
          />
        </div>
        <div
          ref={textRef}
          style={{
            color: "#d0d0d0",
            fontSize: "clamp(42px, 6vw, 58px)",
            fontWeight: "bold",
            fontFamily: "Zalando Sans Expanded, sans-serif",
            lineHeight: "1.2",
            whiteSpace: "pre-line",
            textAlign: "center",
            textShadow:
              "4px 20px 17px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.6)",
          }}
        >
          {`making cameras
smart`}
        </div>
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          style={{
            padding: "12px 24px",
            backgroundColor: "#000000",
            color: "#ffffff",
            border: "1px solid #ffffff",
            fontSize: "clamp(14px, 1.5vw, 18px)",
            fontWeight: "bold",
            cursor: googleLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            alignSelf: "center",
            fontFamily: "Zalando Sans Expanded, sans-serif",
            opacity: googleLoading ? 0.7 : 1,
            marginTop: "20px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z"
              fill="#4285F4"
            />
            <path
              d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65454 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
              fill="#34A853"
            />
            <path
              d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40681 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65454 3.57955 9 3.57955Z"
              fill="#EA4335"
            />
          </svg>
          {googleLoading ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
      <div
        className="mobile-text-box"
        style={{
          position: "absolute",
          left: "clamp(20px, 3vw, 40px)",
          top: "clamp(60px, 10vh, 120px)",
          bottom: "clamp(20px, 3vh, 40px)",
          width: "clamp(300px, 80vw, 500px)",
          maxWidth: "calc(100vw - clamp(40px, 6vw, 80px))",
          backgroundColor: "#000000",
          padding: "clamp(5px, 1vw, 8px)",
          zIndex: 10,
          overflow: "hidden",
          boxShadow:
            "0 0 40px rgba(0, 0, 0, 1), 0 0 80px rgba(0, 0, 0, 0.8), 0 0 120px rgba(0, 0, 0, 0.6), 0 20px 60px rgba(0, 0, 0, 0.9)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #ffffff",
            padding: "clamp(20px, 4vw, 40px)",
            backgroundColor: "#000000",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "fit-content",
              overflow: "hidden",
              position: "relative",
              alignSelf: "center",
              opacity: 0.8,
              boxShadow: "0 0 8px rgba(0, 0, 0, 1), 0 0 4px rgba(0, 0, 0, 0.9)",
            }}
          >
            <LogoLoop
              logos={[
                {
                  src: "/logoloop/atom.png",
                  alt: "React",
                },
                {
                  src: "/logoloop/js.png",
                  alt: "JavaScript",
                },
                {
                  src: "/logoloop/python.png",
                  alt: "Python",
                },
                {
                  src: "/logoloop/mongodb.svg",
                  alt: "MongoDB",
                },
                {
                  src: "/logoloop/supabase_logo_icon_249481.png",
                  alt: "Supabase",
                },
              ]}
              speed={60}
              direction="left"
              logoHeight={60}
              gap={40}
              fadeOut={true}
              fadeOutColor="#000000"
              width="fit-content"
              style={{ width: "fit-content" }}
            />
          </div>
          <div
            style={{
              color: "#d0d0d0",
              fontSize: "clamp(32px, 9vw, 56px)",
              fontWeight: "bold",
              fontFamily: "Zalando Sans Expanded, sans-serif",
              lineHeight: "1.2",
              whiteSpace: "pre-line",
              textShadow:
                "4px 20px 17px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.6)",
              textAlign: "center",
            }}
          >
            {`making cameras
smart`}
          </div>
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "1px solid #ffffff",
              fontSize: "clamp(14px, 2vw, 18px)",
              fontWeight: "bold",
              cursor: googleLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              alignSelf: "center",
              fontFamily: "Zalando Sans Expanded, sans-serif",
              opacity: googleLoading ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z"
                fill="#4285F4"
              />
              <path
                d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65454 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40681 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65454 3.57955 9 3.57955Z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
