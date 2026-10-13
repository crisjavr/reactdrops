import { streamFragment } from '../fluid-glass-gradient/fluid-glass-gradient-shaders';

const agentUniforms = `
uniform vec4 uAgentModesA, uAgentModesB, uAgentThinkingModes, uAgentSearchingModes;
uniform vec4 uAgentLensCurve;
uniform float uAgentLensOffset, uAgentLensPosition;
uniform float uAgentLensCustomPhase;
uniform float uAgentClock, uAgentVoice, uAgentIntensity, uAgentWarpOffset, uAgentWrinkleTime, uAgentSpeech, uAgentPreserveWhites;
`;

const agentWhiteSupport = `
float agentWhiteAmount(vec3 pigment) {
  float low=min(pigment.r,min(pigment.g,pigment.b));
  float high=max(pigment.r,max(pigment.g,pigment.b));
  return smoothstep(.91,.935,low)*(1.-smoothstep(.08,.15,high-low));
}
`;

const agentDomain = `
float agentSpeechReliefScale() {
  return 1.+.18*uAgentSpeech;
}
float glassHeight(float field) {
  return nativeGlassHeight(field)*agentSpeechReliefScale();
}
float agentOrganicWeight() {
  // Idle and Speaking keep the native organic folds through every transition.
  return clamp(1.-dot(uAgentModesA.yzw,vec3(1.))-uAgentModesB.y-uAgentModesB.z,0.,1.);
}
vec2 glassPosition(vec2 surface) {
  float organic=agentOrganicWeight();
  if(organic>=1.) return nativeGlassPosition(surface);
  if(organic<=0.) return surface;
  return mix(surface,nativeGlassPosition(surface),organic);
}
`;

