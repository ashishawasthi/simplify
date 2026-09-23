// The editor's YouTube button: paste a link to a public or unlisted YouTube
// video, give it a few words, and it goes in the page on a line of its own,
// [words](https://youtu.be/<id>). Learners see a card, and nothing loads
// from YouTube until one of them taps it (/js/class-markdown.js).

import { h, field } from "./dom.js";
import { openDialog } from "./dialog.js";
import { youtubeId, youtubeMarkdown } from "./edit.js";

export function chooseYoutube(ws) {
  const link = field({
    label: "YouTube link", inputmode: "url", autocomplete: "off", spellcheck: "false", maxLength: 2048,
    placeholder: "https://youtu.be/…", hint: "Copy it from YouTube's Share button.",
  });
  const words = field({
    label: "Words for the video", maxLength: 80, placeholder: "For example: How to wash hands",
    hint: "Learners see these words on the video's card.",
  });
  const check = h("p", { class: "link-check", role: "status" });
  const add = h("button", { class: "btn btn-primary", type: "submit" }, "Put it in the page");
  const form = h("form", { class: "stack", novalidate: true },
    link.field, check, words.field,
    h("p", { class: "small" },
      "Public and unlisted videos play; private ones don't. Nothing loads from YouTube until a learner taps the card."),
    h("div", { class: "actions" }, add));

  // the link is checked as it is pasted: never an error, just what it is
  const sync = () => {
    const value = link.input.value.trim();
    const id = youtubeId(value);
    add.disabled = !id;
    check.classList.toggle("is-ok", Boolean(id));
    check.textContent = !value ? "" : id ? "✓ A YouTube video" : "This isn't a link to one YouTube video yet.";
  };
  link.input.addEventListener("input", sync);
  sync();

  const dialog = openDialog({ title: "Put a YouTube video in the page", body: form });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = youtubeId(link.input.value);
    if (!id) return;
    dialog.close();
    if (!ws.editor.insert(youtubeMarkdown(id, words.input.value))) {
      ws.toast.show("The page is full: there is no room for another video.");
    }
  });
  link.input.focus();
}
