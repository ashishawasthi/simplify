// Steps — a placeholder until the real tool is built. It only proves that
// the menu, the address (#steps) and the shell reach it; the real tool
// replaces this whole file. The contract it follows is in ../tools.js.

export function mount(block) {
  const note = document.createElement("p");
  note.className = "stub-note";
  note.textContent = "Steps: being built.";
  block.append(note);
  return { show() {} };
}