const agentRelief = `
vec3 agentSpeechWrinkles(vec2 position) {
  // Positive cubic B-spline weights renew four stationary organic fields.
  // Heights, normals and their temporal velocity stay continuous at renewals;
  // there is no translating domain, turning orbit or reversing phase.
  float t=fract(uAgentWrinkleTime),s=1.-t;
  vec4 weights=vec4(s*s*s,3.*t*t*t-6.*t*t+4.,
    -3.*t*t*t+3.*t*t+3.*t+1.,t*t*t)/6.;
  weights/=sqrt(dot(weights,weights));
  float frequency=1.35*clusterFrequency()/uSpotSize;
  vec2 p=position*frequency+seedPosition(uSalt)+vec2(8.7,-12.3);
  vec3 wrinkles=vec3(0.);
  for(int layer=0;layer<4;layer++) {
    float id=mod(floor(uAgentWrinkleTime)+float(layer)-1.,256.);
    vec2 gradient;
    float height=psrdnoise(p+id*vec2(13.7,19.3),vec2(0.),
      mod(.37*id+uSalt*.1435,fullTurn),gradient);
    wrinkles+=weights[layer]*vec3(height,frequency*gradient);
  }
  return wrinkles;
}
vec3 agentOrganicSample(vec2 position,float time) {
  vec3 sampleValue=nativeReliefSample(position,time);
  if(uAgentSpeech>0. && uBend>0.)
    sampleValue+=.28*uAgentSpeech*smoothstep(0.,1.,uBend)*agentSpeechWrinkles(position);
  return sampleValue;
}
vec3 agentRidge(float distance,vec2 gradient,float sharpness) {
  float ridge=exp(-sharpness*distance*distance);
  return vec3(ridge,-2.*sharpness*distance*ridge*gradient);
}
vec2 agentWave(float phase) {
  // Evaluate each slow spatial wave and its derivative together. This avoids
  // mismatched hardware sin/cos approximations in very shallow glass normals.
  const float pi=3.14159265359;
  float x=phase-2.*pi*floor(phase/(2.*pi)+.5),direction=1.;
  if(x>.5*pi) { x=pi-x; direction=-1.; }
  else if(x<-.5*pi) { x=-pi-x; direction=-1.; }
  float z=x*x;
  float value=x*(1.+z*(-1./6.+z*(1./120.+z*(-1./5040.+z*(1./362880.
    +z*(-1./39916800.+z/6227020800.))))));
  float slope=1.+z*(-.5+z*(1./24.+z*(-1./720.+z*(1./40320.
    +z*(-1./3628800.+z/479001600.)))));
  return vec2(value,direction*slope);
}
vec3 agentCapsule(vec2 p,vec2 start,vec2 end,float sharpness) {
  float halfLength=.5*length(end-start);
  vec2 axis=(end-start)/max(.0001,2.*halfLength);
  vec2 normal=vec2(-axis.y,axis.x),q=p-.5*(start+end);
  float along=dot(q,axis),across=dot(q,normal);
  float a=along-halfLength,b=along+halfLength;
  float ra=sqrt(a*a+.000625),rb=sqrt(b*b+.000625);
  // Smooth distance to the segment keeps curvature continuous at its caps.
  // Analytic normals and the finite-difference fallback see the same surface.
  float cap=.5*(ra+rb)-halfLength,capSlope=.5*(a/ra+b/rb);
  float ridge=exp(-sharpness*(across*across+cap*cap));
  return vec3(ridge,-2.*sharpness*ridge*(across*normal+cap*capSlope*axis));
}
vec3 agentUnion(vec3 a,vec3 b) {
  return vec3(a.x+b.x-a.x*b.x,a.yz*(1.-b.x)+b.yz*(1.-a.x));
}
vec3 agentMark(vec3 shape) {
  return vec3(-.62+1.25*shape.x,1.25*shape.yz);
}
vec3 agentSearchLens(vec2 p,vec2 center,float size) {
  vec2 q=(p-center)/size;
  float radius=sqrt(dot(q,q)+.004);
  vec3 lens=agentRidge(radius-.245,q/radius,210.);
  vec3 handle=agentCapsule(q,vec2(.155,-.155),vec2(.355,-.355),230.);
  vec3 shape=agentMark(agentUnion(lens,handle));
  return vec3(shape.x,shape.yz/size);
}
float agentLensEaseOut(float t) {
  float remaining=1.-t,squared=remaining*remaining;
  if(uAgentLensCurve.w<2.) return t;
  if(uAgentLensCurve.w<3.5) return 1.-remaining*squared;
  if(uAgentLensCurve.w>4.5) return 1.-remaining*squared*squared;
  return 1.-squared*squared;
}
float agentLensOrbitPhase() {
  float lap=uAgentLensCurve.x;
  float t=mod(uAgentClock+uAgentLensOffset,lap)/lap;
  if(uAgentLensCurve.w>5.5) return fullTurn*uAgentLensCustomPhase;
  if(uAgentLensCurve.y<=0. || uAgentLensCurve.w<=1.) return fullTurn*t;
  // Overlap the next power3.out pickup before the current curve reaches its
  // stationary tail. Both quartics use 70% of their range, retaining a gentle
  // slowdown with positive speed and a matching velocity across the seam.
  float extent=max(.001,uAgentLensCurve.y),travel=agentLensEaseOut(extent);
  float outgoing=agentLensEaseOut(extent*t),incoming=agentLensEaseOut(extent*(1.-t));
  float eased=.5*(1.+(outgoing-incoming)/travel);
  // Localize the easing around the slowest pass. Squaring this bell keeps
  // the same minimum speed but narrows the slow arc; speed and acceleration
  // also match at the seam. The next pickup still begins halfway through.
  float window=4.*t*(1.-t);
  float localized=uAgentLensCurve.z<=0.?1.:pow(max(0.,window),uAgentLensCurve.z);
  return fullTurn*mix(t,eased,localized);
}
vec2 agentLensOrbitCenter() {
  const float major=.045,minor=.03,tilt=.125*fullTurn;
  // Convert the clock position to an ellipse parameter, so the slowest pass
  // stays at the selected clock direction after tilting the orbit 45 degrees.
  float direction=(.25-uAgentLensPosition/12.)*fullTurn-tilt;
  float anchor=atan(major*sin(direction),minor*cos(direction));
  float phase=agentLensOrbitPhase()-.5*fullTurn+anchor;
  vec2 orbit=vec2(major*cos(phase),minor*sin(phase));
  float c=cos(tilt-uTwist),s=sin(tilt-uTwist);
  return vec2(-.075,.075)+mat2(c,s,-s,c)*orbit;
}
vec3 agentOrbitSearchLens(vec2 p,vec2 center,float amount) {
  // Deform the glass around the moving lens, never around the orb origin.
  // Its center follows the fixed tilted ellipse even at maximum Distortion.
  vec2 q=p-center;
  float denominator=dot(q,q)+.2;
  float stretch=1.+amount*(1.-.2/denominator);
  vec2 slope=.4*amount*q/(denominator*denominator);
  vec2 dx=vec2(stretch,0.)+q*slope.x;
  vec2 dy=vec2(0.,stretch)+q*slope.y;
  vec3 lens=agentSearchLens(q*stretch,vec2(0.),1.);
  return vec3(lens.x,vec2(dot(lens.yz,dx),dot(lens.yz,dy)));
}
vec2 agentSearchPoint(float index) {
  float point=mod(index,6.);
  if(point<.5) return vec2(-.22,.10);
  if(point<1.5) return vec2(-.02,.18);
  if(point<2.5) return vec2(.16,.10);
  if(point<3.5) return vec2(.14,-.10);
  if(point<4.5) return vec2(-.06,-.18);
  return vec2(-.22,-.06);
}
vec2 agentSmallSearchCenter() {
  float tick=.5*uAgentClock;
  float point=floor(tick),t=fract(tick);
  // A positive pace slows gently at each interval without a stationary tail.
  // Its first two derivatives match across intervals and the loop seam.
  float eased=t*t*t*(10.+t*(-15.+6.*t));
  float u=.55*t+.45*eased,s=1.-u;
  // A rounded C2 path carries the lens through direction changes continuously.
  // Positive spline weights keep the whole route inside the waypoint bounds.
  vec4 weights=vec4(s*s*s,3.*u*u*u-6.*u*u+4.,
    -3.*u*u*u+3.*u*u+3.*u+1.,u*u*u)/6.;
  return weights.x*agentSearchPoint(point-1.)+weights.y*agentSearchPoint(point)
    +weights.z*agentSearchPoint(point+1.)+weights.w*agentSearchPoint(point+2.);
}
// State motifs deform only the glass surface. Their analytic derivatives
// use the native height curve and material, with Relief controlled by uRelief.
vec3 agentFolds(vec2 position) {
  float density=1.85*canvasDensity()*uZoom*(uFlowType<.5?1.75:1.);
  float scale=2.*uZoom/.42/max(.001,density);
  vec2 p=(position-.5*density)*scale;
  vec2 unwarped=p;
  // Symmetric radial deformation keeps marks facing forward. Cross-axis
  // shears would tilt their stems, bars and rows even with Rotation set to 0.
  float amount=.035*uBend/(1.+.15*uBend);
  float denominator=dot(p,p)+.2;
  float stretch=1.+amount*(1.-.2/denominator);
  vec2 stretchSlope=.4*amount*p/(denominator*denominator);
  vec2 dx=vec2(stretch,0.)+p*stretchSlope.x;
  vec2 dy=vec2(0.,stretch)+p*stretchSlope.y;
  p*=stretch;
  vec3 folds=vec3(0.);
  vec3 orbital=vec3(0.);
  if(uAgentModesA.y>0.) {
    // Listening: a microphone receives voice. Its capsule widens with input;
    // the cradle, stem and base are continuous folds in the same glass field.
    float response=uAgentVoice*uAgentIntensity;
    float width=.067+.028*response;
    vec3 microphone=agentCapsule(p,vec2(0.,.015),vec2(0.,.255),1./(width*width));
    vec2 q=p-vec2(0.,.08);
    float radius=sqrt(dot(q,q)+.004);
    vec3 cradle=agentRidge(radius-(.225+.028*response),q/radius,220.);
    float open=1./(1.+exp(clamp(55.*(p.y-.12),-40.,40.)));
    vec2 openSlope=vec2(0.,-55.*open*(1.-open));
    cradle=vec3(cradle.x*open,cradle.yz*open+cradle.x*openSlope);
    microphone=agentUnion(microphone,cradle);
    microphone=agentUnion(microphone,agentCapsule(p,vec2(0.,-.15),vec2(0.,-.31),280.));
    microphone=agentUnion(microphone,agentCapsule(p,vec2(-.13,-.31),vec2(.13,-.31),280.));
    folds+=uAgentModesA.y*agentMark(microphone);
  }
  if(uAgentModesA.z>0.) {
    float r2=dot(p,p),radius=sqrt(r2+.004);
    vec3 thinking=vec3(0.);
    if(uAgentThinkingModes.x>0.) {
      // The original two-arm spiral. Radial spacing breathes slowly while
      // the Cartesian form keeps its center and normals smooth.
      float winding=11.+.7*sin(.3*uAgentClock);
      float phase=winding*radius;
      vec2 phaseSlope=winding*p/radius;
      vec2 sine=agentWave(phase),cosine=agentWave(phase+1.57079632679);
      float a=p.x*p.x-p.y*p.y,b=2.*p.x*p.y;
      float numerator=a*sine.x+b*cosine.x;
      vec2 numeratorSlope=2.*vec2(p.x,-p.y)*sine.x
        +2.*vec2(p.y,p.x)*cosine.x+(a*sine.y+b*cosine.y)*phaseSlope;
      float denominator=r2+.025;
      float spiral=numerator/denominator;
      vec2 spiralSlope=(numeratorSlope-2.*p*spiral)/denominator;
      thinking+=uAgentThinkingModes.x*.68*vec3(spiral,spiralSlope);
    }
    if(uAgentThinkingModes.y>0.) {
      // The former Listening surface: broad concentric waves pass through
      // the glass, with a smooth radial center and a slower Thinking pace.
      vec2 wave=agentWave(17.*radius-.55*uAgentClock);
      thinking+=uAgentThinkingModes.y*.62*vec3(wave.x,wave.y*17.*p/radius);
    }
    if(uAgentThinkingModes.z>0.) {
      // The former Searching surface: curved scan folds flow horizontally.
      // A fixed axis preserves the frontal orientation of the circle.
      vec2 wave=agentWave(15.*p.x+2.*p.y*p.y-.55*uAgentClock);
      thinking+=uAgentThinkingModes.z*.62*vec3(wave.x,wave.y*vec2(15.,4.*p.y));
    }
    folds+=uAgentModesA.z*thinking;
  }
  if(uAgentModesA.w>0.) {
    vec3 searching=vec3(0.);
    if(uAgentSearchingModes.x>0.) {
      orbital=uAgentModesA.w*uAgentSearchingModes.x*
        agentOrbitSearchLens(unwarped,agentLensOrbitCenter(),amount);
    }
    if(uAgentSearchingModes.y>0.)
      searching+=uAgentSearchingModes.y*agentSearchLens(p,agentSmallSearchCenter(),.58);
    folds+=uAgentModesA.w*searching;
  }
  if(uAgentModesB.y>0.) {
    // State marks keep their relief independent of voice Responsiveness.
    // Success: a rounded check, sculpted from two joined glass folds.
    float width=.065+.004*sin(.7*uAgentClock);
    float sharpness=1./(width*width);
    vec3 shortLeg=agentCapsule(p,vec2(-.285,-.015),vec2(-.085,-.205),sharpness);
    vec3 longLeg=agentCapsule(p,vec2(-.085,-.205),vec2(.30,.25),sharpness);
    folds+=uAgentModesB.y*agentMark(agentUnion(shortLeg,longLeg));
  }
  if(uAgentModesB.z>0.) {
    // Error holds a stationary cross after the normal state transition.
    vec3 a=agentCapsule(p,vec2(-.255,-.255),vec2(.255,.255),250.);
    vec3 b=agentCapsule(p,vec2(-.255,.255),vec2(.255,-.255),250.);
    folds+=uAgentModesB.z*agentMark(agentUnion(a,b));
  }
  return vec3(folds.x+orbital.x,scale*(vec2(dot(folds.yz,dx),dot(folds.yz,dy))+orbital.yz));
}
vec3 reliefSample(vec2 position,float time) {
  float weight=agentOrganicWeight();
  if(weight>=1.) return agentOrganicSample(position,time);
  vec3 organic=vec3(0.);
  if(weight>0.) organic=weight*agentOrganicSample(position,time);
  return organic+agentFolds(position);
}
`;

