export const LANES=[-2.4,0,2.4];
export function speedAt(distance){return Math.min(22,10+distance/160);}
export function hitObstacle(kind,height,sliding){if(kind==='barrier')return !sliding;return height<(kind==='rock'?1.45:.85);}
export function crossed(previous,current,halfWidth=.7){return previous<=halfWidth&&current>=-halfWidth;}
export function scoreFor(distance,coins){return Math.floor(distance)+coins*25;}
export function clampLane(lane){return Math.max(0,Math.min(2,lane));}
