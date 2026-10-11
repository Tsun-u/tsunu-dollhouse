// 存到 Google 雲端硬碟、從雲端取回：用 Google 帳號登入，存檔放在雲端硬碟裡只有這個遊戲看得到的隱藏資料夾（appDataFolder）。
// 用 Google Identity Services 拿權杖、直接打 Drive REST API，不載 gapi。

import { APP } from "./save-file.js";

const CLIENT_ID = "674654433726-tq25dneafbu0pm39pq6kl2kpdmgmnh3f.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = `${APP}_save.json`;   // 同一個 client 的遊戲共用 appDataFolder，檔名分開
const NOT_SIGNED_IN = "沒有登入 Google，這次沒有動到雲端。";

let token = null;   // { value, expiresAt }

function loadGoogleScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src: "https://accounts.google.com/gsi/client", onload: resolve, onerror: () => reject(new Error("連不上 Google，請確認網路。")) });
    document.head.append(script);
  });
}

async function signIn() {
  if (token && Date.now() < token.expiresAt) return token.value;
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (reply) => {
        if (!reply.access_token) return reject(new Error(NOT_SIGNED_IN));
        token = { value: reply.access_token, expiresAt: Date.now() + (reply.expires_in - 60) * 1000 };
        resolve(token.value);
      },
      error_callback: () => reject(new Error(NOT_SIGNED_IN)),
    }).requestAccessToken();
  });
}

async function drive(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${await signIn()}` } });
  if (!response.ok) throw new Error(`雲端硬碟沒有回應（${response.status}），請稍後再試。`);
  return response;
}

async function findSaveFile() {
  const query = encodeURIComponent(`name='${FILE_NAME}'`);
  const reply = await drive(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id)`);
  return (await reply.json()).files?.[0] ?? null;
}

export async function uploadSave(data) {
  const body = JSON.stringify(data);
  const existing = await findSaveFile();
  if (existing) {
    await drive(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    return;
  }
  const boundary = `dollhouse${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  await drive("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart });
}

/** 雲端上的存檔；還沒存過就 null。 */
export async function downloadSave() {
  const file = await findSaveFile();
  if (!file) return null;
  return (await drive(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).json();
}
