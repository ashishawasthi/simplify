// The AI helper: "Tell the helper what to write or change". One call to the
// writePage function (Gemini Flash) answers in one of three ways, always
// starting with "I understood: …" — so a request put badly is visibly put
// right, and a misunderstanding shows at once:
//   write    a new draft replaces the editor's page (Undo brings the coach's
//            own text back). Nothing reaches learners until Publish.
//   ask      up to 3 questions, each with answers to tap (or type one)
//   decline  one kind line: the request isn't about school, learning or
//            daily life
// Each call counts against the coach's Flash requests this month.

import { h, fill } from "./dom.js";
import { questionsForm } from "./questions.js";

export function mountHelper(ws) {
  const { code, cloud } = ws;
  let busy = false;

  const input = h("textarea", {
    id: "helper-input", class: "helper-input", rows: 3, maxLength: 1000,
    "aria-describedby": "helper-hint",
  });
  const ask = h("button", { class: "btn btn-primary", type: "button" }, "Ask the helper");
  const usage = h("p", { class: "usage-line" });
  const result = h("div", { class: "helper-result", "aria-live": "polite" });

  const element = h("section", { class: "helper panel", "aria-labelledby": "helper-h" },
    h("h2", { id: "helper-h" }, "Helper"),
    h("div", { class: "field" },
      h("label", { for: "helper-input" }, "Tell the helper what to write or change"),
      h("p", { class: "field-hint", id: "helper-hint" },
        "For example: “Make this simpler”, or “Write a picture story about going to the dentist with my 4 pictures”. " +
        "It writes a draft in the editor for you to check. Nothing reaches learners until you publish."),
      input),
    h("div", { class: "actions" }, ask, usage),
    result);

  const sync = () => { ask.disabled = busy || !input.value.trim(); };
  input.addEventListener("input", sync);
  sync();

  function renderUsage() {
    usage.textContent = `Helper requests: ${ws.usage.flash} of ${ws.limits.flashPerMonth} this month`;
  }

  async function call(answers = []) {
    const instruction = input.value.trim();
    if (busy || (!instruction && !answers.length)) return;
    busy = true;
    sync();
    fill(result, h("p", { class: "working" }, "The helper is writing. This can take up to a minute."));
    const before = ws.editor.getText();
    let reply;
    try {
      reply = await cloud.callFunction("writePage", {
        classCode: code, instruction, markdown: before.markdown, title: before.title, answers,
      });
    } catch (err) {
      fill(result, h("p", { class: "notice is-problem" }, err.message));
      return;
    } finally {
      busy = false;
      sync();
    }
    if (Number.isInteger(reply.used) && Number.isInteger(reply.limit)) {
      ws.setUsage({ flash: reply.used }, { flashPerMonth: reply.limit });
    }
    show(reply, before, instruction);
  }

  function show(reply, before, instruction) {
    const understood = h("p", { class: "understood" }, reply.understood || `I understood: ${instruction}`);
    const note = reply.note ? h("p", { class: "helper-note" }, reply.note) : null;

    if (reply.action === "write") {
      ws.editor.setDraft({ title: reply.title || undefined, markdown: reply.markdown });
      const undo = h("button", { class: "btn btn-secondary", type: "button" }, "Undo: bring back my text");
      const done = h("p", { class: "helper-done" },
        "The helper wrote a new draft in the editor. Read it, and check it in the preview, before you publish.");
      undo.addEventListener("click", () => {
        ws.editor.setDraft(before);
        fill(result, understood, h("p", { class: "helper-done" }, "Your own text is back."));
      });
      fill(result, understood, done, note, h("div", { class: "actions" }, undo));
      return;
    }

    if (reply.action === "ask") {
      fill(result, understood,
        h("p", { class: "helper-done" }, "The helper needs to know a little more:"),
        note,
        questionsForm(reply.questions, (answers) => call(answers)));
      return;
    }

    // decline (and anything unexpected): calm, never an error
    fill(result, understood,
      h("div", { class: "notice is-info" }, h("p", null, reply.note || "The helper can't write this.")));
  }

  ask.addEventListener("click", () => call());
  ws.on("usage", renderUsage);
  renderUsage();

  return { element };
}
