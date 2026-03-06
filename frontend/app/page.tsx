export default function HomePage() {
  return (
    <main className="hero-bg min-h-screen px-4 py-10">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-[#5A6B3A]/30 bg-[#F7F2E6]/90 p-6 shadow-[0_16px_40px_rgba(43,54,24,0.22)] backdrop-blur-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5A6B3A]">
          StudySpot
        </p>
        <h1 className="mt-3 font-['Fraunces'] text-4xl leading-tight text-[#2F261A]">
          Find your best place to focus.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#4A4030]">
          StudySpot helps students discover nearby cafes, libraries, and quiet corners based on real check-ins and live activity trends.
        </p>

        <form className="mt-7 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#3E3426]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@school.edu"
              className="w-full rounded-xl border border-[#B6A27D] bg-[#FFFDF7] px-4 py-3 text-sm text-[#2F261A] outline-none ring-offset-1 transition focus:border-[#6E8B3D] focus:ring-2 focus:ring-[#6E8B3D]/30"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#3E3426]">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Create a password"
              className="w-full rounded-xl border border-[#B6A27D] bg-[#FFFDF7] px-4 py-3 text-sm text-[#2F261A] outline-none ring-offset-1 transition focus:border-[#6E8B3D] focus:ring-2 focus:ring-[#6E8B3D]/30"
            />
          </div>
          <button
            type="button"
            className="w-full rounded-xl bg-[#5C7A35] px-4 py-3 text-sm font-semibold text-[#FDFBF4] transition active:scale-[0.99]"
          >
            Sign Up
          </button>
        </form>

        <button type="button" className="mt-4 w-full text-sm font-medium text-[#5A6B3A] underline underline-offset-4">
          I already have an account (Login)
        </button>
      </section>
    </main>
  );
}
