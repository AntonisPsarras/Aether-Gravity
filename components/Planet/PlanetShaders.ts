
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { extend } from '@react-three/fiber';
import { relativityChunk } from '../shaders/relativityChunk';

// --- SHARED NOISE CHUNK ---
const noise3DChunk = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) { 
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i); 
  vec4 p = permute(permute(permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857; 
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); 
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_); 
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

float fbm(vec3 x, int octaves) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 8; ++i) {
    if(i >= octaves) break;
    v += a * snoise(x);
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
`;

const voronoiChunk = `
// Hash function
vec3 hash3( vec3 p ) {
	p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
			  dot(p,vec3(269.5,183.3,246.1)),
			  dot(p,vec3(113.5,271.9,124.6)));
	return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

// 3D Voronoi: returns distance to closest center (F1)
float voronoi( in vec3 x ) {
    vec3 n = floor( x );
    vec3 f = fract( x );
    float F1 = 8.0;
    for( int k=-1; k<=1; k++ )
    for( int j=-1; j<=1; j++ )
    for( int i=-1; i<=1; i++ ) {
        vec3 g = vec3(float(i),float(j),float(k));
        vec3 o = hash3( n + g ) * 0.5 + 0.5; // Jitter
        vec3 r = g - f + o;
        float d = dot(r,r);
        if( d < F1 ) {
            F1 = d;
        }
    }
    return sqrt(F1);
}
`;

/**
 * Terrain helpers. Requires noise3DChunk (snoise/fbm) to be included first.
 *
 * Plain fbm gives rounded, blobby continents. Ridged noise (1 - |n|, squared)
 * produces the creased shapes of real orogeny, and warping the sample point by
 * another noise field before evaluating breaks up the grid-aligned look that
 * simplex noise has at low octave counts.
 */
const terrainChunk = `
float ridgedFbm(vec3 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float weight = 1.0;
  for (int i = 0; i < 8; ++i) {
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(p));
    n *= n;
    n *= weight;
    weight = clamp(n * 2.0, 0.0, 1.0);
    v += a * n;
    p = p * 2.07 + vec3(37.1, 11.7, 91.3);
    a *= 0.5;
  }
  return v * 2.0 - 1.0;
}

vec3 domainWarp(vec3 p, float amount, float seed) {
  vec3 q = vec3(
    snoise(p + vec3(seed, 0.0, 0.0)),
    snoise(p + vec3(5.2, 1.3 + seed, 0.0)),
    snoise(p + vec3(0.0, 9.2 + seed, 3.7))
  );
  return p + q * amount;
}
`;

/**
 * Composition-driven appearance.
 *
 * These map the body's real primaries — the three mass fractions from
 * `properties.compositionIron/Silicates/Water` and its equilibrium (or
 * effective) temperature in kelvin — onto surface colour, roughness and cloud
 * cover. Everything blends continuously so dragging an Inspector slider moves
 * the appearance smoothly rather than snapping between presets.
 *
 * These are appearance functions only: they read the physics, never feed it.
 */
const compositionChunk = `
/**
 * Phase of the volatile (water) budget as a smooth 0-3 coordinate:
 *   0 = ice, 1 = liquid, 2 = vapour, 3 = silicate melt.
 * Break points are the real ones — the triple/melting point at 273 K, the
 * 1 bar boiling point at 373 K, and a basalt solidus near 1400 K.
 */
float waterPhase(float tempK) {
  float ice   = smoothstep(233.0, 278.0, tempK);        // ice -> liquid
  float boil  = smoothstep(360.0, 480.0, tempK);        // liquid -> vapour
  float melt  = smoothstep(1150.0, 1600.0, tempK);      // rock -> magma
  return ice + boil + melt;
}

/** Dry-rock albedo from the metal/silicate split, weathered by temperature. */
vec3 rockAlbedo(float iron, float silicate, float tempK) {
  float total = max(iron + silicate, 1e-3);
  float fe = iron / total;

  // Iron-rich crust: dark, red-brown, oxidised at moderate temperature.
  vec3 ironCold = vec3(0.145, 0.105, 0.092);
  vec3 ironWarm = vec3(0.315, 0.148, 0.086);   // hematite / Martian regolith
  vec3 ironRock = mix(ironCold, ironWarm, smoothstep(150.0, 400.0, tempK));

  // Silicate crust: grey basalt when cold and fresh, tan regolith when baked.
  vec3 basalt = vec3(0.222, 0.216, 0.205);
  vec3 regolith = vec3(0.452, 0.396, 0.313);
  vec3 silRock = mix(basalt, regolith, smoothstep(180.0, 520.0, tempK));

  vec3 rock = mix(silRock, ironRock, fe);

  // Cold outer-system surfaces redden as irradiated organics (tholins) build up.
  float tholin = (1.0 - smoothstep(60.0, 190.0, tempK)) * 0.55;
  rock = mix(rock, vec3(0.352, 0.168, 0.106), tholin);

  // Above the solidus everything darkens toward fresh basalt before glowing.
  rock = mix(rock, vec3(0.085, 0.070, 0.065), smoothstep(900.0, 1400.0, tempK));
  return rock;
}

/** Ocean colour: deep water is blue, shallow water green, brine warmer. */
vec3 oceanColor(float depth01, float tempK) {
  vec3 shallow = vec3(0.055, 0.230, 0.268);
  vec3 deep    = vec3(0.008, 0.045, 0.128);
  vec3 c = mix(shallow, deep, clamp(depth01, 0.0, 1.0));
  // Hot oceans go murky-teal as they approach the boiling point.
  return mix(c, vec3(0.115, 0.205, 0.180), smoothstep(320.0, 400.0, tempK));
}

/** Ice colour: bright and blue-white when fresh, dust-grey when old or warm. */
vec3 iceColor(float freshness, float tempK) {
  vec3 fresh = vec3(0.880, 0.925, 0.965);
  vec3 old   = vec3(0.545, 0.585, 0.625);
  vec3 c = mix(old, fresh, clamp(freshness, 0.0, 1.0));
  // Near the melting point ice greys out with meltwater and entrained dust.
  return mix(c, c * vec3(0.86, 0.84, 0.82), smoothstep(240.0, 273.0, tempK));
}

/**
 * Surface volatile budget: how much of the body can be ocean, cap or cloud.
 * Deliberately not the bulk water mass fraction — Earth's oceans are ~0.02% of
 * its mass, so composition rounds to zero for it while 71% of the surface is
 * water. uWaterLevel is the hydrosphere dial; bulk water adds on top, because a
 * body that is a third ice by mass is drowned wherever the dial sits.
 * Mirrored by surfaceVolatilesFor in utils/bodyAppearance.ts.
 */