// Keep native optics, height mapping, grain and background sampling unchanged.
// Speaking gently speeds up the native folds and adds renewing local wrinkles.
// The base Relief knob, optical material, color clock and grain stay native.
export const fluidAgentOrbFragment = streamFragment
  .replace('uniform vec2 uSpan;', 'uniform vec2 uSpan;\n' + agentUniforms)
  .replace(
    'float warpTime() { return uWarpElapsed * canvasPace(); }',
    'float warpTime() { return (uWarpElapsed+uAgentWarpOffset)*canvasPace(); }',
  )
  .replace('float glassHeight(float field) {', 'float nativeGlassHeight(float field) {')
  .replace('vec2 glassPosition(vec2 surface) {', 'vec2 nativeGlassPosition(vec2 surface) {')
  .replace(
    'vec3 reliefSample(vec2 position, float time) {',
    agentDomain + '\nvec3 nativeReliefSample(vec2 position, float time) {',
  )
  .replace(
    'float reliefField(vec2 position, float time) {',
    agentRelief + '\nfloat reliefField(vec2 position, float time) {',
  )
  .replace(
    'vec2 heightGradient(vec3 sampleValue) {',
    'vec2 nativeHeightGradient(vec3 sampleValue) {',
  )
  .replace(
    'float heightAt(vec2 surface) {',
    `vec2 heightGradient(vec3 sampleValue) {
      return nativeHeightGradient(sampleValue)*agentSpeechReliefScale();
    }
    float heightAt(vec2 surface) {`,
  )
  .replace(
    'vec3 glassBackdrop(vec2 surface, float time) {',
    agentWhiteSupport + '\nvec4 agentBackdropSample(vec2 surface, float time) {',
  )
  .replace(
    'tint = mix(tint, uTintC, .45 * smoothstep(-.7, .8, wash));',
    `float whiteTint=mix(agentWhiteAmount(uTintA),agentWhiteAmount(uTintB),smoothstep(-.65,.65,pool));
    float accent=.45*smoothstep(-.7,.8,wash)*(1.-uAgentPreserveWhites*whiteTint);
    tint=mix(tint,uTintC,accent);
    whiteTint=mix(whiteTint,agentWhiteAmount(uTintC),accent);`,
  )
  .replace(
    'return mix(uBase, tint, smoothstep(-.75, .15, pool - .4 * uDistribution));',
    `float blend=smoothstep(-.75,.15,pool-.4*uDistribution);
    return vec4(mix(uBase,tint,blend),uAgentPreserveWhites*mix(agentWhiteAmount(uBase),whiteTint,blend));`,
  )
  .replace(
    'environment += vec3(1., .99, .97) * key',
    'environment += mix(vec3(1., .99, .97),vec3(1.),uAgentPreserveWhites) * key',
  )
  .replace(
    'vec3 transmission = glassBackdrop(surface + displacement, flowTime());',
    `vec4 backdrop=agentBackdropSample(surface+displacement,flowTime());
    vec3 transmission=backdrop.rgb,whiteAmount=vec3(backdrop.a);`,
  )
  .replace(
    'vec3 red = glassBackdrop(surface + displacement * (1. + spread), flowTime());',
    `vec4 redSample=agentBackdropSample(surface+displacement*(1.+spread),flowTime());
    vec3 red=redSample.rgb;`,
  )
  .replace(
    'vec3 blue = glassBackdrop(surface + displacement * (1. - spread), flowTime());',
    `vec4 blueSample=agentBackdropSample(surface+displacement*(1.-spread),flowTime());
    vec3 blue=blueSample.rgb;
    whiteAmount=vec3(redSample.a,whiteAmount.g,blueSample.a);`,
  )
  .replace(
    'transmission *= exp(-height * .7 * (vec3(1.) - uTintA));',
    'transmission *= mix(exp(-height*.7*(vec3(1.)-uTintA)),vec3(1.),whiteAmount);',
  )
  .replace(
    'vec3 reflection = glassEnvironment(reflect(incident, normal), normalVariation);',
    `float whiteReflection=dot(whiteAmount,vec3(1./3.));
    vec3 reflection=glassEnvironment(reflect(incident,normal),normalVariation);
    reflection=mix(reflection,vec3(max(reflection.r,max(reflection.g,reflection.b))),whiteReflection);`,
  )
  .replace(
    'color *= .88 + .12 * max(0., sideLight);',
    'color *= mix(vec3(.88+.12*max(0.,sideLight)),vec3(1.),whiteAmount);',
  );
export const fluidAgentOrbUniforms = [
  'uAgentModesA',
  'uAgentModesB',
  'uAgentThinkingModes',
  'uAgentSearchingModes',
  'uAgentClock',
  'uAgentLensCurve',
  'uAgentLensOffset',
  'uAgentLensPosition',
  'uAgentLensCustomPhase',
  'uAgentVoice',
  'uAgentIntensity',
  'uAgentPreserveWhites',
  'uAgentWarpOffset',
  'uAgentWrinkleTime',
  'uAgentSpeech',
] as const;
