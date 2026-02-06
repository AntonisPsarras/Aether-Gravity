
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { extend } from '@react-three/fiber';

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

const relativityChunk = `
vec3 blackbody(float Temp) {
    vec3 color = vec3(255.0, 255.0, 255.0);
    float t = clamp(Temp, 1000.0, 40000.0) / 100.0;
    if (t <= 66.0) {
        color.r = 255.0;
        color.g = 99.4708025861 * log(t) - 161.1195681661;
        if (t <= 19.0) color.b = 0.0;
        else color.b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
    } else {
        color.r = 329.698727446 * pow(t - 60.0, -0.1332047592);
        color.g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
        color.b = 255.0;
    }
    return clamp(color, 0.0, 255.0) / 255.0;
}

vec3 dopplerShift(vec3 color, float factor) {
    vec3 shifted = color * factor;
    if (factor > 1.0) {
        shifted.b *= 1.0 + (factor - 1.0) * 0.5;
        shifted.g *= 1.0 + (factor - 1.0) * 0.2;
    } else {
        shifted.r *= 1.0 + (1.0 - factor) * 0.5;
        shifted *= pow(factor, 3.0); 
    }
    return shifted;
}
`;

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
        uOblateness: 0.0
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
  uniform vec3 uColor;
  uniform float uBoundingRadius;
  uniform float uPlanetRadius;
  uniform vec3 uSunDirection;
  uniform vec3 uPlanetCenter;
  uniform vec3 uViewVector; 
  uniform float uScaleHeight; 
  uniform float uDensity;
  uniform float uHaze;

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
      int steps = 8;
      float stepSize = (tEnd - tStart) / float(steps);
      vec3 pos = relCam + rayDir * (tStart + stepSize * 0.5);
      
      float scaleH = uScaleHeight * (uBoundingRadius - uPlanetRadius);
      if(scaleH < 0.001) scaleH = 0.001;

      for(int i = 0; i < 8; i++) {
          float h = max(0.0, length(pos) - uPlanetRadius);
          float d = exp(-h / scaleH) * uDensity;
          opticalDepth += d * stepSize;
          
          float lightAngle = dot(normalize(pos), uSunDirection);
          float rayleighPhase = 0.75 * (1.0 + lightAngle * lightAngle);
          float g = 0.8;
          float miePhase = (1.0 - g*g) / (4.0 * 3.14159 * pow(1.0 + g*g - 2.0*g*lightAngle, 1.5));
          miePhase *= uHaze * 10.0;
          
          vec3 colorContribution = uColor * rayleighPhase + vec3(1.0) * miePhase;
          scatter += colorContribution * d * stepSize;
          pos += rayDir * stepSize;
      }
      
      float transmittance = exp(-opticalDepth * 2.0);
      vec3 finalColor = scatter * (1.0 - transmittance) * 2.0;
      float alpha = smoothstep(0.0, 0.2, opticalDepth);
      
      gl_FragColor = vec4(finalColor, alpha * clamp(uDensity + 0.2, 0.0, 1.0));
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
        uOblateness: 0.0
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

varying vec2 vUv; 
varying vec3 vNormal;
varying vec3 vPos;

${voronoiChunk}
${noise3DChunk}
${relativityChunk}

