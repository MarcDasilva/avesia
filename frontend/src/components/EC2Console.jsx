import { useEffect, useState } from "react";

function EC2Console() {
  const [logo, setLogo] = useState("");
  const [atlesia, setAtlesia] = useState("");

  useEffect(() => {
    // Fetch logo.txt
    fetch("/logo.txt")
      .then((res) => res.text())
      .then((text) => setLogo(text))
      .catch((err) => console.error("Error loading logo:", err));

    // Fetch atlesia.txt
    fetch("/atlesia.txt")
      .then((res) => res.text())
      .then((text) => setAtlesia(text))
      .catch((err) => console.error("Error loading atlesia:", err));
  }, []);

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .ec2-console-container {
          color: #ffffff;
          font-family: monospace;
          font-size: clamp(6px, 1vw, 10px);
          line-height: 1.2;
          white-space: pre;
          overflow: hidden;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .ec2-console-content {
          display: flex;
          gap: clamp(10px, 2vw, 20px);
          margin-bottom: clamp(10px, 1.5vh, 15px);
          flex-wrap: nowrap;
          align-items: flex-start;
          flex-direction: row;
          flex-shrink: 0;
        }
        .ec2-logo {
          color: #ffffff;
          font-size: clamp(6px, 0.8vw, 9px);
          flex-shrink: 0;
        }
        .ec2-atlesia {
          color: #ffffff;
          font-size: clamp(7px, 1vw, 11px);
          flex-shrink: 0;
          margin-top: 0;
        }
        .ec2-system-info {
          color: #ffffff;
          font-size: clamp(7px, 1.2vw, 12px);
          margin-top: clamp(10px, 1.5vh, 15px);
          margin-bottom: clamp(10px, 1.5vh, 15px);
          flex-shrink: 0;
          line-height: 1.4;
        }
        .ec2-prompt {
          color: #ffffff;
          font-size: clamp(10px, 1.5vw, 14px);
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .ec2-console-content {
            flex-direction: column;
            flex-wrap: wrap;
          }
        }
      `}</style>
      <div className="ec2-console-container">
        <div className="ec2-console-content">
          {logo && <div className="ec2-logo">{logo}</div>}
          {atlesia && <div className="ec2-atlesia">{atlesia}</div>}
        </div>
        <div className="ec2-system-info">
          {`OS: avesia_linux
Version: 2.4.7
Kernel: 5.15.0-1051
Architecture: x86_64
CPU: Intel Xeon Platinum 8259CL @ 2.50GHz (4 cores)
Memory: 8.2 GiB
Disk: 20 GiB
`}
        </div>
        <div className="ec2-prompt">
          <span style={{ color: "#ffffff" }}>
            [avesia-user@ip-10-1-0-15 ~]$
          </span>
          <span style={{ marginLeft: "5px", animation: "blink 1s infinite" }}>
            _
          </span>
        </div>
      </div>
    </>
  );
}

export default EC2Console;
