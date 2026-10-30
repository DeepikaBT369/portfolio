import BloomField from "./components/BloomField";

const about = [
  {
    title: "Consulting & Business Expertise",
    text: "Nearly six years at McKinsey & Company, collaborating with global consulting teams and delivering thousands of executive-ready presentations, transforming complex data into compelling business insights.",
  },
  {
    title: "Strategy & Analytical Thinking",
    text: "Skilled in structured problem-solving, data visualization, rapid decision-making, and delivering high-quality solutions under tight deadlines across international time zones.",
  },
  {
    title: "Business Meets Technology",
    text: "Pursuing an MS in Information Technology at Clark University (2026), specializing in Product Development, Business Analysis, Marketing, and Data-Driven Marketing Management, with technical skills in Python, SQL, and data analytics.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
        <BloomField />

        <div>
          <h2 className="font-display mb-12 text-5xl text-blossom md:text-6xl">About</h2>
          <ul className="max-w-[34rem] space-y-10">
            {about.map((item) => (
              <li key={item.title}>
                <h3 className="font-display text-2xl text-foreground">{item.title}</h3>
                <p className="mt-2 text-lg leading-relaxed text-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}