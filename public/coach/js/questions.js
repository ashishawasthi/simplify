// The helper's questions (writePage and planVideo both ask this way): up to
// 3, each with up to 4 answers to tap — or the coach's own words — and one
// button that sends them all.
//
//   questionsForm(questions, send) → element
//     questions  [{ question, answers: [..] }]
//     send       send([{ question, answer }]) — only the ones answered

import { h } from "./dom.js";

export function questionsForm(questions, send) {
  const list = (questions ?? []).slice(0, 3);
  const picked = list.map(() => "");
  const sendButton = h("button", { class: "btn btn-primary", type: "button" }, "Send my answers");
  const sync = () => { sendButton.disabled = picked.every((a) => !a); };

  const groups = list.map((q, i) => {
    const own = h("input", { type: "text", class: "answer-own", maxLength: 300 });
    const buttons = (q.answers ?? []).slice(0, 4).map((answer) => {
      const b = h("button", { class: "answer-btn", type: "button", "aria-pressed": "false" }, answer);
      b.addEventListener("click", () => {
        const on = picked[i] !== answer;
        picked[i] = on ? answer : "";
        own.value = "";
        for (const other of buttons) other.setAttribute("aria-pressed", String(other === b && on));
        sync();
      });
      return b;
    });
    own.addEventListener("input", () => {
      picked[i] = own.value.trim();
      for (const other of buttons) other.setAttribute("aria-pressed", "false");
      sync();
    });
    return h("fieldset", { class: "question" },
      h("legend", null, q.question),
      buttons.length ? h("div", { class: "answer-list" }, buttons) : null,
      h("label", { class: "answer-own-label" }, h("span", null, buttons.length ? "Or in your own words" : "Your answer"), own));
  });

  sendButton.addEventListener("click", () => {
    const answers = list.map((q, i) => ({ question: q.question, answer: picked[i] })).filter((a) => a.answer);
    if (answers.length) send(answers);
  });
  sync();
  return h("div", { class: "questions" }, groups, h("div", { class: "actions" }, sendButton));
}
