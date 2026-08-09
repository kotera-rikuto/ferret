import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-12">
      <div className="flex items-center gap-4">
        <h1 className="text-5xl font-bold text-zinc-50">Ferret</h1>
        <img src="/character_nobg.png" alt="Ferret" className="w-12 h-12" />
      </div>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="bg-amber-400 text-zinc-950 font-semibold px-8 py-3 rounded-full hover:bg-amber-300 transition-colors"
        >
          ログイン
        </Link>
        <Link
          href="/register"
          className="border border-amber-400 text-amber-400 font-semibold px-8 py-3 rounded-full hover:bg-amber-400 hover:text-zinc-950 transition-colors"
        >
          新規登録
        </Link>
      </div>
    </div>
  );
}
