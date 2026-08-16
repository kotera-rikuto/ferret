/**
 * ログアウトボタン。
 *
 * form の POST なので JavaScript が動かない環境でも機能する。
 * "use client" も不要（サーバーコンポーネントの中にそのまま置ける）。
 */
export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action="/logout" method="post">
      <button
        type="submit"
        className={`text-zinc-500 hover:text-zinc-300 text-sm transition-colors ${className}`}
      >
        ログアウト
      </button>
    </form>
  );
}