void main() { 
  vec3 bbColor = blackbody(uTemperature);
  vec3 viewDir = normalize(cameraPosition - vPos);
  float NdotV = abs(dot(vNormal, viewDir));
  
  float baseScale = mix(20.0, 3.0, uLuminosityClass); 
  float noiseScale = baseScale * (uConvection / 5.0);
  vec3 noisePos = vPos * noiseScale;
  noisePos += vec3(uTime * 0.2 * uSpeed); 
  float v = voronoi(noisePos);
  float granulation = 1.0 - smoothstep(0.0, 0.8, v);
  float turb = fbm(vPos * 10.0 + uTime * 0.5, 3);
  granulation = mix(granulation, turb, 0.2 + uMetallicity * 0.2);
  
  vec3 hotColor = bbColor * 1.5;
  vec3 coolColor = bbColor * vec3(0.8, 0.4, 0.1);
  
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
  
  float limbDarkening = pow(NdotV, 0.6);
  surfaceColor *= limbDarkening;
  
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
        uMass: 10.0
    },
    `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uOblateness;
uniform float uMass;
uniform int uType;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos;

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
      
      float n = snoise(pos * noiseScale);
      float n2 = snoise(pos * noiseScale * 2.0 + 10.0);
      
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
      float n_perturb = snoise(pos * 5.0);
      n = normalize(n + vec3(n_perturb) * 0.2 * (1.0 - isRound));
  }
  
  n.x /= scaleXZ;
  n.z /= scaleXZ;
  vNormal = normalize(normalMatrix * normalize(n));
  
  vPos = position; // Pass original for texture generation or modified? Usually modified.
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

varying vec2 vUv; 
varying vec3 vNormal; 
varying vec3 vPos;

${noise3DChunk}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 finalColor = uColor1;
  float n_base = snoise(vPos * 2.0);
  vec3 viewDir = normalize(cameraPosition - vPos);
  
  // Lighting
  vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0)); 
  float diff = max(dot(normal, lightDir), 0.0);
  float spec = 0.0;
  
  // ICE / GAS LOGIC (uType 3 is 'Ice', uType 2 is 'Gas')
  if (uType == 2 || (uType == 3 && uRadius > 4.0)) {
      // GASEOUS / ICE GIANT
      // Zonal Flow with noise
      float zonalNoise = fbm(vec3(vPos.x * 2.0, vPos.y * 10.0, vPos.z * 2.0) + uTime * 0.1, 4);
      // Horizontal bands
      float bands = sin(vPos.y * 20.0 + zonalNoise * 2.0);
      
      if (uType == 3) {
          // ICE GIANT Methane Scattering
          vec3 deepBlue = vec3(0.0, 0.4, 0.8);
          vec3 paleCyan = vec3(0.7, 0.9, 0.95);
          vec3 methaneColor = mix(paleCyan, deepBlue, uMethane);
          finalColor = mix(methaneColor, methaneColor * 0.8, bands * 0.2 + 0.2);
          
          if (uCloudDepth > 0.0) {
              float clouds = fbm(vPos * 4.0 + vec3(uTime * 0.1), 4);
              float shadow = fbm(vPos * 4.0 + vec3(uTime * 0.1) + vec3(0.05), 4);
              finalColor = mix(finalColor, finalColor * 0.5, smoothstep(0.4, 0.6, shadow));
              finalColor = mix(finalColor, vec3(1.0), smoothstep(0.4, 0.8, clouds) * uCloudDepth);
          }
      } else {
          finalColor = mix(uColor1, uColor2, bands * 0.5 + 0.5);
      }
      spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 10.0) * 0.1;
      
  } else if (uType == 3 && uRadius <= 4.0) {
      // SOLID ICE WORLD
      vec3 freshIce = vec3(0.95, 0.98, 1.0);
      vec3 oldIce = vec3(0.7, 0.8, 0.85);
      float surfNoise = fbm(vPos * 5.0, 3);
      finalColor = mix(oldIce, freshIce, smoothstep(0.3, 0.7, surfNoise));
      if (uTemperature > 200.0) finalColor *= vec3(0.9, 0.85, 0.8);
      spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 40.0) * 0.8;
      
  } else if (uType == 0) {
      // SOLID / THOLINS
      vec3 tholinRed = vec3(0.4, 0.1, 0.05); 
      vec3 greyRock = vec3(0.3, 0.3, 0.3);
      float tholinFactor = 1.0 - smoothstep(100.0, 250.0, uTemperature);
      vec3 base = mix(greyRock, tholinRed, tholinFactor * 0.8);
      float n = fbm(vPos * 4.0, 4);
      finalColor = base * (0.6 + n * 0.6);
      spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 10.0) * 0.1;
      if (uTemperature > 273.0) {
          float wetMask = smoothstep(0.4, 0.6, n);
          spec += wetMask * pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 60.0) * 0.6;
          finalColor = mix(finalColor, vec3(0.05, 0.1, 0.2), wetMask * 0.5);
      }
      
  } else if (uType == 1) { 
      // TERRESTRIAL
      float n1 = snoise(vPos * 1.5); 
      float n2 = snoise(vPos * 4.0 + 10.0);
      float height = n1 + n2 * 0.5;
      vec3 land = mix(uColor2, uColor1, smoothstep(-0.2, 0.2, n2));
      if (uTectonics > 0.0) {
          float cracks = 1.0 - abs(snoise(vPos * 10.0));
          float lava = pow(cracks, 8.0) * uTectonics;
          land += vec3(1.0, 0.3, 0.0) * lava * 5.0;
      }
      vec3 ocean = vec3(0.05, 0.15, 0.35);
      if (uTemperature < 273.0) ocean = vec3(0.9, 0.95, 1.0);
      float waterMask = smoothstep(uWaterLevel * 2.0 - 1.0, (uWaterLevel * 2.0 - 1.0) + 0.05, height);
      finalColor = mix(ocean, land, waterMask);
      if (waterMask < 0.5) {
          float gloss = (uTemperature < 273.0) ? 0.3 : 0.8;
          spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 32.0) * gloss;
      }
  } else {
      finalColor = mix(uColor1, uColor2, n_base * 0.5 + 0.5);
  }
  
  vec3 result = finalColor * (diff * 0.8 + 0.2) + spec; 
  gl_FragColor = vec4(clamp(result, 0.0, 8.0), 1.0);
  #include <logdepthbuf_fragment>
} `
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

export const PulsarJetMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0.5, 0.0, 1.0),
        uTime: 0
    },
    `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `,
    `
    uniform vec3 uColor;
    uniform float uTime;
    varying vec2 vUv;
    ${noise3DChunk}
    void main() {
        float n = fbm(vec3(vUv * 10.0, uTime * 5.0), 3);
        float alpha = (1.0 - vUv.y) * n; 
        alpha *= smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x); 
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
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

extend({ NeutronStarMaterial, PulsarJetMaterial, RelativisticDiskMaterial, KerrEventHorizonMaterial, PlanetTerrainMaterial, StarSurfaceMaterial, PlanetSurfaceMaterial, PlanetAtmosphereMaterial, ErgosphereMaterial, SelectionHaloMaterial });
