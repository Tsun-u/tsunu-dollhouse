// 名字辭典：捏新娃娃時先抽一個，小朋友不會寫字也有名字可以叫；可以再抽，也可以自己改。

export const NAME_POOL = [
  "小花", "豆豆", "圓圓", "糖糖", "布丁", "麻糬", "湯圓", "米米",
  "多多", "樂樂", "皮皮", "果果", "星星", "小月", "雲朵", "毛毛",
  "甜甜", "嘟嘟", "蹦蹦", "球球", "泡泡", "跳跳", "可可", "餅乾",
  "奶茶", "芝麻", "花生", "蘋果", "芒果", "西瓜", "草莓", "葡萄",
];

/** 抽一個名字：避開已經有娃娃在用的、也避開現在這個（再抽一次才會換）。 */
export function drawName(taken = [], current = null, rand = Math.random) {
  const free = NAME_POOL.filter((name) => name !== current && !taken.includes(name));
  const pool = free.length ? free : NAME_POOL.filter((name) => name !== current);
  return pool[Math.floor(rand() * pool.length)];
}
