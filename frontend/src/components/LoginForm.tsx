"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";

type LoginFormProps = {
  compact?: boolean;
};

export default function LoginForm({ compact = false }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setIsError(false);
    setMessage("");

    const payload = new URLSearchParams();
    payload.append("username", email);
    payload.append("password", password);

    try {
      const response = await fetch(`${getApiBaseUrl()}/login/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(errorBody?.detail ?? "Login failed.");
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
      };

      localStorage.setItem("auth_token", data.access_token);
      setMessage("Logged in successfully.");
      setEmail("");
      setPassword("");
      router.push("/tasks");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      {!compact && <h1 className="formTitle">Login</h1>}
      <label className="inputLabel" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className="inputField"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label className="inputLabel" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className="inputField"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button type="submit" className="primaryButton" disabled={isLoading}>
        {isLoading ? "Logging in..." : "Login"}
      </button>

      <Link href="/signup" className="textLink">
        New user
      </Link>

      {message && (
        <p className={isError ? "statusMessage error" : "statusMessage"}>
          {message}
        </p>
      )}
    </form>
  );
}