float surfaceVolatiles(float waterLevel, float compWater) {
  return clamp(clamp(waterLevel, 0.0, 1.0) + clamp(compWater, 0.0, 1.0) * 1.2, 0.0, 1.0);
}

/**
 * Fraction of the disc under cloud. Proxy for column water vapour: needs both
 * an atmosphere to hold it and a volatile reservoir to evaporate, and rises
 * steeply once surface temperature clears the melting point. Mirrored by
 * cloudCoverFor in utils/bodyAppearance.ts.
 */
float cloudCoverFrom(float atmosphere, float volatiles, float tempK) {
  // Past ~1100 K the water is dissociated and gone, so both the vapour term and
  // the Venus-style runaway have to fade out together.
  float volatilesRemain = 1.0 - smoothstep(600.0, 1100.0, tempK);
  float vapor = smoothstep(240.0, 330.0, tempK) * volatilesRemain;
  float runaway = smoothstep(380.0, 700.0, tempK) * volatilesRemain;
  float atm = sqrt(clamp(atmosphere, 0.0, 1.0));
  float base = atm * (0.25 + 0.75 * clamp(volatiles, 0.0, 1.0));
  return clamp(base * (0.30 + 0.85 * vapor) + runaway * atm * 0.8, 0.0, 1.0);
}

/** Microfacet roughness: metal polishes, regolith and ice do not. */
float surfaceRoughness(float iron, float silicate, float water, float tempK) {
  float r = mix(0.72, 0.42, clamp(iron, 0.0, 1.0));
  r = mix(r, 0.30, clamp(water, 0.0, 1.0) * smoothstep(233.0, 278.0, tempK));
  return clamp(r, 0.08, 0.95);
}

/**
 * GGX/Trowbridge-Reitz specular with a Schlick Fresnel term. Replaces the flat
 * pow(reflect.view, k) lobe so ocean sun-glint tightens near grazing angles and
 * spreads on rough land, which is what sells a water world at a distance.
 */
float specularGGX(vec3 n, vec3 v, vec3 l, float roughness, float f0) {
  vec3 h = normalize(v + l);
  float a = max(roughness * roughness, 1e-3);
  float a2 = a * a;
  float ndoth = max(dot(n, h), 0.0);
  float ndotv = max(dot(n, v), 1e-4);
  float ndotl = max(dot(n, l), 0.0);
  float vdoth = max(dot(v, h), 0.0);

  float d = ndoth * ndoth * (a2 - 1.0) + 1.0;
  d = a2 / max(3.14159265 * d * d, 1e-6);

  float k = a * 0.5;
  float gv = ndotv / (ndotv * (1.0 - k) + k);
  float gl = ndotl / (ndotl * (1.0 - k) + k);

  float f = f0 + (1.0 - f0) * pow(1.0 - vdoth, 5.0);
  return d * gv * gl * f * ndotl;
}
`;

/**
 * Blackbody colour and Doppler shift. Exported so the black-hole disk shader in
 * `components/BlackHole/BlackHoleRig.tsx` uses the same colour curve as the
 * stars rather than carrying its own copy.
 */
// Defined in ../shaders/relativityChunk so light consumers (the main menu) can
// share the curve without importing every shader in this module.
export { relativityChunk };

// --- ATMOSPHERE SCATTERING MATERIAL ---
export const PlanetAtmosphereMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0.5, 0.7, 1.0),
        uBoundingRadius: 1.0,
        uPlanetRadius: 1.0,
        uSunDirection: new THREE.Vector3(0, 0, 1),
        uPlanetCenter: new THREE.Vector3(0, 0, 0),
        uViewVector: new THREE.Vector3(0, 0, 0),
        uScaleHeight: 8.0,
        uDensity: 1.0,
        uHaze: 0.0,
        uOblateness: 0.0,
        /** Raymarch samples: 4 on the low device tier, 8 on high. */
        uSteps: 8
    },
    `
  uniform float uOblateness;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  void main() {
    // Apply oblateness to vertex
    vec3 pos = position;
    float scaleXZ = 1.0 + uOblateness;
    pos.x *= scaleXZ;
    pos.z *= scaleXZ;
    
    // Normal correction for non-uniform scale (Inv Transpose)
    vec3 n = normal;
    n.x /= scaleXZ;
    n.z /= scaleXZ;
    vNormal = normalize(normalMatrix * normalize(n));
    
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
  `,
    `
  precision highp float;
  uniform vec3 uColor;
  uniform float uBoundingRadius;
  uniform float uPlanetRadius;
  uniform vec3 uSunDirection;
  uniform vec3 uPlanetCenter;
  uniform vec3 uViewVector; 
  uniform float uScaleHeight;
  uniform float uDensity;
  uniform float uHaze;
  uniform int uSteps;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  vec2 raySphereIntersect(vec3 ro, vec3 rd, float rad) {
      float b = dot(ro, rd);
      float c = dot(ro, ro) - rad * rad;
      float h = b * b - c;
      if (h < 0.0) return vec2(-1.0);
      h = sqrt(h);
      return vec2(-b - h, -b + h);
  }

  void main() {
      vec3 relCam = uViewVector - uPlanetCenter;
      vec3 relPos = vWorldPosition - uPlanetCenter;
      vec3 rayDir = normalize(relPos - relCam);
      
      vec2 intersect = raySphereIntersect(relCam, rayDir, uBoundingRadius);
      if (intersect.y < 0.0) discard;
      
      float tStart = max(0.0, intersect.x);
      float tEnd = intersect.y;
      
      vec2 planetIntersect = raySphereIntersect(relCam, rayDir, uPlanetRadius);
      if (planetIntersect.x > 0.0) {
          tEnd = min(tEnd, planetIntersect.x);
      }

      vec3 scatter = vec3(0.0);
      float opticalDepth = 0.0;
      // TODO(low-end): uSteps is the cheapest knob here; 4 samples still reads
      // correctly at the limb, below that the march starts to band.
      int steps = clamp(uSteps, 2, 8);
      float stepSize = (tEnd - tStart) / float(steps);
      vec3 pos = relCam + rayDir * (tStart + stepSize * 0.5);

      float scaleH = uScaleHeight * (uBoundingRadius - uPlanetRadius);
      if(scaleH < 0.001) scaleH = 0.001;

      // Rayleigh scattering goes as 1/lambda^4. These are the Earth sea-level
      // coefficients at 680/550/440 nm (5.802/13.558/33.100 x 1e-6 m^-1),
      // normalised so the PEAK channel is 1. That gives the real 1/lambda^4
      // ratio — which is what makes a thin sky blue and a low sun red, instead
      // of tinting the whole shell one flat colour — while capping the shell at
      // the brightness it had before, so it stays a limb glow rather than
      // becoming a saturated blue disc. uColor carries the composition tint
      // (N2/O2 blue, CO2 pale orange, methane cyan) on top.
      const vec3 RAYLEIGH = vec3(0.17528, 0.40961, 1.0);
      vec3 rayleighTint = RAYLEIGH * uColor;
      vec3 mieTint = mix(vec3(1.0), uColor, 0.35);   // aerosols scatter near-grey

      for(int i = 0; i < 8; i++) {
          if (i >= steps) break;
          float h = max(0.0, length(pos) - uPlanetRadius);
          float d = exp(-h / scaleH) * uDensity;
          opticalDepth += d * stepSize;

          float lightAngle = dot(normalize(pos), uSunDirection);
          float rayleighPhase = 0.75 * (1.0 + lightAngle * lightAngle);
          float g = 0.76;
          float mieDenom = max(0.02, pow(1.0 + g * g - 2.0 * g * lightAngle, 1.5));
          float miePhase = ((1.0 - g * g) / (4.0 * 3.14159 * mieDenom)) * uHaze * 1.8;

          vec3 colorContribution = rayleighTint * rayleighPhase * 0.55 + mieTint * miePhase * 0.35;
          scatter += colorContribution * d * stepSize;
          pos += rayDir * stepSize;
      }
      
      float transmittance = exp(-opticalDepth * 2.0);
      vec3 finalColor = scatter * (1.0 - transmittance) * 0.65;
      float alpha = smoothstep(0.0, 0.25, opticalDepth);
      float densityAlpha = clamp(uDensity, 0.0, 0.55) * 0.75;
      
      gl_FragColor = vec4(clamp(finalColor, 0.0, 1.2), alpha * densityAlpha);
  }
  `
);

// --- SELECTION HALO MATERIAL ---
export const SelectionHaloMaterial = shaderMaterial(
    { uColor: new THREE.Color(0.2, 1.0, 0.5), uTime: 0 },
    `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
  `,
    `
  precision highp float;
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - dot(normal, viewDir), 3.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    gl_FragColor = vec4(uColor, fresnel * (0.6 + 0.4 * pulse));
  }
  `
);

// --- STAR SURFACE MATERIAL ---
export const StarSurfaceMaterial = shaderMaterial(
    {
        uTime: 0,
        uColor: new THREE.Color(1, 0.8, 0),
        uSpeed: 1.0,
        uTemperature: 5500.0,
        uMetallicity: 0.0,
        uConvection: 5.0,
        uPulsation: 0.0,
        uFlareActivity: 0.0,
        uMagnetic: 0.0,
        uLuminosityClass: 0.0,
        uOblateness: 0.0,
        /** Bolometric luminosity in L☉ — sets brightness, temperature sets hue. */
        uLuminosity: 1.0,
        /** Photospheric surface gravity, m/s². Sets granule size. */
        uSurfaceGravity: 274.0
    },
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTime;
uniform float uPulsation;
uniform float uOblateness;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Apply Oblateness (Flattening via stretching Equator)
  // Scale X and Z. Y remains polar axis.
  float scaleXZ = 1.0 + uOblateness;
  pos.x *= scaleXZ;
  pos.z *= scaleXZ;
  
  // Normal Correction
  vec3 n = normal;
  n.x /= scaleXZ;
  n.z /= scaleXZ;
  vNormal = normalize(normalMatrix * normalize(n));
  
  vPos = pos;
  
  if (uPulsation > 0.0) {
      float pulse = sin(uTime * uPulsation * 2.0) * 0.05;
      pos *= (1.0 + pulse);
  }
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  #include <logdepthbuf_vertex>
}`,
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; 
uniform vec3 uColor; 
uniform float uSpeed; 
uniform float uTemperature; 
uniform float uMetallicity;
uniform float uConvection;
uniform float uFlareActivity;
uniform float uMagnetic;
uniform float uLuminosityClass;
uniform float uLuminosity;
uniform float uSurfaceGravity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;

