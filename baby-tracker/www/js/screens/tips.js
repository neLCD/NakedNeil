// Tips (inside Ideas): built-in tips from the parent's own logs, and Ask the AI
// when an AI service address is set.
import * as L from '../logic.js';
import { h, render } from '../ui.js';
import { state, view } from '../store.js';
import { DEFAULT_AI_URL } from '../config.js';
import { settingsSheet } from './settings.js';

const AI_PROMPTS = ['What foods should we try next?', 'How is sleep looking this week?', 'What should we play today?', 'What gear will we need soon?'];
const aiUrl = () => (state.settings.aiUrl || DEFAULT_AI_URL || '').trim().replace(/\/+$/, '');

async function askAi(question) {
  const q = question.trim();
  if (!q || view.ai.busy) return;
  view.ai = { busy: true, answer: '', error: '', question: q, draft: '' };
  render();
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000); // never "Thinking…" forever
  try {
    const res = await fetch(`${aiUrl()}/suggest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ question: q, summary: L.aiSummary(state) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The AI service returned an error (${res.status}).`);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('The AI service sent back an empty answer. Please try again.');
    view.ai = { busy: false, answer: text, error: '', question: q, draft: '' };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'The AI service took too long to answer. Please try again.'
      : err instanceof TypeError ? 'Could not reach the AI service. Check your connection and the address in Settings.' : err.message;
    view.ai = { busy: false, answer: '', question: q, error: message, draft: q };
  } finally { clearTimeout(timer); }
  render();
}
/** Lets a parent flag an answer that seems wrong or unsafe (sent to the AI server's log). */
async function reportAnswer() {
  const { question, answer } = view.ai;
  view.ai.reported = true; render();
  try {
    await fetch(`${aiUrl()}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, answer }) });
  } catch { /* the thanks still shows; there is nothing useful the parent can do about a failed report */ }
}

export function viewTips() {
  const tips = L.buildTips(state);
  const input = h('textarea', { rows: 2, maxLength: 500, placeholder: 'Ask anything about feeding, sleep, foods, gear…', value: view.ai.draft || '', oninput: (e) => { view.ai.draft = e.target.value; } });
  return [
    aiUrl() && h('section', { class: 'card ai' }, h('h2', null, 'Ask the AI'),
      h('div', { class: 'chips' }, AI_PROMPTS.map((p) => h('button', { type: 'button', disabled: view.ai.busy, onclick: () => askAi(p) }, p))),
      h('form', { onsubmit: (e) => { e.preventDefault(); askAi(input.value); } }, input,
        h('button', { class: 'btn primary block', type: 'submit', disabled: view.ai.busy }, view.ai.busy ? 'Thinking…' : 'Ask')),
      view.ai.error && h('p', { class: 'warnbox', role: 'alert' }, view.ai.error),
      view.ai.answer && h('div', { class: 'answer', role: 'status' }, h('small', null, view.ai.question), h('p', null, view.ai.answer),
        view.ai.reported ? h('small', null, 'Thanks. This answer has been reported.')
          : h('button', { class: 'linkish small', type: 'button', onclick: reportAnswer }, 'Report a problem with this answer')),
      h('p', { class: 'fine' }, 'Asking sends a summary of the last 7 days of logs, plus growth, foods, words, activities and gear, to the AI service. Answers are general information, not medical advice.')),
    h('section', { class: 'card' }, h('h2', null, 'Tips for right now'),
      h('ul', { class: 'tips' }, tips.map((t) => h('li', { class: t.tone || '' }, h('i', null, t.icon), h('span', null, h('b', null, t.title), h('small', null, t.text))))),
      h('p', { class: 'fine' }, 'General information based on your logs. It is not medical advice. If you are worried about your baby, contact your doctor.')),
    !aiUrl() && h('p', { class: 'fine pad' }, 'AI suggestions are off. ', h('button', { class: 'linkish', type: 'button', onclick: settingsSheet }, 'Add an AI service address in Settings'), ' to ask questions about your baby’s logs.'),
  ];
}
