
import React, { useRef, useEffect, useMemo } from 'react';
import { Renderer, Program, Color, Mesh, Triangle } from 'ogl-typescript';
import './FaultyTerminal.css';

const vertex = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0, 1);
}
`;

const fragment = `
precision highp float;
uniform float t;
uniform float pageLoadT;
uniform float brightness;
uniform float scanlineIntensity;
uniform float glitchAmount;
uniform float flickerAmount;
uniform float noiseAmp;
uniform float chromaticAberration;
uniform float dither;
uniform float curvature;
uniform vec3 tint;
uniform vec2 gridMul;
uniform vec2 resolution;
uniform bool mouseReact;
uniform vec2 mousePos;
uniform float mouseStrength;
varying vec2 vUv;

#define PI 3.141592653589793

// Noise functions
float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Dithering
float dither8x8(vec2 p, float brightness) {
    int x = int(mod(p.x, 8.0));
    int y = int(mod(p.y, 8.0));
    mat8 ditherMatrix = mat8(
        0, 32, 8, 40, 2, 34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44, 4, 36, 14, 46, 6, 38,
        60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43, 1, 33, 9, 41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47, 7, 39, 13, 45, 5, 37,
        63, 31, 55, 21, 61, 29, 53, 23
    );
    return brightness > ditherMatrix[x][y] / 64.0 ? 1.0 : 0.0;
}

// Main rendering logic
vec4 render(vec2 p) {
    vec2 uv = p;

    // Apply curvature
    if (curvature > 0.0) {
        uv = uv * 2.0 - 1.0;
        float barrel = 1.0 + curvature * dot(uv, uv);
        uv /= barrel;
        uv = (uv + 1.0) / 2.0;
    }

    // Mouse interaction
    if (mouseReact) {
        float mouseDist = distance(uv, mousePos);
        uv.y += (mousePos.y - uv.y) * (1.0 - smoothstep(0.0, 0.2, mouseDist)) * mouseStrength;
    }

    // Glitch effect
    float glitch = pow(rand(vec2(t, 2.0)), 5.0) * glitchAmount;
    if (rand(vec2(t, 1.0)) > 0.95) {
        glitch = 0.0;
    }
    uv.y = fract(uv.y + glitch);

    // Glyphs
    vec2 id = floor(uv * gridMul);
    float glyph = rand(id);
    float a = pow(glyph, 20.0) * 0.8 + 0.2;
    float b = pow(glyph, 2.0);

    // Flicker
    float flicker = (rand(vec2(t, 3.0)) - 0.5) * 0.2 * flickerAmount;
    a += flicker;

    // Final color
    vec3 col = vec3(b * 0.4, a, b * 0.7);
    col *= vec3(0.5, 1.0, 0.5);
    col *= tint;

    // Scanlines
    float scanline = sin(uv.y * 800.0) * 0.5 + 0.5;
    col *= 1.0 + scanline * 0.1 * scanlineIntensity;

    // Noise
    col += noise(uv * 300.0) * 0.1 * noiseAmp;

    // Chromatic Aberration
    float r = render(p + vec2(chromaticAberration, 0.0)).r;
    float g = render(p).g;
    float b_ = render(p - vec2(chromaticAberration, 0.0)).b;
    col = vec3(r, g, b_);

    // Dithering
    if (dither > 0.0) {
        col = vec3(dither8x8(gl_FragCoord.xy, col.g) * dither);
    }

    // Page load animation
    float loadFade = smoothstep(0.0, 1.0, pageLoadT);
    col *= loadFade;

    return vec4(col * brightness, 1.0);
}

void main() {
    gl_FragColor = render(vUv);
}
`;

const FaultyTerminal = (props) => {
    const {
        scale = 1.5, gridMul = [2, 1], digitSize = 1.2, timeScale = 1, pause = false,
        scanlineIntensity = 1, glitchAmount = 1, flickerAmount = 1, noiseAmp = 1,
        chromaticAberration = 0, dither = 0, curvature = 0, tint = '#ffffff',
        mouseReact = true, mouseStrength = 0.5, pageLoadAnimation = false,
        brightness = 1, className, style
    } = props;

    const canvasRef = useRef(null);
    const animationFrameRef = useRef(0);
    const rendererRef = useRef(null);
    const programRef = useRef(null);
    const startTimeRef = useRef(Date.now());
    const pageLoadTimeRef = useRef(0);

    const uniforms = useMemo(() => ({
        t: { value: 0 },
        pageLoadT: { value: 0 },
        brightness: { value: brightness },
        scanlineIntensity: { value: scanlineIntensity },
        glitchAmount: { value: glitchAmount },
        flickerAmount: { value: flickerAmount },
        noiseAmp: { value: noiseAmp },
        chromaticAberration: { value: chromaticAberration },
        dither: { value: dither },
        curvature: { value: curvature },
        tint: { value: new Color(tint) },
        gridMul: { value: [gridMul[0] * digitSize, gridMul[1] * digitSize] },
        resolution: { value: [0, 0] },
        mousePos: { value: [0.5, 0.5] },
        mouseReact: { value: mouseReact },
        mouseStrength: { value: mouseStrength },
    }), [brightness, scanlineIntensity, glitchAmount, flickerAmount, noiseAmp, chromaticAberration, dither, curvature, tint, gridMul, digitSize, mouseReact, mouseStrength]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const renderer = new Renderer({ canvas, dpr: Math.min(window.devicePixelRatio, 2), alpha: true });
        rendererRef.current = renderer;
        const gl = renderer.gl;
        const geometry = new Triangle(gl);

        const program = new Program(gl, {
            vertex,
            fragment,
            uniforms,
        });
        programRef.current = program;

        const mesh = new Mesh(gl, { geometry, program });

        const handleResize = () => {
            const scaleFactor = scale / 100;
            const newWidth = canvas.clientWidth / scaleFactor;
            const newHeight = canvas.clientHeight / scaleFactor;
            renderer.setSize(newWidth, newHeight);
            program.uniforms.resolution.value = [newWidth, newHeight];
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        const handleMouseMove = (e) => {
            if (mouseReact) {
                const { clientX, clientY } = e;
                const { width, height, left, top } = canvas.getBoundingClientRect();
                program.uniforms.mousePos.value = [(clientX - left) / width, 1 - (clientY - top) / height];
            }
        };
        window.addEventListener('mousemove', handleMouseMove);

        const animate = (time) => {
            if (!pause) {
                const elapsed = (Date.now() - startTimeRef.current) * 0.001;
                program.uniforms.t.value = elapsed * timeScale;

                if (pageLoadAnimation) {
                    if (pageLoadTimeRef.current < 1) {
                        pageLoadTimeRef.current += 0.01;
                        program.uniforms.pageLoadT.value = pageLoadTimeRef.current;
                    }
                } else {
                    program.uniforms.pageLoadT.value = 1;
                }

                renderer.render({ scene: mesh });
            }
            animationFrameRef.current = requestAnimationFrame(animate);
        };
        animate(0);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameRef.current);
        };
    }, [scale, timeScale, pause, pageLoadAnimation, mouseReact, uniforms]);

    return (
        <div className={`faulty-terminal-container ${className || ''}`} style={style}>
            <canvas ref={canvasRef} className="faulty-terminal-canvas" />
        </div>
    );
};

export default FaultyTerminal;
