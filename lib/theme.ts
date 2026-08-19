// 画面の配色（明るい / 暗い）。**切り替えはユーザーが選んだときだけ。**
//
// オーナー判断（2026-08-19・E9）:
//   - OS のダークモードには追従しない。せってい画面のボタンでだけ切り替える
//   - 選んだ状態は**このブラウザ**に覚える（アカウントには保存しない）
//
// アカウント側に持たせなかったのは、配色が「その端末で見やすいか」の話で、
// 同じ人でも昼の会社の画面と夜の自室で答えが変わるため。
// DB に欄を足す必要も無くなる（保存の失敗という壊れ方も生まれない）。
//
// 値の適用先は `<html data-theme="...">`。色の定義は app/globals.css。

export const THEME_STORAGE_KEY = "ferret-theme";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** 何も選んでいない人が見る配色。サーバーが返す HTML もこれ */
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/**
 * 最初の描画より前に `<html>` へ配色を当てる素の JavaScript。
 * app/layout.tsx が `<head>` にそのまま埋め込む。
 *
 * **ここだけ React を通さない。** React が動き出すのはブラウザが HTML を読み終えた後なので、
 * それを待つと「暗いはずの人に、一瞬だけ明るい画面が見える」ことになる。
 * `<head>` の中の script は HTML を読んでいる途中に同期実行されるので、
 * 最初の1回も含めて一度も明るい画面を見せずに済む。
 *
 * `try` で囲むのは、プライベートモードなどで localStorage を読むと例外が出る環境があるため。
 * 読めなければ既定（明るい）のまま進む。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(${JSON.stringify(
  THEMES,
)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/** 覚えてある配色。読めない・入っていない・壊れている場合は既定を返す */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * いま画面に当たっている配色。**`<html>` の属性が唯一の正。**
 *
 * localStorage ではなくこちらを見るのは、最初の描画より前に走る script が
 * 当てた結果がここに出ているから。2つの置き場所を突き合わせずに済む。
 */
export function currentTheme(): Theme {
  const applied = document.documentElement.getAttribute("data-theme");
  return isTheme(applied) ? applied : DEFAULT_THEME;
}

/**
 * 配色が変わったら知らせる。**属性そのものを見張る。**
 *
 * 「変えた側から知らせる」形（`applyTheme` の中で登録済みの相手を呼ぶ）でも、
 * 実測では同じように追いついた。**それでも見張る側にしてあるのは、
 * 属性を書き換える経路が `applyTheme` だけではないから** ── 最初の描画より前に走る
 * script も、開発中に React が `<html>` を組み立て直す動きも、この関数を通らない。
 * 知らせる形式だと「いまの値」を読む先（属性）と、変化を伝える経路（手動の呼び出し）が
 * 別々になり、通らなかった書き換えのぶんだけ表示が古いまま残る。
 * 見張る形にすれば、読む先と伝える経路が同じ1つになる。
 */
export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/** いま開いている画面に当てるだけ。覚えはしない */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * 画面に当てて、このブラウザに覚える。**選び直したときだけ呼ぶこと。**
 *
 * 読み込みのたびに呼ぶと「まだ選んでいない」が「明るいを選んだ」に化ける。
 * いまは違いが出ないが、あとで自動追従を足したくなったときに
 * 「選んでいない人」を見分けられなくなる。
 */
export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 覚えられなくても、いま開いている画面の配色は変わる。
    // 「切り替わらない」より「次に開くと戻っている」ほうがまだ分かりやすい
  }
}
