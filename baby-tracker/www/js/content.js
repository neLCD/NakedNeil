// Built-in reference content: first-food ideas and gear suggestions.
// General information only; it does not replace advice from a doctor.

export const FOOD_IDEAS = [
  // around 6 months
  { name: 'Avocado', fromMonths: 6, prep: 'Mash until smooth, or offer a ripe spear to hold.' },
  { name: 'Banana', fromMonths: 6, prep: 'Mash with a fork; thin with milk if needed.' },
  { name: 'Sweet potato', fromMonths: 6, prep: 'Steam or roast until very soft, then mash.' },
  { name: 'Carrot', fromMonths: 6, prep: 'Steam until soft enough to squash between fingers, then mash. Never raw.' },
  { name: 'Butternut squash', fromMonths: 6, prep: 'Roast or steam until soft and mash.' },
  { name: 'Pear', fromMonths: 6, prep: 'Use a very ripe pear, or steam and mash.' },
  { name: 'Apple', fromMonths: 6, prep: 'Steam and puree. Raw apple pieces are a choking hazard.' },
  { name: 'Baby oatmeal', fromMonths: 6, prep: 'Iron-fortified cereal mixed with breast milk or formula.' },
  { name: 'Peas', fromMonths: 6, prep: 'Cook well and mash or puree; whole peas can be squashed flat.' },
  { name: 'Broccoli', fromMonths: 6, prep: 'Steam florets until very soft.' },
  { name: 'Lentils', fromMonths: 6, prep: 'Cook until very soft and mash. A good source of iron.' },
  { name: 'Chicken', fromMonths: 6, prep: 'Cook through, then puree or shred very finely.' },
  { name: 'Beef', fromMonths: 6, prep: 'Slow-cook and puree. Rich in iron.' },
  { name: 'Plain yogurt', fromMonths: 6, allergen: 'milk', prep: 'Full-fat, unsweetened, pasteurised.' },
  { name: 'Egg', fromMonths: 6, allergen: 'egg', prep: 'Cook until firm (hard-boiled or well scrambled) and mash.' },
  { name: 'Peanut butter', fromMonths: 6, allergen: 'peanut', prep: 'Smooth only, thinned with warm water or milk, or stirred into puree. Never whole nuts or a spoonful on its own.' },
  { name: 'Salmon', fromMonths: 6, allergen: 'fish', prep: 'Cook through, remove every bone, and flake finely.' },
  { name: 'Tofu', fromMonths: 6, allergen: 'soy', prep: 'Soft tofu, mashed or in strips.' },
  { name: 'Toast fingers', fromMonths: 6, allergen: 'wheat', prep: 'Lightly toasted strips; a thin spread of mashed avocado works well.' },
  // around 8 months
  { name: 'Pasta', fromMonths: 8, allergen: 'wheat', prep: 'Cook until very soft; small shapes or cut pieces.' },
  { name: 'Cheese', fromMonths: 8, allergen: 'milk', prep: 'Pasteurised, grated or in thin strips.' },
  { name: 'Blueberries', fromMonths: 8, prep: 'Squash flat or quarter each one. Never whole.' },
  { name: 'Strawberries', fromMonths: 8, prep: 'Mash or slice thinly.' },
  { name: 'Mango', fromMonths: 8, prep: 'Ripe, in soft strips or mashed.' },
  { name: 'Beans', fromMonths: 8, prep: 'Cook until soft and mash or squash each bean.' },
  // around 10 months
  { name: 'Rice', fromMonths: 10, prep: 'Well cooked and slightly sticky so it clumps.' },
  { name: 'Grapes', fromMonths: 10, prep: 'Always cut lengthways into quarters. Whole grapes are a serious choking hazard.' },
  { name: 'Soft vegetable pieces', fromMonths: 10, prep: 'Cooked until soft, cut into small pieces for practising the pincer grip.' },
];

export const FOODS_TO_AVOID = [
  'Honey before 12 months (risk of infant botulism)',
  'Cow’s milk as a main drink before 12 months (fine in cooking and as yogurt or cheese)',
  'Whole nuts, whole grapes, popcorn, hard raw vegetables and other choking hazards',
  'Added salt and sugar, and juice or other sweet drinks',
  'Water before 6 months (after that, sips of water with meals are fine)',
  'Fish high in mercury, such as shark, swordfish and marlin',
  'Rice drinks as a milk substitute, and mould-ripened or blue cheeses',
  'Unpasteurised dairy, and raw or runny egg unless your local guidance says it is safe',
];

export const GEAR_CATEGORIES = ['Sleep', 'Feeding', 'Travel', 'Changing', 'Play', 'Safety', 'Clothing', 'Health', 'Other'];

export const GEAR_IDEAS = [
  { name: 'Car seat', category: 'Travel', fromMonths: 0 },
  { name: 'Cot or bassinet', category: 'Sleep', fromMonths: 0 },
  { name: 'Firm cot mattress', category: 'Sleep', fromMonths: 0 },
  { name: 'Swaddles or sleep sacks', category: 'Sleep', fromMonths: 0, toMonths: 2, note: 'Stop swaddling at the first signs of rolling; sleep sacks are fine after that.' },
  { name: 'Changing mat', category: 'Changing', fromMonths: 0 },
  { name: 'Bottles', category: 'Feeding', fromMonths: 0 },
  { name: 'Burp cloths', category: 'Feeding', fromMonths: 0 },
  { name: 'Baby thermometer', category: 'Health', fromMonths: 0 },
  { name: 'Baby nail clippers', category: 'Health', fromMonths: 0 },
  { name: 'Baby carrier', category: 'Travel', fromMonths: 0 },
  { name: 'Stroller', category: 'Travel', fromMonths: 0 },
  { name: 'Play mat', category: 'Play', fromMonths: 2 },
  { name: 'Teething toys', category: 'Play', fromMonths: 3 },
  { name: 'High chair', category: 'Feeding', fromMonths: 5 },
  { name: 'Bibs', category: 'Feeding', fromMonths: 5 },
  { name: 'Soft-tip spoons', category: 'Feeding', fromMonths: 5 },
  { name: 'Suction bowls', category: 'Feeding', fromMonths: 6 },
  { name: 'Open or sippy cup', category: 'Feeding', fromMonths: 6 },
  { name: 'Stair gates', category: 'Safety', fromMonths: 7 },
  { name: 'Cabinet locks', category: 'Safety', fromMonths: 7 },
  { name: 'Outlet covers', category: 'Safety', fromMonths: 7 },
  { name: 'Next-stage car seat', category: 'Travel', fromMonths: 9, note: 'When the infant seat is outgrown by height or weight. Keep rear-facing for as long as the seat allows.' },
  { name: 'First shoes', category: 'Clothing', fromMonths: 11 },
];
