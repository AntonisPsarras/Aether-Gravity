/**
 * Blackbody colour and Doppler shift, shared GLSL.
 *
 * Lives in its own dependency-free module so light consumers (the main-menu
 * black hole) can use the same colour curve as the stars and the simulation's
 * accretion disk without pulling in every planet/star shader.
 */
export const relativityChunk = `
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

// Same fit, renormalised so the brightest channel is always 1.0. This keeps the
// hue of a blackbody while leaving its brightness to be supplied separately
// (luminosity for stars, the Doppler/redshift factor for accretion disks), so a
// cool star reads as dim-red rather than merely desaturated.
vec3 blackbodyNormalized(float Temp) {
    vec3 c = blackbody(Temp);
    float peak = max(c.r, max(c.g, c.b));
    return c / max(peak, 1e-4);
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
