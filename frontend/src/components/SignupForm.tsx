"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";

export default function SignupForm() {
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

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(errorBody?.detail ?? "Could not create user.");
      }

      setMessage("Account created. You can now log in.");
      setEmail("");
      setPassword("");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Could not create user.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      <h1 className="formTitle">Create user</h1>
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
        {isLoading ? "Creating..." : "Create user"}
      </button>

      <Link href="/" className="textLink mutedTextLink">
        Back to login
      </Link>

      {message && (
        <p className={isError ? "statusMessage error" : "statusMessage"}>
          {message}
        </p>
      )}
    </form>
  );
}
