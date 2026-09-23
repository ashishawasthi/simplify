// Publish: the page in the editor becomes what the class's learners see
// (classes/{code}.latest), or Unpublish leaves them nothing. Either is undone
// from the toast — what learners saw before is put back. The public warning
// is always here, beside the button.

import { h } from "./dom.js";
import { whenText } from "./format.js";

export const PUBLIC_WARNING = "What you publish is public — anyone with the class code can see it. " +
  "Never put pictures of students or any private or sensitive information in it.";

export function mountPublish(ws) {
  const { code, uid, cloud, toast } = ws;

  const state = h("p", { class: "publish-state", role: "status", "aria-live": "polite" });
  const publish = h("button", { class: "btn btn-primary btn-publish", type: "button" }, "Publish this page");
  const unpublish = h("button", { class: "btn btn-secondary", type: "button" }, "Unpublish");
  const problem = h("div");
  const element = h("section", { class: "publish", "aria-labelledby": "publish-h" },
    h("h2", { id: "publish-h", class: "visually-hidden" }, "Publish"),
    h("div", { class: "public-warning", role: "note" },
      h("span", { class: "warning-icon", "aria-hidden": "true" }, "!"),
      h("p", null, PUBLIC_WARNING)),
    state,
    h("div", { class: "actions" }, publish, unpublish),
    problem);

  function render() {
    const latest = ws.klass?.latest ?? null;
    const { title, markdown } = ws.editor.getText();
    const empty = !markdown.trim();
    const here = latest && ws.editor.pageId && latest.pageId === ws.editor.pageId;
    const same = here && latest.title === title && latest.markdown === markdown;
    const paused = ws.klass && ws.klass.status !== "active";

    state.classList.toggle("is-live", Boolean(same));
    if (paused) {
      state.textContent = "The admin has paused this class, so it can't be published.";
    } else if (!latest) {
      state.textContent = "Learners see nothing yet.";
    } else if (same) {
      state.textContent = `Learners see this page. Published ${whenText(latest.publishedAt)}.`;
    } else if (here) {
      state.textContent = `Learners see this page as it was when it was published, ${whenText(latest.publishedAt)}. ` +
        "Publish again to show them the changes.";
    } else {
      state.textContent = `Learners see another page: “${latest.title || "Untitled page"}”, published ${whenText(latest.publishedAt)}.`;
    }
    if (busy) state.textContent = busy;
    publish.textContent = same ? "Published" : here ? "Publish the changes" : "Publish this page";
    publish.disabled = Boolean(busy || same || empty || paused);
    unpublish.hidden = !latest;
    unpublish.disabled = Boolean(busy || paused);
  }

  // one of the two at a time; the words say what is happening meanwhile
  let busy = "";
  async function run(words, work) {
    if (busy) return;
    busy = words;
    problem.replaceChildren();
    render();
    try {
      await work();
    } catch (err) {
      problem.append(h("p", { class: "notice is-problem" }, err.message));
    } finally {
      busy = "";
      render();
    }
  }

  publish.addEventListener("click", () => run("Publishing…", async () => {
    const before = ws.klass?.latest ?? null;
    if (!(await ws.editor.flush())) return; // the save's own line says what went wrong
    const id = ws.editor.pageId;
    if (!id) return;
    await cloud.publishPage(code, id, uid, ws.editor.getText());
    toast.show("Published. Learners see this page now.", {
      undo: () => cloud.setLatest(code, uid, before).catch((err) => ws.problem(err)),
    });
  }));

  unpublish.addEventListener("click", () => run("Unpublishing…", async () => {
    const before = ws.klass?.latest ?? null;
    if (!before) return;
    await cloud.setLatest(code, uid, null);
    toast.show("Unpublished. Learners see nothing now.", {
      undo: () => cloud.setLatest(code, uid, before).catch((err) => ws.problem(err)),
    });
  }));

  for (const type of ["class", "text", "page"]) ws.on(type, render);
  return { element };
}
