// The class's picture shelf: photos a coach uploads, each with a few words
// saying what it shows (learners' screen readers read them). A photo is made
// small in the coach's own browser first (image.js: at most 1600 px, JPEG,
// no location or camera details), then uploaded; "Put in page" places
// ![words](pictures/<id>.jpg) where the editor's cursor is. Deleting waits
// for the toast's Undo to run out before it happens.
//
// mountPictures(ws) → { element, choose() } — choose() is the editor's
// Picture button: the shelf in a dialog, a tap puts one in the page.

import { h } from "./dom.js";
import { openDialog } from "./dialog.js";
import { toShelfJpeg } from "./image.js";
import { pictureMarkdown, cleanWords } from "./edit.js";

const WORDS_SAVE_AFTER = 800;

export function mountPictures(ws) {
  const { code, uid, cloud, toast } = ws;
  const uploads = new Map(); // local id → { name, url, state, progress, error }
  let uploadCount = 0;
  const redrawers = new Set(); // an open chooser redraws with the shelf

  const grid = h("ul", { class: "shelf-grid", "aria-label": "Pictures on the shelf" });
  const empty = h("p", { class: "empty" }, "No pictures yet.");
  const element = h("section", { class: "shelf panel", "aria-labelledby": "pictures-h" },
    h("h2", { id: "pictures-h" }, "Pictures"),
    h("p", { class: "field-hint" },
      "Photos for this class's pages. Each is made smaller on this device before it uploads, " +
      "and the photo's location and camera details are left out."),
    fileButton("Add pictures"),
    grid,
    empty);

  // "Add pictures": a button-looking label around the file input, so the
  // system's own photo picker (or camera) opens — no camera permission needed
  function fileButton(words) {
    const input = h("input", { type: "file", accept: "image/*", multiple: true, class: "visually-hidden" });
    input.addEventListener("change", () => {
      const files = [...input.files];
      input.value = "";
      for (const file of files) upload(file);
    });
    return h("label", { class: "btn btn-secondary file-btn" }, words, input);
  }

  async function upload(file) {
    const key = `upload-${++uploadCount}`;
    const item = { name: file.name, url: null, state: "Getting it ready…", progress: 0, error: "" };
    uploads.set(key, item);
    render();
    try {
      const jpeg = await toShelfJpeg(file);
      item.url = URL.createObjectURL(jpeg.blob);
      item.state = "Uploading…";
      render();
      const id = await cloud.addPicture(code, uid, { ...jpeg, words: "" }, (part) => {
        item.progress = part;
        item.state = `Uploading… ${Math.round(part * 100)}%`;
        renderUploads();
      });
      item.done = id; // the shelf shows it once the list has it
      maybeDrop(key);
    } catch (err) {
      item.error = err.message || "The picture could not be uploaded.";
      render();
    }
  }

  function maybeDrop(key) {
    const item = uploads.get(key);
    if (item?.done && ws.pictures.some((p) => p.id === item.done)) {
      if (item.url) URL.revokeObjectURL(item.url);
      uploads.delete(key);
    }
  }

  function uploadRow(key, item) {
    const remove = item.error
      ? h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => { uploads.delete(key); render(); } }, "OK")
      : null;
    return h("li", { class: `shelf-item is-uploading${item.error ? " is-problem" : ""}`, dataset: { upload: key } },
      item.url ? h("img", { class: "shelf-thumb", src: item.url, alt: "" }) : h("div", { class: "shelf-thumb is-empty" }),
      h("p", { class: "shelf-state", role: "status" }, item.error || item.state),
      item.error ? null : h("progress", { max: "1", value: String(item.progress), "aria-label": `Uploading ${item.name}` }),
      remove);
  }

  function pictureRow(picture) {
    const words = h("input", {
      type: "text", class: "shelf-words", maxLength: 80, value: picture.words ?? "",
      placeholder: "What it shows, in a few words", "aria-label": "Words for this picture",
    });
    let timer = null;
    const saveWords = () => {
      clearTimeout(timer);
      const next = cleanWords(words.value);
      if (next === (picture.words ?? "")) return;
      picture.words = next;
      cloud.setPictureWords(code, picture.id, next).catch((err) => ws.problem(err));
    };
    words.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(saveWords, WORDS_SAVE_AFTER);
    });
    words.addEventListener("change", saveWords);
    const place = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Put in page");
    place.addEventListener("click", () => {
      saveWords();
      insert(picture.id, words.value);
    });
    const remove = h("button", { class: "btn btn-quiet btn-small", type: "button" }, "Delete");
    remove.addEventListener("click", () => deletePicture(picture));
    return h("li", { class: "shelf-item", dataset: { picture: picture.id } },
      h("img", { class: "shelf-thumb", src: cloud.mediaUrl(code, "picture", picture.id), alt: "", loading: "lazy" }),
      words,
      h("div", { class: "shelf-actions" }, place, remove));
  }

  function insert(id, words) {
    if (!ws.editor.insert(pictureMarkdown(id, words))) toast.show("The page is full: there is no room for another picture.");
  }

  function deletePicture(picture) {
    ws.hiddenPictures.add(picture.id);
    ws.refreshPictures();
    toast.show("Picture deleted", {
      undo: () => {
        ws.hiddenPictures.delete(picture.id);
        ws.refreshPictures();
      },
      commit: () => {
        cloud.deletePicture(code, picture.id).catch((err) => {
          ws.hiddenPictures.delete(picture.id);
          ws.refreshPictures();
          ws.problem(err);
        });
      },
    });
  }

  // redraw the upload rows only (a progress tick must not redraw the shelf
  // under a coach typing words)
  function renderUploads() {
    for (const [key, item] of uploads) {
      const row = grid.querySelector(`[data-upload="${key}"]`);
      if (row) row.replaceWith(uploadRow(key, item));
    }
  }

  function render() {
    for (const key of [...uploads.keys()]) maybeDrop(key);
    // rows being typed in stay as they are: only new and gone ones change
    const focused = document.activeElement?.closest?.("[data-picture]")?.dataset.picture;
    const keep = new Map([...grid.querySelectorAll("[data-picture]")].map((row) => [row.dataset.picture, row]));
    const rows = [
      ...[...uploads].map(([key, item]) => uploadRow(key, item)),
      ...ws.pictures.map((p) => (p.id === focused && keep.get(p.id)) || pictureRow(p)),
    ];
    grid.replaceChildren(...rows);
    empty.hidden = rows.length > 0;
    for (const redraw of redrawers) redraw();
  }

  // ---- the editor's Picture button ----
  function choose() {
    const list = h("ul", { class: "chooser-grid" });
    const body = h("div", { class: "chooser" },
      list,
      h("div", { class: "actions" }, fileButton("Add pictures from this device")));
    const draw = () => {
      if (!ws.pictures.length && !uploads.size) {
        list.replaceChildren(h("li", { class: "empty" }, "No pictures on the shelf yet. Add some from this device."));
        return;
      }
      list.replaceChildren(
        ...[...uploads.values()].map((item) => h("li", { class: "chooser-item is-uploading" },
          item.url ? h("img", { src: item.url, alt: "" }) : h("div", { class: "shelf-thumb is-empty" }),
          h("span", null, item.error || item.state))),
        ...ws.pictures.map((picture) => h("li", null,
          h("button", {
            class: "chooser-item", type: "button",
            onclick: () => {
              insert(picture.id, picture.words);
              dialog.close();
            },
          },
          h("img", { src: cloud.mediaUrl(code, "picture", picture.id), alt: "" }),
          h("span", null, picture.words || "No words yet")))));
    };
    const dialog = openDialog({ title: "Put a picture in the page", body, wide: true });
    redrawers.add(draw);
    dialog.closed.then(() => redrawers.delete(draw));
    draw();
  }

  ws.on("pictures", render);
  render();
  return { element, choose };
}