${voronoiChunk}
${noise3DChunk}
${relativityChunk}

void main() {
  // Hue comes from the blackbody curve at the effective temperature the physics
  // pass derived; brightness comes from luminosity. Keeping them separate is
  // what makes an M dwarf read as dim-red and an O star as blinding-blue,
  // instead of every star being an equally bright disc in a different tint.
  vec3 bbColor = blackbodyNormalized(uTemperature);
  float lumScale = clamp(0.55 + 0.45 * log(max(uLuminosity, 1e-4) * 2.718281828 + 1.0), 0.35, 2.6);

  vec3 viewDir = normalize(cameraPosition - vPos);
  float NdotV = abs(dot(vNormal, viewDir));

  // Granule size scales with the pressure scale height, i.e. inversely with
  // surface gravity: the Sun's cells are ~1000 km, a red giant's are a
  // sizeable fraction of the disc.
  // Clamped tightly: the physical range spans a red giant's ~0.03 m/s^2 to a
  // white dwarf's ~10^6, and letting that through unclamped turns the disc into
  // static at one end and a single cell at the other.
  float gravityScale = clamp(sqrt(max(uSurfaceGravity, 1.0) / 274.0), 0.30, 1.60);
  float baseScale = mix(20.0, 3.0, uLuminosityClass);
  float noiseScale = baseScale * (uConvection / 5.0) * gravityScale;
  vec3 noisePos = vPos * noiseScale;
  noisePos += vec3(uTime * 0.2 * uSpeed); 
  float v = voronoi(noisePos);
  float granulation = 1.0 - smoothstep(0.0, 0.8, v);
  float turb = fbm(vPos * 10.0 + uTime * 0.5, 3);
  granulation = mix(granulation, turb, 0.2 + uMetallicity * 0.2);
  
  vec3 hotColor = bbColor * 1.5 * lumScale;
  vec3 coolColor = bbColor * vec3(0.8, 0.4, 0.1) * lumScale;
  
  if (uMagnetic > 0.0) {
      float spotNoise = fbm(vPos * 2.0 + vec3(uTime * 0.05), 4);
      float spots = smoothstep(0.7 - uMagnetic * 0.2, 1.0, spotNoise);
      coolColor = mix(coolColor, vec3(0.0), spots);
  }
  
  vec3 surfaceColor = mix(coolColor, hotColor, granulation);
  
  if (uFlareActivity > 0.0) {
      float flare = pow(max(0.0, snoise(vPos * 0.5 + uTime * 3.0)), 12.0);
      surfaceColor += vec3(1.0) * flare * uFlareActivity * 5.0;
  }
  
  // Eddington quadratic limb darkening, I(mu)/I(0) = 1 - u(1-mu) - v(1-mu^2).
  // The (u, v) = (0.93, -0.23) pair is the standard solar visual-band fit; it
  // gives the sharp bright centre and fast falloff a real photosphere has,
  // which pow(mu, 0.48) does not.
  float mu = clamp(NdotV, 0.0, 1.0);
  float limbDarkening = clamp(1.0 - 0.93 * (1.0 - mu) + 0.23 * (1.0 - mu * mu), 0.06, 1.0);
  surfaceColor *= limbDarkening * 1.30;
  
  float alpha = 1.0;
  if (uLuminosityClass > 0.5) {
      float fresnel = 1.0 - NdotV;
      float edgeNoise = fbm(vPos * 5.0 - uTime, 2);
      alpha = smoothstep(0.0, 0.8 + edgeNoise * 0.2, NdotV);
      surfaceColor += bbColor * pow(fresnel, 4.0) * 0.5;
  }

  gl_FragColor = vec4(surfaceColor, alpha);
  #include <logdepthbuf_fragment>
} `
);

// --- PLANET SURFACE MATERIAL ---
export const PlanetSurfaceMaterial = shaderMaterial(
    {
        uTime: 0,
        uColor1: new THREE.Color(0.5, 0.5, 0.5),
        uColor2: new THREE.Color(0.2, 0.2, 0.2),
        uType: 0,
        uTectonics: 0.0,
        uAtmosphere: 0.0,
        uWaterLevel: 0.0,
        uMethane: 0.0,
        uCloudDepth: 0.0,
        uAxialTilt: 0.0,
        uTemperature: 300.0,
        uRadius: 10.0,
        uOblateness: 0.0,
        uMass: 10.0,
        uState: 0,
        uEmissiveStrength: 0.12,
        uEnvironment: null as THREE.Texture | null,
        uEnvironmentIntensity: 0,
        uNorthPole: new THREE.Vector3(0, 1, 0),
        uSunDirection: new THREE.Vector3(1, 0.5, 0.5).normalize(),
        // Physical primaries, pushed straight through from
        // `properties.compositionIron/Silicates/Water`.
        uCompIron: 0.3,
        uCompSilicate: 0.6,
        uCompWater: 0.1,
        /** Stable per-body hash so two identical worlds get different terrain. */
        uSeed: 0.0,
        /** 0 = low device tier, 1 = high. Gates octave counts and extras. */
        uQuality: 1,
        /** Derived cloud fraction; also drives the separate cloud shell. */
        uCloudCover: 0.0,
        /** 0-1 night-side city lights, from population on habitable worlds. */
        uNightLights: 0.0,
        /** Ring shadow strength (0 when the body has no rings). */
        uRingShadow: 0.0,
        uRingInner: 1.4,
        uRingOuter: 2.3,
    },
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uOblateness;
uniform float uMass;
uniform int uType;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

${noise3DChunk}

void main() {
  vUv = uv;
  vec3 pos = position;

  // Hydrostatic Equilibrium Check
  // Thresholds (Game Units): Ice ~ 0.5, Rocky ~ 2.0
  float threshold = (uType == 3) ? 0.5 : 2.0;
  float isRound = smoothstep(threshold * 0.8, threshold * 1.2, uMass);

  if (isRound < 0.99) {
      // Irregular shape for low mass bodies
      float noiseScale = 1.5;
      float irregularity = (1.0 - isRound) * 0.1; // Reduced magnitude

      float n = snoise(pos * noiseScale + uSeed);
      float n2 = snoise(pos * noiseScale * 2.0 + 10.0 + uSeed);

      pos += normal * (n + n2 * 0.5) * irregularity * 0.5;
  }
  
  // Apply Oblateness (Flattening)
  float scaleXZ = 1.0 + uOblateness;
  pos.x *= scaleXZ;
  pos.z *= scaleXZ;
  
  // Correct Normals
  vec3 n = normal;
  if (isRound < 0.99) {
      // Approximate new normal for irregular shape is hard without derivatives,
      // but rotating/perturbing the existing normal helps visual realism.
      float n_perturb = snoise(pos * 5.0 + uSeed);
      n = normalize(n + vec3(n_perturb) * 0.2 * (1.0 - isRound));
  }
  
  n.x /= scaleXZ;
  n.z /= scaleXZ;
  vec3 worldN = normalize(mat3(modelMatrix) * normalize(n));
  vNormal = normalize(normalMatrix * normalize(n));
  vWorldNormal = worldN;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vPos = pos;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  #include <logdepthbuf_vertex>
}`,
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; 
uniform vec3 uColor1; 
uniform vec3 uColor2; 
uniform int uType; 
uniform float uTectonics;
uniform float uAtmosphere;
uniform float uWaterLevel;
uniform float uMethane;
uniform float uCloudDepth;
uniform float uTemperature;
uniform float uRadius;
uniform int uState;
uniform float uEmissiveStrength;
uniform sampler2D uEnvironment;
uniform float uEnvironmentIntensity;
uniform vec3 uNorthPole;
uniform vec3 uSunDirection;
uniform float uCompIron;
uniform float uCompSilicate;
uniform float uCompWater;
uniform float uSeed;
uniform int uQuality;
uniform float uCloudCover;
uniform float uNightLights;
uniform float uRingShadow;
uniform float uRingInner;
uniform float uRingOuter;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

