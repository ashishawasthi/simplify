// "Where you work": choose one or more institutions (up to 10) from the
// admin's list: the places grouped by organisation, each a big checkbox row;
// the chosen ones show above as chips that take themselves off with a tap.
// Only a long list (more than SEARCH_FROM places) gets a search box that
// narrows it as the coach types (name, organisation, area or type) and a
// scrolling box of its own. Built with DOM calls only (dom.js).
//
//   const picker = institutionPicker({ institutions, chosen: ["id", …], onChange });
//   form.append(picker.el); picker.value() → ["id", …]

import { h, uid } from "./dom.js";
import { MAX_INSTITUTIONS, groupByOrg, placeLine } from "./institutions.js";

export const SEARCH_FROM = 8;

export function institutionPicker({ institutions, chosen = [], onChange }) {
  const byId = new Map(institutions.map((i) => [i.id, i]));
  let picked = [...new Set(chosen)];
  const id = uid("pick");
  const long = institutions.filter((i) => i.active).length > SEARCH_FROM;

  const chips = h("ul", { class: "pick-chips", "aria-label": "Chosen" });
  const none = h("p", { class: "pick-none" }, "None chosen yet.");
  const count = h("p", { class: "pick-count", role: "status", "aria-live": "polite" });
  const search = h("input", {
    type: "search", class: "pick-search", id: `${id}-search`, autocomplete: "off", spellcheck: "false",
    placeholder: "Search: a name, organisation or area", "aria-describedby": `${id}-hint`,
  });
  const list = h("div", { class: `pick-list${long ? " is-long" : ""}`, role: "group", "aria-labelledby": `${id}-label` });

  function toggle(instId, on) {
    if (on && !picked.includes(instId) && picked.length < MAX_INSTITUTIONS) picked = [...picked, instId];
    if (!on) picked = picked.filter((x) => x !== instId);
    render();
    onChange?.(picked);
  }

  function renderChips() {
    chips.replaceChildren(...picked.map((instId) => {
      const inst = byId.get(instId);
      const name = inst ? inst.name : "An institution no longer listed";
      return h("li", null, h("button", {
        class: "pick-chip", type: "button", "aria-label": `Remove ${name}`,
        onclick: () => {
          toggle(instId, false);
          // keep the keyboard somewhere sensible once the chip is gone
          (chips.querySelector("button") ?? (long ? search : list.querySelector("input")))?.focus();
        },
      }, h("span", null, name, inst && !inst.active ? " (retired)" : ""), h("span", { class: "pick-x", "aria-hidden": "true" }, "×")));
    }));
    none.hidden = picked.length > 0;
    const full = picked.length >= MAX_INSTITUTIONS;
    count.textContent = full
      ? `${MAX_INSTITUTIONS} of ${MAX_INSTITUTIONS} chosen. Take one off to choose another.`
      : picked.length ? `${picked.length} chosen` : "";
  }

  function renderList() {
    const groups = groupByOrg(institutions, search.value, picked);
    const full = picked.length >= MAX_INSTITUTIONS;
    if (!groups.length) {
      list.replaceChildren(h("p", { class: "pick-empty" }, search.value.trim()
        ? `Nothing matches “${search.value.trim()}”. Try fewer words, or tell the admin where you work in the note below.`
        : "The admin has not listed any institutions yet. Tell the admin where you work in the note below."));
      return;
    }
    list.replaceChildren(...groups.map((g) => h("fieldset", { class: "pick-group" },
      h("legend", null, g.org),
      g.items.map((inst) => {
        const on = picked.includes(inst.id);
        const box = h("input", { type: "checkbox", checked: on, disabled: full && !on, onchange: (e) => toggle(inst.id, e.target.checked) });
        const line = placeLine(inst);
        return h("label", { class: `pick-option${on ? " is-on" : ""}` }, box,
          h("span", { class: "pick-text" },
            h("span", { class: "pick-name" }, inst.name, inst.active ? "" : " (retired)"),
            line ? h("span", { class: "pick-place" }, line) : null));
      }))));
  }

  function render() {
    renderChips();
    // keep focus on the same checkbox after a redraw
    const focused = document.activeElement?.closest?.(".pick-option")?.querySelector(".pick-name")?.textContent;
    const scroll = list.scrollTop;
    renderList();
    list.scrollTop = scroll;
    if (focused) [...list.querySelectorAll(".pick-option")].find((o) => o.querySelector(".pick-name").textContent === focused)?.querySelector("input")?.focus();
  }

  search.addEventListener("input", renderList);
  render();

  const el = h("div", { class: "field pick" },
    h("span", { class: "pick-label", id: `${id}-label` }, "Where you work"),
    h("span", { class: "field-hint", id: `${id}-hint` },
      `Tick each place where you coach — up to ${MAX_INSTITUTIONS}. An organisation with several centres lists each one.`),
    chips, none,
    long ? h("label", { class: "visually-hidden", for: `${id}-search` }, "Search the institutions") : null,
    long ? search : null,
    list,
    count);
  return { el, value: () => [...picked] };
}
