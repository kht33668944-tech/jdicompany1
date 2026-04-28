// phosphor-react 아이콘별 deep import (`.esm.js` 경로) 의 타입 선언.
// Turbopack/webpack 은 .esm.js 를 정상 해석하지만, TypeScript 는 그 옆의 .d.ts 를
// 찾지 못해 implicit any 가 된다. 이 shim 으로 IconProps 시그니처를 그대로 노출한다.
declare module "phosphor-react/dist/icons/*.esm.js" {
  import type { ForwardRefExoticComponent, RefAttributes } from "react";
  import type { IconProps } from "phosphor-react";
  const Icon: ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;
  export default Icon;
}
