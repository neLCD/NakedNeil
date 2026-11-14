// Food ideas (inside Ideas): starter foods by age with safe preparation, and what to wait on.
// "Tried it" adds the food to Firsts > Foods.
import * as L from '../logic.js';
import { h } from '../ui.js';
import { state } from '../store.js';
import { FOOD_IDEAS, FOODS_TO_AVOID } from '../content.js';
import { foodSheet } from './firsts.js';

export function viewFoodIdeas() {
  const tried = new Set(state.foods.map((f) => f.name.trim().toLowerCase()));
  const months = L.ageMonths(state.baby.birthDate);
  const stages = [[6, 'From around 6 months'], [8, 'From around 8 months'], [10, 'From around 10 months']];
  return [
    months != null && months < 5.5 && h('p', { class: 'warnbox' }, 'Solids usually start at around 6 months. Until then, breast milk or formula is all your baby needs. Ask your doctor before starting earlier.'),
    stages.map(([m, title]) => h('section', { class: 'card' }, h('h2', null, title),
      h('ul', { class: 'ideas' }, FOOD_IDEAS.filter((f) => f.fromMonths === m).map((f) => h('li', null,
        h('span', { class: 'grow' }, h('b', null, f.name, f.allergen && h('span', { class: 'tag' }, `allergen: ${f.allergen}`)), h('small', null, f.prep)),
        tried.has(f.name.toLowerCase()) ? h('span', { class: 'done' }, '✓ Tried')
          : h('button', { class: 'btn small', type: 'button', onclick: () => foodSheet(null, f.name) }, 'Tried it')))))),
    h('section', { class: 'card' }, h('h2', null, 'Wait on these'), h('ul', { class: 'bullets' }, FOODS_TO_AVOID.map((t) => h('li', null, t))),
      h('p', { class: 'fine' }, 'Introduce common allergens one at a time and watch for a reaction. If your baby has severe eczema or a known allergy, ask your doctor first. General information only, not medical advice.')),
  ];
}
