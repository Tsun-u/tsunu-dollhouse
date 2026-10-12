// 捏娃娃畫面：左邊預覽（可轉三個角度），右邊一組一組的選項；按「好了」交給 onSave。
// 衣服不在這裡選：新娃娃穿基本款，之後在衣櫃換。

import { BODIES, FACES, GLASSES, HAIRS, MOUTHS, HAIR_COLORS, IRIS_COLORS, LIP_COLORS, SKIN_TONES, available, headParts } from "../vendor/rules/looks.js";
import { swatchRow } from "../vendor/web/swatches.js";
import { createDoll } from "./dolls.js";

const VIEW_LABELS = { front: "正面", front34: "斜前", back34: "斜後" };
const $ = (id) => document.getElementById(id);

export function setupCreator({ skeletons, animations, samplePose, clothes, dressUp, onSave, onCancel }) {
  let draft = null, isNew = false, view = "front34";

  const skeletonOf = (body, v) => skeletons[BODIES[body].views[v]];
  const outfitsOf = (body) => skeletonOf(body, "front").data.outfits ?? {};
  const options = (list, body) => available(list, body, outfitsOf(body));

  /** 換素體時，髮型、眼睛、嘴巴、眼鏡換成這個素體有的第一款（眼鏡預設不戴）。 */
  function fitToBody(doll) {
    const pick = (list, current) => (options(list, doll.body).some((o) => o.id === current) ? current : options(list, doll.body)[0]?.id ?? null);
    return { ...doll, hair: pick(HAIRS, doll.hair), face: pick(FACES, doll.face), mouth: pick(MOUTHS, doll.mouth ?? doll.face), glasses: options(GLASSES, doll.body).some((o) => o.id === doll.glasses) ? doll.glasses : null, worn: { ...BODIES[doll.body].starter }, colors: { ...BODIES[doll.body].starterColors } };
  }

  const chip = (label, on, onclick) => Object.assign(document.createElement("button"), { className: "item" + (on ? " on" : ""), textContent: label, onclick });
  const group = (title, ...children) => {
    const box = document.createElement("div");
    box.className = "option-group";
    box.append(Object.assign(document.createElement("h3"), { textContent: title }), ...children);
    return box;
  };
  const row = (className, items) => {
    const div = document.createElement("div");
    div.className = className;
    div.append(...items);
    return div;
  };
  const set = (changes) => { draft = { ...draft, ...changes }; render(); };

  function render() {
    const face = FACES.find((f) => f.id === draft.face);
    const mouthId = draft.mouth ?? draft.face;
    const mouth = MOUTHS.find((m) => m.id === mouthId);
    const hairOption = HAIRS.find((h) => h.id === draft.hair);
    const highlightable = Boolean(hairOption?.highlight && outfitsOf(draft.body)[hairOption.highlight]);   // 這款髮型有畫挑染位置
    const name = Object.assign(document.createElement("input"), { id: "dollName", value: draft.name, maxLength: 12, placeholder: "取個名字" });
    name.oninput = () => { draft.name = name.value; };
    $("creatorOptions").replaceChildren(
      group("名字", name),
      group("看哪一面", row("chips", Object.entries(VIEW_LABELS).map(([id, label]) => chip(label, view === id, () => { view = id; render(); })))),
      group("身體", row("chips", Object.entries(BODIES).map(([id, body]) => chip(body.label, draft.body === id, () => set(fitToBody({ ...draft, body: id })))))),
      group("膚色", swatchRow(SKIN_TONES, draft.skin, (skin) => set({ skin }))),
      group("髮型", row("chips", options(HAIRS, draft.body).map((h) => chip(h.label, draft.hair === h.id, () => set({ hair: h.id }))))),
      group("髮色", swatchRow(HAIR_COLORS, draft.hairColor, (hairColor) => set({ hairColor }))),
      group(highlightable ? "挑染" : "挑染（這款沒有挑染）", row("chips", [chip("不挑染", !draft.hairHighlight, () => set({ hairHighlight: null }))]), swatchRow(HAIR_COLORS, draft.hairHighlight ?? null, (hairHighlight) => set({ hairHighlight }), !highlightable)),
      group("眼睛", row("chips", options(FACES, draft.body).map((f) => chip(f.label, draft.face === f.id, () => set({ face: f.id, mouth: mouthId }))))),
      group(face?.iris ? "眼睛顏色" : "眼睛顏色（這款維持原本的顏色）", swatchRow(IRIS_COLORS, draft.irisColor, (irisColor) => set({ irisColor }), !face?.iris)),
      group("嘴巴", row("chips", options(MOUTHS, draft.body).map((m) => chip(m.label, mouthId === m.id, () => set({ mouth: m.id }))))),
      group(mouth?.lips ? "口紅" : "口紅（這款維持原本的唇色）", swatchRow(LIP_COLORS, draft.lipColor ?? LIP_COLORS[0], (lipColor) => set({ lipColor }), !mouth?.lips)),
      group("眼鏡", row("chips", [chip("不戴", !draft.glasses, () => set({ glasses: null })), ...options(GLASSES, draft.body).map((g) => chip(g.label, draft.glasses === g.id, () => set({ glasses: g.id })))])),
    );
  }

  /** 預覽：選到的那一面、idle 動畫，穿著照娃娃現在的衣服。 */
  function draw(time) {
    const canvas = $("creatorCanvas");
    const rect = canvas.getBoundingClientRect();
    if (!draft || !rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const skeleton = skeletonOf(draft.body, view);
    const who = { name: BODIES[draft.body].sprites, skeletons: { front: skeletonOf(draft.body, "front"), front34: skeletonOf(draft.body, "front34"), back34: skeletonOf(draft.body, "back34") }, headParts: headParts(draft) };
    const { outfits, bodyTint } = dressUp(who, draft.worn, clothes, draft.colors);
    const scale = (rect.height * 0.92) / skeleton.data.canvas.h;
    skeleton.draw(ctx, samplePose(animations.idle, time, skeleton.data.view), { x: rect.width / 2 - (skeleton.data.canvas.w * scale) / 2, y: rect.height * 0.04, scale, outfits, skin: draft.skin, bodyTint });
  }
  (function loop(now) {
    if (!$("creatorBox").hidden) draw(now / 1000);
    requestAnimationFrame(loop);
  })(performance.now());

  $("creatorSave").onclick = () => {
    if (!draft.name.trim()) { $("dollName")?.focus(); return; }
    onSave({ ...draft, name: draft.name.trim() }, isNew);
    $("creatorBox").hidden = true;
  };
  $("creatorCancel").onclick = () => { $("creatorBox").hidden = true; onCancel?.(); };

  return {
    /** doll 為 null 是新增；first 為 true 是第一個娃娃（不能取消）。 */
    open(doll, { first = false } = {}) {
      isNew = !doll;
      draft = doll ? { ...doll } : fitToBody(createDoll({ name: "", body: "f" }));
      $("creatorTitle").textContent = first ? "先捏一個娃娃住進家裡" : isNew ? "新增娃娃" : `修改${doll.name}`;
      $("creatorCancel").hidden = first;
      $("creatorBox").hidden = false;
      render();
      $("creatorBox").scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };
}
