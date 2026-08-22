import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ステージマップの道（ノードを繋ぐ線）の幾何。
 *
 * **見ているのは CSS と TS の定数の食い違い。** 章と章の間には CSS の余白（`my-9`）と
 * 区切りの帯があり、章を跨ぐ道はその高さを**こちら側が数字で知っている前提**で引く。
 * 道の端は SVG の座標属性（`y1` / `y2`）で決まるが、幾何属性はクラスやメディアクエリの
 * 対象にならないので、CSS 側の値をそのまま参照することができない。
 *
 * つまり **markup のクラスと TS の定数が同じ高さを指していないと、道の端が
 * 丸から外れる。** 外れても画面は正常に見える（線が少しずれるだけ）ので、
 * ここで固定する。実際 2026-08-19 まで**章を跨ぐ線そのものが無く**、
 * 区切りの上下に 335px の空白ができていた。
 *
 * 行の高さだけは CSS 変数（`--row-h`）に移してある（E11・U-823）。
 * こちらは幾何属性を避けるために**線1本ごとに入れ物の div を置き**、
 * 線は入れ物の 0% → 100% を結ぶだけにすることで、px の座標を持たずに済ませている。
 *
 * 描画して測るのが本筋だが、この環境には DOM が無い（`vitest.config.mts` は
 * `environment: "node"`）。ブラウザでの実測は E2E 側の役目なので、
 * ここでは**源泉である2つの数字が一致していること**だけを見る。
 */

const SOURCE = readFileSync(
  join(process.cwd(), "components/stage/StageMap.tsx"),
  "utf8",
);

/** `const NAME = 123;` を読む */
function constOf(name: string): number {
  const m = SOURCE.match(new RegExp(`const ${name} = (\\d+);`));
  expect(m, `${name} の定義が見つからない`).not.toBeNull();
  return Number(m![1]);
}

/**
 * 章の区切りの `className`。
 * **`my-9` を目印に引く。** 「ここから」の文字から遡る形にすると、
 * 内側の `<span>` の className を拾ってしまう
 */
function dividerClassName(): string {
  const m = SOURCE.match(/className="([^"]*my-9[^"]*)"/);
  expect(m, "章の区切り（my-9 を持つ要素）が見つからない").not.toBeNull();
  return m![1];
}

describe("§12-3 マップの道", () => {
  it("U-820 章の区切りの高さが、markup のクラスと定数で一致している", () => {
    const margin = constOf("CHAPTER_GAP_MARGIN");
    const label = constOf("CHAPTER_LABEL_H");
    const divider = dividerClassName();

    // Tailwind の 1 単位 = 4px。my-9 = 36px、h-5 = 20px
    expect(divider, "区切りの上下の余白が my-9 でない").toContain("my-9");
    expect(margin, "CHAPTER_GAP_MARGIN が my-9（36px）と合っていない").toBe(36);
    expect(divider, "区切りの帯の高さが h-5 で固定されていない").toContain("h-5");
    expect(label, "CHAPTER_LABEL_H が h-5（20px）と合っていない").toBe(20);

    // 帯の高さを固定するのは、文字の行の高さ（13px × 1.5 = 19.5）に頼ると
    // フォントや文字サイズを変えた日に道の端が静かにずれるため
    expect(divider).toContain("text-[13px]");
  });

  it("U-821 章を跨ぐ道が引かれている", () => {
    // 節ごとに線を引く作りなので、節と節の間は誰も描かない区間になりうる。
    // 次の章の先頭ノードへ繋ぐ線があること（無いと道が途切れて見える）。
    //
    // **この区間の長さだけは行の高さに依らない**（E11 の注釈参照）。
    // 下端は次の節の先頭ノード、上端はこの節の最下段の丸の中心で、
    // 引き算すると行の高さが打ち消えて定数になる
    expect(SOURCE, "章を跨ぐ区間の長さが CHAPTER_GAP を含んでいない").toMatch(
      /height: PAD_TOP \+ NODE_H \+ CHAPTER_GAP - CIRCLE_MID/,
    );
    expect(SOURCE, "跨ぐ相手（次のグループの先頭ノード）を引いていない").toMatch(
      /nextGroup\.stages\[nextGroup\.stages\.length - 1\]/,
    );
  });

  /**
   * 行の高さは CSS 変数（`--row-h`）。
   *
   * **JS で選ぶと開いた直後にマップ全体が動く。** サーバー描画は画面幅を知らないので
   * 広い側の値で返すしかなく、狭い画面では一度その配置で描いたあとに詰め直すことになる
   * （CPU を 1/8 に絞った 375px の実測で、約 900ms のあいだ 180 の配置が見えたまま、
   * そのあと文書の高さが 21,069 → 24,925px に伸びて全ノードが動いていた。E11）。
   *
   * ⚠️ **Tailwind は class 名を文字として探す。** テンプレートリテラルで組み立てると
   * `--row-h` の宣言そのものが CSS に出力されず、`calc()` が全部無効になって
   * マップが1点に潰れる。だからリテラルで書かれていることまで見る。
   */
  it("U-823 行の高さは CSS 変数で、リテラルの class として書かれている", () => {
    const m = SOURCE.match(/const ROW_H_CLASS = "([^"]+)";/);
    expect(m, "ROW_H_CLASS の定義（リテラル文字列）が見つからない").not.toBeNull();
    const cls = m![1];

    // 狭い画面が 224、lg 以上が 180。導出は StageMap.tsx の注
    expect(cls, "狭い画面の行の高さ（224px）が入っていない").toContain(
      "[--row-h:224px]",
    );
    expect(cls, "lg 以上の行の高さ（180px）が入っていない").toContain(
      "lg:[--row-h:180px]",
    );

    // 位置の計算が変数を経由していること。px を直に書くと JS で選ぶ形に戻る
    expect(SOURCE, "節の高さが --row-h から計算されていない").toMatch(
      /height = `calc\(var\(--row-h\)/,
    );
    expect(SOURCE, "ノードの縦位置が --row-h から計算されていない").toMatch(
      /top: `calc\(var\(--row-h\) \* \$\{i\}/,
    );
    // JS で行の高さを選び直していないこと（E11 で外した）。
    // **`window.matchMedia(` で見る。** 素の `matchMedia` だと、外した経緯を書いた
    // コメントの中の語に当たって、実装が直っていても落ちる
    expect(SOURCE, "行の高さを JS で選ぶ書き方が戻っている").not.toContain(
      "window.matchMedia(",
    );
    expect(SOURCE, "行の高さを購読で選ぶ書き方が戻っている").not.toContain(
      "useSyncExternalStore",
    );
  });

  it("U-822 区切りの帯は道より上に描かれ、見出しに地の色が敷かれている", () => {
    const divider = dividerClassName();
    // 道は節の SVG から溢れて帯の高さを跨ぐ。帯が下だと線が見出しの上を通る
    expect(divider, "区切りが道より上に来ない（relative z-10 が無い）").toContain(
      "z-10",
    );
    // 見出しの文字を線が横切っても読めるようにする。
    // **目印はテンプレートリテラルのほう。** 「ここから 第N章」はコメントにも
    // 出てくるので、素の文字列で探すと markup ではなく注記を拾う
    const at = SOURCE.indexOf("`ここから 第${");
    expect(at, "区切りの見出しの markup が見つからない").toBeGreaterThan(0);
    const span = SOURCE.lastIndexOf("<span", at);
    expect(
      SOURCE.slice(span, at),
      "見出しに地の色（bg-bg）が敷かれていない",
    ).toContain("bg-bg");
  });
});
