// Ideas: everything the app suggests, in one place. Play, food, tips (and Ask the AI) and gear.
import { render, seg } from '../ui.js';
import { view } from '../store.js';
import { viewPlay } from './play.js';
import { viewFoodIdeas } from './food-ideas.js';
import { viewTips } from './tips.js';
import { viewGear } from './gear.js';

const PARTS = { play: ['Play', viewPlay], food: ['Food', viewFoodIdeas], tips: ['Tips', viewTips], gear: ['Gear', viewGear] };
export function viewIdeas() {
  const part = PARTS[view.ideas] || PARTS.play;
  return [
    seg(Object.entries(PARTS).map(([k, [label]]) => [k, label]), view.ideas, (v) => { view.ideas = v; render(); }),
    part[1](),
  ];
}
