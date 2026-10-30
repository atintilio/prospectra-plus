/* Argus Prime — o olho vivo (three.js r128 / WebGL)
 *
 * Recria o olho digital da marca como objeto 3D em tempo real e vai além dele:
 *  - íris de circuito impresso com dados correndo pelas trilhas em direção à pupila,
 *    nós que pulsam e luzes que piscam; pupila com ponto de luz que oscila (hippus);
 *  - pálpebras: piscadas naturais (às vezes duplas), acompanham o olhar, apertam
 *    quando o cursor está sobre algo clicável e arregalam com scroll rápido;
 *  - segue o cursor (ou o toque), faz sacadas quando ocioso, o reflexo da córnea
 *    acompanha a luz que segue o cursor; clique = contração + onda de luz na íris.
 *
 * ArgusEye.stage({...})  — Home: o olho sai do card, salta da tela, a câmera entra na
 *                          pupila e os dados se organizam (Dados → Leitura → Frentes → Decisão).
 * ArgusEye.mini(box)     — olho que observa o visitante (topo das páginas, CTA).
 */
(function () {
  "use strict";

  var REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TOUCH = window.matchMedia("(pointer: coarse)").matches;
  var root = document.documentElement;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function win(v, a, b, f) { f = f || 0.025; return smooth(a, a + f, v) * (1 - smooth(b - f, b, v)); }

  function webglOk() {
    try {
      var c = document.createElement("canvas");
      return !!(window.THREE && window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  /* ---------------- sinais globais: cursor, foco, clique, scroll ---------------- */
  var S = { x: innerWidth / 2, y: innerHeight / 2, has: false, last: 0, speed: 0, focus: 0, focusT: 0, click: 0, scrollV: 0 };
  function pt(x, y) {
    var dx = x - S.x, dy = y - S.y;
    S.speed = Math.min(1, S.speed * 0.6 + Math.sqrt(dx * dx + dy * dy) / 90);
    S.x = x; S.y = y; S.has = true; S.last = performance.now();
  }
  addEventListener("pointermove", function (e) { pt(e.clientX, e.clientY); }, { passive: true });
  addEventListener("touchstart", function (e) { var t = e.touches[0]; if (t) pt(t.clientX, t.clientY); }, { passive: true });
  addEventListener("pointerdown", function () { S.click = performance.now(); }, { passive: true });
  document.addEventListener("pointerover", function (e) { S.focusT = e.target.closest && e.target.closest("a,button,input,select,textarea,label") ? 1 : 0; }, { passive: true });
  var lastY = scrollY, lastT = performance.now();
  addEventListener("scroll", function () {
    var now = performance.now(), dt = Math.max(16, now - lastT);
    S.scrollV = Math.min(1, Math.abs(scrollY - lastY) / dt * 0.35);
    lastY = scrollY; lastT = now;
  }, { passive: true });

  /* ---------------- GLSL ---------------- */
  var NOISE = [
    "float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }",
    "float h1(float n){ return fract(sin(n*12.9898)*43758.5453); }",
    "float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);",
    "  return mix(mix(mix(hash(i),hash(i+vec3(1.0,0.0,0.0)),f.x), mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),",
    "             mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x), mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y), f.z); }",
    "float fbm(vec3 p){ float v = 0.0; float a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return v; }"
  ].join("\n");

  var SPHERE_VERT = [
    "varying vec3 vLocal; varying vec3 vN; varying vec3 vView;",
    "void main(){",
    "  vLocal = normalize(position);",
    "  vec4 wp = modelMatrix * vec4(position, 1.0);",
    "  vN = normalize(mat3(modelMatrix) * normal);",
    "  vView = normalize(cameraPosition - wp.xyz);",
    "  gl_Position = projectionMatrix * viewMatrix * wp;",
    "}"
  ].join("\n");

  var PLANE_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

  var EYE_FRAG = [
    "uniform float uTime; uniform float uPupil; uniform float uIris; uniform float uGlow; uniform float uFocus;",
    "uniform float uRipple; uniform float uRippleT; uniform float uCore; uniform vec3 uLight;",
    "varying vec3 vLocal; varying vec3 vN; varying vec3 vView;",
    NOISE,
    "void main(){",
    "  float polar = acos(clamp(vLocal.z, -1.0, 1.0));",
    "  float ang = atan(vLocal.y, vLocal.x);",
    "  float a = ang / 6.2831853 + 0.5;",
    "  vec2 cs = vec2(cos(ang), sin(ang));",
    "  vec3 N = normalize(vN); vec3 V = normalize(vView); vec3 L = normalize(uLight);",
    "  vec3 cDeep = vec3(0.015,0.045,0.13); vec3 cBlue = vec3(0.09,0.30,0.78);",
    "  vec3 cCyan = vec3(0.42,0.78,1.0); vec3 cHot = vec3(1.0,0.84,0.55);",
    "  vec3 emi = vec3(0.0);",
    /* esclera */
    "  vec3 sclera = vec3(0.62,0.68,0.80) * (0.84 + 0.16*fbm(vLocal*3.0));",
    "  float vein = smoothstep(0.03, 0.0, abs(fbm(vec3(cs*4.0, polar*3.0)) - 0.5)) * smoothstep(1.0, 2.0, polar);",
    "  sclera = mix(sclera, vec3(0.55,0.42,0.55), vein*0.18);",
    "  sclera *= mix(0.35, 1.0, smoothstep(uIris, uIris + 0.6, polar));",
    /* íris: base azul com fibras */
    "  float span = uIris - uPupil;",
    "  float t = clamp((polar - uPupil) / span, 0.0, 1.0);",
    "  float fib = fbm(vec3(cs*18.0, t*2.0 + uTime*0.02));",
    "  vec3 iris = mix(cBlue, cDeep, smoothstep(0.05, 1.0, t)) * (0.5 + 0.7*fib);",
    "  emi += cCyan * 0.22 * exp(-pow((t - 0.12)/0.10, 2.0)) * (1.0 + uFocus);",
    /* circuito: trilhas radiais, arcos, nós e pastilhas */
    "  float NS = 64.0; float ac = a*NS; float cell = floor(ac); float fa = fract(ac);",
    "  float r1 = h1(cell + 1.0); float r2 = h1(cell*1.7 + 5.0); float r3 = h1(cell*2.3 + 9.0); float r4 = h1(cell*3.1 + 2.0);",
    "  float has = step(0.38, r1);",
    "  float t0 = 0.06 + r2*0.30; float t1 = min(0.97, t0 + 0.22 + r3*0.55);",
    "  float sp = max(sin(polar), 0.06);",
    "  float wc = 0.0042*NS / (6.2831*sp);",
    "  float lane = 1.0 - smoothstep(wc*0.5, wc*1.3, abs(fa - 0.5));",
    "  float radial = has * lane * step(t0, t) * step(t, t1);",
    "  float arcs = 0.0;",
    "  for (int k = 0; k < 4; k++) {",
    "    float rk = 0.20 + float(k)*0.2;",
    "    float sg = floor(a*(10.0 + float(k)*6.0));",
    "    float on = step(0.5, h1(sg*7.3 + float(k)*19.0));",
    "    float dt = 0.0040/span;",
    "    arcs += on * (1.0 - smoothstep(dt*0.5, dt*1.4, abs(t - rk)));",
    "  }",
    "  arcs = min(arcs, 1.0);",
    "  float dA = (fa - 0.5)*6.2831/NS*sp;",
    "  float dist = length(vec2(dA, (t - t1)*span));",
    "  float node = has * (1.0 - smoothstep(0.007, 0.012, dist));",
    "  float nodeRing = has * (1.0 - smoothstep(0.0012, 0.0028, abs(dist - 0.016)));",
    "  float pad = has * (1.0 - smoothstep(0.004, 0.007, length(vec2(dA, (t - t0)*span))));",
    /* dados correndo pelas trilhas em direção à pupila */
    "  float head = fract(uTime*(0.16 + r4*0.34) + r2*13.0);",
    "  float pPos = t1 - head*(t1 - t0);",
    "  float pulse = exp(-pow((t - pPos)/0.035, 2.0)) * radial;",
    "  float rip = uRipple * exp(-pow((t - uRippleT)/0.06, 2.0));",
    "  vec3 tc = r3 > 0.78 ? cHot : cCyan;",
    "  emi += tc * (radial*0.55 + arcs*0.35) * (0.8 + uFocus*0.8 + uGlow*0.6);",
    "  emi += tc * pulse * 2.4;",
    "  emi += mix(cCyan, cHot, step(0.6, r4)) * (node*1.6 + nodeRing*0.6 + pad*0.8) * (0.7 + 0.5*sin(uTime*2.0 + r1*30.0));",
    "  emi += cCyan * rip * (radial + arcs + 0.25) * 1.8;",
    "  float dots = step(0.985, hash(floor(vec3(cs*70.0, t*34.0)))) * step(0.08, t);",
    "  emi += cHot * dots * (0.4 + 0.6*sin(uTime*3.0 + cell));",
    "  float limb = smoothstep(0.80, 1.0, t);",
    "  iris = mix(iris, cDeep*0.35, limb);",
    "  emi *= 1.0 - limb*0.85;",
    /* pupila com ponto de luz */
    "  vec3 pupil = vec3(0.003,0.006,0.016);",
    "  float core = exp(-pow(polar/(uPupil*0.20), 2.0));",
    "  vec3 pemi = vec3(0.80,0.92,1.0)*core*(1.4 + uFocus*0.8)*uCore + cCyan*exp(-pow(polar/(uPupil*0.75), 2.0))*0.12*uCore;",
    "  float prings = smoothstep(0.94, 1.0, sin(polar*170.0 - uTime*2.8)) * smoothstep(uPupil, uPupil*0.4, polar);",
    "  pemi += cCyan*prings*(0.05 + uGlow*0.12);",
    "  float inIris = 1.0 - smoothstep(uIris - 0.012, uIris + 0.012, polar);",
    "  float inPupil = 1.0 - smoothstep(uPupil - 0.008, uPupil + 0.008, polar);",
    "  vec3 base = mix(sclera, iris, inIris);",
    "  base = mix(base, pupil, inPupil);",
    "  emi = mix(emi*inIris, pemi, inPupil);",
    "  float diff = 0.25 + 0.8*max(dot(N, L), 0.0);",
    "  vec3 col = base*diff;",
    "  float rim = 1.0 - max(dot(N, V), 0.0);",
    "  col *= 1.0 - pow(rim, 1.6)*0.8;",
    "  col += emi + vec3(0.2,0.4,0.9)*pow(rim, 4.0)*0.35;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var CORNEA_FRAG = [
    "uniform vec3 uLight; uniform vec3 uLight2; uniform float uIris; uniform float uTime;",
    "varying vec3 vLocal; varying vec3 vN; varying vec3 vView;",
    "void main(){",
    "  vec3 N = normalize(vN); vec3 V = normalize(vView);",
    "  vec3 H1 = normalize(normalize(uLight) + V); vec3 H2 = normalize(normalize(uLight2) + V);",
    "  float shimmer = 0.9 + 0.1*sin(uTime*1.7 + vLocal.x*9.0 + vLocal.y*7.0);",
    "  float s1 = pow(max(dot(N, H1), 0.0), 340.0) * 2.0 * shimmer;",
    "  float s2 = pow(max(dot(N, H2), 0.0), 120.0) * 0.5;",
    "  float s3 = pow(max(dot(N, H1), 0.0), 18.0) * 0.08;",
    "  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);",
    "  float overIris = 1.0 - smoothstep(uIris, uIris + 0.3, acos(clamp(vLocal.z, -1.0, 1.0)));",
    "  vec3 c = vec3(0.92,0.96,1.0)*(s1 + s2) + vec3(0.6,0.8,1.0)*s3*overIris + vec3(0.25,0.45,0.95)*fres*0.25;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  var LID_FRAG = [
    "uniform float uTime; uniform float uOpen; uniform float uFade; uniform float uSquint; uniform vec2 uGaze; uniform vec3 uSkin;",
    "varying vec2 vUv;",
    NOISE,
    "void main(){",
    "  vec2 p = (vUv - 0.5) * 5.0;",
    "  float w = 1.0;",
    "  float q = clamp(p.x / w, -1.0, 1.0);",
    "  float f = pow(max(1.0 - q*q, 0.0), 0.72);",
    "  float open = uOpen * (1.0 - uSquint*0.28);",
    "  float up = (0.64*f - 0.02)*open + 0.05*f - uGaze.y*0.26*f;",
    "  float lo = -(0.50*f - 0.02)*open*(1.0 - uSquint*0.15) + 0.02 - uGaze.y*0.12*f;",
    "  float dUp = up - p.y; float dLo = p.y - lo;",
    "  float inside = smoothstep(0.0, 0.035, dUp) * smoothstep(0.0, 0.035, dLo) * step(abs(p.x), w);",
    "  float r = length(p*vec2(uSkin.x, 1.0));",
    "  float skinMask = 1.0 - smoothstep(uSkin.y, uSkin.z, r);",
    "  vec3 skin = vec3(0.020,0.028,0.050) * (0.7 + 0.6*fbm(vec3(p*6.0, 1.3)));",
    "  skin += vec3(0.05,0.09,0.17) * smoothstep(1.2, -0.6, length(p - vec2(-0.6, 0.9))) * 0.6;",
    "  float crease = exp(-pow((p.y - (up + 0.28*f + 0.05))/0.07, 2.0)) * f;",
    "  skin *= 1.0 - crease*0.5;",
    "  float margin = (exp(-pow(dUp/0.012, 2.0)) + exp(-pow(dLo/0.012, 2.0))*0.6) * step(abs(p.x), w*0.95);",
    "  float above = -dUp;",
    "  float lashZone = smoothstep(0.0, 0.03, above) * (1.0 - smoothstep(0.03, 0.32*f + 0.02, above)) * step(abs(p.x), w);",
    "  float lash = smoothstep(0.55, 0.95, noise(vec3(p.x*38.0 + above*12.0*sign(p.x), above*4.0, 2.0)));",
    "  vec3 col = mix(skin, vec3(0.01,0.012,0.02), lashZone*0.75);",
    "  col += vec3(0.30,0.48,0.85)*lash*lashZone*0.28;",
    "  col += vec3(0.55,0.75,1.0)*margin*0.18;",
    "  vec3 cell = floor(vec3(p*48.0, 7.0));",
    "  float tw = 0.5 + 0.5*sin(uTime*2.0 + hash(cell + 3.0)*30.0);",
    "  col += vec3(0.35,0.6,1.0) * step(0.988, hash(cell)) * tw * 1.2;",
    "  col += vec3(1.0,0.8,0.45) * step(0.997, hash(cell + 11.0)) * tw;",
    "  float aSkin = (1.0 - inside) * skinMask;",
    "  float sh = (1.0 - smoothstep(0.0, 0.22, min(dUp, dLo))) * inside;",
    "  float alpha = max(aSkin, sh*0.75);",
    "  vec3 outc = col * (aSkin / max(alpha, 0.0001));",
    "  gl_FragColor = vec4(outc, alpha * uFade);",
    "}"
  ].join("\n");

  var AURA_FRAG = [
    "uniform float uGlow; varying vec2 vUv;",
    "void main(){ float d = length(vUv - 0.5); float a = pow(smoothstep(0.5, 0.0, d), 2.2);",
    "  float k = a * (0.30 + uGlow*0.5);",
    "  gl_FragColor = vec4(vec3(0.15,0.35,0.9) * k, k*0.8); }"
  ].join("\n");

  var DUST_VERT = [
    "attribute float aSize; attribute float aPhase; attribute float aGold;",
    "uniform float uTime; uniform float uPR; varying float vA; varying float vGold;",
    "void main(){",
    "  vec3 p = position + vec3(sin(uTime*0.3 + aPhase), cos(uTime*0.25 + aPhase*1.3), 0.0)*0.05;",
    "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
    "  gl_PointSize = aSize * uPR * (180.0 / max(0.5, -mv.z));",
    "  vA = 0.25 + 0.75*(0.5 + 0.5*sin(uTime*1.4 + aPhase));",
    "  vGold = aGold;",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");
  var DUST_FRAG = [
    "uniform float uOpacity; varying float vA; varying float vGold;",
    "void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);",
    "  if (a < 0.01) discard;",
    "  vec3 c = mix(vec3(0.35,0.62,1.0), vec3(1.0,0.80,0.48), vGold);",
    "  float k = a * a * vA * uOpacity;",
    "  gl_FragColor = vec4(c * k, k); }"
  ].join("\n");

  /* dados que se organizam: dispersos → uma linha → três núcleos → a íris */
  var DATA_VERT = [
    "attribute vec3 aB; attribute vec3 aC; attribute vec3 aD; attribute float aK;",
    "attribute float aPhase; attribute float aSize; attribute float aGold; attribute float aDelay;",
    "uniform float uTime; uniform float uS; uniform float uPR; uniform float uFade; uniform vec2 uHalf; uniform float uIso; uniform float uVert;",
    "varying float vA; varying float vGold;",
    "vec3 fA(){ return position*vec3(uHalf, 1.6); }",
    "vec3 fB(){ vec3 b = aB; b.y += 0.10*sin(b.x*3.0 + uTime*0.8); return b*vec3(uHalf.x, uHalf.y*0.9, 1.0); }",
    "vec3 fC(){ vec2 c = mix(vec2(aK*0.9, 0.0), vec2(0.0, -aK*0.95), uVert); return vec3(c + aC.xy*0.34, aC.z*0.34)*uIso; }",
    "vec3 fD(){ float r = uTime*0.06; float cs = cos(r); float sn = sin(r);",
    "  vec2 d = vec2(aD.x*cs - aD.y*sn, aD.x*sn + aD.y*cs); return vec3(d, aD.z)*uIso; }",
    "void main(){",
    "  float s = clamp(uS - aDelay*0.4, 0.0, 3.0);",
    "  vec3 p;",
    "  if (s < 1.0) p = mix(fA(), fB(), smoothstep(0.0, 1.0, s));",
    "  else if (s < 2.0) p = mix(fB(), fC(), smoothstep(0.0, 1.0, s - 1.0));",
    "  else p = mix(fC(), fD(), smoothstep(0.0, 1.0, s - 2.0));",
    "  float calm = smoothstep(0.0, 1.0, s);",
    "  p += vec3(sin(uTime*0.7 + aPhase), cos(uTime*0.6 + aPhase*1.3), sin(uTime*0.5 + aPhase*0.7)) * mix(0.09, 0.015, calm);",
    "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
    "  gl_PointSize = aSize * uPR * (118.0 / max(0.5, -mv.z));",
    "  vA = (0.4 + 0.6*(0.5 + 0.5*sin(uTime*1.6 + aPhase))) * uFade;",
    "  vGold = aGold;",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  /* ---------------- construção de um olho ---------------- */
  function buildEye(THREE, scene, hi) {
    var seg = hi ? 128 : 80;
    var light1 = new THREE.Vector3(-0.55, 0.65, 0.9);
    var light2 = new THREE.Vector3(0.7, -0.35, 0.8);
    var rig = new THREE.Group(), look = new THREE.Group();
    rig.add(look); scene.add(rig);

    var U = {
      uTime: { value: 0 }, uPupil: { value: 0.24 }, uIris: { value: 0.62 }, uGlow: { value: 0 },
      uFocus: { value: 0 }, uRipple: { value: 0 }, uRippleT: { value: 0 }, uCore: { value: 1 }, uLight: { value: light1 }
    };
    var eye = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)),
      new THREE.ShaderMaterial({ uniforms: U, vertexShader: SPHERE_VERT, fragmentShader: EYE_FRAG }));
    look.add(eye);

    var cornea = new THREE.Mesh(new THREE.SphereGeometry(1.013, seg, Math.round(seg * 0.75)),
      new THREE.ShaderMaterial({
        uniforms: { uLight: { value: light1 }, uLight2: { value: light2 }, uIris: U.uIris, uTime: U.uTime },
        vertexShader: SPHERE_VERT, fragmentShader: CORNEA_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
    cornea.renderOrder = 1;
    look.add(cornea);

    var LU = { uTime: U.uTime, uOpen: { value: 1 }, uFade: { value: 1 }, uSquint: { value: 0 }, uGaze: { value: new THREE.Vector2() }, uSkin: { value: hi ? new THREE.Vector3(0.78, 1.5, 2.3) : new THREE.Vector3(0.9, 0.95, 1.25) } };
    var lids = new THREE.Mesh(new THREE.PlaneGeometry(5, 5),
      new THREE.ShaderMaterial({ uniforms: LU, vertexShader: PLANE_VERT, fragmentShader: LID_FRAG, transparent: true, depthWrite: false }));
    lids.position.z = 1.03; lids.renderOrder = 2;
    rig.add(lids);

    var aura = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4),
      new THREE.ShaderMaterial({ uniforms: { uGlow: U.uGlow }, vertexShader: PLANE_VERT, fragmentShader: AURA_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.position.z = -0.9; aura.renderOrder = -1;
    rig.add(aura);

    /* comportamento */
    var st = {
      yaw: 0, pitch: 0, pupil: 0.24, open: 1, squint: 0, focus: 0,
      sacX: 0, sacY: 0, sacNext: 0, blinkAt: performance.now() + 1800, blinkT: -1, dbl: false,
      ripple: 0, rippleT: 0, lastClick: 0, lx: 0, ly: 0
    };

    function blinkCurve(ms) { /* 0 aberto → 1 fechado */
      if (ms < 0) return 0;
      if (ms < 85) return ms / 85;
      if (ms < 125) return 1;
      if (ms < 280) return 1 - (ms - 125) / 155;
      return 0;
    }

    /* opts: { now, screenX, screenY, lookW, dilate, open, fade, core, glow } */
    function update(o) {
      var now = o.now, t = now / 1000;
      U.uTime.value = t;
      var idle = !S.has || now - S.last > 2600;

      /* olhar: do centro do olho na tela até o cursor */
      var dx = (S.x - o.screenX) / (innerWidth * 0.5);
      var dy = (S.y - o.screenY) / (innerHeight * 0.5);
      var tyaw = clamp(dx * 0.85, -0.72, 0.72), tpitch = clamp(dy * 0.6, -0.42, 0.42);
      if (idle) { tyaw *= 0.2; tpitch *= 0.2; }
      if (!REDUZ && now > st.sacNext) {
        var big = idle && Math.random() < 0.5;
        st.sacX = (Math.random() - 0.5) * (big ? 0.75 : 0.07);
        st.sacY = (Math.random() - 0.5) * (big ? 0.40 : 0.05);
        st.sacNext = now + (big ? 1300 : 450) + Math.random() * 2300;
      }
      var lw = o.lookW == null ? 1 : o.lookW;
      var k = REDUZ ? 1 : 0.14;
      st.yaw += ((tyaw + st.sacX) * lw - st.yaw) * k;
      st.pitch += ((tpitch + st.sacY) * lw - st.pitch) * k;
      look.rotation.y = st.yaw;
      look.rotation.x = st.pitch;

      /* luz (e o reflexo) acompanha o cursor */
      var lx = clamp(dx, -1, 1), ly = clamp(dy, -1, 1);
      st.lx += (lx - st.lx) * 0.05; st.ly += (ly - st.ly) * 0.05;
      light1.set(-0.55 + st.lx * 0.35, 0.65 - st.ly * 0.3, 0.9);

      /* foco: cursor sobre algo clicável */
      st.focus += (S.focusT - st.focus) * 0.08;
      U.uFocus.value = st.focus;

      /* clique: contração + onda de luz */
      if (S.click > st.lastClick) { st.lastClick = S.click; st.ripple = 1; st.rippleT = 0; }
      st.ripple *= 0.975; st.rippleT = Math.min(1.2, st.rippleT + 0.022);
      U.uRipple.value = st.ripple; U.uRippleT.value = st.rippleT;
      var clickC = Math.max(0, 1 - (now - st.lastClick) / 700);

      /* pupila: hippus, foco, clique, mergulho */
      S.speed *= 0.92; S.scrollV *= 0.94;
      var pTarget = 0.235 + (REDUZ ? 0 : 0.012 * Math.sin(t * 0.85) + 0.006 * Math.sin(t * 2.3))
        - st.focus * 0.035 - clickC * 0.07 + (o.dilate || 0);
      st.pupil += (clamp(pTarget, 0.13, 0.55) - st.pupil) * (REDUZ ? 1 : 0.09);
      U.uPupil.value = st.pupil;
      U.uGlow.value = (o.glow || 0) + st.ripple * 0.4;
      U.uCore.value = o.core == null ? 1 : o.core;

      /* pálpebras: piscar, apertar, arregalar */
      var bl = 0;
      if (!REDUZ) {
        if (now > st.blinkAt && st.blinkT < 0) { st.blinkT = now; st.dbl = Math.random() < 0.2; }
        if (st.blinkT >= 0) {
          var ms = now - st.blinkT;
          bl = blinkCurve(ms);
          if (st.dbl && ms > 280) bl = blinkCurve(ms - 300);
          if (ms > (st.dbl ? 600 : 300)) { st.blinkT = -1; st.blinkAt = now + 2600 + Math.random() * 4200; }
        }
      }
      var wide = Math.min(1, S.scrollV * 1.4);
      var openT = (o.open == null ? 1 : o.open) * (1 + wide * 0.16);
      st.open += (openT - st.open) * 0.12;
      st.squint += (Math.max(st.focus * 0.55, S.speed * 0.25) - st.squint) * 0.08;
      LU.uOpen.value = st.open * (1 - bl);
      LU.uSquint.value = st.squint;
      LU.uFade.value = o.fade == null ? 1 : o.fade;
      LU.uGaze.value.set(st.yaw, st.pitch);
    }

    return { rig: rig, look: look, lids: lids, aura: aura, update: update, U: U };
  }

  function buildDust(THREE, count, spread, depthOff) {
    var pos = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count), gold = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var r = 1.7 + Math.pow(Math.random(), 0.7) * spread;
      var th = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(th) * 0.7;
      pos[i * 3 + 2] = r * Math.cos(phi) - depthOff;
      size[i] = 0.5 + Math.random() * 2.2; ph[i] = Math.random() * 6.283; gold[i] = Math.random() < 0.28 ? 1 : 0;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("aGold", new THREE.BufferAttribute(gold, 1));
    var U = { uTime: { value: 0 }, uPR: { value: 1 }, uOpacity: { value: 0.85 } };
    var pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    return { points: pts, U: U };
  }

  function buildData(THREE, count) {
    var A = new Float32Array(count * 3), B = new Float32Array(count * 3), C = new Float32Array(count * 3), D = new Float32Array(count * 3);
    var K = new Float32Array(count), ph = new Float32Array(count), sz = new Float32Array(count), gold = new Float32Array(count), dl = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var j = i * 3;
      /* A: dispersos */
      A[j] = Math.random() * 2 - 1; A[j + 1] = Math.random() * 2 - 1; A[j + 2] = Math.random() * 2 - 1.3;
      /* B: uma linha (uma leitura) */
      var x = Math.random() * 2 - 1;
      B[j] = x; B[j + 1] = 0.22 * Math.sin(x * 4.2) + (Math.random() - 0.5) * 0.05; B[j + 2] = (Math.random() - 0.5) * 0.25;
      /* C: três núcleos */
      K[i] = (i % 3) - 1;
      var u = Math.random(), v = Math.random(), rr = Math.cbrt(Math.random());
      var th = u * Math.PI * 2, phi = Math.acos(2 * v - 1);
      C[j] = rr * Math.sin(phi) * Math.cos(th); C[j + 1] = rr * Math.sin(phi) * Math.sin(th); C[j + 2] = rr * Math.cos(phi);
      /* D: a íris (decisão) */
      var ang = Math.random() * Math.PI * 2;
      var rad = (0.30 + Math.pow(Math.random(), 0.8) * 0.68) * 0.84;
      if (Math.random() < 0.12) rad = (0.30 + Math.random() * 0.03) * 0.84;
      D[j] = Math.cos(ang) * rad; D[j + 1] = Math.sin(ang) * rad; D[j + 2] = (Math.random() - 0.5) * 0.08;
      ph[i] = Math.random() * 6.283; sz[i] = 0.7 + Math.random() * 2.3; gold[i] = Math.random() < 0.18 ? 1 : 0; dl[i] = Math.random();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(A, 3));
    g.setAttribute("aB", new THREE.BufferAttribute(B, 3));
    g.setAttribute("aC", new THREE.BufferAttribute(C, 3));
    g.setAttribute("aD", new THREE.BufferAttribute(D, 3));
    g.setAttribute("aK", new THREE.BufferAttribute(K, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    g.setAttribute("aGold", new THREE.BufferAttribute(gold, 1));
    g.setAttribute("aDelay", new THREE.BufferAttribute(dl, 1));
    var U = { uTime: { value: 0 }, uS: { value: 0 }, uPR: { value: 1 }, uFade: { value: 0 }, uHalf: { value: new THREE.Vector2(3, 1.7) }, uIso: { value: 1.6 }, uVert: { value: 0 }, uOpacity: { value: 0.85 } };
    var pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: DATA_VERT,
      fragmentShader: DUST_FRAG.replace("uniform float uOpacity;", "uniform float uOpacity;"),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    return { points: pts, U: U };
  }

  function makeRenderer(THREE, canvas) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2));
    return r;
  }

  function runWhenVisible(el, frame) {
    var running = false, visible = true;
    function loop(now) { if (!running) return; frame(now); requestAnimationFrame(loop); }
    function start() { if (running) return; running = true; requestAnimationFrame(loop); }
    function stop() { running = false; }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible && !document.hidden) start(); else stop(); }, { rootMargin: "120px" }).observe(el);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (visible) start(); });
    start();
  }

  /* =====================================================================
     MINI — olho que observa (topo das páginas, CTA)
     ===================================================================== */
  function mini(box) {
    var canvas = box.querySelector("canvas");
    if (!canvas || !webglOk()) { root.classList.add("no-webgl"); return; }
    var THREE = window.THREE, renderer;
    try { renderer = makeRenderer(THREE, canvas); } catch (e) { root.classList.add("no-webgl"); return; }
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100); camera.position.set(0, 0, 6);
    var E = buildEye(THREE, scene, false);
    var D = buildDust(THREE, TOUCH ? 90 : 170, 2.2, 0.4); scene.add(D.points);
    D.U.uPR.value = renderer.getPixelRatio();

    function resize() {
      var r = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas); else addEventListener("resize", resize);
    resize();

    function frame(now) {
      var r = canvas.getBoundingClientRect();
      var q = clamp(1 - (r.top + r.height / 2) / innerHeight, -0.2, 1.2); /* 0 = entrando por baixo, 1 = saindo por cima */
      var near = 1 - Math.abs(q - 0.5) * 2;                               /* 1 = no centro da tela */
      var t = now / 1000;
      E.rig.scale.setScalar(1.15 + (REDUZ ? 0 : near * 0.06));
      E.rig.position.y = REDUZ ? 0 : Math.sin(t * 0.6) * 0.02;
      E.rig.rotation.z = REDUZ ? 0 : Math.sin(t * 0.3) * 0.025;
      E.update({ now: now, screenX: r.left + r.width / 2, screenY: r.top + r.height / 2, dilate: near * 0.03, open: 0.96 + near * 0.06, glow: near * 0.2 });
      D.U.uTime.value = t; D.points.rotation.y = t * 0.03;
      renderer.render(scene, camera);
    }
    if (REDUZ) { frame(performance.now()); addEventListener("resize", function () { frame(performance.now()); }); }
    else runWhenVisible(canvas, frame);
  }

  /* =====================================================================
     STAGE — Home: do card para fora da tela, da pupila para os dados
     ===================================================================== */
  function stage(o) {
    var sec = o.section, canvas = o.canvas, card = o.card;
    var gl = !REDUZ && webglOk();
    if (!gl) {
      root.classList.add("cine-off");
      if (!webglOk()) root.classList.add("no-webgl");
      if (REDUZ && webglOk()) staticEye(o);
      return;
    }
    var THREE = window.THREE, renderer;
    try { renderer = makeRenderer(THREE, canvas); } catch (e) { root.classList.add("cine-off", "no-webgl"); return; }
    var PR = renderer.getPixelRatio();
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100); camera.position.set(0, 0, 6);
    var E = buildEye(THREE, scene, true);
    var dust = buildDust(THREE, TOUCH ? 300 : 700, 6.5, 1.5); scene.add(dust.points); dust.U.uPR.value = PR;
    var data = buildData(THREE, TOUCH ? 900 : 2000); scene.add(data.points); data.U.uPR.value = PR;
    var dataRig = data.points;

    var W = 1, H = 1, aspect = 1, halfH = Math.tan(16 * Math.PI / 180) * 6, halfW = halfH;
    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height); aspect = W / H;
      renderer.setSize(W, H, false); camera.aspect = aspect; camera.updateProjectionMatrix();
      halfW = halfH * aspect;
      var narrow = aspect < 0.9;
      data.U.uHalf.value.set(halfW * 0.76, halfH * (narrow ? 0.62 : 0.72));
      data.U.uIso.value = Math.min(halfW, halfH) * (narrow ? 0.92 : 0.8);
      data.U.uVert.value = narrow ? 1 : 0;
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas); else addEventListener("resize", resize);
    resize();

    var p = 0;
    function readP() {
      var r = sec.getBoundingClientRect();
      p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
    }
    addEventListener("scroll", readP, { passive: true }); readP();

    var steps = o.steps || [], rail = o.rail ? o.rail.querySelectorAll("span") : [];
    var labels = o.labels ? o.labels.querySelectorAll("span") : [];
    var v3 = new THREE.Vector3();

    function setStep(el, v) {
      if (!el) return;
      el.style.opacity = v.toFixed(3);
      el.style.transform = "translate3d(0," + ((1 - v) * 24).toFixed(1) + "px,0)";
      el.style.visibility = v > 0.01 ? "visible" : "hidden";
    }

    function frame(now) {
      var t = now / 1000;
      readP();
      var narrow = aspect < 0.9;

      /* fases */
      var a = ease(p / 0.13);                 /* o olho sai do card e avança */
      var b = ease(p / 0.16);                 /* o escuro cresce junto com o olho e toma a tela */
      var c = ease((p - 0.30) / 0.12);        /* mergulho na pupila */
      var dataIn = smooth(0.38, 0.45, p);
      var s = ease((p - 0.50) / 0.08) + ease((p - 0.64) / 0.08) + ease((p - 0.80) / 0.08);

      /* onde está o card agora (posição de partida do olho) */
      var cr = card.getBoundingClientRect(), vr = canvas.getBoundingClientRect();
      var cx = (cr.left + cr.width * 0.56 - vr.left) / vr.width * 2 - 1;
      var cy = -((cr.top + cr.height * 0.40 - vr.top) / vr.height * 2 - 1);
      var cardScale = (cr.width / vr.width) * 2 * halfW * 0.72 / 2.0;
      var zA = narrow ? 1.0 : 2.3;
      var zDive = 6 - 1.0 - 0.055;
      var ex = lerp(cx * halfW, 0, a), ey = lerp(cy * halfH, 0, a);
      var ez = lerp(0, zA, a) + (zDive - zA) * c;
      var sc = lerp(cardScale, 1, a);
      E.rig.position.set(ex, ey + (1 - c) * Math.sin(t * 0.6) * 0.015 * sc, ez);
      E.rig.scale.setScalar(sc);
      E.rig.rotation.z = (1 - a) * Math.sin(t * 0.3) * 0.02;
      E.rig.visible = p < 0.445;

      /* olho: posição na tela para mirar o cursor */
      v3.set(ex, ey, ez).project(camera);
      var sx = vr.left + (v3.x * 0.5 + 0.5) * vr.width, sy = vr.top + (-v3.y * 0.5 + 0.5) * vr.height;
      E.update({
        now: now, screenX: sx, screenY: sy,
        lookW: 1 - Math.max(c, a * 0.6),
        dilate: a * 0.06 + c * 0.28,
        open: 1 + c * 0.6,
        fade: 1 - smooth(0.0, 0.6, c),
        core: 1 - c * 0.92,
        glow: a * 0.35 + c * 0.5
      });

      /* poeira corre em direção à câmera */
      dust.U.uTime.value = t;
      dust.points.position.z = a * 1.5 + c * 4.5;
      dust.points.rotation.y = t * 0.02;
      dust.U.uOpacity.value = 0.85 * smooth(0.01, 0.1, p) * (1 - dataIn * 0.6);

      /* dados */
      data.U.uTime.value = t; data.U.uS.value = s; data.U.uFade.value = dataIn;
      dataRig.visible = dataIn > 0.001;
      dataRig.position.set(narrow ? 0 : halfW * 0.2, narrow ? halfH * 0.24 : halfH * 0.14, 0);
      dataRig.rotation.y = Math.sin(t * 0.15) * 0.22 * (1 - smooth(2.2, 3, s) * 0.6);
      dataRig.rotation.x = Math.sin(t * 0.11) * 0.06;

      /* câmera com paralaxe dentro da pupila */
      var mx = S.has ? (S.x / innerWidth - 0.5) : 0, my = S.has ? (S.y / innerHeight - 0.5) : 0;
      camera.position.x = lerp(0, mx * 0.5, dataIn); camera.position.y = lerp(0, -my * 0.3, dataIn);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      /* camadas de DOM */
      var fadeHero = 1 - smooth(0, 0.07, p);
      if (o.copy) { o.copy.style.opacity = fadeHero.toFixed(3); o.copy.style.transform = "translate3d(0," + (-(1 - fadeHero) * 60).toFixed(1) + "px,0)"; o.copy.style.visibility = fadeHero > 0.01 ? "visible" : "hidden"; }
      if (o.cardDeco) { var f2 = 1 - smooth(0, 0.05, p); for (var i = 0; i < o.cardDeco.length; i++) o.cardDeco[i].style.opacity = f2.toFixed(3); }
      if (o.cue) o.cue.style.opacity = (1 - smooth(0, 0.03, p)).toFixed(3);
      if (o.dark) {
        var il = cr.left - vr.left, it = cr.top - vr.top, ir = vr.right - cr.right, ib = vr.bottom - cr.bottom;
        var clip = "inset(" + (it * (1 - b)).toFixed(1) + "px " + (ir * (1 - b)).toFixed(1) + "px " + (ib * (1 - b)).toFixed(1) + "px " + (il * (1 - b)).toFixed(1) + "px)";
        o.dark.style.clipPath = clip;
        canvas.style.clipPath = b > 0.999 ? "none" : clip;
        o.dark.style.opacity = p > 0.0005 ? "1" : "0";
      }
      if (o.skip) o.skip.classList.toggle("on-dark-mode", b > 0.5);
      if (o.header) o.header.classList.toggle("over-dark", b > 0.5 && p < 0.999);

      var wins = [win(p, 0.15, 0.30), win(p, 0.44, 0.57), win(p, 0.58, 0.71), win(p, 0.74, 0.86), smooth(0.89, 0.92, p)];
      for (var w = 0; w < steps.length; w++) setStep(steps[w], wins[w] || 0);
      if (o.rail) {
        o.rail.style.opacity = (smooth(0.12, 0.17, p)).toFixed(3);
        var cur = p < 0.43 ? 0 : p < 0.575 ? 1 : p < 0.725 ? 2 : p < 0.87 ? 3 : 4;
        for (var rI = 0; rI < rail.length; rI++) rail[rI].classList.toggle("on", rI === cur);
      }
      /* rótulos das três frentes, presos aos núcleos */
      if (labels.length) {
        var lv = win(p, 0.75, 0.86);
        var iso = data.U.uIso.value, vert = data.U.uVert.value;
        for (var l = 0; l < labels.length; l++) {
          var kk = l - 1;
          var lx = vert ? 0 : kk * 0.9 * iso, ly = vert ? -kk * 0.95 * iso : 0;
          v3.set(lx + dataRig.position.x, ly + dataRig.position.y - 0.42 * iso, 0).project(camera);
          labels[l].style.left = ((v3.x * 0.5 + 0.5) * vr.width).toFixed(1) + "px";
          labels[l].style.top = ((-v3.y * 0.5 + 0.5) * vr.height).toFixed(1) + "px";
          labels[l].style.opacity = lv.toFixed(3);
        }
      }
    }
    runWhenVisible(sec, frame);
  }

  /* movimento reduzido: um quadro parado do olho dentro do card */
  function staticEye(o) {
    var box = o.card;
    var cv = document.createElement("canvas");
    cv.className = "cine-canvas"; cv.style.position = "absolute"; cv.style.inset = "0";
    box.appendChild(cv);
    var THREE = window.THREE, renderer;
    try { renderer = makeRenderer(THREE, cv); } catch (e) { return; }
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100); camera.position.set(0, 0, 6);
    var E = buildEye(THREE, scene, true);
    function draw() {
      var r = cv.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
      var halfH = Math.tan(16 * Math.PI / 180) * 6;
      E.rig.position.set(0.15 * halfH * camera.aspect, 0.2 * halfH, 0);
      E.rig.scale.setScalar(Math.min(1, camera.aspect * 0.9));
      E.update({ now: 0, screenX: r.left + r.width / 2, screenY: r.top + r.height / 2, lookW: 0 });
      renderer.render(scene, camera);
    }
    draw(); addEventListener("resize", draw);
  }

  window.ArgusEye = { stage: stage, mini: mini };
})();
