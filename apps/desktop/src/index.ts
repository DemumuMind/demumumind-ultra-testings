import { launchDesktopShell } from "./main.js";

void launchDesktopShell({
  isPackaged: process.env.NODE_ENV === "production"
});