${noise3DChunk}
${terrainChunk}
${relativityChunk}
${compositionChunk}

const int STATE_HABITABLE = 1;
const int STATE_FROZEN = 2;
const int STATE_BURNING = 4;
const int STATE_TOXIC = 8;
const int STATE_VOLCANIC = 16;
const int STATE_STERILIZED = 32;

/**
 * Fraction of sunlight surviving the ring plane on its way to this fragment.
 *
 * The body is a sphere, so its surface point in body radii is just the unit
 * world normal. March that point toward the sun and see whether it crosses the
 * equatorial plane (normal = the spin axis) between the ring edges.
 */
float ringShadowFactor(vec3 unitPos, vec3 lightDir, vec3 axis) {
  if (uRingShadow <= 0.001) return 1.0;
  float denom = dot(axis, lightDir);
  if (abs(denom) < 1e-3) return 1.0;              // sun in the ring plane
  float t = -dot(axis, unitPos) / denom;
  if (t <= 0.0) return 1.0;                        // plane crossing is behind us
  float r = length(unitPos + lightDir * t);
  float band = smoothstep(uRingInner, uRingInner + 0.08, r)
             * (1.0 - smoothstep(uRingOuter - 0.08, uRingOuter, r));
  return 1.0 - band * clamp(uRingShadow, 0.0, 1.0);
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 lightDir = normalize(uSunDirection);
  float ndotl = dot(normal, lightDir);

  // Object-space direction: radius-independent, and it rotates with the body so
  // terrain is painted onto the surface rather than swimming through it.
  vec3 sp = normalize(vPos);

  // Normalised mass fractions straight from the physics primaries.
  float iron = max(uCompIron, 0.0);
  float silicate = max(uCompSilicate, 0.0);
  float water = max(uCompWater, 0.0);
  float compTotal = max(iron + silicate + water, 1e-3);
  iron /= compTotal; silicate /= compTotal; water /= compTotal;

  float T = uTemperature;
  int octaves = (uQuality == 0) ? 3 : 6;
  int midOctaves = (uQuality == 0) ? 2 : 4;

  vec3 finalColor = uColor1;
  vec3 emissive = vec3(0.0);
  float spec = 0.0;

  vec3 axis = normalize(uNorthPole);
  float absLat = abs(dot(normal, axis));

  // A giant is decided by drawn size, as before; the Surface Material dropdown
  // can route a body here but no longer picks its palette on its own.
  bool isGiant = (uType == 2) || (uType == 3 && uRadius > 4.0);

  float detail = 0.0;
  float waterMask = 0.0;
  float cap = 0.0;

  if (isGiant) {
      // ---- GAS / ICE GIANT -------------------------------------------------
      // Bands follow object-space latitude, so they stay locked to the spin
      // axis through the axial tilt applied by the parent group.
      float zonal = fbm(vec3(sp.x * 2.4, sp.y * 9.0, sp.z * 2.4) + vec3(uTime * 0.05 + uSeed), midOctaves);
      float bands = sin(sp.y * 22.0 + zonal * 2.6);
      detail = zonal;

      vec3 warpG = domainWarp(vec3(sp.x * 3.0, sp.y * 8.0, sp.z * 3.0) + vec3(uTime * 0.03), 0.5, uSeed);
      float storms = fbm(warpG, midOctaves);

      // The colour picker finally reaches this path.
      vec3 banded = mix(uColor2, uColor1, bands * 0.5 + 0.5);

      // Methane absorbs red, which is why Uranus and Neptune are cyan-to-blue.
      vec3 methaneTint = mix(vec3(0.35, 0.55, 0.72), vec3(0.02, 0.12, 0.28), clamp(uMethane, 0.0, 1.0));
      float icy = clamp(water * 1.4 + uMethane * 0.6, 0.0, 1.0);
      finalColor = mix(banded, methaneTint * (0.88 + bands * 0.12), icy);

      // Hot Jupiters lose their cloud decks and glow with their own thermal
      // emission, so the palette hands over to the blackbody curve.
      float hot = smoothstep(900.0, 1900.0, T);
      vec3 thermal = blackbodyNormalized(max(T, 1000.0));
      finalColor = mix(finalColor, thermal, hot * 0.85);
      emissive += thermal * hot * 0.7 * uEmissiveStrength;

      finalColor = mix(finalColor, finalColor * 1.28, smoothstep(0.42, 0.80, storms) * 0.6);
      finalColor = mix(finalColor, finalColor * 0.62, smoothstep(0.42, 0.75, -storms) * 0.5);

      if (uCloudDepth > 0.0) {
          float shadow = fbm(vec3(sp.x * 4.0, sp.y * 10.0, sp.z * 4.0) + vec3(uTime * 0.06 + 0.05), 3);
          finalColor = mix(finalColor, finalColor * 0.58, smoothstep(0.40, 0.65, shadow) * uCloudDepth);
      }

      spec = specularGGX(normal, viewDir, lightDir, 0.55, 0.03) * 0.30;

  } else {
      // ---- TERRESTRIAL -----------------------------------------------------
      // Domain-warped ridged noise gives creased, orogenic continents instead
      // of the rounded blobs plain fbm produces.
      vec3 warped = domainWarp(sp * 1.7 + vec3(uSeed * 3.1), 0.35, uSeed);
      float continents = ridgedFbm(warped, octaves);
      detail = fbm(sp * 7.0 + vec3(uSeed), midOctaves);
      float height = continents * 0.75 + detail * 0.25;

      float phase = waterPhase(T);
      float liquid = smoothstep(0.15, 0.90, phase) * (1.0 - smoothstep(1.35, 2.05, phase));
      float boiled = smoothstep(1.40, 2.10, phase);
      float melt = smoothstep(1000.0, 1500.0, T);

      // Sea level from the surface volatile budget: the Water Level dial says
      // how full the basins are, and bulk water composition floods them further
      // on top, so an ice-rich world drowns even at a low dial setting.
      float volatiles = surfaceVolatiles(uWaterLevel, water);
      float seaLevel = mix(0.60, -0.90, volatiles);
      float oceanMask = smoothstep(seaLevel + 0.03, seaLevel - 0.03, height);
      waterMask = oceanMask * (1.0 - boiled);

      vec3 rock = rockAlbedo(iron, silicate, T);
      float alt = clamp((height - seaLevel) / max(1.0 - seaLevel, 0.25), 0.0, 1.0);
      vec3 land = rock * (0.72 + 0.55 * alt) * (0.86 + 0.28 * (detail * 0.5 + 0.5));
      // Keep the colour picker meaningful without letting it override the
      // composition-derived albedo entirely.
      vec3 tint = mix(uColor2, uColor1, alt);
      land = mix(land, land * 0.4 + tint * 0.6, 0.30);

      float depth = clamp((seaLevel - height) * 1.6, 0.0, 1.0);
      vec3 sea = oceanColor(depth, T);
      vec3 seaIce = iceColor(0.65 + (detail * 0.5 + 0.5) * 0.35, T);
      vec3 ocean = mix(seaIce, sea, liquid);

      finalColor = mix(land, ocean, waterMask);

      // Ice caps grow from the poles of the REAL spin axis as the body cools.
      float iceLine = mix(0.0, 1.15, smoothstep(180.0, 305.0, T));
      float capNoise = fbm(sp * 6.0 + vec3(uSeed * 2.0), 3) * 0.08;
      cap = smoothstep(iceLine - 0.10, iceLine + 0.06, absLat + capNoise);
      cap *= clamp(water * 3.0, 0.0, 1.0) * (1.0 - boiled);
      if ((uState & STATE_FROZEN) != 0) cap = max(cap, 0.75);
      finalColor = mix(finalColor, iceColor(0.92, T), cap * (1.0 - waterMask * 0.25));

      // Silicate melt: tectonics opens the cracks, temperature lights them.
      float cracks = pow(1.0 - abs(snoise(sp * 9.0 + vec3(uTime * 0.04))), 6.0);
      float lava = clamp(cracks * (0.35 + uTectonics), 0.0, 1.0) * melt;
      if ((uState & STATE_VOLCANIC) != 0) lava = max(lava, cracks * 0.5 * max(melt, 0.25));
      finalColor = mix(finalColor, vec3(0.95, 0.32, 0.06), lava * 0.85);
      emissive += vec3(1.0, 0.34, 0.07) * lava * 2.2 * uEmissiveStrength;

      if ((uState & STATE_HABITABLE) != 0) {
          float veg = smoothstep(0.42, 0.78, fbm(sp * 3.2 + vec3(uSeed + 2.0), 3) * 0.5 + 0.5);
          veg *= (1.0 - waterMask) * (1.0 - cap) * liquid;
          finalColor = mix(finalColor, vec3(0.130, 0.330, 0.150), veg * 0.55);
      }

      // Surface Material dropdown as a stylistic bias on top of the physics.
      if (uType == 4) {
          float extra = cracks * (0.4 + uTectonics);
          finalColor = mix(finalColor, vec3(0.10, 0.065, 0.055), 0.35);
          finalColor = mix(finalColor, vec3(1.0, 0.35, 0.05), extra * 0.7);
          emissive += vec3(1.0, 0.35, 0.08) * extra * 2.0 * uEmissiveStrength;
      } else if (uType == 3) {
          finalColor = mix(finalColor, iceColor(0.55 + (detail * 0.5 + 0.5) * 0.45, T), 0.55);
      } else if (uType == 5) {
          float pulse = 0.6 + 0.4 * sin(uTime * 3.0 + sp.y * 4.0);
          finalColor = mix(uColor1, uColor2, detail * 0.5 + 0.5) * pulse;
          emissive += finalColor * 0.8 * uEmissiveStrength;
      } else if (uType == 6) {
          vec3 crust = mix(vec3(0.15, 0.2, 0.35), vec3(0.7, 0.85, 1.0), detail * 0.5 + 0.5);
          finalColor = mix(finalColor, crust, 0.8);
          emissive += vec3(0.4, 0.6, 1.0) * pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0) * 0.15 * uEmissiveStrength;
      }

      // Ocean sun-glint: a tight, Fresnel-weighted GGX lobe on liquid water,
      // a broad dull one on rock and ice.
      float oceanish = waterMask * liquid;
      float rough = mix(surfaceRoughness(iron, silicate, water, T), 0.055, oceanish);
      float f0 = mix(mix(0.04, 0.16, iron), 0.02, oceanish);
      spec = specularGGX(normal, viewDir, lightDir, rough, f0) * mix(0.8, 3.2, oceanish);
  }

  // Cloud bed. On the high tier the separate parallax shell carries most of the
  // cover and this is only what the shell casts onto; on low, where the shell is
  // skipped entirely, this stands in for it at full strength.
  float cover = clamp(uCloudCover, 0.0, 1.0);
  if (cover > 0.01) {
      float cn = fbm(sp * 3.4 + vec3(uTime * 0.02, 0.0, uSeed), midOctaves) * 0.5 + 0.5;
      float cmask = smoothstep(0.62 - cover * 0.42, 0.92 - cover * 0.34, cn);
      float weight = (uQuality == 0) ? 1.0 : 0.35;
      finalColor = mix(finalColor, vec3(0.90, 0.92, 0.95), cmask * cover * weight);
      spec *= 1.0 - cmask * cover * weight * 0.8;
  }

  if ((uState & STATE_BURNING) != 0) {
      emissive += vec3(1.0, 0.4, 0.1) * 0.4 * uEmissiveStrength;
  }
  if ((uState & STATE_TOXIC) != 0) {
      finalColor = mix(finalColor, vec3(0.3, 0.7, 0.2), 0.15);
  }
  if ((uState & STATE_STERILIZED) != 0) {
      finalColor *= vec3(0.75, 0.72, 0.7);
  }

  // Thicker atmospheres scatter light further past the geometric terminator, so
  // the dusk band widens with density rather than being a hard edge.
  float wrap = 0.05 + clamp(uAtmosphere, 0.0, 1.0) * 0.22;
  float diff = clamp((ndotl + wrap) / (1.0 + wrap), 0.0, 1.0);

  float shadow = ringShadowFactor(normal, lightDir, axis);
  diff *= shadow;
  spec *= shadow;

  // City lights on the night side of an inhabited world.
  if (uQuality == 1 && uNightLights > 0.001 && (uState & STATE_HABITABLE) != 0) {
      float night = smoothstep(0.10, -0.20, ndotl);
      float pop = fbm(sp * 14.0 + vec3(uSeed * 5.0), 3) * 0.5 + 0.5;
      float cities = pow(smoothstep(0.42, 0.78, pop), 3.0) * (1.0 - waterMask) * (1.0 - cap);
      emissive += vec3(1.0, 0.82, 0.52) * cities * night * clamp(uNightLights, 0.0, 1.0) * 0.9;
  }

  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  float rimAtmos = isGiant ? 0.10 : 0.22;
  vec3 rimLit = uColor1 * rim * uAtmosphere * rimAtmos * (diff * 0.55 + 0.06);

  vec3 lit = finalColor * (diff * 0.85 + 0.05) + vec3(spec) + rimLit;
  // Lighting only: retain the existing terrain, cloud masks and direct GGX lobe.
  if (uEnvironmentIntensity > 0.0) {
    vec3 reflected = reflect(-viewDir, normal);
    vec2 envUv = vec2(atan(reflected.z, reflected.x) / 6.2831853 + 0.5,
      asin(clamp(reflected.y, -1.0, 1.0)) / 3.14159265 + 0.5);
    float roughness = isGiant ? 0.85 : surfaceRoughness(iron, silicate, water, T);
    float liquidPhase = smoothstep(273.0, 290.0, T) * (1.0 - smoothstep(360.0, 400.0, T));
    roughness = mix(roughness, 0.055, waterMask * liquidPhase * (1.0 - cap));
    float f0 = isGiant ? 0.015 : mix(0.04 + iron * 0.12, 0.02, waterMask * liquidPhase);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
    lit += texture2D(uEnvironment, envUv).rgb * uEnvironmentIntensity * fresnel
      * (1.0 - roughness * 0.8) * (1.0 - cover * 0.8);
  }
  vec3 result = lit + emissive;
  gl_FragColor = vec4(clamp(result, 0.0, 2.0), 1.0);
  #include <logdepthbuf_fragment>
} `
);

/**
 * --- CLOUD SHELL ---
 *
 * A separate transparent sphere just above the surface. Rendering clouds on
 * their own shell (rather than as an overlay in the surface shader) is what
 * gives real parallax: `BodyMesh` spins this mesh at a different rate, so the
 * deck slides over the terrain and the limb shows cloud tops standing off the
 * horizon.
 *
 * Cover is derived, not authored — see `cloudCoverFrom` in the composition
 * chunk, which needs both an atmosphere to hold vapour and a volatile
 * reservoir to supply it.
 *
 * TODO(low-end): this is one extra transparent pass per planet. `BodyMesh`
 * skips the mesh entirely on the low tier and the surface shader draws a flat
 * cloud bed instead.
 */
export const PlanetCloudMaterial = shaderMaterial(
    {
        uTime: 0,
        uCover: 0.4,
        uTint: new THREE.Color(0.92, 0.94, 0.97),
        uSunDirection: new THREE.Vector3(1, 0.5, 0.5).normalize(),
        uSeed: 0.0,
        uQuality: 1,
        uOblateness: 0.0,
        uAtmosphere: 0.3,
    },
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uOblateness;
varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec3 pos = position;
  float scaleXZ = 1.0 + uOblateness;
  pos.x *= scaleXZ;
  pos.z *= scaleXZ;

  vec3 n = normal;
  n.x /= scaleXZ;
  n.z /= scaleXZ;

  vPos = pos;
  vWorldNormal = normalize(mat3(modelMatrix) * normalize(n));
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  #include <logdepthbuf_vertex>
}`,
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uCover;
uniform vec3 uTint;
uniform vec3 uSunDirection;
uniform float uSeed;
uniform int uQuality;
uniform float uAtmosphere;

varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

${noise3DChunk}
${terrainChunk}

void main() {
  float cover = clamp(uCover, 0.0, 1.0);
  if (cover < 0.02) discard;

  vec3 sp = normalize(vPos);
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 lightDir = normalize(uSunDirection);

  int oct = (uQuality == 0) ? 3 : 5;

  // Zonal drift: bands advect faster near the equator, so warping the sample
  // point by latitude gives the sheared, banded look of a real weather system
  // rather than a uniformly scrolling noise field.
  float lat = sp.y;
  vec3 drift = vec3(uTime * 0.018 * (1.0 - 0.6 * lat * lat), 0.0, uSeed);
  vec3 warped = domainWarp(sp * 3.0 + drift, 0.30, uSeed);
  float f = fbm(warped, oct) * 0.5 + 0.5;

  // Higher cover both raises the field and lowers the threshold, so the deck
  // closes up smoothly instead of just getting more opaque.
  float mask = smoothstep(0.66 - cover * 0.46, 0.94 - cover * 0.38, f);
  if (mask < 0.004) discard;

  // Wrap lighting plus a cheap thickness term: cloud tops catch the light and
  // the undersides stay grey, which is what reads as volume at this cost.
  float ndotl = dot(normal, lightDir);
  float diff = clamp((ndotl + 0.22) / 1.22, 0.0, 1.0);
  float thickness = smoothstep(0.0, 1.0, mask);
  vec3 lit = uTint * (0.18 + 0.92 * diff) * mix(0.72, 1.0, thickness);

  // Silver lining: forward scattering through thin cloud edges when backlit.
  float forward = pow(max(dot(viewDir, -lightDir), 0.0), 6.0);
  lit += uTint * forward * (1.0 - thickness) * 0.6 * diff;

  // Fade at the limb so the shell does not read as a hard shell edge.
  float limb = smoothstep(0.0, 0.32, abs(dot(normal, viewDir)));
  float alpha = mask * cover * mix(0.55, 0.95, clamp(uAtmosphere, 0.0, 1.0)) * limb;

  gl_FragColor = vec4(clamp(lit, 0.0, 2.0), clamp(alpha, 0.0, 1.0));
  #include <logdepthbuf_fragment>
}`
);

/**
 * --- RING SYSTEM ---
 *
 * Drawn on a flat `RingGeometry` inside the body's tilt group, so rings sit in
 * the equatorial plane of the real spin axis. Radii arrive in body radii; the
 * shader works in that unit throughout, which makes the planet-shadow test a
 * ray against the unit sphere.
 */
export const PlanetRingMaterial = shaderMaterial(
    {
        uTime: 0,
        uInner: 1.4,
        uOuter: 2.3,
        uOpacity: 0.7,
        uColorInner: new THREE.Color(0.72, 0.66, 0.55),
        uColorOuter: new THREE.Color(0.55, 0.55, 0.58),
        uSunDirection: new THREE.Vector3(1, 0.5, 0.5).normalize(),
        uPlanetCenter: new THREE.Vector3(0, 0, 0),
        uPlanetRadius: 1.0,
        uSeed: 0.0,
        uQuality: 1,
    },
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vRadius;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  // RingGeometry lies in the XY plane; the mesh is rotated flat by the parent.
  vRadius = length(position.xy);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`,
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform vec3 uSunDirection;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform float uSeed;
uniform int uQuality;

