// The guide used to be one long page, and its sections were shared as
// /guide#<section> links. Each section now lives on a page of its own, so an
// old link is sent there instead of stopping at the topic menu. Runs in the
// <head>, before anything renders, and replace() keeps the old address out
// of the back history.

const MOVED = {
  "put-in-your-money": "/guide/can-i-buy#put-in-your-money",
  "add-things-to-buy": "/guide/can-i-buy#add-things-to-buy",
  "read-the-answer": "/guide/can-i-buy#read-the-answer",
  "speak-instead-of-typing": "/guide/speak",
  "home-screen": "/guide/home-screen",
  "iphone-safari": "/guide/home-screen#iphone-safari",
  "android-chrome": "/guide/home-screen#android-chrome",
  "new-version": "/guide/updates",
  "no-microphone": "/guide/no-microphone",
  "iphone-keyboard": "/guide/no-microphone#iphone-keyboard",
  "gboard": "/guide/no-microphone#gboard",
  "samsung-keyboard": "/guide/no-microphone#samsung-keyboard",
  "swiftkey": "/guide/no-microphone#swiftkey",
  "privacy": "/guide/privacy",
};

function followMove() {
  // own keys only: /guide#toString must not find Object's toString
  const key = location.hash.slice(1);
  if (Object.hasOwn(MOVED, key)) location.replace(MOVED[key]);
}

followMove();
// an old link opened while this page is already showing changes only the
// #part, which doesn't load the page again
addEventListener("hashchange", followMove);
