// Wider than one height interval, adjacent quintic risers overlap. Include
// their tails so the height and its first two derivatives stay continuous
// across layer boundaries. Widths up to one keep the original profile.
export const terraceShader = `
float terraceBevel(float position) {
  float t=clamp((position-(.5-uSoftness*.5))/uSoftness,0.,1.);
  return t*t*t*(t*(t*6.-15.)+10.);
}
float terraceBevelGain(float position) {
  float t=clamp((position-(.5-uSoftness*.5))/uSoftness,0.,1.);
  return 30.*t*t*(1.-t)*(1.-t)/uSoftness;
}
float terraceProfile(float phase) {
  float position=fract(phase), bevel=terraceBevel(position);
  if(uSoftness>1.)
    bevel+=terraceBevel(position+1.)-1.+terraceBevel(position-1.);
  return floor(phase)+bevel;
}
float terraceGain(float phase) {
  float position=fract(phase), gain=terraceBevelGain(position);
  if(uSoftness>1.)
    gain+=terraceBevelGain(position+1.)+terraceBevelGain(position-1.);
  return gain;
}`;

export const terrainSplineShader = `vec4 weights(float t) {
  float t2=t*t, t3=t2*t;
  return vec4(1.-3.*t+3.*t2-t3,4.-6.*t2+3.*t3,1.+3.*t+3.*t2-3.*t3,t3)/6.;
}
vec4 derivatives(float t) {
  float t2=t*t;
  return vec4(-.5+t-.5*t2,-2.*t+1.5*t2,.5+t-1.5*t2,.5*t2);
}
// Ray corrections usually stay in one height-cache cell. Retain its sixteen
// scalar samples for this fragment, reloading only when a cell boundary is
// crossed. Heights and analytic C2 derivatives keep their exact evaluation.
ivec2 patchCell=ivec2(-1000000);
mat4 heightPatch;
vec3 elevationSurface(vec2 uv) {
  vec2 p=uv*(uGrid-1.), cell=floor(p), f=fract(p);
  ivec2 nextCell=ivec2(cell);
  if(any(notEqual(nextCell,patchCell))) {
    ivec2 size=ivec2(uGrid), origin=nextCell-1;
    for(int j=0;j<4;j++) for(int i=0;i<4;i++) {
      vec3 h=texelFetch(uHeight,clamp(origin+ivec2(i,j),ivec2(0),size-1),0).rgb;
      heightPatch[j][i]=dot(h,vec3(1.,uCosine,uSine));
    }
    // Convert each row once to its cubic polynomial. Subsequent ray
    // corrections in this cell evaluate values and slopes using Horner form.
    for(int j=0;j<4;j++) {
      vec4 h=heightPatch[j];
      heightPatch[j]=vec4(h.x+4.*h.y+h.z,3.*(h.z-h.x),3.*(h.x-2.*h.y+h.z),-h.x+3.*h.y-3.*h.z+h.w)/6.;
    }
    heightPatch=transpose(heightPatch);
    patchCell=nextCell;
  }
  vec4 y=weights(f.y), dy=derivatives(f.y);
  vec4 rows=((heightPatch[3]*f.x+heightPatch[2])*f.x+heightPatch[1])*f.x+heightPatch[0];
  vec4 slopes=(3.*heightPatch[3]*f.x+2.*heightPatch[2])*f.x+heightPatch[1];
  vec3 result=vec3(dot(rows,y),dot(slopes,y),dot(rows,dy));
  result.yz*=vec2(uGrid.x-1.,-(uGrid.y-1.))/uExtent;
  return result;
}
`;

export const terrainElevationColorShader = `vec3 elevationColor(float height) {
  if(uGradientStops<2) return uSurfaceColor;
  float intervals=float(uGradientStops-1);
  if(uGradientDiffusion<=0.) {
    float position=height*intervals;
    int segment=min(int(floor(position)),uGradientStops-2);
    return mix(uGradientColors[segment],uGradientColors[segment+1],smoothstep(0.,1.,position-float(segment)));
  }
  float halfWidth=(1.+3.*uGradientDiffusion)/intervals*.5;
  vec3 result=uGradientColors[0];
  for(int i=0;i<7;i++) {
    if(i>=uGradientStops-1) break;
    float center=(float(i)+.5)/intervals;
    result+=(uGradientColors[i+1]-uGradientColors[i])*smoothstep(center-halfWidth,center+halfWidth,height);
  }
  return result;
}
`;

export const terrainMaterialShader = `  // A restrained local crease shade suggests stacked paper. It is spatial,
  // without a shadow-map pass or a second animated noise clock.
  float cavity=1.-.1*(1.-normal.z);
  vec3 base=elevationColor(clamp((altitude+.65)/1.3,0.,1.));
  vec3 material;
  // Hemisphere shading is azimuth-independent: plateaus keep their exact
  // selected color, while every bevel retains volume. Reuse the filtered
  // normal and cavity; no extra samples, targets or geometry are needed.
  float direct=max(dot(normal,uLight),0.);
  float lighting=clamp(.54+uLightIntensity*.48*direct,.3,1.22);
  // Very dark materials need reflected edge light instead of a darker shade.
  // The flat plateau still retains the exact selected color, including black.
  float darkMaterial=1.-smoothstep(0.,.12,max(base.r,max(base.g,base.b)));
  // Both chosen colors are endpoints: flat plateaus retain the surface RGB,
  // pronounced bevels reach the shadow RGB, and C1 easing connects them.
  // Reuse the filtered normal so the transition stays smooth during morph.
  float relief=smoothstep(.4,1.,normal.z);
  vec3 shadow=uCustomShadow ? uShadowColor : vec3(darkMaterial);
  vec3 pure=mix(shadow,base,relief);
  vec3 directional=base*lighting*cavity
    +shadow*((1.-darkMaterial)*(1.-min(lighting*cavity,1.))
      +darkMaterial*(1.-normal.z)*.35*clamp(uLightIntensity*direct,0.,1.));
  material=mix(pure,directional,uLightingBlend);
  float fleck=uGrainAmount>0.?texture(uGrain,gl_FragCoord.xy/uCanvasSize).r:0.;
  // White grain fades with the existing material brightness instead of
  // adding gray to a selected black shadow. Exact black remains exact black.
  material=mix(material,vec3(1.),uGrainAmount*.45*fleck*fleck
    *clamp(max(material.r,max(material.g,material.b)),0.,1.));
  if(uOpacity>0.) {
    float level=floor(q);
    float rim=abs(fract(q)-.5)/max(length(screenSlope),.00001);
    float ink=1.-smoothstep(max(0.,uWidth*uRatio*.5-.65),uWidth*uRatio*.5+.65,rim);
    vec3 pigment=mod(abs(level),4.)<.5?uAccentColor:uLineColor;
    pigment*=1.-uGrainAmount*.32*fleck;
    material=mix(material,pigment,ink*uOpacity*.72);
  }
  color=vec4(material,1.);`;
