'use client';

import { useEffect, useRef } from 'react';

// Fundo animado da tela de login: gotas de metal líquido azul flutuando e se fundindo.
// Raymarching de esferas com união suave (metaballs) em WebGL puro, sem bibliotecas.
// Reflexo de um "estúdio" procedural em tons do azul Prospectra com toque violeta do logo.

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
const int N = 9;
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
vec4 blob(int i,float t){
  float fi=float(i);
  vec3 c=vec3(sin(t*.23+fi*1.7)*1.9+sin(t*.11+fi)*.6, cos(t*.19+fi*2.3)*1.15, sin(t*.17+fi*.9)*.8);
  float r=.24+.17*fract(sin(fi*12.9898)*43758.5453);
  return vec4(c,r);
}
float map(vec3 p){
  float d=1e5; float t=uTime;
  for(int i=0;i<N;i++){vec4 b=blob(i,t); d=smin(d,length(p-b.xyz)-b.w,.42);}
  vec3 m=vec3(uMouse*vec2(2.4,1.35),.2);
  d=smin(d,length(p-m)-.2,.5);
  return d;
}
vec3 nrm(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
vec3 env(vec3 d){
  float y=d.y;
  vec3 deep=vec3(.03,.10,.38), blue=vec3(.08,.36,.99), sky=vec3(.80,.88,1.), white=vec3(1.);
  vec3 c=mix(deep,blue,smoothstep(-.9,-.1,y));
  c=mix(c,sky,smoothstep(-.05,.35,y));
  c=mix(c,white,smoothstep(.55,.95,y));
  c+=vec3(1.)*smoothstep(.985,1.,dot(d,normalize(vec3(.6,.7,.4))))*1.2;      // luz de estúdio
  c+=vec3(.49,.23,.93)*.35*smoothstep(.6,1.,dot(d,normalize(vec3(-.8,-.2,.5)))); // reflexo violeta
  c=mix(c,vec3(.05,.07,.15),smoothstep(.12,.0,abs(y+.02))*.55);              // linha do horizonte
  return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,0.,3.4), rd=normalize(vec3(uv,-1.55));
  float t=0.; bool hit=false;
  for(int i=0;i<64;i++){float d=map(ro+rd*t); if(d<.0015){hit=true;break;} t+=d; if(t>8.)break;}
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 p=ro+rd*t, n=nrm(p), r=reflect(rd,n);
  float fres=pow(1.-max(dot(n,-rd),0.),3.);
  vec3 col=env(r)*.92+fres*vec3(.75,.85,1.)*.45;
  col=mix(col,col*vec3(.78,.86,1.05),.35);
  float edge=smoothstep(0.,.02,-map(p+rd*.01)+.012);
  gl_FragColor=vec4(col,1.);
}`;

export function LiquidMetal({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75; // resolução reduzida = leve em notebook
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const mouse = { x: 2, y: 2, tx: 2, ty: 2 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2 * (r.width / r.height) * 0.56;
      mouse.ty = -((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, 6 + (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`h-full w-full ${className}`} />;
}
