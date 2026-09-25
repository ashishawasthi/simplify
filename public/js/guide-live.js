// On the guide's pages too: a page the coach pushed with "show it now"
// opens My class in the app (class-live.js). Nothing happens on a device
// that follows no class.

import { listenToClass } from "./class-live.js";

listenToClass({ onForce: () => location.assign("/#my-class") });
