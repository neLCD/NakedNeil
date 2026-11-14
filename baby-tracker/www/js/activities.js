// Play and activity ideas by age. Simple things to do with what is already at home.
// `from`/`to` are months. `area` is what the activity mainly supports.
// General ideas only; always stay with your baby during play.

export const ACTIVITY_AREAS = { move: 'Movement', senses: 'Senses', talk: 'Language', think: 'Thinking', bond: 'Bonding' };

export const ACTIVITY_BANDS = [
  { from: 0, to: 3, label: '0 to 3 months' },
  { from: 3, to: 6, label: '3 to 6 months' },
  { from: 6, to: 9, label: '6 to 9 months' },
  { from: 9, to: 12, label: '9 to 12 months' },
  { from: 12, to: 18, label: '12 to 18 months' },
  { from: 18, to: 36, label: '18 months and up' },
];

export const ACTIVITIES = [
  // 0 to 3 months
  { id: 'tummy-chest', from: 0, to: 3, icon: '🤱', name: 'Tummy time on your chest', area: 'move', minutes: 3,
    how: 'Lie back and place baby tummy-down on your chest so they lift their head to find your face. A few short sessions a day, only while awake and watched.' },
  { id: 'face-time', from: 0, to: 3, icon: '😊', name: 'Face to face', area: 'bond', minutes: 5,
    how: 'Hold baby about 20 to 30 cm from your face. Smile, stick out your tongue, raise your eyebrows, and pause so they can copy.' },
  { id: 'contrast-cards', from: 0, to: 3, icon: '🏁', name: 'Black and white pictures', area: 'senses', minutes: 5,
    how: 'Show bold black and white patterns or a striped cloth. Move it slowly from side to side and let their eyes follow.' },
  { id: 'narrate', from: 0, to: 3, icon: '🗣️', name: 'Talk through the day', area: 'talk', minutes: 5,
    how: 'Describe what you are doing during changes and feeds. Leave gaps for coos and answer them as if in conversation.' },
  { id: 'gentle-massage', from: 0, to: 3, icon: '👐', name: 'Gentle massage', area: 'bond', minutes: 5,
    how: 'After a bath, stroke arms, legs and tummy with slow, light strokes. Stop if baby turns away or fusses.' },
  // 3 to 6 months
  { id: 'tummy-mat', from: 3, to: 6, icon: '🧸', name: 'Tummy time with a toy', area: 'move', minutes: 10,
    how: 'On a mat on the floor, place a toy just out of reach so baby pushes up and stretches for it. Stay close.' },
  { id: 'mirror', from: 3, to: 6, icon: '🪞', name: 'Mirror play', area: 'think', minutes: 5,
    how: 'Hold baby in front of a mirror. Point to their nose and yours, wave, and name what you see.' },
  { id: 'rattle-reach', from: 3, to: 6, icon: '🎵', name: 'Reach and grab', area: 'move', minutes: 5,
    how: 'Hold a rattle within reach and let baby bat at it, grab it and bring it to their mouth. Use toys too big to swallow.' },
  { id: 'sing-actions', from: 3, to: 6, icon: '🎶', name: 'Songs with actions', area: 'talk', minutes: 5,
    how: 'Sing simple songs and move baby’s hands or bounce gently in time. Repeat favourites; repetition is how they learn.' },
  { id: 'textures', from: 3, to: 6, icon: '🧶', name: 'Feel different textures', area: 'senses', minutes: 5,
    how: 'Let baby touch a soft towel, a crinkly wrapper, a smooth spoon. Name each one: soft, crinkly, cold.' },
  // 6 to 9 months
  { id: 'peekaboo', from: 6, to: 9, icon: '🙈', name: 'Peekaboo', area: 'think', minutes: 5,
    how: 'Hide your face behind your hands or a cloth and reappear. Later, hide a toy under a cloth and let baby find it.' },
  { id: 'sit-and-reach', from: 6, to: 9, icon: '🪑', name: 'Sit and reach', area: 'move', minutes: 10,
    how: 'Sit baby on the floor with cushions around and toys in front and to the sides, so they lean, twist and balance.' },
  { id: 'bang-pots', from: 6, to: 9, icon: '🥁', name: 'Kitchen drum kit', area: 'senses', minutes: 10,
    how: 'Offer a wooden spoon and a pot or plastic tub. Banging teaches cause and effect, and it is loud, which they love.' },
  { id: 'book-look', from: 6, to: 9, icon: '📖', name: 'Look at a book together', area: 'talk', minutes: 5,
    how: 'Choose a sturdy board book. Point at pictures and name them. Let baby turn pages and chew the corners.' },
  { id: 'roll-ball', from: 6, to: 9, icon: '⚽', name: 'Roll a ball', area: 'move', minutes: 5,
    how: 'Roll a soft ball towards baby and encourage them to push it back. Good for early crawling attempts too.' },
  // 9 to 12 months
  { id: 'container-play', from: 9, to: 12, icon: '🧺', name: 'Fill and empty', area: 'think', minutes: 10,
    how: 'Give a basket and safe objects too large to swallow. Putting in and tipping out can last a surprisingly long time.' },
  { id: 'cruise', from: 9, to: 12, icon: '🛋️', name: 'Cruise the sofa', area: 'move', minutes: 10,
    how: 'Place toys along the sofa so baby pulls up and side-steps to reach them. Stay within arm’s reach.' },
  { id: 'wave-clap', from: 9, to: 12, icon: '👋', name: 'Wave, clap, point', area: 'talk', minutes: 5,
    how: 'Wave bye-bye, clap and point at things while naming them. Gestures come before words, so celebrate each one.' },
  { id: 'stack-knock', from: 9, to: 12, icon: '🧱', name: 'Build it, knock it down', area: 'think', minutes: 10,
    how: 'Stack two or three blocks or cups and let baby knock them over. Then hand them one to add.' },
  { id: 'finger-food-play', from: 9, to: 12, icon: '🫐', name: 'Pincer practice', area: 'move', minutes: 10,
    how: 'At mealtime, offer small soft pieces of food on the tray so baby practises picking up with finger and thumb.' },
  // 12 to 18 months
  { id: 'push-walk', from: 12, to: 18, icon: '🚶', name: 'Push and walk', area: 'move', minutes: 10,
    how: 'A sturdy push toy or a weighted box to push across the room builds balance. Clear the path and stay near.' },
  { id: 'name-body', from: 12, to: 18, icon: '👃', name: 'Where is your nose?', area: 'talk', minutes: 5,
    how: 'Ask baby to point to nose, tummy, toes. Name each one as you wash or dress them.' },
  { id: 'scribble', from: 12, to: 18, icon: '🖍️', name: 'First scribbles', area: 'move', minutes: 10,
    how: 'Tape paper to the table and offer one chunky crayon. Show a mark, then let them try. Stay close; crayons get tasted.' },
  { id: 'shape-sorter', from: 12, to: 18, icon: '🔷', name: 'Shapes and lids', area: 'think', minutes: 10,
    how: 'A shape sorter, or tubs with lids to match. Let them struggle a little before helping.' },
  { id: 'water-pour', from: 12, to: 18, icon: '💦', name: 'Pouring water', area: 'senses', minutes: 10,
    how: 'A shallow tray with a little water and two cups. Never leave a child alone with water, even for a moment.' },
  // 18 months and up
  { id: 'pretend', from: 18, to: 36, icon: '🫖', name: 'Pretend play', area: 'think', minutes: 15,
    how: 'Feed a teddy, make a pretend phone call, cook with empty pots. Follow their lead and join in.' },
  { id: 'helper', from: 18, to: 36, icon: '🧽', name: 'Little helper', area: 'bond', minutes: 10,
    how: 'Give a real job: put socks in the basket, wipe the table, carry the spoon. Slow, but they are proud of it.' },
  { id: 'dance', from: 18, to: 36, icon: '💃', name: 'Dance and freeze', area: 'move', minutes: 10,
    how: 'Play music and dance, then stop the music and freeze. Great for listening and balance.' },
  { id: 'two-step', from: 18, to: 36, icon: '🧩', name: 'Two-step requests', area: 'talk', minutes: 5,
    how: 'Ask for two things in a row: get the ball and put it in the box. Add new words as they succeed.' },
  { id: 'outdoor-hunt', from: 18, to: 36, icon: '🍂', name: 'Outdoor treasure hunt', area: 'senses', minutes: 20,
    how: 'Collect a leaf, a stone, a stick. Talk about big, small, rough, smooth. Watch what goes in the mouth.' },
];

/** The band that fits an age in months (falls back to the first band when age is unknown). */
export function bandFor(months) {
  if (months == null) return ACTIVITY_BANDS[0];
  return ACTIVITY_BANDS.find((b) => months >= b.from && months < b.to) || ACTIVITY_BANDS[ACTIVITY_BANDS.length - 1];
}
