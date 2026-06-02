// Polish system barrel. Section compositions import from "@local/polish".
//
// Application order (outermost → innermost):
//   <Grade>                  ← color grade + vignette
//     <Breathe>              ← perpetual micro-motion
//       <Background />       ← section content
//       <Subtitle />         ← burned-in caption
//       <Grain />            ← film-grain overlay (last so it sits on top)
//     </Breathe>
//   </Grade>

export { Bloom } from "./Bloom";
export { Breathe } from "./Breathe";
export { CameraMove } from "./CameraMove";
export { FrostedGlass } from "./FrostedGlass";
export { Grade } from "./Grade";
export { Grain, GrainSuppressor } from "./Grain";
export { Lift } from "./Lift";
export { LightBeam } from "./LightBeam";
export * from "./motion";
export { Parallax } from "./Parallax";
export { RackFocus } from "./RackFocus";
export { Subtitle } from "./Subtitle";
export * from "./tokens";