varying float vRadius;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

${noise3DChunk}

void main() {
  // Normalised position across the ring plane, in body radii.
  float rBodies = vRadius / max(uPlanetRadius, 1e-4);
  float t = (rBodies - uInner) / max(uOuter - uInner, 1e-3);
  if (t < 0.0 || t > 1.0) discard;

  int oct = (uQuality == 0) ? 2 : 4;

  // Ringlets: resonances with shepherd moons carve fine concentric structure,
  // so the density variation is radial only — no azimuthal noise.
  float fine = fbm(vec3(t * 34.0 + uSeed, uSeed * 2.0, 0.0), oct) * 0.5 + 0.5;
  float coarse = fbm(vec3(t * 7.0 + uSeed, 0.0, 0.0), 2) * 0.5 + 0.5;
  float density = clamp(coarse * 0.65 + fine * 0.45, 0.0, 1.0);

  // A Cassini-style gap at the strongest resonance, plus soft edges.
  density *= 1.0 - 0.85 * exp(-pow((t - 0.62) / 0.045, 2.0));
  density *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.93, 1.0, t));
  if (density < 0.004) discard;

  vec3 albedo = mix(uColorInner, uColorOuter, t) * (0.72 + 0.55 * fine);

  vec3 lightDir = normalize(uSunDirection);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 planeN = normalize(vWorldNormal);

  // Planet shadow: march from this ring particle toward the sun and test the
  // unit sphere. |p| > 1 out here, so the ray only hits when it points back
  // past the body (p.L < 0) and passes within a radius of the centre.
  vec3 p = (vWorldPos - uPlanetCenter) / max(uPlanetRadius, 1e-4);
  float b = dot(p, lightDir);
  float perp = sqrt(max(dot(p, p) - b * b, 0.0));
  float shadow = (b < 0.0) ? smoothstep(0.94, 1.08, perp) : 1.0;

  // Ring particles are comparable to the wavelength, so they scatter strongly
  // forward: a backlit ring plane glows and a front-lit one looks chalky.
  float cosPhase = dot(viewDir, -lightDir);
  float forward = pow(max(cosPhase, 0.0), 4.0);
  float lambert = abs(dot(planeN, lightDir));

  vec3 lit = albedo * (0.10 + 0.90 * lambert) * shadow;
  lit += albedo * forward * 1.5 * shadow;

  // Grazing views look through more particles per pixel, so the plane thickens
  // toward edge-on and vanishes exactly edge-on.
  float grazing = abs(dot(planeN, viewDir));
  float pathLength = 1.0 / max(grazing, 0.06);
  float alpha = clamp(density * uOpacity * clamp(pathLength * 0.55, 0.25, 1.6), 0.0, 1.0);
  alpha *= smoothstep(0.0, 0.035, grazing);

  gl_FragColor = vec4(clamp(lit, 0.0, 2.0), alpha);
  #include <logdepthbuf_fragment>
}`
);

export const PlanetTerrainMaterial = shaderMaterial(
    {
        uTime: 0,
        uColor1: new THREE.Color(1, 1, 1),
        uColor2: new THREE.Color(0.5, 0.5, 0.5),
        uRadius: 100,
        uDetail: 1,
        uOrigin: new THREE.Vector3(0, 0, 0),
        uRight: new THREE.Vector3(1, 0, 0),
        uUp: new THREE.Vector3(0, 1, 0),
        uOffset: new THREE.Vector2(0, 0),
        uScale: 1.0,
    },
    `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying float vHeight;
  
  uniform vec3 uOrigin;
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform vec2 uOffset;
  uniform float uScale;
  uniform float uRadius;
  
  ${noise3DChunk}

  void main() {
    vUv = uv;
    vec2 pos2D = uOffset + uv * uScale;
    vec3 pos = uOrigin + uRight * (pos2D.x * 2.0 - 1.0) + uUp * (pos2D.y * 2.0 - 1.0);
    pos = normalize(pos); 
    
    float h = 0.0;
    float amp = 1.0;
    float freq = 2.0;
    for(int i = 0; i < 5; i++) {
        h += snoise(pos * freq) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    
    vHeight = h;
    vec3 displaced = pos * (uRadius * (1.0 + h * 0.02)); 
    vPosition = displaced;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
  `,
    `
  precision highp float;
  varying float vHeight;
  varying vec3 vPosition;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  
  void main() {
    float mixFactor = smoothstep(-0.5, 0.5, vHeight);
    vec3 col = mix(uColor2, uColor1, mixFactor);
    vec3 normal = normalize(vPosition);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(normal, lightDir), 0.0);
    gl_FragColor = vec4(col * (0.2 + 0.8 * diff), 1.0);
  }
  `
);

export const NeutronStarMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0.2, 0.5, 1.0),
        uMagneticField: 1.0,
        uMass: 1.0,
        uRadius: 1.0,
        uTime: 0
    },
    `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
    `,
    `
    precision highp float;
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), fresnel), 1.0);
    }
    `
);

export const RelativisticDiskMaterial = shaderMaterial(
    {
        uColorInner: new THREE.Color(1.0, 0.8, 0.2),
        uColorOuter: new THREE.Color(0.6, 0.1, 0.05),
        uAccretionRate: 0.5,
        uMass: 1000,
        uTime: 0
    },
    `
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `,
    `
    uniform vec3 uColorInner;
    uniform vec3 uColorOuter;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vPos;
    ${noise3DChunk}
    ${relativityChunk}
    void main() {
        float angle = vUv.y * 6.28318;
        float velocity = 0.5 * sin(angle); 
        float doppler = 1.0 + velocity * 0.5;
        vec3 baseColor = mix(uColorInner, uColorOuter, vUv.x);
        float noiseVal = fbm(vec3(vUv.x * 5.0, vUv.y * 20.0 + uTime * 2.0, uTime * 0.1), 3);
        vec3 finalColor = dopplerShift(baseColor, doppler);
        finalColor *= (0.5 + 0.5 * noiseVal);
        float alpha = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(finalColor, alpha);
    }
    `
);

export const KerrEventHorizonMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0, 0, 0),
        uRimColor: new THREE.Color(1.0, 0.5, 0.0),
        uMass: 1000
    },
    `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
    `,
    `
    uniform vec3 uColor;
    uniform vec3 uRimColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float NdotV = dot(normal, viewDir);
        float rim = 1.0 - max(0.0, NdotV);
        rim = pow(rim, 4.0);
        vec3 color = mix(uColor, uRimColor, rim);
        gl_FragColor = vec4(color, 1.0);
    }
    `
);

export const ErgosphereMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0.2, 0.4, 1.0),
        uSpin: 0.0,
        uTime: 0
    },
    `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPos;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vPos = position;
        gl_Position = projectionMatrix * mvPosition;
    }
    `,
    `
    uniform vec3 uColor;
    uniform float uSpin;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPos;
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float alpha = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
        float pulse = 0.5 + 0.5 * sin(vPos.x * 2.0 + uTime * 5.0 * uSpin);
        gl_FragColor = vec4(uColor * (0.8 + 0.2 * pulse), alpha * 0.3 * uSpin);
    }
    `
);

extend({ NeutronStarMaterial, RelativisticDiskMaterial, KerrEventHorizonMaterial, PlanetTerrainMaterial, StarSurfaceMaterial, PlanetSurfaceMaterial, PlanetAtmosphereMaterial, PlanetCloudMaterial, PlanetRingMaterial, ErgosphereMaterial, SelectionHaloMaterial });
