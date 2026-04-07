import LoginForm from "@/components/LoginForm";

export default function Home() {
  return (
    <main className="landingWrapper">
      <section className="brandPanel">
        <h1 className="brandTitle">whatdowhen</h1>
      </section>
      <section className="formPanel">
        <LoginForm compact />
      </section>
    </main>
  );
}
