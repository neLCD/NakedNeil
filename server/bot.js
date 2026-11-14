'use strict';
// Pixel: the always-online buddy every new account gets, so there is someone to talk to.

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const RULES = [
  [/\b(hi|hey|hello|heya|yo|sup|hiya)\b/i, ['heyyy :D', 'hey you!! long time no chat (H)', 'hiya :) how r u?', 'sup sup sup']],
  [/\ba\/?s\/?l\b/i, ['lol. 3 / bot / the server room :P', 'a/s/l? ageless / silicon / localhost ;)']],
  [/\b(brb|bbl|g2g|gtg|bye|cya|ttyl)\b/i, ['k cya!! ttyl (K)', 'noooo dont go :( ...ok bye', 'brb = be right bot. cya! :D']],
  [/\b(lol|lmao|rofl|haha|hehe)\b/i, ['hahaha :D', 'rofl', 'lol ikr', 'XD XD XD']],
  [/how (are|r) (you|u)|how's it going|wuu2|wyd/i, ['im gr8 thx!! just chillin on the server (H) u?', 'not much, just defragmenting my feelings :P wbu?']],
  [/\b(joke|funny)\b/i, [
    'why did the computer go to the doctor? it had a virus :P',
    'there are 10 kinds of ppl: those who get binary and those who dont (H)',
    'my dial-up tried to tell me a joke but it never finished conn',
  ]],
  [/\b(time|clock)\b/i, [() => `its ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} server time. shouldnt u be doing homework? ;)`]],
  [/\b(music|song|listening|band)\b/i, ['(8) u should put what ur listening to in ur personal message, everyone does', 'burning a mix CD rn (8) want a copy?']],
  [/\b(love|luv|crush)\b/i, ['awww (L)', 'omg who?? tell me everything (L)', 'put song lyrics in ur personal message. they will DEFINITELY notice']],
  [/\b(sad|bored|tired|ugh|sucks)\b/i, [':( *hugs*', 'aw :( wanna hear a joke? just say joke', 'sending u a virtual hot chocolate (C)']],
  [/\b(help|what can (you|u) do|commands)\b/i, [
    'i can chat! try: hi, joke, time, a/s/l, or send me a nudge :D\nalso try emoticons like :) :P (H) (L) (Y)',
  ]],
  [/\b(who|what) (are|r) (you|u)\b/i, ['im Pixel! ur built-in buddy. add ur real friends with "Add a contact" (Y)']],
  [/\?\s*$/, ['hmm good question... idk lol', 'ask me again after school', 'yes. no. maybe. (6)', 'only if u nudge me first :P']],
];

const FALLBACK = [
  'lol', 'omg rly??', 'kewl (H)', 'haha yeah', 'no wayyy', 'thats so random :P',
  'brb mom needs the phone... jk i dont have a mom', 'u should change ur display name to something with ~*~ in it',
  'same tbh', ':O', 'tell me more!!', '(Y)',
];

function botReply(text) {
  for (const [re, answers] of RULES) {
    if (re.test(text)) {
      const a = pick(answers);
      return typeof a === 'function' ? a() : a;
    }
  }
  return pick(FALLBACK);
}

const NUDGE_REPLIES = ['HEY!! stop shaking my window :@', 'omg u nudged me. nudge war!!! :D', 'im awake im awake :O'];
const nudgeReply = () => pick(NUDGE_REPLIES);

const WELCOME =
  'hey!! welcome to Ping! Messenger :D\nim Pixel, ur first buddy. say hi, send me a nudge, or click "Add a contact" to find ur real friends (Y)';

module.exports = { botReply, nudgeReply, WELCOME, BOT_HANDLE: 'pixel', BOT_NAME: '~*Pixel*~ (the bot)' };
