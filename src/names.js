// 名字辭典：捏新娃娃時先抽一個人類朋友的名字，小朋友不會寫字也有名字可以叫；可以再抽，也可以自己改。
// 照身體分女生、男生兩份：一半是班上常聽到的名字，一半是像芭比朋友那樣的洋名。

export const NAMES = {
  f: [
    "晴晴", "安安", "芊芊", "悠悠", "恩恩", "小雪", "小美", "可欣",
    "雨彤", "莉莉", "艾瑪", "蘇菲", "米亞", "露西", "安娜", "蘿拉",
  ],
  m: [
    "小凱", "小樂", "浩浩", "阿哲", "子軒", "柏翰", "品睿", "冠廷",
    "肯恩", "里歐", "麥斯", "湯姆", "班恩", "路克", "諾亞", "亞當",
  ],
};

/** 照身體抽一個名字：避開已經有娃娃在用的、也避開現在這個（再抽一次才會換）。 */
export function drawName(body, taken = [], current = null, rand = Math.random) {
  const list = NAMES[body] ?? NAMES.f;
  const free = list.filter((name) => name !== current && !taken.includes(name));
  const pool = free.length ? free : list.filter((name) => name !== current);
  return pool[Math.floor(rand() * pool.length)];
}
