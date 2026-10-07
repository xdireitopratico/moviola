import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const entrada = join(import.meta.dirname, "..", "app", "entrada", "index.html");

app.whenReady().then(async () => {
  const probe = process.env.MOVIOLA_PROBE === "1";
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: !probe,
    autoHideMenuBar: true,
  });
  await win.loadFile(entrada);
  if (!probe) return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
